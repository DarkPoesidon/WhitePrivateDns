package update

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewerFollowsSemVerPrecedence(t *testing.T) {
	ordered := []string{"v2.2.0-beta.5", "v2.2.0-beta.10", "v2.2.0-rc.1", "v2.2.0", "v2.2.1", "v2.10.0"}
	for i := 0; i < len(ordered)-1; i++ {
		if !Newer(ordered[i+1], ordered[i]) || Newer(ordered[i], ordered[i+1]) {
			t.Fatalf("%s must be newer than %s", ordered[i+1], ordered[i])
		}
	}
	if Newer("v2.2.0", "v2.2.0") {
		t.Fatal("equal versions are not newer")
	}
}

func newTest(t *testing.T, current string, h http.Handler) *Checker {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	c, err := New("owner/repo", current)
	if err != nil {
		t.Fatal(err)
	}
	c.apiBase = srv.URL
	c.downloadBase = srv.URL + "/dl"
	c.canApply = func() string { return "" }
	return c
}

const releasesJSON = `[
 {"tag_name":"v2.3.0-beta.1","prerelease":true,"html_url":"https://evil.example/x","body":"beta"},
 {"tag_name":"v2.2.1","prerelease":false,"html_url":"https://github.com/owner/repo/releases/tag/v2.2.1","body":"stable notes"},
 {"tag_name":"v9.9.9","draft":true},
 {"tag_name":"not-a-tag"}
]`

func TestCheckStableInstallIgnoresPrereleases(t *testing.T) {
	c := newTest(t, "v2.2.0", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, releasesJSON) }))
	st, err := c.Check(context.Background())
	if err != nil || !st.Available || st.Latest != "v2.2.1" || st.Notes != "stable notes" {
		t.Fatalf("got %+v, %v", st, err)
	}
}

func TestCheckBetaInstallSeesBetaAndDistrustsForeignURL(t *testing.T) {
	c := newTest(t, "v2.2.0-beta.5", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, releasesJSON) }))
	st, _ := c.Check(context.Background())
	if st.Latest != "v2.3.0-beta.1" || !strings.HasPrefix(st.URL, "https://github.com/owner/repo/") {
		t.Fatalf("got %+v", st)
	}
}

func TestCheckFailureKeepsPreviousResultAndHidesDetail(t *testing.T) {
	c := newTest(t, "v2.2.0", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "boom", 500) }))
	st, err := c.Check(context.Background())
	if err == nil || st.Error != "Could not check for updates" || st.Available {
		t.Fatalf("got %+v, %v", st, err)
	}
}

func updaterServer(script, sumOverride string) http.Handler {
	sum := sha256.Sum256([]byte(script))
	hexSum := hex.EncodeToString(sum[:])
	if sumOverride != "" {
		hexSum = sumOverride
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/owner/repo/releases", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"tag_name":"v2.2.1","html_url":"https://github.com/owner/repo/releases/tag/v2.2.1"}]`)
	})
	mux.HandleFunc("/dl/v2.2.1/checksums.txt", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "%s  whiteprivatedns-update.sh\n", hexSum)
	})
	mux.HandleFunc("/dl/v2.2.1/whiteprivatedns-update.sh", func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, script) })
	return mux
}

func TestApplyRunsVerifiedScriptUnderSystemdRun(t *testing.T) {
	c := newTest(t, "v2.2.0", updaterServer("#!/bin/bash\necho hi\n", ""))
	var got []string
	c.run = func(name string, args ...string) error { got = append([]string{name}, args...); return nil }
	if _, err := c.Check(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := c.Apply(context.Background(), "v2.2.1"); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(got, " ")
	for _, want := range []string{"systemd-run", "--collect", "WHITEPRIVATEDNS_REF=v2.2.1", "WHITEPRIVATEDNS_REPOSITORY=owner/repo", "bash "} {
		if !strings.Contains(joined, want) {
			t.Fatalf("command %q lacks %q", joined, want)
		}
	}
	if err := c.Apply(context.Background(), "v2.2.1"); err != ErrInProgress {
		t.Fatalf("second Apply = %v, want ErrInProgress", err)
	}
}

func TestApplyRefusesChecksumMismatchAndWrongTag(t *testing.T) {
	c := newTest(t, "v2.2.0", updaterServer("#!/bin/bash\n", strings.Repeat("0", 64)))
	c.run = func(string, ...string) error { t.Fatal("updater must not run"); return nil }
	if _, err := c.Check(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := c.Apply(context.Background(), "v2.2.1"); err == nil || !strings.Contains(err.Error(), "checksum") {
		t.Fatalf("want checksum error, got %v", err)
	}
	if c.InProgress() {
		t.Fatal("a refused update must not look in progress")
	}
	if err := c.Apply(context.Background(), "v9.9.9"); err == nil {
		t.Fatal("a tag other than the available update must be refused")
	}
}

func TestApplyHonoursBlocker(t *testing.T) {
	c := newTest(t, "v2.2.0", updaterServer("x", ""))
	c.canApply = func() string { return "no" }
	if err := c.Apply(context.Background(), "v2.2.1"); err == nil || err.Error() != "no" {
		t.Fatalf("got %v", err)
	}
}
