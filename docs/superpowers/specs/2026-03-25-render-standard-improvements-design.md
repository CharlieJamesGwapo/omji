# Render Standard Plan Backend Improvements

**Date:** 2026-03-25
**Status:** Approved
**Scope:** Backend (Go/Gin) code changes + Render dashboard configuration

## Context

OMJI backend upgraded from Render Free to Standard ($25/mo, 2GB RAM, 1 CPU). This unlocks zero downtime deploys, persistent disk, SSH access, and scaling. The backend has several production-readiness gaps that can now be addressed.

## Goals

1. Enable true zero downtime deploys via graceful shutdown
2. Add meaningful health checks for Render monitoring
3. Harden security (CORS, WebSocket origins, auth rate limiting, security headers)
4. Persist uploaded files across deploys using Render Persistent Disk
5. Add structured request logging for production debugging
6. Configure Render dashboard settings for optimal operation

## Non-Goals

- External service integrations (S3, Sentry, Redis)
- Custom domain setup
- PR preview environments
- Application-level feature changes

---

## 1. Graceful Shutdown

**File:** `cmd/main.go`

**Current behavior:** `router.Run()` — instant termination on SIGTERM, drops in-flight requests and WebSocket connections.

**New behavior:**
- Create `http.Server` with the Gin router as handler
- Use `signal.NotifyContext` to listen for SIGTERM/SIGINT
- On signal: call `server.Shutdown(ctx)` with 10-second timeout
- Close database connection pool after server stops
- Log shutdown events

**Why 10s timeout:** Render sends SIGTERM and waits 30s before SIGKILL. 10s is enough for API requests while leaving buffer.

**WebSocket shutdown:** `http.Server.Shutdown()` does not close long-lived WebSocket connections. During shutdown, explicitly close all tracked WebSocket connections in `RideTracker` and `DriverTracker` so clients receive a clean close frame and can reconnect to the new instance.

**DB connection:** Store the `*sql.DB` reference at startup (from `db.DB()`) for both the health check ping and clean shutdown close.

**Flow:**
```
SIGTERM received → stop accepting new connections → close all WebSocket connections → wait for in-flight (max 10s) → close DB → exit 0
```

## 2. Health Check with DB Validation

**File:** `cmd/main.go` (health endpoint)

**Current behavior:** Returns `{"status": "OMJI Backend is running!"}` always — no DB check.

**New behavior:**
- Call `sqlDB.PingContext(ctx)` with 2-second timeout
- Track server start time for uptime reporting
- Return 200 with `{"status": "healthy", "db": "connected", "uptime": "2h30m"}` on success
- Return 503 with `{"status": "unhealthy", "db": "disconnected"}` on DB failure

**Render dashboard:** Set Health Check Path to `/health`. Render will auto-restart the instance if health checks fail repeatedly.

## 3. Security Hardening

### 3a. CORS Lockdown

**File:** `pkg/middleware/middleware.go` (CORSMiddleware), `render.yaml`

**Current:** `ALLOWED_ORIGINS=*` in render.yaml allows any website to call the API. The middleware sets the raw env var value as the `Access-Control-Allow-Origin` header, which does NOT support comma-separated values per the CORS spec.

**Change:**
- Update `render.yaml`: set `ALLOWED_ORIGINS` to `https://omji-admin.onrender.com`
- Update `CORSMiddleware` to support multiple origins: split `ALLOWED_ORIGINS` on commas, check the request's `Origin` header against the whitelist, and echo back the matching origin. This matches the approach already used by the WebSocket upgrader.
- If no origin matches, don't set the header (browser will block the request)

### 3b. Security Headers Middleware

**File:** `pkg/middleware/middleware.go` (new function)

Add `SecurityHeadersMiddleware()` that sets:
- `X-Content-Type-Options: nosniff` — prevents MIME type sniffing
- `X-Frame-Options: DENY` — prevents clickjacking
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — enforces HTTPS
- `X-XSS-Protection: 1; mode=block` — legacy XSS protection
- `Referrer-Policy: strict-origin-when-cross-origin` — controls referrer leakage

### 3c. WebSocket Origin Validation

**File:** `pkg/handlers/handlers.go` (WebSocket upgrader)

**Status:** Already implemented — the WebSocket upgrader already reads `ALLOWED_ORIGINS`, splits on commas, and allows empty origins for mobile clients. No code change needed. The only action is changing the `ALLOWED_ORIGINS` env var from `*` to the admin URL (covered in Section 6).

### 3d. Auth Route Rate Limiting

**File:** `pkg/middleware/middleware.go`

**Current:** All routes share the same 120 req/min limit.

**Change:** Add a separate `AuthRateLimitMiddleware(20)` applied only to `/api/v1/public/auth/*` routes — 20 requests per minute per IP to prevent brute force login/OTP attempts. This creates a second independent rate limiter instance; auth routes will be tracked by both the global limiter (120/min) and the auth limiter (20/min). This is intentional — the auth limit is stricter and will trigger first.

### 3e. Admin Password Logging

**File:** `pkg/db/database.go` (seedData function)

**Current:** Logs the auto-generated admin password in plaintext: `log.Printf("password: %s", adminPassword)`

**Change:** Only log that the admin was created. If auto-generated, log instructions to check via SSH or set `ADMIN_PASSWORD` env var. Never log the actual password value.

