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
	t.Setenv("PALADIN_DATABASE_URL", "")

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
	t.Setenv("PALADIN_DATABASE_URL", "")

	loadDotenvForRuntime()

	if got := os.Getenv("PALADIN_DATABASE_URL"); got != "dev-value" {
		t.Fatalf("dev mode did not load dotenv: %q", got)
	}
}
