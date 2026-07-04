package ws

import (
	"context"
	"sync"
)

type Conn interface {
	ID() string
	Write(ctx context.Context, msg []byte) error
}

type Hub struct {
	mu      sync.RWMutex
	clients map[string]Conn
}

func NewHub() *Hub {
	return &Hub{clients: make(map[string]Conn)}
}

func (h *Hub) Register(c Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c.ID()] = c
}

func (h *Hub) Unregister(c Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, c.ID())
}

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *Hub) Broadcast(msg []byte) {
	h.mu.RLock()
	conns := make([]Conn, 0, len(h.clients))
	for _, c := range h.clients {
		conns = append(conns, c)
	}
	h.mu.RUnlock()

	for _, c := range conns {
		_ = c.Write(context.Background(), msg)
	}
}
