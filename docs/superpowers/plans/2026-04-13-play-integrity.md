# Play Integrity API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Google Play Integrity API into OMJI (Go/Gin backend + React Native/Expo mobile) to attest that sensitive requests come from a genuine, unmodified OMJI app on a trustworthy Android device.

**Architecture:** Three units — (1) Android-only Expo native module wrapping `StandardIntegrityManager`, (2) TypeScript `IntegrityClient` wrapper, (3) Go `pkg/integrity` package with nonces, Google server-side verifier, and a Gin middleware mounted at tiered levels (Low/Medium/High) on sensitive routes. A master kill switch `INTEGRITY_ENFORCE` allows monitor-only rollout. Session attestation is cached via a new `integrity_sessions` table so one token covers a ~15 min window for Low/Medium endpoints.

**Tech Stack:** Go 1.23 + Gin + GORM (backend); React Native / Expo SDK 54 + Kotlin (mobile); `google.golang.org/api/playintegrity/v1` for server-side verdict decoding; service account auth.

**Spec:** `docs/superpowers/specs/2026-04-13-play-integrity-design.md`

---

## File Structure

### Backend — new files
- `backend/pkg/integrity/types.go` — `Verdict`, `Level`, `Outcome` types and constants
- `backend/pkg/integrity/nonce.go` — `Nonce` model + `Issue` / `Consume`
- `backend/pkg/integrity/nonce_test.go`
- `backend/pkg/integrity/session.go` — `IntegritySession` model + cache + upsert/lookup
- `backend/pkg/integrity/session_test.go`
- `backend/pkg/integrity/verifier.go` — `Verifier` interface + `GoogleVerifier` implementation
- `backend/pkg/integrity/verifier_test.go`
- `backend/pkg/integrity/middleware.go` — `RequireIntegrity(level)` Gin middleware + circuit breaker
- `backend/pkg/integrity/middleware_test.go`
- `backend/pkg/integrity/handlers.go` — `IssueNonce` handler for `GET /auth/integrity/nonce`

### Backend — modified files
- `backend/pkg/models/models.go` — register `IntegrityNonce` and `IntegritySession` in `AutoMigrate`
- `backend/cmd/main.go` — mount nonce handler, wire `RequireIntegrity(...)` middleware on Low/Medium/High routes, read `INTEGRITY_ENFORCE`
- `backend/go.mod` / `backend/go.sum` — add `google.golang.org/api`

### Mobile — new files
- `mobile/modules/play-integrity/` (Expo local module)
  - `expo-module.config.json`
  - `android/build.gradle`
  - `android/src/main/AndroidManifest.xml`
  - `android/src/main/java/expo/modules/playintegrity/PlayIntegrityModule.kt`
  - `ios/PlayIntegrityModule.swift` (no-op stub)
  - `index.ts` — TS API surface
- `mobile/src/services/integrity.ts` — `IntegrityClient`
- `mobile/src/services/integrity.test.ts`

### Mobile — modified files
- `mobile/app.json` — register the local module in `plugins`
- `mobile/src/services/api.ts` — call `IntegrityClient.attachHeaders(...)` on protected requests
- `mobile/App.tsx` (or equivalent root) — call `IntegrityClient.warmup()` once at startup

### Docs
- `docs/superpowers/specs/2026-04-13-play-integrity-design.md` (already exists)
- `README.md` — add `PLAY_INTEGRITY_*` and `INTEGRITY_ENFORCE` to env vars section

---

## Task 1: Scaffold integrity package — types

**Files:**
- Create: `backend/pkg/integrity/types.go`
- Test: n/a (pure types, covered by later tests)

- [ ] **Step 1: Create `backend/pkg/integrity/types.go`**

```go
package integrity

import "time"

// Level is the integrity enforcement tier for an endpoint.
type Level int

const (
	LevelLow    Level = iota // log only, never block
	LevelMedium              // require PLAY_RECOGNIZED + MEETS_BASIC_INTEGRITY
	LevelHigh                // require PLAY_RECOGNIZED + MEETS_DEVICE_INTEGRITY + LICENSED
)

func (l Level) String() string {
	switch l {
	case LevelLow:
		return "low"
	case LevelMedium:
		return "medium"
	case LevelHigh:
		return "high"
	}
	return "unknown"
}

// Verdict is the decoded Play Integrity response from Google.
type Verdict struct {
	AppRecognition    string    // PLAY_RECOGNIZED | UNRECOGNIZED_VERSION | UNEVALUATED
	DeviceRecognition []string  // MEETS_DEVICE_INTEGRITY | MEETS_BASIC_INTEGRITY | ...
	AppLicensing      string    // LICENSED | UNLICENSED | UNEVALUATED
	RequestHash       string
	PackageName       string
	Timestamp         time.Time
}

// Outcome is the final decision the middleware reached.
type Outcome string

const (
	OutcomePass     Outcome = "pass"
	OutcomeFail     Outcome = "fail"
	OutcomeFailOpen Outcome = "fail_open"
	OutcomeSkipped  Outcome = "skipped" // iOS or enforce disabled
)

// Error codes returned to clients.
const (
	ErrIntegrityRequired        = "INTEGRITY_REQUIRED"
	ErrIntegrityNonceInvalid    = "INTEGRITY_NONCE_INVALID"
	ErrIntegrityReplay          = "INTEGRITY_REPLAY"
	ErrIntegrityPackageMismatch = "INTEGRITY_PACKAGE_MISMATCH"
	ErrIntegrityStale           = "INTEGRITY_STALE"
	ErrIntegrityUnavailable     = "INTEGRITY_UNAVAILABLE"
	ErrIntegrityDeviceFailed    = "INTEGRITY_DEVICE_FAILED"
)

// MeetsLevel reports whether this verdict satisfies the given level.
func (v *Verdict) MeetsLevel(l Level) (bool, string) {
	if v.AppRecognition != "PLAY_RECOGNIZED" && l >= LevelMedium {
		return false, ErrIntegrityDeviceFailed
	}
	hasBasic, hasDevice := false, false
	for _, d := range v.DeviceRecognition {
		if d == "MEETS_BASIC_INTEGRITY" {
			hasBasic = true
		}
		if d == "MEETS_DEVICE_INTEGRITY" {
			hasDevice = true
			hasBasic = true
		}
	}
	switch l {
	case LevelLow:
		return true, ""
	case LevelMedium:
		if !hasBasic {
			return false, ErrIntegrityDeviceFailed
		}
		return true, ""
	case LevelHigh:
		if !hasDevice {
			return false, ErrIntegrityDeviceFailed
		}
		if v.AppLicensing != "LICENSED" {
			return false, ErrIntegrityDeviceFailed
		}
		return true, ""
	}
	return false, ErrIntegrityDeviceFailed
}
```

- [ ] **Step 2: Verify build**

Run: `cd backend && go build ./pkg/integrity/...`
Expected: exits 0, no output.

- [ ] **Step 3: Commit**

```bash
git add backend/pkg/integrity/types.go
git commit -m "feat(integrity): add Level, Verdict, Outcome types"
```

---

## Task 2: Nonce store — failing test

**Files:**
- Create: `backend/pkg/integrity/nonce.go` (empty stub)
- Test: `backend/pkg/integrity/nonce_test.go`

- [ ] **Step 1: Create stub `backend/pkg/integrity/nonce.go`**

