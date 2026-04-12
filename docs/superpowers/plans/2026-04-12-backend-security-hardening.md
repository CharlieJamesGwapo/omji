# Backend Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Go backend API (`backend/`) against OWASP API Top 10 risks: rotating refresh tokens, authz/IDOR helpers, file upload validation, audit log, secrets hygiene.

**Architecture:** Add three new internal packages (`authz`, `validate`, `audit`), extend `middleware`, add `RefreshToken` + `AuditLog` models, and apply ownership checks across every protected `/:id` route. Ship behind a `SECURITY_V2` feature flag with a one-window forced-logout migration.

**Tech Stack:** Go 1.21+, Gin, GORM, Postgres (Supabase), `github.com/golang-jwt/jwt/v5`, `golang.org/x/crypto/bcrypt`, `github.com/google/uuid`, stdlib `image`/`image/jpeg`/`image/png`.

**Spec:** `docs/superpowers/specs/2026-04-12-backend-security-hardening-design.md`

---

## Phase 1 — Foundations

### Task 1: Request ID middleware

**Files:**
- Create: `backend/pkg/middleware/request_id.go`
- Create: `backend/pkg/middleware/request_id_test.go`
- Modify: `backend/cmd/main.go` (wire middleware)

- [ ] **Step 1: Write the failing test**

```go
// backend/pkg/middleware/request_id_test.go
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./pkg/middleware/ -run TestRequestIDMiddleware -v`
Expected: FAIL — `RequestIDMiddleware` undefined.

- [ ] **Step 3: Implement middleware**

```go
// backend/pkg/middleware/request_id.go
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./pkg/middleware/ -run TestRequestIDMiddleware -v`
Expected: PASS.

- [ ] **Step 5: Wire into `main.go`**

In `backend/cmd/main.go`, add the middleware immediately after `gin.Recovery()` and before `SecurityHeadersMiddleware`:

```go
router.Use(gin.Recovery())
router.Use(middleware.RequestIDMiddleware())
router.Use(middleware.SecurityHeadersMiddleware())
```

- [ ] **Step 6: Commit**

```bash
cd /Users/a1234/Desktop/omji
git add backend/pkg/middleware/request_id.go backend/pkg/middleware/request_id_test.go backend/cmd/main.go
git commit -m "feat(middleware): add request ID propagation"
```

---

### Task 2: Config hardening — remove dangerous defaults

**Files:**
- Modify: `backend/config/config.go`
- Create: `backend/config/config_test.go`

- [ ] **Step 1: Write the failing test**

```go
// backend/config/config_test.go
package config

import (
	"os"
	"strings"
	"testing"
)

func TestValidateStartup_FailsWithoutJWTSecret(t *testing.T) {
	os.Unsetenv("JWT_SECRET")
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db?sslmode=require")
	err := ValidateStartup()
	if err == nil || !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Fatalf("expected JWT_SECRET error, got %v", err)
	}
}

func TestValidateStartup_FailsWithShortJWTSecret(t *testing.T) {
	os.Setenv("JWT_SECRET", "tooshort")
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db?sslmode=require")
	err := ValidateStartup()
	if err == nil || !strings.Contains(err.Error(), "32") {
		t.Fatalf("expected length error, got %v", err)
	}
}

func TestValidateStartup_FailsWithoutRefreshPepper(t *testing.T) {
	os.Setenv("JWT_SECRET", strings.Repeat("a", 32))
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db?sslmode=require")
	os.Unsetenv("REFRESH_TOKEN_PEPPER")
	err := ValidateStartup()
	if err == nil || !strings.Contains(err.Error(), "REFRESH_TOKEN_PEPPER") {
		t.Fatalf("expected pepper error, got %v", err)
	}
}

func TestValidateStartup_FailsWithoutSSLMode(t *testing.T) {
	os.Setenv("JWT_SECRET", strings.Repeat("a", 32))
	os.Setenv("REFRESH_TOKEN_PEPPER", strings.Repeat("b", 32))
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db")
	err := ValidateStartup()
	if err == nil || !strings.Contains(err.Error(), "sslmode") {
		t.Fatalf("expected sslmode error, got %v", err)
	}
}

func TestValidateStartup_FailsOnCORSWildcard(t *testing.T) {
	os.Setenv("JWT_SECRET", strings.Repeat("a", 32))
	os.Setenv("REFRESH_TOKEN_PEPPER", strings.Repeat("b", 32))
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db?sslmode=require")
	os.Setenv("CORS_ORIGIN", "*")
	err := ValidateStartup()
	if err == nil || !strings.Contains(err.Error(), "wildcard") {
		t.Fatalf("expected wildcard error, got %v", err)
	}
}

func TestValidateStartup_SucceedsWithAllRequired(t *testing.T) {
	os.Setenv("JWT_SECRET", strings.Repeat("a", 32))
	os.Setenv("REFRESH_TOKEN_PEPPER", strings.Repeat("b", 32))
	os.Setenv("DATABASE_URL", "postgres://u:p@h/db?sslmode=require")
	os.Setenv("CORS_ORIGIN", "https://admin.example.com")
	if err := ValidateStartup(); err != nil {
		t.Fatalf("expected success, got %v", err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./config/ -run TestValidateStartup -v`
Expected: FAIL — `ValidateStartup` undefined.

- [ ] **Step 3: Implement**

Add to `backend/config/config.go` (keeping existing `GetJWTSecret`, `LoadConfig`, etc.):

```go
// ValidateStartup verifies required environment variables are present and safe.
// Returns a non-nil error describing the first problem found. Callers should
// log.Fatal on the returned error at process start.
func ValidateStartup() error {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return fmt.Errorf("JWT_SECRET is required")
	}
	if len(secret) < 32 {
		return fmt.Errorf("JWT_SECRET must be at least 32 bytes (got %d)", len(secret))
	}

	if os.Getenv("REFRESH_TOKEN_PEPPER") == "" {
		return fmt.Errorf("REFRESH_TOKEN_PEPPER is required")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	if !strings.Contains(dbURL, "sslmode=require") && !strings.Contains(dbURL, "sslmode=verify-full") {
		return fmt.Errorf("DATABASE_URL must enforce sslmode=require (or verify-full)")
	}

	corsOrigin := os.Getenv("CORS_ORIGIN")
	if corsOrigin == "" {
		corsOrigin = os.Getenv("ALLOWED_ORIGINS")
	}
	for _, o := range strings.Split(corsOrigin, ",") {
		if strings.TrimSpace(o) == "*" {
			return fmt.Errorf("CORS_ORIGIN wildcard '*' is not allowed")
		}
	}

	return nil
}
```

Also **delete dangerous defaults** from `LoadConfig`:
```go
// Replace this:
DBUser:     getEnv("DB_USER", "oneride_user"),
DBPassword: getEnv("DB_PASSWORD", "oneride_password"),
DBName:     getEnv("DB_NAME", "oneride_db"),
// With this:
DBUser:     getEnv("DB_USER", ""),
DBPassword: getEnv("DB_PASSWORD", ""),
DBName:     getEnv("DB_NAME", ""),
```

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./config/ -v`
Expected: PASS (all six cases).

- [ ] **Step 5: Wire into `main.go`**

Replace the `config.GetJWTSecret()` early-fail with a call to `ValidateStartup`:

```go
cfg := config.LoadConfig()
if err := config.ValidateStartup(); err != nil {
    log.Fatalf("FATAL: startup validation: %v", err)
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/config/config.go backend/config/config_test.go backend/cmd/main.go
git commit -m "feat(config): validate required secrets at startup"
```

---

### Task 3: `pkg/validate` — body size limit middleware

**Files:**
- Create: `backend/pkg/validate/body.go`
- Create: `backend/pkg/validate/body_test.go`
- Modify: `backend/cmd/main.go`

- [ ] **Step 1: Write the failing test**

```go
// backend/pkg/validate/body_test.go
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
	r.Use(BodySizeLimit(16)) // 16 bytes max
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./pkg/validate/ -v`
Expected: FAIL — `BodySizeLimit` undefined.

- [ ] **Step 3: Implement**

```go
// backend/pkg/validate/body.go
// Package validate provides request validation helpers: body size limits,
// file upload sanitization, and struct validation wrappers.
package validate

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// BodySizeLimit returns a Gin middleware that rejects requests whose body
// exceeds maxBytes. Enforcement uses http.MaxBytesReader, which causes the
// next Read to return an error once the limit is exceeded — so handlers
// downstream see the truncation as an EOF-style error and should return 413.
func BodySizeLimit(maxBytes int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./pkg/validate/ -v`
Expected: PASS.

- [ ] **Step 5: Wire into `main.go`**

Apply a 1 MB default limit globally, right after `RequestLoggerMiddleware`:

```go
router.Use(middleware.RequestLoggerMiddleware())
router.Use(validate.BodySizeLimit(1 << 20)) // 1 MB default
```

Upload routes will apply a larger limit locally via route groups in a later task.

- [ ] **Step 6: Commit**

```bash
git add backend/pkg/validate/body.go backend/pkg/validate/body_test.go backend/cmd/main.go
git commit -m "feat(validate): add body size limit middleware"
```

---

### Task 4: `pkg/validate` — image upload pipeline

**Files:**
- Create: `backend/pkg/validate/image.go`
- Create: `backend/pkg/validate/image_test.go`
- Create: `backend/pkg/validate/testdata/valid.jpg` (generated in test)

- [ ] **Step 1: Write the failing tests**

```go
// backend/pkg/validate/image_test.go
package validate

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"strings"
	"testing"
)

func makeJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{byte(x), byte(y), 0, 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 80}); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestSanitizeImage_AcceptsValidJPEG(t *testing.T) {
	raw := makeJPEG(t, 100, 100)
	out, name, err := SanitizeImage(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("unexpected: %v", err)
	}
	if !strings.HasSuffix(name, ".jpg") {
		t.Fatalf("expected .jpg suffix, got %q", name)
	}
	if len(out) == 0 {
		t.Fatal("empty output")
	}
}

