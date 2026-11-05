package dns

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

// DeviceBinder points a subscriber's registered address at ip. It receives the
// subscription token and the out-of-band registration secret and must verify the
// secret itself (service.ClientService.RegisterIP does).
type DeviceBinder func(token, secret, ip string) error

// deviceBindTTL is how long a verified (credentials, address) pair is trusted
// before the binder is asked again. It bounds work per query without letting a
// revoked link keep working for long.
const deviceBindTTL = 5 * time.Minute

// maxDeviceCache caps remembered links so unauthenticated probing cannot grow it.
const maxDeviceCache = 4096

type deviceEntry struct {
	secret string
	ip     string
	at     time.Time
}

// deviceLinks identifies a device by its personal DoH link, /dns-query/<token>/<secret>.
// Plain DNS has no device identity — only the source address — so a phone whose
// address changes looks like a stranger until it registers again. A DoH request
// can carry a credential, so each one re-asserts "this address is that subscriber"
// and the binding follows the device.
type deviceLinks struct {
	mu     sync.Mutex
	binder DeviceBinder
	seen   map[string]deviceEntry
}

// SetDeviceBinder enables personal DoH links. Without it /dns-query/<token>/<secret> answers 404.
func (h *DoHHandler) SetDeviceBinder(b DeviceBinder) {
	h.devices.mu.Lock()
	h.devices.binder = b
	h.devices.seen = make(map[string]deviceEntry)
	h.devices.mu.Unlock()
}

// splitDevicePath extracts token and secret from /dns-query/<token>/<secret>.
func splitDevicePath(path string) (token, secret string, ok bool) {
	rest := strings.TrimPrefix(path, "/dns-query/")
	if rest == path {
		return "", "", false
	}
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

// bind verifies the link and moves the subscriber's address to ip. It returns
// the HTTP status to answer with when the link cannot be honoured, or 0.
func (d *deviceLinks) bind(token, secret, ip string) int {
	d.mu.Lock()
	binder := d.binder
	if binder == nil {
		d.mu.Unlock()
		return http.StatusNotFound
	}
	if e, ok := d.seen[token]; ok && e.secret == secret && e.ip == ip && time.Since(e.at) < deviceBindTTL {
		d.mu.Unlock()
		return 0
	}
	d.mu.Unlock()

	if err := binder(token, secret, ip); err != nil {
		d.mu.Lock()
		delete(d.seen, token)
		d.mu.Unlock()
		// One answer for unknown link, wrong secret, suspended, expired, out of
		// quota and address-in-use: the caller learns nothing about which.
		return http.StatusForbidden
	}
	d.mu.Lock()
	if len(d.seen) >= maxDeviceCache {
		d.seen = make(map[string]deviceEntry)
	}
	d.seen[token] = deviceEntry{secret: secret, ip: ip, at: time.Now()}
	d.mu.Unlock()
	return 0
}
