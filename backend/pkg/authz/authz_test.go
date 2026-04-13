package authz_test

import (
	"testing"

	"oneride/pkg/authz"
	"oneride/pkg/models"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// openDB returns a fresh in-memory SQLite database with the relevant tables
// auto-migrated.
func openDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	err = db.AutoMigrate(
		&models.User{},
		&models.Driver{},
		&models.Ride{},
		&models.Delivery{},
		&models.Order{},
		&models.PaymentProof{},
		// Store is needed because Order has a StoreID FK.
		&models.Store{},
	)
	require.NoError(t, err)
	return db
}

// ptr returns a pointer to the given uint value.
func ptr(v uint) *uint { return &v }

// ---------------------------------------------------------------------------
// Ride tests
// ---------------------------------------------------------------------------

func TestMustOwnRide_Owner(t *testing.T) {
	db := openDB(t)

	user := models.User{Name: "Alice", Email: "alice@test.com", Phone: "111", Password: "x", ReferralCode: "A1"}
	require.NoError(t, db.Create(&user).Error)

	ride := models.Ride{UserID: ptr(user.ID)}
	require.NoError(t, db.Create(&ride).Error)

	err := authz.MustOwnRide(db, user.ID, ride.ID)
	assert.NoError(t, err)
}

func TestMustOwnRide_NotOwner(t *testing.T) {
	db := openDB(t)

	owner := models.User{Name: "Bob", Email: "bob@test.com", Phone: "222", Password: "x", ReferralCode: "B2"}
	require.NoError(t, db.Create(&owner).Error)

	other := models.User{Name: "Carol", Email: "carol@test.com", Phone: "333", Password: "x", ReferralCode: "C3"}
	require.NoError(t, db.Create(&other).Error)

	ride := models.Ride{UserID: ptr(owner.ID)}
	require.NoError(t, db.Create(&ride).Error)

	err := authz.MustOwnRide(db, other.ID, ride.ID)
	assert.ErrorIs(t, err, authz.ErrNotFound)
}

func TestMustOwnRide_NotFound(t *testing.T) {
	db := openDB(t)

	err := authz.MustOwnRide(db, 1, 9999)
	assert.ErrorIs(t, err, authz.ErrNotFound)
}

// ---------------------------------------------------------------------------
// MustOwnOrDriveRide – driver path
// ---------------------------------------------------------------------------

func TestMustOwnOrDriveRide_Driver(t *testing.T) {
	db := openDB(t)

	// Create the driver user.
	driverUser := models.User{Name: "Dave", Email: "dave@test.com", Phone: "444", Password: "x", ReferralCode: "D4"}
	require.NoError(t, db.Create(&driverUser).Error)

	// Create the Driver record.
	driver := models.Driver{
		UserID:        driverUser.ID,
		VehicleType:   "motorcycle",
		VehicleModel:  "Honda",
		VehiclePlate:  "ABC123",
		LicenseNumber: "LIC001",
	}
	require.NoError(t, db.Create(&driver).Error)

	// Create a ride assigned to this driver.
	ride := models.Ride{DriverID: ptr(driver.ID)}
	require.NoError(t, db.Create(&ride).Error)

	err := authz.MustOwnOrDriveRide(db, driverUser.ID, ride.ID)
	assert.NoError(t, err)
}

func TestMustOwnOrDriveRide_Rider(t *testing.T) {
	db := openDB(t)

	riderUser := models.User{Name: "Eve", Email: "eve@test.com", Phone: "555", Password: "x", ReferralCode: "E5"}
	require.NoError(t, db.Create(&riderUser).Error)

	ride := models.Ride{UserID: ptr(riderUser.ID)}
	require.NoError(t, db.Create(&ride).Error)

	err := authz.MustOwnOrDriveRide(db, riderUser.ID, ride.ID)
	assert.NoError(t, err)
}

func TestMustOwnOrDriveRide_Unrelated(t *testing.T) {
	db := openDB(t)

	owner := models.User{Name: "Frank", Email: "frank@test.com", Phone: "666", Password: "x", ReferralCode: "F6"}
	require.NoError(t, db.Create(&owner).Error)

	stranger := models.User{Name: "Grace", Email: "grace@test.com", Phone: "777", Password: "x", ReferralCode: "G7"}
	require.NoError(t, db.Create(&stranger).Error)

	ride := models.Ride{UserID: ptr(owner.ID)}
	require.NoError(t, db.Create(&ride).Error)

	err := authz.MustOwnOrDriveRide(db, stranger.ID, ride.ID)
	assert.ErrorIs(t, err, authz.ErrNotFound)
}

// ---------------------------------------------------------------------------
// Admin cache tests
// ---------------------------------------------------------------------------