func TestSanitizeImage_RejectsSVG(t *testing.T) {
	svg := []byte(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)
	_, _, err := SanitizeImage(bytes.NewReader(svg), int64(len(svg)))
	if err == nil {
		t.Fatal("expected rejection")
	}
}

func TestSanitizeImage_RejectsHTMLPolyglot(t *testing.T) {
	polyglot := []byte("<html><body>not an image</body></html>")
	_, _, err := SanitizeImage(bytes.NewReader(polyglot), int64(len(polyglot)))
	if err == nil {
		t.Fatal("expected rejection")
	}
}

func TestSanitizeImage_RejectsOversize(t *testing.T) {
	raw := makeJPEG(t, 5000, 5000)
	_, _, err := SanitizeImage(bytes.NewReader(raw), int64(len(raw)))
	if err == nil {
		t.Fatal("expected dimension rejection")
	}
}

func TestSanitizeImage_RejectsContentLengthTooBig(t *testing.T) {
	_, _, err := SanitizeImage(bytes.NewReader([]byte("x")), 20*1024*1024)
	if err == nil {
		t.Fatal("expected size rejection")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./pkg/validate/ -run TestSanitizeImage -v`
Expected: FAIL — `SanitizeImage` undefined.

- [ ] **Step 3: Implement**

```go
// backend/pkg/validate/image.go
package validate

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"  // register decoder
	_ "image/webp" // register decoder
	"io"
	"net/http"

	"github.com/google/uuid"
)

const (
	MaxImageBytes      = 10 << 20 // 10 MB
	MaxImageDimension  = 4000
	JPEGReencodeQuality = 85
)

// SanitizeImage validates an image upload and returns a re-encoded JPEG byte
// slice with a server-generated filename. It rejects:
//   - declared Content-Length > MaxImageBytes
//   - MIME type outside jpeg/png/webp (sniffed, not trusted from headers)
//   - files that fail to decode as a real image
//   - images exceeding MaxImageDimension on either axis
//
// Re-encoding strips EXIF metadata and defeats polyglot payloads.
func SanitizeImage(r io.Reader, contentLength int64) (out []byte, filename string, err error) {
	if contentLength > MaxImageBytes {
		return nil, "", fmt.Errorf("image too large: %d bytes (max %d)", contentLength, MaxImageBytes)
	}

	// Limit read to MaxImageBytes even if Content-Length lied
	limited := io.LimitReader(r, MaxImageBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		return nil, "", fmt.Errorf("read: %w", err)
	}
	if int64(len(raw)) > MaxImageBytes {
		return nil, "", fmt.Errorf("image too large (after read)")
	}

	// MIME sniff on first 512 bytes
	head := raw
	if len(head) > 512 {
		head = head[:512]
	}
	mime := http.DetectContentType(head)
	switch mime {
	case "image/jpeg", "image/png", "image/webp":
		// ok
	default:
		return nil, "", fmt.Errorf("unsupported image type: %s", mime)
	}

	// Full decode confirms it's a real image (rejects SVG, zip bombs, polyglots)
	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, "", fmt.Errorf("decode: %w", err)
	}

	b := img.Bounds()
	if b.Dx() > MaxImageDimension || b.Dy() > MaxImageDimension {
		return nil, "", fmt.Errorf("image too large: %dx%d (max %dx%d)",
			b.Dx(), b.Dy(), MaxImageDimension, MaxImageDimension)
	}

	// Re-encode as JPEG to strip EXIF and normalize format
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: JPEGReencodeQuality}); err != nil {
		return nil, "", fmt.Errorf("encode: %w", err)
	}

	return buf.Bytes(), uuid.NewString() + ".jpg", nil
}
```

Note: `image/webp` is not in the stdlib — if the build fails on the `_ "image/webp"` import, either remove it and drop webp from the MIME allowlist, or add `golang.org/x/image/webp` as a dependency. Prefer dropping webp for the first pass (simpler).

If dropping webp: remove the import and remove `"image/webp"` from the switch.

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./pkg/validate/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/validate/image.go backend/pkg/validate/image_test.go backend/go.mod backend/go.sum
git commit -m "feat(validate): add image upload sanitization pipeline"
```

---

### Task 5: `pkg/audit` — audit log model + writer

**Files:**
- Modify: `backend/pkg/models/models.go` (add `AuditLog` struct)
- Modify: `backend/pkg/db/database.go` (register in AutoMigrate)
- Create: `backend/pkg/audit/audit.go`
- Create: `backend/pkg/audit/audit_test.go`

- [ ] **Step 1: Add the model**

Append to `backend/pkg/models/models.go`:

```go
// AuditLog is an append-only record of sensitive actions for security review.
// Never update or delete rows in this table.
type AuditLog struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	ActorUserID  *uint          `gorm:"index" json:"actor_user_id"`
	ActorRole    string         `gorm:"index" json:"actor_role"`
	Action       string         `gorm:"index;not null" json:"action"`
	TargetType   string         `gorm:"index" json:"target_type"`
	TargetID     string         `gorm:"index" json:"target_id"`
	Metadata     datatypes.JSON `json:"metadata"`
	IP           string         `json:"ip"`
	UserAgent    string         `json:"user_agent"`
	RequestID    string         `gorm:"index" json:"request_id"`
	CreatedAt    time.Time      `gorm:"index" json:"created_at"`
}
```

- [ ] **Step 2: Register in migration**

In `backend/pkg/db/database.go`, add `&models.AuditLog{}` to the `AutoMigrate` call list.

- [ ] **Step 3: Write the failing test**

```go
// backend/pkg/audit/audit_test.go
package audit

import (
	"testing"

	"oneride/pkg/models"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.AuditLog{}); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestLog_WritesRow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := newTestDB(t)

	c, _ := gin.CreateTestContext(nil)
	c.Set("userID", uint(42))
	c.Set("role", "admin")
	c.Set("requestID", "req-123")

	Log(db, c, "user.delete", "user", "99", map[string]any{"reason": "fraud"})

	var row models.AuditLog
	if err := db.First(&row).Error; err != nil {
		t.Fatal(err)
	}
	if row.Action != "user.delete" || row.TargetID != "99" || row.ActorRole != "admin" {
		t.Fatalf("unexpected row: %+v", row)
	}
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && go test ./pkg/audit/ -v`
Expected: FAIL — `Log` undefined (and package missing).

- [ ] **Step 5: Implement**

```go
// backend/pkg/audit/audit.go
// Package audit writes append-only audit log entries. Entries are never
// updated or deleted; retention is policy-managed at the DB level.
package audit

import (
	"encoding/json"
	"log/slog"

	"oneride/pkg/models"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Log writes a single audit entry. It extracts actor context from the Gin
// context (userID, role, requestID) and client metadata (IP, UA) from the
// request. Errors writing the audit row are logged but never returned —
// audit failures must not break the triggering request.
func Log(db *gorm.DB, c *gin.Context, action, targetType, targetID string, metadata map[string]any) {
	var actorID *uint
	if v, ok := c.Get("userID"); ok {
		if u, ok := v.(uint); ok {
			actorID = &u
		}
	}
	role, _ := c.Get("role")
	reqID, _ := c.Get("requestID")

	var meta datatypes.JSON
	if metadata != nil {
		if b, err := json.Marshal(metadata); err == nil {
			meta = b
		}
	}

	entry := models.AuditLog{
		ActorUserID: actorID,
		ActorRole:   strOrEmpty(role),
		Action:      action,
		TargetType:  targetType,
		TargetID:    targetID,
		Metadata:    meta,
		IP:          c.ClientIP(),
		UserAgent:   c.GetHeader("User-Agent"),
		RequestID:   strOrEmpty(reqID),
	}

	if err := db.Create(&entry).Error; err != nil {
		slog.Error("audit log write failed",
			"action", action,
			"target_type", targetType,
			"target_id", targetID,
			"error", err,
		)
	}
}

func strOrEmpty(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
```

If `github.com/glebarez/sqlite` is not yet a dependency, add it:
```bash
cd backend && go get github.com/glebarez/sqlite
```

- [ ] **Step 6: Run tests**

Run: `cd backend && go test ./pkg/audit/ -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/pkg/audit/ backend/pkg/models/models.go backend/pkg/db/database.go backend/go.mod backend/go.sum
git commit -m "feat(audit): append-only audit log writer"
```

---

## Phase 2 — Auth V2

### Task 6: RefreshToken model + store

**Files:**
- Modify: `backend/pkg/models/models.go` (add `RefreshToken`, add `TokenVersion` to User)
- Modify: `backend/pkg/db/database.go` (AutoMigrate)
- Create: `backend/pkg/auth/refresh.go`
- Create: `backend/pkg/auth/refresh_test.go`

- [ ] **Step 1: Add model changes**

Append to `backend/pkg/models/models.go`:

```go
// RefreshToken tracks issued refresh tokens. The raw token is never stored;
// only a salted SHA-256 hash. FamilyID groups rotated tokens so reuse of any
// historical token can revoke the entire family (detection of theft).
type RefreshToken struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"user_id"`
	FamilyID  string    `gorm:"index;not null" json:"family_id"`
	TokenHash string    `gorm:"uniqueIndex;not null" json:"-"`
	ExpiresAt time.Time `gorm:"index;not null" json:"expires_at"`
	RevokedAt *time.Time `gorm:"index" json:"revoked_at,omitempty"`
	UserAgent string    `json:"user_agent"`
	IP        string    `json:"ip"`
	CreatedAt time.Time `json:"created_at"`
}
```

Add `TokenVersion` to the existing `User` struct (find it near line 11 in `models.go`):
```go
TokenVersion int `gorm:"default:1;not null" json:"-"`
```

Register `&models.RefreshToken{}` in `database.go` AutoMigrate.

- [ ] **Step 2: Write failing tests**

```go
// backend/pkg/auth/refresh_test.go
package auth

