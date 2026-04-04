package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const testJWTSecret = "test-secret-for-unit-tests"

func TestMain(m *testing.M) {
	os.Setenv("JWT_SECRET", testJWTSecret)
	gin.SetMode(gin.TestMode)
	os.Exit(m.Run())
}

// helper: generate a valid JWT for testing
func generateTestToken(userID uint, email, role string) string {
	claims := jwt.MapClaims{
		"user_id": float64(userID),
		"email":   email,
		"role":    role,
		"exp":     time.Now().Add(time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	str, err := token.SignedString([]byte(testJWTSecret))
	if err != nil {
		panic(err)
	}
	return str
}

func TestRateLimitMiddleware(t *testing.T) {
	t.Run("request within limit returns 200", func(t *testing.T) {
		w := httptest.NewRecorder()
		_, r := gin.CreateTestContext(w)

		r.Use(RateLimitMiddleware(5))
		r.GET("/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})

		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.RemoteAddr = "10.0.0.1:12345"
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
		}
	})

	t.Run("exceeding limit returns 429", func(t *testing.T) {
		_, r := gin.CreateTestContext(httptest.NewRecorder())

		r.Use(RateLimitMiddleware(3))
		r.GET("/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})

		// Send 3 requests to fill the limit
		for i := 0; i < 3; i++ {
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/test", nil)
			req.RemoteAddr = "10.0.0.2:12345"
			r.ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				t.Fatalf("request %d: status = %d, want %d", i+1, w.Code, http.StatusOK)
			}
		}

		// 4th request should be rate limited
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/test", nil)
		req.RemoteAddr = "10.0.0.2:12345"
		r.ServeHTTP(w, req)

		if w.Code != http.StatusTooManyRequests {
			t.Errorf("status = %d, want %d", w.Code, http.StatusTooManyRequests)
		}
	})

	t.Run("different IPs have separate limits", func(t *testing.T) {
		_, r := gin.CreateTestContext(httptest.NewRecorder())

		r.Use(RateLimitMiddleware(1))
		r.GET("/test", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})

		// First IP uses its quota
		w1 := httptest.NewRecorder()
		req1 := httptest.NewRequest(http.MethodGet, "/test", nil)
		req1.RemoteAddr = "10.0.0.3:12345"
		r.ServeHTTP(w1, req1)
		if w1.Code != http.StatusOK {
			t.Fatalf("IP1 first request: status = %d, want %d", w1.Code, http.StatusOK)
		}

		// Second IP should still be allowed
		w2 := httptest.NewRecorder()
		req2 := httptest.NewRequest(http.MethodGet, "/test", nil)
		req2.RemoteAddr = "10.0.0.4:12345"
		r.ServeHTTP(w2, req2)
		if w2.Code != http.StatusOK {
			t.Errorf("IP2 first request: status = %d, want %d", w2.Code, http.StatusOK)
		}
	})
}

func TestAuthMiddleware(t *testing.T) {
	setupRouter := func() *gin.Engine {
		_, r := gin.CreateTestContext(httptest.NewRecorder())
		r.Use(AuthMiddleware())
		r.GET("/protected", func(c *gin.Context) {
			userID, _ := c.Get("userID")
			email, _ := c.Get("email")
			role, _ := c.Get("role")
			c.JSON(http.StatusOK, gin.H{
				"user_id": userID,
				"email":   email,
				"role":    role,
			})
		})
		return r
	}

	t.Run("valid token passes and sets context", func(t *testing.T) {
		r := setupRouter()
		token := generateTestToken(42, "user@oneride.app", "user")

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
		}
	})

	t.Run("missing token returns 401", func(t *testing.T) {
		r := setupRouter()

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
		}
	})

	t.Run("invalid token returns 401", func(t *testing.T) {
		r := setupRouter()

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Header.Set("Authorization", "Bearer invalid.token.here")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
		}
	})

	t.Run("malformed authorization header returns 401", func(t *testing.T) {
		r := setupRouter()

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Header.Set("Authorization", "NotBearer sometoken")
		r.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
		}
	})

	t.Run("token from query param works", func(t *testing.T) {
		r := setupRouter()
		token := generateTestToken(99, "ws@oneride.app", "driver")

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/protected?token="+token, nil)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
		}
	})

	t.Run("expired token returns 401", func(t *testing.T) {
		r := setupRouter()

		claims := jwt.MapClaims{
			"user_id": float64(1),
			"email":   "expired@oneride.app",
			"role":    "user",
			"exp":     time.Now().Add(-time.Hour).Unix(),
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		expiredToken, _ := tok.SignedString([]byte(testJWTSecret))

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+expiredToken)
		r.ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
		}
	})
}

func TestAuthRateLimitMiddleware(t *testing.T) {
	t.Run("stricter rate limit enforced", func(t *testing.T) {
		_, r := gin.CreateTestContext(httptest.NewRecorder())

		r.Use(AuthRateLimitMiddleware(2))
		r.POST("/auth/login", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})

		// Send 2 requests to fill the limit
		for i := 0; i < 2; i++ {
			w := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
			req.RemoteAddr = "10.0.0.5:12345"
			r.ServeHTTP(w, req)
			if w.Code != http.StatusOK {
				t.Fatalf("request %d: status = %d, want %d", i+1, w.Code, http.StatusOK)
			}
		}

		// 3rd request should be rate limited
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
		req.RemoteAddr = "10.0.0.5:12345"
		r.ServeHTTP(w, req)

		if w.Code != http.StatusTooManyRequests {
			t.Errorf("status = %d, want %d", w.Code, http.StatusTooManyRequests)
		}
	})

	t.Run("allows requests under limit", func(t *testing.T) {
		_, r := gin.CreateTestContext(httptest.NewRecorder())

		r.Use(AuthRateLimitMiddleware(20))
		r.POST("/auth/login", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})

		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/auth/login", nil)
		req.RemoteAddr = "10.0.0.6:12345"
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
		}
	})
}
