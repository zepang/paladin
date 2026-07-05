package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

const (
	defaultPort        = 9880
	defaultJWTTTL      = 15 * time.Minute
	defaultBcryptCost  = 10
	defaultAutoMigrate = true
	minJWTSecretLen    = 32
	minBcryptCost      = 10
	AuthTimeout        = 5 * time.Second
	PingInterval       = 30 * time.Second
	defaultQuotaLimit  = 50
	defaultQuotaWindow = 1 * time.Hour
)

type Config struct {
	Port          int
	DatabaseURL   string
	RedisURL      string
	JWTSecret     string
	JWTTTL        time.Duration
	BcryptCost    int
	AdminEmail    string
	AdminPassword string
	AutoMigrate   bool
	QuotaLimit    int
	QuotaWindow   time.Duration
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:        defaultPort,
		JWTTTL:      defaultJWTTTL,
		BcryptCost:  defaultBcryptCost,
		AutoMigrate: defaultAutoMigrate,
	}

	if v := os.Getenv("PALADIN_PORT"); v != "" {
		p, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("PALADIN_PORT must be an integer: %w", err)
		}
		cfg.Port = p
	}

	cfg.DatabaseURL = os.Getenv("PALADIN_DATABASE_URL")
	cfg.RedisURL = os.Getenv("PALADIN_REDIS_URL")
	cfg.JWTSecret = os.Getenv("PALADIN_JWT_SECRET")

	if v := os.Getenv("PALADIN_JWT_TTL"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("PALADIN_JWT_TTL must be a duration: %w", err)
		}
		cfg.JWTTTL = d
	}

	if v := os.Getenv("PALADIN_BCRYPT_COST"); v != "" {
		c, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("PALADIN_BCRYPT_COST must be an integer: %w", err)
		}
		cfg.BcryptCost = c
	}

	cfg.AdminEmail = os.Getenv("PALADIN_ADMIN_EMAIL")
	cfg.AdminPassword = os.Getenv("PALADIN_ADMIN_PASSWORD")

	if v := os.Getenv("PALADIN_AUTO_MIGRATE"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return nil, fmt.Errorf("PALADIN_AUTO_MIGRATE must be a boolean: %w", err)
		}
		cfg.AutoMigrate = b
	}

	if v := os.Getenv("PALADIN_QUOTA_LIMIT"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			return nil, fmt.Errorf("PALADIN_QUOTA_LIMIT must be an integer: %w", err)
		}
		cfg.QuotaLimit = n
	}

	if v := os.Getenv("PALADIN_QUOTA_WINDOW"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil {
			return nil, fmt.Errorf("PALADIN_QUOTA_WINDOW must be a duration: %w", err)
		}
		cfg.QuotaWindow = d
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("PALADIN_DATABASE_URL must be set")
	}
	if cfg.RedisURL == "" {
		return nil, fmt.Errorf("PALADIN_REDIS_URL must be set")
	}
	if len(cfg.JWTSecret) < minJWTSecretLen {
		return nil, fmt.Errorf("PALADIN_JWT_SECRET must be >= %d bytes", minJWTSecretLen)
	}
	if cfg.BcryptCost < minBcryptCost {
		return nil, fmt.Errorf("PALADIN_BCRYPT_COST must be >= %d", minBcryptCost)
	}

	return cfg, nil
}