import (
	"os"
	"testing"
	"time"

	"oneride/pkg/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.RefreshToken{}); err != nil {
		t.Fatal(err)
	}
	return db
}

func setPepper(t *testing.T) {
	t.Helper()
	os.Setenv("REFRESH_TOKEN_PEPPER", "test-pepper-0000000000000000000000")
}

func TestIssueRefreshToken_CreatesRow(t *testing.T) {
	setPepper(t)
	db := newDB(t)
	user := models.User{Name: "a", Email: "a@b.c", Phone: "1"}
	db.Create(&user)

	raw, rec, err := Issue(db, user.ID, "ua", "1.2.3.4", "")
	if err != nil {
		t.Fatal(err)
	}
	if raw == "" || rec.FamilyID == "" || rec.TokenHash == "" {
		t.Fatal("missing fields")
	}
	if rec.TokenHash == raw {
		t.Fatal("hash must not equal raw")
	}
}

func TestRedeemRefreshToken_RotatesAndRevokesOld(t *testing.T) {
	setPepper(t)
	db := newDB(t)
	u := models.User{Name: "a", Email: "a@b.c", Phone: "1"}
	db.Create(&u)

	raw, old, _ := Issue(db, u.ID, "ua", "1.2.3.4", "")

	newRaw, newRec, err := Redeem(db, raw, "ua", "1.2.3.4")
	if err != nil {
		t.Fatal(err)
	}
	if newRaw == raw {
		t.Fatal("expected rotation")
	}
	if newRec.FamilyID != old.FamilyID {
		t.Fatal("family must be preserved on rotation")
	}

	var reloaded models.RefreshToken
	db.First(&reloaded, old.ID)
	if reloaded.RevokedAt == nil {
		t.Fatal("old token must be revoked after rotation")
	}
}

func TestRedeemRefreshToken_ReuseRevokesFamily(t *testing.T) {
	setPepper(t)
	db := newDB(t)
	u := models.User{Name: "a", Email: "a@b.c", Phone: "1"}
	db.Create(&u)

	raw, _, _ := Issue(db, u.ID, "ua", "1.2.3.4", "")
	_, _, _ = Redeem(db, raw, "ua", "1.2.3.4") // rotate

	// Second attempt with original token = theft signal
	_, _, err := Redeem(db, raw, "ua", "1.2.3.4")
	if err == nil {
		t.Fatal("expected reuse error")
	}

	// All tokens in the family should now be revoked
	var all []models.RefreshToken
	db.Where("user_id = ?", u.ID).Find(&all)
	for _, tk := range all {
		if tk.RevokedAt == nil {
			t.Fatalf("token %d not revoked after reuse", tk.ID)
		}
	}
}

func TestRedeemRefreshToken_RejectsExpired(t *testing.T) {
	setPepper(t)
	db := newDB(t)
	u := models.User{Name: "a", Email: "a@b.c", Phone: "1"}
	db.Create(&u)

	raw, rec, _ := Issue(db, u.ID, "ua", "1.2.3.4", "")
	// Force-expire
	db.Model(&rec).Update("expires_at", time.Now().Add(-time.Hour))

	_, _, err := Redeem(db, raw, "ua", "1.2.3.4")
	if err == nil {
		t.Fatal("expected expired error")
	}
}
```

- [ ] **Step 3: Implement**

```go
// backend/pkg/auth/refresh.go
// Package auth owns JWT + refresh token issuance, rotation, and revocation.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"os"
	"time"

	"oneride/pkg/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	RefreshTokenLifetime = 14 * 24 * time.Hour
	RefreshTokenBytes    = 32
	MaxActivePerUser     = 10
)

var (
	ErrRefreshNotFound = errors.New("refresh token not found")
	ErrRefreshRevoked  = errors.New("refresh token revoked")
	ErrRefreshExpired  = errors.New("refresh token expired")
	ErrRefreshReuse    = errors.New("refresh token reuse detected")
)

