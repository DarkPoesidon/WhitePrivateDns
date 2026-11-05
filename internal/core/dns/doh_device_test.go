package dns

import (
	"bytes"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"whiteprivatedns/internal/database"
)

// switchingAccess recognises whichever address the binder last bound, the way the
// real client index does after RegisterIP.
type switchingAccess struct{ bound string }

func (a *switchingAccess) IsIPAllowed(ip string) (*database.Client, bool) {
	if ip == a.bound {
		return &database.Client{Name: "Device"}, true
	}
	return nil, false
}
func (a *switchingAccess) IsAllowAll() bool { return false }

func deviceRequest(h http.Handler, path, remote string, t *testing.T) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(dohQuery(t, "pin.internal.test.")))
	req.Header.Set("Content-Type", "application/dns-message")
	req.RemoteAddr = remote
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestPersonalDoHLinkFollowsAddressChanges(t *testing.T) {
	access := &switchingAccess{bound: "203.0.113.5"}
	h := newDoHHandler(t, access)
	calls := 0
	h.SetDeviceBinder(func(token, secret, ip string) error {
		calls++
		if token != "tok" || secret != "sec" {
			return errors.New("not found")
		}
		access.bound = ip
		return nil
	})

	// The subscriber's address changed from .5 to .99. Without the link the new
	// address is a stranger; with it, the first query rebinds and is served.
	if rec := deviceRequest(h, "/dns-query", "198.51.100.99:4000", t); rec.Code == http.StatusOK && len(dohReply(t, rec).Answer) != 0 {
		t.Fatal("an unregistered address must not be served without a link")
	}
	rec := deviceRequest(h, "/dns-query/tok/sec", "198.51.100.99:4000", t)
	if msg := dohReply(t, rec); len(msg.Answer) != 1 {
		t.Fatalf("personal link answer = %v, want the pinned record", msg.Answer)
	}
	if access.bound != "198.51.100.99" {
		t.Fatalf("bound = %q, want the new address", access.bound)
	}

	// The same address again is served from the cache, not re-verified.
	_ = deviceRequest(h, "/dns-query/tok/sec", "198.51.100.99:4001", t)
	if calls != 1 {
		t.Fatalf("binder called %d times, want 1 (cached for the same address)", calls)
	}
}

func TestPersonalDoHLinkRejectsBadCredentials(t *testing.T) {
	h := newDoHHandler(t, &switchingAccess{})
	h.SetDeviceBinder(func(token, secret, ip string) error { return errors.New("not found") })
	for _, path := range []string{"/dns-query/tok/wrong", "/dns-query/tok", "/dns-query/a/b/c", "/dns-query//"} {
		rec := deviceRequest(h, path, "198.51.100.99:4000", t)
		if rec.Code != http.StatusForbidden && rec.Code != http.StatusNotFound {
			t.Errorf("%s = %d, want 403 or 404", path, rec.Code)
		}
	}
}

func TestPersonalDoHLinkIsOffWithoutABinder(t *testing.T) {
	h := newDoHHandler(t, &switchingAccess{})
	if rec := deviceRequest(h, "/dns-query/tok/sec", "198.51.100.99:4000", t); rec.Code != http.StatusNotFound {
		t.Fatalf("no binder = %d, want 404", rec.Code)
	}
}

func TestPersonalDoHLinkBypassesOperatorTokenGate(t *testing.T) {
	access := &switchingAccess{}
	h := newDoHHandler(t, access)
	h.SetDoHTokens([]string{"operator-gate"})
	h.SetDeviceBinder(func(token, secret, ip string) error { access.bound = ip; return nil })
	if rec := deviceRequest(h, "/dns-query/tok/sec", "198.51.100.99:4000", t); rec.Code != http.StatusOK {
		t.Fatalf("valid personal link = %d, want 200 even with the operator gate on", rec.Code)
	}
	if rec := deviceRequest(h, "/dns-query", "198.51.100.99:4000", t); rec.Code != http.StatusUnauthorized {
		t.Fatalf("plain endpoint with the gate on = %d, want 401", rec.Code)
	}
}
