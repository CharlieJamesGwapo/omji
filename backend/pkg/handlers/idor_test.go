package handlers

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"oneride/pkg/middleware"
	"oneride/pkg/models"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// setupIDORTestDB creates an in-memory SQLite DB with two users and one
// resource (ride / delivery / order) owned by userA. It returns the db and
// the two user records.
func setupIDORTestDB(t *testing.T) (db *gorm.DB, userA, userB models.User) {
	t.Helper()
	os.Setenv("JWT_SECRET", testJWTSecret)
	os.Setenv("REFRESH_TOKEN_PEPPER", strings.Repeat("y", 32))

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(
		&models.User{},
		&models.RefreshToken{},
		&models.Ride{},
		&models.Delivery{},
		&models.Order{},
		&models.Store{},
		&models.Driver{},
	); err != nil {
		t.Fatal(err)
	}

	pw, _ := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.DefaultCost)
	userA = models.User{Name: "Alice", Email: "alice@test.com", Phone: "0900", Password: string(pw), Role: "user", TokenVersion: 1, ReferralCode: "ALICE01"}
	userB = models.User{Name: "Bob", Email: "bob@test.com", Phone: "0911", Password: string(pw), Role: "user", TokenVersion: 1, ReferralCode: "BOB0001"}
	db.Create(&userA)
	db.Create(&userB)
	return db, userA, userB
}

// makeAuthRequest returns an *http.Request with a valid Bearer token for the
// given user. audience is always the mobile audience.
func makeAuthRequest(t *testing.T, method, path string, userID uint, email, role string) *http.Request {
	t.Helper()
	tok, err := GenerateAccessToken(userID, email, role, 1, AudienceMobile)
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}
	req, _ := http.NewRequest(method, path, nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	return req
}

// TestGetRideDetails_IDOR verifies that userB cannot access a ride owned by userA.
func TestGetRideDetails_IDOR(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, userA, userB := setupIDORTestDB(t)

	// Create a ride owned by userA
	ride := models.Ride{UserID: &userA.ID, PickupLocation: "A", DropoffLocation: "B", Status: "pending"}
	db.Create(&ride)

	r := gin.New()
	r.Use(middleware.AuthMiddleware())
	r.GET("/rides/:id", GetRideDetails(db))

	// userA should get 200
	t.Run("owner gets 200", func(t *testing.T) {
		req := makeAuthRequest(t, "GET", fmt.Sprintf("/rides/%d", ride.ID), userA.ID, userA.Email, userA.Role)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("owner: expected 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	// userB should get 404 (IDOR block)
	t.Run("non-owner gets 404", func(t *testing.T) {
		req := makeAuthRequest(t, "GET", fmt.Sprintf("/rides/%d", ride.ID), userB.ID, userB.Email, userB.Role)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusNotFound {
			t.Errorf("non-owner: expected 404, got %d: %s", w.Code, w.Body.String())
		}
	})
}

// TestGetDeliveryDetails_IDOR verifies that userB cannot access a delivery owned by userA.
func TestGetDeliveryDetails_IDOR(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, userA, userB := setupIDORTestDB(t)

	delivery := models.Delivery{UserID: &userA.ID, PickupLocation: "A", DropoffLocation: "B", Status: "pending"}
	db.Create(&delivery)

	r := gin.New()
	r.Use(middleware.AuthMiddleware())
	r.GET("/deliveries/:id", GetDeliveryDetails(db))

	t.Run("owner gets 200", func(t *testing.T) {
		req := makeAuthRequest(t, "GET", fmt.Sprintf("/deliveries/%d", delivery.ID), userA.ID, userA.Email, userA.Role)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("owner: expected 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("non-owner gets 404", func(t *testing.T) {
		req := makeAuthRequest(t, "GET", fmt.Sprintf("/deliveries/%d", delivery.ID), userB.ID, userB.Email, userB.Role)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusNotFound {
			t.Errorf("non-owner: expected 404, got %d: %s", w.Code, w.Body.String())
		}
	})
}

// TestGetOrderDetails_IDOR verifies that userB cannot access an order owned by userA.
func TestGetOrderDetails_IDOR(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, userA, userB := setupIDORTestDB(t)

	order := models.Order{UserID: &userA.ID, Status: "pending", PaymentMethod: "cash"}
	db.Create(&order)

	r := gin.New()
	r.Use(middleware.AuthMiddleware())
	r.GET("/orders/:id", GetOrderDetails(db))

	t.Run("owner gets 200", func(t *testing.T) {
		req := makeAuthRequest(t, "GET", fmt.Sprintf("/orders/%d", order.ID), userA.ID, userA.Email, userA.Role)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("owner: expected 200, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("non-owner gets 404", func(t *testing.T) {
		req := makeAuthRequest(t, "GET", fmt.Sprintf("/orders/%d", order.ID), userB.ID, userB.Email, userB.Role)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusNotFound {
			t.Errorf("non-owner: expected 404, got %d: %s", w.Code, w.Body.String())
		}
	})
}