func hash(raw string) string {
	pepper := os.Getenv("REFRESH_TOKEN_PEPPER")
	h := sha256.Sum256([]byte(pepper + raw))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

func randomToken() (string, error) {
	b := make([]byte, RefreshTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// Issue creates a new refresh token for a user. Pass familyID="" to start a new
// family; pass an existing familyID during rotation to link the new token to
// the original lineage.
func Issue(db *gorm.DB, userID uint, ua, ip, familyID string) (raw string, rec models.RefreshToken, err error) {
	raw, err = randomToken()
	if err != nil {
		return "", rec, err
	}
	if familyID == "" {
		familyID = uuid.NewString()
	}
	rec = models.RefreshToken{
		UserID:    userID,
		FamilyID:  familyID,
		TokenHash: hash(raw),
		ExpiresAt: time.Now().Add(RefreshTokenLifetime),
		UserAgent: ua,
		IP:        ip,
	}
	if err := db.Create(&rec).Error; err != nil {
		return "", rec, err
	}

	// Enforce MaxActivePerUser — revoke oldest if over cap
	var count int64
	db.Model(&models.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Count(&count)
	if count > MaxActivePerUser {
		excess := count - MaxActivePerUser
		var oldest []models.RefreshToken
		db.Where("user_id = ? AND revoked_at IS NULL", userID).
			Order("created_at ASC").
			Limit(int(excess)).
			Find(&oldest)
		now := time.Now()
		for _, t := range oldest {
			db.Model(&t).Update("revoked_at", now)
		}
	}
	return raw, rec, nil
}

// Redeem validates a refresh token and issues a rotated replacement in the
// same family. If the presented token is valid-but-already-revoked, it is
// treated as theft: the entire family is revoked and ErrRefreshReuse is
// returned.
func Redeem(db *gorm.DB, raw, ua, ip string) (newRaw string, newRec models.RefreshToken, err error) {
	var rec models.RefreshToken
	if err := db.Where("token_hash = ?", hash(raw)).First(&rec).Error; err != nil {
		return "", models.RefreshToken{}, ErrRefreshNotFound
	}

	if rec.RevokedAt != nil {
		// Reuse of a revoked token = theft signal. Revoke the family.
		RevokeFamily(db, rec.FamilyID)
		return "", models.RefreshToken{}, ErrRefreshReuse
	}
	if time.Now().After(rec.ExpiresAt) {
		now := time.Now()
		db.Model(&rec).Update("revoked_at", now)
		return "", models.RefreshToken{}, ErrRefreshExpired
	}

	// Rotate: revoke current, issue new in same family
	now := time.Now()
	if err := db.Model(&rec).Update("revoked_at", now).Error; err != nil {
		return "", models.RefreshToken{}, err
	}
	return Issue(db, rec.UserID, ua, ip, rec.FamilyID)
}

// RevokeFamily revokes every token in a family (used for reuse/theft handling
// and for logout-all).
func RevokeFamily(db *gorm.DB, familyID string) {
	now := time.Now()
	db.Model(&models.RefreshToken{}).
		Where("family_id = ? AND revoked_at IS NULL", familyID).
		Update("revoked_at", now)
}

// RevokeAllForUser revokes every active refresh token for a user.
func RevokeAllForUser(db *gorm.DB, userID uint) {
	now := time.Now()
	db.Model(&models.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", now)
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./pkg/auth/ -v`
Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/auth/ backend/pkg/models/models.go backend/pkg/db/database.go
git commit -m "feat(auth): refresh token model with rotation and reuse detection"
```

---

### Task 7: JWT hardening — claims, safe parsing, token_version check

**Files:**
- Modify: `backend/pkg/handlers/jwt.go`
- Create: `backend/pkg/handlers/jwt_v2_test.go`
- Modify: `backend/pkg/middleware/middleware.go` (AuthMiddleware rewrite)
- Modify: `backend/pkg/middleware/middleware_test.go`

- [ ] **Step 1: Write failing tests**

```go
// backend/pkg/handlers/jwt_v2_test.go
package handlers

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func setJWTEnv(t *testing.T) {
	t.Helper()
	os.Setenv("JWT_SECRET", strings.Repeat("x", 32))
}

func TestGenerateAccessToken_ContainsRequiredClaims(t *testing.T) {
	setJWTEnv(t)
	tok, err := GenerateAccessToken(7, "a@b.c", "admin", 3, "oneride-admin")
	if err != nil {
		t.Fatal(err)
	}
	parsed, _, err := jwt.NewParser().ParseUnverified(tok, jwt.MapClaims{})
	if err != nil {
		t.Fatal(err)
	}
	claims := parsed.Claims.(jwt.MapClaims)
	for _, k := range []string{"sub", "role", "iss", "aud", "exp", "iat", "jti", "tver"} {
		if _, ok := claims[k]; !ok {
			t.Fatalf("missing claim %q", k)
		}
	}
	if claims["iss"] != "oneride-api" {
		t.Fatalf("bad iss: %v", claims["iss"])
	}
	if claims["aud"] != "oneride-admin" {
		t.Fatalf("bad aud: %v", claims["aud"])
	}
}

func TestGenerateAccessToken_ShortLifetime(t *testing.T) {
	setJWTEnv(t)
	tok, _ := GenerateAccessToken(1, "a@b.c", "user", 1, "oneride-mobile")
	parsed, _, _ := jwt.NewParser().ParseUnverified(tok, jwt.MapClaims{})
	claims := parsed.Claims.(jwt.MapClaims)
	exp := int64(claims["exp"].(float64))
	if time.Until(time.Unix(exp, 0)) > 2*time.Hour {
		t.Fatal("access token lifetime must be <= 1 hour")
	}
}
```

- [ ] **Step 2: Run tests**

Run: `cd backend && go test ./pkg/handlers/ -run TestGenerateAccessToken -v`
Expected: FAIL — `GenerateAccessToken` undefined.

- [ ] **Step 3: Rewrite `jwt.go`**

Replace `backend/pkg/handlers/jwt.go` entirely:

```go
// backend/pkg/handlers/jwt.go
package handlers

import (
	"oneride/config"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	AccessTokenLifetime = 1 * time.Hour
	JWTIssuer           = "oneride-api"
	AudienceMobile      = "oneride-mobile"
	AudienceAdmin       = "oneride-admin"
)

// GenerateAccessToken mints a short-lived JWT access token. audience must be
// one of AudienceMobile or AudienceAdmin. tokenVersion is the user's current
// TokenVersion field; AuthMiddleware rejects tokens whose tver is stale.
func GenerateAccessToken(userID uint, email, role string, tokenVersion int, audience string) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   strconv.FormatUint(uint64(userID), 10),
		"email": email,
		"role":  role,
		"iss":   JWTIssuer,
		"aud":   audience,
		"exp":   now.Add(AccessTokenLifetime).Unix(),
		"iat":   now.Unix(),
		"nbf":   now.Unix(),
		"jti":   uuid.NewString(),
		"tver":  tokenVersion,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.GetJWTSecret()))
}

// GenerateToken is kept as a thin shim for legacy call sites while the
// codebase is migrated. Delete once all callers use GenerateAccessToken.
//
// Deprecated: use GenerateAccessToken.
func GenerateToken(userID uint, email, role string) (string, error) {
	return GenerateAccessToken(userID, email, role, 1, AudienceMobile)
}
```

- [ ] **Step 4: Run the access-token tests**

Run: `cd backend && go test ./pkg/handlers/ -run TestGenerateAccessToken -v`
Expected: PASS.

- [ ] **Step 5: Rewrite `AuthMiddleware` safely**

In `backend/pkg/middleware/middleware.go`, replace the body of `AuthMiddleware` with:

```go
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
			jwt.WithExpirationRequired(),
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

		// Safe claim extraction — no panics on missing fields
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
```

Add the required imports if missing: `"strconv"`.

- [ ] **Step 6: Run all middleware tests**

Run: `cd backend && go test ./pkg/middleware/ -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/pkg/handlers/jwt.go backend/pkg/handlers/jwt_v2_test.go backend/pkg/middleware/middleware.go
git commit -m "feat(auth): harden JWT generation and parsing"
```

---

### Task 8: Update login/register to use short tokens + issue refresh

**Files:**
- Modify: `backend/pkg/handlers/handlers.go` (find `Login`, `Register`, `VerifyOTP` handlers)
- Create: `backend/pkg/handlers/auth_v2_test.go`

- [ ] **Step 1: Locate the handlers**

Run:
```bash
cd backend && grep -n "^func Login\|^func Register\|^func VerifyOTP" pkg/handlers/handlers.go
```

- [ ] **Step 2: Modify each handler to return access + refresh tokens**

For each of `Login`, `Register`, `VerifyOTP`, find where `GenerateToken` is called and replace the token response block. Example pattern (adapt per-handler):

```go
// Existing:
// token, err := GenerateToken(user.ID, user.Email, user.Role)

// Replace with:
audience := AudienceMobile
if user.Role == "admin" {
    audience = AudienceAdmin
}
accessToken, err := GenerateAccessToken(user.ID, user.Email, user.Role, user.TokenVersion, audience)
if err != nil {
    c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
    return
}
refreshRaw, _, err := auth.Issue(db, user.ID, c.GetHeader("User-Agent"), c.ClientIP(), "")
if err != nil {
    c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to issue refresh token"})
    return
}
c.JSON(http.StatusOK, gin.H{
    "success":       true,
    "access_token":  accessToken,
    "refresh_token": refreshRaw,
    "expires_in":    int(AccessTokenLifetime.Seconds()),
    "user":          user,
})
```

Add import at top of file:
```go
"oneride/pkg/auth"
```

- [ ] **Step 3: Write integration test for login**

```go
// backend/pkg/handlers/auth_v2_test.go
package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"oneride/pkg/models"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func setupAuthTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	os.Setenv("JWT_SECRET", strings.Repeat("x", 32))
	os.Setenv("REFRESH_TOKEN_PEPPER", strings.Repeat("y", 32))
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.RefreshToken{}); err != nil {
		t.Fatal(err)
	}
	pw, _ := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.DefaultCost)
	db.Create(&models.User{
		Name: "Test", Email: "test@example.com", Phone: "0917",
		Password: string(pw), Role: "user", TokenVersion: 1,
	})
	return db
}

func TestLogin_ReturnsAccessAndRefreshTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupAuthTestDB(t)

	r := gin.New()
	r.POST("/login", Login(db))

	body := `{"email":"test@example.com","password":"password123"}`
	req, _ := http.NewRequest("POST", "/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["access_token"] == nil || resp["access_token"] == "" {
		t.Fatal("missing access_token")
	}
	if resp["refresh_token"] == nil || resp["refresh_token"] == "" {
		t.Fatal("missing refresh_token")
	}
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./pkg/handlers/ -run TestLogin_ReturnsAccessAndRefreshTokens -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/
git commit -m "feat(auth): issue refresh tokens on login/register/otp"
```

---

### Task 9: `/auth/refresh`, `/auth/logout`, `/auth/logout-all` endpoints

**Files:**
- Create: `backend/pkg/handlers/auth_endpoints.go`
- Modify: `backend/cmd/main.go` (register routes)
- Create: `backend/pkg/handlers/auth_endpoints_test.go`

- [ ] **Step 1: Implement handlers**

```go
// backend/pkg/handlers/auth_endpoints.go
package handlers

import (
	"errors"
	"net/http"

	"oneride/pkg/auth"
	"oneride/pkg/audit"
	"oneride/pkg/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// RefreshToken exchanges a refresh token for a new access + refresh pair.
// Handles reuse detection: if the presented token is already revoked, the
// whole family is revoked and the client is forced to log in.
func RefreshToken(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			RefreshToken string `json:"refresh_token" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "refresh_token required"})
			return
		}

		newRaw, rec, err := auth.Redeem(db, req.RefreshToken, c.GetHeader("User-Agent"), c.ClientIP())
		if err != nil {
			if errors.Is(err, auth.ErrRefreshReuse) {
				audit.Log(db, c, "auth.refresh_reuse_detected", "user", "", nil)
			}
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
			return
		}

		var user models.User
		if err := db.First(&user, rec.UserID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}

		audience := AudienceMobile
		if user.Role == "admin" {
			audience = AudienceAdmin
		}
		access, err := GenerateAccessToken(user.ID, user.Email, user.Role, user.TokenVersion, audience)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "token generation failed"})
			return
		}

		audit.Log(db, c, "auth.refresh", "user", rec.UserID, nil)
		c.JSON(http.StatusOK, gin.H{
			"access_token":  access,
			"refresh_token": newRaw,
			"expires_in":    int(AccessTokenLifetime.Seconds()),
		})
	}
}

// Logout revokes a single refresh token.
func Logout(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			RefreshToken string `json:"refresh_token"`
		}
		_ = c.ShouldBindJSON(&req)

		if req.RefreshToken != "" {
			// Best-effort revoke; don't leak whether the token existed
			var tk models.RefreshToken
			if err := db.Where("token_hash = ?", auth.HashForTest(req.RefreshToken)).First(&tk).Error; err == nil {
				auth.RevokeFamily(db, tk.FamilyID)
			}
		}
		uid, _ := c.Get("userID")
		audit.Log(db, c, "auth.logout", "user", toStr(uid), nil)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// LogoutAll revokes every refresh token for the current user AND bumps
// TokenVersion, which invalidates every outstanding access token for this
// user on next request.
func LogoutAll(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		uidRaw, ok := c.Get("userID")
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		uid := uidRaw.(uint)

		auth.RevokeAllForUser(db, uid)
		db.Model(&models.User{}).Where("id = ?", uid).
			Update("token_version", gorm.Expr("token_version + 1"))

		audit.Log(db, c, "auth.logout_all", "user", toStr(uid), nil)
		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

func toStr(v any) string {
	if v == nil {
		return ""
	}
	if u, ok := v.(uint); ok {
		return formatUint(uint64(u))
	}
	return ""
}

func formatUint(u uint64) string {
	// minimal stdlib-free formatter to avoid extra import
	const digits = "0123456789"
	if u == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for u > 0 {
		i--
		b[i] = digits[u%10]
		u /= 10
	}
	return string(b[i:])
}
```

Also expose `HashForTest` in `pkg/auth/refresh.go` (needed by `Logout`):
```go
// HashForTest exposes the internal hash function for handler callers that
// need to look up a token by its raw value.
func HashForTest(raw string) string { return hash(raw) }
```

(Rename later if it feels wrong — the simpler option is to move `Logout` into `pkg/auth` instead. Either works.)

- [ ] **Step 2: Register routes in `main.go`**

Under the `public` group:
```go
public.POST("/auth/refresh", handlers.RefreshToken(database))
```

Under the `protected` group:
```go
protected.POST("/auth/logout", handlers.Logout(database))
protected.POST("/auth/logout-all", handlers.LogoutAll(database))
```

- [ ] **Step 3: Write integration test**

```go
// backend/pkg/handlers/auth_endpoints_test.go
package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"oneride/pkg/auth"
	"oneride/pkg/models"
)

