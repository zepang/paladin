package middleware

import (
	"strconv"

	"paladin/apps/server/internal/audit"

	"github.com/gin-gonic/gin"
)

type ContextUserIDFunc func(c *gin.Context) *int64

func AuditRBAC(rec *audit.Recorder, userIDFromCtx ContextUserIDFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		if c.Writer.Status() != 403 {
			return
		}

		var uidPtr *int64
		if userIDFromCtx != nil {
			uidPtr = userIDFromCtx(c)
		}

		metadata := map[string]any{
			"ip":     c.ClientIP(),
			"path":   c.Request.URL.Path,
			"method": c.Request.Method,
		}

		ipStr := c.ClientIP()
		_ = rec.Record(c.Request.Context(), audit.Record{
			UserID:    uidPtr,
			Action:    "rbac.deny",
			Status:    "failure",
			RequestIP: ipStr,
			Metadata:  metadata,
		})
	}
}

func UserIDFromContext(c *gin.Context) *int64 {
	raw, exists := c.Get("userID")
	if !exists {
		return nil
	}
	switch v := raw.(type) {
	case int64:
		return &v
	case int:
		i := int64(v)
		return &i
	case string:
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return &n
		}
	}
	return nil
}
