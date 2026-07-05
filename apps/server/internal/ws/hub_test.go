package ws

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestHubRegisterUnregister(t *testing.T) {
	h := NewHub()
	c1 := &fakeConn{id: "a"}
	c2 := &fakeConn{id: "b"}

	h.Register(c1, []string{"user"})
	h.Register(c2, []string{"user"})

	if got := h.ClientCount(); got != 2 {
		t.Errorf("after register: count = %d, want 2", got)
	}

	h.Unregister(c1)
	if got := h.ClientCount(); got != 1 {
		t.Errorf("after unregister c1: count = %d, want 1", got)
	}

	h.Unregister(c2)
	if got := h.ClientCount(); got != 0 {
		t.Errorf("after unregister c2: count = %d, want 0", got)
	}
}

func TestHubBroadcastDeliversToAll(t *testing.T) {
	h := NewHub()
	c1 := &fakeConn{id: "a"}
	c2 := &fakeConn{id: "b"}
	h.Register(c1, []string{"user"})
	h.Register(c2, []string{"user"})

	h.Broadcast([]byte("hello"))

	c1.waitFor(1, time.Second)
	c2.waitFor(1, time.Second)

	c1.mu.Lock()
	got1 := len(c1.written)
	c1.mu.Unlock()
	if got1 != 1 {
		t.Errorf("c1 writes = %d, want 1", got1)
	}
	c2.mu.Lock()
	got2 := len(c2.written)
	c2.mu.Unlock()
	if got2 != 1 {
		t.Errorf("c2 writes = %d, want 1", got2)
	}
}

func TestHubBroadcastNoClientsNoBlock(t *testing.T) {
	h := NewHub()
	done := make(chan struct{})
	go func() {
		h.Broadcast([]byte("x"))
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Broadcast blocked with no clients")
	}
}

func TestHubUnregisterIdempotent(t *testing.T) {
	h := NewHub()
	c := newFakeConn("a")
	h.Register(c, []string{"user"})
	h.Unregister(c)
	h.Unregister(c)
	if got := h.ClientCount(); got != 0 {
		t.Errorf("count = %d, want 0", got)
	}
}

func TestHubRegisterDoesNotOverwrite(t *testing.T) {
	h := NewHub()
	c := &fakeConn{id: "a"}
	h.Register(c, []string{"user"})
	h.Register(c, []string{"user"})
	if got := h.ClientCount(); got != 1 {
		t.Errorf("double register: count = %d, want 1", got)
	}
}

func TestRegister_IndicesByUserAndRole(t *testing.T) {
	h := NewHub()
	admin := &fakeConn{id: "admin-1"}
	user := &fakeConn{id: "user-1"}
	h.Register(admin, []string{"user", "admin"})
	h.Register(user, []string{"user"})

	if got := h.SendToRole("admin", mustEnv(t, "ping", nil)); got != 1 {
		t.Errorf("admin fan-out delivered = %d, want 1", got)
	}
	if got := h.SendToRole("user", mustEnv(t, "ping", nil)); got != 2 {
		t.Errorf("user fan-out delivered = %d, want 2", got)
	}
}

func TestUnregister_RemovesFromRoleIndex(t *testing.T) {
	h := NewHub()
	admin := &fakeConn{id: "admin-1"}
	h.Register(admin, []string{"admin"})
	if got := h.SendToRole("admin", mustEnv(t, "ping", nil)); got != 1 {
		t.Fatalf("expected 1 before unregister, got %d", got)
	}
	h.Unregister(admin)
	if got := h.SendToRole("admin", mustEnv(t, "ping", nil)); got != 0 {
		t.Fatalf("expected 0 after unregister, got %d", got)
	}
}

func TestSendToUser_Online_ReachesOnlyTarget(t *testing.T) {
	h := NewHub()
	target := &fakeConn{id: "u-target"}
	other := &fakeConn{id: "u-other"}
	h.Register(target, []string{"user"})
	h.Register(other, []string{"user"})

	if err := h.SendToUser("u-target", mustEnv(t, "direct", map[string]any{"v": 1})); err != nil {
		t.Fatalf("SendToUser: %v", err)
	}
	target.waitFor(1, time.Second)

	target.mu.Lock()
	targetGot := len(target.written)
	target.mu.Unlock()
	if targetGot != 1 {
		t.Errorf("target writes = %d, want 1", targetGot)
	}
	other.mu.Lock()
	otherGot := len(other.written)
	other.mu.Unlock()
	if otherGot != 0 {
		t.Errorf("other writes = %d, want 0 (adjacency isolation)", otherGot)
	}
}

