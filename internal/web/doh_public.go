package web

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"whiteprivatedns/internal/httpx"
)

// handlePublicDoHURL advertises an optional CDN/Tunnel URL without moving the
// local DoH listener. An empty URL restores the direct transport address.
func (ws *WebServer) handlePublicDoHURL(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		httpx.WriteMethodNotAllowed(w, "POST")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 2048)
	var input struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		httpx.WriteJSONError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	address := strings.TrimSpace(input.URL)
	if address != "" && !validPublicDoHURL(address) {
		httpx.WriteJSONError(w, http.StatusBadRequest, "URL must be HTTPS with path /dns-query and no credentials, query or fragment")
		return
	}

	ws.dnsMu.Lock()
	cfg := ws.mutableDNSLocked()
	previous := cfg.PublicDoHURL
	cfg.PublicDoHURL = address
	if err := ws.db.SetSetting("dns", cfg); err != nil {
		cfg.PublicDoHURL = previous
		ws.dnsMu.Unlock()
		httpx.WriteJSONError(w, http.StatusInternalServerError, "Could not save the public DoH URL")
		return
	}
	ws.dnsMu.Unlock()
	_ = json.NewEncoder(w).Encode(map[string]string{"public_doh_url": address, "doh_url": ws.dohURL()})
}

func validPublicDoHURL(raw string) bool {
	if len(raw) > 512 {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil ||
		u.Path != "/dns-query" || u.RawQuery != "" || u.Fragment != "" || u.Opaque != "" {
		return false
	}
	if port := u.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return false
		}
	}
	return true
}