Wait — the admin password is only generated once on first seed when no admin exists. After that it's in the DB hashed. The concern is that the plaintext appears in Render's log stream which persists. With the Standard plan the user can set `ADMIN_PASSWORD` env var, so:
- If `ADMIN_PASSWORD` is set: log "Admin created with password from ADMIN_PASSWORD env var"
- If auto-generated: log "Admin created with auto-generated password. Set ADMIN_PASSWORD env var and redeploy to use a known password." Do NOT log the password itself.

## 4. Persistent Disk for Uploads

### 4a. Render Dashboard Configuration

- Add Persistent Disk: Name `uploads-data`, Mount Path `/var/data/uploads`, Size 1GB
- Cost: $0.25/month

**render.yaml disk config:**
```yaml
disk:
  name: uploads-data
  mountPath: /var/data/uploads
  sizeGB: 1
```

### 4b. Environment Variable

Add `UPLOAD_DIR` env var:
- Render: `/var/data/uploads`
- Local dev: `./uploads` (default fallback)

### 4c. Code Changes

**File:** `cmd/main.go`
- Read `UPLOAD_DIR` env var (default `./uploads`)
- `os.MkdirAll(uploadDir, 0755)`
- `router.Static("/uploads", uploadDir)`

**File:** `pkg/handlers/handlers.go` — three distinct upload paths to update:
1. **Delivery item photo** (~line 865): `os.MkdirAll("uploads", ...)` + `"uploads/" + filename`
2. **Driver documents** (~line 1556): `os.MkdirAll("uploads", ...)` + `"uploads/" + filename` (profile_photo, license_photo, orcr_photo, id_photo)
3. **QR code uploads** (~line 4278): `filepath.Join("uploads", "qr", filename)` — uses a subdirectory

All three must be updated to use `UPLOAD_DIR` env var. The QR path becomes `filepath.Join(uploadDir, "qr", filename)`.

### 4d. Dockerfile Change

**File:** `backend/Dockerfile`
- Add `RUN mkdir -p /var/data/uploads` in runtime stage so the directory exists even before disk is mounted

## 5. Structured Request Logging

**File:** `pkg/middleware/logger.go` (new file)

Create `RequestLoggerMiddleware()` using Go's standard `log/slog` package:
- Logs: method, path, status code, latency (ms), client IP, user agent
- Format: JSON (structured, searchable in Render logs)
- Skip logging `/health` endpoint (too noisy)
- Applied globally in `main.go`

**Example output:**
```json
{"time":"2026-03-25T10:30:00Z","level":"INFO","msg":"request","method":"POST","path":"/api/v1/rides/create","status":200,"latency_ms":45,"ip":"1.2.3.4"}
```

**Also update:** Replace `log.Printf`/`log.Println` calls in `main.go` and `database.go` with `slog.Info`/`slog.Error` for consistency. Keep `log.Fatalf` calls as-is since `slog` has no Fatal level — `log.Fatalf` correctly calls `os.Exit(1)`. Existing handler-level `log.Printf` calls are left as-is to minimize blast radius.

## 6. Render Dashboard Configuration

These are manual steps in the Render dashboard (not code):

| Setting | Current | New Value |
|---------|---------|-----------|
| Health Check Path | *(empty)* | `/health` |
| `ALLOWED_ORIGINS` env var | `*` | `https://omji-admin.onrender.com` |
| `UPLOAD_DIR` env var | *(not set)* | `/var/data/uploads` |
| Edge Caching | None | Enable — Render auto-caches cacheable responses at edge based on Cache-Control headers. No path config needed; just enable the "All Cacheable Content" profile in dashboard. Static uploads will benefit from edge serving. |
| Persistent Disk | *(none)* | 1GB at `/var/data/uploads` |

## Files Changed

| File | Type | Changes |
|------|------|---------|
| `cmd/main.go` | Modified | Graceful shutdown, health check with DB ping, upload dir from env, security headers middleware, request logger middleware, auth rate limiter on public routes |
| `pkg/middleware/middleware.go` | Modified | SecurityHeadersMiddleware, AuthRateLimitMiddleware, WebSocket origin helper |
| `pkg/middleware/logger.go` | New | RequestLoggerMiddleware using slog |
| `pkg/db/database.go` | Modified | Remove admin password plaintext logging, use slog |
| `pkg/handlers/handlers.go` | Modified | Upload dir from env var, WebSocket origin validation |
| `backend/Dockerfile` | Modified | Create /var/data/uploads directory |
| `backend/render.yaml` | Modified | ALLOWED_ORIGINS value, disk config, UPLOAD_DIR env var |

## Dependencies

**None added.** All changes use Go standard library (`net/http`, `os/signal`, `log/slog`, `context`).

## Risks

- **Persistent Disk mount:** If disk isn't attached in Render before deploy, uploads fall back to ephemeral `./uploads` via env var default. No data loss risk — just same behavior as before.
- **CORS lockdown:** If there are other frontends calling the API (beyond the admin panel and mobile app), they'll be blocked. Mobile apps (React Native) don't send Origin headers, so they're unaffected.
- **Auth rate limit (20/min):** Legitimate users making >20 login attempts per minute from same IP would be blocked. This is extremely unlikely in normal usage.

## Testing

- Graceful shutdown: `kill -SIGTERM <pid>` locally, verify clean shutdown log
- Health check: Stop local PostgreSQL, hit `/health`, verify 503 response
- Security headers: Check response headers with `curl -I`
- Upload persistence: Upload file, restart server, verify file still exists
- Request logging: Make API calls, verify structured JSON in stdout
- CORS: Try cross-origin request from unauthorized domain, verify rejection
- Auth rate limit: Send 21 rapid login requests, verify 429 on 21st