func TestSendToUser_Offline_NoOpNoError(t *testing.T) {
	h := NewHub()
	if err := h.SendToUser("nobody", mustEnv(t, "direct", nil)); err != nil {
		t.Fatalf("offline SendToUser must be no-op, got error: %v", err)
	}
}

func TestSendToRole_AdminFanOut_ExcludesUserOnly(t *testing.T) {
	h := NewHub()
	a1 := &fakeConn{id: "a1"}
	a2 := &fakeConn{id: "a2"}
	u1 := &fakeConn{id: "u1"}
	h.Register(a1, []string{"admin"})
	h.Register(a2, []string{"admin"})
	h.Register(u1, []string{"user"})

	got := h.SendToRole("admin", mustEnv(t, "audit.log", map[string]any{"action": "test"}))
	if got != 2 {
		t.Errorf("admin fan-out delivered = %d, want 2", got)
	}
	u1.mu.Lock()
	u1Got := len(u1.written)
	u1.mu.Unlock()
	if u1Got != 0 {
		t.Errorf("user-only conn received admin event: %d writes", u1Got)
	}
}

func TestUnknownType_NoPanic(t *testing.T) {
	h := NewHub()
	c := &fakeConn{id: "a"}
	h.Register(c, []string{"user"})

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("unknown type panicked: %v", r)
		}
	}()
	env := mustEnv(t, "totally.unknown.type", map[string]any{"x": 1})
	if err := h.SendToUser("a", env); err != nil {
		t.Fatalf("SendToUser unknown type: %v", err)
	}
	c.waitFor(1, time.Second)
	c.mu.Lock()
	got := len(c.written)
	c.mu.Unlock()
	if got != 1 {
		t.Errorf("unknown type should still deliver (no drop): writes = %d, want 1", got)
	}
}

func TestSendToRole_Concurrent100Admins(t *testing.T) {
	h := NewHub()
	for i := 0; i < 100; i++ {
		c := &fakeConn{id: string(rune('A'+i%26)) + "-" + itoa(i)}
		h.Register(c, []string{"admin"})
	}

	var wg sync.WaitGroup
	const bursts = 50
	wg.Add(bursts)
	for i := 0; i < bursts; i++ {
		go func() {
			defer wg.Done()
			h.SendToRole("admin", mustEnv(t, "audit.log", nil))
		}()
	}
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("concurrent SendToRole deadlocked")
	}
}

func TestSendToRole_NoAdmins_ReturnsZero(t *testing.T) {
	h := NewHub()
	if got := h.SendToRole("admin", mustEnv(t, "x", nil)); got != 0 {
		t.Errorf("expected 0 with no admins, got %d", got)
	}
}

func TestEnvelope_ValidJSON(t *testing.T) {
	env, err := NewEnvelope("audit.log", map[string]any{"action": "login"})
	if err != nil {
		t.Fatalf("NewEnvelope: %v", err)
	}
	raw, err := env.Marshal()
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("not valid JSON: %v", err)
	}
	if decoded["type"] != "audit.log" {
		t.Errorf("type = %v, want audit.log", decoded["type"])
	}
	if decoded["ts"] == nil {
		t.Error("ts missing")
	}
}

func mustEnv(t *testing.T, typeName string, payload any) Envelope {
	t.Helper()
	env, err := NewEnvelope(typeName, payload)
	if err != nil {
		t.Fatalf("NewEnvelope(%s): %v", typeName, err)
	}
	return env
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf []byte
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	return string(buf)
}

type fakeConn struct {
	id      string
	mu      sync.Mutex
	written [][]byte
	wakeup  chan struct{}
}

func newFakeConn(id string) *fakeConn {
	return &fakeConn{id: id, wakeup: make(chan struct{}, 16)}
}

func (f *fakeConn) ID() string { return f.id }

func (f *fakeConn) Write(ctx context.Context, msg []byte) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	f.mu.Lock()
	f.written = append(f.written, append([]byte(nil), msg...))
	f.mu.Unlock()
	select {
	case f.wakeup <- struct{}{}:
	default:
	}
	return nil
}

func (f *fakeConn) waitFor(n int, timeout time.Duration) {
	deadline := time.After(timeout)
	for {
		f.mu.Lock()
		count := len(f.written)
		f.mu.Unlock()
		if count >= n {
			return
		}
		select {
		case <-f.wakeup:
		case <-deadline:
			return
		}
	}
}

var errClosed = errors.New("closed")

var _ Conn = (*fakeConn)(nil)
var _ = errClosed
