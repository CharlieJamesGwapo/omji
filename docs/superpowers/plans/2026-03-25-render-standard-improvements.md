# Render Standard Plan Backend Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the OMJI Go/Gin backend for production on Render Standard — graceful shutdown, health checks, security, persistent uploads, structured logging.

**Architecture:** All changes use Go standard library only (no new dependencies). Middleware-based security and logging. Persistent disk for file uploads. Graceful shutdown via `http.Server` + OS signals.

**Tech Stack:** Go 1.23, Gin v1.9.1, GORM, PostgreSQL (Supabase), `log/slog`, `net/http`, `os/signal`

**Spec:** `docs/superpowers/specs/2026-03-25-render-standard-improvements-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/cmd/main.go` | Modify | Graceful shutdown, health check, middleware wiring, upload dir config |
| `backend/pkg/middleware/middleware.go` | Modify | Multi-origin CORS, security headers, auth rate limiter |
| `backend/pkg/middleware/logger.go` | Create | Structured request logging middleware (slog) |
| `backend/pkg/handlers/handlers.go` | Modify | WebSocket CloseAll methods, upload dir from env (3 locations) |
| `backend/pkg/db/database.go` | Modify | Remove plaintext password logging, use slog |
| `backend/Dockerfile` | Modify | Add upload mount point directory |
| `backend/render.yaml` | Modify | ALLOWED_ORIGINS, disk config, UPLOAD_DIR env var |

---

## Task 1: Structured Request Logging Middleware

**Files:**
- Create: `backend/pkg/middleware/logger.go`

This is done first because all later tasks benefit from seeing structured request logs.

- [ ] **Step 1: Create `logger.go` with `RequestLoggerMiddleware`**

```go
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
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/dev3/omji/backend && go build ./pkg/middleware/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/pkg/middleware/logger.go
git commit -m "feat: add structured request logging middleware (slog)"
```

---

## Task 2: Security Headers + Multi-Origin CORS + Auth Rate Limiter

**Files:**
- Modify: `backend/pkg/middleware/middleware.go`

- [ ] **Step 1: Add `SecurityHeadersMiddleware` function**

Add after the `DriverMiddleware` function (after line 183):

```go
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
```

- [ ] **Step 2: Update `CORSMiddleware` to support multi-origin whitelist**

Replace the current `CORSMiddleware` function (lines 92-115) with:

```go
func CORSMiddleware() gin.HandlerFunc {
	// Parse allowed origins once at startup
	originsEnv := os.Getenv("CORS_ORIGIN")
	if originsEnv == "" {
		originsEnv = os.Getenv("ALLOWED_ORIGINS")
	}
	if originsEnv == "" {
		originsEnv = "https://omji-admin.onrender.com"
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
```

- [ ] **Step 3: Add `AuthRateLimitMiddleware` function**

Add after `SecurityHeadersMiddleware`:

```go
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
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/dev3/omji/backend && go build ./pkg/middleware/`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/middleware/middleware.go
git commit -m "feat: security headers, multi-origin CORS, auth rate limiter"
```

---

## Task 3: WebSocket CloseAll Methods

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:3443-3522`

Add `CloseAll` methods to both tracker types so graceful shutdown can cleanly close WebSocket connections.

- [ ] **Step 1: Add `CloseAll` to `RideTracker`**

Add after the `Broadcast` method (after line 3485):

```go
// CloseAll closes all tracked WebSocket connections (used during graceful shutdown)
func (t *RideTracker) CloseAll() {
	t.mu.Lock()
	defer t.mu.Unlock()
	for rideID, conns := range t.rides {
		for _, conn := range conns {
			conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
			conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutting down"))
			conn.Close()
		}
		delete(t.rides, rideID)
	}
}
```

- [ ] **Step 2: Add `CloseAll` to `DriverTracker`**

Add after the `Send` method (after line 3522):

```go
// CloseAll closes all tracked driver WebSocket connections (used during graceful shutdown)
func (dt *DriverTracker) CloseAll() {
	dt.mu.Lock()
	defer dt.mu.Unlock()
	for driverID, conn := range dt.conns {
		conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutting down"))
		conn.Close()
		delete(dt.conns, driverID)
	}
}
```

