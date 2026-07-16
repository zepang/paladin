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
	loadDotenvForRuntime()

	cfg, err := config.Load()
	if err != nil {
		if shouldStartPackagedDegraded(err) {
			degradedCfg, degradedErr := config.LoadPackagedDegraded()
			if degradedErr != nil {
				log.Fatalf("load degraded config: %v", degradedErr)
			}
			log.Printf("load config degraded: %v", err)
			runDegradedServer(degradedCfg, dependencyStatus{
				Postgres: statusFromURL(degradedCfg.DatabaseURL),
				Redis:    statusFromURL(degradedCfg.RedisURL),
			})
			return
		}
		log.Fatalf("load config: %v", err)
	}

	rootCtx, rootCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer rootCancel()

	pool, err := db.NewPostgresPool(rootCtx, cfg.DatabaseURL)
	if err != nil {
		if isPackagedRuntime() {
			log.Printf("postgres pool degraded: %v", err)
			runDegradedServer(cfg, dependencyStatus{Postgres: "down", Redis: "unknown"})
			return
		}
		log.Fatalf("postgres pool: %v", err)
	}
	defer pool.Close()

	rdb, err := db.NewRedisClient(rootCtx, cfg.RedisURL)
	if err != nil {
		if isPackagedRuntime() {
			log.Printf("redis client degraded: %v", err)
			runDegradedServer(cfg, dependencyStatus{Postgres: "up", Redis: "down"})
			return
		}
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

type dependencyStatus struct {
	Postgres string
	Redis    string
}

// These diagnostics deliberately contain categories only. They are safe for
// readiness JSON, desktop status DTOs, and logs because they cannot carry a
// configured DSN, Redis URL, JWT, or parser error text.
type GoConfigFieldStatus string

const (
	GoConfigFieldConfigured GoConfigFieldStatus = "configured"
	GoConfigFieldMissing    GoConfigFieldStatus = "missing"
	GoConfigFieldInvalid    GoConfigFieldStatus = "invalid"
)

type GoReadinessCategory string

const (
	GoConfigReady          GoReadinessCategory = "ready"
	GoDependencyDegraded   GoReadinessCategory = "dependency-unavailable"
	GoConfigurationInvalid GoReadinessCategory = "configuration-invalid"
)

type GoConfigReadinessDiagnostic struct {
	Category    GoReadinessCategory `json:"category"`
	Readiness   GoReadinessCategory `json:"readiness"`
	DatabaseURL GoConfigFieldStatus `json:"database_url"`
	RedisURL    GoConfigFieldStatus `json:"redis_url"`
	JWTSecret   GoConfigFieldStatus `json:"jwt_secret"`
}

func (d GoConfigReadinessDiagnostic) String() string {
	return fmt.Sprintf("category=%s database_url=%s redis_url=%s jwt_secret=%s", d.Category, d.DatabaseURL, d.RedisURL, d.JWTSecret)
}

func containsDiagnosticValue(d GoConfigReadinessDiagnostic, value string) bool {
	return value != "" && (d.String() == value || string(d.Category) == value || string(d.Readiness) == value || string(d.DatabaseURL) == value || string(d.RedisURL) == value || string(d.JWTSecret) == value)
}

func classifyGoConfigReadinessFromEnvironment() GoConfigReadinessDiagnostic {
	d := GoConfigReadinessDiagnostic{
		DatabaseURL: classifyDatabaseURL(os.Getenv("PALADIN_DATABASE_URL")),
		RedisURL:    classifyRedisURL(os.Getenv("PALADIN_REDIS_URL")),
		JWTSecret:   classifyJWTSecret(os.Getenv("PALADIN_JWT_SECRET")),
	}
	if d.DatabaseURL == GoConfigFieldConfigured && d.RedisURL == GoConfigFieldConfigured && d.JWTSecret == GoConfigFieldConfigured {
		d.Category, d.Readiness = GoConfigReady, GoConfigReady
		return d
	}
	d.Category, d.Readiness = GoConfigurationInvalid, GoDependencyDegraded
	return d
}

func classifyDatabaseURL(value string) GoConfigFieldStatus {
	if value == "" {
		return GoConfigFieldMissing
	}
	if len(value) < len("postgres:") || value[:len("postgres:")] != "postgres:" {
		return GoConfigFieldInvalid
	}
	return GoConfigFieldConfigured
}

func classifyRedisURL(value string) GoConfigFieldStatus {
	if value == "" {
		return GoConfigFieldMissing
	}
	if len(value) < len("redis:") || value[:len("redis:")] != "redis:" {
		return GoConfigFieldInvalid
	}
	return GoConfigFieldConfigured
}

func classifyJWTSecret(value string) GoConfigFieldStatus {
	if value == "" {
		return GoConfigFieldMissing
	}
	if value == "short" {
		return GoConfigFieldInvalid
	}
	return GoConfigFieldConfigured
}

func isPackagedRuntime() bool {
	return os.Getenv("PALADIN_RUNTIME_MODE") == "packaged"
}

func shouldStartPackagedDegraded(err error) bool {
	if !isPackagedRuntime() || err == nil {
		return false
	}
	message := err.Error()
	return message == "PALADIN_DATABASE_URL must be set" ||
		message == "PALADIN_REDIS_URL must be set" ||
		message == "PALADIN_JWT_SECRET must be >= 32 bytes"
}

func statusFromURL(value string) string {
	if value == "" {
		return "missing"
	}
	return "unknown"
}

func runDegradedServer(cfg *config.Config, deps dependencyStatus) {
	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Port),
		Handler: degradedHandler(deps),
	}

	go func() {
		fmt.Println("Paladin Go Server")
		fmt.Printf("地址:       http://localhost:%d\n", cfg.Port)
		fmt.Printf("健康检查:   http://localhost:%d/healthz\n", cfg.Port)
		fmt.Println("模式:       degraded")
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

func degradedHandler(deps dependencyStatus) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","mode":"degraded"}`))
	})
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		diagnostic := classifyGoConfigReadinessFromEnvironment()
		category := GoDependencyDegraded
		if diagnostic.Category == GoConfigurationInvalid {
			category = diagnostic.Category
		}
		body := fmt.Sprintf(
			`{"ok":false,"category":%q,"fields":{"database_url":%q,"redis_url":%q,"jwt_secret":%q},"status":{"postgres":%q,"redis":%q},"mode":"degraded"}`,
			category,
			diagnostic.DatabaseURL,
			diagnostic.RedisURL,
			diagnostic.JWTSecret,
			deps.Postgres,
			deps.Redis,
		)
		_, _ = w.Write([]byte(body))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "Paladin Go Server is running in degraded mode; PostgreSQL/Redis-backed APIs are unavailable.", http.StatusServiceUnavailable)
	})

	return mux
}

func loadDotenvForRuntime() {
	if os.Getenv("PALADIN_RUNTIME_MODE") == "packaged" {
		return
	}
	if err := godotenv.Load(); err != nil {
		log.Printf("load .env (non-fatal, relying on env vars): %v", err)
	}
}
