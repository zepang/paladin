package ws

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

func TestHubRegisterUnregister(t *testing.T) {
	h := NewHub()
	c1 := &fakeConn{id: "a"}
	c2 := &fakeConn{id: "b"}

	h.Register(c1)
	h.Register(c2)

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
	h.Register(c1)
	h.Register(c2)

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
	h.Register(c)
	h.Unregister(c)
	h.Unregister(c)
	if got := h.ClientCount(); got != 0 {
		t.Errorf("count = %d, want 0", got)
	}
}

func TestHubRegisterDoesNotOverwrite(t *testing.T) {
	h := NewHub()
	c := &fakeConn{id: "a"}
	h.Register(c)
	h.Register(c)
	if got := h.ClientCount(); got != 1 {
		t.Errorf("double register: count = %d, want 1", got)
	}
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