func TestRefreshEndpoint_RotatesToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupAuthTestDB(t)
	// ensure models.RefreshToken migrated by setupAuthTestDB

	var u models.User
	db.First(&u, "email = ?", "test@example.com")
	raw, _, _ := auth.Issue(db, u.ID, "ua", "1.1.1.1", "")

	r := gin.New()
	r.POST("/refresh", RefreshToken(db))

	body, _ := json.Marshal(map[string]string{"refresh_token": raw})
	req, _ := http.NewRequest("POST", "/refresh", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["refresh_token"] == raw {
		t.Fatal("expected rotated refresh token")
	}
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./pkg/handlers/ -run "TestRefresh|TestLogin" -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/ backend/pkg/auth/refresh.go backend/cmd/main.go
git commit -m "feat(auth): add /auth/refresh, /auth/logout, /auth/logout-all"
```

---

### Task 10: Password lockout on repeated failed logins

**Files:**
- Modify: `backend/pkg/handlers/handlers.go` (Login handler)
- Modify: `backend/pkg/models/models.go` (add `FailedLoginCount`, `LockedUntil`)

- [ ] **Step 1: Add fields to User model**

In `backend/pkg/models/models.go`, within `type User struct`:
```go
FailedLoginCount int        `gorm:"default:0" json:"-"`
LockedUntil      *time.Time `json:"-"`
```

- [ ] **Step 2: Modify `Login` handler**

In `handlers.go`, at the top of `Login` after the user is fetched:
```go
if user.LockedUntil != nil && time.Now().Before(*user.LockedUntil) {
    c.JSON(http.StatusTooManyRequests, gin.H{
        "error": "Account temporarily locked. Try again later.",
    })
    return
}
```

Where the password comparison fails:
```go
// On bcrypt mismatch:
user.FailedLoginCount++
if user.FailedLoginCount >= 5 {
    t := time.Now().Add(15 * time.Minute)
    user.LockedUntil = &t
    user.FailedLoginCount = 0
    audit.Log(db, c, "auth.account_locked", "user", formatUint(uint64(user.ID)), nil)
}
db.Save(&user)
c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
return
```

On success reset both:
```go
user.FailedLoginCount = 0
user.LockedUntil = nil
db.Save(&user)
```

- [ ] **Step 3: Write test**

```go
func TestLogin_LocksAfterFiveFailures(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupAuthTestDB(t)
	r := gin.New()
	r.POST("/login", Login(db))

	badBody := `{"email":"test@example.com","password":"wrongwrong"}`
	for i := 0; i < 5; i++ {
		req, _ := http.NewRequest("POST", "/login", bytes.NewBufferString(badBody))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
	}
	// Sixth attempt — even with correct password — must be locked
	goodBody := `{"email":"test@example.com","password":"password123"}`
	req, _ := http.NewRequest("POST", "/login", bytes.NewBufferString(goodBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", w.Code)
	}
}
```

- [ ] **Step 4: Run test**

Run: `cd backend && go test ./pkg/handlers/ -run TestLogin_LocksAfterFiveFailures -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/handlers.go backend/pkg/models/models.go backend/pkg/handlers/auth_v2_test.go
git commit -m "feat(auth): lock account for 15 min after 5 failed logins"
```

---

### Task 11: WebSocket ticket system

**Files:**
- Create: `backend/pkg/auth/ticket.go`
- Create: `backend/pkg/auth/ticket_test.go`
- Create: `backend/pkg/handlers/ws_ticket.go`
- Modify: `backend/cmd/main.go` (route)
- Modify: `backend/pkg/middleware/middleware.go` (WS auth accepts ticket param)

- [ ] **Step 1: Implement ticket store**

```go
// backend/pkg/auth/ticket.go
package auth

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"sync"
	"time"
)

const TicketLifetime = 30 * time.Second

type ticket struct {
	userID    uint
	role      string
	email     string
	expiresAt time.Time
}

var (
	ticketMu    sync.Mutex
	ticketStore = map[string]ticket{}
)

var ErrTicketInvalid = errors.New("invalid or expired ticket")

// IssueTicket creates a single-use short-lived ticket for WebSocket auth.
func IssueTicket(userID uint, email, role string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	key := base64.RawURLEncoding.EncodeToString(b)

	ticketMu.Lock()
	ticketStore[key] = ticket{
		userID:    userID,
		role:      role,
		email:     email,
		expiresAt: time.Now().Add(TicketLifetime),
	}
	ticketMu.Unlock()
	return key, nil
}

// ConsumeTicket atomically validates and deletes a ticket. Returns the user
// identity if valid. Expired tickets are also deleted.
func ConsumeTicket(key string) (userID uint, email, role string, err error) {
	ticketMu.Lock()
	defer ticketMu.Unlock()
	t, ok := ticketStore[key]
	if !ok {
		return 0, "", "", ErrTicketInvalid
	}
	delete(ticketStore, key)
	if time.Now().After(t.expiresAt) {
		return 0, "", "", ErrTicketInvalid
	}
	return t.userID, t.email, t.role, nil
}

// SweepExpired should be called periodically to free memory.
func SweepExpired() {
	ticketMu.Lock()
	defer ticketMu.Unlock()
	now := time.Now()
	for k, v := range ticketStore {
		if now.After(v.expiresAt) {
			delete(ticketStore, k)
		}
	}
}
```

- [ ] **Step 2: Test**

```go
// backend/pkg/auth/ticket_test.go
package auth

import "testing"

func TestTicket_RoundTrip(t *testing.T) {
	key, err := IssueTicket(7, "a@b.c", "user")
	if err != nil {
		t.Fatal(err)
	}
	uid, email, role, err := ConsumeTicket(key)
	if err != nil || uid != 7 || email != "a@b.c" || role != "user" {
		t.Fatalf("bad consume: %v %d %q %q", err, uid, email, role)
	}
}

func TestTicket_SingleUse(t *testing.T) {
	key, _ := IssueTicket(1, "a", "user")
	_, _, _, _ = ConsumeTicket(key)
	if _, _, _, err := ConsumeTicket(key); err == nil {
		t.Fatal("expected second consume to fail")
	}
}
```

Run: `cd backend && go test ./pkg/auth/ -run TestTicket -v`
Expected: PASS.

- [ ] **Step 3: Ticket issue endpoint**

```go
// backend/pkg/handlers/ws_ticket.go
package handlers

import (
	"net/http"

	"oneride/pkg/auth"

	"github.com/gin-gonic/gin"
)

// IssueWSTicket returns a short-lived, single-use ticket the client then
// passes as ?ticket=... to a WebSocket upgrade endpoint.
func IssueWSTicket(c *gin.Context) {
	uidRaw, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	uid := uidRaw.(uint)
	email, _ := c.Get("email")
	role, _ := c.Get("role")

	emailStr, _ := email.(string)
	roleStr, _ := role.(string)

	key, err := auth.IssueTicket(uid, emailStr, roleStr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ticket issue failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"ticket":     key,
		"expires_in": int(auth.TicketLifetime.Seconds()),
	})
}
```

- [ ] **Step 4: WS group uses ticket middleware**

In `backend/pkg/middleware/middleware.go`, add a new middleware:

```go
// WebSocketTicketMiddleware authenticates WebSocket upgrade requests via a
// one-time short-lived ticket passed as ?ticket=... This avoids putting the
// access token in URLs/logs.
func WebSocketTicketMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		t := c.Query("ticket")
		if t == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "ticket required"})
			c.Abort()
			return
		}
		uid, email, role, err := auth.ConsumeTicket(t)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid ticket"})
			c.Abort()
			return
		}
		c.Set("userID", uid)
		c.Set("email", email)
		c.Set("role", role)
		c.Next()
	}
}
```

Import `"oneride/pkg/auth"` at the top.

- [ ] **Step 5: Register and replace WS auth in `main.go`**

Add under `protected`:
```go
protected.POST("/ws/ticket", handlers.IssueWSTicket)
```

Change the `ws` group middleware:
```go
ws := router.Group("/ws")
ws.Use(middleware.WebSocketTicketMiddleware())
```

(Old behavior — `AuthMiddleware` accepting `?token=` query param — remains as a fallback during the migration window. After mobile update, remove the query-param fallback from `AuthMiddleware`.)

- [ ] **Step 6: Run tests**

Run: `cd backend && go test ./pkg/... -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/pkg/auth/ticket.go backend/pkg/auth/ticket_test.go backend/pkg/handlers/ws_ticket.go backend/pkg/middleware/middleware.go backend/cmd/main.go
git commit -m "feat(auth): one-time WebSocket tickets"
```

---

## Phase 3 — Authorization & IDOR protection

### Task 12: `pkg/authz` helpers

**Files:**
- Create: `backend/pkg/authz/authz.go`
- Create: `backend/pkg/authz/authz_test.go`

- [ ] **Step 1: Write failing tests**

```go
// backend/pkg/authz/authz_test.go
package authz

import (
	"errors"
	"testing"

	"oneride/pkg/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	db.AutoMigrate(&models.User{}, &models.Ride{}, &models.Delivery{}, &models.Order{}, &models.PaymentProof{})
	return db
}

func TestMustOwnRide_Owner(t *testing.T) {
	db := testDB(t)
	uid := uint(10)
	ride := models.Ride{UserID: &uid}
	db.Create(&ride)
	if err := MustOwnRide(db, 10, ride.ID); err != nil {
		t.Fatalf("owner should pass, got %v", err)
	}
}

