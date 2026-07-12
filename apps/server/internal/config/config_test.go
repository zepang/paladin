package config

import (
	"testing"
	"time"
)

func setEnv(t *testing.T, kv map[string]string) {
	t.Helper()
	for k, v := range kv {
		t.Setenv(k, v)
	}
}

func validEnv() map[string]string {
	return map[string]string{
		"PALADIN_DATABASE_URL": "postgres://paladin:change-me@localhost:5432/paladin?sslmode=disable",
		"PALADIN_REDIS_URL":    "redis://localhost:6379/0",
		"PALADIN_JWT_SECRET":   "0123456789abcdef0123456789abcdef0123456789",
	}
}

func TestLoad_Defaults(t *testing.T) {
	setEnv(t, validEnv())
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.Port != 9880 {
		t.Errorf("Port = %d, want 9880", cfg.Port)
	}
	if cfg.JWTTTL != 15*time.Minute {
		t.Errorf("JWTTTL = %v, want 15m", cfg.JWTTTL)
	}
	if cfg.BcryptCost != 10 {
		t.Errorf("BcryptCost = %d, want 10", cfg.BcryptCost)
	}
	if !cfg.AutoMigrate {
		t.Errorf("AutoMigrate = false, want true")
	}
}

func TestLoad_OverridePort(t *testing.T) {
	env := validEnv()
	env["PALADIN_PORT"] = "9999"
	setEnv(t, env)
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}
	if cfg.Port != 9999 {
		t.Errorf("Port = %d, want 9999", cfg.Port)
	}
}

func TestLoad_JWTSecretTooShort(t *testing.T) {
	env := validEnv()
	env["PALADIN_JWT_SECRET"] = "0123456789abcdef0123456789abcde"
	setEnv(t, env)
	_, err := Load()
	if err == nil {
		t.Fatal("Load should reject short JWT secret")
	}
}

func TestLoad_EmptyDatabaseURL(t *testing.T) {
	env := validEnv()
	env["PALADIN_DATABASE_URL"] = ""
	setEnv(t, env)
	_, err := Load()
	if err == nil {
		t.Fatal("Load should reject empty DATABASE_URL")
	}
}

func TestLoad_EmptyRedisURL(t *testing.T) {
	env := validEnv()
	env["PALADIN_REDIS_URL"] = ""
	setEnv(t, env)
	_, err := Load()
	if err == nil {
		t.Fatal("Load should reject empty REDIS_URL")
	}
}

func TestLoadPackagedDegraded_AllowsMissingDependenciesAndJWT(t *testing.T) {
	t.Setenv("PALADIN_DATABASE_URL", "")
	t.Setenv("PALADIN_REDIS_URL", "")
	t.Setenv("PALADIN_JWT_SECRET", "")

	cfg, err := LoadPackagedDegraded()
	if err != nil {
		t.Fatalf("LoadPackagedDegraded returned error: %v", err)
	}
	if cfg.Port != 9880 {
		t.Errorf("Port = %d, want 9880", cfg.Port)
	}
	if cfg.DatabaseURL != "" {
		t.Errorf("DatabaseURL should remain empty in degraded config")
	}
	if cfg.RedisURL != "" {
		t.Errorf("RedisURL should remain empty in degraded config")
	}
}

func TestLoadPackagedDegraded_StillRejectsShortJWTSecret(t *testing.T) {
	t.Setenv("PALADIN_DATABASE_URL", "")
	t.Setenv("PALADIN_REDIS_URL", "")
	t.Setenv("PALADIN_JWT_SECRET", "short")

	_, err := LoadPackagedDegraded()
	if err == nil {
		t.Fatal("LoadPackagedDegraded should reject a provided short JWT secret")
	}
}

func TestLoad_BcryptCostTooLow(t *testing.T) {
	env := validEnv()
	env["PALADIN_BCRYPT_COST"] = "4"
	setEnv(t, env)
	_, err := Load()
	if err == nil {
		t.Fatal("Load should reject bcrypt cost < 10")
	}
}
