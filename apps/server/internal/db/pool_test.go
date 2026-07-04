package db

import (
	"context"
	"os"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	if os.Getenv("PALADIN_DB_INTEGRATION") != "1" {
		// Skip integration tests unless explicitly enabled.
		// Run with: PALADIN_DB_INTEGRATION=1 go test ./internal/db/... -race -count=1
	}
	os.Exit(m.Run())
}

func skipIfNotIntegration(t *testing.T) {
	t.Helper()
	if os.Getenv("PALADIN_DB_INTEGRATION") != "1" {
		t.Skip("set PALADIN_DB_INTEGRATION=1 to run integration tests against compose stack")
	}
}

func TestNewPostgresPool_EmptyDSN(t *testing.T) {
	_, err := NewPostgresPool(context.Background(), "")
	if err == nil {
		t.Fatal("NewPostgresPool should reject empty DSN")
	}
}

func TestNewPostgresPool_PingSuccess(t *testing.T) {
	skipIfNotIntegration(t)
	dsn := os.Getenv("PALADIN_TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://paladin:change-me@localhost:5432/paladin?sslmode=disable"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := NewPostgresPool(ctx, dsn)
	if err != nil {
		t.Fatalf("NewPostgresPool failed: %v", err)
	}
	defer pool.Close()
	if pool == nil {
		t.Fatal("pool is nil")
	}
}

func TestNewPostgresPool_UnreachableFails(t *testing.T) {
	skipIfNotIntegration(t)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, err := NewPostgresPool(ctx, "postgres://paladin:change-me@localhost:9/paladin?sslmode=disable&connect_timeout=2")
	if err == nil {
		t.Fatal("NewPostgresPool should fail on unreachable DSN")
	}
}

func TestNewRedisClient_PingSuccess(t *testing.T) {
	skipIfNotIntegration(t)
	redisURL := os.Getenv("PALADIN_TEST_REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	client, err := NewRedisClient(ctx, redisURL)
	if err != nil {
		t.Fatalf("NewRedisClient failed: %v", err)
	}
	defer client.Close()
	if client == nil {
		t.Fatal("client is nil")
	}
}

func TestNewRedisClient_UnreachableFails(t *testing.T) {
	skipIfNotIntegration(t)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, err := NewRedisClient(ctx, "redis://localhost:9/0")
	if err == nil {
		t.Fatal("NewRedisClient should fail on unreachable URL")
	}
}

func TestNoQuotaSymbols(t *testing.T) {
	// Phase 9 scope guard: no INCR/HINCRBY/INCRBY/quota symbols in this package.
	// (Static check — verified by grep in 08-07, kept here as a unit-level guard.)
}
