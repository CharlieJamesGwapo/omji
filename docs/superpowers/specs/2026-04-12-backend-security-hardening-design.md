# Backend API Security Hardening — Design Spec

**Date:** 2026-04-12
**Author:** Brainstorming session (Charlie James + Claude)
**Scope:** `backend/` Go service only
**Status:** Draft — awaiting user review before implementation planning

## Reality Check

No system is "unhackable." This spec aims for **hardened and auditable**:
industry-standard controls (OWASP API Top 10), defense in depth, and audit
trails so incidents can be detected and investigated. Anyone promising that
hackers "cannot hack this" is misleading you.

## 1. Scope & Architecture

### In scope
Backend Go API (`backend/`) — auth, authz, input validation, rate limiting,
secrets, audit logging, security tests.

### Out of scope (each gets its own spec)
- Admin web UI hardening (CSP tuning, client-side)
- Mobile app changes beyond one-time re-login
- Payment gateway integration (PayMongo / Xendit / Stripe)
- Infra / WAF / DDoS (Cloudflare, etc.)
- Formal penetration test (recommended follow-up)

### New internal packages
```
backend/pkg/
├── authz/          NEW — ownership & role helpers
├── validate/       NEW — body limits, file upload pipeline
├── audit/          NEW — append-only audit log writer
├── middleware/     EXTENDED — per-user limiter, body-size, CSP, request ID
├── handlers/       TOUCHED — safe claims, refresh tokens, authz calls
└── models/         EXTENDED — RefreshToken, AuditLog
```

### New DB tables
- `refresh_tokens(id, user_id, token_hash, expires_at, revoked_at, family_id, user_agent, ip, created_at)`
- `audit_logs(id, actor_user_id, actor_role, action, target_type, target_id, metadata JSONB, ip, user_agent, request_id, created_at)`

### Design principle
Every sensitive action flows through three gates:
**auth** (valid JWT) → **authz** (role + ownership) → **audit** (log the decision).
No handler skips this.

## 2. Auth & Session Hardening

### Token model (replaces current 30-day JWT)
| Token | Lifetime | Storage | Purpose |
|---|---|---|---|
| Access token (JWT) | 1 hour | memory (mobile) / httpOnly cookie (admin web) | API calls |
| Refresh token | 14 days, rotating | DB-tracked, SHA-256 hashed with pepper | Issue new access tokens |

### JWT claims
`iss: "oneride-api"`, `aud: "oneride-mobile" | "oneride-admin"`, `jti` (unique),
`iat`, `nbf`, `exp`, `sub` (user id as string), `role`, `token_version` (bumped
on password change / logout-all).

### Parsing hardening
- `jwt.WithValidMethods([]string{"HS256"})` — explicit allowlist (defeats `alg: none` / key confusion)
- `jwt.WithIssuer`, `jwt.WithAudience`, `jwt.WithExpirationRequired`
- Safe type assertions with `ok` checks — no panics on malformed claims
- Reject tokens whose `token_version` < user's current version (DB lookup, 60s cache)

### New endpoints
- `POST /api/v1/public/auth/refresh` — exchange refresh → new access + rotated refresh
- `POST /api/v1/auth/logout` — revoke current refresh token
- `POST /api/v1/auth/logout-all` — revoke all user's refresh tokens + bump `token_version`

### Refresh token rules
- Stored as `sha256(pepper || token)` — raw token never persisted
- One-time-use with rotation (each refresh issues a new token, old one revoked)
- Reuse detection → revoke entire `family_id` + audit event + force login
- Max 10 active per user (oldest revoked on overflow)

### WebSocket auth fix
Current: access token in `?token=` query string (gets logged). Replace with
**one-time ticket**:
1. Client `POST /api/v1/ws/ticket` (authenticated) → random 32-byte ticket, 30s TTL, single-use
2. Client connects `wss://…/ws/tracking/:rideId?ticket=…`
3. Server validates + deletes ticket, upgrades connection

30-second window limits leak blast radius. Removes access token from URLs and
proxy logs.

### Password policy
- Min 10 characters
- bcrypt cost 12
- Lockout: 5 failed logins / account → 15-minute cool-down
- Per-account rate limit on login endpoint (in addition to per-IP)

### Forced-logout migration
Rotate `JWT_SECRET` at deploy → all existing 30-day tokens invalidated →
clients fall back to login. Mobile adds refresh logic in follow-up release;
until then, users re-login every hour. Acceptable cost for one deploy cycle.

## 3. Authorization, IDOR Protection & Input Safety

### 3a. `pkg/authz` helpers
```go
authz.MustOwnRide(db, userID, rideID) error
authz.MustOwnOrDriveRide(db, userID, rideID) error     // passenger OR assigned driver
authz.MustOwnDelivery(db, userID, deliveryID) error
authz.MustOwnOrder(db, userID, orderID) error
authz.MustOwnPaymentProof(db, userID, proofID) error
authz.MustOwnAddress(db, userID, addressID) error
authz.MustOwnFavorite(db, userID, favoriteID) error
authz.MustOwnWithdrawal(db, userID, withdrawalID) error
authz.RequireAdminFresh(db, userID) error              // DB re-check, cached 60s
```

