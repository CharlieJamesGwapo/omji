package handlers

// security_test.go — negative-path JWT tests that complement the existing
// IDOR/auth/lockout suite.  Tests call middleware.AuthMiddleware() directly so
// that all claim-enforcement logic lives in one place (middleware.go).
//
// Audience enforcement: AuthMiddleware does NOT call jwt.WithAudiences — it
// only validates algorithm ("HS256") and issuer ("oneride-api"), plus
// expiration via the library default.  TestAuth_RejectsWrongAudience is
// therefore omitted; a comment below explains this.

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"oneride/pkg/middleware"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// setSecurityEnv sets the minimum env vars required for AuthMiddleware to
// operate.  JWT_SECRET is already initialised by TestMain (jwt_test.go) to
// testJWTSecret — we must NOT override it here because config.GetJWTSecret
// caches the value on first call (sync.Once).  We only set the additional
// vars that our tests need.
func setSecurityEnv(t *testing.T) {
	t.Helper()
	t.Setenv("REFRESH_TOKEN_PEPPER", strings.Repeat("z", 32))
	t.Setenv("SECURITY_V2", "true")
}

// securityTestSecret is the JWT signing secret used in all security tests.
// It must equal testJWTSecret (defined in jwt_test.go) because
// config.GetJWTSecret caches the first value it sees (set by TestMain) and
// AuthMiddleware reads it through that cache.
var securityTestSecret = testJWTSecret

// authMiddlewareRouter returns a minimal gin engine that protects /ping with
// AuthMiddleware and responds 200 on success.
func authMiddlewareRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(middleware.AuthMiddleware())
	r.GET("/ping", func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	return r
}

// doAuthRequest fires a GET /ping with the supplied Authorization header value
// and returns the HTTP status code.
func doAuthRequest(r *gin.Engine, bearerToken string) int {
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	if bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+bearerToken)
	}
	r.ServeHTTP(w, req)
	return w.Code
}

// TestAuth_RejectsAlgNone verifies that AuthMiddleware refuses a token signed
// with the "none" algorithm even when the payload looks otherwise valid.
// jwt.WithValidMethods([]string{"HS256"}) in AuthMiddleware is the guard here.
func TestAuth_RejectsAlgNone(t *testing.T) {
	setSecurityEnv(t)

	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   "1",
		"email": "attacker@evil.com",
		"role":  "admin",
		"iss":   "oneride-api",
		"aud":   "oneride-mobile",
		"exp":   now.Add(time.Hour).Unix(),
		"iat":   now.Unix(),
		"jti":   "alg-none-jti",
		"tver":  float64(1),
	}
	// jwt.UnsafeAllowNoneSignatureType is required to sign with "none".
	tok := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	tokenStr, err := tok.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("failed to sign alg:none token: %v", err)
	}

	r := authMiddlewareRouter()
	if code := doAuthRequest(r, tokenStr); code != http.StatusUnauthorized {
		t.Errorf("alg:none token: got HTTP %d, want 401", code)
	}
}

// TestAuth_RejectsWrongIssuer verifies that a valid HS256 token whose "iss"
// claim is not "oneride-api" is rejected.
// jwt.WithIssuer("oneride-api") in AuthMiddleware is the guard here.
func TestAuth_RejectsWrongIssuer(t *testing.T) {
	setSecurityEnv(t)

	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   "1",
		"email": "attacker@evil.com",
		"role":  "admin",
		"iss":   "evil",            // wrong issuer
		"aud":   "oneride-mobile",
		"exp":   now.Add(time.Hour).Unix(),
		"iat":   now.Unix(),
		"jti":   "wrong-issuer-jti",
		"tver":  float64(1),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	// Sign with the correct secret — rejection must be due to issuer mismatch.
	tokenStr, err := tok.SignedString([]byte(securityTestSecret))
	if err != nil {
		t.Fatalf("failed to sign wrong-issuer token: %v", err)
	}

	r := authMiddlewareRouter()
	if code := doAuthRequest(r, tokenStr); code != http.StatusUnauthorized {
		t.Errorf("wrong-issuer token: got HTTP %d, want 401", code)
	}
}

// TestAuth_RejectsExpiredToken verifies that a token whose "exp" is in the
// past is refused by AuthMiddleware.
func TestAuth_RejectsExpiredToken(t *testing.T) {
	setSecurityEnv(t)

	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   "1",
		"email": "user@oneride.app",
		"role":  "user",
		"iss":   "oneride-api",
		"aud":   "oneride-mobile",
		"exp":   now.Add(-time.Hour).Unix(), // expired one hour ago
		"iat":   now.Add(-2 * time.Hour).Unix(),
		"jti":   "expired-jti",
		"tver":  float64(1),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := tok.SignedString([]byte(securityTestSecret))
	if err != nil {
		t.Fatalf("failed to sign expired token: %v", err)
	}

	r := authMiddlewareRouter()
	if code := doAuthRequest(r, tokenStr); code != http.StatusUnauthorized {
		t.Errorf("expired token: got HTTP %d, want 401", code)
	}
}

// NOTE — TestAuth_RejectsWrongAudience is intentionally omitted.
// AuthMiddleware (middleware/middleware.go) uses jwt.NewParser with only
// jwt.WithValidMethods and jwt.WithIssuer; no jwt.WithAudiences option is
// passed.  The golang-jwt/v5 library therefore does not validate the "aud"
// claim on REST routes, so a wrong-audience token would be accepted.
// Audience enforcement can be added as a follow-up security hardening task.
