package quota

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func newTestLimiter(t *testing.T, limit int, window time.Duration) (*Limiter, *miniredis.Miniredis) {
	t.Helper()
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis: %v", err)
	}
	t.Cleanup(mr.Close)
	rdb := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rdb.Close() })
	return NewLimiter(rdb, limit, window), mr
}

func TestStatus_NewUser_ZeroUsed(t *testing.T) {
	l, _ := newTestLimiter(t, 5, time.Hour)
	dec, err := l.Status(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("Status: %v", err)
	}
	if dec.Used != 0 {
		t.Fatalf("expected Used=0, got %d", dec.Used)
	}
	if dec.Limit != 5 {
		t.Fatalf("expected Limit=5, got %d", dec.Limit)
	}
	if !dec.Allowed {
		t.Fatal("new user must be allowed")
	}
}

func TestCheckAndConsume_Increments(t *testing.T) {
	l, _ := newTestLimiter(t, 5, time.Hour)
	for i := 1; i <= 3; i++ {
		dec, err := l.CheckAndConsume(context.Background(), "user-1")
		if err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
		if !dec.Allowed {
			t.Fatalf("call %d must be allowed", i)
		}
		if dec.Used != i {
			t.Fatalf("call %d: expected Used=%d, got %d", i, i, dec.Used)
		}
	}
}

func TestCheckAndConsume_OverLimit_Rejected(t *testing.T) {
	l, _ := newTestLimiter(t, 2, time.Hour)
	for i := 1; i <= 2; i++ {
		dec, _ := l.CheckAndConsume(context.Background(), "user-1")
		if !dec.Allowed {
			t.Fatalf("call %d must be allowed", i)
		}
	}
	dec, err := l.CheckAndConsume(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("over-limit call: %v", err)
	}
	if dec.Allowed {
		t.Fatal("3rd call must be rejected")
	}
	if dec.Used != 2 {
		t.Fatalf("expected Used=2 at rejection, got %d", dec.Used)
	}
}

func TestCheckAndConsume_Concurrent_Exact(t *testing.T) {
	const limit = 50
	const total = 100
	l, _ := newTestLimiter(t, limit, time.Hour)

	var wg sync.WaitGroup
	wg.Add(total)
	var mu sync.Mutex
	allowed := 0
	rejected := 0
	for i := 0; i < total; i++ {
		go func() {
			defer wg.Done()
			dec, err := l.CheckAndConsume(context.Background(), "user-concurrent")
			if err != nil {
				t.Errorf("concurrent call: %v", err)
				return
			}
			mu.Lock()
			if dec.Allowed {
				allowed++
			} else {
				rejected++
			}
			mu.Unlock()
		}()
	}
	wg.Wait()

	if allowed != limit {
		t.Fatalf("expected exactly %d allowed, got %d (lost/over count under concurrency)", limit, allowed)
	}
	if rejected != total-limit {
		t.Fatalf("expected exactly %d rejected, got %d", total-limit, rejected)
	}

	dec, _ := l.Status(context.Background(), "user-concurrent")
	if dec.Used != limit {
		t.Fatalf("post-concurrency Status: expected Used=%d, got %d", limit, dec.Used)
	}
}

func TestStatus_DoesNotMutateCounter(t *testing.T) {
	l, _ := newTestLimiter(t, 5, time.Hour)
	if _, err := l.CheckAndConsume(context.Background(), "user-1"); err != nil {
		t.Fatal(err)
	}
	before, _ := l.Status(context.Background(), "user-1")
	if before.Used != 1 {
		t.Fatalf("expected Used=1 before, got %d", before.Used)
	}
	after, _ := l.Status(context.Background(), "user-1")
	if after.Used != 1 {
		t.Fatalf("Status mutated counter: was 1, now %d", after.Used)
	}
}

func TestWindowReset_EvictsOldEntries(t *testing.T) {
	l, _ := newTestLimiter(t, 3, 80*time.Millisecond)
	for i := 0; i < 3; i++ {
		if _, err := l.CheckAndConsume(context.Background(), "user-1"); err != nil {
			t.Fatal(err)
		}
	}
	dec, _ := l.CheckAndConsume(context.Background(), "user-1")
	if dec.Allowed {
		t.Fatal("4th call within window must be rejected")
	}
	time.Sleep(120 * time.Millisecond)
	dec, err := l.CheckAndConsume(context.Background(), "user-1")
	if err != nil {
		t.Fatalf("after reset: %v", err)
	}
	if !dec.Allowed {
		t.Fatal("after window reset, first call must be allowed again")
	}
	if dec.Used != 1 {
		t.Fatalf("after reset expected Used=1, got %d", dec.Used)
	}
}

func TestCheckAndConsume_EmptyUser_FirstAllowed(t *testing.T) {
	l, _ := newTestLimiter(t, 1, time.Hour)
	dec, err := l.CheckAndConsume(context.Background(), "fresh-user")
	if err != nil {
		t.Fatalf("first call: %v", err)
	}
	if !dec.Allowed {
		t.Fatal("zero-usage user must be allowed on first request")
	}
}