- [ ] **Step 3: Export the tracker variables for use from main.go**

The trackers are currently lowercase (`tracker`, `driverTracker`) — package-private. We need to either:
- Export them: rename to `Tracker` and `DriverTrackerInstance`
- Or add a package-level `CloseAllWebSockets()` function (cleaner)

Add after the `CloseAll` methods:

```go
// CloseAllWebSockets closes all WebSocket connections (called during graceful shutdown)
func CloseAllWebSockets() {
	tracker.CloseAll()
	driverTracker.CloseAll()
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/dev3/omji/backend && go build ./pkg/handlers/`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "feat: add WebSocket CloseAll for graceful shutdown"
```

---

## Task 4: Upload Dir from Environment Variable

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:865-873, 1548-1560, 4278-4294`

- [ ] **Step 1: Add `getUploadDir` helper function**

Add near the top of handlers.go (after the import block):

```go
// getUploadDir returns the upload directory from UPLOAD_DIR env var, defaulting to "./uploads"
func getUploadDir() string {
	dir := os.Getenv("UPLOAD_DIR")
	if dir == "" {
		return "./uploads"
	}
	return dir
}
```

- [ ] **Step 2: Update delivery item photo upload (line 865-873)**

Replace:
```go
os.MkdirAll("uploads", os.ModePerm)
filename := strconv.FormatUint(uint64(userID), 10) + "_" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "_" + filepath.Base(file.Filename)
savePath := "uploads/" + filename
```

With:
```go
uploadDir := getUploadDir()
os.MkdirAll(uploadDir, os.ModePerm)
filename := strconv.FormatUint(uint64(userID), 10) + "_" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "_" + filepath.Base(file.Filename)
savePath := filepath.Join(uploadDir, filename)
```

And update the URL construction (line 873):
```go
// Before:
itemPhoto = baseURL + "/uploads/" + filename
// After (no change needed — URL path stays /uploads/ regardless of disk location):
itemPhoto = baseURL + "/uploads/" + filename
```

- [ ] **Step 3: Update driver document uploads (line 1556-1560)**

Replace:
```go
os.MkdirAll("uploads", os.ModePerm)
filename := strconv.FormatUint(uint64(userID), 10) + "_" + field + "_" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "_" + filepath.Base(file.Filename)
savePath := "uploads/" + filename
```

With:
```go
uploadDir := getUploadDir()
os.MkdirAll(uploadDir, os.ModePerm)
filename := strconv.FormatUint(uint64(userID), 10) + "_" + field + "_" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "_" + filepath.Base(file.Filename)
savePath := filepath.Join(uploadDir, filename)
```

- [ ] **Step 4: Update QR code uploads (line 4278-4281 and 4294)**

Replace:
```go
uploadPath := filepath.Join("uploads", "qr", filename)
// Ensure directory exists
os.MkdirAll(filepath.Join("uploads", "qr"), 0755)
```

With:
```go
uploadDir := getUploadDir()
uploadPath := filepath.Join(uploadDir, "qr", filename)
// Ensure directory exists
os.MkdirAll(filepath.Join(uploadDir, "qr"), 0755)
```

**Also update the URL construction** (line 4294) — the current code uses `uploadPath` directly in the URL which would produce a broken URL with an absolute disk path:

Replace:
```go
imageURL := fmt.Sprintf("%s/%s", baseURL, uploadPath)
```

With:
```go
imageURL := fmt.Sprintf("%s/uploads/qr/%s", baseURL, filename)
```

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/dev3/omji/backend && go build ./pkg/handlers/`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "feat: use UPLOAD_DIR env var for file uploads (persistent disk support)"
```

---

## Task 5: Remove Admin Password Plaintext Logging

**Files:**
- Modify: `backend/pkg/db/database.go:56-94`

- [ ] **Step 1: Add `log/slog` to imports**

Add `"log/slog"` to the import block in `database.go`.

- [ ] **Step 2: Update seedData admin logging**

Replace lines 89-93:
```go
		} else if autoGenerated {
			log.Printf("✅ Default admin user created (username: admin, password: %s) — change this immediately!", adminPassword)
		} else {
			log.Println("✅ Default admin user created with ADMIN_PASSWORD from env")
		}
```

