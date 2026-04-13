package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"oneride/pkg/auth"
	"oneride/pkg/models"

	"github.com/gin-gonic/gin"
)

// TestRefreshEndpoint_RotatesToken issues a fresh refresh token via auth.Issue,
// sends it to the RefreshToken handler, and asserts:
//   - HTTP 200
//   - a new refresh_token is returned that differs from the original
//   - an access_token and expires_in are present
func TestRefreshEndpoint_RotatesToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupAuthTestDB(t)

	// Retrieve the seeded user.
	var user models.User
	if err := db.Where("email = ?", "test@example.com").First(&user).Error; err != nil {
		t.Fatalf("seed user not found: %v", err)
	}

	raw, _, err := auth.Issue(db, user.ID, "test-ua", "127.0.0.1", "")
	if err != nil {
		t.Fatalf("auth.Issue: %v", err)
	}

	r := gin.New()
	r.POST("/auth/refresh", RefreshToken(db))

	body, _ := json.Marshal(map[string]string{"refresh_token": raw})
	req, _ := http.NewRequest("POST", "/auth/refresh", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	newRT, _ := resp["refresh_token"].(string)
	if newRT == "" {
		t.Fatal("expected refresh_token in response, got none")
	}
	if newRT == raw {
		t.Fatal("refresh_token should be rotated, but got the same value")
	}
	if at, _ := resp["access_token"].(string); at == "" {
		t.Fatal("expected access_token in response, got none")
	}
	if _, ok := resp["expires_in"]; !ok {
		t.Fatal("expected expires_in in response")
	}
}

// TestRefreshEndpoint_ReuseDetection redeems a token once (rotates it), then
// replays the original token and asserts HTTP 401.
func TestRefreshEndpoint_ReuseDetection(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupAuthTestDB(t)

	var user models.User
	if err := db.Where("email = ?", "test@example.com").First(&user).Error; err != nil {
		t.Fatalf("seed user not found: %v", err)
	}

	raw, _, err := auth.Issue(db, user.ID, "test-ua", "127.0.0.1", "")
	if err != nil {
		t.Fatalf("auth.Issue: %v", err)
	}

	r := gin.New()
	r.POST("/auth/refresh", RefreshToken(db))

	doRefresh := func(token string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]string{"refresh_token": token})
		req, _ := http.NewRequest("POST", "/auth/refresh", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// First redemption must succeed.
	w1 := doRefresh(raw)
	if w1.Code != http.StatusOK {
		t.Fatalf("first refresh: expected 200, got %d: %s", w1.Code, w1.Body.String())
	}

	// Replaying the original (now revoked) token must return 401.
	w2 := doRefresh(raw)
	if w2.Code != http.StatusUnauthorized {
		t.Fatalf("reuse replay: expected 401, got %d: %s", w2.Code, w2.Body.String())
	}
}

// TestLogoutAll_BumpsTokenVersion calls the LogoutAll handler with a userID
// injected into the gin context and asserts:
//   - HTTP 200
//   - User.TokenVersion incremented
//   - all refresh tokens for the user are revoked
func TestLogoutAll_BumpsTokenVersion(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupAuthTestDB(t)

	var user models.User
	if err := db.Where("email = ?", "test@example.com").First(&user).Error; err != nil {
		t.Fatalf("seed user not found: %v", err)
	}
	initialVersion := user.TokenVersion

	// Issue a couple of refresh tokens.
	for i := 0; i < 2; i++ {
		if _, _, err := auth.Issue(db, user.ID, "ua", "ip", ""); err != nil {
			t.Fatalf("auth.Issue: %v", err)
		}
	}

	r := gin.New()
	// Inject userID into the context, mimicking AuthMiddleware.
	r.POST("/auth/logout-all", func(c *gin.Context) {
		c.Set("userID", user.ID)
		LogoutAll(db)(c)
	})

	req, _ := http.NewRequest("POST", "/auth/logout-all", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if success, _ := resp["success"].(bool); !success {
		t.Fatalf("expected success:true, got %v", resp)
	}

	// Reload user and verify TokenVersion bumped.
	var updated models.User
	db.First(&updated, user.ID)
	if updated.TokenVersion != initialVersion+1 {
		t.Fatalf("TokenVersion: expected %d, got %d", initialVersion+1, updated.TokenVersion)
	}

	// Verify all refresh tokens are revoked.
	var activeCount int64
	db.Model(&models.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", user.ID).
		Count(&activeCount)
	if activeCount != 0 {
		t.Fatalf("expected 0 active refresh tokens after logout-all, got %d", activeCount)
	}
}
