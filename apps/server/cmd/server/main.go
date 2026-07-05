package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"paladin/apps/server/internal/auth"
	"paladin/apps/server/internal/config"
	"paladin/apps/server/internal/db"
	sqlcgen "paladin/apps/server/internal/db/sqlc"
	httpserver "paladin/apps/server/internal/http"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("load .env (non-fatal, relying on env vars): %v", err)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	rootCtx, rootCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer rootCancel()

	pool, err := db.NewPostgresPool(rootCtx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres pool: %v", err)
	}
	defer pool.Close()

	rdb, err := db.NewRedisClient(rootCtx, cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis client: %v", err)
	}
	defer rdb.Close()

	if cfg.AdminEmail != "" && cfg.AdminPassword != "" {
		queries := sqlcgen.New(pool)
		bctx, bcancel := context.WithTimeout(context.Background(), 5*time.Second)
		if err := auth.BootstrapAdmin(bctx, queries, pool, cfg.AdminEmail, cfg.AdminPassword, cfg.BcryptCost); err != nil {
			log.Printf("bootstrap admin (non-fatal): %v", err)
		}
		bcancel()
	}

	engine := httpserver.NewServer(cfg, pool, rdb)
	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Port),
		Handler: engine,
	}

	go func() {
		fmt.Println("Paladin Go Server")
		fmt.Printf("地址:       http://localhost:%d\n", cfg.Port)
		fmt.Printf("健康检查:   http://localhost:%d/healthz\n", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGTERM, syscall.SIGINT)
	<-quit

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