```go
package integrity

import (
	"time"

	"gorm.io/gorm"
)

// IntegrityNonce is a short-lived, one-time-use nonce bound to a user session.
type IntegrityNonce struct {
	ID         string     `gorm:"primaryKey;size:64" json:"id"`
	UserID     uint       `gorm:"index" json:"user_id"` // 0 for pre-auth flows
	CreatedAt  time.Time  `json:"created_at"`
	ExpiresAt  time.Time  `gorm:"index" json:"expires_at"`
	ConsumedAt *time.Time `json:"consumed_at,omitempty"`
}

// NonceStore is the interface used by middleware for nonce lifecycle.
type NonceStore interface {
	Issue(userID uint) (string, error)
	Consume(nonce string, userID uint) error
}

// GormNonceStore is a GORM-backed NonceStore.
type GormNonceStore struct {
	db  *gorm.DB
	ttl time.Duration
}

func NewGormNonceStore(db *gorm.DB) *GormNonceStore {
	return &GormNonceStore{db: db, ttl: 2 * time.Minute}
}

func (s *GormNonceStore) Issue(userID uint) (string, error) {
	return "", nil // implemented in Task 3
}

func (s *GormNonceStore) Consume(nonce string, userID uint) error {
	return nil // implemented in Task 3
}
```

- [ ] **Step 2: Create `backend/pkg/integrity/nonce_test.go`**

```go
package integrity

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&IntegrityNonce{}, &IntegritySession{}))
	t.Cleanup(func() {
		sqlDB, _ := db.DB()
		if sqlDB != nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func TestNonce_IssueConsumeHappyPath(t *testing.T) {
	db := newTestDB(t)
	store := NewGormNonceStore(db)

	n, err := store.Issue(42)
	require.NoError(t, err)
	require.NotEmpty(t, n)
	require.GreaterOrEqual(t, len(n), 40)

	require.NoError(t, store.Consume(n, 42))
}

func TestNonce_DoubleConsumeRejected(t *testing.T) {
	db := newTestDB(t)
	store := NewGormNonceStore(db)

	n, err := store.Issue(42)
	require.NoError(t, err)
	require.NoError(t, store.Consume(n, 42))
	require.Error(t, store.Consume(n, 42))
}

func TestNonce_WrongUserRejected(t *testing.T) {
	db := newTestDB(t)
	store := NewGormNonceStore(db)

	n, err := store.Issue(42)
	require.NoError(t, err)
	require.Error(t, store.Consume(n, 43))
}

func TestNonce_ExpiredRejected(t *testing.T) {
	db := newTestDB(t)
	store := NewGormNonceStore(db)
	store.ttl = -time.Second // issue an already-expired nonce

	n, err := store.Issue(42)
	require.NoError(t, err)
	require.Error(t, store.Consume(n, 42))
}
```

- [ ] **Step 3: Create empty `backend/pkg/integrity/session.go` stub so tests compile**

```go
package integrity

import "time"

type IntegritySession struct {
	UserID        uint      `gorm:"primaryKey" json:"user_id"`
	AttestedUntil time.Time `json:"attested_until"`
	VerdictDigest string    `gorm:"size:64" json:"verdict_digest"`
	UpdatedAt     time.Time `json:"updated_at"`
}
```

- [ ] **Step 4: Run tests — expect failures**

Run: `cd backend && go test ./pkg/integrity/... -run TestNonce -v`
Expected: all four tests FAIL (nil returns, no validation).

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/integrity/
git commit -m "test(integrity): failing nonce store tests"
```

---

## Task 3: Nonce store — implementation

**Files:**
- Modify: `backend/pkg/integrity/nonce.go`

- [ ] **Step 1: Replace stub with real implementation**

```go
package integrity

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	"gorm.io/gorm"
)

var (
	ErrNonceNotFound = errors.New("integrity: nonce not found")
	ErrNonceExpired  = errors.New("integrity: nonce expired")
	ErrNonceConsumed = errors.New("integrity: nonce already consumed")
	ErrNonceUserMismatch = errors.New("integrity: nonce user mismatch")
)

type IntegrityNonce struct {
	ID         string     `gorm:"primaryKey;size:64" json:"id"`
	UserID     uint       `gorm:"index" json:"user_id"`
	CreatedAt  time.Time  `json:"created_at"`
	ExpiresAt  time.Time  `gorm:"index" json:"expires_at"`
	ConsumedAt *time.Time `json:"consumed_at,omitempty"`
}

type NonceStore interface {
	Issue(userID uint) (string, error)
	Consume(nonce string, userID uint) error
}

type GormNonceStore struct {
	db  *gorm.DB
	ttl time.Duration
}

func NewGormNonceStore(db *gorm.DB) *GormNonceStore {
	return &GormNonceStore{db: db, ttl: 2 * time.Minute}
}

func (s *GormNonceStore) Issue(userID uint) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	id := base64.RawURLEncoding.EncodeToString(buf)
	now := time.Now().UTC()
	n := IntegrityNonce{
		ID:        id,
		UserID:    userID,
		CreatedAt: now,
		ExpiresAt: now.Add(s.ttl),
	}
	if err := s.db.Create(&n).Error; err != nil {
		return "", err
	}
	return id, nil
}

func (s *GormNonceStore) Consume(nonce string, userID uint) error {
	var n IntegrityNonce
	err := s.db.Where("id = ?", nonce).First(&n).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrNonceNotFound
	}
	if err != nil {
		return err
	}
	if n.UserID != userID {
		return ErrNonceUserMismatch
	}
	if n.ConsumedAt != nil {
		return ErrNonceConsumed
	}
	if time.Now().UTC().After(n.ExpiresAt) {
		return ErrNonceExpired
	}
	now := time.Now().UTC()
	n.ConsumedAt = &now
	return s.db.Save(&n).Error
}

// CleanupExpired deletes nonces older than the given cutoff.
func (s *GormNonceStore) CleanupExpired(cutoff time.Time) error {
	return s.db.Where("expires_at < ?", cutoff).Delete(&IntegrityNonce{}).Error
}
```

- [ ] **Step 2: Run tests — expect pass**

Run: `cd backend && go test ./pkg/integrity/... -run TestNonce -v`
Expected: all four tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/pkg/integrity/nonce.go
git commit -m "feat(integrity): implement GORM nonce store"
```

---

## Task 4: Integrity session store — failing test

**Files:**
- Create/Modify: `backend/pkg/integrity/session_test.go`, `backend/pkg/integrity/session.go`

- [ ] **Step 1: Create `backend/pkg/integrity/session_test.go`**

```go
package integrity

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestSession_UpsertAndLookup(t *testing.T) {
	db := newTestDB(t)
	store := NewGormSessionStore(db)

	until := time.Now().UTC().Add(15 * time.Minute).Truncate(time.Second)
	require.NoError(t, store.Upsert(42, until, "digest1"))

	got, ok := store.ActiveUntil(42)
	require.True(t, ok)
	require.WithinDuration(t, until, got, time.Second)
}

func TestSession_ExpiredNotActive(t *testing.T) {
	db := newTestDB(t)
	store := NewGormSessionStore(db)

	past := time.Now().UTC().Add(-1 * time.Minute)
	require.NoError(t, store.Upsert(42, past, "digest1"))

	_, ok := store.ActiveUntil(42)
	require.False(t, ok)
}

func TestSession_UnknownUserNotActive(t *testing.T) {
	db := newTestDB(t)
	store := NewGormSessionStore(db)

	_, ok := store.ActiveUntil(999)
	require.False(t, ok)
}
```

- [ ] **Step 2: Update `backend/pkg/integrity/session.go` with stub interface**

```go
package integrity

import (
	"time"

	"gorm.io/gorm"
)

type IntegritySession struct {
	UserID        uint      `gorm:"primaryKey" json:"user_id"`
	AttestedUntil time.Time `json:"attested_until"`
	VerdictDigest string    `gorm:"size:64" json:"verdict_digest"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type SessionStore interface {
	Upsert(userID uint, until time.Time, digest string) error
	ActiveUntil(userID uint) (time.Time, bool)
}

type GormSessionStore struct {
	db *gorm.DB
}

func NewGormSessionStore(db *gorm.DB) *GormSessionStore {
	return &GormSessionStore{db: db}
}

func (s *GormSessionStore) Upsert(userID uint, until time.Time, digest string) error {
	return nil
}

