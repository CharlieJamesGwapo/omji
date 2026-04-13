package handlers

import (
	"net/http"
	"oneride/pkg/auth"

	"github.com/gin-gonic/gin"
)

// IssueWSTicket issues a one-time, 30-second WebSocket upgrade ticket.
//
// It reads userID, email, and role from the gin context (populated by
// AuthMiddleware) and returns {"ticket": key, "expires_in": 30}.
//
// Returns 401 if the authenticated userID is not present in the context.
func IssueWSTicket(c *gin.Context) {
	rawID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	userID, ok := rawID.(uint)
	if !ok || userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	email, _ := c.Get("email")
	role, _ := c.Get("role")
	emailStr, _ := email.(string)
	roleStr, _ := role.(string)

	key, err := auth.IssueTicket(userID, emailStr, roleStr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not issue ticket"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ticket":     key,
		"expires_in": 30,
	})
}
