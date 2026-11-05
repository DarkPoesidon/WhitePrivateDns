package web

import (
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	webassets "whiteprivatedns/web"
)

func uiGet(h http.Handler, method, path string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestReactPanelIsServedUnderTheAdminPath(t *testing.T) {
	ws, _, cleanup := setupTestWebServer(t)
	defer cleanup()
	ws.SetUIFS(webassets.UIFS)
	h := ws.BuildHandler()
	ap := "/" + ws.adminPath()

	w := uiGet(h, http.MethodGet, ap+"/ui/")
	if w.Code != http.StatusOK || !strings.Contains(w.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("index = %d %q", w.Code, w.Header().Get("Content-Type"))
	}
	body := w.Body.String()
	if strings.Contains(body, uiBasePlaceholder) {
		t.Fatal("the base placeholder must be replaced in the served document")
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Errorf("index Cache-Control = %q, want no-store", w.Header().Get("Cache-Control"))
	}

	// The bundle the document references is served, rewritten, and cacheable forever.
	m := regexp.MustCompile(`src="(` + regexp.QuoteMeta(ap) + `/ui/assets/[^"]+\.js)"`).FindStringSubmatch(body)
	if m == nil {
		t.Fatalf("index does not reference a bundle under %s/ui/assets/: %s", ap, body)
	}
	js := uiGet(h, http.MethodGet, m[1])
	if js.Code != http.StatusOK || strings.Contains(js.Body.String(), uiBasePlaceholder) {
		t.Fatalf("bundle = %d, placeholder left = %v", js.Code, strings.Contains(js.Body.String(), uiBasePlaceholder))
	}
	if !strings.Contains(js.Header().Get("Cache-Control"), "immutable") {
		t.Errorf("hashed bundle Cache-Control = %q, want immutable", js.Header().Get("Cache-Control"))
	}

	// A client-side route gets the document; a missing file is a real 404.
	if w := uiGet(h, http.MethodGet, ap+"/ui/clients"); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `id="root"`) {
		t.Errorf("SPA route = %d", w.Code)
	}
	if w := uiGet(h, http.MethodGet, ap+"/ui/assets/missing.js"); w.Code != http.StatusNotFound {
		t.Errorf("missing asset = %d, want 404", w.Code)
	}
	if w := uiGet(h, http.MethodPost, ap+"/ui/"); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST = %d, want 405", w.Code)
	}
	if w := uiGet(h, http.MethodGet, ap+"/ui"); w.Code != http.StatusFound {
		t.Errorf("bare /ui = %d, want redirect to /ui/", w.Code)
	}
}

func TestReactPanelIsInvisibleOutsideTheAdminPathAndWhenNotEmbedded(t *testing.T) {
	ws, _, cleanup := setupTestWebServer(t)
	defer cleanup()
	h := ws.BuildHandler()
	ap := "/" + ws.adminPath()
	if w := uiGet(h, http.MethodGet, ap+"/ui/"); w.Code != http.StatusNotFound {
		t.Errorf("with no UI attached /ui/ = %d, want 404", w.Code)
	}
	ws.SetUIFS(webassets.UIFS)
	h = ws.BuildHandler()
	if w := uiGet(h, http.MethodGet, "/ui/"); w.Code != http.StatusNotFound {
		t.Errorf("/ui/ outside the admin path = %d, want 404", w.Code)
	}
}

// With the React panel attached the bare admin path lands on it; /dash keeps
// opening the classic dashboard, which stays available as a fallback.
func TestBareAdminPathOpensTheReactPanel(t *testing.T) {
	ws, _, cleanup := setupTestWebServer(t)
	defer cleanup()
	ws.SetUIFS(webassets.UIFS)
	h := ws.BuildHandler()
	ap := "/" + ws.adminPath()
	if w := uiGet(h, http.MethodGet, ap); w.Code != http.StatusFound || w.Header().Get("Location") != ap+"/ui/" {
		t.Errorf("bare admin path = %d -> %q, want redirect to %s/ui/", w.Code, w.Header().Get("Location"), ap)
	}
	if w := uiGet(h, http.MethodGet, ap+"/dash"); w.Code != http.StatusFound || w.Header().Get("Location") != ap+"/dash/" {
		t.Errorf("/dash = %d -> %q, want redirect to %s/dash/", w.Code, w.Header().Get("Location"), ap)
	}
}