func (s *GormSessionStore) ActiveUntil(userID uint) (time.Time, bool) {
	return time.Time{}, false
}
```

- [ ] **Step 3: Run tests — expect failure**

Run: `cd backend && go test ./pkg/integrity/... -run TestSession -v`
Expected: all three FAIL.

- [ ] **Step 4: Commit**

```bash
git add backend/pkg/integrity/session.go backend/pkg/integrity/session_test.go
git commit -m "test(integrity): failing session store tests"
```

---

## Task 5: Integrity session store — implementation

**Files:**
- Modify: `backend/pkg/integrity/session.go`

- [ ] **Step 1: Implement the store**

```go
package integrity

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type IntegritySession struct {
	UserID        uint      `gorm:"primaryKey" json:"user_id"`
	AttestedUntil time.Time `json:"attested_until"`
	VerdictDigest string    `gorm:"size:64" json:"verdict_digest"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type SessionStore interface {
	Upsert(userID uint, until time.Time, digest string) error
	ActiveUntil(userID uint) (time.Time, bool)
}

type GormSessionStore struct {
	db *gorm.DB
}

func NewGormSessionStore(db *gorm.DB) *GormSessionStore {
	return &GormSessionStore{db: db}
}

func (s *GormSessionStore) Upsert(userID uint, until time.Time, digest string) error {
	row := IntegritySession{
		UserID:        userID,
		AttestedUntil: until,
		VerdictDigest: digest,
		UpdatedAt:     time.Now().UTC(),
	}
	return s.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}},
		UpdateAll: true,
	}).Create(&row).Error
}

func (s *GormSessionStore) ActiveUntil(userID uint) (time.Time, bool) {
	var row IntegritySession
	err := s.db.Where("user_id = ?", userID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return time.Time{}, false
	}
	if err != nil {
		return time.Time{}, false
	}
	if time.Now().UTC().After(row.AttestedUntil) {
		return time.Time{}, false
	}
	return row.AttestedUntil, true
}
```

- [ ] **Step 2: Run tests — expect pass**

Run: `cd backend && go test ./pkg/integrity/... -run TestSession -v`
Expected: all three PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/pkg/integrity/session.go
git commit -m "feat(integrity): implement GORM session store"
```

---

## Task 6: Verifier interface + fake — tests and contract

**Files:**
- Create: `backend/pkg/integrity/verifier.go`
- Create: `backend/pkg/integrity/verifier_test.go`

- [ ] **Step 1: Create `backend/pkg/integrity/verifier.go` with interface only**

```go
package integrity

import "context"

// Verifier decodes a Play Integrity token into a Verdict.
type Verifier interface {
	Verify(ctx context.Context, token string) (*Verdict, error)
}

// FakeVerifier is a test double that returns a preset Verdict or error.
type FakeVerifier struct {
	Response *Verdict
	Err      error
}

func (f *FakeVerifier) Verify(_ context.Context, _ string) (*Verdict, error) {
	if f.Err != nil {
		return nil, f.Err
	}
	return f.Response, nil
}
```

- [ ] **Step 2: Create `backend/pkg/integrity/verifier_test.go`**

```go
package integrity

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestVerdict_MeetsLevel(t *testing.T) {
	cases := []struct {
		name    string
		verdict Verdict
		level   Level
		ok      bool
	}{
		{"low always passes", Verdict{}, LevelLow, true},
		{
			"medium passes with basic integrity and PLAY_RECOGNIZED",
			Verdict{AppRecognition: "PLAY_RECOGNIZED", DeviceRecognition: []string{"MEETS_BASIC_INTEGRITY"}},
			LevelMedium, true,
		},
		{
			"medium fails without any device integrity",
			Verdict{AppRecognition: "PLAY_RECOGNIZED", DeviceRecognition: []string{}},
			LevelMedium, false,
		},
		{
			"medium fails with UNRECOGNIZED_VERSION",
			Verdict{AppRecognition: "UNRECOGNIZED_VERSION", DeviceRecognition: []string{"MEETS_BASIC_INTEGRITY"}},
			LevelMedium, false,
		},
		{
			"high passes with device integrity and LICENSED",
			Verdict{
				AppRecognition:    "PLAY_RECOGNIZED",
				DeviceRecognition: []string{"MEETS_DEVICE_INTEGRITY"},
				AppLicensing:      "LICENSED",
			},
			LevelHigh, true,
		},
		{
			"high fails with only basic integrity",
			Verdict{
				AppRecognition:    "PLAY_RECOGNIZED",
				DeviceRecognition: []string{"MEETS_BASIC_INTEGRITY"},
				AppLicensing:      "LICENSED",
			},
			LevelHigh, false,
		},
		{
			"high fails when UNLICENSED",
			Verdict{
				AppRecognition:    "PLAY_RECOGNIZED",
				DeviceRecognition: []string{"MEETS_DEVICE_INTEGRITY"},
				AppLicensing:      "UNLICENSED",
			},
			LevelHigh, false,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ok, _ := c.verdict.MeetsLevel(c.level)
			require.Equal(t, c.ok, ok)
		})
	}
}
```

- [ ] **Step 3: Run tests — expect pass**

Run: `cd backend && go test ./pkg/integrity/... -run TestVerdict -v`
Expected: PASS (MeetsLevel was already implemented in Task 1).

- [ ] **Step 4: Commit**

```bash
git add backend/pkg/integrity/verifier.go backend/pkg/integrity/verifier_test.go
git commit -m "feat(integrity): Verifier interface + FakeVerifier + level matrix tests"
```

---

## Task 7: Google verifier implementation

**Files:**
- Modify: `backend/pkg/integrity/verifier.go`
- Modify: `backend/go.mod`, `backend/go.sum`

- [ ] **Step 1: Add Google API dependency**

Run: `cd backend && go get google.golang.org/api/playintegrity/v1@latest`
Expected: go.mod/go.sum updated, exits 0.

- [ ] **Step 2: Append `GoogleVerifier` to `backend/pkg/integrity/verifier.go`**

Add below the existing `FakeVerifier`:

```go
import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"google.golang.org/api/option"
	"google.golang.org/api/playintegrity/v1"
)

var ErrVerifierUnavailable = errors.New("integrity: verifier unavailable")

// GoogleVerifier calls Google's decodeIntegrityToken server-side endpoint.
type GoogleVerifier struct {
	svc         *playintegrity.Service
	packageName string
}

// NewGoogleVerifier constructs a GoogleVerifier from env vars:
//   PLAY_INTEGRITY_SA_JSON         — path to service account JSON (dev)
//   PLAY_INTEGRITY_SA_JSON_INLINE  — raw JSON content (prod)
//   PLAY_INTEGRITY_PACKAGE         — defaults to com.oneridebalingasag.app
func NewGoogleVerifier(ctx context.Context) (*GoogleVerifier, error) {
	var opts []option.ClientOption
	if inline := os.Getenv("PLAY_INTEGRITY_SA_JSON_INLINE"); inline != "" {
		opts = append(opts, option.WithCredentialsJSON([]byte(inline)))
	} else if path := os.Getenv("PLAY_INTEGRITY_SA_JSON"); path != "" {
		opts = append(opts, option.WithCredentialsFile(path))
	} else {
		return nil, fmt.Errorf("integrity: no service account configured")
	}
	svc, err := playintegrity.NewService(ctx, opts...)
	if err != nil {
		return nil, err
	}
	pkg := os.Getenv("PLAY_INTEGRITY_PACKAGE")
	if pkg == "" {
		pkg = "com.oneridebalingasag.app"
	}
	return &GoogleVerifier{svc: svc, packageName: pkg}, nil
}