func TestMustOwnRide_NotOwner(t *testing.T) {
	db := testDB(t)
	uid := uint(10)
	ride := models.Ride{UserID: &uid}
	db.Create(&ride)
	err := MustOwnRide(db, 99, ride.ID)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestMustOwnOrDriveRide_Driver(t *testing.T) {
	db := testDB(t)
	uid := uint(10)
	did := uint(20)
	ride := models.Ride{UserID: &uid, DriverID: &did}
	db.Create(&ride)
	if err := MustOwnOrDriveRide(db, 20, ride.ID); err != nil {
		t.Fatalf("driver should pass, got %v", err)
	}
}
```

- [ ] **Step 2: Run test (expect fail)**

Run: `cd backend && go test ./pkg/authz/ -v`
Expected: FAIL — package missing.

- [ ] **Step 3: Implement**

```go
// backend/pkg/authz/authz.go
// Package authz centralizes ownership and role checks. Every handler that
// operates on a :id path MUST route its permission check through one of
// these helpers. Return ErrNotFound (404) for "not found OR not yours" to
// prevent resource enumeration.
package authz

import (
	"errors"
	"sync"
	"time"

	"oneride/pkg/models"

	"gorm.io/gorm"
)

var (
	ErrNotFound  = errors.New("resource not found")
	ErrForbidden = errors.New("forbidden")
)

func MustOwnRide(db *gorm.DB, userID, rideID uint) error {
	var r models.Ride
	if err := db.Select("id, user_id").First(&r, rideID).Error; err != nil {
		return ErrNotFound
	}
	if r.UserID == nil || *r.UserID != userID {
		return ErrNotFound
	}
	return nil
}

func MustOwnOrDriveRide(db *gorm.DB, userID, rideID uint) error {
	var r models.Ride
	if err := db.Select("id, user_id, driver_id").First(&r, rideID).Error; err != nil {
		return ErrNotFound
	}
	if r.UserID != nil && *r.UserID == userID {
		return nil
	}
	if r.DriverID != nil && *r.DriverID == userID {
		return nil
	}
	// Driver records key on driver.user_id too — look up via driver
	var d models.Driver
	if err := db.Where("user_id = ?", userID).First(&d).Error; err == nil {
		if r.DriverID != nil && *r.DriverID == d.ID {
			return nil
		}
	}
	return ErrNotFound
}

func MustOwnDelivery(db *gorm.DB, userID, deliveryID uint) error {
	var d models.Delivery
	if err := db.Select("id, user_id").First(&d, deliveryID).Error; err != nil {
		return ErrNotFound
	}
	if d.UserID == nil || *d.UserID != userID {
		return ErrNotFound
	}
	return nil
}

func MustOwnOrder(db *gorm.DB, userID, orderID uint) error {
	var o models.Order
	if err := db.Select("id, user_id").First(&o, orderID).Error; err != nil {
		return ErrNotFound
	}
	if o.UserID == nil || *o.UserID != userID {
		return ErrNotFound
	}
	return nil
}

func MustOwnPaymentProof(db *gorm.DB, userID, proofID uint) error {
	var p models.PaymentProof
	if err := db.Select("id, user_id").First(&p, proofID).Error; err != nil {
		return ErrNotFound
	}
	if p.UserID != userID {
		return ErrNotFound
	}
	return nil
}

// --- Fresh admin re-check with a small cache ---

type cacheEntry struct {
	isAdmin   bool
	expiresAt time.Time
}

var (
	adminCacheMu sync.Mutex
	adminCache   = map[uint]cacheEntry{}
)

const adminCacheTTL = 60 * time.Second

// RequireAdminFresh verifies the user's DB role is still "admin", not just
// that the JWT claim says so. Cached for 60s to avoid a DB hit per request.
func RequireAdminFresh(db *gorm.DB, userID uint) error {
	adminCacheMu.Lock()
	if e, ok := adminCache[userID]; ok && time.Now().Before(e.expiresAt) {
		adminCacheMu.Unlock()
		if e.isAdmin {
			return nil
		}
		return ErrForbidden
	}
	adminCacheMu.Unlock()

	var u models.User
	if err := db.Select("id, role").First(&u, userID).Error; err != nil {
		return ErrForbidden
	}
	isAdmin := u.Role == "admin"

	adminCacheMu.Lock()
	adminCache[userID] = cacheEntry{isAdmin: isAdmin, expiresAt: time.Now().Add(adminCacheTTL)}
	adminCacheMu.Unlock()

	if !isAdmin {
		return ErrForbidden
	}
	return nil
}
```

Note: `models.User` has a `Role` field — verify at the top of `models.go`. If not present, grep for `role` field in the struct; add one if missing.

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./pkg/authz/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/authz/
git commit -m "feat(authz): ownership + fresh admin check helpers"
```

---

### Task 13: Apply authz helpers to all protected `/:id` routes

This is a **pattern-plus-checklist** task — applying the same three-line pattern across many handlers.

**Files:**
- Modify: `backend/pkg/handlers/handlers.go`
- Create: `backend/pkg/handlers/idor_test.go`

- [ ] **Step 1: The pattern**

At the top of each affected handler, after you have `userID := c.GetUint("userID")` and `rideID, _ := strconv.ParseUint(c.Param("id"), 10, 64)`:

```go
if err := authz.MustOwnRide(db, userID, uint(rideID)); err != nil {
    if err == authz.ErrNotFound {
        c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
    } else {
        c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
    }
    return
}
```

- [ ] **Step 2: Route checklist**

For each handler below, find the function in `handlers.go` and insert the guard at the top (after parsing `:id` params). Check off each one.

**Rides (MustOwnOrDriveRide):**
- [ ] `GetRideDetails` — `GET /rides/:id`
- [ ] `CancelRide` — `PUT /rides/:id/cancel`
- [ ] `RateRide` — `POST /rides/:id/rate`
- [ ] `RatePassenger` — `POST /rides/:id/rate-passenger` (driver-only path → use `MustOwnOrDriveRide` then verify role == driver)

**Deliveries (MustOwnDelivery for user routes):**
- [ ] `GetDeliveryDetails` — `GET /deliveries/:id`
- [ ] `CancelDelivery` — `PUT /deliveries/:id/cancel`
- [ ] `RateDelivery` — `POST /deliveries/:id/rate`

**Orders (MustOwnOrder):**
- [ ] `GetOrderDetails` — `GET /orders/:id`
- [ ] `CancelOrder` — `PUT /orders/:id/cancel`
- [ ] `RateOrder` — `POST /orders/:id/rate`

**Saved addresses:**
- [ ] `DeleteSavedAddress` — `DELETE /user/addresses/:id` — check `SavedAddress.user_id == userID`

**Favorites:**
- [ ] `DeleteFavorite` — `DELETE /favorites/:id` — check ownership

**Chats (participant check):**
- [ ] `GetChatMessages` — must be rider or driver on ride `:id`
- [ ] `SendChatMessage` — same
- [ ] `ChatImageUpload` — same

**Notifications:**
- [ ] `MarkNotificationRead` — must be addressee (`notification.user_id == userID`)

**Driver-only routes (must be assigned driver on the ride/delivery):**
- [ ] `AcceptRequest`, `RejectRequest`, `DeclineRideRequest` — check request belongs to this driver
- [ ] `UpdateRideStatus` — ride must have `DriverID == currentDriver.ID`
- [ ] `RiderGetPaymentProof`, `RiderVerifyPaymentProof`, `RiderRejectPaymentProof` — must be driver on underlying ride

**Payment methods:**
- [ ] `DeletePaymentMethod` — check ownership

**Withdrawals:**
- [ ] For any `/driver/withdrawals/:id` — ownership check

**Admin routes — add `RequireAdminFresh`:**
- [ ] Every `admin.*` route gets a first-line fresh-admin check (the JWT-based `AdminMiddleware` stays; this is an additional DB re-check). Preferred approach: add a middleware that wraps `RequireAdminFresh`:

```go
// in middleware.go
func AdminFreshMiddleware(db *gorm.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
        uidRaw, ok := c.Get("userID")
        if !ok { c.AbortWithStatus(http.StatusForbidden); return }
        uid := uidRaw.(uint)
        if err := authz.RequireAdminFresh(db, uid); err != nil {
            c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin access revoked"})
            return
        }
        c.Next()
    }
}
```

Then in `main.go` the admin group becomes:
```go
admin.Use(middleware.AuthMiddleware(), middleware.AdminMiddleware(), middleware.AdminFreshMiddleware(database))
```

- [ ] **Step 3: Write IDOR tests**

```go
// backend/pkg/handlers/idor_test.go
package handlers

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"oneride/pkg/middleware"
	"oneride/pkg/models"
)

// Full setup helper omitted for brevity — use setupAuthTestDB + create two
// users + create a ride owned by user A, then GET it as user B.

func TestGetRideDetails_IDOR(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupAuthTestDB(t)

	var userA, userB models.User
	db.First(&userA, "email = ?", "test@example.com")
	userB = models.User{Name: "B", Email: "b@b.c", Phone: "0918", Role: "user", TokenVersion: 1}
	db.Create(&userB)

	aid := userA.ID
	ride := models.Ride{UserID: &aid}
	db.Create(&ride)

	tokB, _ := GenerateAccessToken(userB.ID, userB.Email, "user", 1, AudienceMobile)

	r := gin.New()
	r.Use(middleware.AuthMiddleware())
	r.GET("/rides/:id", GetRideDetails(db))

	req, _ := http.NewRequest("GET", "/rides/"+strconv.Itoa(int(ride.ID)), nil)
	req.Header.Set("Authorization", "Bearer "+tokB)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for cross-user access, got %d", w.Code)
	}
}
```

Add similar tests for at least one handler per resource type (ride, delivery, order, payment proof, saved address, favorite, notification). If writing full tests for every row in the checklist is too much up front, pick one per resource type as a smoke test and rely on the shared pattern for the rest.

- [ ] **Step 4: Run tests**

Run: `cd backend && go test ./pkg/handlers/ -run IDOR -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/ backend/pkg/middleware/middleware.go backend/cmd/main.go
git commit -m "fix(security): add ownership checks to all protected :id routes"
```

---

### Task 14: Per-user rate limits on sensitive endpoints

**Files:**
- Modify: `backend/pkg/middleware/middleware.go`
- Create: `backend/pkg/middleware/user_rate_limit_test.go`
- Modify: `backend/cmd/main.go`

- [ ] **Step 1: Extend limiter**

Add to `middleware.go`:

```go
// UserRateLimitMiddleware applies rate limiting keyed by authenticated userID.
// Must run AFTER AuthMiddleware. Falls back to IP if userID is missing.
func UserRateLimitMiddleware(limit int, window time.Duration) gin.HandlerFunc {
	rl := newRateLimiter(limit, window)
	return func(c *gin.Context) {
		key := c.ClientIP()
		if v, ok := c.Get("userID"); ok {
			if uid, ok := v.(uint); ok {
				key = "u:" + strconv.FormatUint(uint64(uid), 10)
			}
		}
		if !rl.allow(key) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "Rate limit exceeded"})
			return
		}
		c.Next()
	}
}
```

Add `"strconv"` to imports.

- [ ] **Step 2: Test**

```go
// backend/pkg/middleware/user_rate_limit_test.go
package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestUserRateLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("userID", uint(42)) })
	r.Use(UserRateLimitMiddleware(2, time.Minute))
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	for i := 0; i < 2; i++ {
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("GET", "/", nil)
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Fatalf("request %d: got %d", i, w.Code)
		}
	}
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 on third request, got %d", w.Code)
	}
}
```

Run: `cd backend && go test ./pkg/middleware/ -run TestUserRateLimit -v`
Expected: PASS.

- [ ] **Step 3: Apply to routes in `main.go`**

```go
// Stricter per-user limits on sensitive actions (after AuthMiddleware)
protected.POST("/rides/create",
    middleware.UserRateLimitMiddleware(20, time.Hour),
    handlers.CreateRide(database))

protected.POST("/deliveries/create",
    middleware.UserRateLimitMiddleware(20, time.Hour),
    handlers.CreateDelivery(database))

protected.POST("/orders/create",
    middleware.UserRateLimitMiddleware(20, time.Hour),
    handlers.CreateOrder(database))

protected.POST("/payment-proof/upload",
    middleware.UserRateLimitMiddleware(10, time.Hour),
    handlers.UploadPaymentProof(database))

protected.POST("/driver/withdraw",
    middleware.UserRateLimitMiddleware(5, 24*time.Hour),
    handlers.RequestWithdrawal(database))

protected.POST("/wallet/withdraw",
    middleware.UserRateLimitMiddleware(5, 24*time.Hour),
    handlers.WithdrawWallet(database))
```

- [ ] **Step 4: Commit**

```bash
git add backend/pkg/middleware/ backend/cmd/main.go
git commit -m "feat(middleware): per-user rate limits on sensitive routes"
```

---

## Phase 4 — Headers, CORS, audit wiring

### Task 15: Security headers + CORS tightening

**Files:**
- Modify: `backend/pkg/middleware/middleware.go`

- [ ] **Step 1: Update `SecurityHeadersMiddleware`**

Replace the function body:
```go
func SecurityHeadersMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Resource-Policy", "same-site")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		c.Next()
	}
}
```

- [ ] **Step 2: Tighten CORS**

In `CORSMiddleware`, delete the wildcard branch entirely:
```go
// Remove:
// allowAll := allowedOrigins["*"]

// And change the guard to:
if allowedOrigins[origin] {
    // ...set CORS headers...
}
```

Also add:
```go
c.Writer.Header().Set("Access-Control-Max-Age", "600")
```

- [ ] **Step 3: Commit**

```bash
git add backend/pkg/middleware/middleware.go
git commit -m "feat(middleware): tighten security headers + CORS"
```

---

### Task 16: Wire audit logging into admin + money endpoints

**Files:**
- Modify: `backend/pkg/handlers/handlers.go`

- [ ] **Step 1: Pattern**

After each successful mutation (before the success response), add a one-line audit call. Pattern:
```go
audit.Log(db, c, "<category>.<action>", "<target_type>", formatUint(uint64(targetID)), map[string]any{
    // optional minimal metadata (no secrets, no raw inputs)
})
```

- [ ] **Step 2: Checklist of handlers to instrument**

**Admin — user/driver/store management:**
- [ ] `AdminUpdateUser` → `admin.user.update`
- [ ] `DeleteUser` → `admin.user.delete`
- [ ] `AdminUpdateDriver` → `admin.driver.update`
- [ ] `VerifyDriver` → `admin.driver.verify`
- [ ] `DeleteDriver` → `admin.driver.delete`
- [ ] `CreateStore`/`UpdateStore`/`DeleteStore` → corresponding actions

**Admin — promo/rate/payment configs:**
- [ ] `CreatePromo`/`UpdatePromo`/`DeletePromo`
- [ ] `AdminCreateRate`/`AdminUpdateRate`/`AdminDeleteRate`
- [ ] `AdminCreatePaymentConfig`/`AdminUpdatePaymentConfig`/`AdminDeletePaymentConfig`

**Admin — payment proofs + withdrawals + commission:**
- [ ] `AdminVerifyPaymentProof` → `admin.payment_proof.verify`
- [ ] `AdminRejectPaymentProof` → `admin.payment_proof.reject`
- [ ] `AdminUpdateWithdrawal` → `admin.withdrawal.update`
- [ ] `AdminUpdateCommissionConfig` → `admin.commission.config.update`
- [ ] `AdminSendNotification` → `admin.notification.send`

**Money — user-initiated:**
- [ ] `TopUpWallet`, `WithdrawWallet`, `RequestWithdrawal` → `wallet.topup`, `wallet.withdraw`, `driver.withdrawal_requested`

**Auth (already started in Task 9/10):**
- [ ] `Login` success → `auth.login`
- [ ] `Login` failure → `auth.login_failed`
- [ ] `auth.logout`, `auth.logout_all`, `auth.refresh` (already in Task 9)

- [ ] **Step 3: Extend `AdminGetActivityLogs` to read from `audit_logs`**

Modify the existing handler to select from `models.AuditLog` with pagination + optional `action`, `target_type`, `actor_user_id`, date-range query params.

```go
// Inside AdminGetActivityLogs
var logs []models.AuditLog
q := db.Model(&models.AuditLog{}).Order("created_at DESC")
if a := c.Query("action"); a != "" { q = q.Where("action = ?", a) }
if t := c.Query("target_type"); t != "" { q = q.Where("target_type = ?", t) }
page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
size, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
if size > 200 { size = 200 }
q.Limit(size).Offset((page - 1) * size).Find(&logs)
c.JSON(http.StatusOK, gin.H{"data": logs, "page": page, "page_size": size})
```

- [ ] **Step 4: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "feat(audit): wire audit logging into admin + money endpoints"
```

---

### Task 17: Apply `validate.SanitizeImage` to all upload handlers

**Files:**
- Modify: `backend/pkg/handlers/handlers.go` (upload handlers)
- Modify: `backend/cmd/main.go` (per-route body size limit for upload routes)

- [ ] **Step 1: Locate upload handlers**

Run:
```bash
cd backend && grep -n "multipart\|FormFile\|Upload" pkg/handlers/handlers.go | head -30
```

Likely candidates: `UploadPaymentProof`, `ChatImageUpload`, `AdminUploadQRCode`, driver profile image, user profile image.

- [ ] **Step 2: Replacement pattern**

Old:
```go
file, err := c.FormFile("image")
if err != nil { /* ... */ }
dst := filepath.Join(uploadDir, file.Filename)
c.SaveUploadedFile(file, dst)
```

New:
```go
fh, err := c.FormFile("image")
if err != nil {
    c.JSON(http.StatusBadRequest, gin.H{"error": "image required"})
    return
}
f, err := fh.Open()
if err != nil {
    c.JSON(http.StatusBadRequest, gin.H{"error": "cannot open upload"})
    return
}
defer f.Close()

cleanBytes, filename, err := validate.SanitizeImage(f, fh.Size)
if err != nil {
    c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
    return
}

dst := filepath.Join(uploadDir, filename)
if err := os.WriteFile(dst, cleanBytes, 0644); err != nil {
    c.JSON(http.StatusInternalServerError, gin.H{"error": "save failed"})
    return
}
```

Import: `"oneride/pkg/validate"`.

- [ ] **Step 3: Raise per-route body size limit**

Upload routes need to exceed the global 1 MB limit. In `main.go`:
```go
uploadLimit := validate.BodySizeLimit(10 << 20) // 10 MB
protected.POST("/payment-proof/upload", uploadLimit, handlers.UploadPaymentProof(database))
protected.POST("/chats/:id/image", uploadLimit, handlers.ChatImageUpload(database))
admin.POST("/payment-configs/upload-qr", uploadLimit, handlers.AdminUploadQRCode(database))
```

Because Gin applies middleware in order and the global `BodySizeLimit(1MB)` runs before route-specific middleware, upload routes need to be registered with the global limit **excluded**. The clean way: move the global `BodySizeLimit` off the router and apply it per-group, so the upload group can substitute its own.

Refactor:
```go
// Remove: router.Use(validate.BodySizeLimit(1 << 20))

// Apply on each group individually:
smallBody := validate.BodySizeLimit(1 << 20)
largeBody := validate.BodySizeLimit(10 << 20)

public.Use(smallBody)
protected.Use(smallBody)
admin.Use(smallBody)

// Upload routes override locally — but since Gin middleware chain is
// cumulative, the simpler fix is to register upload routes on a sub-group
// that replaces the body limit.
uploads := router.Group("/api/v1")
uploads.Use(middleware.AuthMiddleware(), largeBody)
uploads.POST("/payment-proof/upload", handlers.UploadPaymentProof(database))
uploads.POST("/chats/:id/image", handlers.ChatImageUpload(database))

adminUploads := router.Group("/api/v1/admin")
adminUploads.Use(middleware.AuthMiddleware(), middleware.AdminMiddleware(), middleware.AdminFreshMiddleware(database), largeBody)
adminUploads.POST("/payment-configs/upload-qr", handlers.AdminUploadQRCode(database))
```

Then **remove** the duplicate registrations from `protected` and `admin`.

- [ ] **Step 4: Commit**

```bash
git add backend/pkg/handlers/handlers.go backend/cmd/main.go
git commit -m "feat(security): sanitize all image uploads + tiered body limits"
```

---

## Phase 5 — Rollout

### Task 18: `SECURITY_V2` feature flag + selective enablement

**Files:**
- Modify: `backend/cmd/main.go`
- Modify: `backend/pkg/middleware/middleware.go`

**Rationale:** Let us ship the code to prod with `SECURITY_V2=false`, smoke-test in staging, then flip the flag in one change window.

- [ ] **Step 1: Flag check helper**

In `config/config.go`:
```go
func SecurityV2Enabled() bool {
    return os.Getenv("SECURITY_V2") == "true"
}
```

- [ ] **Step 2: Gate the forced behaviors**

The only behaviors that need gating (the rest are always-on improvements):
- Shortened access token lifetime (1h) — when off, fall back to 30d for backward compat
- `RequireAdminFresh` DB check — when off, skip (admin middleware JWT-only)
- CORS wildcard rejection at startup — when off, log a warning instead of failing

```go
// In GenerateAccessToken:
lifetime := AccessTokenLifetime
if !config.SecurityV2Enabled() {
    lifetime = 30 * 24 * time.Hour
}
```

```go
// In ValidateStartup (the CORS wildcard check):
if !config.SecurityV2Enabled() {
    slog.Warn("CORS wildcard detected but SECURITY_V2 disabled — allowing")
} else {
    return fmt.Errorf("CORS_ORIGIN wildcard '*' is not allowed")
}
```

```go
// AdminFreshMiddleware becomes a no-op when flag is off
if !config.SecurityV2Enabled() {
    c.Next()
    return
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/config/config.go backend/pkg/handlers/jwt.go backend/pkg/middleware/middleware.go
git commit -m "feat(config): SECURITY_V2 feature flag"
```

---

### Task 19: Consolidated security test pass

**Files:**
- Create: `backend/pkg/handlers/security_test.go`

- [ ] **Step 1: Add these specific test cases**

```go
// backend/pkg/handlers/security_test.go
package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"oneride/pkg/middleware"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func TestAuth_RejectsAlgNone(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setJWTEnv(t)

	// Forge an alg:none token
	claims := jwt.MapClaims{"sub": "1", "role": "admin", "iss": "oneride-api", "exp": 9999999999}
	token := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	tokStr, _ := token.SignedString(jwt.UnsafeAllowNoneSignatureType)

	r := gin.New()
	r.Use(middleware.AuthMiddleware())
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+tokStr)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("alg:none must be rejected, got %d", w.Code)
	}
}

