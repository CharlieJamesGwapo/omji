package handlers

import (
	"crypto/rand"
	"fmt"
	"log"
	"math"
	"math/big"
	"time"

	"omji/pkg/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func GenerateOTP() (string, error) {
	max := big.NewInt(900000)
	num, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", fmt.Errorf("failed to generate secure OTP: %w", err)
	}
	return fmt.Sprintf("%06d", num.Int64()+100000), nil
}

func CalculateFare(distance float64, vehicleType string) float64 {
	baseFare := 40.0
	ratePerKm := 10.0
	if vehicleType == "car" {
		baseFare = 60.0
		ratePerKm = 15.0
	}
	fare := baseFare + (distance * ratePerKm)
	return math.Round(fare*100) / 100
}

func CalculateFareFromDB(db *gorm.DB, distance float64, vehicleType string) float64 {
	var rate models.RateConfig
	if err := db.Where("service_type = ? AND vehicle_type = ? AND is_active = ?", "ride", vehicleType, true).First(&rate).Error; err == nil {
		fare := rate.BaseFare + (distance * rate.RatePerKm)
		if fare < rate.MinimumFare && rate.MinimumFare > 0 {
			fare = rate.MinimumFare
		}
		return math.Round(fare*100) / 100
	}
	return CalculateFare(distance, vehicleType)
}

func CalculateDeliveryFeeFromDB(db *gorm.DB, distance float64) float64 {
	var rate models.RateConfig
	if err := db.Where("service_type = ? AND is_active = ?", "delivery", true).First(&rate).Error; err == nil {
		fee := rate.BaseFare + (distance * rate.RatePerKm)
		if fee < rate.MinimumFare && rate.MinimumFare > 0 {
			fee = rate.MinimumFare
		}
		return math.Round(fee*100) / 100
	}
	return math.Round((50.0+(distance*15.0))*100) / 100
}

func GetOrderDeliveryFeeFromDB(db *gorm.DB) float64 {
	var rate models.RateConfig
	if err := db.Where("service_type = ? AND is_active = ?", "order", true).First(&rate).Error; err == nil {
		return rate.BaseFare
	}
	return 30.0
}

// TODO: Replace with a real email provider (e.g., SendGrid, AWS SES, Mailgun)
func SendOTPEmail(email, otp string) error {
	// OTP is not logged to stdout for security
	log.Printf("OTP email requested for %s", email)
	return nil
}

// TODO: Replace with a real SMS provider (e.g., Twilio, Vonage, Semaphore)
func SendOTPSMS(phone, otp string) error {
	// OTP is not logged to stdout for security
	log.Printf("OTP SMS requested for %s", phone)
	return nil
}

func UpdateOTP(db *gorm.DB, email string) (string, error) {
	otp, err := GenerateOTP()
	if err != nil {
		return "", err
	}
	expiry := time.Now().Add(5 * time.Minute)
	if err := db.Model(&models.User{}).Where("email = ?", email).Updates(map[string]interface{}{
		"otp_code":   otp,
		"otp_expiry": expiry,
	}).Error; err != nil {
		return "", err
	}
	return otp, nil
}

// updateDriverRating recalculates a driver's rating within a transaction (with row locking)
func updateDriverRating(tx *gorm.DB, driverID uint, newRating float64) error {
	var driver models.Driver
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&driver, driverID).Error; err != nil {
		return nil // driver not found, skip silently
	}
	newTotal := driver.TotalRatings + 1
	avgRating := ((driver.Rating * float64(driver.TotalRatings)) + newRating) / float64(newTotal)
	return tx.Model(&driver).Updates(map[string]interface{}{"rating": avgRating, "total_ratings": newTotal}).Error
}

// updateUserRating recalculates and saves a user's average rating (for passenger ratings)
func updateUserRating(tx *gorm.DB, userID uint, newRating float64) error {
	var user models.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
		return nil // user not found, skip silently
	}
	newTotal := user.TotalRatings + 1
	avgRating := ((user.Rating * float64(user.TotalRatings)) + newRating) / float64(newTotal)
	return tx.Model(&user).Updates(map[string]interface{}{"rating": avgRating, "total_ratings": newTotal}).Error
}

// freeDriver sets a driver as available
func freeDriver(db *gorm.DB, driverID *uint) {
	if driverID == nil {
		return
	}
	if err := db.Model(&models.Driver{}).Where("id = ?", *driverID).Update("is_available", true).Error; err != nil {
		log.Printf("Failed to free driver %d: %v", *driverID, err)
	}
}

// notifyUser creates a notification, logging but not failing on error
func notifyUser(db *gorm.DB, userID uint, title, body, notifType string) {
	if err := db.Create(&models.Notification{UserID: userID, Title: title, Body: body, Type: notifType}).Error; err != nil {
		log.Printf("Failed to create notification for user %d: %v", userID, err)
	}
}

// notifyDriver looks up a driver by ID and notifies their user account
func notifyDriver(db *gorm.DB, driverID *uint, title, body, notifType string) {
	if driverID == nil {
		return
	}
	var driver models.Driver
	if err := db.Where("id = ?", *driverID).First(&driver).Error; err == nil {
		notifyUser(db, driver.UserID, title, body, notifType)
	}
}

func GetDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	lat1Rad := lat1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return math.Round(R*c*100) / 100
}

// GetRoadDistance returns the client-provided road distance if it's plausible
// (between 1x and 2.5x the straight-line Haversine distance), otherwise
// falls back to Haversine × 1.4 road factor.
func GetRoadDistance(clientDistance, lat1, lon1, lat2, lon2 float64) float64 {
	haversine := GetDistance(lat1, lon1, lat2, lon2)
	if haversine < 0.1 {
		haversine = 0.1
	}
	// Client sent a road distance — validate it's reasonable
	if clientDistance > 0 {
		ratio := clientDistance / haversine
		if ratio >= 0.9 && ratio <= 3.0 {
			return math.Round(clientDistance*10) / 10
		}
	}
	// Fallback: Haversine × 1.4 road factor
	return math.Round(haversine*1.4*10) / 10
}

// validCoordinates returns true if lat/lng are within valid ranges.
func validCoordinates(lat, lng float64) bool {
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}
