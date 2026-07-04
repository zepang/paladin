package middleware

import (
	"log"
	"runtime/debug"

	"github.com/gin-gonic/gin"
)

func Recovery(logger *log.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				if logger != nil {
					logger.Printf("panic recovered: %v\n%s", r, debug.Stack())
				}
				WriteError(c, 500, "internal_error", "internal server error")
			}
		}()
		c.Next()
	}
}
