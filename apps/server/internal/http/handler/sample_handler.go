package handler

import (
	"github.com/gin-gonic/gin"

	"paladin/apps/server/internal/http/middleware"
)

type SampleHandler struct{}

func (s *SampleHandler) Me(c *gin.Context) {
	middleware.WriteError(c, 501, "not_implemented", "wired in plan 08-05")
}

func (s *SampleHandler) AdminHealth(c *gin.Context) {
	middleware.WriteError(c, 501, "not_implemented", "wired in plan 08-05")
}
