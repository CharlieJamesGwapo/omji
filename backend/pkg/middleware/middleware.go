package middleware

import (
	"net/http"
	"oneride/config"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Simple in-memory rate limiter
type rateLimiter struct {
	mu       sync.Mutex
	requests map[string][]time.Time
	limit    int
	window   time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	rl := &rateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
	// Cleanup old entries every minute
	go func() {
		for {
			time.Sleep(time.Minute)
			rl.mu.Lock()
			now := time.Now()
			for key, times := range rl.requests {
				valid := times[:0]
				for _, t := range times {
					if now.Sub(t) < rl.window {
						valid = append(valid, t)
					}
				}
				if len(valid) == 0 {
					delete(rl.requests, key)
				} else {
					rl.requests[key] = valid
				}
			}
			rl.mu.Unlock()
		}
	}()
	return rl
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	// Filter to only requests within the window
	times := rl.requests[key]
	valid := times[:0]
	for _, t := range times {
		if now.Sub(t) < rl.window {
			valid = append(valid, t)
		}
	}
	if len(valid) >= rl.limit {
		rl.requests[key] = valid
		return false
	}
	rl.requests[key] = append(valid, now)
	return true
}

// RateLimitMiddleware limits requests per IP address
func RateLimitMiddleware(requestsPerMinute int) gin.HandlerFunc {
	limiter := newRateLimiter(requestsPerMinute, time.Minute)
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !limiter.allow(ip) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many requests, please try again later"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func getJWTSecret() string {
	return config.GetJWTSecret()
}

func CORSMiddleware() gin.HandlerFunc {
	// Parse allowed origins once at startup
	originsEnv := os.Getenv("CORS_ORIGIN")
	if originsEnv == "" {
		originsEnv = os.Getenv("ALLOWED_ORIGINS")
	}
	if originsEnv == "" {
		originsEnv = "https://oneride-admin.onrender.com"
	}

	allowedOrigins := make(map[string]bool)
	for _, o := range strings.Split(originsEnv, ",") {
		trimmed := strings.TrimSpace(o)
		if trimmed != "" {
			allowedOrigins[trimmed] = true
		}
	}
	// Check for wildcard
	allowAll := allowedOrigins["*"]

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		if allowAll || allowedOrigins[origin] {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, Pragma, Expires")
			c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")
			c.Writer.Header().Set("Vary", "Origin")
		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			if t := c.Query("token"); t != "" {
				authHeader = "Bearer " + t
			}
		}
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization format"})
			c.Abort()
			return
		}

		parser := jwt.NewParser(
			jwt.WithValidMethods([]string{"HS256"}),
			jwt.WithIssuer("oneride-api"),
		)

		token, err := parser.Parse(parts[1], func(t *jwt.Token) (interface{}, error) {
			return []byte(getJWTSecret()), nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid claims"})
			c.Abort()
			return
		}

		// Require exp claim explicitly (WithExpirationRequired not available in v5.0.0)
		if _, hasExp := claims["exp"]; !hasExp {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token missing expiration"})
			c.Abort()
			return
		}

		subStr, _ := claims["sub"].(string)
		if subStr == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid subject"})
			c.Abort()
			return
		}
		uid64, err := strconv.ParseUint(subStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid subject format"})
			c.Abort()
			return
		}

		role, _ := claims["role"].(string)
		email, _ := claims["email"].(string)
		tverFloat, _ := claims["tver"].(float64)

		c.Set("userID", uint(uid64))
		c.Set("email", email)
		c.Set("role", role)
		c.Set("tokenVersion", int(tverFloat))
		c.Set("jti", claims["jti"])

		c.Next()
	}
}

func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists || role != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Admin access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func DriverMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists || (role != "driver" && role != "admin") {
			c.JSON(http.StatusForbidden, gin.H{"error": "Driver access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("X-Content-Type-Options", "nosniff")
		c.Writer.Header().Set("X-Frame-Options", "DENY")
		c.Writer.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		c.Writer.Header().Set("X-XSS-Protection", "1; mode=block")
		c.Writer.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}

// AuthRateLimitMiddleware applies a stricter rate limit to auth routes (brute force protection)
func AuthRateLimitMiddleware(requestsPerMinute int) gin.HandlerFunc {
	limiter := newRateLimiter(requestsPerMinute, time.Minute)
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !limiter.allow(ip) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many authentication attempts, please try again later"})
			c.Abort()
			return
		}
		c.Next()
	}
}
