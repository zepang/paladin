package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"paladin/apps/server/internal/auth"
)

const mwSecret = "0123456789abcdef0123456789abcdef0123456789"

func mint(t *testing.T, roles []string) string {
	t.Helper()
	tok, err := auth.Issue(mwSecret, 1, "x@x.com", roles, time.Hour)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	return tok
}

func newMWRouter(requireRole ...string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/admin/health", Auth(mwSecret), func(c *gin.Context) {
		if len(requireRole) > 0 {
			RequireRole(requireRole[0])(c)
			if c.IsAborted() {
				return
			}
		}
		c.JSON(200, gin.H{"ok": true})
	})
	return r
}

func TestNoToken_401MissingToken(t *testing.T) {
	r := newMWRouter("admin")
	req := httptest.NewRequest(http.MethodGet, "/admin/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 401 {
		t.Fatalf("status = %d, want 401", w.Code)
	}
}

func TestBadToken_401InvalidToken(t *testing.T) {
	r := newMWRouter("admin")
	req := httptest.NewRequest(http.MethodGet, "/admin/health", nil)
	req.Header.Set("Authorization", "Bearer not.a.jwt")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 401 {
		t.Fatalf("status = %d, want 401", w.Code)
	}
}

func TestUserOnAdmin_403(t *testing.T) {
	r := newMWRouter("admin")
	tok := mint(t, []string{"user"})
	req := httptest.NewRequest(http.MethodGet, "/admin/health", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 403 {
		t.Fatalf("status = %d, want 403", w.Code)
	}
}

func TestAdminOnAdmin_200(t *testing.T) {
	r := newMWRouter("admin")
	tok := mint(t, []string{"admin"})
	req := httptest.NewRequest(http.MethodGet, "/admin/health", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d, want 200", w.Code)
	}
}

func TestRolesOrderIndependent(t *testing.T) {
	r := newMWRouter("admin")
	tok := mint(t, []string{"user", "admin", "other"})
	req := httptest.NewRequest(http.MethodGet, "/admin/health", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("status = %d, want 200 (admin in middle)", w.Code)
	}
}
