package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"paladin/apps/server/internal/http/middleware"
)

type Pinger interface {
	Ping(ctx context.Context) error
}

type pgxAdapter struct {
	pool *pgxpool.Pool
}

func (a pgxAdapter) Ping(ctx context.Context) error {
	return a.pool.Ping(ctx)
}

type redisAdapter struct {
	client *redis.Client
}

func (a redisAdapter) Ping(ctx context.Context) error {
	return a.client.Ping(ctx).Err()
}

type HealthHandler struct {
	pg    Pinger
	redis Pinger
}

func NewHealthHandler(pool *pgxpool.Pool, rdb *redis.Client) *HealthHandler {
	return &HealthHandler{
		pg:    pgxAdapter{pool: pool},
		redis: redisAdapter{client: rdb},
	}
}

func NewHealthHandlerWithPingers(pg, rdb Pinger) *HealthHandler {
	return &HealthHandler{pg: pg, redis: rdb}
}

func (h *HealthHandler) Liveness(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *HealthHandler) Ready(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	status := gin.H{}
	ok := true

	if err := h.pg.Ping(ctx); err != nil {
		status["postgres"] = "down"
		ok = false
	} else {
		status["postgres"] = "up"
	}

	if err := h.redis.Ping(ctx); err != nil {
		status["redis"] = "down"
		ok = false
	} else {
		status["redis"] = "up"
	}

	code := http.StatusOK
	if !ok {
		code = http.StatusServiceUnavailable
	}
	c.JSON(code, gin.H{"status": status, "ok": ok})
}

var _ = middleware.WriteError
