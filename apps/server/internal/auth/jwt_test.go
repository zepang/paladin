package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "0123456789abcdef0123456789abcdef0123456789"

func TestIssueVerifyRoundTrip(t *testing.T) {
	tok, err := Issue(testSecret, 42, "user@example.com", []string{"user", "admin"}, time.Hour)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	claims, err := Verify(testSecret, tok)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if claims.Subject != "42" {
		t.Errorf("sub = %q, want 42", claims.Subject)
	}
	if claims.Email != "user@example.com" {
		t.Errorf("email = %q", claims.Email)
	}
	if len(claims.Roles) != 2 || claims.Roles[0] != "user" || claims.Roles[1] != "admin" {
		t.Errorf("roles = %v", claims.Roles)
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	tok, err := Issue(testSecret, 1, "x@x.com", []string{"user"}, -time.Hour)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if _, err := Verify(testSecret, tok); err == nil {
		t.Fatal("Verify should reject expired token")
	}
}

func TestVerifyRejectsAlgNone(t *testing.T) {
	noneTok := jwt.NewWithClaims(jwt.SigningMethodNone, &Claims{
		Email: "x@x.com",
		Roles: []string{"user"},
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "1",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	signed, err := noneTok.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("sign none: %v", err)
	}
	if _, err := Verify(testSecret, signed); err == nil {
		t.Fatal("Verify should reject alg:none token")
	}
}

func TestVerifyRejectsWrongSecret(t *testing.T) {
	tok, err := Issue(testSecret, 1, "x@x.com", []string{"user"}, time.Hour)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if _, err := Verify(strings.Repeat("y", 40), tok); err == nil {
		t.Fatal("Verify should reject wrong-secret token")
	}
}

func TestClaimsShape(t *testing.T) {
	tok, _ := Issue(testSecret, 7, "shape@x.com", []string{"admin"}, time.Hour)
	parser := jwt.NewParser()
	parsed, _, err := parser.ParseUnverified(tok, &Claims{})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	claims := parsed.Claims.(*Claims)
	if claims.Subject != "7" {
		t.Errorf("sub = %q", claims.Subject)
	}
	if claims.Email != "shape@x.com" {
		t.Errorf("email = %q", claims.Email)
	}
	if claims.ExpiresAt == nil {
		t.Errorf("exp is nil")
	}
}