With:
```go
		} else if autoGenerated {
			slog.Warn("Default admin user created with auto-generated password. Set ADMIN_PASSWORD env var and redeploy to use a known password.")
		} else {
			slog.Info("Default admin user created with password from ADMIN_PASSWORD env var")
		}
```

- [ ] **Step 3: Update other log calls in database.go to slog**

Replace non-Fatal log calls:
- `log.Println("Database connected successfully")` → `slog.Info("Database connected successfully")`
- `log.Println("✅ Database migrations completed")` → `slog.Info("Database migrations completed")`
- `log.Printf("Failed to create admin user: %v", err)` → `slog.Error("Failed to create admin user", "error", err)`
- `log.Println("✅ Sample stores created")` → `slog.Info("Sample stores created")`
- `log.Printf("Failed to create sample store %q: %v", ...)` → `slog.Error("Failed to create sample store", "store", store.Name, "error", err)`
- `log.Println("✅ Sample promos created")` → `slog.Info("Sample promos created")`
- `log.Printf("Failed to create sample promo %q: %v", ...)` → `slog.Error("Failed to create sample promo", "promo", promo.Code, "error", err)`

Keep `log.Fatalf` calls as-is (slog has no Fatal level).

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/dev3/omji/backend && go build ./pkg/db/`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/db/database.go
git commit -m "fix: remove admin password plaintext logging, migrate to slog"
```

---

## Task 6: Graceful Shutdown + Health Check + Wire All Middleware

**Files:**
- Modify: `backend/cmd/main.go`

This is the main integration task — wires everything together.

- [ ] **Step 1: Update imports**

Replace the import block with:

```go
import (
	"context"
	"database/sql"
	"log"
	"log/slog"
	"net/http"
	"omji/config"
	"omji/pkg/db"
	"omji/pkg/handlers"
	"omji/pkg/middleware"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)
```

- [ ] **Step 2: Add `startTime` and `sqlDB` variables at package level**

Add before the `main` function:

```go
var (
	startTime time.Time
	sqlDB     *sql.DB
)
```

- [ ] **Step 3: Rewrite the main function — initialization section**

Replace lines 14-31 (everything before route definitions) with:

```go
func main() {
	startTime = time.Now()

	// Configure slog for JSON output in production
	if os.Getenv("GIN_MODE") == "release" {
		slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	}

	// Load configuration
	cfg := config.LoadConfig()

	// Validate JWT_SECRET is set (will log.Fatal if missing)
	config.GetJWTSecret()

	// Initialize database
	database := db.InitDB(cfg)
	db.MigrateDB(database)

	// Store sql.DB reference for health checks and shutdown
	var err error
	sqlDB, err = database.DB()
	if err != nil {
		log.Fatalf("Failed to get sql.DB: %v", err)
	}

	// Create Gin router (gin.New instead of gin.Default to avoid duplicate logging)
	router := gin.New()
	router.Use(gin.Recovery())

	// Middleware stack
	router.Use(middleware.SecurityHeadersMiddleware())
	router.Use(middleware.CORSMiddleware())
	router.Use(middleware.RateLimitMiddleware(120))
	router.Use(middleware.RequestLoggerMiddleware())
```

- [ ] **Step 4: Update upload directory setup and health check**

Replace lines 34-43 (uploads dir + health endpoint) with:

```go
	// Upload directory (persistent disk on Render, local ./uploads in dev)
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}
	os.MkdirAll(uploadDir, 0755)
	router.Static("/uploads", uploadDir)

	// Health check with DB validation
	router.GET("/health", func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		dbStatus := "connected"
		statusCode := http.StatusOK
		if err := sqlDB.PingContext(ctx); err != nil {
			dbStatus = "disconnected"
			statusCode = http.StatusServiceUnavailable
		}

		c.JSON(statusCode, gin.H{
			"status": map[bool]string{true: "healthy", false: "unhealthy"}[statusCode == http.StatusOK],
			"db":     dbStatus,
			"uptime": time.Since(startTime).Round(time.Second).String(),
		})
	})
```

- [ ] **Step 5: Add auth rate limiter to public routes**

Replace lines 46-53 (public route group) with:

