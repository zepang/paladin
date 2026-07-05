package handler

import (
	"github.com/gin-gonic/gin"
)

type SampleHandler struct{}

func (s *SampleHandler) Me(c *gin.Context) {
	uid, _ := c.Get("userID")
	roles, _ := c.Get("roles")
	c.JSON(200, gin.H{"user_id": uid, "roles": roles})
}

func (s *SampleHandler) AdminHealth(c *gin.Context) {
	c.JSON(200, gin.H{"status": "ok", "admin": true})
}

func (s *SampleHandler) MockAI(c *gin.Context) {
	uid, _ := c.Get("userID")
	c.JSON(200, gin.H{"status": "ok", "model": "mock", "user_id": uid})
}
