package web

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"whiteprivatedns/internal/update"
)

func updateCall(h http.Handler, method, path, bearer, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	req.RemoteAddr = "203.0.113.9:5555"
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestUpdateRoutesRequireASession(t *testing.T) {
	ws, _, cleanup := setupTestWebServer(t)
	defer cleanup()
	h := ws.buildAdminHandler()
	for _, p := range []string{"/api/update/status", "/api/update/apply"} {
		if w := updateCall(h, http.MethodPost, p, "", `{}`); w.Code != http.StatusUnauthorized {
			t.Errorf("%s without a session = %d, want 401", p, w.Code)
		}
	}
}

func TestUpdateRoutesAreAbsentWhenChecksAreDisabled(t *testing.T) {
	ws, _, cleanup := setupTestWebServer(t)
	defer cleanup()
	h := ws.buildAdminHandler()
	tok := bearerFor(t, h)
	if w := updateCall(h, http.MethodGet, "/api/update/status", tok, ""); w.Code != http.StatusNotFound {
		t.Fatalf("status with no updater = %d, want 404", w.Code)
	}
}

func TestUpdateApplyIsGatedByPasswordAndSafeEnvironment(t *testing.T) {
	ws, _, cleanup := setupTestWebServer(t)
	defer cleanup()
	chk, err := update.New("owner/repo", "v2.2.0")
	if err != nil {
		t.Fatal(err)
	}
	ws.SetUpdater(chk)
	h := ws.buildAdminHandler()
	tok := bearerFor(t, h)

	w := updateCall(h, http.MethodGet, "/api/update/status", tok, "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"current":"v2.2.0"`) {
		t.Fatalf("status = %d %s", w.Code, w.Body.String())
	}
	if w := updateCall(h, http.MethodDelete, "/api/update/status", tok, ""); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("DELETE status = %d, want 405", w.Code)
	}
	if w := updateCall(h, http.MethodGet, "/api/update/apply", tok, ""); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET apply = %d, want 405", w.Code)
	}
	if w := updateCall(h, http.MethodPost, "/api/update/apply", tok, `{"version":"v9.9.9","current_password":"wrong"}`); w.Code != http.StatusForbidden {
		t.Errorf("apply with a wrong password = %d, want 403", w.Code)
	}
	// Right password, but nothing newer is known and the test host is not a
	// supported install: refused without running anything.
	w = updateCall(h, http.MethodPost, "/api/update/apply", tok,
		`{"version":"v9.9.9","current_password":"`+testAdminPassword+`"}`)
	if w.Code != http.StatusBadRequest {
		t.Errorf("apply with nothing to apply = %d, want 400 (%s)", w.Code, w.Body.String())
	}
}