func (g *GoogleVerifier) Verify(ctx context.Context, token string) (*Verdict, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	req := &playintegrity.DecodeIntegrityTokenRequest{IntegrityToken: token}
	resp, err := g.svc.V1.DecodeIntegrityToken(g.packageName, req).Context(ctx).Do()
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrVerifierUnavailable, err)
	}
	payload := resp.TokenPayloadExternal
	if payload == nil {
		return nil, fmt.Errorf("%w: empty payload", ErrVerifierUnavailable)
	}

	v := &Verdict{}
	if payload.AppIntegrity != nil {
		v.AppRecognition = payload.AppIntegrity.AppRecognitionVerdict
		v.PackageName = payload.AppIntegrity.PackageName
	}
	if payload.DeviceIntegrity != nil {
		v.DeviceRecognition = payload.DeviceIntegrity.DeviceRecognitionVerdict
	}
	if payload.AccountDetails != nil {
		v.AppLicensing = payload.AccountDetails.AppLicensingVerdict
	}
	if payload.RequestDetails != nil {
		v.RequestHash = payload.RequestDetails.RequestHash
		if ts := payload.RequestDetails.TimestampMillis; ts != "" {
			if ms, err := strconv.ParseInt(ts, 10, 64); err == nil {
				v.Timestamp = time.UnixMilli(ms).UTC()
			}
		}
	}
	// Defensive: ensure we always return something parseable.
	_ = json.Marshal // keep import if unused in future edits
	return v, nil
}
```

- [ ] **Step 3: Run build**

Run: `cd backend && go build ./pkg/integrity/...`
Expected: exits 0.

- [ ] **Step 4: Run existing tests to confirm no regression**

Run: `cd backend && go test ./pkg/integrity/... -v`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/integrity/verifier.go backend/go.mod backend/go.sum
git commit -m "feat(integrity): GoogleVerifier using playintegrity v1 API"
```

---

## Task 8: Middleware — failing tests

**Files:**
- Create: `backend/pkg/integrity/middleware.go` (stub)
- Create: `backend/pkg/integrity/middleware_test.go`

- [ ] **Step 1: Create stub `backend/pkg/integrity/middleware.go`**

```go
package integrity

import (
	"github.com/gin-gonic/gin"
)

// Config holds dependencies and runtime flags for the middleware.
type Config struct {
	Verifier     Verifier
	NonceStore   NonceStore
	SessionStore SessionStore
	PackageName  string
	Enforce      bool          // master kill switch
	SessionTTL   int           // seconds; default 900
}

// RequireIntegrity returns a Gin middleware enforcing the given level.
func RequireIntegrity(cfg Config, level Level) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next() // stub
	}
}
```

- [ ] **Step 2: Create `backend/pkg/integrity/middleware_test.go`**

```go
package integrity

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func init() { gin.SetMode(gin.TestMode) }

// helper: build router with auth stub + integrity middleware
func newRouter(t *testing.T, cfg Config, level Level, userID uint) *gin.Engine {
	t.Helper()
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("userID", userID) // pretend AuthMiddleware ran
		c.Next()
	})
	r.POST("/protected", RequireIntegrity(cfg, level), func(c *gin.Context) {
		c.JSON(200, gin.H{"ok": true})
	})
	return r
}

func TestMiddleware_SkipsWhenEnforceDisabled(t *testing.T) {
	db := newTestDB(t)
	cfg := Config{
		Verifier:     &FakeVerifier{Err: ErrVerifierUnavailable},
		NonceStore:   NewGormNonceStore(db),
		SessionStore: NewGormSessionStore(db),
		PackageName:  "com.oneridebalingasag.app",
		Enforce:      false,
	}
	r := newRouter(t, cfg, LevelHigh, 42)

	req := httptest.NewRequest("POST", "/protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 200, w.Code)
}

func TestMiddleware_MissingTokenOnMediumReturns428(t *testing.T) {
	db := newTestDB(t)
	cfg := Config{
		Verifier:     &FakeVerifier{},
		NonceStore:   NewGormNonceStore(db),
		SessionStore: NewGormSessionStore(db),
		PackageName:  "com.oneridebalingasag.app",
		Enforce:      true,
	}
	r := newRouter(t, cfg, LevelMedium, 42)

	req := httptest.NewRequest("POST", "/protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 428, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	require.Equal(t, ErrIntegrityRequired, body["error"])
}

func TestMiddleware_IOSSkipTokenPasses(t *testing.T) {
	db := newTestDB(t)
	cfg := Config{
		Verifier:     &FakeVerifier{Err: ErrVerifierUnavailable},
		NonceStore:   NewGormNonceStore(db),
		SessionStore: NewGormSessionStore(db),
		PackageName:  "com.oneridebalingasag.app",
		Enforce:      true,
	}
	r := newRouter(t, cfg, LevelHigh, 42)

	req := httptest.NewRequest("POST", "/protected", nil)
	req.Header.Set("X-Integrity-Token", "ios-skip")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 200, w.Code)
}

func TestMiddleware_HappyPathMediumConsumesNonceAndAttests(t *testing.T) {
	db := newTestDB(t)
	nonces := NewGormNonceStore(db)
	sessions := NewGormSessionStore(db)
	nonce, err := nonces.Issue(42)
	require.NoError(t, err)

	cfg := Config{
		Verifier: &FakeVerifier{Response: &Verdict{
			AppRecognition:    "PLAY_RECOGNIZED",
			DeviceRecognition: []string{"MEETS_BASIC_INTEGRITY"},
			AppLicensing:      "LICENSED",
			RequestHash:       nonce,
			PackageName:       "com.oneridebalingasag.app",
			Timestamp:         time.Now().UTC(),
		}},
		NonceStore:   nonces,
		SessionStore: sessions,
		PackageName:  "com.oneridebalingasag.app",
		Enforce:      true,
		SessionTTL:   900,
	}
	r := newRouter(t, cfg, LevelMedium, 42)

	req := httptest.NewRequest("POST", "/protected", nil)
	req.Header.Set("X-Integrity-Token", "some-opaque-token")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 200, w.Code)
	require.NotEmpty(t, w.Header().Get("X-Integrity-Attested-Until"))

	// nonce should be consumed — reusing must fail
	require.Error(t, nonces.Consume(nonce, 42))

	// session cached
	until, ok := sessions.ActiveUntil(42)
	require.True(t, ok)
	require.True(t, until.After(time.Now().UTC()))
}

func TestMiddleware_ReplayRejected(t *testing.T) {
	db := newTestDB(t)
	nonces := NewGormNonceStore(db)
	sessions := NewGormSessionStore(db)
	nonce, err := nonces.Issue(42)
	require.NoError(t, err)

	cfg := Config{
		Verifier: &FakeVerifier{Response: &Verdict{
			AppRecognition:    "PLAY_RECOGNIZED",
			DeviceRecognition: []string{"MEETS_BASIC_INTEGRITY"},
			RequestHash:       "different-hash",
			PackageName:       "com.oneridebalingasag.app",
			Timestamp:         time.Now().UTC(),
		}},
		NonceStore:   nonces,
		SessionStore: sessions,
		PackageName:  "com.oneridebalingasag.app",
		Enforce:      true,
	}
	r := newRouter(t, cfg, LevelMedium, 42)

	req := httptest.NewRequest("POST", "/protected", nil)
	req.Header.Set("X-Integrity-Token", nonce)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 403, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	require.Equal(t, ErrIntegrityReplay, body["error"])
}

func TestMiddleware_PackageMismatchAlwaysBlocks(t *testing.T) {
	db := newTestDB(t)
	nonces := NewGormNonceStore(db)
	sessions := NewGormSessionStore(db)
	nonce, err := nonces.Issue(42)
	require.NoError(t, err)

	cfg := Config{
		Verifier: &FakeVerifier{Response: &Verdict{
			AppRecognition:    "PLAY_RECOGNIZED",
			DeviceRecognition: []string{"MEETS_DEVICE_INTEGRITY"},
			RequestHash:       nonce,
			PackageName:       "com.attacker.spoof",
			Timestamp:         time.Now().UTC(),
		}},
		NonceStore:   nonces,
		SessionStore: sessions,
		PackageName:  "com.oneridebalingasag.app",
		Enforce:      true,
	}
	r := newRouter(t, cfg, LevelLow, 42)

	req := httptest.NewRequest("POST", "/protected", nil)
	req.Header.Set("X-Integrity-Token", "tok")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 403, w.Code)
}

func TestMiddleware_FailOpenMediumOnGoogleError(t *testing.T) {
	db := newTestDB(t)
	cfg := Config{
		Verifier:     &FakeVerifier{Err: ErrVerifierUnavailable},
		NonceStore:   NewGormNonceStore(db),
		SessionStore: NewGormSessionStore(db),
		PackageName:  "com.oneridebalingasag.app",
		Enforce:      true,
	}
	r := newRouter(t, cfg, LevelMedium, 42)

	req := httptest.NewRequest("POST", "/protected", nil)
	req.Header.Set("X-Integrity-Token", "tok")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 200, w.Code)
}

func TestMiddleware_FailClosedHighOnGoogleError(t *testing.T) {
	db := newTestDB(t)
	cfg := Config{
		Verifier:     &FakeVerifier{Err: ErrVerifierUnavailable},
		NonceStore:   NewGormNonceStore(db),
		SessionStore: NewGormSessionStore(db),
		PackageName:  "com.oneridebalingasag.app",
		Enforce:      true,
	}
	r := newRouter(t, cfg, LevelHigh, 42)

	req := httptest.NewRequest("POST", "/protected", nil)
	req.Header.Set("X-Integrity-Token", "tok")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 503, w.Code)
}

func TestMiddleware_SessionCacheHitSkipsVerifier(t *testing.T) {
	db := newTestDB(t)
	sessions := NewGormSessionStore(db)
	require.NoError(t, sessions.Upsert(42, time.Now().UTC().Add(10*time.Minute), "dig"))

	cfg := Config{
		Verifier: &FakeVerifier{Err: ErrVerifierUnavailable}, // must not be called
		NonceStore:   NewGormNonceStore(db),
		SessionStore: sessions,
		PackageName:  "com.oneridebalingasag.app",
		Enforce:      true,
	}
	r := newRouter(t, cfg, LevelMedium, 42)

	req := httptest.NewRequest("POST", "/protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 200, w.Code)
}

func TestMiddleware_StaleTimestampRejected(t *testing.T) {
	db := newTestDB(t)
	nonces := NewGormNonceStore(db)
	nonce, _ := nonces.Issue(42)

	cfg := Config{
		Verifier: &FakeVerifier{Response: &Verdict{
			AppRecognition:    "PLAY_RECOGNIZED",
			DeviceRecognition: []string{"MEETS_BASIC_INTEGRITY"},
			RequestHash:       nonce,
			PackageName:       "com.oneridebalingasag.app",
			Timestamp:         time.Now().UTC().Add(-10 * time.Minute),
		}},
		NonceStore:   nonces,
		SessionStore: NewGormSessionStore(db),
		PackageName:  "com.oneridebalingasag.app",
		Enforce:      true,
	}
	r := newRouter(t, cfg, LevelMedium, 42)

	req := httptest.NewRequest("POST", "/protected", nil)
	req.Header.Set("X-Integrity-Token", "tok")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 403, w.Code)
}
```

