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
	mu        sync.RWMutex
	byUser    map[string][]Conn
	byRole    map[string]map[string]bool
	userRoles map[string][]string
}

func NewHub() *Hub {
	return &Hub{
		byUser:    make(map[string][]Conn),
		byRole:    make(map[string]map[string]bool),
		userRoles: make(map[string][]string),
	}
}

func containsConn(conns []Conn, c Conn) bool {
	for _, existing := range conns {
		if existing == c {
			return true
		}
	}
	return false
}

func (h *Hub) Register(c Conn, roles []string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	id := c.ID()
	if !containsConn(h.byUser[id], c) {
		h.byUser[id] = append(h.byUser[id], c)
	}

	if _, seeded := h.userRoles[id]; !seeded {
		h.userRoles[id] = roles
		for _, r := range roles {
			if h.byRole[r] == nil {
				h.byRole[r] = make(map[string]bool)
			}
			h.byRole[r][id] = true
		}
	}
}

func (h *Hub) Unregister(c Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	id := c.ID()
	conns := h.byUser[id]
	kept := conns[:0]
	for _, existing := range conns {
		if existing != c {
			kept = append(kept, existing)
		}
	}
	if len(kept) == 0 {
		delete(h.byUser, id)
		if roles, ok := h.userRoles[id]; ok {
			for _, r := range roles {
				if set := h.byRole[r]; set != nil {
					delete(set, id)
					if len(set) == 0 {
						delete(h.byRole, r)
					}
				}
			}
			delete(h.userRoles, id)
		}
	} else {
		h.byUser[id] = kept
	}
}

func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	n := 0
	for _, conns := range h.byUser {
		n += len(conns)
	}
	return n
}

func (h *Hub) Broadcast(msg []byte) {
	h.mu.RLock()
	conns := make([]Conn, 0, h.ClientCountLocked())
	for _, cs := range h.byUser {
		conns = append(conns, cs...)
	}
	h.mu.RUnlock()

	for _, c := range conns {
		_ = c.Write(context.Background(), msg)
	}
}

func (h *Hub) ClientCountLocked() int {
	n := 0
	for _, conns := range h.byUser {
		n += len(conns)
	}
	return n
}

func (h *Hub) SendToUser(uid string, env Envelope) error {
	raw, err := env.Marshal()
	if err != nil {
		return err
	}

	h.mu.RLock()
	conns := make([]Conn, len(h.byUser[uid]))
	copy(conns, h.byUser[uid])
	h.mu.RUnlock()

	for _, c := range conns {
		_ = c.Write(context.Background(), raw)
	}
	return nil
}

func (h *Hub) SendToRole(role string, env Envelope) int {
	raw, err := env.Marshal()
	if err != nil {
		return 0
	}

	h.mu.RLock()
	uids := make([]string, 0)
	if set := h.byRole[role]; set != nil {
		for uid := range set {
			uids = append(uids, uid)
		}
	}
	conns := make([]Conn, 0)
	for _, uid := range uids {
		conns = append(conns, h.byUser[uid]...)
	}
	h.mu.RUnlock()

	delivered := 0
	for _, c := range conns {
		if err := c.Write(context.Background(), raw); err == nil {
			delivered++
		}
	}
	return delivered
}
