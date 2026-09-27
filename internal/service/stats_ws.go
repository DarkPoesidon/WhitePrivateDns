package service

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// ServeWS streams the same bounded query feed as ServeSSE to API clients that
// can send an Authorization header during the WebSocket handshake.
func (s *StatsService) ServeWS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ch := make(chan string, 32)
	s.sseMu.Lock()
	if len(s.sseClients) >= maxSSEClients {
		s.sseMu.Unlock()
		w.Header().Set("Retry-After", "5")
		http.Error(w, "too many live-log subscribers", http.StatusServiceUnavailable)
		return
	}
	s.sseClients[ch] = struct{}{}
	s.sseMu.Unlock()
	defer func() {
		s.sseMu.Lock()
		delete(s.sseClients, ch)
		close(ch)
		s.sseMu.Unlock()
	}()

	// The default origin check accepts same-origin browser connections and rejects
	// cross-origin ones. Authentication is handled by the API middleware first.
	conn, err := (&websocket.Upgrader{ReadBufferSize: 1024, WriteBufferSize: 1024}).Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	const (
		writeTimeout = 15 * time.Second
		pongWait     = 70 * time.Second
	)
	conn.SetReadLimit(4096)
	_ = conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	disconnected := make(chan struct{})
	go func() {
		defer close(disconnected)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	write := func(kind string, data any) bool {
		if err := conn.SetWriteDeadline(time.Now().Add(writeTimeout)); err != nil {
			return false
		}
		return conn.WriteJSON(struct {
			Type string `json:"type"`
			Data any    `json:"data"`
		}{Type: kind, Data: data}) == nil
	}
	if !write("history", s.GetRecentLogs()) {
		return
	}

	keepAlive := time.NewTicker(25 * time.Second)
	defer keepAlive.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-s.stop:
			return
		case <-disconnected:
			return
		case <-keepAlive.C:
			if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(writeTimeout)); err != nil {
				return
			}
		case frame := <-ch:
			payload := strings.TrimSuffix(strings.TrimPrefix(frame, "event: query\ndata: "), "\n\n")
			if !json.Valid([]byte(payload)) || !write("query", json.RawMessage(payload)) {
				return
			}
		}
	}
}
