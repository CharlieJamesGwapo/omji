# Play Integrity API Integration — Design

**Date:** 2026-04-13
**Branch:** one-ride-balingasag
**Status:** Draft for review

## Goal

Protect sensitive OMJI backend endpoints (auth, ride booking, driver actions, payments) from requests that do not originate from a genuine, unmodified copy of the OMJI app running on a trustworthy Android device, using Google's Play Integrity API.

## Non-goals

- iOS attestation (DeviceCheck / App Attest) — separate future design.
- Server-side Play Store license verification beyond what Play Integrity returns.
- User-facing remediation flows beyond a "Open in Play Store" deep link.
- Replacing existing auth, rate limiting, or audit logging.

## Current state (as of this branch)

- Mobile: React Native / Expo SDK 54, package `com.oneridebalingasag.app`, no custom native modules, Firebase project `omji-7774e` (project number `914776520905`).
- Backend: Go 1.23 + Gin, JWT auth with refresh-token rotation, per-IP rate limiting, append-only audit log, GORM + Postgres/SQLite.
- No existing device attestation. Play Integrity shows "Integration started" in Play Console but the app does not call the API.
- Auth middleware hook point: `backend/pkg/middleware/middleware.go:133`; sensitive routes mounted in `backend/cmd/main.go`.

## Key decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Tiered strictness** (Low / Medium / High per endpoint) | Balances abuse protection vs. users on cheap/rooted/sideloaded Android. |
| 2 | **Session-bound tokens** (attested session ~15 min) | Google quota and UX — avoid fetching a fresh token per request. High-tier endpoints always re-attest. |
| 3 | **Server-side verdict decoding** via Google's `decodeIntegrityToken` | Google's recommended path. No local key management. |
| 4 | **Backend-issued nonces**, one-time-use, 2-min TTL | Strong replay protection; piggybacks on existing roundtrip. |
| 5 | **Fail-open for Low/Medium, fail-closed for High** on Google API outage | Google outages cannot take OMJI down, but payments still protected. |
| 6 | **Monitor-only rollout** for first 1–2 weeks via `INTEGRITY_ENFORCE` flag | Real-world verdict data before blocking users. |

## Architecture

Three units, each with one clear purpose:

### Unit 1 — Mobile native bridge (`mobile/modules/play-integrity/`)

Thin Expo native module (Kotlin) wrapping `StandardIntegrityManager`.

**Interface:**
```
warmup(): void                          // called once at app start
requestToken(requestHash: string): string
```

Warmup creates a `StandardIntegrityTokenProvider` via `prepareIntegrityToken(...)` with cloud project number `914776520905`. Must happen in background — it takes several seconds.

iOS path: module returns the literal string `"ios-skip"` for `requestToken`; backend recognizes and skips verification.

### Unit 2 — Mobile integrity client (`mobile/src/services/integrity.ts`)

TypeScript service that other app code uses. Native module is not called directly from anywhere else.

**Interface:**
```ts
class IntegrityClient {
  warmup(): Promise<void>
  getToken(action: string): Promise<string>
  attachHeaders(headers: Headers, level: Level): Promise<Headers>
}
```

Caches the `attestedUntil` timestamp returned by the backend in the `X-Integrity-Attested-Until` header. For Low/Medium actions within the window, reuses the session; for High actions always fetches a fresh nonce + token.

### Unit 3 — Backend integrity package (`backend/pkg/integrity/`)

Three files, one responsibility each.

**`nonce.go`**
```go
type Nonce struct {
    ID         string     // 32-byte random, base64
    UserID     uint       // 0 for pre-auth (login/register)
    CreatedAt  time.Time
    ExpiresAt  time.Time  // CreatedAt + 2m
    ConsumedAt *time.Time
}

func Issue(userID uint) (string, error)
func Consume(nonce string, userID uint) error
```

New GORM table `integrity_nonces`. Background goroutine deletes expired rows every 5 min.