Typed errors map to consistent HTTP responses. **Return 404 for "not found
OR not yours"** to prevent user/resource enumeration.

### 3b. Handler audit + fix pass
Every protected route with `:id` gets a guard. Deliverable: a table in the
implementation plan listing every such route and its guard. Routes to audit
(non-exhaustive, from `cmd/main.go`):

- `/user/addresses/:id` → `MustOwnAddress`
- `/rides/:id`, `/rides/:id/cancel`, `/rides/:id/rate`, `/rides/:id/rate-passenger` → `MustOwnOrDriveRide`
- `/deliveries/:id`, `/deliveries/:id/cancel`, `/deliveries/:id/rate`, `/deliveries/:id/rate-passenger` → `MustOwnDelivery`
- `/orders/:id`, `/orders/:id/cancel`, `/orders/:id/rate` → `MustOwnOrder`
- `/payments/methods/:id` → owner check
- `/payment-proof/:serviceType/:serviceId` → owner check
- `/favorites/:id` → `MustOwnFavorite`
- `/chats/:id/*` → must be participant (passenger or assigned driver)
- `/driver/requests/:id/*` → must be the targeted driver
- `/driver/rides/:id/status`, `/driver/deliveries/:id/status` → must be assigned driver
- `/driver/payment-proof/:id/*` → must be driver on the underlying ride
- `/notifications/:id/read` → must be the addressee
- All `/admin/*` write routes → `RequireAdminFresh`

### 3c. Input validation (`pkg/validate`)
- **Body size limit middleware:** 1 MB default; 10 MB on upload routes only. Enforced *before* JSON parse via `http.MaxBytesReader`. Exceeding → 413.
- **Struct validation:** every request DTO uses `binding:"required,..."` tags (email, min/max length, numeric ranges, enum whitelists for statuses). Reject unknown fields.
- **File upload pipeline** (`validate.Image`):
  1. `Content-Length` ≤ 10 MB
  2. Sniff first 512 bytes via `http.DetectContentType` — must be `image/jpeg | image/png | image/webp`
  3. Fully decode with stdlib `image` package — confirms real image, rejects SVG / zip bombs / polyglots
  4. Re-encode to JPEG/PNG — strips EXIF and any embedded payload
  5. Filename = `uuid.NewString() + ".jpg"` — never trust client-provided name
  6. Max dimensions: 4000 × 4000
- **Path traversal:** `filepath.Clean` + prefix check on every stored path.

### 3d. Per-user rate limits
Layered on top of current per-IP limiter.

| Endpoint | Limit |
|---|---|
| `POST /auth/login`, `/auth/verify-otp` | 5/min per IP + 10/hour per email |
| `POST /auth/resend-otp` | 3/hour per email |
| `POST /rides/create`, `/deliveries/create`, `/orders/create` | 20/hour per user |
| `POST /payment-proof/upload` | 10/hour per user |
| `POST /driver/withdraw`, `/wallet/withdraw` | 5/day per user |
| `POST /promos/apply`, `/referral/apply` | 20/hour per user |

In-memory limiter extended with `userID` keying. Good enough for single Render
instance; swap for Redis if we horizontally scale.

## 4. Secrets, Infra Hygiene & Audit Logging

### 4a. Secrets & config hardening
- **Remove dangerous defaults** in `config.go`: no more hardcoded
  `oneride_password`, `oneride_user`, `localhost`. Required secrets **fail
  startup** if missing: `JWT_SECRET`, `DATABASE_URL`, `UPLOAD_DIR` (prod).
- **New required secrets:**
  - `JWT_SECRET` — min 32 bytes, enforced at startup
  - `REFRESH_TOKEN_PEPPER` — separate secret for refresh-token hashing
- **`.env` discipline:** ensure `.gitignore` covers it; startup warning if
  `.env` is world-readable.
- **Supabase SSL:** already enforced via `sslmode=require` — add explicit
  startup check that DSN contains it.

### 4b. Critical finding — Firebase admin key leak
`omji-7774e-firebase-adminsdk-fbsvc-639ee8d8b9.json` is currently in the repo
root (confirmed via `ls`). This is a live service-account private key. It
must be:
1. **Rotated** (generate new key in GCP console, old one disabled)
2. **Removed from the working tree** (moved to env var or secret manager)
3. **Scrubbed from git history** via `git filter-repo` — destructive operation,
   requires explicit user confirmation and a coordinated force-push.

Step 3 is a follow-up task, not a blocker for the rest of this spec.

