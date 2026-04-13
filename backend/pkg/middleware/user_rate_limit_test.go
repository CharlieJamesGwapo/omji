package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func init() {
	gin.SetMode(gin.TestMode)
}

// injectUserID returns a middleware that sets userID in the gin context,
// simulating what AuthMiddleware does after a valid JWT.
func injectUserID(uid uint) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("userID", uid)
		c.Next()
	}
}

func setupRouter(middlewares ...gin.HandlerFunc) *gin.Engine {
	r := gin.New()
	for _, m := range middlewares {
		r.Use(m)
	}
	r.GET("/test", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	return r
}

// TestUserRateLimit verifies that the limit is enforced per user:
// first two requests succeed and the third is rejected with 429.
func TestUserRateLimit(t *testing.T) {
	r := setupRouter(
		injectUserID(42),
		UserRateLimitMiddleware(2, time.Minute),
	)

	for i, wantStatus := range []int{200, 200, 429} {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != wantStatus {
			t.Errorf("request %d: got status %d, want %d", i+1, w.Code, wantStatus)
		}
	}
}

// TestUserRateLimit_FallsBackToIP verifies that when no userID is set in the
// context, the middleware falls back to client IP for keying.
func TestUserRateLimit_FallsBackToIP(t *testing.T) {
	// No injectUserID middleware — no userID in context.
	r := setupRouter(
		UserRateLimitMiddleware(2, time.Minute),
	)

	for i, wantStatus := range []int{200, 200, 429} {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.RemoteAddr = "10.0.0.1:9999"
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != wantStatus {
			t.Errorf("request %d: got status %d, want %d", i+1, w.Code, wantStatus)
		}
	}
}

// TestUserRateLimit_SeparateUsersIndependent verifies that two different users
// each maintain their own independent quota and do not interfere.
func TestUserRateLimit_SeparateUsersIndependent(t *testing.T) {
	rl := UserRateLimitMiddleware(2, time.Minute)

	makeRouter := func(uid uint) *gin.Engine {
		return setupRouter(injectUserID(uid), rl)
	}

	routerA := makeRouter(1)
	routerB := makeRouter(2)

	// Exhaust user 1's quota.
	for i, wantStatus := range []int{200, 200, 429} {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()
		routerA.ServeHTTP(w, req)
		if w.Code != wantStatus {
			t.Errorf("user1 request %d: got %d, want %d", i+1, w.Code, wantStatus)
		}
	}

	// User 2 should still have their full quota unaffected.
	for i, wantStatus := range []int{200, 200, 429} {
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		w := httptest.NewRecorder()
		routerB.ServeHTTP(w, req)
		if w.Code != wantStatus {
			t.Errorf("user2 request %d: got %d, want %d", i+1, w.Code, wantStatus)
		}
	}
}
