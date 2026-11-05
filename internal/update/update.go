// Package update finds newer GitHub releases and starts the installed updater.
//
// It never replaces files itself. Applying an update downloads the release's
// scripts/update.sh, verifies it against the release's checksums.txt, and hands
// it to systemd-run so it outlives the service it is about to stop. update.sh
// already owns backup, health check and rollback.
package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// DefaultRepository is where releases are published; override with
// WHITEPRIVATEDNS_REPOSITORY.
const DefaultRepository = "DarkPoesidon/WhitePrivateDns"

const (
	maxAPIBody    = 2 << 20
	maxScriptSize = 256 << 10
	maxNotes      = 4000
	installedBin  = "/opt/whiteprivatedns/whiteprivatedns"
	updateUnit    = "whiteprivatedns-update"

	// applyWindow is how long after starting the updater another start is refused.
	// A failed update leaves the old process running, so the guard must expire.
	applyWindow = 10 * time.Minute
)

// Same shapes update.sh enforces, so a value accepted here is never rejected there.
var (
	tagRe  = regexp.MustCompile(`^v[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9][A-Za-z0-9.-]*)?$`)
	repoRe = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
)

// ErrInProgress is returned when an update is already running.
var ErrInProgress = errors.New("an update is already in progress")

// Status is the result of the last check, safe to serve to the dashboard.
type Status struct {
	Current   string    `json:"current"`
	Latest    string    `json:"latest"`
	Available bool      `json:"available"`
	URL       string    `json:"url,omitempty"`
	Notes     string    `json:"notes,omitempty"`
	CheckedAt time.Time `json:"checked_at"`
	Error     string    `json:"error,omitempty"`
}

// Checker polls GitHub for releases newer than the running version.
type Checker struct {
	repo    string
	current string

	// Overridable for tests.
	apiBase      string
	downloadBase string
	client       *http.Client
	run          func(name string, args ...string) error
	canApply     func() string

	mu            sync.Mutex
	last          Status
	applyingSince time.Time
}

// New returns a Checker. repo is "owner/name"; current is the running tag such
// as "v2.2.0-beta.5".
func New(repo, current string) (*Checker, error) {
	if !repoRe.MatchString(repo) {
		return nil, fmt.Errorf("update: invalid repository %q", repo)
	}
	c := &Checker{
		repo:         repo,
		current:      current,
		apiBase:      "https://api.github.com",
		downloadBase: "https://github.com/" + repo + "/releases/download",
		client: &http.Client{
			Timeout: 30 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if req.URL.Scheme != "https" || len(via) > 5 {
					return errors.New("update: refusing non-HTTPS or excessive redirect")
				}
				return nil
			},
		},
		run:      func(name string, args ...string) error { return exec.Command(name, args...).Run() },
		canApply: applyBlocker,
	}
	c.last = Status{Current: current}
	return c, nil
}

// Status returns the last check result without touching the network.
func (c *Checker) Status() Status {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.last
}

// CanApply returns "" when this install can update itself, else the reason.
func (c *Checker) CanApply() string { return c.canApply() }

// Check queries GitHub and stores the result. On failure the previous result is
// kept and the error is recorded alongside it.
func (c *Checker) Check(ctx context.Context) (Status, error) {
	rel, err := c.latest(ctx)
	c.mu.Lock()
	defer c.mu.Unlock()
	c.last.CheckedAt = time.Now()
	if err != nil {
		c.last.Error = "Could not check for updates"
		return c.last, err
	}
	c.last.Error = ""
	c.last.Latest = rel.Tag
	c.last.URL = rel.URL
	c.last.Notes = rel.Notes
	c.last.Available = Newer(rel.Tag, c.current)
	return c.last, nil
}

