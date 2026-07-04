package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"paladin/apps/server/internal/auth"
)

const ctxUserIDKey = "userID"
const ctxRolesKey = "roles"

func Auth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if h == "" {
			WriteError(c, http.StatusUnauthorized, "missing_token", "authorization header required")
			return
		}
		const prefix = "Bearer "
		if !strings.HasPrefix(h, prefix) {
			WriteError(c, http.StatusUnauthorized, "invalid_token", "bearer token required")
			return
		}
		tok := strings.TrimSpace(strings.TrimPrefix(h, prefix))
		if tok == "" {
			WriteError(c, http.StatusUnauthorized, "invalid_token", "token required")
			return
		}
		claims, err := auth.Verify(secret, tok)
		if err != nil {
			WriteError(c, http.StatusUnauthorized, "invalid_token", "invalid or expired token")
			return
		}
		c.Set(ctxUserIDKey, claims.Subject)
		c.Set(ctxRolesKey, claims.Roles)
		c.Next()
	}
}

func RequireRole(want string) gin.HandlerFunc {
	return func(c *gin.Context) {
		v, ok := c.Get(ctxRolesKey)
		if !ok {
			WriteError(c, http.StatusForbidden, "forbidden", "insufficient role")
			return
		}
		roles, _ := v.([]string)
		for _, r := range roles {
			if r == want {
				c.Next()
				return
			}
		}
		WriteError(c, http.StatusForbidden, "forbidden", "insufficient role")
	}
}