func TestRequireAdminFresh_Admin(t *testing.T) {
	authz.FlushAdminCacheForTesting()
	db := openDB(t)

	admin := models.User{Name: "Admin", Email: "admin@test.com", Phone: "888", Password: "x", Role: "admin", ReferralCode: "ADM1"}
	require.NoError(t, db.Create(&admin).Error)

	err := authz.RequireAdminFresh(db, admin.ID)
	assert.NoError(t, err)
}

func TestRequireAdminFresh_NonAdmin(t *testing.T) {
	authz.FlushAdminCacheForTesting()
	db := openDB(t)

	regular := models.User{Name: "Normal", Email: "normal@test.com", Phone: "999", Password: "x", Role: "user", ReferralCode: "USR1"}
	require.NoError(t, db.Create(&regular).Error)

	err := authz.RequireAdminFresh(db, regular.ID)
	assert.ErrorIs(t, err, authz.ErrForbidden)
}

func TestRequireAdminFresh_UserNotFound(t *testing.T) {
	authz.FlushAdminCacheForTesting()
	db := openDB(t)

	err := authz.RequireAdminFresh(db, 99999)
	assert.ErrorIs(t, err, authz.ErrForbidden)
}

// ---------------------------------------------------------------------------
// MustOwnDelivery
// ---------------------------------------------------------------------------

func TestMustOwnDelivery_Owner(t *testing.T) {
	db := openDB(t)

	user := models.User{Name: "Hannah", Email: "h@test.com", Phone: "101", Password: "x", ReferralCode: "H1"}
	require.NoError(t, db.Create(&user).Error)

	delivery := models.Delivery{UserID: ptr(user.ID)}
	require.NoError(t, db.Create(&delivery).Error)

	assert.NoError(t, authz.MustOwnDelivery(db, user.ID, delivery.ID))
}

func TestMustOwnDelivery_NotOwner(t *testing.T) {
	db := openDB(t)

	owner := models.User{Name: "Ivan", Email: "i@test.com", Phone: "102", Password: "x", ReferralCode: "I2"}
	require.NoError(t, db.Create(&owner).Error)

	delivery := models.Delivery{UserID: ptr(owner.ID)}
	require.NoError(t, db.Create(&delivery).Error)

	assert.ErrorIs(t, authz.MustOwnDelivery(db, owner.ID+999, delivery.ID), authz.ErrNotFound)
}

// ---------------------------------------------------------------------------
// MustOwnOrder
// ---------------------------------------------------------------------------

func TestMustOwnOrder_Owner(t *testing.T) {
	db := openDB(t)

	user := models.User{Name: "Jack", Email: "j@test.com", Phone: "103", Password: "x", ReferralCode: "J3"}
	require.NoError(t, db.Create(&user).Error)

	order := models.Order{UserID: ptr(user.ID)}
	require.NoError(t, db.Create(&order).Error)

	assert.NoError(t, authz.MustOwnOrder(db, user.ID, order.ID))
}

func TestMustOwnOrder_NotOwner(t *testing.T) {
	db := openDB(t)

	owner := models.User{Name: "Karen", Email: "k@test.com", Phone: "104", Password: "x", ReferralCode: "K4"}
	require.NoError(t, db.Create(&owner).Error)

	order := models.Order{UserID: ptr(owner.ID)}
	require.NoError(t, db.Create(&order).Error)

	assert.ErrorIs(t, authz.MustOwnOrder(db, owner.ID+999, order.ID), authz.ErrNotFound)
}

// ---------------------------------------------------------------------------
// MustOwnPaymentProof
// ---------------------------------------------------------------------------

func TestMustOwnPaymentProof_Owner(t *testing.T) {
	db := openDB(t)

	user := models.User{Name: "Leo", Email: "l@test.com", Phone: "105", Password: "x", ReferralCode: "L5"}
	require.NoError(t, db.Create(&user).Error)

	proof := models.PaymentProof{
		UserID:          user.ID,
		ServiceType:     "ride",
		ServiceID:       1,
		PaymentMethod:   "gcash",
		ReferenceNumber: "REF001",
		Amount:          100,
		ProofImageURL:   "data:image/png;base64,abc",
	}
	require.NoError(t, db.Create(&proof).Error)

	assert.NoError(t, authz.MustOwnPaymentProof(db, user.ID, proof.ID))
}

func TestMustOwnPaymentProof_NotOwner(t *testing.T) {
	db := openDB(t)

	owner := models.User{Name: "Mia", Email: "m@test.com", Phone: "106", Password: "x", ReferralCode: "M6"}
	require.NoError(t, db.Create(&owner).Error)

	proof := models.PaymentProof{
		UserID:          owner.ID,
		ServiceType:     "ride",
		ServiceID:       1,
		PaymentMethod:   "gcash",
		ReferenceNumber: "REF002",
		Amount:          50,
		ProofImageURL:   "data:image/png;base64,xyz",
	}
	require.NoError(t, db.Create(&proof).Error)

	assert.ErrorIs(t, authz.MustOwnPaymentProof(db, owner.ID+999, proof.ID), authz.ErrNotFound)
}