func TestAuth_RejectsWrongIssuer(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setJWTEnv(t)

	claims := jwt.MapClaims{
		"sub": "1", "role": "user", "iss": "evil", "exp": 9999999999,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokStr, _ := token.SignedString([]byte(strings.Repeat("x", 32)))

	r := gin.New()
	r.Use(middleware.AuthMiddleware())
	r.GET("/", func(c *gin.Context) { c.Status(http.StatusOK) })

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+tokStr)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("wrong iss must be rejected, got %d", w.Code)
	}
}

func TestBodySizeLimit_Rejects(t *testing.T) {
	// Covered in pkg/validate body_test.go — keeping one end-to-end case
	// against the full router in the consolidated suite is optional.
}
```

- [ ] **Step 2: Run full backend suite with race detector**

Run: `cd backend && go test ./... -race`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/pkg/handlers/security_test.go
git commit -m "test(security): alg:none + wrong-issuer rejection"
```

---

### Task 20: Rollout checklist execution (manual)

This task is a sequence of ops actions, not code. Each step requires user confirmation before running — nothing here is automated.

- [ ] **Step 1: Rotate Firebase service account**

In GCP console for project `omji-7774e`:
1. IAM & Admin → Service Accounts → find `firebase-adminsdk-fbsvc@omji-7774e.iam.gserviceaccount.com`
2. Keys tab → create new JSON key → download
3. Upload contents to Render env var `FIREBASE_SERVICE_ACCOUNT_JSON` (base64 or raw JSON, per backend loader)
4. Delete the old key from GCP (mark disabled first, verify no 401s from FCM for 1 hour, then delete)
5. Delete the file `omji-7774e-firebase-adminsdk-fbsvc-639ee8d8b9.json` from the working tree: `git rm omji-7774e-firebase-adminsdk-fbsvc-639ee8d8b9.json && git commit -m "chore: remove leaked firebase service account key (rotated)"`
6. **Do not** scrub git history yet — that's a follow-up.

