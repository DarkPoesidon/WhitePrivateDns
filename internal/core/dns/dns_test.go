package dns

import (
	"testing"
	"time"

	"github.com/miekg/dns"
	"whiteprivatedns/internal/core/cache"
	"whiteprivatedns/internal/core/matcher"
	"whiteprivatedns/internal/core/upstream"
	"whiteprivatedns/internal/database"
)

type dummyAccess struct{}

func (d *dummyAccess) IsIPAllowed(ip string) (*database.Client, bool) {
	return &database.Client{Name: "VIP Gamer"}, true
}
func (d *dummyAccess) IsAllowAll() bool { return true }

func TestDNSHandler_ProcessQuery(t *testing.T) {
	c := cache.NewCache(1000, 60, 3600)
	defer c.Close()
	m := matcher.NewMatcher()
	u := upstream.NewUpstreamPool([]string{"1.1.1.1:53", "8.8.8.8:53"}, 2*time.Second, true, "")

	handler := NewHandler(&dummyAccess{}, c, m, u, nil, "198.51.100.1")

	req := new(dns.Msg)
	req.SetQuestion("playvalorant.com.", dns.TypeA)

	resp := handler.ProcessQuery(req, "127.0.0.1")
	if resp == nil {
		t.Fatalf("expected non-nil response")
	}

	if len(resp.Answer) == 0 {
		t.Fatalf("expected answer for playvalorant.com")
	}

	aRecord, ok := resp.Answer[0].(*dns.A)
	if !ok || aRecord.A.String() != "198.51.100.1" {
		t.Errorf("expected A record to rewrite to 198.51.100.1, got %v", resp.Answer[0])
	}
}

func TestDNSHandler_ChangingRelayIPUpdatesProxiedAnswers(t *testing.T) {
	c := cache.NewCache(100, 60, 3600)
	defer c.Close()
	h := NewHandler(&dummyAccess{}, c, matcher.NewMatcher(), nil, nil, "198.51.100.1")
	query := new(dns.Msg)
	query.SetQuestion("playvalorant.com.", dns.TypeA)
	check := func(want string) {
		t.Helper()
		response := h.ProcessQuery(query.Copy(), "192.0.2.10")
		if response == nil || len(response.Answer) != 1 {
			t.Fatalf("proxied answer after relay update = %v", response)
		}
		answer, ok := response.Answer[0].(*dns.A)
		if !ok || answer.A.String() != want {
			t.Fatalf("proxied address = %v, want %s", response.Answer[0], want)
		}
	}
	check("198.51.100.1")
	h.SetPublicIP("198.51.100.2")
	check("198.51.100.2")
}