```go
	// Public routes (no auth required)
	public := router.Group("/api/v1/public")
	public.Use(middleware.AuthRateLimitMiddleware(20))
	{
		// Auth routes
		public.POST("/auth/register", handlers.Register(database))
		public.POST("/auth/login", handlers.Login(database))
		public.POST("/auth/verify-otp", handlers.VerifyOTP(database))
		public.POST("/auth/resend-otp", handlers.ResendOTP(database))
	}
```

- [ ] **Step 6: Replace server startup with graceful shutdown**

Replace lines 224-234 (the current server start block) with:

```go
	// Start server with graceful shutdown
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: router,
	}

	// Start server in goroutine
	go func() {
		slog.Info("OMJI Backend starting", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("Shutting down server...")

	// Close all WebSocket connections first
	handlers.CloseAllWebSockets()
	slog.Info("WebSocket connections closed")

	// Give in-flight requests up to 10 seconds to complete
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("Server forced shutdown", "error", err)
	}

	// Close database connection
	if err := sqlDB.Close(); err != nil {
		slog.Error("Database close error", "error", err)
	}

	slog.Info("Server exited cleanly")
```

- [ ] **Step 7: Verify it compiles**

Run: `cd /Users/dev3/omji/backend && go build -o /dev/null ./cmd/main.go`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add backend/cmd/main.go
git commit -m "feat: graceful shutdown, health check with DB ping, wire security middleware"
```

---

## Task 7: Dockerfile + render.yaml Updates

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `backend/render.yaml`

- [ ] **Step 1: Update Dockerfile — add upload mount point**

Replace the runtime stage section (lines 23-38) with:

```dockerfile
# Runtime stage
FROM alpine:latest

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Create upload directory (Render persistent disk mounts here)
RUN mkdir -p /var/data/uploads

# Copy binary from builder
COPY --from=builder /app/bin/server .

# Expose port
EXPOSE 8080

# Run the application
CMD ["./server"]
```

- [ ] **Step 2: Update render.yaml**

Replace the entire file with:

```yaml
services:
  - type: web
    name: omji-backend
    env: go
    buildCommand: go build -o bin/server cmd/main.go
    startCommand: ./bin/server
    healthCheckPath: /health
    disk:
      name: uploads-data
      mountPath: /var/data/uploads
      sizeGB: 1
    envVars:
      - key: PORT
        value: 8080
      - key: GIN_MODE
        value: release
      - key: DATABASE_URL
        sync: false
      - key: JWT_SECRET
        generateValue: true
      - key: ALLOWED_ORIGINS
        value: "https://omji-admin.onrender.com"
      - key: UPLOAD_DIR
        value: "/var/data/uploads"
```

- [ ] **Step 3: Commit**

```bash
git add backend/Dockerfile backend/render.yaml
git commit -m "feat: Dockerfile upload dir, render.yaml disk + security config"
```

---

## Task 8: Final Build Verification

- [ ] **Step 1: Full build test**

Run: `cd /Users/dev3/omji/backend && go build -o /dev/null ./cmd/main.go`
Expected: No errors

- [ ] **Step 2: Verify no import issues**

Run: `cd /Users/dev3/omji/backend && go vet ./...`
Expected: No errors (or only pre-existing warnings)

- [ ] **Step 3: Final commit if any fixes needed**

---

## Post-Deploy: Render Dashboard Manual Steps

After the code is deployed, configure these in the Render dashboard:

- [ ] **Step 1:** Go to your service → Settings → Health Checks → Set path to `/health`
- [ ] **Step 2:** Go to Environment → Verify `ALLOWED_ORIGINS` = `https://omji-admin.onrender.com`
- [ ] **Step 3:** Go to Environment → Verify `UPLOAD_DIR` = `/var/data/uploads`
- [ ] **Step 4:** Go to Disks → Verify persistent disk is attached at `/var/data/uploads`
- [ ] **Step 5:** Go to Settings → Edge Caching → Set Cache Profile to "All Cacheable Content"
- [ ] **Step 6:** Test health check: `curl https://omji-backend.onrender.com/health`
- [ ] **Step 7:** Test security headers: `curl -I https://omji-backend.onrender.com/health`
- [ ] **Step 8:** Verify zero downtime: trigger a manual deploy, check no 502 errors during rollout
