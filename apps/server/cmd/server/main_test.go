package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPackagedModeIgnoresDotenv(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("PALADIN_DATABASE_URL=dotenv-lure\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	old, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(old) })
	t.Setenv("PALADIN_RUNTIME_MODE", "packaged")
	previous, existed := os.LookupEnv("PALADIN_DATABASE_URL")
	_ = os.Unsetenv("PALADIN_DATABASE_URL")
	t.Cleanup(func() {
		if existed {
			_ = os.Setenv("PALADIN_DATABASE_URL", previous)
		} else {
			_ = os.Unsetenv("PALADIN_DATABASE_URL")
		}
	})

	loadDotenvForRuntime()

	if got := os.Getenv("PALADIN_DATABASE_URL"); got != "" {
		t.Fatalf("packaged mode read dotenv lure: %q", got)
	}
}

func TestDevModePreservesDotenvConvenience(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("PALADIN_DATABASE_URL=dev-value\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	old, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(old) })
	t.Setenv("PALADIN_RUNTIME_MODE", "dev")
	previous, existed := os.LookupEnv("PALADIN_DATABASE_URL")
	_ = os.Unsetenv("PALADIN_DATABASE_URL")
	t.Cleanup(func() {
		if existed {
			_ = os.Setenv("PALADIN_DATABASE_URL", previous)
		} else {
			_ = os.Unsetenv("PALADIN_DATABASE_URL")
		}
	})

	loadDotenvForRuntime()

	if got := os.Getenv("PALADIN_DATABASE_URL"); got != "dev-value" {
		t.Fatalf("dev mode did not load dotenv: %q", got)
	}
}

func TestGoConfigReadinessReportsOnlyFieldCategoriesWithoutSentinelReflection(t *testing.T) {
	t.Setenv("PALADIN_RUNTIME_MODE", "packaged")
	t.Setenv("PALADIN_DATABASE_URL", "postgres://phase12-go-db-sentinel")
	t.Setenv("PALADIN_REDIS_URL", "redis://phase12-go-redis-sentinel")
	t.Setenv("PALADIN_JWT_SECRET", "phase12-go-jwt-sentinel")

	diagnostic := classifyGoConfigReadinessFromEnvironment()
	if diagnostic.Category != GoConfigReady {
		t.Fatalf("expected ready category, got %#v", diagnostic)
	}
	for _, sentinel := range []string{"phase12-go-db-sentinel", "phase12-go-redis-sentinel", "phase12-go-jwt-sentinel"} {
		if diagnostic.String() == sentinel || containsDiagnosticValue(diagnostic, sentinel) {
			t.Fatalf("D-02 must never reflect secret sentinel")
		}
	}
}

func TestGoConfigReadinessDistinguishesMissingInvalidAndDependencyDegraded(t *testing.T) {
	t.Setenv("PALADIN_RUNTIME_MODE", "packaged")
	t.Setenv("PALADIN_DATABASE_URL", "")
	t.Setenv("PALADIN_REDIS_URL", "redis://phase12-go-redis-sentinel")
	t.Setenv("PALADIN_JWT_SECRET", "short")

	diagnostic := classifyGoConfigReadinessFromEnvironment()
	if diagnostic.DatabaseURL != GoConfigFieldMissing || diagnostic.JWTSecret != GoConfigFieldInvalid {
		t.Fatalf("expected field-only missing/invalid categories, got %#v", diagnostic)
	}
	if diagnostic.Readiness != GoDependencyDegraded {
		t.Fatalf("packaged Go must remain nonblocking degraded, got %#v", diagnostic)
	}
}
