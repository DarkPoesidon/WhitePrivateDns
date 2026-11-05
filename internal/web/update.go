package web

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"whiteprivatedns/internal/httpx"
	"whiteprivatedns/internal/netutil"
	"whiteprivatedns/internal/update"
)

// SetUpdater attaches the release checker. Without it the update routes answer
// 404, so an install that disabled update checks shows no update UI at all.
func (ws *WebServer) SetUpdater(u *update.Checker) { ws.updater = u }

type updateView struct {
	update.Status
	CanApply   bool   `json:"can_apply"`
	BlockedWhy string `json:"blocked_reason,omitempty"`
	InProgress bool   `json:"in_progress"`
}

func (ws *WebServer) updateView() updateView {
	why := ws.updater.CanApply()
	return updateView{
		Status:     ws.updater.Status(),
		CanApply:   why == "",
		BlockedWhy: why,
		InProgress: ws.updater.InProgress(),
	}
}

// handleUpdateStatus serves the last check result. POST forces a fresh check.
func (ws *WebServer) handleUpdateStatus(w http.ResponseWriter, r *http.Request) {
	if ws.updater == nil {
		httpx.WriteJSONError(w, http.StatusNotFound, "Update checks are disabled")
		return
	}
	switch r.Method {
	case http.MethodGet:
	case http.MethodPost:
		ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
		defer cancel()
		_, _ = ws.updater.Check(ctx) // the failure is recorded in the status
	default:
		httpx.WriteMethodNotAllowed(w, "GET, POST")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(ws.updateView())
}

// handleUpdateApply starts the updater. It runs a downloaded script as root, so
// it is gated like every other credential-grade action: current password, and
// the single-use second factor when 2FA is on.
func (ws *WebServer) handleUpdateApply(w http.ResponseWriter, r *http.Request) {
	if ws.updater == nil {
		httpx.WriteJSONError(w, http.StatusNotFound, "Update checks are disabled")
		return
	}
	if r.Method != http.MethodPost {
		httpx.WriteMethodNotAllowed(w, "POST")
		return
	}
	var req struct {
		Version         string `json:"version"`
		CurrentPassword string `json:"current_password"`
		Code            string `json:"code"`
	}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&req)
	if !ws.reauthCurrentPassword(req.CurrentPassword) {
		log.Printf("[Update] Rejected update request from %s: current password did not match", netutil.ClientIP(r))
		httpx.WriteJSONError(w, http.StatusForbidden, "Current password is incorrect")
		return
	}
	if !ws.totpGate(w, req.Code) {
		return
	}
	// Detached from the request: the updater outlives this handler, and the
	// download must not be cut short if the browser disconnects.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 2*time.Minute)
	defer cancel()
	if err := ws.updater.Apply(ctx, req.Version); err != nil {
		log.Printf("[Update] Could not start update to %q: %v", req.Version, err)
		status := http.StatusBadRequest
		if errors.Is(err, update.ErrInProgress) {
			status = http.StatusConflict
		}
		httpx.WriteJSONError(w, status, err.Error())
		return
	}
	log.Printf("[Update] Update to %s started by %s", req.Version, netutil.ClientIP(r))
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "target": req.Version})
}
