package httpserver

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"paladin/apps/server/internal/config"
	"paladin/apps/server/internal/http/handler"
	"paladin/apps/server/internal/http/middleware"
)

func notImplemented(c *gin.Context) {
	middleware.WriteError(c, 501, "not_implemented", "wired in later plan")
}

func NewServer(cfg *config.Config, pool *pgxpool.Pool, rdb *redis.Client) *gin.Engine {
	r := gin.New()
	r.Use(middleware.Recovery(log.Default()))
	r.Use(corsMiddleware())

	health := handler.NewHealthHandler(pool, rdb)
	sample := &handler.SampleHandler{}

	r.GET("/healthz", health.Liveness)
	r.GET("/readyz", health.Ready)
	r.GET("/me", sample.Me)
	r.GET("/admin/health", sample.AdminHealth)

	r.POST("/auth/register", notImplemented)
	r.POST("/auth/login", notImplemented)
	r.GET("/ws", notImplemented)

	return r
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowed := []string{"http://localhost", "http://127.0.0.1"}
		for _, a := range allowed {
			if origin == a || len(origin) > len(a) && origin[:len(a)] == a {
				c.Header("Access-Control-Allow-Origin", origin)
				break
			}
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