- [ ] **Step 3: Run tests — expect failures**

Run: `cd backend && go test ./pkg/integrity/... -run TestMiddleware -v`
Expected: most tests FAIL (stub middleware always 200).

- [ ] **Step 4: Commit**

```bash
git add backend/pkg/integrity/middleware.go backend/pkg/integrity/middleware_test.go
git commit -m "test(integrity): failing middleware matrix tests"
```

---

## Task 9: Middleware — implementation

**Files:**
- Modify: `backend/pkg/integrity/middleware.go`

- [ ] **Step 1: Replace stub with full implementation**

```go
package integrity

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const iosSkipToken = "ios-skip"

type Config struct {
	Verifier     Verifier
	NonceStore   NonceStore
	SessionStore SessionStore
	PackageName  string
	Enforce      bool
	SessionTTL   int // seconds; default 900
}

func (cfg *Config) ttl() time.Duration {
	if cfg.SessionTTL <= 0 {
		return 15 * time.Minute
	}
	return time.Duration(cfg.SessionTTL) * time.Second
}

// RequireIntegrity returns a Gin middleware enforcing the given level.
func RequireIntegrity(cfg Config, level Level) gin.HandlerFunc {
	return func(c *gin.Context) {
		outcome := evaluate(c, &cfg, level)
		// Audit logging is done by caller or here — skipped in stub to keep tests hermetic.
		_ = outcome
	}
}

type evalResult struct {
	Outcome Outcome
	Code    string
}

func evaluate(c *gin.Context, cfg *Config, level Level) evalResult {
	// 0. Kill switch.
	if !cfg.Enforce {
		c.Next()
		return evalResult{Outcome: OutcomeSkipped}
	}

	userID, _ := c.Get("userID")
	uid, _ := userID.(uint)

	// 1. Session cache (Low/Medium only).
	if level <= LevelMedium && uid > 0 {
		if _, ok := cfg.SessionStore.ActiveUntil(uid); ok {
			c.Next()
			return evalResult{Outcome: OutcomePass}
		}
	}

	// 2. Read token.
	token := c.GetHeader("X-Integrity-Token")
	if token == "" {
		if level == LevelLow {
			c.Next()
			return evalResult{Outcome: OutcomePass}
		}
		writeError(c, http.StatusPreconditionRequired, ErrIntegrityRequired, "Integrity token required.")
		return evalResult{Outcome: OutcomeFail, Code: ErrIntegrityRequired}
	}

	// 3. iOS skip.
	if token == iosSkipToken {
		c.Next()
		return evalResult{Outcome: OutcomeSkipped}
	}

	// 4. Verify with Google.
	verdict, err := cfg.Verifier.Verify(c.Request.Context(), token)
	if err != nil {
		log.Printf("integrity: verify error level=%s err=%v", level.String(), err)
		if level == LevelHigh {
			writeError(c, http.StatusServiceUnavailable, ErrIntegrityUnavailable, "Integrity service unavailable.")
			return evalResult{Outcome: OutcomeFail, Code: ErrIntegrityUnavailable}
		}
		c.Next() // fail-open for Low/Medium
		return evalResult{Outcome: OutcomeFailOpen}
	}

	// 5. Package name must match (always blocking).
	if !strings.EqualFold(verdict.PackageName, cfg.PackageName) {
		writeError(c, http.StatusForbidden, ErrIntegrityPackageMismatch, "Package mismatch.")
		return evalResult{Outcome: OutcomeFail, Code: ErrIntegrityPackageMismatch}
	}

	// 6. Timestamp freshness: -5m .. +1m.
	now := time.Now().UTC()
	if !verdict.Timestamp.IsZero() {
		if verdict.Timestamp.Before(now.Add(-5*time.Minute)) || verdict.Timestamp.After(now.Add(1*time.Minute)) {
			writeError(c, http.StatusForbidden, ErrIntegrityStale, "Integrity token stale.")
			return evalResult{Outcome: OutcomeFail, Code: ErrIntegrityStale}
		}
	}

	// 7. Nonce check — requestHash must match a nonce we issued for this user.
	if uid > 0 {
		if err := cfg.NonceStore.Consume(verdict.RequestHash, uid); err != nil {
			if errors.Is(err, ErrNonceNotFound) || errors.Is(err, ErrNonceUserMismatch) {
				writeError(c, http.StatusForbidden, ErrIntegrityReplay, "Integrity replay detected.")
				return evalResult{Outcome: OutcomeFail, Code: ErrIntegrityReplay}
			}
			writeError(c, http.StatusPreconditionRequired, ErrIntegrityNonceInvalid, "Nonce invalid or expired.")
			return evalResult{Outcome: OutcomeFail, Code: ErrIntegrityNonceInvalid}
		}
	}

	// 8. Level check.
	if ok, code := verdict.MeetsLevel(level); !ok {
		writeError(c, http.StatusForbidden, code, "Device failed integrity check.")
		// The client will render the "install from Play Store" CTA for this code.
		return evalResult{Outcome: OutcomeFail, Code: code}
	}

	// 9. Cache session for Low/Medium.
	if level <= LevelMedium && uid > 0 {
		until := now.Add(cfg.ttl())
		digest := verdictDigest(verdict)
		if err := cfg.SessionStore.Upsert(uid, until, digest); err == nil {
			c.Header("X-Integrity-Attested-Until", until.Format(time.RFC3339))
		}
	}

	c.Next()
	return evalResult{Outcome: OutcomePass}
}

func writeError(c *gin.Context, status int, code, msg string) {
	resp := gin.H{
		"error":   code,
		"message": msg,
	}
	if code == ErrIntegrityDeviceFailed || code == ErrIntegrityPackageMismatch {
		resp["action"] = "install_from_play_store"
		resp["play_url"] = "https://play.google.com/store/apps/details?id=com.oneridebalingasag.app"
	}
	c.AbortWithStatusJSON(status, resp)
}

func verdictDigest(v *Verdict) string {
	h := sha256.New()
	h.Write([]byte(v.AppRecognition))
	h.Write([]byte{'|'})
	for _, d := range v.DeviceRecognition {
		h.Write([]byte(d))
		h.Write([]byte{','})
	}
	h.Write([]byte{'|'})
	h.Write([]byte(v.AppLicensing))
	return hex.EncodeToString(h.Sum(nil))[:32]
}
```

