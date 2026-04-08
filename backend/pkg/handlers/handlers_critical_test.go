package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"omji/pkg/models"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupTestDB creates an in-memory SQLite database with all models migrated.
func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, models.AutoMigrate(db))
	return db
}

// setupRouter creates a gin router in test mode.
func setupRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	return gin.New()
}

// jsonBody helper to create a request body.
func jsonBody(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// apiResponse is a generic parsed API response.
type apiResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data"`
	Error   string      `json:"error"`
}

// seedUser creates a test user and returns it.
func seedUser(t *testing.T, db *gorm.DB, name, email, role string) models.User {
	t.Helper()
	user := models.User{Name: name, Email: email, Phone: email, Password: "hashed", Role: role, ReferralCode: "REF-" + email}
	require.NoError(t, db.Create(&user).Error)
	return user
}

// seedDriver creates a test driver linked to a user.
func seedDriver(t *testing.T, db *gorm.DB, userID uint) models.Driver {
	t.Helper()
	driver := models.Driver{UserID: userID, VehicleType: "motorcycle", VehicleModel: "Honda", VehiclePlate: "ABC-" + string(rune(userID+48)), LicenseNumber: "LIC-" + string(rune(userID+48))}
	require.NoError(t, db.Create(&driver).Error)
	return driver
}

// ============================================================
// Test: safeNotify does not panic on nil UserID
// ============================================================

func TestSafeNotify_NilUserID(t *testing.T) {
	db := setupTestDB(t)

	// Should not panic
	safeNotify(db, nil, "Test", "Body", "test")

	var count int64
	db.Model(&models.Notification{}).Count(&count)
	assert.Equal(t, int64(0), count, "no notification should be created for nil userID")
}

func TestSafeNotify_ValidUserID(t *testing.T) {
	db := setupTestDB(t)
	user := seedUser(t, db, "Test", "test@test.com", "user")

	safeNotify(db, &user.ID, "Hello", "World", "test_type")

	var notif models.Notification
	err := db.First(&notif).Error
	require.NoError(t, err)
	assert.Equal(t, user.ID, notif.UserID)
	assert.Equal(t, "Hello", notif.Title)
	assert.Equal(t, "World", notif.Body)
	assert.Equal(t, "test_type", notif.Type)
}

// ============================================================
// Test: uintPtr helper
// ============================================================

func TestUintPtr(t *testing.T) {
	val := uint(42)
	ptr := uintPtr(val)
	require.NotNil(t, ptr)
	assert.Equal(t, val, *ptr)
}

// ============================================================
// Test: DeleteUser handler - full cascade deletion
// ============================================================

func TestDeleteUser_CascadeDeletion(t *testing.T) {
	db := setupTestDB(t)

	// Create user with related records
	user := seedUser(t, db, "ToDelete", "delete@test.com", "user")
	uid := user.ID

	// Create wallet + transaction
	wallet := models.Wallet{UserID: uid, Balance: 100}
	require.NoError(t, db.Create(&wallet).Error)
	walletTx := models.WalletTransaction{WalletID: uintPtr(wallet.ID), UserID: uintPtr(uid), Type: "top_up", Amount: 100, Description: "test"}
	require.NoError(t, db.Create(&walletTx).Error)

	// Create notification, push token, saved address
	require.NoError(t, db.Create(&models.Notification{UserID: uid, Title: "t", Body: "b", Type: "test"}).Error)
	require.NoError(t, db.Create(&models.PushToken{UserID: uid, Token: "tok", Platform: "android"}).Error)
	require.NoError(t, db.Create(&models.SavedAddress{UserID: uid, Label: "Home", Address: "123 St"}).Error)

	// Create a ride referencing this user
	ride := models.Ride{UserID: uintPtr(uid), PickupLocation: "A", DropoffLocation: "B", Status: "completed", VehicleType: "motorcycle"}
	require.NoError(t, db.Create(&ride).Error)

	// Setup router and call delete
	router := setupRouter()
	router.DELETE("/admin/users/:id", DeleteUser(db))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/admin/users/"+itoa(uid), nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp apiResponse
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.True(t, resp.Success)

	// Verify user is deleted
	var userCount int64
	db.Model(&models.User{}).Where("id = ?", uid).Count(&userCount)
	assert.Equal(t, int64(0), userCount, "user should be deleted")

	// Verify owned records are deleted
	var walletCount, notifCount, pushCount, addrCount int64
	db.Model(&models.Wallet{}).Where("user_id = ?", uid).Count(&walletCount)
	db.Model(&models.Notification{}).Where("user_id = ?", uid).Count(&notifCount)
	db.Model(&models.PushToken{}).Where("user_id = ?", uid).Count(&pushCount)
	db.Model(&models.SavedAddress{}).Where("user_id = ?", uid).Count(&addrCount)
	assert.Equal(t, int64(0), walletCount, "wallet should be deleted")
	assert.Equal(t, int64(0), notifCount, "notifications should be deleted")
	assert.Equal(t, int64(0), pushCount, "push tokens should be deleted")
	assert.Equal(t, int64(0), addrCount, "saved addresses should be deleted")

	// Verify ride still exists but user_id is NULL
	var updatedRide models.Ride
	require.NoError(t, db.First(&updatedRide, ride.ID).Error)
	assert.Nil(t, updatedRide.UserID, "ride.user_id should be NULL after user deletion")

	// Verify wallet_transactions still exist but user_id and wallet_id are NULL
	var updatedWalletTx models.WalletTransaction
	require.NoError(t, db.First(&updatedWalletTx, walletTx.ID).Error)
	assert.Nil(t, updatedWalletTx.UserID, "wallet_tx.user_id should be NULL")
	assert.Nil(t, updatedWalletTx.WalletID, "wallet_tx.wallet_id should be NULL")
}

