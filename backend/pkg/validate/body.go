// Package validate provides request validation helpers: body size limits,
// file upload sanitization, and struct validation wrappers.
package validate

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// BodySizeLimit returns a Gin middleware that rejects requests whose body
// exceeds maxBytes. Enforcement uses http.MaxBytesReader, which causes the
// next Read to return an error once the limit is exceeded — handlers
// downstream see the truncation as an EOF-style error and should return 413.
func BodySizeLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}