- [ ] **Step 2: Run tests — expect pass**

Run: `cd backend && go test ./pkg/integrity/... -run TestMiddleware -v`
Expected: all middleware tests PASS.

- [ ] **Step 3: Run full integrity suite**

Run: `cd backend && go test ./pkg/integrity/... -v`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/pkg/integrity/middleware.go
git commit -m "feat(integrity): RequireIntegrity middleware with tiered enforcement"
```

---

## Task 10: Nonce HTTP handler

**Files:**
- Create: `backend/pkg/integrity/handlers.go`

- [ ] **Step 1: Create `backend/pkg/integrity/handlers.go`**

```go
package integrity

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// IssueNonceHandler returns a Gin handler that issues a new integrity nonce
// for the authenticated user. Must be mounted behind AuthMiddleware.
func IssueNonceHandler(store NonceStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		uidVal, ok := c.Get("userID")
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "AUTH_REQUIRED"})
			return
		}
		uid, _ := uidVal.(uint)
		n, err := store.Issue(uid)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "NONCE_ISSUE_FAILED"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"nonce":      n,
			"expires_in": 120,
		})
	}
}
```

- [ ] **Step 2: Build**

Run: `cd backend && go build ./pkg/integrity/...`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add backend/pkg/integrity/handlers.go
git commit -m "feat(integrity): IssueNonceHandler for GET /auth/integrity/nonce"
```

---

## Task 11: Register models in AutoMigrate

**Files:**
- Modify: `backend/pkg/models/models.go:456-484`

- [ ] **Step 1: Add types to AutoMigrate**

The current `AutoMigrate` function lives at `backend/pkg/models/models.go:455`. Because the integrity models live in `backend/pkg/integrity`, add a separate registration function there rather than creating a circular import.

Create `backend/pkg/integrity/migrate.go`:

```go
package integrity

import "gorm.io/gorm"

// AutoMigrate creates the integrity tables.
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(&IntegrityNonce{}, &IntegritySession{})
}
```

- [ ] **Step 2: Call it from main**

Find where `models.AutoMigrate(database)` is called in `backend/cmd/main.go` (grep for `models.AutoMigrate`). Immediately after that call, add:

```go
if err := integrity.AutoMigrate(database); err != nil {
    log.Fatalf("failed to migrate integrity tables: %v", err)
}
```

Add the import `"oneride/pkg/integrity"` to the top of main.go.

- [ ] **Step 3: Build**

Run: `cd backend && go build ./...`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add backend/pkg/integrity/migrate.go backend/cmd/main.go
git commit -m "feat(integrity): migrate nonce and session tables on boot"
```

---

## Task 12: Wire middleware and nonce route in main.go

**Files:**
- Modify: `backend/cmd/main.go`

- [ ] **Step 1: Construct dependencies after `integrity.AutoMigrate`**

```go
// Integrity dependencies
var integrityVerifier integrity.Verifier
if v, err := integrity.NewGoogleVerifier(context.Background()); err == nil {
    integrityVerifier = v
} else {
    log.Printf("integrity: Google verifier unavailable (%v); using fail-open fake", err)
    integrityVerifier = &integrity.FakeVerifier{Err: integrity.ErrVerifierUnavailable}
}
integrityCfg := integrity.Config{
    Verifier:     integrityVerifier,
    NonceStore:   integrity.NewGormNonceStore(database),
    SessionStore: integrity.NewGormSessionStore(database),
    PackageName:  "com.oneridebalingasag.app",
    Enforce:      os.Getenv("INTEGRITY_ENFORCE") == "true",
    SessionTTL:   900,
}
```

- [ ] **Step 2: Mount the nonce route inside the `protected` group (needs auth)**

After the `protected.POST("/auth/logout-all", ...)` line:

```go
protected.GET("/auth/integrity/nonce", integrity.IssueNonceHandler(integrityCfg.NonceStore))
```

- [ ] **Step 3: Apply RequireIntegrity on Low-level public routes**

Inside the `public` group, before each auth route, wrap:

```go
public.POST("/auth/register",
    integrity.RequireIntegrity(integrityCfg, integrity.LevelLow),
    handlers.Register(database))
public.POST("/auth/login",
    integrity.RequireIntegrity(integrityCfg, integrity.LevelLow),
    handlers.Login(database))
public.POST("/auth/verify-otp",
    integrity.RequireIntegrity(integrityCfg, integrity.LevelLow),
    handlers.VerifyOTP(database))
public.POST("/auth/resend-otp",
    integrity.RequireIntegrity(integrityCfg, integrity.LevelLow),
    handlers.ResendOTP(database))
```

- [ ] **Step 4: Apply RequireIntegrity on Medium-level routes**

Replace these lines in the `protected` group:

```go
protected.POST("/rides/create",
    integrity.RequireIntegrity(integrityCfg, integrity.LevelMedium),
    handlers.CreateRide(database))
protected.POST("/driver/register",
    integrity.RequireIntegrity(integrityCfg, integrity.LevelMedium),
    handlers.RegisterDriver(database))
protected.POST("/driver/requests/:id/accept",
    integrity.RequireIntegrity(integrityCfg, integrity.LevelMedium),
    handlers.AcceptRequest(database))
protected.PUT("/driver/rides/:id/status",
    integrity.RequireIntegrity(integrityCfg, integrity.LevelMedium),
    handlers.UpdateRideStatus(database))
```

- [ ] **Step 5: Apply RequireIntegrity on High-level routes**

```go
protected.POST("/payments/methods",
    integrity.RequireIntegrity(integrityCfg, integrity.LevelHigh),
    handlers.AddPaymentMethod(database))
protected.POST("/payment-proof/upload",
    integrity.RequireIntegrity(integrityCfg, integrity.LevelHigh),
    handlers.UploadPaymentProof(database))
protected.POST("/driver/withdraw",
    integrity.RequireIntegrity(integrityCfg, integrity.LevelHigh),
    handlers.RequestWithdrawal(database))
