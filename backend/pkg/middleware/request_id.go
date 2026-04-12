package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// RequestIDMiddleware attaches a unique request ID to every request.
// Honors an inbound X-Request-ID if present (for trace correlation); otherwise
// generates a new UUID. The ID is stored in the Gin context as "requestID" and
// echoed on the response.
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" {
			id = uuid.NewString()
		}
		c.Set("requestID", id)
		c.Writer.Header().Set("X-Request-ID", id)
		c.Next()
	}
}
