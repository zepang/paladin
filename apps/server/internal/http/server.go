package httpserver

import (
	"log"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"paladin/apps/server/internal/config"
	sqlcgen "paladin/apps/server/internal/db/sqlc"
	"paladin/apps/server/internal/http/handler"
	"paladin/apps/server/internal/http/middleware"
	wsgateway "paladin/apps/server/internal/http/ws"
	"paladin/apps/server/internal/ws"
)

func NewServer(cfg *config.Config, pool *pgxpool.Pool, rdb *redis.Client) *gin.Engine {
	r := gin.New()
	r.Use(middleware.Recovery(log.Default()))
	r.Use(corsMiddleware())

	queries := sqlcgen.New(pool)
	store := handler.NewPgStore(queries, pool)

	health := handler.NewHealthHandler(pool, rdb)
	authH := handler.NewAuthHandler(cfg.JWTSecret, cfg.JWTTTL, store, cfg.BcryptCost)
	sample := &handler.SampleHandler{}

	hub := ws.NewHub()
	wsH := wsgateway.NewWSHandler(hub, log.Default())

	r.GET("/healthz", health.Liveness)
	r.GET("/readyz", health.Ready)

	r.POST("/auth/register", authH.Register)
	r.POST("/auth/login", authH.Login)

	r.GET("/me", middleware.Auth(cfg.JWTSecret), sample.Me)

	adminGroup := r.Group("", middleware.Auth(cfg.JWTSecret), middleware.RequireRole("admin"))
	adminGroup.GET("/admin/health", sample.AdminHealth)

	r.GET("/ws", middleware.Auth(cfg.JWTSecret), wsH.Handle)

	return r
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowed := []string{"http://localhost", "http://127.0.0.1"}
		for _, a := range allowed {
			if origin == a || strings.HasPrefix(origin, a) {
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
