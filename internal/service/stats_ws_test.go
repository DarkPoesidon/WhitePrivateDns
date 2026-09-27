package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"whiteprivatedns/internal/database"
)

func TestWebSocketStreamsHistoryAndQueriesAndReleasesSlot(t *testing.T) {
	stats := NewStatsService(nil, nil, nil)
	defer stats.Close()
	server := httptest.NewServer(http.HandlerFunc(stats.ServeWS))
	defer server.Close()

	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatalf("websocket dial: %v", err)
	}
	defer conn.Close()
	awaitSubscribers(t, stats, 1)
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var message struct {
		Type string          `json:"type"`
		Data json.RawMessage `json:"data"`
	}
	if err := conn.ReadJSON(&message); err != nil || message.Type != "history" {
		t.Fatalf("initial history: type=%q err=%v", message.Type, err)
	}

	stats.PushQueryLog(database.QueryLogItem{})
	if err := conn.ReadJSON(&message); err != nil || message.Type != "query" || !json.Valid(message.Data) {
		t.Fatalf("query event: type=%q data=%s err=%v", message.Type, message.Data, err)
	}
	_ = conn.Close()
	awaitSubscribers(t, stats, 0)
}

func TestWebSocketRejectsNonUpgradeRequestWithoutLeakingSlot(t *testing.T) {
	stats := NewStatsService(nil, nil, nil)
	defer stats.Close()
	rec := httptest.NewRecorder()
	stats.ServeWS(rec, httptest.NewRequest(http.MethodGet, "/api/v1/stream/ws", nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("GET without upgrade returned %d, want 400", rec.Code)
	}
	awaitSubscribers(t, stats, 0)
}
