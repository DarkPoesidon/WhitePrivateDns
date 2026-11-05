package service

import (
	"fmt"
	"testing"
)

func TestLoginAttemptTrackerResetReportsExactCount(t *testing.T) {
	tracker := NewLoginAttemptTracker()
	tracker.RecordFailure("192.0.2.1")
	tracker.RecordFailure("192.0.2.2")

	if !tracker.Reset("192.0.2.1") {
		t.Fatal("Reset reported no removed address")
	}
	if tracker.Reset("192.0.2.1") {
		t.Fatal("second Reset reported an address that no longer exists")
	}
	if got := tracker.ResetAll(); got != 1 {
		t.Fatalf("ResetAll = %d, want 1", got)
	}
	if got := tracker.Count(); got != 0 {
		t.Fatalf("Count = %d, want 0", got)
	}
}

func TestLoginAttemptTrackerFoldsIPv6To64(t *testing.T) {
	tr := NewLoginAttemptTracker()
	for _, ip := range []string{"2001:db8:1:2::1", "2001:db8:1:2::2", "2001:db8:1:2:ffff::3"} {
		tr.RecordFailure(ip)
	}
	if !tr.IsBlocked("2001:db8:1:2::99") {
		t.Fatal("addresses in one /64 must share a lockout")
	}
	if tr.IsBlocked("2001:db8:1:3::1") {
		t.Fatal("a different /64 must not be locked")
	}
	if !tr.Reset("2001:db8:1:2::7") || tr.IsBlocked("2001:db8:1:2::1") {
		t.Fatal("Reset must clear the whole /64")
	}
}

func TestLoginAttemptTrackerHardCap(t *testing.T) {
	tr := NewLoginAttemptTracker()
	tr.maxTracked = 10
	for i := 0; i < 3; i++ {
		tr.RecordFailure("198.51.100.1")
	}
	for i := 0; i < 100; i++ {
		tr.RecordFailure(fmt.Sprintf("2001:db8:0:%x::1", i+1))
	}
	if got := len(tr.attempts); got > 10 {
		t.Fatalf("tracked %d keys, cap is 10", got)
	}
	if !tr.IsBlocked("198.51.100.1") {
		t.Fatal("locked address must survive eviction")
	}
}
