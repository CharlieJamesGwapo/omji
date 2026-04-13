// Package authz provides ownership-check helpers and a cached fresh-admin check
// for use in HTTP handlers and middleware.
package authz

import (
	"errors"
	"sync"
	"time"

	"oneride/pkg/models"

	"gorm.io/gorm"
)

// Sentinel errors returned by all helpers.
var (
	// ErrNotFound is returned when the resource does not exist or does not belong
	// to the requesting user. Combining the two cases prevents enumeration.
	ErrNotFound = errors.New("resource not found")

	// ErrForbidden is returned when the user exists but lacks the required role.
	ErrForbidden = errors.New("forbidden")
)

// ---------------------------------------------------------------------------
// Ride ownership
// ---------------------------------------------------------------------------

// MustOwnRide returns nil iff a Ride with the given rideID exists AND its
// UserID equals userID. Both "not found" and "wrong owner" return ErrNotFound
// to prevent resource enumeration.
func MustOwnRide(db *gorm.DB, userID, rideID uint) error {
	var ride models.Ride
	if err := db.First(&ride, rideID).Error; err != nil {
		return ErrNotFound
	}
	if ride.UserID == nil || *ride.UserID != userID {
		return ErrNotFound
	}
	return nil
}

// MustOwnOrDriveRide returns nil iff the user is the rider (Ride.UserID) OR
// the driver. For the driver case we handle both:
//  1. Direct: Ride.DriverID == userID  (would only be true if DriverID stored
//     the user-level ID – kept for defensive coding).
//  2. Indirect: Driver whose UserID == userID has ID == Ride.DriverID.
func MustOwnOrDriveRide(db *gorm.DB, userID, rideID uint) error {
	var ride models.Ride
	if err := db.First(&ride, rideID).Error; err != nil {
		return ErrNotFound
	}

	// Rider check.
	if ride.UserID != nil && *ride.UserID == userID {
		return nil
	}

	// Driver check – look up the Driver row whose UserID matches.
	if ride.DriverID != nil {
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err == nil {
			if driver.ID == *ride.DriverID {
				return nil
			}
		}
	}

	return ErrNotFound
}

// ---------------------------------------------------------------------------
// Delivery ownership
// ---------------------------------------------------------------------------

// MustOwnDelivery returns nil iff the Delivery exists and belongs to userID.
func MustOwnDelivery(db *gorm.DB, userID, deliveryID uint) error {
	var delivery models.Delivery
	if err := db.First(&delivery, deliveryID).Error; err != nil {
		return ErrNotFound
	}
	if delivery.UserID == nil || *delivery.UserID != userID {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Order ownership
// ---------------------------------------------------------------------------

// MustOwnOrder returns nil iff the Order exists and belongs to userID.
func MustOwnOrder(db *gorm.DB, userID, orderID uint) error {
	var order models.Order
	if err := db.First(&order, orderID).Error; err != nil {
		return ErrNotFound
	}
	if order.UserID == nil || *order.UserID != userID {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// PaymentProof ownership
// ---------------------------------------------------------------------------

// MustOwnPaymentProof returns nil iff the PaymentProof exists and its UserID
// (non-pointer uint) equals userID.
func MustOwnPaymentProof(db *gorm.DB, userID, proofID uint) error {
	var proof models.PaymentProof
	if err := db.First(&proof, proofID).Error; err != nil {
		return ErrNotFound
	}
	if proof.UserID != userID {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Fresh admin check with 60-second cache
// ---------------------------------------------------------------------------

type adminCacheEntry struct {
	isAdmin   bool
	expiresAt time.Time
}

var (
	adminCacheMu sync.Mutex
	adminCache   = make(map[uint]adminCacheEntry)
)

const adminCacheTTL = 60 * time.Second

// FlushAdminCacheForTesting clears the in-memory admin-role cache.
// It must only be called from test code.
func FlushAdminCacheForTesting() {
	adminCacheMu.Lock()
	adminCache = make(map[uint]adminCacheEntry)
	adminCacheMu.Unlock()
}

// RequireAdminFresh re-checks the database to confirm userID has role "admin".
// Results are cached for 60 seconds per userID to reduce DB load while still
// detecting role revocations quickly. Returns ErrForbidden if the user is not
// found or is not an admin.
func RequireAdminFresh(db *gorm.DB, userID uint) error {
	// Check cache first.
	adminCacheMu.Lock()
	entry, ok := adminCache[userID]
	adminCacheMu.Unlock()

	if ok && time.Now().Before(entry.expiresAt) {
		if entry.isAdmin {
			return nil
		}
		return ErrForbidden
	}

	// Cache miss or expired – hit the database.
	var user models.User
	if err := db.Select("id, role").First(&user, userID).Error; err != nil {
		return ErrForbidden
	}

	isAdmin := user.Role == "admin"

	adminCacheMu.Lock()
	adminCache[userID] = adminCacheEntry{
		isAdmin:   isAdmin,
		expiresAt: time.Now().Add(adminCacheTTL),
	}
	adminCacheMu.Unlock()

	if isAdmin {
		return nil
	}
	return ErrForbidden
}
