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
	// Use the same secret as TestMain (jwt_test.go) to avoid conflicting with
	// the sync.Once cache in config.GetJWTSecret.
	os.Setenv("JWT_SECRET", testJWTSecret)
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
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	data, ok := resp["data"].(map[string]any)
	if !ok {
		t.Fatalf("no data object: %v", resp)
	}
	if tok, _ := data["token"].(string); tok == "" {
		t.Fatal("missing token")
	}
	if rt, _ := data["refresh_token"].(string); rt == "" {
		t.Fatal("missing refresh_token")
	}
}

func TestLogin_LocksAfterFiveFailures(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := setupAuthTestDB(t)

	r := gin.New()
	r.POST("/login", Login(db))

	// POST 5 bad-password requests
	for i := 0; i < 5; i++ {
		body := `{"email":"test@example.com","password":"wrongpassword"}`
		req, _ := http.NewRequest("POST", "/login", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected 401, got %d: %s", i+1, w.Code, w.Body.String())
		}
	}

	// 6th request with CORRECT password — should be locked (429)
	body := `{"email":"test@example.com","password":"password123"}`
	req, _ := http.NewRequest("POST", "/login", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after lockout, got %d: %s", w.Code, w.Body.String())
	}
}