**`verifier.go`**
```go
type Verdict struct {
    AppRecognition    string    // PLAY_RECOGNIZED | UNRECOGNIZED_VERSION | UNEVALUATED
    DeviceRecognition []string  // MEETS_DEVICE_INTEGRITY | MEETS_BASIC_INTEGRITY | ...
    AppLicensing      string    // LICENSED | UNLICENSED | UNEVALUATED
    RequestHash       string
    PackageName       string
    Timestamp         time.Time
}

type Verifier interface {
    Verify(ctx context.Context, token string) (*Verdict, error)
}
```

Production implementation uses `google.golang.org/api/playintegrity/v1` with a service account loaded from env. 2-second timeout on the Google call. Interface is injected so tests can fake it.

**`middleware.go`**
```go
type Level int
const (
    LevelLow    Level = iota // log only, never block
    LevelMedium              // require PLAY_RECOGNIZED + MEETS_BASIC_INTEGRITY
    LevelHigh                // require PLAY_RECOGNIZED + MEETS_DEVICE_INTEGRITY + LICENSED
)

func RequireIntegrity(level Level) gin.HandlerFunc
```

Also introduces a lightweight table `integrity_sessions(user_id, attested_until, verdict_digest)` used to cache the attested-session flag without re-minting JWTs. In-memory LRU cache (30s) in front of this table.

### Endpoint-to-level mapping

| Level  | Endpoints |
|--------|-----------|
| Low    | `/api/v1/public/auth/login`, `/register`, `/verify-otp`, `/resend-otp` |
| Medium | `/api/v1/rides/create`, `/rides/:id/status`, `/driver/requests/:id/accept`, `/driver/register` |
| High   | `/api/v1/payments/methods`, `/payment-proof/upload`, `/wallet/withdraw` |

All other routes (reads, profile, listings) remain unchanged.

## Data flow — happy path (Medium, ride create)

1. App start: `IntegrityClient.warmup()` fires; provider ready in ~2–5s in the background.
2. User taps **Book ride**. Client calls `GET /api/v1/auth/integrity/nonce`. Backend issues a nonce and stores `{user, nonce, exp=now+2m, consumed=null}`.
3. Client calls native `requestToken(nonce)` → opaque token in ~300–800ms.
4. Client calls `POST /api/v1/rides/create` with `Authorization: Bearer <jwt>` and `X-Integrity-Token: <token>`.
5. Middleware chain:
   - `AuthMiddleware` validates JWT.
   - `RequireIntegrity(LevelMedium)` checks the in-memory session cache → miss → calls `verifier.Verify(token)`.
   - Verdict: `PLAY_RECOGNIZED` + `MEETS_BASIC_INTEGRITY` → pass.
   - Middleware checks `verdict.RequestHash == stored nonce`, consumes nonce.
   - Writes audit log entry with outcome and verdict digest.
   - Upserts `integrity_sessions` row with `attested_until = now + 15m`.
   - Sets response header `X-Integrity-Attested-Until`.
6. Handler runs normally.
7. Second ride booking inside the window: client reuses session, sends request without a new nonce/token; middleware reads cache, passes through, no Google call.

## Edge cases

| Scenario | Behavior |
|----------|----------|
| Missing `X-Integrity-Token` on Medium/High | 428 `INTEGRITY_REQUIRED`; client re-runs nonce→token flow |
| Token present, nonce expired or already consumed | 428 `INTEGRITY_NONCE_INVALID`; client fetches new nonce |
| `requestHash` mismatch | 403 `INTEGRITY_REPLAY`; audit severity=high; metric alert fires |
| `packageName` mismatch | 403 `INTEGRITY_PACKAGE_MISMATCH`; always blocking regardless of level |
| Token `timestamp` > 5 min old or > 1 min in the future | 403 `INTEGRITY_STALE` |
| Google API 5xx/timeout on Low/Medium | Allow, log `integrity.google_unreachable` |
| Google API 5xx/timeout on High | 503 `INTEGRITY_UNAVAILABLE`; client shows retry |
| Verdict `UNEVALUATED` (Google quota exhausted) | Low/Medium fail-open, High fail-closed |
| Rooted device / failing `DEVICE_INTEGRITY` | Low: allow+log. Medium/High: block with 1b message |
| `UNLICENSED` (sideloaded) | Low/Medium: allow+log. High: block with Play Store link |
| iOS client (`ios-skip` token) | Pass through; log `platform=ios`; no Google call |
| `INTEGRITY_ENFORCE=false` | Middleware evaluates and logs; never blocks, regardless of level |