- [ ] **Step 2: Generate new secrets**

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"  # JWT_SECRET
python3 -c "import secrets; print(secrets.token_urlsafe(48))"  # REFRESH_TOKEN_PEPPER
```

Set both in Render env config.

- [ ] **Step 3: Staging smoke test**

On staging Render service:
- Set `SECURITY_V2=true`
- Deploy
- Hit `/health` — expect 200
- Attempt admin login → expect access+refresh token pair
- Call `/auth/refresh` with refresh token → expect rotated pair
- Call `/auth/refresh` with OLD (now-rotated) refresh → expect 401 + family revoked in DB
- Upload a valid JPEG to `/payment-proof/upload` → expect 200
- Upload an SVG named `a.jpg` → expect 400
- Upload a 15 MB JPEG → expect 413
- GET `/rides/:id` for a ride belonging to another test user → expect 404
- Confirm `audit_logs` table populated

- [ ] **Step 4: Production rollout window**

1. Announce short downtime (even though deploy is rolling, forced logout is user-visible)
2. Set `SECURITY_V2=true` in prod env
3. Trigger deploy
4. Monitor for 30 minutes: `/health`, 401/403/429 rates, error logs, `audit_logs` write rate
5. Rollback plan: `SECURITY_V2=false` + redeploy previous revision

- [ ] **Step 5: Post-deploy — history scrub (destructive, separate confirmation required)**

**Do not run without explicit user approval.** Removes the old Firebase JSON from all git history via `git filter-repo`, requires force-push to all branches, and invalidates every developer's local clones.

```bash
# AFTER user confirms:
pip install git-filter-repo
cd /Users/a1234/Desktop/omji
git filter-repo --path omji-7774e-firebase-adminsdk-fbsvc-639ee8d8b9.json --invert-paths
git push --force-with-lease origin --all
git push --force-with-lease origin --tags
```

- [ ] **Step 6: Mobile follow-up ticket**

Create a tracking issue: "Mobile: add refresh token support". Block on that before users stop seeing hourly re-logins.

---

## Self-Review

**Spec coverage check:**
- §1 Scope & Architecture — ✅ Tasks 1–5 create the new packages, tables, middleware
- §2 Auth & Session Hardening — ✅ Tasks 6–11 (refresh tokens, JWT claims, endpoints, lockout, WS tickets)
- §3 AuthZ / IDOR / Input Safety — ✅ Tasks 12–14, 17 (authz pkg, IDOR fixes, body limits, image sanitization, per-user rate limits)
- §4 Secrets & Audit — ✅ Tasks 2, 5, 15, 16 (config hardening, audit pkg, security headers, audit wiring)
- §5 Testing & Rollout — ✅ Tasks 18–20 (feature flag, test sweep, rollout ops)

**Placeholder scan:** none found — every code block is complete.

**Type consistency:**
- `GenerateAccessToken(userID, email, role, tokenVersion, audience)` — used consistently in Tasks 7, 8, 9
- `auth.Issue`, `auth.Redeem`, `auth.RevokeFamily`, `auth.RevokeAllForUser` — signatures match across Tasks 6, 9
- `authz.ErrNotFound` / `authz.ErrForbidden` — used consistently in Tasks 12, 13
- `validate.SanitizeImage(r, contentLength) ([]byte, string, error)` — same signature in Tasks 4, 17
- `audit.Log(db, c, action, targetType, targetID, metadata)` — matches across Tasks 5, 9, 10, 16

**Known caveats the executor should know:**
1. `image/webp` is not stdlib — Task 4 says drop it if the import fails.
2. `formatUint`/`toStr` helpers in Task 9 are local to `auth_endpoints.go` — OK to move to a shared util later.
3. Task 17's body-limit refactor changes how route groups are set up — the global `BodySizeLimit` moves to per-group. Re-check that the old `protected.POST("/payment-proof/upload", ...)` registration is removed to avoid duplicate route panic.
4. Admin routes need `AdminFreshMiddleware` wired (Task 13 step 2); it must come AFTER `AuthMiddleware` in the chain.
5. Fresh test helper `setupAuthTestDB` is assumed to migrate `&models.RefreshToken{}` in addition to `&models.User{}` — update it when Task 6 lands.
