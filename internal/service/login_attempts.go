package service

import (
	"net/netip"
	"strings"
	"sync"
	"time"
)

const (
	DefaultLoginAttemptWindow = 10 * time.Minute
	DefaultMaxFailedAttempts  = 3
	DefaultMaxTrackedIPs      = 4096
)

// LoginAttemptTracker is the daemon-owned login lockout state shared by every
// management surface that can authenticate or clear an operator address.
type LoginAttemptTracker struct {
	mu          sync.Mutex
	attempts    map[string][]time.Time
	window      time.Duration
	maxFailures int
	maxTracked  int
}

func NewLoginAttemptTracker() *LoginAttemptTracker {
	return &LoginAttemptTracker{
		attempts:    make(map[string][]time.Time),
		window:      DefaultLoginAttemptWindow,
		maxFailures: DefaultMaxFailedAttempts,
		maxTracked:  DefaultMaxTrackedIPs,
	}
}

// lockoutKey folds an IPv6 address to its /64. One subscriber or attacker
// normally controls a whole /64, so per-address keys let them rotate addresses
// past the lockout. Unparseable input is kept as-is.
func lockoutKey(ip string) string {
	addr, err := netip.ParseAddr(strings.TrimSpace(ip))
	if err != nil {
		return ip
	}
	addr = addr.Unmap()
	if addr.Is6() {
		p, _ := addr.Prefix(64)
		return p.String()
	}
	return addr.String()
}

func (t *LoginAttemptTracker) IsBlocked(ip string) bool {
	if t == nil {
		return false
	}
	ip = lockoutKey(ip)
	t.mu.Lock()
	defer t.mu.Unlock()
	t.pruneLocked(ip, time.Now())
	return len(t.attempts[ip]) >= t.maxFailures
}

func (t *LoginAttemptTracker) RecordFailure(ip string) {
	if t == nil {
		return
	}
	ip = lockoutKey(ip)
	t.mu.Lock()
	defer t.mu.Unlock()
	now := time.Now()
	t.attempts[ip] = append(t.attempts[ip], now)
	t.pruneLocked(ip, now)
	if len(t.attempts) > t.maxTracked {
		t.sweepLocked(now)
	}
	// Hard cap: still over after expiring old entries, so evict entries that are
	// not yet locked out. Locked addresses stay, so a flood of fresh keys cannot
	// unlock anyone.
	for k, v := range t.attempts {
		if len(t.attempts) <= t.maxTracked {
			break
		}
		if k != ip && len(v) < t.maxFailures {
			delete(t.attempts, k)
		}
	}
}

func (t *LoginAttemptTracker) RecordSuccess(ip string) {
	if t == nil {
		return
	}
	ip = lockoutKey(ip)
	t.mu.Lock()
	delete(t.attempts, ip)
	t.mu.Unlock()
}

// Reset clears one address and reports whether a record was removed.
func (t *LoginAttemptTracker) Reset(ip string) bool {
	if t == nil {
		return false
	}
	ip = lockoutKey(ip)
	t.mu.Lock()
	defer t.mu.Unlock()
	_, existed := t.attempts[ip]
	delete(t.attempts, ip)
	return existed
}

func (t *LoginAttemptTracker) ResetAll() int {
	if t == nil {
		return 0
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	n := len(t.attempts)
	t.attempts = make(map[string][]time.Time)
	return n
}

func (t *LoginAttemptTracker) Count() int {
	if t == nil {
		return 0
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	t.sweepLocked(time.Now())
	return len(t.attempts)
}

func (t *LoginAttemptTracker) pruneLocked(ip string, now time.Time) {
	times, ok := t.attempts[ip]
	if !ok {
		return
	}
	cutoff := now.Add(-t.window)
	valid := times[:0]
	for _, ts := range times {
		if ts.After(cutoff) {
			valid = append(valid, ts)
		}
	}
	if len(valid) == 0 {
		delete(t.attempts, ip)
		return
	}
	t.attempts[ip] = valid
}

func (t *LoginAttemptTracker) sweepLocked(now time.Time) {
	for ip := range t.attempts {
		t.pruneLocked(ip, now)
	}
}
