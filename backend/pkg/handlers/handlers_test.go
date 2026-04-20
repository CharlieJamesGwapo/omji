package handlers

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"oneride/pkg/models"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// ============================================================
// Test: RequestWithdrawal idempotency dedup
// ============================================================

// setupWithdrawalDB creates an in-memory SQLite DB with all models needed
// for the RequestWithdrawal handler.
func setupWithdrawalDB(t *testing.T) (*gorm.DB, models.User, models.Driver, models.Wallet) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&models.User{},
		&models.Driver{},
		&models.Wallet{},
		&models.WalletTransaction{},
		&models.WithdrawalRequest{},
		&models.Notification{},
		&models.AuditLog{},
	))
	user := models.User{Name: "Driver", Email: fmt.Sprintf("wd%d@test.com", 1), Phone: "0900000001", Password: "hashed", Role: "driver", ReferralCode: "WD-REF"}
	require.NoError(t, db.Create(&user).Error)
	driver := models.Driver{UserID: user.ID, VehicleType: "motorcycle", VehicleModel: "Honda", VehiclePlate: "WD-001", LicenseNumber: "LIC-WD001"}
	require.NoError(t, db.Create(&driver).Error)
	wallet := models.Wallet{UserID: user.ID, Balance: 1000}
	require.NoError(t, db.Create(&wallet).Error)
	return db, user, driver, wallet
}

// withdrawalRouter wires a test router with the RequestWithdrawal handler
// and injects userID via a middleware shim.
func withdrawalRouter(db *gorm.DB, userID uint) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/driver/withdraw", func(c *gin.Context) {
		c.Set("userID", userID)
		RequestWithdrawal(db)(c)
	})
	return r
}

func TestRequestWithdrawal_Idempotent(t *testing.T) {
	db, user, driver, _ := setupWithdrawalDB(t)
	r := withdrawalRouter(db, user.ID)

	body := `{"amount":200,"method":"gcash","account_number":"09171234567","account_name":"Test Driver"}`

	// --- First call with key-A: should succeed ---
	w1 := httptest.NewRecorder()
	req1, _ := http.NewRequest("POST", "/driver/withdraw", strings.NewReader(body))
	req1.Header.Set("Content-Type", "application/json")
	req1.Header.Set("Idempotency-Key", "key-A")
	r.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusOK, w1.Code, "first call should succeed")

	var count1 int64
	db.Model(&models.WithdrawalRequest{}).Where("driver_id = ?", driver.ID).Count(&count1)
	assert.Equal(t, int64(1), count1, "one withdrawal row after first call")

	// Check balance dropped by 200
	var wallet1 models.Wallet
	db.Where("user_id = ?", user.ID).First(&wallet1)
	assert.InDelta(t, 800.0, wallet1.Balance, 0.01, "balance should be 800 after first call")

	// --- Second call with SAME key-A: idempotent replay, no new row ---
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("POST", "/driver/withdraw", strings.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Idempotency-Key", "key-A")
	r.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusOK, w2.Code, "second call with same key should return 200 replay")

	var count2 int64
	db.Model(&models.WithdrawalRequest{}).Where("driver_id = ?", driver.ID).Count(&count2)
	assert.Equal(t, int64(1), count2, "still only one withdrawal row (dedup)")

	var wallet2 models.Wallet
	db.Where("user_id = ?", user.ID).First(&wallet2)
	assert.InDelta(t, 800.0, wallet2.Balance, 0.01, "balance should NOT drop again on replay")

	// --- Third call with key-B: new key, creates second row ---
	w3 := httptest.NewRecorder()
	req3, _ := http.NewRequest("POST", "/driver/withdraw", strings.NewReader(body))
	req3.Header.Set("Content-Type", "application/json")
	req3.Header.Set("Idempotency-Key", "key-B")
	r.ServeHTTP(w3, req3)
	assert.Equal(t, http.StatusOK, w3.Code, "third call with different key should succeed")

	var count3 int64
	db.Model(&models.WithdrawalRequest{}).Where("driver_id = ?", driver.ID).Count(&count3)
	assert.Equal(t, int64(2), count3, "two withdrawal rows after third call with new key")

	var wallet3 models.Wallet
	db.Where("user_id = ?", user.ID).First(&wallet3)
	assert.InDelta(t, 600.0, wallet3.Balance, 0.01, "balance should drop by 200 again for new key")
}

func TestRecordCommission_DeductionFailurePropagates(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("sqlite open: %v", err)
	}
	if err := db.AutoMigrate(&models.Driver{}, &models.CommissionRecord{}, &models.CommissionConfig{}); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	db.Create(&models.CommissionConfig{Percentage: 10, IsActive: true})
	// Do NOT seed the driver — triggers First(&driver, 9999) failure path

	err = db.Transaction(func(tx *gorm.DB) error {
		return createCommissionRecord(tx, "ride", 999, 9999, 100.0, "wallet")
	})
	if err == nil {
		t.Fatal("expected commission deduction failure to propagate as error; got nil")
	}
}