### Circuit breaker

If > 50% of Google calls fail in a rolling 60s window, open the breaker for 30s. During open state: Medium treated as fail-open, High stays fail-closed with a friendlier error message. Breaker state logged and counted.

### Error response shape

```json
{
  "error": "INTEGRITY_REQUIRED",
  "message": "Please install OMJI from Google Play to continue.",
  "action": "install_from_play_store",
  "play_url": "https://play.google.com/store/apps/details?id=com.oneridebalingasag.app"
}
```

Client renders message + "Open Play Store" button whenever `action=install_from_play_store`.

## Testing strategy

**Backend unit tests (`backend/pkg/integrity/*_test.go`):**
- `nonce_test.go` — issue/consume happy path, double-consume, expired, wrong user.
- `verifier_test.go` — parse verdict combinations using an `httptest.Server` fake Google API.
- `middleware_test.go` — table-driven over (level × verdict class × enforce on/off × network outcome). Uses fake `Verifier`.

**Backend integration test:**
- One test in the existing `handlers_test.go` style: `POST /rides/create` with middleware wired to a fake passing verdict — handler runs. Second test: token missing → 428.

**Mobile unit tests (`mobile/src/services/integrity.test.ts`):**
- Mock the native module.
- Cases: nonce fetch failure, token fetch failure, header attachment, session cache hit, iOS `ios-skip` path.

**Manual / device QA:**
- Play Store install (all verdicts pass).
- Internal testing track (passes).
- Sideloaded APK (`UNLICENSED` expected; High blocked, Medium allowed during rollout).
- Android Studio emulator (`DEVICE_INTEGRITY` fails; Medium/High blocked).
- Airplane mode mid-request (fail policy kicks in).

## Rollout plan

| Phase | Duration | Config | Goal |
|-------|----------|--------|------|
| 0. Ship backend dormant | — | `INTEGRITY_ENFORCE=false`, no mobile changes yet | Middleware deployed, inactive |
| 1. Mobile integration | 2–3 d | Backend enforce off, mobile sends tokens | Validate wiring in dev/staging |
| 2. Monitor-only production | 7 d | `INTEGRITY_ENFORCE=false` in prod | Collect real verdict distribution |
| 3. Enforce Low | 3 d | `INTEGRITY_ENFORCE=true`, only Low wired | Shake out config errors on low-stakes routes |
| 4. Enforce Medium | 4 d | Add Medium routes | Watch for ride-booking regressions |
| 5. Enforce High | ongoing | Add High routes | Full protection |

Rollback at any phase = flip `INTEGRITY_ENFORCE=false`. No redeploy.

## Observability

Audit log fields on every verification: `integrity.level`, `integrity.verdict_app`, `integrity.verdict_device`, `integrity.verdict_licensing`, `integrity.enforced`, `integrity.outcome`.

Metric counters: `integrity_verify_total{level,outcome}`, `integrity_google_latency_ms`, `integrity_breaker_open`.

Alerts:
- `integrity_google_error_rate > 10%` for 5 min → page on-call.
- `integrity_replay_total > 0` → any single replay is an incident.

## Configuration

| Env var | Purpose |
|---------|---------|
| `PLAY_INTEGRITY_SA_JSON` | Path to service account JSON (dev) |
| `PLAY_INTEGRITY_SA_JSON_INLINE` | Raw JSON string (production, single-line) |
| `PLAY_INTEGRITY_CLOUD_PROJECT` | `914776520905` |
| `INTEGRITY_ENFORCE` | `true` / `false` — master kill switch |

### One-time setup tasks

- Link Google Cloud project `omji-7774e` in Play Console → App Integrity.
- Create a service account in GCP project `omji-7774e` with role **Play Integrity API user**.
- Download the key JSON and load into Railway/Fly secrets as `PLAY_INTEGRITY_SA_JSON_INLINE`.
- Enable the Play Integrity API in the GCP project.

## Open questions

None at time of writing — all decisions resolved during brainstorm.
