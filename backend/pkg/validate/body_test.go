package validate

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestBodySizeLimit_Rejects(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(BodySizeLimit(16))
	r.POST("/", func(c *gin.Context) {
		body := make([]byte, 1024)
		n, err := c.Request.Body.Read(body)
		if err != nil && err.Error() != "EOF" {
			c.String(http.StatusRequestEntityTooLarge, "too big")
			return
		}
		c.String(http.StatusOK, string(body[:n]))
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/", bytes.NewBufferString(strings.Repeat("x", 100)))
	r.ServeHTTP(w, req)

	if w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d", w.Code)
	}
}

func TestBodySizeLimit_Allows(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(BodySizeLimit(1024))
	r.POST("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/", bytes.NewBufferString("small"))
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
