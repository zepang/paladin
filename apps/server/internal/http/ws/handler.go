package ws

import (
	"context"
	"errors"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/gin-gonic/gin"

	"paladin/apps/server/internal/ws"
)

type wsConn struct {
	id     string
	conn   *websocket.Conn
	closed bool
	mu     sync.Mutex
}

func newWSConn(id string, c *websocket.Conn) *wsConn {
	return &wsConn{id: id, conn: c}
}

func (w *wsConn) ID() string { return w.id }

func (w *wsConn) Write(ctx context.Context, msg []byte) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return errors.New("connection closed")
	}
	return w.conn.Write(ctx, websocket.MessageText, msg)
}

func (w *wsConn) close() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.closed = true
}

type WSHandler struct {
	hub          *ws.Hub
	pingInterval time.Duration
	logger       *log.Logger
}

func NewWSHandler(hub *ws.Hub, logger *log.Logger) *WSHandler {
	return &WSHandler{
		hub:          hub,
		pingInterval: 30 * time.Second,
		logger:       logger,
	}
}

func (h *WSHandler) Handle(c *gin.Context) {
	userID, _ := c.Get("userID")

	conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
		OriginPatterns: []string{"localhost", "127.0.0.1"},
	})
	if err != nil {
		if h.logger != nil {
			h.logger.Printf("ws accept: %v", err)
		}
		return
	}
	defer conn.Close(websocket.StatusInternalError, "internal")

	id, _ := userID.(string)
	if id == "" {
		id = "anon"
	}
	wc := newWSConn(id, conn)
	h.hub.Register(wc)
	defer h.hub.Unregister(wc)
	defer wc.close()

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	go h.pingLoop(ctx, conn)

	err = h.readLoop(ctx, conn)
	if err != nil && h.logger != nil {
		h.logger.Printf("ws read: %v", err)
	}
}

func (h *WSHandler) pingLoop(ctx context.Context, conn *websocket.Conn) {
	if h.pingInterval <= 0 {
		return
	}
	t := time.NewTicker(h.pingInterval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := conn.Ping(ctx); err != nil {
				return
			}
		}
	}
}

func (h *WSHandler) readLoop(ctx context.Context, conn *websocket.Conn) error {
	for {
		_, _, err := conn.Read(ctx)
		if err != nil {
			return err
		}
	}
}

func (h *WSHandler) Broadcast(msg []byte) {
	h.hub.Broadcast(msg)
}

func (h *WSHandler) ClientCount() int {
	return h.hub.ClientCount()
}

var _ http.Handler = (http.HandlerFunc)(nil)