```

- [ ] **Step 6: Build**

Run: `cd backend && go build ./...`
Expected: exits 0. Fix any missing imports (`context`, `os`, `oneride/pkg/integrity`).

- [ ] **Step 7: Run full test suite**

Run: `cd backend && go test ./...`
Expected: all PASS. (`INTEGRITY_ENFORCE` defaults to false — no existing handler tests will break.)

- [ ] **Step 8: Commit**

```bash
git add backend/cmd/main.go
git commit -m "feat(integrity): mount middleware on Low/Medium/High routes"
```

---

## Task 13: Mobile — Expo local module scaffold

**Files:**
- Create: `mobile/modules/play-integrity/expo-module.config.json`
- Create: `mobile/modules/play-integrity/package.json`
- Create: `mobile/modules/play-integrity/index.ts`
- Create: `mobile/modules/play-integrity/android/build.gradle`
- Create: `mobile/modules/play-integrity/android/src/main/AndroidManifest.xml`
- Create: `mobile/modules/play-integrity/android/src/main/java/expo/modules/playintegrity/PlayIntegrityModule.kt`
- Create: `mobile/modules/play-integrity/ios/PlayIntegrityModule.swift`

- [ ] **Step 1: Create `expo-module.config.json`**

```json
{
  "platforms": ["android", "ios"],
  "android": {
    "modules": ["expo.modules.playintegrity.PlayIntegrityModule"]
  },
  "ios": {
    "modules": ["PlayIntegrityModule"]
  }
}
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "play-integrity",
  "version": "0.1.0",
  "description": "Expo module wrapping Google Play Integrity StandardIntegrityManager",
  "main": "index.ts",
  "types": "index.ts"
}
```

- [ ] **Step 3: Create `index.ts`**

```ts
import { requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type Native = {
  warmup(): Promise<void>;
  requestToken(requestHash: string): Promise<string>;
};

const Native: Native | null =
  Platform.OS === "android" ? requireNativeModule("PlayIntegrity") : null;

export async function warmup(): Promise<void> {
  if (!Native) return;
  return Native.warmup();
}

export async function requestToken(requestHash: string): Promise<string> {
  if (!Native) return "ios-skip";
  return Native.requestToken(requestHash);
}
```

- [ ] **Step 4: Create `android/build.gradle`**

```groovy
apply plugin: 'com.android.library'
apply plugin: 'kotlin-android'

group = 'expo.modules.playintegrity'
version = '0.1.0'

android {
    compileSdkVersion safeExtGet("compileSdkVersion", 34)
    namespace "expo.modules.playintegrity"

    defaultConfig {
        minSdkVersion safeExtGet("minSdkVersion", 24)
        targetSdkVersion safeExtGet("targetSdkVersion", 34)
    }
}

dependencies {
    implementation project(':expo-modules-core')
    implementation "com.google.android.play:integrity:1.4.0"
}

def safeExtGet(name, defaultValue) {
    return rootProject.ext.has(name) ? rootProject.ext.get(name) : defaultValue
}
```

- [ ] **Step 5: Create `android/src/main/AndroidManifest.xml`**

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
          package="expo.modules.playintegrity" />
```

- [ ] **Step 6: Create `android/src/main/java/expo/modules/playintegrity/PlayIntegrityModule.kt`**

```kotlin
package expo.modules.playintegrity

import com.google.android.play.core.integrity.StandardIntegrityManager
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenProvider
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest
import com.google.android.play.core.integrity.IntegrityManagerFactory
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PlayIntegrityModule : Module() {
    private var provider: StandardIntegrityTokenProvider? = null

    // Cloud project number for omji-7774e
    private val cloudProjectNumber: Long = 914776520905L

    override fun definition() = ModuleDefinition {
        Name("PlayIntegrity")

        AsyncFunction("warmup") { promise: Promise ->
            val ctx = appContext.reactContext ?: run {
                promise.reject("NO_CONTEXT", "No Android context", null)
                return@AsyncFunction
            }
            val manager: StandardIntegrityManager =
                IntegrityManagerFactory.createStandard(ctx)
            manager
                .prepareIntegrityToken(
                    StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
                        .setCloudProjectNumber(cloudProjectNumber)
                        .build()
                )
                .addOnSuccessListener { p ->
                    provider = p
                    promise.resolve(null)
                }
                .addOnFailureListener { e ->
                    promise.reject("WARMUP_FAILED", e.message, e)
                }
        }

        AsyncFunction("requestToken") { requestHash: String, promise: Promise ->
            val p = provider
            if (p == null) {
                promise.reject("NOT_WARMED_UP", "Call warmup() first", null)
                return@AsyncFunction
            }
            p.request(
                StandardIntegrityTokenRequest.builder()
                    .setRequestHash(requestHash)
                    .build()
            )
                .addOnSuccessListener { response ->
                    promise.resolve(response.token())
                }
                .addOnFailureListener { e ->
                    promise.reject("TOKEN_FAILED", e.message, e)
                }
        }
    }
}
```

- [ ] **Step 7: Create `ios/PlayIntegrityModule.swift` (no-op stub)**

```swift
import ExpoModulesCore

public class PlayIntegrityModule: Module {
    public func definition() -> ModuleDefinition {
        Name("PlayIntegrity")

        AsyncFunction("warmup") { () -> Void in }

        AsyncFunction("requestToken") { (_ requestHash: String) -> String in
            return "ios-skip"
        }
    }
}
```

- [ ] **Step 8: Commit**

```bash
git add mobile/modules/play-integrity/
git commit -m "feat(mobile): play-integrity Expo local module scaffold"
```

---

## Task 14: Mobile — IntegrityClient wrapper with tests

**Files:**
- Create: `mobile/src/services/integrity.ts`
- Create: `mobile/src/services/integrity.test.ts`

- [ ] **Step 1: Create `mobile/src/services/integrity.ts`**

```ts
import * as PlayIntegrity from "play-integrity";

export type IntegrityLevel = "low" | "medium" | "high";

type NonceResponse = { nonce: string; expires_in: number };

export interface IntegrityDeps {
  fetchNonce: () => Promise<NonceResponse>;
  requestToken: (hash: string) => Promise<string>;
  now?: () => number;
}

export class IntegrityClient {
  private attestedUntilMs = 0;
  private warmedUp = false;

  constructor(private deps: IntegrityDeps) {}

  async warmup(): Promise<void> {
    if (this.warmedUp) return;
    try {
      await PlayIntegrity.warmup();
    } catch {
      // swallow — getToken will surface real errors later
    }
    this.warmedUp = true;
  }

  noteAttested(until: Date) {
    this.attestedUntilMs = until.getTime();
  }

  isSessionActive(now: number): boolean {
    return this.attestedUntilMs > now;
  }

  async attachHeaders(
    headers: Record<string, string>,
    level: IntegrityLevel,
  ): Promise<Record<string, string>> {
    const now = (this.deps.now ?? Date.now)();
    if (level !== "high" && this.isSessionActive(now)) {
      return headers; // backend will honor session cache
    }
    const { nonce } = await this.deps.fetchNonce();
    const token = await this.deps.requestToken(nonce);
    return { ...headers, "X-Integrity-Token": token };
  }
}
```

- [ ] **Step 2: Create `mobile/src/services/integrity.test.ts`**

Tests use Jest (already in `mobile/`).

```ts
import { IntegrityClient } from "./integrity";

jest.mock("play-integrity", () => ({
  warmup: jest.fn().mockResolvedValue(undefined),
  requestToken: jest.fn(),
}));

const makeDeps = (overrides = {}) => ({
  fetchNonce: jest.fn().mockResolvedValue({ nonce: "N1", expires_in: 120 }),
  requestToken: jest.fn().mockResolvedValue("token-abc"),
  now: () => 1_700_000_000_000,
  ...overrides,
});

describe("IntegrityClient", () => {
  test("attachHeaders adds X-Integrity-Token when no session", async () => {
    const deps = makeDeps();
    const c = new IntegrityClient(deps);
    const headers = await c.attachHeaders({}, "medium");
    expect(headers["X-Integrity-Token"]).toBe("token-abc");
    expect(deps.fetchNonce).toHaveBeenCalled();
    expect(deps.requestToken).toHaveBeenCalledWith("N1");
  });

  test("attachHeaders skips token fetch when session active for medium", async () => {
    const deps = makeDeps();
    const c = new IntegrityClient(deps);
    c.noteAttested(new Date(1_700_000_600_000)); // +600s
    const headers = await c.attachHeaders({}, "medium");
    expect(headers["X-Integrity-Token"]).toBeUndefined();
    expect(deps.fetchNonce).not.toHaveBeenCalled();
  });

  test("high always fetches fresh token even with active session", async () => {
    const deps = makeDeps();
    const c = new IntegrityClient(deps);
    c.noteAttested(new Date(1_700_000_600_000));
    const headers = await c.attachHeaders({}, "high");
    expect(headers["X-Integrity-Token"]).toBe("token-abc");
    expect(deps.fetchNonce).toHaveBeenCalled();
  });

  test("low passes through when session active", async () => {
    const deps = makeDeps();
    const c = new IntegrityClient(deps);
    c.noteAttested(new Date(1_700_000_600_000));
    const headers = await c.attachHeaders({}, "low");
    expect(headers["X-Integrity-Token"]).toBeUndefined();
  });

  test("low fetches when no session", async () => {
    const deps = makeDeps();
    const c = new IntegrityClient(deps);
    const headers = await c.attachHeaders({}, "low");
    expect(headers["X-Integrity-Token"]).toBe("token-abc");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd mobile && npx jest src/services/integrity.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/services/integrity.ts mobile/src/services/integrity.test.ts
git commit -m "feat(mobile): IntegrityClient with session-aware header attachment"
```

---

## Task 15: Mobile — wire IntegrityClient into API layer

**Files:**
- Modify: `mobile/src/services/api.ts`
- Modify: `mobile/App.tsx` (or equivalent root — grep to confirm)

- [ ] **Step 1: Grep for the actual root component**

Run: `grep -rn "registerRootComponent\|AppRegistry.registerComponent" mobile/ --include="*.ts" --include="*.tsx" | head`
Expected: identifies the entry file (likely `App.tsx` or `index.ts`).

- [ ] **Step 2: Instantiate a shared client in `api.ts`**

Open `mobile/src/services/api.ts` and add near the top:

```ts
import { IntegrityClient, IntegrityLevel } from "./integrity";
import * as PlayIntegrity from "play-integrity";

export const integrity = new IntegrityClient({
  fetchNonce: async () => {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/integrity/nonce`, {
      headers: authHeader(),
    });
    if (!res.ok) throw new Error("nonce fetch failed");
    return res.json();
  },
  requestToken: (hash) => PlayIntegrity.requestToken(hash),
});
```

(If `API_BASE_URL` and `authHeader` are named differently in the existing file, use those.)

- [ ] **Step 3: Add helper for protected fetches**

```ts
export async function protectedFetch(
  path: string,
  level: IntegrityLevel,
  init: RequestInit = {},
): Promise<Response> {
  const baseHeaders: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    ...authHeader(),
  };
  const headers = await integrity.attachHeaders(baseHeaders, level);
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const until = res.headers.get("X-Integrity-Attested-Until");
  if (until) integrity.noteAttested(new Date(until));
  return res;
}
```

- [ ] **Step 4: Update callers for the three sensitive endpoint groups**

Grep for existing calls: `grep -n "rides/create\|payment-proof/upload\|payments/methods\|driver/withdraw" mobile/src/services/api.ts`. For each matching call, replace the raw `fetch` with `protectedFetch(path, level, ...)`:
- `rides/create` → `"medium"`
- `driver/register`, `driver/requests/:id/accept`, `driver/rides/:id/status` → `"medium"`
- `payments/methods` (POST), `payment-proof/upload` (POST), `driver/withdraw` (POST) → `"high"`
- `auth/login`, `auth/register`, `auth/verify-otp`, `auth/resend-otp` → `"low"` (low token is optional; backend treats missing token as pass at Low)

- [ ] **Step 5: Warm up the provider at app start**

In the entry file found in Step 1, add inside the top-level component's first `useEffect` (or create one):

```ts
import { integrity } from "./src/services/api";

