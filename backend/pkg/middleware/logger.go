package middleware

import (
	"log/slog"
	"time"

	"github.com/gin-gonic/gin"
)

func RequestLoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip health check logs (too noisy)
		if c.Request.URL.Path == "/health" {
			c.Next()
			return
		}

		start := time.Now()
		c.Next()
		latency := time.Since(start)

		slog.Info("request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"latency_ms", latency.Milliseconds(),
			"ip", c.ClientIP(),
			"user_agent", c.Request.UserAgent(),
		)
	}
}