// itoa for uint
func itoa(n uint) string {
	return fmt.Sprintf("%d", n)
}

func TestDeleteUser_NotFound(t *testing.T) {
	db := setupTestDB(t)
	router := setupRouter()
	router.DELETE("/admin/users/:id", DeleteUser(db))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/admin/users/9999", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestDeleteUser_InvalidID(t *testing.T) {
	db := setupTestDB(t)
	router := setupRouter()
	router.DELETE("/admin/users/:id", DeleteUser(db))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/admin/users/abc", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ============================================================
// Test: DeleteDriver handler
// ============================================================

func TestDeleteDriver_CascadeDeletion(t *testing.T) {
	db := setupTestDB(t)

	user := seedUser(t, db, "DriverUser", "driver@test.com", "driver")
	driver := seedDriver(t, db, user.ID)
	did := driver.ID

	// Create a ride referencing this driver
	ride := models.Ride{UserID: uintPtr(user.ID), DriverID: uintPtr(did), PickupLocation: "A", DropoffLocation: "B", Status: "completed", VehicleType: "motorcycle"}
	require.NoError(t, db.Create(&ride).Error)

	// Create commission record
	require.NoError(t, db.Create(&models.CommissionRecord{ServiceType: "ride", ServiceID: ride.ID, DriverID: did, TotalFare: 100, CommissionPercentage: 10, CommissionAmount: 10, PaymentMethod: "cash", Status: "pending_collection"}).Error)

	router := setupRouter()
	router.DELETE("/admin/drivers/:id", DeleteDriver(db))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/admin/drivers/"+itoa(did), nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify driver deleted
	var driverCount int64
	db.Model(&models.Driver{}).Where("id = ?", did).Count(&driverCount)
	assert.Equal(t, int64(0), driverCount, "driver should be deleted")

	// Verify ride still exists but driver_id is NULL
	var updatedRide models.Ride
	require.NoError(t, db.First(&updatedRide, ride.ID).Error)
	assert.Nil(t, updatedRide.DriverID, "ride.driver_id should be NULL after driver deletion")

	// Verify commission records deleted
	var commCount int64
	db.Model(&models.CommissionRecord{}).Where("driver_id = ?", did).Count(&commCount)
	assert.Equal(t, int64(0), commCount, "commission records should be deleted")
}

// ============================================================
// Test: DeleteStore handler
// ============================================================

func TestDeleteStore_CascadeDeletion(t *testing.T) {
	db := setupTestDB(t)

	store := models.Store{Name: "Test Store", Category: "restaurant", Address: "123 St"}
	require.NoError(t, db.Create(&store).Error)
	sid := store.ID

	// Create menu items
	require.NoError(t, db.Create(&models.MenuItem{StoreID: sid, Name: "Burger", Price: 100, Category: "food"}).Error)

	// Create order referencing store
	order := models.Order{UserID: uintPtr(1), StoreID: uintPtr(sid), Status: "delivered", PaymentMethod: "cash", Subtotal: 100, TotalAmount: 100}
	require.NoError(t, db.Create(&order).Error)

	router := setupRouter()
	router.DELETE("/admin/stores/:id", DeleteStore(db))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/admin/stores/"+itoa(sid), nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify store deleted
	var storeCount int64
	db.Model(&models.Store{}).Where("id = ?", sid).Count(&storeCount)
	assert.Equal(t, int64(0), storeCount, "store should be deleted")

	// Verify menu items deleted
	var menuCount int64
	db.Model(&models.MenuItem{}).Where("store_id = ?", sid).Count(&menuCount)
	assert.Equal(t, int64(0), menuCount, "menu items should be deleted")

	// Verify order still exists but store_id is NULL
	var updatedOrder models.Order
	require.NoError(t, db.First(&updatedOrder, order.ID).Error)
	assert.Nil(t, updatedOrder.StoreID, "order.store_id should be NULL after store deletion")
}

// ============================================================
// Test: DeletePromo handler
// ============================================================

func TestDeletePromo_CascadeDeletion(t *testing.T) {
	db := setupTestDB(t)

	promo := models.Promo{Code: "TESTPROMO", Description: "Test", DiscountType: "percentage", DiscountValue: 10, UsageLimit: 100, ApplicableTo: "all", IsActive: true}
	require.NoError(t, db.Create(&promo).Error)
	pid := promo.ID

	// Create ride referencing promo
	ride := models.Ride{UserID: uintPtr(1), PromoID: uintPtr(pid), PickupLocation: "A", DropoffLocation: "B", Status: "completed", VehicleType: "motorcycle"}
	require.NoError(t, db.Create(&ride).Error)

	router := setupRouter()
	router.DELETE("/admin/promos/:id", DeletePromo(db))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/admin/promos/"+itoa(pid), nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify promo deleted
	var promoCount int64
	db.Model(&models.Promo{}).Where("id = ?", pid).Count(&promoCount)
	assert.Equal(t, int64(0), promoCount, "promo should be deleted")

	// Verify ride still exists but promo_id is NULL
	var updatedRide models.Ride
	require.NoError(t, db.First(&updatedRide, ride.ID).Error)
	assert.Nil(t, updatedRide.PromoID, "ride.promo_id should be NULL after promo deletion")
}

// ============================================================
// Test: CreateStore handler
// ============================================================

func TestCreateStore_Success(t *testing.T) {
	db := setupTestDB(t)
	router := setupRouter()
	router.POST("/admin/stores", CreateStore(db))

	body := `{"name":"New Store","category":"restaurant","address":"456 Ave","phone":"+639123456"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/admin/stores", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var count int64
	db.Model(&models.Store{}).Count(&count)
	assert.Equal(t, int64(1), count)
}

func TestCreateStore_MissingName(t *testing.T) {
	db := setupTestDB(t)
	router := setupRouter()
	router.POST("/admin/stores", CreateStore(db))

	body := `{"category":"restaurant","address":"456 Ave"}`
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/admin/stores", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ============================================================
// Test: createCommissionRecord
// ============================================================

func TestCreateCommissionRecord_ActiveConfig(t *testing.T) {
	db := setupTestDB(t)

	// Create active commission config
	require.NoError(t, db.Create(&models.CommissionConfig{Percentage: 15.0, IsActive: true}).Error)

	// Create a driver
	user := seedUser(t, db, "Driver", "d@test.com", "driver")
	driver := seedDriver(t, db, user.ID)
	db.Model(&driver).Update("total_earnings", 1000.0)

	tx := db.Begin()
	createCommissionRecord(tx, "ride", 1, driver.ID, 200.0, "cash")
	tx.Commit()

	var record models.CommissionRecord
	err := db.First(&record).Error
	require.NoError(t, err)
	assert.Equal(t, "ride", record.ServiceType)
	assert.Equal(t, driver.ID, record.DriverID)
	assert.Equal(t, "pending_collection", record.Status)
	assert.Equal(t, 15.0, record.CommissionPercentage)
}

func TestCreateCommissionRecord_InactiveConfig(t *testing.T) {
	db := setupTestDB(t)

	// Create config then deactivate it (GORM treats false as zero-value and uses default:true)
	cfg := models.CommissionConfig{Percentage: 15.0, IsActive: true}
	require.NoError(t, db.Create(&cfg).Error)
	require.NoError(t, db.Model(&cfg).Update("is_active", false).Error)

	tx := db.Begin()
	createCommissionRecord(tx, "ride", 1, 1, 200.0, "cash")
	tx.Commit()

	var count int64
	db.Model(&models.CommissionRecord{}).Count(&count)
	assert.Equal(t, int64(0), count, "no commission should be created when config is inactive")
}

func TestCreateCommissionRecord_NoConfig(t *testing.T) {
	db := setupTestDB(t)

	tx := db.Begin()
	createCommissionRecord(tx, "ride", 1, 1, 200.0, "cash")
	tx.Commit()

	var count int64
	db.Model(&models.CommissionRecord{}).Count(&count)
	assert.Equal(t, int64(0), count, "no commission should be created when no config exists")
}

func TestCreateCommissionRecord_WalletPayment_DeductsFromDriver(t *testing.T) {
	db := setupTestDB(t)

	require.NoError(t, db.Create(&models.CommissionConfig{Percentage: 10.0, IsActive: true}).Error)

	user := seedUser(t, db, "Driver", "dw@test.com", "driver")
	driver := seedDriver(t, db, user.ID)
	db.Model(&driver).Update("total_earnings", 500.0)

	tx := db.Begin()
	createCommissionRecord(tx, "ride", 1, driver.ID, 100.0, "wallet")
	tx.Commit()

	var record models.CommissionRecord
	require.NoError(t, db.First(&record).Error)
	assert.Equal(t, "deducted", record.Status)

	// Verify driver earnings were deducted
	var updatedDriver models.Driver
	require.NoError(t, db.First(&updatedDriver, driver.ID).Error)
	assert.Less(t, updatedDriver.TotalEarnings, 500.0, "driver earnings should be deducted")
}

func TestCreateCommissionRecord_LocksDriverRow(t *testing.T) {
	db := setupTestDB(t)
	db.Create(&models.CommissionConfig{Percentage: 10.0, IsActive: true})
	user := seedUser(t, db, "Driver User", "driver@test.com", "driver")
	driver := seedDriver(t, db, user.ID)
	db.Model(&driver).Update("total_earnings", 1000.0)

	tx := db.Begin()
	createCommissionRecord(tx, "ride", 1, driver.ID, 200.0, "wallet")
	tx.Commit()

	var updated models.Driver
	db.First(&updated, driver.ID)
	assert.InDelta(t, 980.0, updated.TotalEarnings, 0.01, "earnings should be reduced by commission amount")
}

func TestValidCoordinates(t *testing.T) {
	tests := []struct {
		name     string
		lat, lng float64
		valid    bool
	}{
		{"valid Balingasag", 8.4343, 124.7762, true},
		{"zero coords", 0, 0, true},
		{"lat too high", 91, 0, false},
		{"lat too low", -91, 0, false},
		{"lng too high", 0, 181, false},
		{"lng too low", 0, -181, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.valid, validCoordinates(tt.lat, tt.lng))
		})
	}
}

// ============================================================
// Test: RateDelivery handler updates driver rating
// ============================================================

func TestRateDelivery_UpdatesDriverRating(t *testing.T) {
	db := setupTestDB(t)

	user := seedUser(t, db, "Customer", "cust@test.com", "user")
	driverUser := seedUser(t, db, "DriverUser", "drvuser@test.com", "driver")
	driver := seedDriver(t, db, driverUser.ID)

	driverID := driver.ID
	userID := user.ID
	delivery := models.Delivery{
		UserID:          &userID,
		DriverID:        &driverID,
		Status:          "completed",
		PickupLocation:  "A",
		DropoffLocation: "B",
	}
	require.NoError(t, db.Create(&delivery).Error)

	router := setupRouter()
	router.PUT("/deliveries/:id/rate", func(c *gin.Context) {
		c.Set("userID", user.ID)
		RateDelivery(db)(c)
	})

	body := `{"rating": 4.5}`
	req, _ := http.NewRequest("PUT", fmt.Sprintf("/deliveries/%d/rate", delivery.ID), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var updated models.Driver
	db.First(&updated, driver.ID)
	assert.InDelta(t, 4.5, updated.Rating, 0.01)
	assert.Equal(t, 1, updated.TotalRatings)
}
