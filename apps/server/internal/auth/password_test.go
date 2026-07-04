package auth

import (
	"testing"
)

func TestHashIsNotInput(t *testing.T) {
	pw := "supersecret123"
	h, err := HashPassword(pw, 10)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if h == pw {
		t.Error("hash equals input password")
	}
	if len(h) < 30 {
		t.Errorf("hash too short: %d", len(h))
	}
}

func TestCompareMatch(t *testing.T) {
	pw := "correct-horse-battery"
	h, _ := HashPassword(pw, 10)
	if err := ComparePassword(h, pw); err != nil {
		t.Errorf("ComparePassword match failed: %v", err)
	}
}

func TestCompareMismatch(t *testing.T) {
	h, _ := HashPassword("right-password", 10)
	if err := ComparePassword(h, "wrong-password"); err == nil {
		t.Error("ComparePassword should fail on mismatch")
	}
	if err := ComparePassword(h, "wrong-password"); err != ErrInvalidCredentials {
		t.Errorf("err = %v, want ErrInvalidCredentials", err)
	}
}
