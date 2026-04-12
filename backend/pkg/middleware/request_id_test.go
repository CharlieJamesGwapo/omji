package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRequestIDMiddleware_GeneratesIDWhenMissing(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestIDMiddleware())
	r.GET("/", func(c *gin.Context) {
		id, _ := c.Get("requestID")
		if id == nil || id.(string) == "" {
			t.Fatal("expected requestID in context")
		}
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/", nil)
	r.ServeHTTP(w, req)

	if got := w.Header().Get("X-Request-ID"); got == "" {
		t.Fatal("expected X-Request-ID header on response")
	}
}

func TestRequestIDMiddleware_PropagatesIncomingID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(RequestIDMiddleware())
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/", nil)
	req.Header.Set("X-Request-ID", "client-supplied-id")
	r.ServeHTTP(w, req)

	if got := w.Header().Get("X-Request-ID"); got != "client-supplied-id" {
		t.Fatalf("expected passthrough, got %q", got)
	}
}
