package web

import (
	"bytes"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"sync"

	"whiteprivatedns/internal/httpx"
)

// The React panel is built with a placeholder base so one build serves every
// install: each install mounts the panel under its own random admin path.
const uiBasePlaceholder = "__WPDNS_ADMIN_BASE__"

type uiAsset struct {
	body []byte
	ctyp string
}

type uiServer struct {
	fsys  fs.FS
	mu    sync.Mutex
	cache map[string]uiAsset // key: admin path + "\x00" + file
}

// SetUIFS attaches the embedded React panel (the "ui" directory of web.UIFS).
// Without it /<admin-path>/ui/ answers 404 and only the classic dashboard exists.
func (ws *WebServer) SetUIFS(root fs.FS) {
	sub, err := fs.Sub(root, "ui")
	if err != nil {
		return
	}
	ws.ui = &uiServer{fsys: sub, cache: make(map[string]uiAsset)}
}

// load returns the file with the placeholder replaced by this install's admin
// path. Text assets only; anything else is served as stored.
func (u *uiServer) load(adminPath, name string) (uiAsset, bool) {
	key := adminPath + "\x00" + name
	u.mu.Lock()
	defer u.mu.Unlock()
	if a, ok := u.cache[key]; ok {
		return a, true
	}
	raw, err := fs.ReadFile(u.fsys, name)
	if err != nil {
		return uiAsset{}, false
	}
	ctyp := mime.TypeByExtension(path.Ext(name))
	if ctyp == "" {
		ctyp = http.DetectContentType(raw)
	}
	switch path.Ext(name) {
	case ".html", ".js", ".css", ".webmanifest", ".json":
		raw = bytes.ReplaceAll(raw, []byte(uiBasePlaceholder), []byte(adminPath))
	}
	a := uiAsset{body: raw, ctyp: ctyp}
	u.cache[key] = a
	return a, true
}

// serveUI answers /<admin-path>/ui/... — static files, and index.html for any
// client-side route (a path with no file extension).
func (ws *WebServer) serveUI(w http.ResponseWriter, r *http.Request, ap, p string) {
	if ws.ui == nil {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		httpx.WriteMethodNotAllowed(w, "GET, HEAD")
		return
	}
	name := strings.TrimPrefix(strings.TrimPrefix(p, ap+"/ui"), "/")
	asset, ok := uiAsset{}, false
	if name != "" && !strings.HasSuffix(name, "/") {
		asset, ok = ws.ui.load(strings.TrimPrefix(ap, "/"), name)
	}
	if !ok {
		if path.Ext(name) != "" {
			http.NotFound(w, r)
			return
		}
		name = "index.html"
		asset, ok = ws.ui.load(strings.TrimPrefix(ap, "/"), name)
		if !ok {
			http.NotFound(w, r)
			return
		}
	}
	h := w.Header()
	h.Set("Content-Type", asset.ctyp)
	if name == "index.html" {
		h.Set("Cache-Control", "no-store")
	} else {
		// Vite names bundles by content hash, so they never change under a name.
		h.Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(asset.body)
}
