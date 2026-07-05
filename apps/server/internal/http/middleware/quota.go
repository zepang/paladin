package middleware

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"paladin/apps/server/internal/audit"
	"paladin/apps/server/internal/quota"

	"github.com/gin-gonic/gin"
)

const adminRole = "admin"

func QuotaGate(limiter *quota.Limiter, auditRec *audit.Recorder) gin.HandlerFunc {
	return func(c *gin.Context) {
		roles := rolesFromContext(c)
		for _, r := range roles {
			if r == adminRole {
				c.Next()
				return
			}
		}

		userKey := userSubjectFromContext(c)
		if userKey == "" {
			WriteError(c, http.StatusUnauthorized, "invalid_token", "subject required")
			return
		}

		dec, err := limiter.CheckAndConsume(c.Request.Context(), userKey)
		if err != nil {
			WriteError(c, http.StatusInternalServerError, "quota_error", "quota check failed")
			return
		}

		c.Header("X-RateLimit-Limit", strconv.Itoa(dec.Limit))
		remaining := dec.Limit - dec.Used
		if remaining < 0 {
			remaining = 0
		}
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))
		c.Header("X-RateLimit-Reset", strconv.FormatInt(dec.ResetAt.Unix(), 10))

		if !dec.Allowed {
			if auditRec != nil {
				uid := UserIDFromContext(c)
				_ = auditRec.Record(c.Request.Context(), audit.Record{
					UserID:    uid,
					Action:    "quota.exceeded",
					Status:    "failure",
					RequestIP: c.ClientIP(),
					Metadata: map[string]any{
						"ip":       c.ClientIP(),
						"used":     dec.Used,
						"limit":    dec.Limit,
						"reset_at": dec.ResetAt.Format(time.RFC3339),
					},
				})
			}
			WriteError(c, http.StatusTooManyRequests, "quota_exceeded", "AI call quota exceeded")
			return
		}
		c.Next()
	}
}

func rolesFromContext(c *gin.Context) []string {
	v, ok := c.Get(ctxRolesKey)
	if !ok {
		return nil
	}
	roles, _ := v.([]string)
	return roles
}

func userSubjectFromContext(c *gin.Context) string {
	v, ok := c.Get(ctxUserIDKey)
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return strings.TrimSpace(s)
}