// Run checks now and then every interval until ctx ends.
func (c *Checker) Run(ctx context.Context, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		cctx, cancel := context.WithTimeout(ctx, time.Minute)
		_, _ = c.Check(cctx)
		cancel()
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

type release struct {
	Tag, URL, Notes string
}

func (c *Checker) latest(ctx context.Context) (release, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		c.apiBase+"/repos/"+c.repo+"/releases?per_page=30", nil)
	if err != nil {
		return release{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "WhitePrivateDns-update-check")
	resp, err := c.client.Do(req)
	if err != nil {
		return release{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return release{}, fmt.Errorf("update: GitHub answered %s", resp.Status)
	}
	var rels []struct {
		Tag        string `json:"tag_name"`
		HTMLURL    string `json:"html_url"`
		Body       string `json:"body"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxAPIBody)).Decode(&rels); err != nil {
		return release{}, err
	}
	// A stable install is never offered a beta; a beta install sees everything.
	_, curPre := parse(c.current)
	allowPre := len(curPre) > 0
	var best release
	for _, r := range rels {
		if r.Draft || !tagRe.MatchString(r.Tag) || (r.Prerelease && !allowPre) {
			continue
		}
		if best.Tag == "" || Newer(r.Tag, best.Tag) {
			best = release{Tag: r.Tag, URL: r.HTMLURL, Notes: r.Body}
		}
	}
	if best.Tag == "" {
		return release{}, errors.New("update: no usable release found")
	}
	if len(best.Notes) > maxNotes {
		best.Notes = best.Notes[:maxNotes]
	}
	// The link is shown to the operator; only trust the expected host.
	if u, err := url.Parse(best.URL); err != nil || u.Scheme != "https" || u.Host != "github.com" {
		best.URL = "https://github.com/" + c.repo + "/releases/tag/" + best.Tag
	}
	return best, nil
}

// Apply starts the updater for tag, which must be the latest known newer release.
// It returns as soon as the updater is running under systemd; the service
// restarts shortly afterwards, so callers must not wait for the result.
func (c *Checker) Apply(ctx context.Context, tag string) error {
	if reason := c.canApply(); reason != "" {
		return errors.New(reason)
	}
	st := c.Status()
	if !st.Available || tag != st.Latest || !tagRe.MatchString(tag) {
		return errors.New("update: requested version is not the available update")
	}
	c.mu.Lock()
	if time.Since(c.applyingSince) < applyWindow {
		c.mu.Unlock()
		return ErrInProgress
	}
	c.applyingSince = time.Now()
	c.mu.Unlock()
	started := false
	defer func() {
		if !started {
			c.mu.Lock()
			c.applyingSince = time.Time{}
			c.mu.Unlock()
		}
	}()

	dir, err := os.MkdirTemp("", "wpdns-update-")
	if err != nil {
		return err
	}
	script := filepath.Join(dir, "update.sh")
	if err := c.fetchVerified(ctx, tag, script); err != nil {
		_ = os.RemoveAll(dir)
		return err
	}
	// --collect removes the unit afterwards; a still-running unit of the same
	// name makes systemd-run fail, which is the cross-process guard.
	err = c.run("systemd-run", "--unit="+updateUnit, "--collect", "--quiet",
		"--setenv=WHITEPRIVATEDNS_REF="+tag,
		"--setenv=WHITEPRIVATEDNS_REPOSITORY="+c.repo,
		"bash", script)
	if err != nil {
		_ = os.RemoveAll(dir)
		return fmt.Errorf("update: could not start the updater: %w", err)
	}
	started = true
	return nil
}

// fetchVerified downloads the release's updater and refuses it unless its
// SHA-256 matches the release's checksums.txt.
func (c *Checker) fetchVerified(ctx context.Context, tag, dest string) error {
	base := c.downloadBase + "/" + tag
	sums, err := c.get(ctx, base+"/checksums.txt", 1<<20)
	if err != nil {
		return err
	}
	const asset = "whiteprivatedns-update.sh"
	want := ""
	for _, line := range strings.Split(string(sums), "\n") {
		f := strings.Fields(line)
		if len(f) == 2 && strings.TrimPrefix(f[1], "*") == asset {
			want = strings.ToLower(f[0])
		}
	}
	if len(want) != 64 {
		return errors.New("update: release has no checksum for the updater")
	}
	body, err := c.get(ctx, base+"/"+asset, maxScriptSize)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(body)
	if hex.EncodeToString(sum[:]) != want {
		return errors.New("update: updater checksum mismatch")
	}
	return os.WriteFile(dest, body, 0o700)
}

func (c *Checker) get(ctx context.Context, u string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "WhitePrivateDns-update")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("update: %s answered %s", u, resp.Status)
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > limit {
		return nil, errors.New("update: download too large")
	}
	return b, nil
}

// applyBlocker explains why this process cannot update itself, or "" if it can.
// Only the standard root + systemd install under /opt is supported, because
// that is the layout update.sh manages.
func applyBlocker() string {
	switch {
	case runtime.GOOS != "linux":
		return "Self-update is only available on Linux installs managed by systemd."
	case os.Geteuid() != 0:
		return "Self-update needs the daemon to run as root."
	}
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return "Running in Docker: pull the new image and recreate the container instead."
	}
	if exe, err := os.Executable(); err != nil || filepath.Clean(exe) != installedBin {
		return "Self-update only supports the standard install at /opt/whiteprivatedns."
	}
	if _, err := exec.LookPath("systemd-run"); err != nil {
		return "systemd-run is not available on this host."
	}
	if _, err := os.Stat("/run/systemd/system"); err != nil {
		return "This host is not running systemd."
	}
	return ""
}

// ---- version comparison (SemVer 2.0 precedence) ----

func parse(tag string) (core [3]int, pre []string) {
	tag = strings.TrimPrefix(tag, "v")
	if i := strings.IndexByte(tag, '-'); i >= 0 {
		pre = strings.Split(tag[i+1:], ".")
		tag = tag[:i]
	}
	for i, p := range strings.SplitN(tag, ".", 3) {
		core[i], _ = strconv.Atoi(p)
	}
	return core, pre
}

// Newer reports whether tag a has higher precedence than tag b.
func Newer(a, b string) bool {
	ac, ap := parse(a)
	bc, bp := parse(b)
	for i := range ac {
		if ac[i] != bc[i] {
			return ac[i] > bc[i]
		}
	}
	switch {
	case len(ap) == 0 && len(bp) == 0:
		return false
	case len(ap) == 0:
		return true
	case len(bp) == 0:
		return false
	}
	for i := 0; i < len(ap) && i < len(bp); i++ {
		if ap[i] == bp[i] {
			continue
		}
		an, aerr := strconv.Atoi(ap[i])
		bn, berr := strconv.Atoi(bp[i])
		switch {
		case aerr == nil && berr == nil:
			return an > bn
		case aerr == nil:
			return false // numeric identifiers sort below alphanumeric ones
		case berr == nil:
			return true
		default:
			return ap[i] > bp[i]
		}
	}
	return len(ap) > len(bp)
}

// InProgress reports whether an update was started in the last applyWindow.
func (c *Checker) InProgress() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return time.Since(c.applyingSince) < applyWindow
}