### 4c. Security headers (extend `SecurityHeadersMiddleware`)
Add:
- `Content-Security-Policy` — strict policy for API JSON responses
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-site`

Remove:
- `X-XSS-Protection` (deprecated, known to cause issues in some browsers)

### 4d. CORS tightening
- Remove wildcard `*` support — startup fails if `CORS_ORIGIN=*`
- Strict allowlist only; `Access-Control-Allow-Credentials: true` only for
  admin origin
- `Access-Control-Max-Age: 600`

### 4e. Audit logging (`pkg/audit`)
Append-only `audit_logs` table. Every mutation in these categories writes a
row:

| Category | Events |
|---|---|
| Auth | login success/fail, logout, logout-all, password change, OTP verify, token refresh, refresh reuse detected |
| Admin | create/update/delete user, driver, store, promo, rate, payment config, announcement; verify/reject driver; verify/reject payment proof; update withdrawal |
| Money | wallet top-up, wallet withdraw, driver withdrawal request/approval, commission config change |
| Security | rate-limit breach (sampled 1:10), authz denied, IDOR attempt, oversized body |

Row contents: `actor_user_id`, `actor_role`, `action`, `target_type`,
`target_id`, `metadata` (JSONB), `ip`, `user_agent`, `request_id`,
`created_at`.

Extend existing `GET /api/v1/admin/activity-logs` to read from this table with
filtering + pagination.

### 4f. Request IDs & structured logs
- `RequestIDMiddleware` — UUID per request, propagated via `X-Request-ID`
  header, included in all `slog` output and audit rows.
- Sensitive fields scrubbed from logs: `password`, `otp`, `token`,
  `refresh_token`, `Authorization` header.

## 5. Testing, Rollout & Acceptance

### 5a. Security test suite
New `*_security_test.go` files. Each test runs against an ephemeral DB.

**Auth tests**
- Reject: missing, malformed, expired, `alg: none`, `alg: RS256`, wrong issuer,
  wrong audience, tampered payload, revoked refresh, reused refresh (→ family revoke)
- Accept: valid token within exp; refresh returns rotated token; logout-all
  bumps `token_version`

**AuthZ / IDOR tests** — one per protected resource type:
- User A cannot read / modify / delete user B's ride, delivery, order,
  payment proof, address, favorite, wallet entry, withdrawal
- Driver cannot access rides not assigned to them
- Non-admin → 403 on every `/admin/*` route
- Admin whose DB role was revoked → 403 on next sensitive action (fresh-check)

**Input safety tests**
- Oversized body → 413
- Upload: SVG rejected, HTML-polyglot JPEG rejected, zip bomb rejected,
  5000×5000 image rejected, valid JPEG accepted + re-encoded + EXIF stripped
- SQL injection attempts in query + path params → no errors, no data leaks
  (this exercises GORM's parameterization)
- Path traversal in upload filenames → rejected

**Rate limit tests**
- Login brute force: 6th attempt within a minute → 429
- Withdrawal: 6th in 24h → 429

**Audit tests**
- Every admin mutation writes one audit row with correct actor, target, action
- Refresh reuse writes `refresh_reuse_detected` row and revokes family

**Coverage target:** security tests cover 100% of protected routes for at
least the "unauthorized user" case.

### 5b. Rollout plan
1. **Migration deploy** — create `refresh_tokens`, `audit_logs`; deploy code
   behind feature flag `SECURITY_V2=false`.
2. **Staging flip** — full test suite + manual smoke + light load test.
3. **Production rollout (one window):**
   - Rotate `JWT_SECRET` (forced logout)
   - Rotate Firebase admin JSON (generate new key in GCP, update env var)
   - Flip `SECURITY_V2=true`
   - Monitor `/health`, audit-log write rate, 401/403/429 rates for 30 min
4. **Post-deploy:** `git filter-repo` scrub of the old Firebase JSON
   (destructive, requires explicit user confirmation before running).
5. **Mobile follow-up release:** refresh-token logic so users don't re-login
   every hour.

### 5c. Acceptance criteria (spec is "done" when…)
- [ ] All new tests pass in CI
- [ ] `grep -rn 'oneride_password'` returns nothing
- [ ] No hardcoded secrets in repo (gitleaks or equivalent clean)
- [ ] Every `/:id` protected route has a documented authz guard
- [ ] `go test ./... -race` clean
- [ ] Manual IDOR attempt (two test accounts) returns 404 on cross-access
- [ ] Audit log populated for every admin action during smoke test
- [ ] Refresh token reuse triggers family revoke in manual test
- [ ] Firebase JSON rotated + removed from current tree (history scrub is
      follow-up, not a blocker)
- [ ] `JWT_SECRET` rotated in prod

### 5d. Explicit non-goals
- Payment gateway integration
- Admin web CSP / frontend hardening
- Mobile app feature changes
- DDoS / WAF / CDN
- Formal penetration test
- Full PCI-DSS compliance (only relevant once a real gateway is added)
