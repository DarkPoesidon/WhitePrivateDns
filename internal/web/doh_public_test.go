package web

import (
	"net/http"
	"testing"

	"whiteprivatedns/internal/database"
)

func TestPublicDoHURLIsAuthenticatedValidatedAndPersisted(t *testing.T) {
	ws, h, token, cleanup := authedServer(t)
	defer cleanup()
	path := "/api/settings/doh-url"
	if w := postJSON(t, h, path, `{"url":"https://doh.example.com/dns-query"}`, ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous save = %d, want 401", w.Code)
	}
	for _, raw := range []string{
		"http://doh.example.com/dns-query",
		"https://user:pass@doh.example.com/dns-query",
		"https://doh.example.com/other",
		"https://doh.example.com/dns-query?token=secret",
		"https://doh.example.com/dns-query#fragment",
	} {
		if w := postJSON(t, h, path, `{"url":"`+raw+`"}`, token); w.Code != http.StatusBadRequest {
			t.Errorf("invalid URL %q saved: %d", raw, w.Code)
		}
	}
	const address = "https://doh.example.com/dns-query"
	if w := postJSON(t, h, path, `{"url":"`+address+`"}`, token); w.Code != http.StatusOK {
		t.Fatalf("save = %d: %s", w.Code, w.Body.String())
	}
	if got := ws.dohURL(); got != address {
		t.Fatalf("advertised DoH URL = %q", got)
	}
	var stored database.DNSSettings
	if err := ws.db.GetSetting("dns", &stored); err != nil || stored.PublicDoHURL != address {
		t.Fatalf("stored URL = %q, err = %v", stored.PublicDoHURL, err)
	}
	config := decodeBody(t, authedGet(t, h, "/api/config", token))
	if config["doh_url"] != address || config["public_doh_url"] != address {
		t.Fatalf("guide config missed public DoH URL: %v", config)
	}
	if w := postJSON(t, h, path, `{"url":""}`, token); w.Code != http.StatusOK {
		t.Fatalf("clear = %d: %s", w.Code, w.Body.String())
	}
	if got := ws.publicDoHURL(); got != "" {
		t.Fatalf("cleared public URL = %q", got)
	}
}