useEffect(() => {
  integrity.warmup().catch(() => {});
}, []);
```

- [ ] **Step 6: TypeScript check**

Run: `cd mobile && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/services/api.ts mobile/App.tsx  # or the actual entry file
git commit -m "feat(mobile): attach integrity headers on sensitive API calls"
```

---

## Task 16: Register local module with Expo

**Files:**
- Modify: `mobile/package.json`

- [ ] **Step 1: Add the local module as a dependency**

Edit `mobile/package.json` dependencies to include:

```json
"play-integrity": "file:./modules/play-integrity"
```

- [ ] **Step 2: Install**

Run: `cd mobile && npm install`
Expected: `play-integrity` linked from local path; no errors.

- [ ] **Step 3: Run TS check again**

Run: `cd mobile && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/package-lock.json
git commit -m "chore(mobile): link play-integrity local module"
```

---

## Task 17: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Grep for existing env var section**

Run: `grep -n "PLAY_INTEGRITY\|INTEGRITY_ENFORCE\|Environment Variables\|ENV" README.md | head`
Expected: finds an env section, or confirms none exists.

- [ ] **Step 2: Append the following to the env/config section of `README.md`**

```markdown
## Play Integrity

The backend verifies Google Play Integrity tokens on sensitive routes. Configure:

| Env var | Required | Purpose |
|---|---|---|
| `PLAY_INTEGRITY_SA_JSON` | dev | Path to service account JSON |
| `PLAY_INTEGRITY_SA_JSON_INLINE` | prod | Raw JSON content (Railway/Fly) |
| `PLAY_INTEGRITY_PACKAGE` | no | Defaults to `com.oneridebalingasag.app` |
| `INTEGRITY_ENFORCE` | no | `true` enforces; `false` (default) monitor-only |

One-time setup:
1. Link Google Cloud project `omji-7774e` in Play Console → App Integrity.
2. Create a service account in GCP with role **Play Integrity API user**.
3. Enable the Play Integrity API in the GCP project.
4. Download the key JSON and load into secrets as `PLAY_INTEGRITY_SA_JSON_INLINE`.

Rollout plan: see `docs/superpowers/specs/2026-04-13-play-integrity-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: Play Integrity env vars and rollout pointer"
```

---

## Self-Review

**Spec coverage:**
- Tiered levels (Low/Medium/High) → Tasks 1, 6, 9, 12 ✓
- Session-bound attestation → Tasks 4, 5, 9 ✓
- Server-side verdict decoding → Task 7 ✓
- Backend-issued nonces, one-time-use → Tasks 2, 3, 10 ✓
- Fail-open Low/Medium, fail-closed High → Task 9 (TestMiddleware_FailOpenMediumOnGoogleError / FailClosedHighOnGoogleError) ✓
- Monitor-only via `INTEGRITY_ENFORCE` → Task 9 + Task 12 ✓
- Package mismatch always blocking → Task 9 (TestMiddleware_PackageMismatchAlwaysBlocks) ✓
- Timestamp freshness → Task 9 (TestMiddleware_StaleTimestampRejected) ✓
- iOS skip → Task 9 + Task 13 + Task 14 ✓
- Mobile native bridge + TS wrapper + API wiring → Tasks 13–16 ✓
- Env + docs → Task 17 ✓
- Audit log entries: **gap** — the design calls for audit log writes but I left them out of middleware for test hermeticity. The existing audit package can be injected later as a follow-up; for v1 the `log.Printf` in Task 9 Step 1 covers minimum observability. Noted as acceptable for monitor-only phase.
- Circuit breaker: mentioned in spec but not implemented — will add post-rollout only if metrics show need. **Intentional YAGNI trim for v1.**

**Placeholder scan:** none.

**Type consistency:** `NonceStore`, `SessionStore`, `Verifier`, `Config`, `Level` consistent across tasks. `MeetsLevel` defined in Task 1, used in Task 9. `FakeVerifier.Err` / `Response` consistent.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-13-play-integrity.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
