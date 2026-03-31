package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"omji/pkg/models"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// uintPtr converts a uint value to a *uint pointer (needed for nullable FK fields).
func uintPtr(v uint) *uint { return &v }

// safeNotify creates a notification for a user, safely handling nil userID pointers.
// This prevents panics when the referenced user has been deleted (UserID set to NULL).
func safeNotify(db *gorm.DB, userID *uint, title, body, notifType string) {
	if userID == nil {
		return
	}
	if err := db.Create(&models.Notification{UserID: *userID, Title: title, Body: body, Type: notifType}).Error; err != nil {
		log.Printf("Failed to create notification (user=%d, type=%s): %v", *userID, notifType, err)
	}
}

// createCommissionRecord calculates and records commission for a completed service.
// For wallet payments, it deducts commission from driver earnings.
// For cash payments, it records as pending_collection.
// Must be called within an existing transaction (tx).
func createCommissionRecord(tx *gorm.DB, serviceType string, serviceID uint, driverID uint, totalFare float64, paymentMethod string) {
	var config models.CommissionConfig
	if err := tx.First(&config).Error; err != nil || !config.IsActive {
		return // No config or inactive — skip commission
	}
	if config.Percentage <= 0 {
		return
	}

	commissionAmount := math.Round(totalFare*config.Percentage) / 100 // totalFare * percentage / 100, rounded to 2 decimals

	status := "pending_collection"
	if paymentMethod == "wallet" {
		status = "deducted"
		// Deduct commission from driver's total_earnings
		if err := tx.Model(&models.Driver{}).Where("id = ?", driverID).
			Update("total_earnings", gorm.Expr("total_earnings - ?", commissionAmount)).Error; err != nil {
			log.Printf("Failed to deduct commission from driver %d earnings: %v", driverID, err)
		}
	}

	record := models.CommissionRecord{
		ServiceType:          serviceType,
		ServiceID:            serviceID,
		DriverID:             driverID,
		TotalFare:            totalFare,
		CommissionPercentage: config.Percentage,
		CommissionAmount:     commissionAmount,
		PaymentMethod:        paymentMethod,
		Status:               status,
	}
	if err := tx.Create(&record).Error; err != nil {
		log.Printf("Failed to create commission record for %s %d: %v", serviceType, serviceID, err)
	}
}

// getUploadDir returns the upload directory from UPLOAD_DIR env var, defaulting to "./uploads"
func getUploadDir() string {
	dir := os.Getenv("UPLOAD_DIR")
	if dir == "" {
		return "./uploads"
	}
	return dir
}

// ===== AUTH HANDLERS =====

type RegisterInput struct {
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email" binding:"required"`
	Phone    string `json:"phone" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
}

func Register(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input RegisterInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		// Validate phone format (digits only, 10-15 chars, optional leading +)
		phoneRegex := regexp.MustCompile(`^\+?\d{10,15}$`)
		if !phoneRegex.MatchString(input.Phone) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid phone number format. Must be 10-15 digits, optionally starting with +"})
			return
		}
		var existing models.User
		if err := db.Where("email = ?", input.Email).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "Email already registered"})
			return
		}
		if err := db.Where("phone = ?", input.Phone).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "Phone already registered"})
			return
		}
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to process password"})
			return
		}
		otp, otpErr := GenerateOTP()
		if otpErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate OTP"})
			return
		}
		// Generate unique referral code (retry on collision)
		var referralCode string
		for i := 0; i < 5; i++ {
			referralCode = generateReferralCode(input.Name)
			var count int64
			db.Model(&models.User{}).Where("referral_code = ?", referralCode).Count(&count)
			if count == 0 {
				break
			}
		}
		user := models.User{
			Name: input.Name, Email: input.Email, Phone: input.Phone,
			Password: string(hashedPassword), OTPCode: otp,
			OTPExpiry: time.Now().Add(5 * time.Minute), Role: "user",
			IsVerified:   true, // Regular users are auto-verified, only riders need approval
			ReferralCode: referralCode,
		}
		if err := db.Create(&user).Error; err != nil {
			log.Printf("Failed to create user: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create account. Please try again."})
			return
		}
		SendOTPSMS(input.Phone, otp)
		token, err := GenerateToken(user.ID, user.Email, user.Role)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate authentication token"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{
			"success": true,
			"data": gin.H{
				"token": token,
				"user":  gin.H{"id": user.ID, "name": user.Name, "email": user.Email, "phone": user.Phone, "role": user.Role},
			},
			"timestamp": time.Now(),
		})
	}
}

type LoginInput struct {
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Password string `json:"password" binding:"required"`
}

func Login(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input LoginInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if input.Email == "" && input.Phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Email or phone required"})
			return
		}
		var user models.User
		q := db
		if input.Email != "" {
			q = q.Where("email = ?", input.Email)
		} else {
			q = q.Where("phone = ?", input.Phone)
		}
		if err := q.First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "No account found with that phone number or email"})
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "error": "Incorrect password. Please try again."})
			return
		}
		token, err := GenerateToken(user.ID, user.Email, user.Role)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate authentication token"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"token": token,
				"user": gin.H{
					"id": user.ID, "name": user.Name, "email": user.Email,
					"phone": user.Phone, "role": user.Role, "is_verified": user.IsVerified,
					"rating": user.Rating, "profile_image": user.ProfileImage,
				},
			},
			"timestamp": time.Now(),
		})
	}
}

func VerifyOTP(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Phone string `json:"phone" binding:"required"`
			OTP   string `json:"otp" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		var user models.User
		if err := db.Where("phone = ?", input.Phone).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
			return
		}
		if user.OTPCode != input.OTP {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid OTP"})
			return
		}
		if time.Now().After(user.OTPExpiry) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "OTP expired"})
			return
		}
		if err := db.Model(&user).Updates(map[string]interface{}{"is_verified": true, "otp_code": ""}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to verify account"})
			return
		}
		token, err := GenerateToken(user.ID, user.Email, user.Role)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate authentication token"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      gin.H{"token": token, "user": gin.H{"id": user.ID, "name": user.Name, "email": user.Email, "phone": user.Phone, "role": user.Role, "is_verified": true}},
			"timestamp": time.Now(),
		})
	}
}

func ResendOTP(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Phone string `json:"phone" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		var user models.User
		if err := db.Where("phone = ?", input.Phone).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
			return
		}
		otp, otpErr := GenerateOTP()
		if otpErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate OTP"})
			return
		}
		if err := db.Model(&user).Updates(map[string]interface{}{
			"otp_code":   otp,
			"otp_expiry": time.Now().Add(5 * time.Minute),
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update OTP"})
			return
		}
		SendOTPSMS(input.Phone, otp)
		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      gin.H{"message": "OTP sent successfully"},
			"timestamp": time.Now(),
		})
	}
}

// ===== USER HANDLERS =====

func GetUserProfile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      gin.H{"id": user.ID, "name": user.Name, "email": user.Email, "phone": user.Phone, "profile_image": user.ProfileImage, "role": user.Role, "is_verified": user.IsVerified, "rating": user.Rating, "total_ratings": user.TotalRatings, "created_at": user.CreatedAt},
			"timestamp": time.Now(),
		})
	}
}

func UpdateUserProfile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Name         string `json:"name"`
			Phone        string `json:"phone"`
			ProfileImage string `json:"profile_image"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		updates := map[string]interface{}{}
		if input.Name != "" {
			updates["name"] = input.Name
		}
		if input.Phone != "" {
			updates["phone"] = input.Phone
		}
		if input.ProfileImage != "" {
			updates["profile_image"] = input.ProfileImage
		}
		if err := db.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update profile"})
			return
		}
		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch updated profile"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"id": user.ID, "name": user.Name, "email": user.Email, "phone": user.Phone, "profile_image": user.ProfileImage, "role": user.Role}, "timestamp": time.Now()})
	}
}

func GetSavedAddresses(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var addresses []models.SavedAddress
		if err := db.Where("user_id = ?", userID).Find(&addresses).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch addresses"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": addresses, "timestamp": time.Now()})
	}
}

func AddSavedAddress(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Label     string  `json:"label" binding:"required"`
			Address   string  `json:"address" binding:"required"`
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		addr := models.SavedAddress{UserID: userID, Label: input.Label, Address: input.Address, Latitude: input.Latitude, Longitude: input.Longitude}
		if err := db.Create(&addr).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save address"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": addr, "timestamp": time.Now()})
	}
}

func DeleteSavedAddress(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		result := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).Delete(&models.SavedAddress{})
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete address"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Address not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Address deleted"}, "timestamp": time.Now()})
	}
}

// ===== RIDE HANDLERS =====

func CreateRide(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			PickupLocation   string  `json:"pickup_location" binding:"required"`
			PickupLatitude   float64 `json:"pickup_latitude"`
			PickupLongitude  float64 `json:"pickup_longitude"`
			DropoffLocation  string  `json:"dropoff_location" binding:"required"`
			DropoffLatitude  float64 `json:"dropoff_latitude"`
			DropoffLongitude float64 `json:"dropoff_longitude"`
			VehicleType      string  `json:"vehicle_type" binding:"required"`
			PromoCode        string  `json:"promo_code"`
			PaymentMethod    string  `json:"payment_method"`
			EstimatedFare    float64 `json:"estimated_fare"`
			Distance         float64 `json:"distance"`
			DriverID         *uint   `json:"driver_id"`
			ScheduledAt      string  `json:"scheduled_at"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if input.PaymentMethod == "" {
			input.PaymentMethod = "cash"
		}
		distance := GetRoadDistance(input.Distance, input.PickupLatitude, input.PickupLongitude, input.DropoffLatitude, input.DropoffLongitude)
		if distance < 0.1 {
			distance = 1.0
		}
		fare := CalculateFareFromDB(db, distance, input.VehicleType)
		// Use client-provided fare if it's higher (e.g. Pasabay with extra passengers)
		if input.EstimatedFare > fare {
			fare = input.EstimatedFare
		}
		var promoID *uint
		if input.PromoCode != "" {
			var promo models.Promo
			if err := db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ? AND is_active = ? AND applicable_to IN ?", input.PromoCode, true, []string{"rides", "all"}).First(&promo).Error; err == nil {
				promoNow := time.Now()
				promoValid := fare >= promo.MinimumAmount && (promo.UsageLimit == 0 || promo.UsageCount < promo.UsageLimit) && (promo.StartDate.IsZero() || !promoNow.Before(promo.StartDate)) && (promo.EndDate.IsZero() || !promoNow.After(promo.EndDate))
				if promoValid {
					discount := 0.0
					if promo.DiscountType == "percentage" {
						discount = fare * promo.DiscountValue / 100
						if discount > promo.MaxDiscount && promo.MaxDiscount > 0 {
							discount = promo.MaxDiscount
						}
					} else {
						discount = promo.DiscountValue
					}
					fare -= discount
					if fare < 0 {
						fare = 0
					}
					promoID = &promo.ID
					if err := db.Model(&promo).Update("usage_count", gorm.Expr("usage_count + 1")).Error; err != nil {
						log.Printf("Failed to update promo usage count: %v", err)
					}
				}
			}
		}
		rideStatus := "pending"
		var scheduledAt *time.Time
		if input.ScheduledAt != "" {
			parsed, parseErr := time.Parse(time.RFC3339, input.ScheduledAt)
			if parseErr != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid scheduled_at format. Use ISO 8601 (RFC3339)."})
				return
			}
			if parsed.Before(time.Now().Add(15 * time.Minute)) {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Scheduled time must be at least 15 minutes in the future."})
				return
			}
			scheduledAt = &parsed
			rideStatus = "scheduled"
		}
		if input.DriverID != nil && rideStatus != "scheduled" {
			var targetDriver models.Driver
			if err := db.Where("id = ? AND is_verified = ? AND is_available = ?", *input.DriverID, true, true).First(&targetDriver).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Selected rider is no longer available"})
				return
			}
			rideStatus = "requested"
		}
		ride := models.Ride{
			UserID: uintPtr(userID), PickupLocation: input.PickupLocation, PickupLatitude: input.PickupLatitude, PickupLongitude: input.PickupLongitude,
			DropoffLocation: input.DropoffLocation, DropoffLatitude: input.DropoffLatitude, DropoffLongitude: input.DropoffLongitude,
			Distance: distance, EstimatedFare: fare, VehicleType: input.VehicleType, Status: rideStatus, PromoID: promoID, PaymentMethod: input.PaymentMethod,
			DriverID: input.DriverID, ScheduledAt: scheduledAt,
		}
		if err := db.Create(&ride).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create ride"})
			return
		}
		// Send targeted WebSocket notification and start expiry timer for driver-specific requests
		if input.DriverID != nil {
			var passenger models.User
			if err := db.First(&passenger, userID).Error; err != nil {
				log.Printf("Failed to fetch passenger %d for ride notification: %v", userID, err)
			}

			driverIDStr := fmt.Sprintf("%d", *input.DriverID)
			wsMsg := map[string]interface{}{
				"type":             "ride_request",
				"ride_id":          ride.ID,
				"pickup_location":  ride.PickupLocation,
				"dropoff_location": ride.DropoffLocation,
				"distance":         ride.Distance,
				"estimated_fare":   ride.EstimatedFare,
				"vehicle_type":     ride.VehicleType,
				"payment_method":   ride.PaymentMethod,
				"passenger_name":   passenger.Name,
				"passenger_phone":  passenger.Phone,
				"expires_at":       time.Now().Add(30 * time.Second).Unix(),
			}
			if err := driverTracker.Send(driverIDStr, wsMsg); err != nil {
				log.Printf("Failed to send ride request to driver %s via WS: %v", driverIDStr, err)
			}

			go func(rideID uint, driverID uint) {
				time.Sleep(30 * time.Second)
				// Use transaction with row lock to prevent race with AcceptRequest
				expired := false
				if err := db.Transaction(func(tx *gorm.DB) error {
					var r models.Ride
					if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND status = ?", rideID, "requested").First(&r).Error; err != nil {
						return err
					}
					r.Status = "cancelled"
					r.DriverID = nil
					if err := tx.Save(&r).Error; err != nil {
						return err
					}
					expired = true
					return tx.Model(&models.Driver{}).Where("id = ?", driverID).Update("is_available", true).Error
				}); err != nil {
					return
				}
				if expired {
					tracker.Broadcast(fmt.Sprintf("%d", rideID), map[string]interface{}{
						"type":    "ride_expired",
						"ride_id": rideID,
					})
					driverTracker.Send(fmt.Sprintf("%d", driverID), map[string]interface{}{
						"type":    "ride_expired",
						"ride_id": rideID,
					})
					log.Printf("Ride #%d expired (30s timeout)", rideID)
				}
			}(ride.ID, *input.DriverID)
		}
		// Notify user of successful ride booking
		notifBody := "Your ride request has been submitted. A rider will accept soon."
		if input.DriverID != nil {
			notifBody = "Your ride request has been sent to the selected rider. Waiting for response..."
		}
		if err := db.Create(&models.Notification{UserID: userID, Title: "Ride Booked", Body: notifBody, Type: "ride_request"}).Error; err != nil {
			log.Printf("Failed to create ride booking notification: %v", err)
		}
		c.JSON(http.StatusCreated, gin.H{
			"success":   true,
			"data":      gin.H{"id": ride.ID, "status": ride.Status, "pickup_location": ride.PickupLocation, "dropoff_location": ride.DropoffLocation, "distance": ride.Distance, "estimated_fare": ride.EstimatedFare, "vehicle_type": ride.VehicleType, "payment_method": ride.PaymentMethod, "driver_id": ride.DriverID, "created_at": ride.CreatedAt},
			"timestamp": time.Now(),
		})
	}
}

// GetNearbyDrivers returns available, verified drivers sorted by distance from a given location
func GetNearbyDrivers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		lat, errLat := strconv.ParseFloat(c.Query("latitude"), 64)
		lng, errLng := strconv.ParseFloat(c.Query("longitude"), 64)
		vehicleType := c.Query("vehicle_type")
		maxDistStr := c.DefaultQuery("max_distance", "10") // default 10km radius
		maxDist, _ := strconv.ParseFloat(maxDistStr, 64)

		if errLat != nil || errLng != nil || lat == 0 || lng == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Valid latitude and longitude are required"})
			return
		}
		if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Latitude must be -90 to 90, longitude must be -180 to 180"})
			return
		}

		var drivers []models.Driver
		query := db.Where("is_verified = ? AND is_available = ?", true, true).Preload("User")
		if vehicleType != "" {
			query = query.Where("vehicle_type = ?", vehicleType)
		}
		if err := query.Find(&drivers).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch drivers"})
			return
		}

		type DriverResult struct {
			ID             uint    `json:"id"`
			UserID         uint    `json:"user_id"`
			Name           string  `json:"name"`
			Phone          string  `json:"phone"`
			ProfileImage   string  `json:"profile_image"`
			VehicleType    string  `json:"vehicle_type"`
			VehicleModel   string  `json:"vehicle_model"`
			VehiclePlate   string  `json:"vehicle_plate"`
			Rating         float64 `json:"rating"`
			TotalRatings   int     `json:"total_ratings"`
			CompletedRides int     `json:"completed_rides"`
			Distance       float64 `json:"distance"`
			Latitude       float64 `json:"latitude"`
			Longitude      float64 `json:"longitude"`
			ETA            string  `json:"eta"`
		}

		var results []DriverResult
		for _, d := range drivers {
			if d.CurrentLatitude == 0 && d.CurrentLongitude == 0 {
				continue
			}
			dist := GetDistance(lat, lng, d.CurrentLatitude, d.CurrentLongitude)
			if dist > maxDist {
				continue
			}
			// Estimate ETA: average speed 25 km/h for motorcycle, 35 km/h for car
			speed := 25.0
			if d.VehicleType == "car" {
				speed = 35.0
			}
			etaMinutes := int((dist / speed) * 60)
			if etaMinutes < 1 {
				etaMinutes = 1
			}
			etaStr := strconv.Itoa(etaMinutes) + " min"

			name := ""
			phone := ""
			profileImage := ""
			if d.User.ID > 0 {
				name = d.User.Name
				phone = d.User.Phone
				profileImage = d.User.ProfileImage
			}

			results = append(results, DriverResult{
				ID:             d.ID,
				UserID:         d.UserID,
				Name:           name,
				Phone:          phone,
				ProfileImage:   profileImage,
				VehicleType:    d.VehicleType,
				VehicleModel:   d.VehicleModel,
				VehiclePlate:   d.VehiclePlate,
				Rating:         d.Rating,
				TotalRatings:   d.TotalRatings,
				CompletedRides: d.CompletedRides,
				Distance:       dist,
				Latitude:       d.CurrentLatitude,
				Longitude:      d.CurrentLongitude,
				ETA:            etaStr,
			})
		}

		// Sort by distance (nearest first)
		sort.Slice(results, func(i, j int) bool {
			return results[i].Distance < results[j].Distance
		})

		// Limit to 20 nearest
		if len(results) > 20 {
			results = results[:20]
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    results,
			"count":   len(results),
		})
	}
}

func GetActiveRides(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var rides []models.Ride
		if err := db.Where("user_id = ? AND status IN ?", userID, []string{"scheduled", "pending", "accepted", "driver_arrived", "in_progress"}).Preload("Driver").Preload("Driver.User").Order("created_at DESC").Find(&rides).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch active rides"})
			return
		}
		results := make([]gin.H, len(rides))
		for i, r := range rides {
			result := gin.H{"id": r.ID, "status": r.Status, "pickup_location": r.PickupLocation, "pickup_latitude": r.PickupLatitude, "pickup_longitude": r.PickupLongitude, "dropoff_location": r.DropoffLocation, "dropoff_latitude": r.DropoffLatitude, "dropoff_longitude": r.DropoffLongitude, "distance": r.Distance, "estimated_fare": r.EstimatedFare, "final_fare": r.FinalFare, "vehicle_type": r.VehicleType, "payment_method": r.PaymentMethod, "scheduled_at": r.ScheduledAt, "created_at": r.CreatedAt}
			if r.Driver != nil {
				result["driver"] = gin.H{"id": r.Driver.ID, "user_id": r.Driver.UserID, "name": r.Driver.User.Name, "phone": r.Driver.User.Phone, "profile_image": r.Driver.User.ProfileImage, "vehicle_type": r.Driver.VehicleType, "vehicle_plate": r.Driver.VehiclePlate, "rating": r.Driver.Rating, "current_latitude": r.Driver.CurrentLatitude, "current_longitude": r.Driver.CurrentLongitude}
			}
			results[i] = result
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results, "timestamp": time.Now()})
	}
}

func GetRideDetails(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		// Allow both customer and driver to view ride details
		var driverID uint
		var driver models.Driver
		if db.Where("user_id = ?", userID).First(&driver).Error == nil {
			driverID = driver.ID
		}
		var ride models.Ride
		if err := db.Preload("Driver").Preload("Driver.User").Where("id = ? AND (user_id = ? OR driver_id = ?)", c.Param("id"), userID, driverID).First(&ride).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Ride not found"})
			return
		}
		result := gin.H{"id": ride.ID, "status": ride.Status, "pickup_location": ride.PickupLocation, "pickup_latitude": ride.PickupLatitude, "pickup_longitude": ride.PickupLongitude, "dropoff_location": ride.DropoffLocation, "dropoff_latitude": ride.DropoffLatitude, "dropoff_longitude": ride.DropoffLongitude, "distance": ride.Distance, "estimated_fare": ride.EstimatedFare, "final_fare": ride.FinalFare, "vehicle_type": ride.VehicleType, "payment_method": ride.PaymentMethod, "created_at": ride.CreatedAt}
		if ride.Driver != nil {
			result["driver"] = gin.H{"id": ride.Driver.ID, "user_id": ride.Driver.UserID, "name": ride.Driver.User.Name, "phone": ride.Driver.User.Phone, "profile_image": ride.Driver.User.ProfileImage, "vehicle_type": ride.Driver.VehicleType, "vehicle_model": ride.Driver.VehicleModel, "vehicle_plate": ride.Driver.VehiclePlate, "rating": ride.Driver.Rating, "current_latitude": ride.Driver.CurrentLatitude, "current_longitude": ride.Driver.CurrentLongitude}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result, "timestamp": time.Now()})
	}
}

func CancelRide(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Reason string `json:"reason"`
		}
		c.ShouldBindJSON(&input)
		var ride models.Ride
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&ride).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Ride not found"})
			return
		}
		if ride.Status == "in_progress" || ride.Status == "completed" || ride.Status == "cancelled" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Cannot cancel ride in " + ride.Status + " status"})
			return
		}
		updates := map[string]interface{}{"status": "cancelled"}
		if input.Reason != "" {
			updates["cancellation_reason"] = input.Reason
		}
		if err := db.Model(&ride).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to cancel ride"})
			return
		}
		freeDriver(db, ride.DriverID)
		notifyDriver(db, ride.DriverID, "Ride Cancelled", "The passenger cancelled the ride from "+ride.PickupLocation+".", "ride_cancelled")
		notifyUser(db, *ride.UserID, "Ride Cancelled", "Your ride has been cancelled.", "ride_cancelled")
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Ride cancelled", "id": ride.ID}, "timestamp": time.Now()})
	}
}

// ProcessScheduledRides finds all rides with status "scheduled" where scheduled_at <= now
// and updates their status to "pending" so they enter the normal ride flow.
// Called periodically via GET /admin/process-scheduled.
func ProcessScheduledRides(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		now := time.Now()
		result := db.Model(&models.Ride{}).
			Where("status = ? AND scheduled_at IS NOT NULL AND scheduled_at <= ?", "scheduled", now).
			Update("status", "pending")
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to process scheduled rides"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      gin.H{"processed": result.RowsAffected},
			"timestamp": time.Now(),
		})
	}
}

func RateRide(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Rating float64 `json:"rating" binding:"required,min=1,max=5"`
			Review string  `json:"review"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		var ride models.Ride
		if err := db.Where("id = ? AND user_id = ? AND status = ?", c.Param("id"), userID, "completed").First(&ride).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Completed ride not found"})
			return
		}
		if ride.DriverRating != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "You have already rated this ride"})
			return
		}
		txErr := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&ride).Updates(map[string]interface{}{"driver_rating": input.Rating, "driver_review": input.Review}).Error; err != nil {
				return err
			}
			if ride.DriverID != nil {
				if err := updateDriverRating(tx, *ride.DriverID, input.Rating); err != nil {
					return err
				}
			}
			return nil
		})
		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save rating"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Rating submitted"}, "timestamp": time.Now()})
	}
}

// RatePassenger allows a driver to rate a passenger after a completed ride or delivery.
// It stores the rating on the ride/delivery's user_rating field and updates the user's average rating.
func RatePassenger(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint) // the driver's user ID
		var input struct {
			Rating  float64 `json:"rating" binding:"required,min=1,max=5"`
			Comment string  `json:"comment"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		// Find the driver record for this user
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "You must be a registered driver"})
			return
		}

		serviceID := c.Param("id")
		path := c.FullPath()

		// Determine if this is a ride or delivery based on route path
		if strings.Contains(path, "/deliveries/") {
			var d models.Delivery
			if err := db.Where("id = ? AND driver_id = ? AND status = ?", serviceID, driver.ID, "completed").First(&d).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Completed delivery not found"})
				return
			}
			if d.UserRating != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "You have already rated this passenger"})
				return
			}
			txErr := db.Transaction(func(tx *gorm.DB) error {
				if err := tx.Model(&d).Update("user_rating", input.Rating).Error; err != nil {
					return err
				}
				if err := updateUserRating(tx, *d.UserID, input.Rating); err != nil {
					return err
				}
				return nil
			})
			if txErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save rating"})
				return
			}
		} else {
			var ride models.Ride
			if err := db.Where("id = ? AND driver_id = ? AND status = ?", serviceID, driver.ID, "completed").First(&ride).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Completed ride not found"})
				return
			}
			if ride.UserRating != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "You have already rated this passenger"})
				return
			}
			txErr := db.Transaction(func(tx *gorm.DB) error {
				if err := tx.Model(&ride).Updates(map[string]interface{}{"user_rating": input.Rating, "user_review": input.Comment}).Error; err != nil {
					return err
				}
				if err := updateUserRating(tx, *ride.UserID, input.Rating); err != nil {
					return err
				}
				return nil
			})
			if txErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save rating"})
				return
			}
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Passenger rating submitted"}, "timestamp": time.Now()})
	}
}

// ===== RIDESHARE HANDLERS =====

func CreateRideShare(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			PickupLocation   string  `json:"pickup_location" binding:"required"`
			PickupLatitude   float64 `json:"pickup_latitude"`
			PickupLongitude  float64 `json:"pickup_longitude"`
			DropoffLocation  string  `json:"dropoff_location" binding:"required"`
			DropoffLatitude  float64 `json:"dropoff_latitude"`
			DropoffLongitude float64 `json:"dropoff_longitude"`
			TotalSeats       int     `json:"total_seats" binding:"required"`
			BaseFare         float64 `json:"base_fare" binding:"required"`
			DepartureTime    string  `json:"departure_time" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Must be registered as driver"})
			return
		}
		depTime, err := time.Parse(time.RFC3339, input.DepartureTime)
		if err != nil {
			depTime = time.Now().Add(30 * time.Minute)
		}
		rs := models.RideShare{
			DriverID: uintPtr(driver.ID), PickupLocation: input.PickupLocation, PickupLatitude: input.PickupLatitude, PickupLongitude: input.PickupLongitude,
			DropoffLocation: input.DropoffLocation, DropoffLatitude: input.DropoffLatitude, DropoffLongitude: input.DropoffLongitude,
			TotalSeats: input.TotalSeats, AvailableSeats: input.TotalSeats, BaseFare: input.BaseFare, Status: "active", DepartureTime: depTime,
		}
		if err := db.Create(&rs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create ride share"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": rs, "timestamp": time.Now()})
	}
}

func GetAvailableRideShares(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var shares []models.RideShare
		if err := db.Where("status = ? AND available_seats > 0 AND departure_time > ?", "active", time.Now()).Preload("Driver").Preload("Driver.User").Order("departure_time ASC").Find(&shares).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch ride shares"})
			return
		}
		results := make([]gin.H, len(shares))
		for i, s := range shares {
			result := gin.H{"id": s.ID, "pickup_location": s.PickupLocation, "dropoff_location": s.DropoffLocation, "total_seats": s.TotalSeats, "available_seats": s.AvailableSeats, "base_fare": s.BaseFare, "departure_time": s.DepartureTime, "status": s.Status, "created_at": s.CreatedAt}
			if s.Driver.ID != 0 && s.Driver.User.ID != 0 {
				result["driver"] = gin.H{"id": s.Driver.ID, "name": s.Driver.User.Name, "phone": s.Driver.User.Phone, "vehicle_type": s.Driver.VehicleType, "vehicle_plate": s.Driver.VehiclePlate, "rating": s.Driver.Rating}
			}
			results[i] = result
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results, "timestamp": time.Now()})
	}
}

func JoinRideShare(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			PaymentMethod string `json:"payment_method"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			log.Printf("Failed to bind JoinRideShare input: %v", err)
		}
		if input.PaymentMethod == "" {
			input.PaymentMethod = "cash"
		}
		tx := db.Begin()
		var rs models.RideShare
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Driver").Preload("Passengers").Where("id = ? AND status = ? AND available_seats > 0", c.Param("id"), "active").First(&rs).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Ride share not available"})
			return
		}
		// Prevent driver from joining their own rideshare
		var driver models.Driver
		if err := tx.Where("user_id = ?", userID).First(&driver).Error; err == nil {
			if rs.DriverID != nil && driver.ID == *rs.DriverID {
				tx.Rollback()
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Cannot join your own ride share"})
				return
			}
		}
		// Check if user already joined this rideshare
		for _, p := range rs.Passengers {
			if p.ID == uint(userID) {
				tx.Rollback()
				c.JSON(http.StatusConflict, gin.H{"success": false, "error": "You already joined this ride share"})
				return
			}
		}
		var user models.User
		if err := tx.First(&user, userID).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
			return
		}
		if err := tx.Model(&rs).Association("Passengers").Append(&user); err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to join ride share"})
			return
		}
		if err := tx.Model(&rs).Update("available_seats", gorm.Expr("available_seats - 1")).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update seats"})
			return
		}
		// Create a trackable ride for this passenger
		ride := models.Ride{
			UserID:           uintPtr(userID),
			DriverID:         rs.DriverID,
			PickupLocation:   rs.PickupLocation,
			PickupLatitude:   rs.PickupLatitude,
			PickupLongitude:  rs.PickupLongitude,
			DropoffLocation:  rs.DropoffLocation,
			DropoffLatitude:  rs.DropoffLatitude,
			DropoffLongitude: rs.DropoffLongitude,
			Distance:         GetDistance(rs.PickupLatitude, rs.PickupLongitude, rs.DropoffLatitude, rs.DropoffLongitude),
			EstimatedFare:    rs.BaseFare,
			VehicleType:      rs.Driver.VehicleType,
			Status:           "accepted",
			PaymentMethod:    input.PaymentMethod,
		}
		if err := tx.Create(&ride).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to join ride share"})
			return
		}
		// Notify the driver that someone joined
		if err := tx.Create(&models.Notification{UserID: rs.Driver.UserID, Title: "Passenger Joined", Body: user.Name + " joined your ride share", Type: "rideshare_join"}).Error; err != nil {
			log.Printf("Failed to create rideshare join notification: %v", err)
		}
		if err := tx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to join ride share"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Joined ride share", "fare": rs.BaseFare, "ride_id": ride.ID, "pickup": rs.PickupLocation, "dropoff": rs.DropoffLocation}, "timestamp": time.Now()})
	}
}

// ===== DELIVERY HANDLERS =====

func CreateDelivery(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var pickupLocation, dropoffLocation, itemDescription, itemPhoto, notes, paymentMethod, promoCode string
		var pickupLat, pickupLng, dropoffLat, dropoffLng, weight, clientDistance float64

		contentType := c.ContentType()
		isMultipart := len(contentType) >= 9 && contentType[:9] == "multipart"
		if isMultipart {
			pickupLocation = c.PostForm("pickup_location")
			dropoffLocation = c.PostForm("dropoff_location")
			itemDescription = c.PostForm("item_description")
			notes = c.PostForm("notes")
			paymentMethod = c.PostForm("payment_method")
			promoCode = c.PostForm("promo_code")
			itemPhoto = c.PostForm("item_photo")
			pickupLat, _ = strconv.ParseFloat(c.PostForm("pickup_latitude"), 64)
			pickupLng, _ = strconv.ParseFloat(c.PostForm("pickup_longitude"), 64)
			dropoffLat, _ = strconv.ParseFloat(c.PostForm("dropoff_latitude"), 64)
			dropoffLng, _ = strconv.ParseFloat(c.PostForm("dropoff_longitude"), 64)
			weight, _ = strconv.ParseFloat(c.PostForm("weight"), 64)
			clientDistance, _ = strconv.ParseFloat(c.PostForm("distance"), 64)

			// Handle file upload
			file, err := c.FormFile("item_photo")
			if err == nil && file != nil {
				uploadDir := getUploadDir()
				os.MkdirAll(uploadDir, os.ModePerm)
				filename := strconv.FormatUint(uint64(userID), 10) + "_" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "_" + filepath.Base(file.Filename)
				savePath := filepath.Join(uploadDir, filename)
				if err := c.SaveUploadedFile(file, savePath); err == nil {
					baseURL := os.Getenv("BASE_URL")
					if baseURL == "" {
						baseURL = "https://omji-backend.onrender.com"
					}
					itemPhoto = baseURL + "/uploads/" + filename
				}
			}

			if pickupLocation == "" || dropoffLocation == "" || itemDescription == "" {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "pickup_location, dropoff_location, and item_description are required"})
				return
			}
		} else {
			var input struct {
				PickupLocation   string  `json:"pickup_location" binding:"required"`
				PickupLatitude   float64 `json:"pickup_latitude"`
				PickupLongitude  float64 `json:"pickup_longitude"`
				DropoffLocation  string  `json:"dropoff_location" binding:"required"`
				DropoffLatitude  float64 `json:"dropoff_latitude"`
				DropoffLongitude float64 `json:"dropoff_longitude"`
				ItemDescription  string  `json:"item_description" binding:"required"`
				ItemPhoto        string  `json:"item_photo"`
				Notes            string  `json:"notes"`
				Weight           float64 `json:"weight"`
				PaymentMethod    string  `json:"payment_method"`
				PromoCode        string  `json:"promo_code"`
				Distance         float64 `json:"distance"`
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
				return
			}
			pickupLocation = input.PickupLocation
			pickupLat = input.PickupLatitude
			pickupLng = input.PickupLongitude
			dropoffLocation = input.DropoffLocation
			dropoffLat = input.DropoffLatitude
			dropoffLng = input.DropoffLongitude
			itemDescription = input.ItemDescription
			itemPhoto = input.ItemPhoto
			notes = input.Notes
			weight = input.Weight
			paymentMethod = input.PaymentMethod
			promoCode = input.PromoCode
			clientDistance = input.Distance
		}

		if paymentMethod == "" {
			paymentMethod = "cash"
		}
		distance := GetRoadDistance(clientDistance, pickupLat, pickupLng, dropoffLat, dropoffLng)
		if distance < 0.1 {
			distance = 1.0
		}
		if distance > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Delivery distance exceeds maximum limit of 100km"})
			return
		}
		fee := CalculateDeliveryFeeFromDB(db, distance)
		var promoID *uint
		if promoCode != "" {
			var promo models.Promo
			if err := db.Clauses(clause.Locking{Strength: "UPDATE"}).Where("code = ? AND is_active = ? AND applicable_to IN ?", promoCode, true, []string{"deliveries", "all"}).First(&promo).Error; err == nil {
				promoNow := time.Now()
				promoValid := fee >= promo.MinimumAmount && (promo.UsageLimit == 0 || promo.UsageCount < promo.UsageLimit) && (promo.StartDate.IsZero() || !promoNow.Before(promo.StartDate)) && (promo.EndDate.IsZero() || !promoNow.After(promo.EndDate))
				if promoValid {
					discount := 0.0
					if promo.DiscountType == "percentage" {
						discount = fee * promo.DiscountValue / 100
						if discount > promo.MaxDiscount && promo.MaxDiscount > 0 {
							discount = promo.MaxDiscount
						}
					} else {
						discount = promo.DiscountValue
					}
					fee -= discount
					if fee < 0 {
						fee = 0
					}
					promoID = &promo.ID
					if err := db.Model(&promo).Update("usage_count", gorm.Expr("usage_count + 1")).Error; err != nil {
						log.Printf("Failed to update promo usage count: %v", err)
					}
				}
			}
		}
		delivery := models.Delivery{
			UserID: uintPtr(userID), PickupLocation: pickupLocation, PickupLatitude: pickupLat, PickupLongitude: pickupLng,
			DropoffLocation: dropoffLocation, DropoffLatitude: dropoffLat, DropoffLongitude: dropoffLng,
			ItemDescription: itemDescription, ItemPhoto: itemPhoto, Notes: notes, Weight: weight, Distance: distance, DeliveryFee: fee, Status: "pending",
			PaymentMethod: paymentMethod, BarcodeNumber: func() string { b, err := GenerateOTP(); if err != nil { return fmt.Sprintf("%06d", 0) }; return b }(), PromoID: promoID,
		}
		if err := db.Create(&delivery).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create delivery"})
			return
		}
		// Notify user of successful delivery booking
		if err := db.Create(&models.Notification{UserID: userID, Title: "Delivery Booked", Body: "Your delivery request has been submitted. A rider will accept soon.", Type: "delivery_request"}).Error; err != nil {
			log.Printf("Failed to create delivery booking notification: %v", err)
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": gin.H{"id": delivery.ID, "status": delivery.Status, "pickup_location": delivery.PickupLocation, "dropoff_location": delivery.DropoffLocation, "distance": delivery.Distance, "delivery_fee": delivery.DeliveryFee, "item_description": delivery.ItemDescription, "item_photo": delivery.ItemPhoto, "payment_method": delivery.PaymentMethod, "created_at": delivery.CreatedAt}, "timestamp": time.Now()})
	}
}

func GetActiveDeliveries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var deliveries []models.Delivery
		if err := db.Where("user_id = ? AND status IN ?", userID, []string{"pending", "accepted", "driver_arrived", "picked_up", "in_progress"}).Preload("Driver").Preload("Driver.User").Order("created_at DESC").Find(&deliveries).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch active deliveries"})
			return
		}
		results := make([]gin.H, len(deliveries))
		for i, d := range deliveries {
			result := gin.H{"id": d.ID, "status": d.Status, "pickup_location": d.PickupLocation, "pickup_latitude": d.PickupLatitude, "pickup_longitude": d.PickupLongitude, "dropoff_location": d.DropoffLocation, "dropoff_latitude": d.DropoffLatitude, "dropoff_longitude": d.DropoffLongitude, "distance": d.Distance, "delivery_fee": d.DeliveryFee, "payment_method": d.PaymentMethod, "item_description": d.ItemDescription, "created_at": d.CreatedAt}
			if d.Driver != nil {
				result["driver"] = gin.H{"id": d.Driver.ID, "user_id": d.Driver.UserID, "name": d.Driver.User.Name, "phone": d.Driver.User.Phone, "profile_image": d.Driver.User.ProfileImage, "vehicle_type": d.Driver.VehicleType, "vehicle_plate": d.Driver.VehiclePlate, "rating": d.Driver.Rating, "current_latitude": d.Driver.CurrentLatitude, "current_longitude": d.Driver.CurrentLongitude}
			}
			results[i] = result
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results, "timestamp": time.Now()})
	}
}

func GetDeliveryDetails(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		// Allow both customer and driver to view delivery details
		var driverID uint
		var driver models.Driver
		if db.Where("user_id = ?", userID).First(&driver).Error == nil {
			driverID = driver.ID
		}
		var d models.Delivery
		if err := db.Preload("Driver").Preload("Driver.User").Where("id = ? AND (user_id = ? OR driver_id = ?)", c.Param("id"), userID, driverID).First(&d).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Delivery not found"})
			return
		}
		result := gin.H{"id": d.ID, "status": d.Status, "pickup_location": d.PickupLocation, "pickup_latitude": d.PickupLatitude, "pickup_longitude": d.PickupLongitude, "dropoff_location": d.DropoffLocation, "dropoff_latitude": d.DropoffLatitude, "dropoff_longitude": d.DropoffLongitude, "distance": d.Distance, "delivery_fee": d.DeliveryFee, "payment_method": d.PaymentMethod, "item_description": d.ItemDescription, "created_at": d.CreatedAt}
		if d.Driver != nil {
			result["driver"] = gin.H{"id": d.Driver.ID, "user_id": d.Driver.UserID, "name": d.Driver.User.Name, "phone": d.Driver.User.Phone, "profile_image": d.Driver.User.ProfileImage, "vehicle_type": d.Driver.VehicleType, "vehicle_model": d.Driver.VehicleModel, "vehicle_plate": d.Driver.VehiclePlate, "rating": d.Driver.Rating, "current_latitude": d.Driver.CurrentLatitude, "current_longitude": d.Driver.CurrentLongitude}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result, "timestamp": time.Now()})
	}
}

func CancelDelivery(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Reason string `json:"reason"`
		}
		c.ShouldBindJSON(&input)
		var d models.Delivery
		if err := db.Where("id = ? AND user_id = ? AND status IN ?", c.Param("id"), userID, []string{"pending", "accepted", "driver_arrived"}).First(&d).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Delivery not found or cannot cancel"})
			return
		}
		updates := map[string]interface{}{"status": "cancelled"}
		if input.Reason != "" {
			updates["cancellation_reason"] = input.Reason
		}
		if err := db.Model(&d).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to cancel delivery"})
			return
		}
		freeDriver(db, d.DriverID)
		notifyDriver(db, d.DriverID, "Delivery Cancelled", "The customer cancelled the delivery from "+d.PickupLocation+".", "delivery_cancelled")
		notifyUser(db, *d.UserID, "Delivery Cancelled", "Your delivery has been cancelled.", "delivery_cancelled")
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Delivery cancelled"}, "timestamp": time.Now()})
	}
}

func RateDelivery(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Rating float64 `json:"rating" binding:"required,min=1,max=5"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		var d models.Delivery
		if err := db.Where("id = ? AND user_id = ? AND status = ?", c.Param("id"), userID, "completed").First(&d).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Completed delivery not found"})
			return
		}
		if d.DriverRating != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "You have already rated this delivery"})
			return
		}
		txErr := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&d).Update("driver_rating", input.Rating).Error; err != nil {
				return err
			}
			if d.DriverID != nil {
				if err := updateDriverRating(tx, *d.DriverID, input.Rating); err != nil {
					return err
				}
			}
			return nil
		})
		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save rating"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Rating submitted"}, "timestamp": time.Now()})
	}
}

// ===== STORE HANDLERS =====

func GetStores(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		category := c.Query("category")
		var stores []models.Store
		q := db.Order("rating DESC")
		if category != "" {
			q = q.Where("category = ?", category)
		}
		if err := q.Find(&stores).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch stores"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": stores, "timestamp": time.Now()})
	}
}

func GetStoreMenu(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var items []models.MenuItem
		if err := db.Where("store_id = ? AND available = ?", c.Param("id"), true).Find(&items).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch menu"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": items, "timestamp": time.Now()})
	}
}

// ===== ORDER HANDLERS =====

func CreateOrder(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			StoreID           uint            `json:"store_id" binding:"required"`
			Items             json.RawMessage `json:"items" binding:"required"`
			DeliveryLocation  string          `json:"delivery_location" binding:"required"`
			DeliveryLatitude  float64         `json:"delivery_latitude"`
			DeliveryLongitude float64         `json:"delivery_longitude"`
			PaymentMethod     string          `json:"payment_method" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		var store models.Store
		if err := db.First(&store, input.StoreID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Store not found"})
			return
		}
		// Calculate subtotal from items using DB prices (batch fetch)
		subtotal := 0.0
		var orderItems []struct {
			ItemID   uint `json:"item_id"`
			Quantity int  `json:"quantity"`
		}
		if err := json.Unmarshal(input.Items, &orderItems); err == nil {
			itemIDs := make([]uint, 0, len(orderItems))
			for _, item := range orderItems {
				if item.Quantity > 0 && item.ItemID > 0 {
					itemIDs = append(itemIDs, item.ItemID)
				}
			}
			if len(itemIDs) > 0 {
				var menuItems []models.MenuItem
				if err := db.Where("id IN ? AND store_id = ?", itemIDs, input.StoreID).Find(&menuItems).Error; err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to verify order items"})
					return
				}
				priceMap := make(map[uint]float64, len(menuItems))
				for _, mi := range menuItems {
					priceMap[mi.ID] = mi.Price
				}
				for _, item := range orderItems {
					if price, ok := priceMap[item.ItemID]; ok && item.Quantity > 0 {
						subtotal += price * float64(item.Quantity)
					}
				}
			}
		}
		if subtotal <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid order items"})
			return
		}
		deliveryFee := GetOrderDeliveryFeeFromDB(db)
		tax := subtotal * 0.05
		order := models.Order{
			UserID: uintPtr(userID), StoreID: uintPtr(input.StoreID), Items: datatypes.JSON(input.Items), Subtotal: subtotal, DeliveryFee: deliveryFee, Tax: tax,
			TotalAmount: subtotal + deliveryFee + tax, Status: "pending",
			DeliveryLocation: input.DeliveryLocation, DeliveryLatitude: input.DeliveryLatitude, DeliveryLongitude: input.DeliveryLongitude,
			PaymentMethod: input.PaymentMethod,
		}
		if err := db.Create(&order).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create order"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": gin.H{"id": order.ID, "status": order.Status, "total_amount": order.TotalAmount}, "timestamp": time.Now()})
	}
}

func GetActiveOrders(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var orders []models.Order
		if err := db.Where("user_id = ? AND status IN ?", userID, []string{"pending", "confirmed", "preparing", "ready", "out_for_delivery"}).Preload("Store").Order("created_at DESC").Find(&orders).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch active orders"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": orders, "timestamp": time.Now()})
	}
}

func GetOrderDetails(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var order models.Order
		if err := db.Preload("Store").Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&order).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Order not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": order, "timestamp": time.Now()})
	}
}

func CancelOrder(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var order models.Order
		if err := db.Where("id = ? AND user_id = ? AND status IN ?", c.Param("id"), userID, []string{"pending", "confirmed"}).First(&order).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Order not found or cannot cancel"})
			return
		}
		if err := db.Model(&order).Update("status", "cancelled").Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to cancel order"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Order cancelled"}, "timestamp": time.Now()})
	}
}

func RateOrder(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Rating float64 `json:"rating" binding:"required,min=1,max=5"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		var order models.Order
		if err := db.Where("id = ? AND user_id = ? AND status = ?", c.Param("id"), userID, "delivered").First(&order).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Delivered order not found"})
			return
		}
		if order.UserRating != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "You have already rated this order"})
			return
		}
		txErr := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&order).Updates(map[string]interface{}{"user_rating": input.Rating, "store_rating": input.Rating}).Error; err != nil {
				return err
			}
			var store models.Store
			if tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&store, order.StoreID).Error == nil {
				newTotal := store.TotalRatings + 1
				newRating := ((store.Rating * float64(store.TotalRatings)) + input.Rating) / float64(newTotal)
				if err := tx.Model(&store).Updates(map[string]interface{}{"rating": newRating, "total_ratings": newTotal}).Error; err != nil {
					return err
				}
			}
			return nil
		})
		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save rating"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Rating submitted"}, "timestamp": time.Now()})
	}
}

func GetOrderHistory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var orders []models.Order
		if err := db.Where("user_id = ?", userID).Preload("Store").Order("created_at DESC").Limit(50).Find(&orders).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch order history"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": orders, "timestamp": time.Now()})
	}
}

// ===== PAYMENT HANDLERS =====

func GetPaymentMethods(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var methods []models.PaymentMethod
		if err := db.Where("user_id = ?", userID).Find(&methods).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch payment methods"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": methods, "timestamp": time.Now()})
	}
}

func AddPaymentMethod(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Type      string `json:"type" binding:"required"`
			IsDefault bool   `json:"is_default"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		pm := models.PaymentMethod{UserID: userID, Type: input.Type, IsDefault: input.IsDefault}
		if err := db.Create(&pm).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to add payment method"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": pm, "timestamp": time.Now()})
	}
}

func DeletePaymentMethod(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		result := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).Delete(&models.PaymentMethod{})
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete payment method"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Payment method not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Payment method deleted"}, "timestamp": time.Now()})
	}
}

// ===== FAVORITES HANDLERS =====

func GetFavorites(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		favType := c.Query("type") // optional filter: store, driver

		var favorites []models.Favorite
		query := db.Where("user_id = ?", userID)
		if favType != "" {
			query = query.Where("type = ?", favType)
		}
		if err := query.Order("created_at DESC").Find(&favorites).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch favorites"})
			return
		}

		// Batch fetch store details for store favorites
		storeIDs := make([]uint, 0)
		for _, fav := range favorites {
			if fav.Type == "store" {
				storeIDs = append(storeIDs, fav.ItemID)
			}
		}
		storeMap := make(map[uint]models.Store)
		if len(storeIDs) > 0 {
			var stores []models.Store
			if err := db.Select("id, name, category, rating, logo, address").Where("id IN ?", storeIDs).Find(&stores).Error; err != nil {
				log.Printf("Failed to batch fetch stores for favorites: %v", err)
			}
			for _, s := range stores {
				storeMap[s.ID] = s
			}
		}
		result := make([]gin.H, 0, len(favorites))
		for _, fav := range favorites {
			item := gin.H{
				"id":         fav.ID,
				"type":       fav.Type,
				"item_id":    fav.ItemID,
				"created_at": fav.CreatedAt,
			}
			if fav.Type == "store" {
				if store, ok := storeMap[fav.ItemID]; ok {
					item["name"] = store.Name
					item["category"] = store.Category
					item["rating"] = store.Rating
					item["logo"] = store.Logo
					item["address"] = store.Address
				}
			}
			result = append(result, item)
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result, "timestamp": time.Now()})
	}
}

func AddFavorite(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Type   string `json:"type" binding:"required"`
			ItemID uint   `json:"item_id" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if input.Type != "store" && input.Type != "driver" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Type must be 'store' or 'driver'"})
			return
		}
		// Check for duplicate
		var existing models.Favorite
		if err := db.Where("user_id = ? AND type = ? AND item_id = ?", userID, input.Type, input.ItemID).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "Already in favorites"})
			return
		}
		fav := models.Favorite{UserID: userID, Type: input.Type, ItemID: input.ItemID}
		if err := db.Create(&fav).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to add favorite"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": fav, "timestamp": time.Now()})
	}
}

func DeleteFavorite(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		result := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).Delete(&models.Favorite{})
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to remove favorite"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Favorite not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Removed from favorites"}, "timestamp": time.Now()})
	}
}

func CheckFavorite(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		itemType := c.Query("type")
		itemIDStr := c.Query("item_id")
		itemID, err := strconv.ParseUint(itemIDStr, 10, 64)
		if err != nil || itemID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Valid item_id is required"})
			return
		}
		var fav models.Favorite
		dbErr := db.Where("user_id = ? AND type = ? AND item_id = ?", userID, itemType, uint(itemID)).First(&fav).Error
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"is_favorite": dbErr == nil}, "timestamp": time.Now()})
	}
}

// ===== PROMO HANDLERS =====

func GetAvailablePromos(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var promos []models.Promo
		if err := db.Where("is_active = ? AND (usage_limit = 0 OR usage_count < usage_limit)", true).Find(&promos).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch promos"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": promos, "timestamp": time.Now()})
	}
}

func ApplyPromo(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Code   string  `json:"code" binding:"required"`
			Amount float64 `json:"amount" binding:"required"`
			Type   string  `json:"type" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		var promo models.Promo
		if err := db.Where("code = ? AND is_active = ? AND applicable_to IN ?", input.Code, true, []string{input.Type, "all"}).First(&promo).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Promo code not found or not applicable"})
			return
		}
		now := time.Now()
		if !promo.StartDate.IsZero() && now.Before(promo.StartDate) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Promo code is not yet active"})
			return
		}
		if !promo.EndDate.IsZero() && now.After(promo.EndDate) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Promo code has expired"})
			return
		}
		if promo.UsageLimit > 0 && promo.UsageCount >= promo.UsageLimit {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Promo code usage limit reached"})
			return
		}
		if input.Amount < promo.MinimumAmount {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Minimum amount not met"})
			return
		}
		discount := 0.0
		if promo.DiscountType == "percentage" {
			discount = input.Amount * promo.DiscountValue / 100
			if discount > promo.MaxDiscount && promo.MaxDiscount > 0 {
				discount = promo.MaxDiscount
			}
		} else {
			discount = promo.DiscountValue
		}
		// Atomically increment usage_count to prevent race conditions
		result := db.Model(&models.Promo{}).Where("id = ? AND (usage_limit = 0 OR usage_count < usage_limit)", promo.ID).Update("usage_count", gorm.Expr("usage_count + 1"))
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to apply promo"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Promo code usage limit reached"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"discount": discount, "final_amount": input.Amount - discount, "promo": promo.Description}, "timestamp": time.Now()})
	}
}

// ===== DRIVER HANDLERS =====

func RegisterDriver(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var vehicleType, vehicleModel, vehiclePlate, licenseNumber string

		contentType := c.ContentType()
		isMultipart := len(contentType) >= 9 && contentType[:9] == "multipart"

		if isMultipart {
			vehicleType = c.PostForm("vehicle_type")
			vehicleModel = c.PostForm("vehicle_model")
			vehiclePlate = c.PostForm("vehicle_plate")
			licenseNumber = c.PostForm("license_number")
		} else {
			var input struct {
				VehicleType   string `json:"vehicle_type" binding:"required"`
				VehicleModel  string `json:"vehicle_model" binding:"required"`
				VehiclePlate  string `json:"vehicle_plate" binding:"required"`
				LicenseNumber string `json:"license_number" binding:"required"`
			}
			if err := c.ShouldBindJSON(&input); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
				return
			}
			vehicleType = input.VehicleType
			vehicleModel = input.VehicleModel
			vehiclePlate = input.VehiclePlate
			licenseNumber = input.LicenseNumber
		}

		if vehicleType == "" || vehicleModel == "" || vehiclePlate == "" || licenseNumber == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "vehicle_type, vehicle_model, vehicle_plate, and license_number are required"})
			return
		}

		var existing models.Driver
		if err := db.Where("user_id = ?", userID).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "Already registered as driver"})
			return
		}

		// Handle document uploads
		documents := map[string]string{}
		baseURL := os.Getenv("BASE_URL")
		if baseURL == "" {
			baseURL = "https://omji-backend.onrender.com"
		}
		docFields := []string{"profile_photo", "license_photo", "orcr_photo", "id_photo"}
		for _, field := range docFields {
			file, err := c.FormFile(field)
			if err == nil && file != nil {
				uploadDir := getUploadDir()
				os.MkdirAll(uploadDir, os.ModePerm)
				filename := strconv.FormatUint(uint64(userID), 10) + "_" + field + "_" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "_" + filepath.Base(file.Filename)
				savePath := filepath.Join(uploadDir, filename)
				if err := c.SaveUploadedFile(file, savePath); err == nil {
					documents[field] = baseURL + "/uploads/" + filename
				}
			}
		}

		var documentsJSON datatypes.JSON
		if len(documents) > 0 {
			jsonBytes, _ := json.Marshal(documents)
			documentsJSON = datatypes.JSON(jsonBytes)
		}

		driver := models.Driver{UserID: userID, VehicleType: vehicleType, VehicleModel: vehicleModel, VehiclePlate: vehiclePlate, LicenseNumber: licenseNumber, IsVerified: false, Documents: documentsJSON}
		if err := db.Create(&driver).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to register: " + err.Error()})
			return
		}
		// Note: User role stays as 'user' until admin approves via VerifyDriver
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": gin.H{"driver": driver, "message": "Application submitted. Please wait for admin approval."}, "timestamp": time.Now()})
	}
}

func GetDriverProfile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var driver models.Driver
		if err := db.Preload("User").Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"id": driver.ID, "name": driver.User.Name, "phone": driver.User.Phone, "email": driver.User.Email, "vehicle_type": driver.VehicleType, "vehicle_model": driver.VehicleModel, "vehicle_plate": driver.VehiclePlate, "license_number": driver.LicenseNumber, "is_verified": driver.IsVerified, "is_available": driver.IsAvailable, "total_earnings": driver.TotalEarnings, "completed_rides": driver.CompletedRides, "rating": driver.Rating, "total_ratings": driver.TotalRatings}, "timestamp": time.Now()})
	}
}

func UpdateDriverProfile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			VehicleModel string `json:"vehicle_model"`
			VehiclePlate string `json:"vehicle_plate"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		updates := map[string]interface{}{}
		if input.VehicleModel != "" {
			updates["vehicle_model"] = input.VehicleModel
		}
		if input.VehiclePlate != "" {
			updates["vehicle_plate"] = input.VehiclePlate
		}
		if len(updates) > 0 {
			if err := db.Model(&models.Driver{}).Where("user_id = ?", userID).Updates(updates).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update profile"})
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Profile updated"}, "timestamp": time.Now()})
	}
}

func GetDriverRequests(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		// Get driver's active rides (accepted/in_progress)
		var activeRides []models.Ride
		if err := db.Where("driver_id = ? AND status IN ?", driver.ID, []string{"accepted", "driver_arrived", "in_progress"}).Preload("User").Order("created_at DESC").Find(&activeRides).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch driver data"})
			return
		}
		active := make([]gin.H, 0, len(activeRides)+5)
		for _, r := range activeRides {
			active = append(active, gin.H{"id": r.ID, "type": "ride", "status": r.Status, "pickup": r.PickupLocation, "pickup_lat": r.PickupLatitude, "pickup_lng": r.PickupLongitude, "dropoff": r.DropoffLocation, "dropoff_lat": r.DropoffLatitude, "dropoff_lng": r.DropoffLongitude, "distance_km": r.Distance, "estimated_fare": r.EstimatedFare, "vehicle_type": r.VehicleType, "passenger_name": r.User.Name, "passenger_phone": r.User.Phone, "payment_method": r.PaymentMethod, "created_at": r.CreatedAt})
		}
		// Get driver's active deliveries
		var activeDeliveries []models.Delivery
		if err := db.Where("driver_id = ? AND status IN ?", driver.ID, []string{"accepted", "driver_arrived", "picked_up", "in_progress"}).Preload("User").Order("created_at DESC").Find(&activeDeliveries).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch driver data"})
			return
		}
		for _, d := range activeDeliveries {
			active = append(active, gin.H{"id": d.ID, "type": "delivery", "status": d.Status, "pickup": d.PickupLocation, "pickup_lat": d.PickupLatitude, "pickup_lng": d.PickupLongitude, "dropoff": d.DropoffLocation, "dropoff_lat": d.DropoffLatitude, "dropoff_lng": d.DropoffLongitude, "distance_km": d.Distance, "delivery_fee": d.DeliveryFee, "item_description": d.ItemDescription, "passenger_name": d.User.Name, "passenger_phone": d.User.Phone, "payment_method": d.PaymentMethod, "created_at": d.CreatedAt})
		}
		// Get pending rides (only recent - within last 2 hours)
		staleThreshold := time.Now().Add(-2 * time.Hour)
		var rides []models.Ride
		if err := db.Where("status = ? AND driver_id IS NULL AND created_at > ?", "pending", staleThreshold).Preload("User").Order("created_at DESC").Limit(20).Find(&rides).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch pending rides"})
			return
		}
		results := make([]gin.H, 0, len(rides)+10)
		for _, r := range rides {
			results = append(results, gin.H{"id": r.ID, "type": "ride", "status": "pending", "pickup": r.PickupLocation, "pickup_lat": r.PickupLatitude, "pickup_lng": r.PickupLongitude, "dropoff": r.DropoffLocation, "dropoff_lat": r.DropoffLatitude, "dropoff_lng": r.DropoffLongitude, "distance_km": r.Distance, "estimated_fare": r.EstimatedFare, "vehicle_type": r.VehicleType, "passenger_name": r.User.Name, "passenger_phone": r.User.Phone, "payment_method": r.PaymentMethod, "created_at": r.CreatedAt})
		}
		// Get pending deliveries (only recent - within last 2 hours)
		var deliveries []models.Delivery
		if err := db.Where("status = ? AND driver_id IS NULL AND created_at > ?", "pending", staleThreshold).Preload("User").Order("created_at DESC").Limit(20).Find(&deliveries).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch pending deliveries"})
			return
		}
		for _, d := range deliveries {
			results = append(results, gin.H{"id": d.ID, "type": "delivery", "status": "pending", "pickup": d.PickupLocation, "pickup_lat": d.PickupLatitude, "pickup_lng": d.PickupLongitude, "dropoff": d.DropoffLocation, "dropoff_lat": d.DropoffLatitude, "dropoff_lng": d.DropoffLongitude, "distance_km": d.Distance, "delivery_fee": d.DeliveryFee, "item_description": d.ItemDescription, "passenger_name": d.User.Name, "passenger_phone": d.User.Phone, "payment_method": d.PaymentMethod, "created_at": d.CreatedAt})
		}
		// Get driver's active rideshares
		var activeShares []models.RideShare
		if err := db.Where("driver_id = ? AND status = ?", driver.ID, "active").Preload("Passengers").Find(&activeShares).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch active rideshares"})
			return
		}
		for _, s := range activeShares {
			passengerNames := make([]string, len(s.Passengers))
			for i, p := range s.Passengers {
				passengerNames[i] = p.Name
			}
			active = append(active, gin.H{"id": s.ID, "type": "rideshare", "status": s.Status, "pickup": s.PickupLocation, "pickup_lat": s.PickupLatitude, "pickup_lng": s.PickupLongitude, "dropoff": s.DropoffLocation, "dropoff_lat": s.DropoffLatitude, "dropoff_lng": s.DropoffLongitude, "total_seats": s.TotalSeats, "available_seats": s.AvailableSeats, "base_fare": s.BaseFare, "departure_time": s.DepartureTime, "passengers": passengerNames, "created_at": s.CreatedAt})
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results, "active": active, "timestamp": time.Now()})
	}
}

func AcceptRequest(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		if !driver.IsAvailable {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "You are not available. Go online first."})
			return
		}
		if err := db.Preload("User").First(&driver, driver.ID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load driver details"})
			return
		}
		requestID := c.Param("id")
		// Try ride first
		var ride models.Ride
		rideErr := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND status IN ?", requestID, []string{"pending", "requested"}).First(&ride).Error; err != nil {
				return err
			}
			ride.DriverID = &driver.ID
			ride.Status = "accepted"
			if err := tx.Save(&ride).Error; err != nil {
				return err
			}
			return tx.Model(&driver).Update("is_available", false).Error
		})
		if rideErr == nil {
			// Notify customer
			if ride.ID != 0 {
				safeNotify(db, ride.UserID, "Ride Accepted", "A driver has accepted your ride request", "ride_request")
				rideIDStr := fmt.Sprintf("%d", ride.ID)
				tracker.Broadcast(rideIDStr, map[string]interface{}{
					"type":         "ride_accepted",
					"ride_id":      ride.ID,
					"driver_name":  driver.User.Name,
					"driver_rating": driver.Rating,
					"vehicle_type": driver.VehicleType,
					"vehicle_plate": driver.VehiclePlate,
					"driver_lat":   driver.CurrentLatitude,
					"driver_lng":   driver.CurrentLongitude,
				})
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Ride accepted", "ride_id": ride.ID, "type": "ride", "status": "accepted", "pickup": ride.PickupLocation, "dropoff": ride.DropoffLocation, "fare": ride.EstimatedFare}, "timestamp": time.Now()})
			return
		}
		// Try delivery
		var delivery models.Delivery
		delErr := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND status = ?", requestID, "pending").First(&delivery).Error; err != nil {
				return err
			}
			delivery.DriverID = &driver.ID
			delivery.Status = "accepted"
			if err := tx.Save(&delivery).Error; err != nil {
				return err
			}
			return tx.Model(&driver).Update("is_available", false).Error
		})
		if delErr == nil {
			if delivery.ID != 0 {
				safeNotify(db, delivery.UserID, "Delivery Accepted", "A driver has accepted your delivery request", "delivery_request")
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Delivery accepted", "ride_id": delivery.ID, "type": "delivery", "status": "accepted", "pickup": delivery.PickupLocation, "dropoff": delivery.DropoffLocation, "fare": delivery.DeliveryFee}, "timestamp": time.Now()})
			return
		}
		c.JSON(http.StatusConflict, gin.H{"success": false, "error": "Request already taken or not found"})
	}
}

func RejectRequest(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		requestID := c.Param("id")
		// Try to reject ride (with transaction for atomicity)
		var ride models.Ride
		if err := db.Where("id = ? AND driver_id = ? AND status = ?", requestID, driver.ID, "accepted").First(&ride).Error; err == nil {
			txErr := db.Transaction(func(tx *gorm.DB) error {
				if err := tx.Model(&ride).Updates(map[string]interface{}{"driver_id": nil, "status": "pending"}).Error; err != nil {
					return err
				}
				if err := tx.Model(&driver).Update("is_available", true).Error; err != nil {
					return err
				}
				safeNotify(tx, ride.UserID, "Driver Unavailable", "Your ride is being reassigned to another driver", "ride_request")
				return nil
			})
			if txErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to reject ride"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Ride rejected and returned to pending", "id": ride.ID, "type": "ride"}, "timestamp": time.Now()})
			return
		}
		// Try to reject delivery (with transaction for atomicity)
		var delivery models.Delivery
		if err := db.Where("id = ? AND driver_id = ? AND status = ?", requestID, driver.ID, "accepted").First(&delivery).Error; err == nil {
			txErr := db.Transaction(func(tx *gorm.DB) error {
				if err := tx.Model(&delivery).Updates(map[string]interface{}{"driver_id": nil, "status": "pending"}).Error; err != nil {
					return err
				}
				if err := tx.Model(&driver).Update("is_available", true).Error; err != nil {
					return err
				}
				safeNotify(tx, delivery.UserID, "Driver Unavailable", "Your delivery is being reassigned to another driver", "delivery_request")
				return nil
			})
			if txErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to reject delivery"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Delivery rejected and returned to pending", "id": delivery.ID, "type": "delivery"}, "timestamp": time.Now()})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "No accepted request found with this ID"})
	}
}

func DeclineRideRequest(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		requestID := c.Param("id")
		var ride models.Ride
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("id = ? AND status = ? AND driver_id = ?", requestID, "requested", driver.ID).
				First(&ride).Error; err != nil {
				return err
			}
			ride.Status = "cancelled"
			ride.DriverID = nil
			return tx.Save(&ride).Error
		})
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "Request not found or already handled"})
			return
		}
		rideIDStr := fmt.Sprintf("%d", ride.ID)
		tracker.Broadcast(rideIDStr, map[string]interface{}{
			"type":    "ride_declined",
			"ride_id": ride.ID,
		})
		safeNotify(db, ride.UserID, "Ride Declined", "The rider declined your request. Please select another rider.", "ride_request")
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Request declined"}})
	}
}

func GetDriverEarnings(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		now := time.Now()
		today := now.Truncate(24 * time.Hour)
		weekStart := now.AddDate(0, 0, -int(now.Weekday()))
		weekStart = weekStart.Truncate(24 * time.Hour)

		// Single query for all ride stats (total + today + week)
		var rideStats struct {
			TotalCount    int64
			TotalEarnings float64
			TodayCount    int64
			TodayEarnings float64
			WeekCount     int64
			WeekEarnings  float64
		}
		if err := db.Model(&models.Ride{}).Where("driver_id = ? AND status = ?", driver.ID, "completed").
			Select("COUNT(*) as total_count, COALESCE(SUM(final_fare), 0) as total_earnings, "+
				"COUNT(CASE WHEN completed_at >= ? THEN 1 END) as today_count, "+
				"COALESCE(SUM(CASE WHEN completed_at >= ? THEN final_fare ELSE 0 END), 0) as today_earnings, "+
				"COUNT(CASE WHEN completed_at >= ? THEN 1 END) as week_count, "+
				"COALESCE(SUM(CASE WHEN completed_at >= ? THEN final_fare ELSE 0 END), 0) as week_earnings", today, today, weekStart, weekStart).
			Row().Scan(&rideStats.TotalCount, &rideStats.TotalEarnings, &rideStats.TodayCount, &rideStats.TodayEarnings, &rideStats.WeekCount, &rideStats.WeekEarnings); err != nil {
			log.Printf("Failed to scan driver ride earnings: %v", err)
		}

		// Single query for all delivery stats (total + today + week)
		var deliveryStats struct {
			TotalCount    int64
			TotalEarnings float64
			TodayCount    int64
			TodayEarnings float64
			WeekCount     int64
			WeekEarnings  float64
		}
		if err := db.Model(&models.Delivery{}).Where("driver_id = ? AND status = ?", driver.ID, "completed").
			Select("COUNT(*) as total_count, COALESCE(SUM(delivery_fee), 0) as total_earnings, "+
				"COUNT(CASE WHEN completed_at >= ? THEN 1 END) as today_count, "+
				"COALESCE(SUM(CASE WHEN completed_at >= ? THEN delivery_fee ELSE 0 END), 0) as today_earnings, "+
				"COUNT(CASE WHEN completed_at >= ? THEN 1 END) as week_count, "+
				"COALESCE(SUM(CASE WHEN completed_at >= ? THEN delivery_fee ELSE 0 END), 0) as week_earnings", today, today, weekStart, weekStart).
			Row().Scan(&deliveryStats.TotalCount, &deliveryStats.TotalEarnings, &deliveryStats.TodayCount, &deliveryStats.TodayEarnings, &deliveryStats.WeekCount, &deliveryStats.WeekEarnings); err != nil {
			log.Printf("Failed to scan driver delivery earnings: %v", err)
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"total_earnings":          driver.TotalEarnings,
				"completed_rides":         driver.CompletedRides,
				"today_earnings":          rideStats.TodayEarnings + deliveryStats.TodayEarnings,
				"today_rides":             rideStats.TodayCount + deliveryStats.TodayCount,
				"rating":                  driver.Rating,
				"ride_earnings":           rideStats.TotalEarnings,
				"ride_count":              rideStats.TotalCount,
				"delivery_earnings":       deliveryStats.TotalEarnings,
				"delivery_count":          deliveryStats.TotalCount,
				"today_ride_earnings":     rideStats.TodayEarnings,
				"today_delivery_earnings": deliveryStats.TodayEarnings,
				"today_ride_count":        rideStats.TodayCount,
				"today_delivery_count":    deliveryStats.TodayCount,
				"week_ride_count":         rideStats.WeekCount,
				"week_ride_earnings":      rideStats.WeekEarnings,
				"week_delivery_count":     deliveryStats.WeekCount,
				"week_delivery_earnings":  deliveryStats.WeekEarnings,
			},
			"timestamp": now,
		})
	}
}

func SetAvailability(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Available bool    `json:"available"`
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		// Check if driver is verified before allowing online
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		if !driver.IsVerified && input.Available {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Your account is pending admin approval. You cannot go online yet."})
			return
		}
		updates := map[string]interface{}{"is_available": input.Available}
		if input.Latitude != 0 && input.Longitude != 0 {
			if input.Latitude < -90 || input.Latitude > 90 || input.Longitude < -180 || input.Longitude > 180 {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid coordinates"})
				return
			}
			updates["current_latitude"] = input.Latitude
			updates["current_longitude"] = input.Longitude
		}
		result := db.Model(&driver).Updates(updates)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update availability"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "No changes to availability"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"available": input.Available, "message": "Availability updated"}, "timestamp": time.Now()})
	}
}

func UpdateRideStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		var input struct {
			Status string `json:"status" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		validStatuses := map[string]bool{"driver_arrived": true, "picked_up": true, "in_progress": true, "completed": true}
		if !validStatuses[input.Status] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid status. Valid: driver_arrived, picked_up, in_progress, completed"})
			return
		}
		// Valid status transitions
		rideTransitions := map[string][]string{
			"accepted":       {"driver_arrived"},
			"driver_arrived": {"in_progress"},
			"in_progress":    {"completed"},
		}
		deliveryTransitions := map[string][]string{
			"accepted":       {"driver_arrived"},
			"driver_arrived": {"picked_up"},
			"picked_up":      {"in_progress"},
			"in_progress":    {"completed"},
		}
		rideID := c.Param("id")
		// Try ride first (within transaction + row lock to prevent race conditions)
		var ride models.Ride
		if err := db.Where("id = ? AND driver_id = ?", rideID, driver.ID).First(&ride).Error; err == nil {
			txErr := db.Transaction(func(tx *gorm.DB) error {
				// Re-fetch with row lock inside transaction
				if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", ride.ID).First(&ride).Error; err != nil {
					return err
				}
				// Validate ride status transition
				allowed := rideTransitions[ride.Status]
				validTransition := false
				for _, s := range allowed {
					if s == input.Status {
						validTransition = true
						break
					}
				}
				if !validTransition {
					c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid status transition from " + ride.Status + " to " + input.Status})
					return fmt.Errorf("HANDLED")
				}
				updates := map[string]interface{}{"status": input.Status}
				if input.Status == "in_progress" {
					now := time.Now()
					updates["started_at"] = &now
				}
				if input.Status == "completed" {
					now := time.Now()
					updates["completed_at"] = &now
					if ride.FinalFare == 0 {
						updates["final_fare"] = ride.EstimatedFare
					}
					if err := tx.Model(&driver).Updates(map[string]interface{}{
						"completed_rides": gorm.Expr("completed_rides + 1"),
						"total_earnings":  gorm.Expr("total_earnings + ?", ride.EstimatedFare),
						"is_available":    true,
					}).Error; err != nil {
						log.Printf("Failed to update driver stats for ride %d: %v", ride.ID, err)
					}
					// Record commission
					fare := ride.FinalFare
					if fare == 0 {
						fare = ride.EstimatedFare
					}
					if ride.DriverID != nil {
						createCommissionRecord(tx, "ride", ride.ID, *ride.DriverID, fare, ride.PaymentMethod)
					}
					// Process wallet payment inside same transaction
					if ride.PaymentMethod == "wallet" {
						var wallet models.Wallet
						if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", ride.UserID).First(&wallet).Error; err == nil {
							fare := ride.FinalFare
							if fare == 0 {
								fare = ride.EstimatedFare
							}
							if wallet.Balance >= fare {
								wallet.Balance -= fare
								if err := tx.Save(&wallet).Error; err != nil {
									log.Printf("Failed to save wallet for ride %d: %v", ride.ID, err)
									updates["payment_method"] = "cash"
								} else {
									if err := tx.Create(&models.WalletTransaction{
										WalletID: uintPtr(wallet.ID), UserID: ride.UserID, Type: "payment",
										Amount: fare, Description: "Ride payment #" + strconv.Itoa(int(ride.ID)),
										Reference: "RIDE-" + strconv.Itoa(int(ride.ID)),
									}).Error; err != nil {
										log.Printf("Failed to create wallet tx for ride %d, rolling back wallet: %v", ride.ID, err)
										wallet.Balance += fare
										if err := tx.Save(&wallet).Error; err != nil {
											log.Printf("CRITICAL: Failed to rollback wallet for ride %d: %v", ride.ID, err)
										}
										updates["payment_method"] = "cash"
									}
								}
							} else {
								updates["payment_method"] = "cash"
							}
						} else {
							updates["payment_method"] = "cash"
						}
					}
				}
				if err := tx.Model(&ride).Updates(updates).Error; err != nil {
					return err
				}
				// Notify user of ride status change
				var rideStatusTitle, rideStatusBody string
				switch input.Status {
				case "driver_arrived":
					rideStatusTitle = "Rider Arrived"
					rideStatusBody = "Your rider has arrived at the pickup location."
				case "in_progress":
					rideStatusTitle = "Trip Started"
					rideStatusBody = "Your ride is now in progress!"
				}
				if rideStatusTitle != "" {
					safeNotify(tx, ride.UserID, rideStatusTitle, rideStatusBody, "ride_update")
				}
				if input.Status == "completed" {
					finalFare := ride.FinalFare
					if finalFare == 0 {
						finalFare = ride.EstimatedFare
					}
					safeNotify(tx, ride.UserID, "Ride Completed", "Your ride has been completed. Fare: ₱"+strconv.FormatFloat(finalFare, 'f', 0, 64), "ride")
				}
				return nil
			})
			if txErr != nil {
				if txErr.Error() == "HANDLED" {
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update ride status"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Status updated", "status": input.Status, "id": ride.ID, "type": "ride"}, "timestamp": time.Now()})
			return
		}
		// Try delivery (within transaction + row lock to prevent race conditions)
		var delivery models.Delivery
		if err := db.Where("id = ? AND driver_id = ?", rideID, driver.ID).First(&delivery).Error; err == nil {
			txErr := db.Transaction(func(tx *gorm.DB) error {
				// Re-fetch with row lock inside transaction
				if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", delivery.ID).First(&delivery).Error; err != nil {
					return err
				}
				// Validate delivery status transition
				allowed := deliveryTransitions[delivery.Status]
				validTransition := false
				for _, s := range allowed {
					if s == input.Status {
						validTransition = true
						break
					}
				}
				if !validTransition {
					c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid status transition from " + delivery.Status + " to " + input.Status})
					return fmt.Errorf("HANDLED")
				}
				updates := map[string]interface{}{"status": input.Status}
				if input.Status == "in_progress" {
					now := time.Now()
					updates["started_at"] = &now
				}
				if input.Status == "completed" {
					now := time.Now()
					updates["completed_at"] = &now
					if err := tx.Model(&driver).Updates(map[string]interface{}{
						"completed_rides": gorm.Expr("completed_rides + 1"),
						"total_earnings":  gorm.Expr("total_earnings + ?", delivery.DeliveryFee),
						"is_available":    true,
					}).Error; err != nil {
						log.Printf("Failed to update driver stats for delivery %d: %v", delivery.ID, err)
					}
					// Record commission
					if delivery.DriverID != nil {
						createCommissionRecord(tx, "delivery", delivery.ID, *delivery.DriverID, delivery.DeliveryFee, delivery.PaymentMethod)
					}
					// Process wallet payment inside same transaction
					if delivery.PaymentMethod == "wallet" {
						var wallet models.Wallet
						if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", delivery.UserID).First(&wallet).Error; err == nil {
							fee := delivery.DeliveryFee
							if wallet.Balance >= fee {
								wallet.Balance -= fee
								if err := tx.Save(&wallet).Error; err != nil {
									log.Printf("Failed to save wallet for delivery %d: %v", delivery.ID, err)
									updates["payment_method"] = "cash"
								} else {
									if err := tx.Create(&models.WalletTransaction{
										WalletID: uintPtr(wallet.ID), UserID: delivery.UserID, Type: "payment",
										Amount: fee, Description: "Delivery payment #" + strconv.Itoa(int(delivery.ID)),
										Reference: "DEL-" + strconv.Itoa(int(delivery.ID)),
									}).Error; err != nil {
										log.Printf("Failed to create wallet tx for delivery %d, rolling back wallet: %v", delivery.ID, err)
										wallet.Balance += fee
										if err := tx.Save(&wallet).Error; err != nil {
											log.Printf("CRITICAL: Failed to rollback wallet for delivery %d: %v", delivery.ID, err)
										}
										updates["payment_method"] = "cash"
									}
								}
							} else {
								updates["payment_method"] = "cash"
							}
						} else {
							updates["payment_method"] = "cash"
						}
					}
				}
				if err := tx.Model(&delivery).Updates(updates).Error; err != nil {
					return err
				}
				// Notify user of delivery status change
				var delStatusTitle, delStatusBody string
				switch input.Status {
				case "driver_arrived":
					delStatusTitle = "Rider Arrived"
					delStatusBody = "Your rider has arrived at the pickup location."
				case "picked_up":
					delStatusTitle = "Item Picked Up"
					delStatusBody = "Your item has been picked up and is on its way."
				case "in_progress":
					delStatusTitle = "Delivery In Progress"
					delStatusBody = "Your delivery is now in progress!"
				}
				if delStatusTitle != "" {
					safeNotify(tx, delivery.UserID, delStatusTitle, delStatusBody, "delivery_update")
				}
				if input.Status == "completed" {
					safeNotify(tx, delivery.UserID, "Delivery Completed", "Your delivery has been completed. Fee: ₱"+strconv.FormatFloat(delivery.DeliveryFee, 'f', 0, 64), "delivery")
				}
				return nil
			})
			if txErr != nil {
				if txErr.Error() == "HANDLED" {
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update delivery status"})
				return
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Status updated", "status": input.Status, "id": delivery.ID, "type": "delivery"}, "timestamp": time.Now()})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Ride or delivery not found"})
	}
}

func GetRideHistory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var rides []models.Ride
		if err := db.Where("user_id = ? AND status IN ?", userID, []string{"completed", "cancelled"}).Preload("Driver").Preload("Driver.User").Order("created_at DESC").Limit(50).Find(&rides).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch ride history"})
			return
		}
		results := make([]gin.H, len(rides))
		for i, r := range rides {
			result := gin.H{"id": r.ID, "status": r.Status, "pickup_location": r.PickupLocation, "pickup_latitude": r.PickupLatitude, "pickup_longitude": r.PickupLongitude, "dropoff_location": r.DropoffLocation, "dropoff_latitude": r.DropoffLatitude, "dropoff_longitude": r.DropoffLongitude, "distance": r.Distance, "estimated_fare": r.EstimatedFare, "final_fare": r.FinalFare, "vehicle_type": r.VehicleType, "payment_method": r.PaymentMethod, "created_at": r.CreatedAt, "completed_at": r.CompletedAt}
			if r.Driver != nil {
				result["driver"] = gin.H{"id": r.Driver.ID, "name": r.Driver.User.Name, "phone": r.Driver.User.Phone, "rating": r.Driver.Rating, "vehicle_type": r.Driver.VehicleType, "vehicle_plate": r.Driver.VehiclePlate}
			}
			results[i] = result
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results, "timestamp": time.Now()})
	}
}

func GetDeliveryHistory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var deliveries []models.Delivery
		if err := db.Where("user_id = ? AND status IN ?", userID, []string{"completed", "cancelled"}).Preload("Driver").Preload("Driver.User").Order("created_at DESC").Limit(50).Find(&deliveries).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch delivery history"})
			return
		}
		results := make([]gin.H, len(deliveries))
		for i, d := range deliveries {
			result := gin.H{"id": d.ID, "status": d.Status, "pickup_location": d.PickupLocation, "pickup_latitude": d.PickupLatitude, "pickup_longitude": d.PickupLongitude, "dropoff_location": d.DropoffLocation, "dropoff_latitude": d.DropoffLatitude, "dropoff_longitude": d.DropoffLongitude, "distance": d.Distance, "delivery_fee": d.DeliveryFee, "payment_method": d.PaymentMethod, "item_description": d.ItemDescription, "created_at": d.CreatedAt, "completed_at": d.CompletedAt}
			if d.Driver != nil {
				result["driver"] = gin.H{"id": d.Driver.ID, "name": d.Driver.User.Name, "phone": d.Driver.User.Phone, "rating": d.Driver.Rating, "vehicle_type": d.Driver.VehicleType, "vehicle_plate": d.Driver.VehiclePlate}
			}
			results[i] = result
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results, "timestamp": time.Now()})
	}
}

// ===== CHAT HANDLERS =====

func GetChatMessages(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		rideID := c.Param("id")
		var messages []models.ChatMessage
		if err := db.Where("ride_id = ? AND (sender_id = ? OR receiver_id = ?)", rideID, userID, userID).Order("created_at ASC").Find(&messages).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch messages"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": messages, "timestamp": time.Now()})
	}
}

func SendChatMessage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			ReceiverID uint   `json:"receiver_id" binding:"required"`
			Message    string `json:"message" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		rideIDStr := c.Param("id")
		rideIDParsed, err := strconv.ParseUint(rideIDStr, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid ride ID"})
			return
		}
		rideIDUint := uint(rideIDParsed)
		msg := models.ChatMessage{SenderID: uintPtr(userID), ReceiverID: uintPtr(input.ReceiverID), RideID: &rideIDUint, Message: input.Message}
		if err := db.Create(&msg).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to send message"})
			return
		}
		// Broadcast to WebSocket chat room
		chatTracker.Broadcast(rideIDStr, gin.H{
			"type":        "chat_message",
			"id":          msg.ID,
			"sender_id":   msg.SenderID,
			"receiver_id": msg.ReceiverID,
			"message":     msg.Message,
			"created_at":  msg.CreatedAt,
		})

		// Send push notification to receiver
		var receiverToken models.PushToken
		if err := db.Where("user_id = ?", input.ReceiverID).First(&receiverToken).Error; err == nil {
			// Look up sender name
			var sender models.User
			senderName := "New message"
			if err := db.Select("name").First(&sender, userID).Error; err == nil && sender.Name != "" {
				senderName = sender.Name
			}
			// Truncate message to 100 chars
			notifBody := input.Message
			if len(notifBody) > 100 {
				notifBody = notifBody[:100] + "..."
			}
			sendExpoPushNotification(receiverToken.Token, senderName, notifBody, map[string]interface{}{
				"type":     "chat",
				"rideId":   rideIDUint,
				"senderId": userID,
			})
		}

		c.JSON(http.StatusCreated, gin.H{"success": true, "data": msg, "timestamp": time.Now()})
	}
}

// ===== USER NOTIFICATION HANDLERS =====

func GetUserNotifications(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var notifications []models.Notification
		if err := db.Where("user_id = ?", userID).Order("created_at DESC").Limit(50).Find(&notifications).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch notifications"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": notifications, "timestamp": time.Now()})
	}
}

func MarkNotificationRead(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		id := c.Param("id")
		result := db.Model(&models.Notification{}).Where("id = ? AND user_id = ?", id, userID).Update("read", true)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to mark notification as read"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Notification not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Marked as read"}, "timestamp": time.Now()})
	}
}

// ===== ADMIN HANDLERS =====

func GetAllUsers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 100
		if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 500 {
			limit = l
		}
		offset := 0
		if o, err := strconv.Atoi(c.Query("offset")); err == nil && o > 0 {
			offset = o
		}
		var users []models.User
		var total int64
		db.Model(&models.User{}).Count(&total)
		if err := db.Order("created_at DESC").Limit(limit).Offset(offset).Find(&users).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch users"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": users, "count": len(users), "total": total, "timestamp": time.Now()})
	}
}

func GetUserByID(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var user models.User
		if err := db.First(&user, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": user, "timestamp": time.Now()})
	}
}

func DeleteUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid ID"})
			return
		}
		// Verify user exists
		var user models.User
		if err := db.First(&user, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
			return
		}
		// Delete in transaction to handle foreign key constraints
		if err := db.Transaction(func(tx *gorm.DB) error {
			uid := uint(id)
			// Nullify user references on historical records (preserve history)
			// Use raw SQL with NULL (not 0) to avoid FK violations
			if err := tx.Exec("UPDATE rides SET user_id = NULL WHERE user_id = ?", uid).Error; err != nil {
				return err
			}
			if err := tx.Exec("UPDATE deliveries SET user_id = NULL WHERE user_id = ?", uid).Error; err != nil {
				return err
			}
			if err := tx.Exec("UPDATE orders SET user_id = NULL WHERE user_id = ?", uid).Error; err != nil {
				return err
			}
			if err := tx.Exec("UPDATE chat_messages SET sender_id = NULL WHERE sender_id = ?", uid).Error; err != nil {
				return err
			}
			if err := tx.Exec("UPDATE chat_messages SET receiver_id = NULL WHERE receiver_id = ?", uid).Error; err != nil {
				return err
			}
			if err := tx.Exec("UPDATE wallet_transactions SET user_id = NULL, wallet_id = NULL WHERE user_id = ?", uid).Error; err != nil {
				return err
			}
			// Nullify rideshare references
			if err := tx.Exec("UPDATE ride_shares SET driver_id = NULL WHERE driver_id IN (SELECT id FROM drivers WHERE user_id = ?)", uid).Error; err != nil {
				return err
			}
			// Delete owned records
			if err := tx.Where("user_id = ?", uid).Delete(&models.SavedAddress{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ?", uid).Delete(&models.PaymentMethod{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ?", uid).Delete(&models.Notification{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ?", uid).Delete(&models.Favorite{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ?", uid).Delete(&models.PushToken{}).Error; err != nil {
				return err
			}
			if err := tx.Where("user_id = ?", uid).Delete(&models.Wallet{}).Error; err != nil {
				return err
			}
			if err := tx.Where("referrer_id = ? OR referred_id = ?", uid, uid).Delete(&models.Referral{}).Error; err != nil {
				return err
			}
			// Delete driver record if exists
			var driver models.Driver
			if tx.Where("user_id = ?", uid).First(&driver).Error == nil {
				if err := tx.Model(&models.Ride{}).Where("driver_id = ?", driver.ID).Update("driver_id", nil).Error; err != nil {
					return err
				}
				if err := tx.Model(&models.Delivery{}).Where("driver_id = ?", driver.ID).Update("driver_id", nil).Error; err != nil {
					return err
				}
				if err := tx.Where("driver_id = ?", driver.ID).Delete(&models.CommissionRecord{}).Error; err != nil {
					return err
				}
				if err := tx.Where("driver_id = ?", driver.ID).Delete(&models.WithdrawalRequest{}).Error; err != nil {
					return err
				}
				if err := tx.Delete(&driver).Error; err != nil {
					return err
				}
			}
			// Delete user
			return tx.Delete(&user).Error
		}); err != nil {
			log.Printf("Failed to delete user %d: %v", id, err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete user"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "User deleted"}, "timestamp": time.Now()})
	}
}

func GetAllDrivers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 100
		if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 500 {
			limit = l
		}
		offset := 0
		if o, err := strconv.Atoi(c.Query("offset")); err == nil && o > 0 {
			offset = o
		}
		var drivers []models.Driver
		var total int64
		db.Model(&models.Driver{}).Count(&total)
		if err := db.Preload("User").Order("created_at DESC").Limit(limit).Offset(offset).Find(&drivers).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch drivers"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": drivers, "count": len(drivers), "total": total, "timestamp": time.Now()})
	}
}

func VerifyDriver(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var driver models.Driver
		if err := db.Where("id = ?", c.Param("id")).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		// Verify the driver
		if err := db.Model(&driver).Update("is_verified", true).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to verify driver"})
			return
		}
		// Update user role to driver so they can access the rider dashboard
		if err := db.Model(&models.User{}).Where("id = ?", driver.UserID).Update("role", "driver").Error; err != nil {
			log.Printf("Failed to update user role for driver %d (user %d): %v", driver.ID, driver.UserID, err)
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Driver verified and approved"}, "timestamp": time.Now()})
	}
}

func DeleteDriver(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid ID"})
			return
		}
		var driver models.Driver
		if err := db.First(&driver, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		if err := db.Transaction(func(tx *gorm.DB) error {
			did := uint(id)
			// Nullify driver references on historical records
			if err := tx.Model(&models.Ride{}).Where("driver_id = ?", did).Update("driver_id", nil).Error; err != nil {
				return err
			}
			if err := tx.Model(&models.Delivery{}).Where("driver_id = ?", did).Update("driver_id", nil).Error; err != nil {
				return err
			}
			// Nullify rideshare references
			if err := tx.Exec("UPDATE ride_shares SET driver_id = NULL WHERE driver_id = ?", did).Error; err != nil {
				return err
			}
			// Delete owned records
			if err := tx.Where("driver_id = ?", did).Delete(&models.CommissionRecord{}).Error; err != nil {
				return err
			}
			if err := tx.Where("driver_id = ?", did).Delete(&models.WithdrawalRequest{}).Error; err != nil {
				return err
			}
			return tx.Delete(&driver).Error
		}); err != nil {
			log.Printf("Failed to delete driver %d: %v", id, err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete driver"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Driver deleted"}, "timestamp": time.Now()})
	}
}

// ===== ADMIN STORE HANDLERS =====

func AdminGetAllStores(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 100
		if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 500 {
			limit = l
		}
		offset := 0
		if o, err := strconv.Atoi(c.Query("offset")); err == nil && o > 0 {
			offset = o
		}
		var stores []models.Store
		var total int64
		db.Model(&models.Store{}).Count(&total)
		if err := db.Order("created_at DESC").Limit(limit).Offset(offset).Find(&stores).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch stores"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": stores, "count": len(stores), "total": total, "timestamp": time.Now()})
	}
}

func CreateStore(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var store models.Store
		if err := c.ShouldBindJSON(&store); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if store.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Store name is required"})
			return
		}
		if store.Address == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Store address is required"})
			return
		}
		if err := db.Create(&store).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create store"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": store, "timestamp": time.Now()})
	}
}

func UpdateStore(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var store models.Store
		if err := db.First(&store, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Store not found"})
			return
		}
		var input map[string]interface{}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		// Remove protected fields to prevent mass assignment
		for _, f := range []string{"id", "ID", "created_at", "CreatedAt", "user_id", "UserID"} {
			delete(input, f)
		}
		if err := db.Model(&store).Updates(input).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update store"})
			return
		}
		if err := db.First(&store, store.ID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to retrieve updated record"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": store, "timestamp": time.Now()})
	}
}

func DeleteStore(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid ID"})
			return
		}
		var store models.Store
		if err := db.First(&store, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Store not found"})
			return
		}
		if err := db.Transaction(func(tx *gorm.DB) error {
			sid := uint(id)
			// Nullify store references on historical orders (use NULL not 0 to avoid FK violation)
			if err := tx.Exec("UPDATE orders SET store_id = NULL WHERE store_id = ?", sid).Error; err != nil {
				return err
			}
			// Delete owned records
			if err := tx.Where("store_id = ?", sid).Delete(&models.MenuItem{}).Error; err != nil {
				return err
			}
			// Delete favorites referencing this store
			if err := tx.Where("type = ? AND item_id = ?", "store", sid).Delete(&models.Favorite{}).Error; err != nil {
				return err
			}
			return tx.Delete(&store).Error
		}); err != nil {
			log.Printf("Failed to delete store %d: %v", id, err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete store"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Store deleted"}, "timestamp": time.Now()})
	}
}

// ===== ANALYTICS HANDLERS =====

func GetRidesAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var stats struct {
			Total        int64
			Completed    int64
			Cancelled    int64
			Active       int64
			TotalRevenue float64
		}
		if err := db.Model(&models.Ride{}).Select(
			"COUNT(*) as total, "+
				"COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed, "+
				"COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled, "+
				"COUNT(CASE WHEN status IN ('pending','accepted','in_progress') THEN 1 END) as active, "+
				"COALESCE(SUM(CASE WHEN status = 'completed' THEN final_fare ELSE 0 END), 0) as total_revenue").
			Row().Scan(&stats.Total, &stats.Completed, &stats.Cancelled, &stats.Active, &stats.TotalRevenue); err != nil {
			log.Printf("Failed to scan rides analytics: %v", err)
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"total": stats.Total, "completed": stats.Completed, "cancelled": stats.Cancelled, "active": stats.Active, "total_revenue": stats.TotalRevenue}, "timestamp": time.Now()})
	}
}

func GetDeliveriesAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var stats struct {
			Total        int64
			Completed    int64
			Cancelled    int64
			TotalRevenue float64
		}
		if err := db.Model(&models.Delivery{}).Select(
			"COUNT(*) as total, "+
				"COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed, "+
				"COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled, "+
				"COALESCE(SUM(CASE WHEN status = 'completed' THEN delivery_fee ELSE 0 END), 0) as total_revenue").
			Row().Scan(&stats.Total, &stats.Completed, &stats.Cancelled, &stats.TotalRevenue); err != nil {
			log.Printf("Failed to scan deliveries analytics: %v", err)
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"total": stats.Total, "completed": stats.Completed, "cancelled": stats.Cancelled, "total_revenue": stats.TotalRevenue}, "timestamp": time.Now()})
	}
}

func GetOrdersAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var stats struct {
			Total        int64
			Delivered    int64
			Cancelled    int64
			TotalRevenue float64
		}
		if err := db.Model(&models.Order{}).Select(
			"COUNT(*) as total, "+
				"COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered, "+
				"COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled, "+
				"COALESCE(SUM(CASE WHEN status = 'delivered' THEN total_amount ELSE 0 END), 0) as total_revenue").
			Row().Scan(&stats.Total, &stats.Delivered, &stats.Cancelled, &stats.TotalRevenue); err != nil {
			log.Printf("Failed to scan orders analytics: %v", err)
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"total": stats.Total, "delivered": stats.Delivered, "cancelled": stats.Cancelled, "total_revenue": stats.TotalRevenue}, "timestamp": time.Now()})
	}
}

func GetEarningsAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var rideRevenue, deliveryRevenue, orderRevenue float64
		if err := db.Model(&models.Ride{}).Where("status = ?", "completed").Select("COALESCE(SUM(final_fare), 0)").Row().Scan(&rideRevenue); err != nil {
			log.Printf("Failed to scan ride revenue: %v", err)
		}
		if err := db.Model(&models.Delivery{}).Where("status = ?", "completed").Select("COALESCE(SUM(delivery_fee), 0)").Row().Scan(&deliveryRevenue); err != nil {
			log.Printf("Failed to scan delivery revenue: %v", err)
		}
		if err := db.Model(&models.Order{}).Where("status = ?", "delivered").Select("COALESCE(SUM(total_amount), 0)").Row().Scan(&orderRevenue); err != nil {
			log.Printf("Failed to scan order revenue: %v", err)
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"ride_revenue": rideRevenue, "delivery_revenue": deliveryRevenue, "order_revenue": orderRevenue, "total_revenue": rideRevenue + deliveryRevenue + orderRevenue}, "timestamp": time.Now()})
	}
}

// GetMonthlyRevenue returns monthly revenue data for the last 12 months
func GetMonthlyRevenue(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		type MonthlyData struct {
			Month   string  `json:"month"`
			Revenue float64 `json:"revenue"`
		}

		now := time.Now()
		startDate := time.Date(now.Year(), now.Month()-11, 1, 0, 0, 0, 0, time.UTC)

		// One query per table, grouped by month
		type monthRow struct {
			M       string
			Revenue float64
		}
		revenueMap := make(map[string]float64)

		var rideRows []monthRow
		if err := db.Model(&models.Ride{}).Where("status = ? AND created_at >= ?", "completed", startDate).
			Select("TO_CHAR(created_at, 'YYYY-MM') as m, COALESCE(SUM(final_fare), 0) as revenue").
			Group("m").Scan(&rideRows).Error; err != nil {
			log.Printf("Failed to scan monthly ride revenue: %v", err)
		}
		for _, r := range rideRows {
			revenueMap[r.M] += r.Revenue
		}

		var delRows []monthRow
		if err := db.Model(&models.Delivery{}).Where("status = ? AND created_at >= ?", "completed", startDate).
			Select("TO_CHAR(created_at, 'YYYY-MM') as m, COALESCE(SUM(delivery_fee), 0) as revenue").
			Group("m").Scan(&delRows).Error; err != nil {
			log.Printf("Failed to scan monthly delivery revenue: %v", err)
		}
		for _, r := range delRows {
			revenueMap[r.M] += r.Revenue
		}

		var ordRows []monthRow
		if err := db.Model(&models.Order{}).Where("status = ? AND created_at >= ?", "delivered", startDate).
			Select("TO_CHAR(created_at, 'YYYY-MM') as m, COALESCE(SUM(total_amount), 0) as revenue").
			Group("m").Scan(&ordRows).Error; err != nil {
			log.Printf("Failed to scan monthly order revenue: %v", err)
		}
		for _, r := range ordRows {
			revenueMap[r.M] += r.Revenue
		}

		// Build result for last 12 months in order
		monthlyRevenue := make([]MonthlyData, 0, 12)
		for i := 11; i >= 0; i-- {
			monthStart := time.Date(now.Year(), now.Month()-time.Month(i), 1, 0, 0, 0, 0, time.UTC)
			key := monthStart.Format("2006-01")
			monthlyRevenue = append(monthlyRevenue, MonthlyData{
				Month:   monthStart.Format("Jan"),
				Revenue: revenueMap[key],
			})
		}

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      monthlyRevenue,
			"timestamp": time.Now(),
		})
	}
}

// GetGrowthAnalytics returns monthly growth data for users, drivers, and orders
func GetGrowthAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		type GrowthData struct {
			Month   string `json:"month"`
			Users   int64  `json:"users"`
			Drivers int64  `json:"drivers"`
			Orders  int64  `json:"orders"`
		}

		now := time.Now()
		startDate := time.Date(now.Year(), now.Month()-11, 1, 0, 0, 0, 0, time.UTC)

		type monthCount struct {
			M     string
			Count int64
		}

		// One query per table, grouped by month
		userMap := make(map[string]int64)
		var userRows []monthCount
		if err := db.Model(&models.User{}).Where("created_at >= ? AND role = ?", startDate, "user").
			Select("TO_CHAR(created_at, 'YYYY-MM') as m, COUNT(*) as count").
			Group("m").Scan(&userRows).Error; err != nil {
			log.Printf("Failed to scan user growth analytics: %v", err)
		}
		for _, r := range userRows {
			userMap[r.M] = r.Count
		}

		driverMap := make(map[string]int64)
		var driverRows []monthCount
		if err := db.Model(&models.Driver{}).Where("created_at >= ?", startDate).
			Select("TO_CHAR(created_at, 'YYYY-MM') as m, COUNT(*) as count").
			Group("m").Scan(&driverRows).Error; err != nil {
			log.Printf("Failed to scan driver growth analytics: %v", err)
		}
		for _, r := range driverRows {
			driverMap[r.M] = r.Count
		}

		orderMap := make(map[string]int64)
		var orderRows []monthCount
		if err := db.Model(&models.Order{}).Where("created_at >= ?", startDate).
			Select("TO_CHAR(created_at, 'YYYY-MM') as m, COUNT(*) as count").
			Group("m").Scan(&orderRows).Error; err != nil {
			log.Printf("Failed to scan order growth analytics: %v", err)
		}
		for _, r := range orderRows {
			orderMap[r.M] = r.Count
		}

		growthData := make([]GrowthData, 0, 12)
		for i := 11; i >= 0; i-- {
			monthStart := time.Date(now.Year(), now.Month()-time.Month(i), 1, 0, 0, 0, 0, time.UTC)
			key := monthStart.Format("2006-01")
			growthData = append(growthData, GrowthData{
				Month:   monthStart.Format("Jan"),
				Users:   userMap[key],
				Drivers: driverMap[key],
				Orders:  orderMap[key],
			})
		}

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      growthData,
			"timestamp": time.Now(),
		})
	}
}

// ===== EXTENDED ANALYTICS =====

func AdminGetExtendedAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var totalReferrals int64
		db.Model(&models.Referral{}).Count(&totalReferrals)

		type bonusSum struct {
			Total float64
		}
		var bs bonusSum
		db.Model(&models.Referral{}).Select("COALESCE(SUM(referrer_bonus + referred_bonus), 0) as total").Scan(&bs)

		var pendingWithdrawals int64
		db.Model(&models.WithdrawalRequest{}).Where("status = ?", "pending").Count(&pendingWithdrawals)

		var pendingWithdrawalAmount float64
		db.Model(&models.WithdrawalRequest{}).Where("status = ?", "pending").Select("COALESCE(SUM(amount), 0)").Scan(&pendingWithdrawalAmount)

		var totalWithdrawn float64
		db.Model(&models.WithdrawalRequest{}).Where("status = ?", "completed").Select("COALESCE(SUM(amount), 0)").Scan(&totalWithdrawn)

		var scheduledRides int64
		db.Model(&models.Ride{}).Where("scheduled_at IS NOT NULL AND status = ?", "scheduled").Count(&scheduledRides)

		var activeAnnouncements int64
		db.Model(&models.Announcement{}).Where("is_active = ?", true).Count(&activeAnnouncements)

		todayStart := time.Now().Truncate(24 * time.Hour)
		var todayChatMessages int64
		db.Model(&models.ChatMessage{}).Where("created_at >= ?", todayStart).Count(&todayChatMessages)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"total_referrals":           totalReferrals,
				"referral_bonuses_paid":     bs.Total,
				"pending_withdrawals":       pendingWithdrawals,
				"pending_withdrawal_amount": pendingWithdrawalAmount,
				"total_withdrawn":           totalWithdrawn,
				"scheduled_rides":           scheduledRides,
				"active_announcements":      activeAnnouncements,
				"total_chat_messages":       todayChatMessages,
			},
		})
	}
}

// ===== PROMO ADMIN HANDLERS =====

func GetAllPromos(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 100
		if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 500 {
			limit = l
		}
		offset := 0
		if o, err := strconv.Atoi(c.Query("offset")); err == nil && o > 0 {
			offset = o
		}
		var promos []models.Promo
		var total int64
		db.Model(&models.Promo{}).Count(&total)
		if err := db.Order("created_at DESC").Limit(limit).Offset(offset).Find(&promos).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch promos"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": promos, "count": len(promos), "total": total, "timestamp": time.Now()})
	}
}

func CreatePromo(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var promo models.Promo
		if err := c.ShouldBindJSON(&promo); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if promo.Code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Promo code is required"})
			return
		}
		if promo.DiscountValue < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Discount value cannot be negative"})
			return
		}
		if promo.DiscountType == "percentage" && promo.DiscountValue > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Percentage discount cannot exceed 100"})
			return
		}
		if promo.MaxDiscount < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Max discount cannot be negative"})
			return
		}
		if err := db.Create(&promo).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create promo"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": promo, "timestamp": time.Now()})
	}
}

func UpdatePromo(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var promo models.Promo
		if err := db.First(&promo, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Promo not found"})
			return
		}
		var input map[string]interface{}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		// Remove protected fields to prevent mass assignment
		for _, f := range []string{"id", "ID", "created_at", "CreatedAt", "usage_count", "UsageCount"} {
			delete(input, f)
		}
		if err := db.Model(&promo).Updates(input).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update promo"})
			return
		}
		if err := db.First(&promo, promo.ID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to retrieve updated record"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": promo, "timestamp": time.Now()})
	}
}

func DeletePromo(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid ID"})
			return
		}
		var promo models.Promo
		if err := db.First(&promo, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Promo not found"})
			return
		}
		if err := db.Transaction(func(tx *gorm.DB) error {
			pid := uint(id)
			// Nullify promo references on historical records
			if err := tx.Model(&models.Ride{}).Where("promo_id = ?", pid).Update("promo_id", nil).Error; err != nil {
				return err
			}
			if err := tx.Model(&models.Delivery{}).Where("promo_id = ?", pid).Update("promo_id", nil).Error; err != nil {
				return err
			}
			if err := tx.Model(&models.Order{}).Where("promo_id = ?", pid).Update("promo_id", nil).Error; err != nil {
				return err
			}
			return tx.Delete(&promo).Error
		}); err != nil {
			log.Printf("Failed to delete promo %d: %v", id, err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete promo"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Promo deleted"}, "timestamp": time.Now()})
	}
}

// ===== ADMIN LIST HANDLERS =====

// AdminGetAllRides returns all rides with user and driver details
func AdminGetAllRides(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 100
		if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 500 {
			limit = l
		}
		offset := 0
		if o, err := strconv.Atoi(c.Query("offset")); err == nil && o > 0 {
			offset = o
		}
		var rides []models.Ride
		var total int64
		db.Model(&models.Ride{}).Count(&total)
		if err := db.Preload("User").Preload("Driver").Preload("Driver.User").Order("created_at DESC").Limit(limit).Offset(offset).Find(&rides).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch rides"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": rides, "count": len(rides), "total": total, "timestamp": time.Now()})
	}
}

// AdminGetAllDeliveries returns all deliveries with user and driver details
func AdminGetAllDeliveries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 100
		if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 500 {
			limit = l
		}
		offset := 0
		if o, err := strconv.Atoi(c.Query("offset")); err == nil && o > 0 {
			offset = o
		}
		var deliveries []models.Delivery
		var total int64
		db.Model(&models.Delivery{}).Count(&total)
		if err := db.Preload("User").Preload("Driver").Preload("Driver.User").Order("created_at DESC").Limit(limit).Offset(offset).Find(&deliveries).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch deliveries"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": deliveries, "count": len(deliveries), "total": total, "timestamp": time.Now()})
	}
}

// AdminGetAllOrders returns all orders with user and store details
func AdminGetAllOrders(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 100
		if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 500 {
			limit = l
		}
		offset := 0
		if o, err := strconv.Atoi(c.Query("offset")); err == nil && o > 0 {
			offset = o
		}
		var orders []models.Order
		var total int64
		db.Model(&models.Order{}).Count(&total)
		if err := db.Preload("User").Preload("Store").Order("created_at DESC").Limit(limit).Offset(offset).Find(&orders).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch orders"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": orders, "count": len(orders), "total": total, "timestamp": time.Now()})
	}
}

// AdminGetActivityLogs returns recent activity across all services
func AdminGetActivityLogs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		type ActivityLog struct {
			ID        uint      `json:"id"`
			Type      string    `json:"type"`
			Action    string    `json:"action"`
			UserName  string    `json:"user_name"`
			UserEmail string    `json:"user_email"`
			Details   string    `json:"details"`
			Status    string    `json:"status"`
			Amount    float64   `json:"amount"`
			CreatedAt time.Time `json:"created_at"`
		}

		var logs []ActivityLog

		// Get recent rides
		var rides []models.Ride
		if err := db.Preload("User").Order("created_at DESC").Limit(50).Find(&rides).Error; err != nil {
			log.Printf("Failed to fetch rides for activity logs: %v", err)
		}
		for _, r := range rides {
			action := "booked a ride"
			if r.Status == "completed" {
				action = "completed a ride"
			} else if r.Status == "cancelled" {
				action = "cancelled a ride"
			} else if r.Status == "accepted" {
				action = "ride accepted by driver"
			}
			logs = append(logs, ActivityLog{
				ID: r.ID, Type: "ride", Action: action,
				UserName: r.User.Name, UserEmail: r.User.Email,
				Details:  r.PickupLocation + " → " + r.DropoffLocation,
				Status:   r.Status, Amount: r.EstimatedFare,
				CreatedAt: r.CreatedAt,
			})
		}

		// Get recent deliveries
		var deliveries []models.Delivery
		if err := db.Preload("User").Order("created_at DESC").Limit(50).Find(&deliveries).Error; err != nil {
			log.Printf("Failed to fetch deliveries for activity logs: %v", err)
		}
		for _, d := range deliveries {
			action := "requested a delivery"
			if d.Status == "completed" {
				action = "delivery completed"
			} else if d.Status == "cancelled" {
				action = "cancelled a delivery"
			}
			logs = append(logs, ActivityLog{
				ID: d.ID, Type: "delivery", Action: action,
				UserName: d.User.Name, UserEmail: d.User.Email,
				Details:  d.ItemDescription + " — " + d.PickupLocation + " → " + d.DropoffLocation,
				Status:   d.Status, Amount: d.DeliveryFee,
				CreatedAt: d.CreatedAt,
			})
		}

		// Get recent orders
		var orders []models.Order
		if err := db.Preload("User").Preload("Store").Order("created_at DESC").Limit(50).Find(&orders).Error; err != nil {
			log.Printf("Failed to fetch orders for activity logs: %v", err)
		}
		for _, o := range orders {
			action := "placed an order"
			if o.Status == "delivered" {
				action = "order delivered"
			} else if o.Status == "cancelled" {
				action = "cancelled an order"
			}
			storeName := ""
			if o.Store.Name != "" {
				storeName = " from " + o.Store.Name
			}
			logs = append(logs, ActivityLog{
				ID: o.ID, Type: "order", Action: action,
				UserName: o.User.Name, UserEmail: o.User.Email,
				Details:  "Order" + storeName + " — " + o.DeliveryLocation,
				Status:   o.Status, Amount: o.TotalAmount,
				CreatedAt: o.CreatedAt,
			})
		}

		// Get recent user registrations
		var users []models.User
		if err := db.Where("role = ?", "user").Order("created_at DESC").Limit(30).Find(&users).Error; err != nil {
			log.Printf("Failed to fetch users for activity logs: %v", err)
		}
		for _, u := range users {
			logs = append(logs, ActivityLog{
				ID: u.ID, Type: "user", Action: "registered",
				UserName: u.Name, UserEmail: u.Email,
				Details: "New user registration", Status: "completed",
				CreatedAt: u.CreatedAt,
			})
		}

		// Get recent driver registrations
		var drivers []models.Driver
		if err := db.Preload("User").Order("created_at DESC").Limit(30).Find(&drivers).Error; err != nil {
			log.Printf("Failed to fetch drivers for activity logs: %v", err)
		}
		for _, d := range drivers {
			action := "registered as driver"
			status := "pending"
			if d.IsVerified {
				action = "verified as driver"
				status = "approved"
			}
			logs = append(logs, ActivityLog{
				ID: d.ID, Type: "driver", Action: action,
				UserName: d.User.Name, UserEmail: d.User.Email,
				Details:  d.VehicleType + " — " + d.VehiclePlate,
				Status:   status,
				CreatedAt: d.CreatedAt,
			})
		}

		// Sort by created_at DESC
		sort.Slice(logs, func(i, j int) bool {
			return logs[i].CreatedAt.After(logs[j].CreatedAt)
		})

		// Limit to 100 most recent
		if len(logs) > 100 {
			logs = logs[:100]
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": logs, "count": len(logs), "timestamp": time.Now()})
	}
}

// AdminGetNotifications returns all admin notifications
func AdminGetNotifications(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 100
		if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 500 {
			limit = l
		}
		var notifications []models.Notification
		if err := db.Order("created_at DESC").Limit(limit).Find(&notifications).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch notifications"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": notifications, "count": len(notifications), "timestamp": time.Now()})
	}
}

// AdminSendNotification creates a notification
func AdminSendNotification(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Title      string `json:"title" binding:"required"`
			Message    string `json:"message" binding:"required"`
			Type       string `json:"type"`
			TargetType string `json:"target_type"` // all, users, drivers
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		notifType := input.Type
		if notifType == "" {
			notifType = "announcement"
		}

		// Get target user IDs efficiently using Pluck
		var userIDs []uint
		switch input.TargetType {
		case "drivers":
			if err := db.Model(&models.Driver{}).Pluck("user_id", &userIDs).Error; err != nil {
				log.Printf("Failed to pluck driver user IDs: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch driver list"})
				return
			}
		case "users":
			if err := db.Model(&models.User{}).Where("role = ?", "user").Pluck("id", &userIDs).Error; err != nil {
				log.Printf("Failed to pluck user IDs: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch user list"})
				return
			}
		default: // all
			if err := db.Model(&models.User{}).Pluck("id", &userIDs).Error; err != nil {
				log.Printf("Failed to pluck all user IDs: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch user list"})
				return
			}
		}

		notifications := make([]models.Notification, len(userIDs))
		for i, uid := range userIDs {
			notifications[i] = models.Notification{
				UserID: uid,
				Title:  input.Title,
				Body:   input.Message,
				Type:   notifType,
			}
		}
		sentCount := 0
		if len(notifications) > 0 {
			if err := db.CreateInBatches(&notifications, 100).Error; err != nil {
				log.Printf("Failed to send notifications: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to send notifications"})
				return
			}
			sentCount = len(notifications)
		}

		c.JSON(http.StatusCreated, gin.H{
			"success": true,
			"data": gin.H{
				"message":    "Notification sent",
				"sent_count": sentCount,
				"title":      input.Title,
				"type":       input.TargetType,
			},
			"timestamp": time.Now(),
		})
	}
}

// AdminUpdateRideStatus allows admin to update ride status
func AdminUpdateRideStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var ride models.Ride
		if err := db.First(&ride, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Ride not found"})
			return
		}
		var input struct {
			Status string `json:"status" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		validRideStatuses := map[string]bool{"scheduled": true, "pending": true, "accepted": true, "driver_arrived": true, "in_progress": true, "completed": true, "cancelled": true}
		if !validRideStatuses[input.Status] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid status. Must be one of: scheduled, pending, accepted, driver_arrived, in_progress, completed, cancelled"})
			return
		}
		// Prevent modifying terminal statuses
		if ride.Status == "completed" && input.Status != "completed" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Cannot change status of a completed ride"})
			return
		}
		if ride.Status == "cancelled" && input.Status != "cancelled" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Cannot change status of a cancelled ride"})
			return
		}
		ride.Status = input.Status
		if input.Status == "completed" {
			now := time.Now()
			ride.CompletedAt = &now
			ride.FinalFare = ride.EstimatedFare
		}
		if err := db.Save(&ride).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update ride status"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": ride, "timestamp": time.Now()})
	}
}

// AdminUpdateDeliveryStatus allows admin to update delivery status
func AdminUpdateDeliveryStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var delivery models.Delivery
		if err := db.First(&delivery, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Delivery not found"})
			return
		}
		var input struct {
			Status string `json:"status" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		validDeliveryStatuses := map[string]bool{"pending": true, "accepted": true, "driver_arrived": true, "picked_up": true, "in_progress": true, "completed": true, "cancelled": true}
		if !validDeliveryStatuses[input.Status] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid status. Must be one of: pending, accepted, driver_arrived, picked_up, in_progress, completed, cancelled"})
			return
		}
		// Prevent modifying terminal statuses
		if delivery.Status == "completed" && input.Status != "completed" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Cannot change status of a completed delivery"})
			return
		}
		if delivery.Status == "cancelled" && input.Status != "cancelled" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Cannot change status of a cancelled delivery"})
			return
		}
		delivery.Status = input.Status
		if input.Status == "completed" {
			now := time.Now()
			delivery.CompletedAt = &now
		}
		if err := db.Save(&delivery).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update delivery status"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": delivery, "timestamp": time.Now()})
	}
}

// AdminUpdateOrderStatus allows admin to update order status
func AdminUpdateOrderStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var order models.Order
		if err := db.First(&order, c.Param("id")).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Order not found"})
			return
		}
		var input struct {
			Status string `json:"status" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		validOrderStatuses := map[string]bool{"pending": true, "confirmed": true, "preparing": true, "ready": true, "out_for_delivery": true, "delivered": true, "cancelled": true}
		if !validOrderStatuses[input.Status] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid status. Must be one of: pending, confirmed, preparing, ready, out_for_delivery, delivered, cancelled"})
			return
		}
		// Prevent modifying terminal statuses
		if order.Status == "delivered" && input.Status != "delivered" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Cannot change status of a delivered order"})
			return
		}
		if order.Status == "cancelled" && input.Status != "cancelled" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Cannot change status of a cancelled order"})
			return
		}
		order.Status = input.Status
		if err := db.Save(&order).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update order status"})
			return
		}
		// Notify user of order status change
		var orderStatusTitle, orderStatusBody string
		switch input.Status {
		case "confirmed":
			orderStatusTitle = "Order Confirmed"
			orderStatusBody = "Your order has been confirmed by the store."
		case "preparing":
			orderStatusTitle = "Order Being Prepared"
			orderStatusBody = "Your order is being prepared."
		case "ready":
			orderStatusTitle = "Order Ready"
			orderStatusBody = "Your order is ready for pickup/delivery."
		case "out_for_delivery":
			orderStatusTitle = "Out for Delivery"
			orderStatusBody = "Your order is out for delivery."
		case "delivered":
			orderStatusTitle = "Order Delivered"
			orderStatusBody = "Your order has been delivered. Enjoy!"
		case "cancelled":
			orderStatusTitle = "Order Cancelled"
			orderStatusBody = "Your order has been cancelled."
		}
		if orderStatusTitle != "" {
			safeNotify(db, order.UserID, orderStatusTitle, orderStatusBody, "order_update")
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": order, "timestamp": time.Now()})
	}
}

// ===== WALLET HANDLERS =====

func GetWalletBalance(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var wallet models.Wallet
		if err := db.Where("user_id = ?", userID).FirstOrCreate(&wallet, models.Wallet{UserID: userID}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to get or create wallet"})
			return
		}
		var transactions []models.WalletTransaction
		if err := db.Where("user_id = ?", userID).Order("created_at DESC").Limit(20).Find(&transactions).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch transactions"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"balance":      wallet.Balance,
				"transactions": transactions,
			},
			"timestamp": time.Now(),
		})
	}
}

func TopUpWallet(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Amount        float64 `json:"amount" binding:"required"`
			PaymentMethod string  `json:"payment_method" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if input.Amount < 10 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Minimum top-up is ₱10"})
			return
		}
		if input.Amount > 50000 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Maximum top-up is ₱50,000"})
			return
		}
		dbTx := db.Begin()
		var wallet models.Wallet
		if err := dbTx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&wallet).Error; err != nil {
			wallet = models.Wallet{UserID: userID, Balance: 0}
			if err := dbTx.Create(&wallet).Error; err != nil {
				dbTx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create wallet"})
				return
			}
		}
		wallet.Balance += input.Amount
		if err := dbTx.Save(&wallet).Error; err != nil {
			dbTx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Top-up failed"})
			return
		}
		transaction := models.WalletTransaction{
			WalletID:    uintPtr(wallet.ID),
			UserID:      uintPtr(userID),
			Type:        "top_up",
			Amount:      input.Amount,
			Description: "Wallet top-up via " + input.PaymentMethod,
			Reference:   "TU-" + strconv.FormatInt(time.Now().UnixMilli(), 10),
		}
		if err := dbTx.Create(&transaction).Error; err != nil {
			dbTx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Top-up failed"})
			return
		}
		if err := dbTx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Top-up failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"balance":     wallet.Balance,
				"transaction": transaction,
			},
			"timestamp": time.Now(),
		})
	}
}

func WithdrawWallet(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Amount        float64 `json:"amount" binding:"required"`
			PaymentMethod string  `json:"payment_method" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if input.Amount < 100 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Minimum withdrawal is ₱100"})
			return
		}
		tx := db.Begin()
		var wallet models.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&wallet).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Wallet not found"})
			return
		}
		if wallet.Balance < input.Amount {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Insufficient balance"})
			return
		}
		wallet.Balance -= input.Amount
		if err := tx.Save(&wallet).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Withdrawal failed"})
			return
		}
		transaction := models.WalletTransaction{
			WalletID: uintPtr(wallet.ID), UserID: uintPtr(userID), Type: "withdrawal",
			Amount: input.Amount, Description: "Withdrawal to " + input.PaymentMethod,
			Reference: "WD-" + strconv.FormatInt(time.Now().UnixMilli(), 10),
		}
		if err := tx.Create(&transaction).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Withdrawal failed"})
			return
		}
		if err := tx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Withdrawal failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"balance": wallet.Balance, "transaction": transaction}, "timestamp": time.Now()})
	}
}

// ===== WITHDRAWAL REQUEST HANDLERS =====

// RequestWithdrawal creates a withdrawal request and deducts from wallet
func RequestWithdrawal(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Amount        float64 `json:"amount" binding:"required"`
			Method        string  `json:"method" binding:"required"`
			AccountNumber string  `json:"account_number" binding:"required"`
			AccountName   string  `json:"account_name" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if input.Amount < 100 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Minimum withdrawal is ₱100"})
			return
		}
		if input.Method != "gcash" && input.Method != "maya" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Method must be gcash or maya"})
			return
		}
		// Verify user is a driver
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Only drivers can request withdrawals"})
			return
		}
		tx := db.Begin()
		var wallet models.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&wallet).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Wallet not found"})
			return
		}
		if wallet.Balance < input.Amount {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Insufficient balance"})
			return
		}
		wallet.Balance -= input.Amount
		if err := tx.Save(&wallet).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Withdrawal failed"})
			return
		}
		transaction := models.WalletTransaction{
			WalletID: uintPtr(wallet.ID), UserID: uintPtr(userID), Type: "withdrawal",
			Amount: input.Amount, Description: "Withdrawal to " + input.Method + " (" + input.AccountNumber + ")",
			Reference: "WD-" + strconv.FormatInt(time.Now().UnixMilli(), 10),
		}
		if err := tx.Create(&transaction).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Withdrawal failed"})
			return
		}
		withdrawal := models.WithdrawalRequest{
			DriverID:      driver.ID,
			Amount:        input.Amount,
			Method:        input.Method,
			AccountNumber: input.AccountNumber,
			AccountName:   input.AccountName,
			Status:        "pending",
		}
		if err := tx.Create(&withdrawal).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Withdrawal failed"})
			return
		}
		if err := tx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Withdrawal failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"balance": wallet.Balance, "withdrawal": withdrawal}})
	}
}

// GetWithdrawals returns all withdrawal requests for the current driver
func GetWithdrawals(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		var withdrawals []models.WithdrawalRequest
		if err := db.Where("driver_id = ?", driver.ID).Order("created_at DESC").Find(&withdrawals).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch withdrawals"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": withdrawals})
	}
}

// AdminGetWithdrawals returns all withdrawal requests with driver info for admin
func AdminGetWithdrawals(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var withdrawals []models.WithdrawalRequest
		if err := db.Session(&gorm.Session{SkipDefaultTransaction: true}).
			Preload("Driver").Preload("Driver.User").
			Order("created_at DESC").
			Find(&withdrawals).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch withdrawals"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": withdrawals})
	}
}

// AdminUpdateWithdrawal allows admin to approve/reject/complete withdrawal requests
func AdminUpdateWithdrawal(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var input struct {
			Status string `json:"status" binding:"required"`
			Note   string `json:"note"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		validStatuses := map[string]bool{"approved": true, "rejected": true, "completed": true}
		if !validStatuses[input.Status] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Status must be approved, rejected, or completed"})
			return
		}
		tx := db.Begin()
		var withdrawal models.WithdrawalRequest
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&withdrawal, id).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Withdrawal request not found"})
			return
		}
		// Validate state transitions
		validTransition := false
		switch {
		case withdrawal.Status == "pending" && (input.Status == "approved" || input.Status == "rejected"):
			validTransition = true
		case withdrawal.Status == "approved" && input.Status == "completed":
			validTransition = true
		}
		if !validTransition {
			tx.Rollback()
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": fmt.Sprintf("Cannot transition from %s to %s", withdrawal.Status, input.Status)})
			return
		}
		// If rejected, refund the amount back to driver's wallet
		if input.Status == "rejected" {
			var driver models.Driver
			if err := tx.First(&driver, withdrawal.DriverID).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Driver not found"})
				return
			}
			var wallet models.Wallet
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", driver.UserID).First(&wallet).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Wallet not found"})
				return
			}
			wallet.Balance += withdrawal.Amount
			if err := tx.Save(&wallet).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to refund"})
				return
			}
			refundTxn := models.WalletTransaction{
				WalletID: uintPtr(wallet.ID), UserID: uintPtr(driver.UserID), Type: "refund",
				Amount: withdrawal.Amount, Description: "Withdrawal rejected - refund",
				Reference: "WD-REFUND-" + strconv.FormatInt(time.Now().UnixMilli(), 10),
			}
			if err := tx.Create(&refundTxn).Error; err != nil {
				tx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create refund transaction"})
				return
			}
		}
		withdrawal.Status = input.Status
		withdrawal.Note = input.Note
		if err := tx.Save(&withdrawal).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update withdrawal"})
			return
		}
		if err := tx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update withdrawal"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": withdrawal, "timestamp": time.Now()})
	}
}

// ===== WEBSOCKET HANDLERS =====

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true // Allow non-browser clients (mobile apps)
		}
		allowed := os.Getenv("ALLOWED_ORIGINS")
		if allowed == "" {
			allowed = os.Getenv("CORS_ORIGIN")
		}
		if allowed == "" || allowed == "*" {
			return true
		}
		for _, o := range strings.Split(allowed, ",") {
			if strings.TrimSpace(o) == origin {
				return true
			}
		}
		return false
	},
}

type RideTracker struct {
	mu    sync.RWMutex
	rides map[string][]*websocket.Conn
}

var tracker = &RideTracker{rides: make(map[string][]*websocket.Conn)}

func (t *RideTracker) Add(rideID string, conn *websocket.Conn) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.rides[rideID] = append(t.rides[rideID], conn)
}

func (t *RideTracker) Remove(rideID string, conn *websocket.Conn) {
	t.mu.Lock()
	defer t.mu.Unlock()
	conns := t.rides[rideID]
	for i, c := range conns {
		if c == conn {
			t.rides[rideID] = append(conns[:i], conns[i+1:]...)
			break
		}
	}
	// Clean up empty map entry to prevent memory leak
	if len(t.rides[rideID]) == 0 {
		delete(t.rides, rideID)
	}
}

func (t *RideTracker) Broadcast(rideID string, msg interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("WebSocket broadcast marshal error for ride #%s: %v", rideID, err)
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	var active []*websocket.Conn
	for _, conn := range t.rides[rideID] {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("WebSocket write error for ride #%s: %v", rideID, err)
			conn.Close()
		} else {
			active = append(active, conn)
		}
	}
	if len(active) > 0 {
		t.rides[rideID] = active
	} else {
		delete(t.rides, rideID)
	}
}

// CloseAll closes all tracked WebSocket connections (used during graceful shutdown)
func (t *RideTracker) CloseAll() {
	t.mu.Lock()
	defer t.mu.Unlock()
	for rideID, conns := range t.rides {
		for _, conn := range conns {
			conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
			conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutting down"))
			conn.Close()
		}
		delete(t.rides, rideID)
	}
}

// DriverTracker manages WebSocket connections per driver for push notifications
type DriverTracker struct {
	mu    sync.RWMutex
	conns map[string]*websocket.Conn
}

var driverTracker = &DriverTracker{conns: make(map[string]*websocket.Conn)}

func (dt *DriverTracker) Set(driverID string, conn *websocket.Conn) {
	dt.mu.Lock()
	defer dt.mu.Unlock()
	if old, ok := dt.conns[driverID]; ok {
		old.Close()
	}
	dt.conns[driverID] = conn
}

func (dt *DriverTracker) Remove(driverID string) {
	dt.mu.Lock()
	defer dt.mu.Unlock()
	delete(dt.conns, driverID)
}

func (dt *DriverTracker) Send(driverID string, msg interface{}) error {
	dt.mu.RLock()
	defer dt.mu.RUnlock()
	conn, ok := dt.conns[driverID]
	if !ok {
		return fmt.Errorf("driver %s not connected", driverID)
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, data)
}

// CloseAll closes all tracked driver WebSocket connections (used during graceful shutdown)
func (dt *DriverTracker) CloseAll() {
	dt.mu.Lock()
	defer dt.mu.Unlock()
	for driverID, conn := range dt.conns {
		conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
		conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutting down"))
		conn.Close()
		delete(dt.conns, driverID)
	}
}

// ChatTracker manages WebSocket connections per ride for chat rooms
type ChatTracker struct {
	mu    sync.RWMutex
	rooms map[string][]*websocket.Conn
}

var chatTracker = &ChatTracker{rooms: make(map[string][]*websocket.Conn)}

func (ct *ChatTracker) Add(rideID string, conn *websocket.Conn) {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	ct.rooms[rideID] = append(ct.rooms[rideID], conn)
}

func (ct *ChatTracker) Remove(rideID string, conn *websocket.Conn) {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	conns := ct.rooms[rideID]
	for i, c := range conns {
		if c == conn {
			ct.rooms[rideID] = append(conns[:i], conns[i+1:]...)
			break
		}
	}
	if len(ct.rooms[rideID]) == 0 {
		delete(ct.rooms, rideID)
	}
}

func (ct *ChatTracker) Broadcast(rideID string, msg interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Chat broadcast marshal error for ride #%s: %v", rideID, err)
		return
	}
	ct.mu.Lock()
	defer ct.mu.Unlock()
	var active []*websocket.Conn
	for _, conn := range ct.rooms[rideID] {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("Chat write error for ride #%s: %v", rideID, err)
			conn.Close()
		} else {
			active = append(active, conn)
		}
	}
	if len(active) > 0 {
		ct.rooms[rideID] = active
	} else {
		delete(ct.rooms, rideID)
	}
}

func (ct *ChatTracker) CloseAll() {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	for rideID, conns := range ct.rooms {
		for _, conn := range conns {
			conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
			conn.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseGoingAway, "server shutting down"))
			conn.Close()
		}
		delete(ct.rooms, rideID)
	}
}

// CloseAllWebSockets closes all WebSocket connections (called during graceful shutdown)
func CloseAllWebSockets() {
	tracker.CloseAll()
	driverTracker.CloseAll()
	chatTracker.CloseAll()
}

func WebSocketTrackingHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rideID := c.Param("rideId")

		// Verify the user is authorized for this ride/delivery
		userID := c.GetUint("userID")
		userRole := c.GetString("role")

		var rideCount int64
		db.Table("rides").Where("id = ? AND (user_id = ? OR driver_id = ?)", rideID, userID, userID).Count(&rideCount)
		var deliveryCount int64
		db.Table("deliveries").Where("id = ? AND (user_id = ? OR driver_id = ?)", rideID, userID, userID).Count(&deliveryCount)

		if rideCount == 0 && deliveryCount == 0 && userRole != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized for this ride"})
			return
		}

		conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}
		defer conn.Close()
		tracker.Add(rideID, conn)
		defer tracker.Remove(rideID, conn)
		log.Printf("WebSocket connected for ride #%s", rideID)

		// Keepalive: ping every 30s, timeout after 45s
		conn.SetReadDeadline(time.Now().Add(45 * time.Second))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(45 * time.Second))
			return nil
		})
		done := make(chan struct{})
		defer close(done)
		go func() {
			ticker := time.NewTicker(30 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
						return
					}
				}
			}
		}()

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				break
			}
			var msg struct {
				Type      string  `json:"type"`
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
				Status    string  `json:"status"`
			}
			if json.Unmarshal(message, &msg) != nil {
				continue
			}
			switch msg.Type {
			case "location_update":
				tracker.Broadcast(rideID, gin.H{"type": "location_update", "latitude": msg.Latitude, "longitude": msg.Longitude, "timestamp": time.Now()})
			case "status_update":
				// Validate status transitions (same rules as REST endpoint)
				rideTransitions := map[string][]string{
					"accepted": {"driver_arrived"}, "driver_arrived": {"in_progress"}, "in_progress": {"completed"},
				}
				deliveryTransitions := map[string][]string{
					"accepted": {"driver_arrived"}, "driver_arrived": {"picked_up"}, "picked_up": {"in_progress"}, "in_progress": {"completed"},
				}
				isValid := func(current, next string, t map[string][]string) bool {
					for _, s := range t[current] {
						if s == next {
							return true
						}
					}
					return false
				}
				// Try ride first (with transaction + row lock)
				var ride models.Ride
				if db.First(&ride, "id = ?", rideID).Error == nil {
					if err := db.Transaction(func(tx *gorm.DB) error {
						if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&ride, "id = ?", rideID).Error; err != nil {
							return err
						}
						if !isValid(ride.Status, msg.Status, rideTransitions) {
							return fmt.Errorf("invalid transition")
						}
						updates := map[string]interface{}{"status": msg.Status}
						now := time.Now()
						if msg.Status == "in_progress" {
							updates["started_at"] = now
						}
						if msg.Status == "completed" {
							updates["completed_at"] = now
							if ride.FinalFare == 0 {
								updates["final_fare"] = ride.EstimatedFare
							}
							if ride.DriverID != nil {
								if err := tx.Model(&models.Driver{}).Where("id = ?", *ride.DriverID).Updates(map[string]interface{}{"completed_rides": gorm.Expr("completed_rides + 1"), "total_earnings": gorm.Expr("total_earnings + ?", ride.EstimatedFare), "is_available": true}).Error; err != nil {
									log.Printf("Failed to update driver stats on ride completion: %v", err)
								}
								createCommissionRecord(tx, "ride", ride.ID, *ride.DriverID, ride.EstimatedFare, ride.PaymentMethod)
							}
							// Process wallet payment via WebSocket
							if ride.PaymentMethod == "wallet" {
								var wallet models.Wallet
								if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", ride.UserID).First(&wallet).Error; err == nil {
									fare := ride.EstimatedFare
									if wallet.Balance >= fare {
										wallet.Balance -= fare
										if err := tx.Save(&wallet).Error; err == nil {
											if err := tx.Create(&models.WalletTransaction{WalletID: uintPtr(wallet.ID), UserID: ride.UserID, Type: "payment", Amount: fare, Description: "Ride payment", Reference: "RIDE-WS"}).Error; err != nil {
												log.Printf("Failed to create wallet transaction for WS ride payment: %v", err)
												return err
											}
										}
									} else {
										updates["payment_method"] = "cash"
									}
								}
							}
						}
						if err := tx.Model(&ride).Updates(updates).Error; err != nil {
							return err
						}
						// Send user notification
						var nTitle, nBody string
						switch msg.Status {
						case "driver_arrived":
							nTitle, nBody = "Rider Arrived", "Your rider has arrived at the pickup location."
						case "in_progress":
							nTitle, nBody = "Trip Started", "Your ride is now in progress!"
						case "completed":
							nTitle, nBody = "Ride Completed", "Your ride has been completed."
						}
						if nTitle != "" {
							safeNotify(tx, ride.UserID, nTitle, nBody, "ride_update")
						}
						return nil
					}); err != nil {
						log.Printf("Failed to update ride status via WS: %v", err)
					} else {
						tracker.Broadcast(rideID, gin.H{"type": "status_update", "status": msg.Status, "timestamp": time.Now()})
					}
				} else {
					// Try delivery (with transaction + row lock)
					var delivery models.Delivery
					if db.First(&delivery, "id = ?", rideID).Error == nil {
						if err := db.Transaction(func(tx *gorm.DB) error {
							if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&delivery, "id = ?", rideID).Error; err != nil {
								return err
							}
							if !isValid(delivery.Status, msg.Status, deliveryTransitions) {
								return fmt.Errorf("invalid transition")
							}
							updates := map[string]interface{}{"status": msg.Status}
							now := time.Now()
							if msg.Status == "in_progress" {
								updates["started_at"] = now
							}
							if msg.Status == "completed" {
								updates["completed_at"] = now
								if delivery.DriverID != nil {
									if err := tx.Model(&models.Driver{}).Where("id = ?", *delivery.DriverID).Updates(map[string]interface{}{"completed_rides": gorm.Expr("completed_rides + 1"), "total_earnings": gorm.Expr("total_earnings + ?", delivery.DeliveryFee), "is_available": true}).Error; err != nil {
										log.Printf("Failed to update driver stats on delivery completion: %v", err)
									}
									createCommissionRecord(tx, "delivery", delivery.ID, *delivery.DriverID, delivery.DeliveryFee, delivery.PaymentMethod)
								}
								// Process wallet payment via WebSocket
								if delivery.PaymentMethod == "wallet" {
									var wallet models.Wallet
									if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", delivery.UserID).First(&wallet).Error; err == nil {
										if wallet.Balance >= delivery.DeliveryFee {
											wallet.Balance -= delivery.DeliveryFee
											if err := tx.Save(&wallet).Error; err == nil {
												if err := tx.Create(&models.WalletTransaction{WalletID: uintPtr(wallet.ID), UserID: delivery.UserID, Type: "payment", Amount: delivery.DeliveryFee, Description: "Delivery payment", Reference: "DEL-WS"}).Error; err != nil {
													log.Printf("Failed to create wallet transaction for WS delivery payment: %v", err)
													return err
												}
											}
										} else {
											updates["payment_method"] = "cash"
										}
									}
								}
							}
							if err := tx.Model(&delivery).Updates(updates).Error; err != nil {
								return err
							}
							// Send user notification
							var dTitle, dBody string
							switch msg.Status {
							case "driver_arrived":
								dTitle, dBody = "Rider Arrived", "Your rider has arrived at the pickup location."
							case "picked_up":
								dTitle, dBody = "Item Picked Up", "Your item has been picked up and is on its way!"
							case "in_progress":
								dTitle, dBody = "Delivery In Progress", "Your delivery is on the way!"
							case "completed":
								dTitle, dBody = "Delivery Completed", "Your delivery has been completed."
							}
							if dTitle != "" {
								safeNotify(tx, delivery.UserID, dTitle, dBody, "delivery_update")
							}
							return nil
						}); err != nil {
							log.Printf("Failed to update delivery status via WS: %v", err)
						} else {
							tracker.Broadcast(rideID, gin.H{"type": "status_update", "status": msg.Status, "timestamp": time.Now()})
						}
					}
				}
			}
		}
	}
}

func WebSocketDriverHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		driverID := c.Param("driverId")

		// Verify the connecting user IS this driver
		userID := c.GetUint("userID")
		driverIdParsed, err := strconv.ParseUint(driverID, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid driver ID"})
			return
		}
		// Look up the driver record to check user_id matches
		var driver models.Driver
		if err := db.First(&driver, driverIdParsed).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		if driver.UserID != userID {
			userRole := c.GetString("role")
			if userRole != "admin" {
				c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Not authorized"})
				return
			}
		}

		conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		driverTracker.Set(driverID, conn)
		defer driverTracker.Remove(driverID)

		// Keepalive: ping every 30s, timeout after 45s
		conn.SetReadDeadline(time.Now().Add(45 * time.Second))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(45 * time.Second))
			return nil
		})
		done := make(chan struct{})
		defer close(done)
		go func() {
			ticker := time.NewTicker(30 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
						return
					}
				}
			}
		}()

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				break
			}
			var msg struct {
				Type      string  `json:"type"`
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
			}
			if json.Unmarshal(message, &msg) != nil {
				continue
			}
			if msg.Type == "location_update" {
				// Validate coordinates
				if msg.Latitude < -90 || msg.Latitude > 90 || msg.Longitude < -180 || msg.Longitude > 180 {
					continue
				}
				if err := db.Model(&models.Driver{}).Where("id = ?", driverID).Updates(map[string]interface{}{"current_latitude": msg.Latitude, "current_longitude": msg.Longitude}).Error; err != nil {
					log.Printf("Failed to update driver location: %v", err)
				}
			}
		}
	}
}

// ===== WEBSOCKET CHAT HANDLER =====

func WebSocketChatHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rideID := c.Param("rideId")

		// Auth is handled by AuthMiddleware (supports ?token= query param for WebSocket)
		userID := c.GetUint("userID")

		// Verify user is part of this ride/delivery chat
		var chatRideCount int64
		db.Table("rides").Where("id = ? AND (user_id = ? OR driver_id = ?)", rideID, userID, userID).Count(&chatRideCount)
		var chatDeliveryCount int64
		db.Table("deliveries").Where("id = ? AND (user_id = ? OR driver_id = ?)", rideID, userID, userID).Count(&chatDeliveryCount)
		if chatRideCount == 0 && chatDeliveryCount == 0 {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Not authorized for this chat"})
			return
		}

		conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("Chat WebSocket upgrade error: %v", err)
			return
		}
		defer conn.Close()
		chatTracker.Add(rideID, conn)
		defer chatTracker.Remove(rideID, conn)
		log.Printf("Chat WebSocket connected for ride #%s by user #%d", rideID, userID)

		// Keepalive: ping every 30s, timeout after 45s
		conn.SetReadDeadline(time.Now().Add(45 * time.Second))
		conn.SetPongHandler(func(string) error {
			conn.SetReadDeadline(time.Now().Add(45 * time.Second))
			return nil
		})
		done := make(chan struct{})
		defer close(done)
		go func() {
			ticker := time.NewTicker(30 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
						return
					}
				}
			}
		}()

		// Parse rideID to uint for DB storage
		rideIDParsed, err := strconv.ParseUint(rideID, 10, 64)
		if err != nil {
			log.Printf("Invalid rideID in WebSocket chat: %s", rideID)
			conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"invalid ride ID"}`))
			return
		}
		rideIDUint := uint(rideIDParsed)

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				break
			}
			var input struct {
				Type       string `json:"type"`
				ReceiverID uint   `json:"receiver_id"`
				Message    string `json:"message"`
				ImageURL   string `json:"image_url"`
			}
			if json.Unmarshal(message, &input) != nil {
				continue
			}

			switch input.Type {
			case "message":
				if input.Message == "" || input.ReceiverID == 0 {
					continue
				}
				msg := models.ChatMessage{
					SenderID:   uintPtr(userID),
					ReceiverID: uintPtr(input.ReceiverID),
					RideID:     &rideIDUint,
					Message:    input.Message,
				}
				if err := db.Create(&msg).Error; err != nil {
					log.Printf("Failed to save chat message via WS: %v", err)
					continue
				}
				chatTracker.Broadcast(rideID, gin.H{
					"type":        "chat_message",
					"id":          msg.ID,
					"sender_id":   userID,
					"receiver_id": input.ReceiverID,
					"message":     input.Message,
					"created_at":  msg.CreatedAt,
				})

			case "image":
				if input.ImageURL == "" || input.ReceiverID == 0 {
					continue
				}
				msg := models.ChatMessage{
					SenderID:   uintPtr(userID),
					ReceiverID: uintPtr(input.ReceiverID),
					RideID:     &rideIDUint,
					Message:    "[image]",
					ImageURL:   input.ImageURL,
				}
				if err := db.Create(&msg).Error; err != nil {
					log.Printf("Failed to save chat image via WS: %v", err)
					continue
				}
				chatTracker.Broadcast(rideID, gin.H{
					"type":        "chat_message",
					"id":          msg.ID,
					"sender_id":   userID,
					"receiver_id": input.ReceiverID,
					"message":     "[image]",
					"image_url":   input.ImageURL,
					"created_at":  msg.CreatedAt,
				})
			}
		}
	}
}

// ChatImageUpload handles uploading chat images and returns a base64 data URL
func ChatImageUpload(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		file, err := c.FormFile("image")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No file uploaded"})
			return
		}

		// Validate file size (max 5MB)
		if file.Size > 5*1024*1024 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "File too large. Maximum 5MB allowed"})
			return
		}

		// Validate file type
		ext := strings.ToLower(filepath.Ext(file.Filename))
		mimeTypes := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
		mimeType, ok := mimeTypes[ext]
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid file type. Only PNG, JPG, JPEG, WEBP allowed"})
			return
		}

		src, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to read file"})
			return
		}
		defer src.Close()

		data, err := io.ReadAll(src)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to read file"})
			return
		}

		dataURL := fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(data))

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"url": dataURL,
			},
		})
	}
}

// ===== RATE CONFIG HANDLERS =====

// Admin Rate Config CRUD
func AdminGetRates(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var rates []models.RateConfig
		if err := db.Order("service_type, vehicle_type").Find(&rates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch rates"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": rates})
	}
}

func AdminCreateRate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input models.RateConfig
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid input"})
			return
		}
		if input.ServiceType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "service_type is required"})
			return
		}
		validServiceTypes := map[string]bool{"ride": true, "delivery": true, "order": true}
		if !validServiceTypes[input.ServiceType] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "service_type must be ride, delivery, or order"})
			return
		}
		if input.ServiceType == "ride" && input.VehicleType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "vehicle_type is required for rides"})
			return
		}
		if input.BaseFare < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "base_fare cannot be negative"})
			return
		}
		if input.RatePerKm < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "rate_per_km cannot be negative"})
			return
		}
		if input.MinimumFare < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "minimum_fare cannot be negative"})
			return
		}
		if err := db.Create(&input).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create rate config. A config for this service/vehicle may already exist."})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": input})
	}
}

func AdminUpdateRate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var rate models.RateConfig
		if err := db.First(&rate, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Rate config not found"})
			return
		}
		var input map[string]interface{}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid input"})
			return
		}
		// Remove protected fields to prevent mass assignment
		for _, f := range []string{"id", "ID", "created_at", "CreatedAt", "service_type", "ServiceType", "vehicle_type", "VehicleType"} {
			delete(input, f)
		}
		// Validate numeric fields are not negative
		for _, field := range []string{"base_fare", "rate_per_km", "minimum_fare"} {
			if val, ok := input[field]; ok {
				if numVal, ok := val.(float64); ok && numVal < 0 {
					c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": field + " cannot be negative"})
					return
				}
			}
		}
		if err := db.Model(&rate).Updates(input).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update rate config"})
			return
		}
		if err := db.First(&rate, id).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to retrieve updated record"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": rate})
	}
}

func AdminDeleteRate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var rate models.RateConfig
		if err := db.First(&rate, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Rate config not found"})
			return
		}
		if err := db.Delete(&rate).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete rate config"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Rate config deleted"})
	}
}

func GetPublicRates(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var rates []models.RateConfig
		if err := db.Where("is_active = ?", true).Find(&rates).Error; err != nil {
			c.JSON(http.StatusOK, gin.H{"success": true, "data": []models.RateConfig{}})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": rates})
	}
}

// ===== ADMIN USER UPDATE HANDLER =====

func AdminUpdateUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var user models.User
		if err := db.First(&user, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
			return
		}
		var input struct {
			Name       *string `json:"name"`
			Email      *string `json:"email"`
			Phone      *string `json:"phone"`
			Role       *string `json:"role"`
			IsVerified *bool   `json:"is_verified"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		updates := map[string]interface{}{}
		if input.Name != nil {
			updates["name"] = *input.Name
		}
		if input.Email != nil {
			updates["email"] = *input.Email
		}
		if input.Phone != nil {
			updates["phone"] = *input.Phone
		}
		if input.Role != nil {
			validRoles := map[string]bool{"user": true, "driver": true, "admin": true}
			if !validRoles[*input.Role] {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid role. Must be user, driver, or admin"})
				return
			}
			updates["role"] = *input.Role
		}
		if input.IsVerified != nil {
			updates["is_verified"] = *input.IsVerified
		}
		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No fields to update"})
			return
		}
		if err := db.Model(&user).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update user"})
			return
		}
		if err := db.First(&user, id).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to retrieve updated record"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": user, "timestamp": time.Now()})
	}
}

// ===== ADMIN DRIVER UPDATE HANDLER =====

func AdminUpdateDriver(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var driver models.Driver
		if err := db.Preload("User").First(&driver, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		var input struct {
			VehicleType   *string `json:"vehicle_type"`
			VehicleModel  *string `json:"vehicle_model"`
			VehiclePlate  *string `json:"vehicle_plate"`
			LicenseNumber *string `json:"license_number"`
			IsAvailable   *bool   `json:"is_available"`
			IsVerified    *bool   `json:"is_verified"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		updates := map[string]interface{}{}
		if input.VehicleType != nil {
			updates["vehicle_type"] = *input.VehicleType
		}
		if input.VehicleModel != nil {
			updates["vehicle_model"] = *input.VehicleModel
		}
		if input.VehiclePlate != nil {
			updates["vehicle_plate"] = *input.VehiclePlate
		}
		if input.LicenseNumber != nil {
			updates["license_number"] = *input.LicenseNumber
		}
		if input.IsAvailable != nil {
			updates["is_available"] = *input.IsAvailable
		}
		if input.IsVerified != nil {
			updates["is_verified"] = *input.IsVerified
			// Also update user role when verifying
			if *input.IsVerified {
				if err := db.Model(&models.User{}).Where("id = ?", driver.UserID).Update("role", "driver").Error; err != nil {
					log.Printf("Failed to update user role for driver %d (user %d): %v", driver.ID, driver.UserID, err)
				}
				// Notify driver of verification
				if err := db.Create(&models.Notification{UserID: driver.UserID, Title: "Account Verified", Body: "Congratulations! Your rider account has been verified. You can now go online and accept rides.", Type: "account_update"}).Error; err != nil {
					log.Printf("Failed to create verification notification: %v", err)
				}
			}
		}
		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No fields to update"})
			return
		}
		if err := db.Model(&driver).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update driver"})
			return
		}
		if err := db.Preload("User").First(&driver, id).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to retrieve updated record"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": driver, "timestamp": time.Now()})
	}
}

// ===== ADMIN MENU ITEM HANDLERS =====

func AdminGetMenuItems(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		storeId := c.Param("id")
		var store models.Store
		if err := db.First(&store, storeId).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Store not found"})
			return
		}
		var items []models.MenuItem
		if err := db.Where("store_id = ?", storeId).Order("category, name").Find(&items).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch menu items"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": items, "count": len(items), "timestamp": time.Now()})
	}
}

func AdminCreateMenuItem(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		storeId := c.Param("id")
		var store models.Store
		if err := db.First(&store, storeId).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Store not found"})
			return
		}
		var item models.MenuItem
		if err := c.ShouldBindJSON(&item); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		// Parse storeId to uint
		sid, err := strconv.ParseUint(storeId, 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid store ID"})
			return
		}
		item.StoreID = uint(sid)
		if item.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Item name is required"})
			return
		}
		if item.Price < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Price cannot be negative"})
			return
		}
		if err := db.Create(&item).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create menu item"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": item, "timestamp": time.Now()})
	}
}

func AdminUpdateMenuItem(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		itemId := c.Param("itemId")
		var item models.MenuItem
		if err := db.First(&item, itemId).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Menu item not found"})
			return
		}
		var input struct {
			Name      *string  `json:"name"`
			Price     *float64 `json:"price"`
			Image     *string  `json:"image"`
			Category  *string  `json:"category"`
			Available *bool    `json:"available"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		updates := map[string]interface{}{}
		if input.Name != nil {
			updates["name"] = *input.Name
		}
		if input.Price != nil {
			if *input.Price < 0 {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Price cannot be negative"})
				return
			}
			updates["price"] = *input.Price
		}
		if input.Image != nil {
			updates["image"] = *input.Image
		}
		if input.Category != nil {
			updates["category"] = *input.Category
		}
		if input.Available != nil {
			updates["available"] = *input.Available
		}
		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No fields to update"})
			return
		}
		if err := db.Model(&item).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update menu item"})
			return
		}
		if err := db.First(&item, itemId).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to retrieve updated record"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": item, "timestamp": time.Now()})
	}
}

func AdminDeleteMenuItem(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		itemId := c.Param("itemId")
		var item models.MenuItem
		if err := db.First(&item, itemId).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Menu item not found"})
			return
		}
		if err := db.Delete(&item).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete menu item"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Menu item deleted"}, "timestamp": time.Now()})
	}
}

// ===== PAYMENT CONFIG HANDLERS =====

// Admin CRUD for payment configs
func AdminGetPaymentConfigs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var configs []models.PaymentConfig
		if err := db.Order("type").Find(&configs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch payment configs"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": configs, "count": len(configs)})
	}
}

func AdminCreatePaymentConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var config models.PaymentConfig
		if err := c.ShouldBindJSON(&config); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if config.Type == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Payment type is required"})
			return
		}
		validTypes := map[string]bool{"gcash": true, "maya": true}
		if !validTypes[config.Type] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid type. Must be gcash or maya"})
			return
		}
		if err := db.Create(&config).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create payment config. Type may already exist."})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": config})
	}
}

func AdminUpdatePaymentConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var config models.PaymentConfig
		if err := db.First(&config, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Payment config not found"})
			return
		}
		var input struct {
			AccountName   *string `json:"account_name"`
			AccountNumber *string `json:"account_number"`
			QRCodeURL     *string `json:"qr_code_url"`
			IsActive      *bool   `json:"is_active"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		updates := map[string]interface{}{}
		if input.AccountName != nil {
			updates["account_name"] = *input.AccountName
		}
		if input.AccountNumber != nil {
			updates["account_number"] = *input.AccountNumber
		}
		if input.QRCodeURL != nil {
			updates["qr_code_url"] = *input.QRCodeURL
		}
		if input.IsActive != nil {
			updates["is_active"] = *input.IsActive
		}
		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No fields to update"})
			return
		}
		if err := db.Model(&config).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update payment config"})
			return
		}
		if err := db.First(&config, id).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to retrieve updated record"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": config})
	}
}

func AdminDeletePaymentConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var config models.PaymentConfig
		if err := db.First(&config, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Payment config not found"})
			return
		}
		if err := db.Delete(&config).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete payment config"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Payment config deleted"})
	}
}

// AdminUploadQRCode handles QR code image file uploads, returns base64 data URL
func AdminUploadQRCode(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		file, err := c.FormFile("qr_image")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No file uploaded"})
			return
		}

		// Validate file size (max 5MB)
		if file.Size > 5*1024*1024 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "File too large. Maximum 5MB allowed"})
			return
		}

		// Validate file type (only images)
		ext := strings.ToLower(filepath.Ext(file.Filename))
		mimeTypes := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
		mimeType, ok := mimeTypes[ext]
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid file type. Only PNG, JPG, JPEG, WEBP allowed"})
			return
		}

		// Read file contents and encode as base64 data URL
		src, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to read file"})
			return
		}
		defer src.Close()

		data, err := io.ReadAll(src)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to read file"})
			return
		}

		dataURL := fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(data))

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"url":      dataURL,
				"filename": file.Filename,
			},
		})
	}
}

// Public endpoint - returns active payment configs for mobile
func GetPaymentConfigs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var configs []models.PaymentConfig
		if err := db.Where("is_active = ?", true).Find(&configs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch payment configs"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": configs})
	}
}

// AdminGetCommissionConfig returns the current commission config (auto-creates default if none exists)
func AdminGetCommissionConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var config models.CommissionConfig
		if err := db.First(&config).Error; err != nil {
			// Auto-create default config
			config = models.CommissionConfig{
				Percentage: 10,
				IsActive:   true,
			}
			if err := db.Create(&config).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create default commission config"})
				return
			}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": config, "timestamp": time.Now()})
	}
}

// AdminUpdateCommissionConfig updates or creates the commission percentage (upsert)
func AdminUpdateCommissionConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Percentage float64 `json:"percentage" binding:"required,min=0,max=100"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Percentage must be between 0 and 100"})
			return
		}
		var config models.CommissionConfig
		if err := db.First(&config).Error; err != nil {
			// No config exists — create one
			config = models.CommissionConfig{
				Percentage: input.Percentage,
				IsActive:   true,
			}
			if err := db.Create(&config).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create commission config"})
				return
			}
			c.JSON(http.StatusCreated, gin.H{"success": true, "data": config, "timestamp": time.Now()})
			return
		}
		config.Percentage = input.Percentage
		if err := db.Save(&config).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update commission config"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": config, "timestamp": time.Now()})
	}
}

// AdminGetCommissionRecords returns paginated commission records
func AdminGetCommissionRecords(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 20
		}
		offset := (page - 1) * limit

		query := db.Model(&models.CommissionRecord{})

		if serviceType := c.Query("service_type"); serviceType != "" {
			query = query.Where("service_type = ?", serviceType)
		}
		if status := c.Query("status"); status != "" {
			query = query.Where("status = ?", status)
		}
		if paymentMethod := c.Query("payment_method"); paymentMethod != "" {
			query = query.Where("payment_method = ?", paymentMethod)
		}
		if dateFrom := c.Query("date_from"); dateFrom != "" {
			if t, err := time.Parse(time.RFC3339, dateFrom); err == nil {
				query = query.Where("created_at >= ?", t)
			}
		}
		if dateTo := c.Query("date_to"); dateTo != "" {
			if t, err := time.Parse(time.RFC3339, dateTo); err == nil {
				query = query.Where("created_at <= ?", t)
			}
		}

		var total int64
		query.Count(&total)

		var records []models.CommissionRecord
		if err := query.Preload("Driver.User").Order("created_at DESC").Offset(offset).Limit(limit).Find(&records).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch commission records"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"records": records,
				"total":   total,
				"page":    page,
				"limit":   limit,
			},
			"timestamp": time.Now(),
		})
	}
}

// AdminGetCommissionSummary returns aggregate commission stats
func AdminGetCommissionSummary(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var summary struct {
			TotalCommission        float64
			TotalDeducted          float64
			TotalPendingCollection float64
			RideCommission         float64
			DeliveryCommission     float64
			OrderCommission        float64
			CurrentMonthCommission float64
		}

		db.Model(&models.CommissionRecord{}).Select(
			"COALESCE(SUM(commission_amount), 0) as total_commission, "+
				"COALESCE(SUM(CASE WHEN status = 'deducted' THEN commission_amount ELSE 0 END), 0) as total_deducted, "+
				"COALESCE(SUM(CASE WHEN status = 'pending_collection' THEN commission_amount ELSE 0 END), 0) as total_pending_collection, "+
				"COALESCE(SUM(CASE WHEN service_type = 'ride' THEN commission_amount ELSE 0 END), 0) as ride_commission, "+
				"COALESCE(SUM(CASE WHEN service_type = 'delivery' THEN commission_amount ELSE 0 END), 0) as delivery_commission, "+
				"COALESCE(SUM(CASE WHEN service_type = 'order' THEN commission_amount ELSE 0 END), 0) as order_commission").
			Row().Scan(
			&summary.TotalCommission,
			&summary.TotalDeducted,
			&summary.TotalPendingCollection,
			&summary.RideCommission,
			&summary.DeliveryCommission,
			&summary.OrderCommission,
		)

		// Current month commission
		now := time.Now()
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		db.Model(&models.CommissionRecord{}).
			Where("created_at >= ?", monthStart).
			Select("COALESCE(SUM(commission_amount), 0)").
			Row().Scan(&summary.CurrentMonthCommission)

		// Get current percentage
		var config models.CommissionConfig
		var currentPercentage float64
		if db.First(&config).Error == nil {
			currentPercentage = config.Percentage
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"total_commission":         summary.TotalCommission,
				"total_deducted":           summary.TotalDeducted,
				"total_pending_collection": summary.TotalPendingCollection,
				"ride_commission":          summary.RideCommission,
				"delivery_commission":      summary.DeliveryCommission,
				"order_commission":         summary.OrderCommission,
				"current_month_commission": summary.CurrentMonthCommission,
				"current_percentage":       currentPercentage,
			},
			"timestamp": time.Now(),
		})
	}
}

// ===== PUSH NOTIFICATION HANDLERS =====

// sendExpoPushNotification sends a push notification via Expo's push API.
// Fire-and-forget: runs in a goroutine, logs errors but never blocks.
func sendExpoPushNotification(token, title, body string, data map[string]interface{}) {
	go func() {
		payload := map[string]interface{}{
			"to":    token,
			"title": title,
			"body":  body,
			"sound": "default",
		}
		if data != nil {
			payload["data"] = data
		}
		jsonData, err := json.Marshal(payload)
		if err != nil {
			log.Printf("Push notification marshal error: %v", err)
			return
		}
		resp, err := http.Post("https://exp.host/--/api/v2/push/send", "application/json", bytes.NewReader(jsonData))
		if err != nil {
			log.Printf("Push notification send error: %v", err)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			respBody, _ := io.ReadAll(resp.Body)
			log.Printf("Push notification API error (status %d): %s", resp.StatusCode, string(respBody))
		}
	}()
}

// RegisterPushToken upserts the authenticated user's Expo push token.
func RegisterPushToken(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Token    string `json:"token" binding:"required"`
			Platform string `json:"platform" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		var pushToken models.PushToken
		result := db.Where(models.PushToken{UserID: userID}).Assign(models.PushToken{Token: input.Token, Platform: input.Platform}).FirstOrCreate(&pushToken)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to register push token"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": pushToken, "timestamp": time.Now()})
	}
}

// RemovePushToken deletes the authenticated user's push token (e.g. on logout).
func RemovePushToken(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		if err := db.Where("user_id = ?", userID).Delete(&models.PushToken{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to remove push token"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Push token removed"}, "timestamp": time.Now()})
	}
}

// ===== REFERRAL HANDLERS =====

// generateReferralCode creates a referral code from the user's name + random digits
func generateReferralCode(name string) string {
	clean := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(name), " ", ""))
	prefix := clean
	if len(prefix) > 4 {
		prefix = prefix[:4]
	}
	code := fmt.Sprintf("OMJI-%s%04d", prefix, rand.Intn(10000))
	return code
}

// GetReferralCode returns (or generates) the user's referral code plus stats.
func GetReferralCode(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
			return
		}

		// Generate code if user doesn't have one yet
		if user.ReferralCode == "" {
			for i := 0; i < 5; i++ {
				code := generateReferralCode(user.Name)
				user.ReferralCode = code
				if err := db.Model(&user).Update("referral_code", code).Error; err != nil {
					if i == 4 {
						c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to generate referral code"})
						return
					}
					continue // retry with different random digits
				}
				break
			}
		}

		var totalReferrals int64
		var totalEarned float64
		db.Model(&models.Referral{}).Where("referrer_id = ?", userID).Count(&totalReferrals)
		db.Model(&models.Referral{}).Where("referrer_id = ?", userID).Select("COALESCE(SUM(referrer_bonus), 0)").Scan(&totalEarned)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"code":            user.ReferralCode,
				"total_referrals": totalReferrals,
				"total_earned":    totalEarned,
			},
			"timestamp": time.Now(),
		})
	}
}

// ApplyReferralCode lets a user apply someone else's referral code to earn bonuses.
func ApplyReferralCode(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var input struct {
			Code string `json:"code" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Referral code is required"})
			return
		}

		code := strings.ToUpper(strings.TrimSpace(input.Code))

		// Find referrer by code
		var referrer models.User
		if err := db.Where("referral_code = ?", code).First(&referrer).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Invalid referral code"})
			return
		}

		// Prevent self-referral
		if referrer.ID == userID {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "You cannot use your own referral code"})
			return
		}

		// Check if user was already referred
		var existingReferral models.Referral
		if err := db.Where("referred_id = ?", userID).First(&existingReferral).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "You have already used a referral code"})
			return
		}

		referrerBonus := 20.0
		referredBonus := 10.0

		dbTx := db.Begin()

		// Create referral record
		referral := models.Referral{
			ReferrerID:    referrer.ID,
			ReferredID:    userID,
			ReferrerBonus: referrerBonus,
			ReferredBonus: referredBonus,
			Status:        "completed",
		}
		if err := dbTx.Create(&referral).Error; err != nil {
			dbTx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to apply referral code"})
			return
		}

		// Credit referrer wallet
		var referrerWallet models.Wallet
		if err := dbTx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", referrer.ID).First(&referrerWallet).Error; err != nil {
			referrerWallet = models.Wallet{UserID: referrer.ID, Balance: 0}
			if err := dbTx.Create(&referrerWallet).Error; err != nil {
				dbTx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to credit referrer wallet"})
				return
			}
		}
		referrerWallet.Balance += referrerBonus
		if err := dbTx.Save(&referrerWallet).Error; err != nil {
			dbTx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to credit referrer wallet"})
			return
		}
		referrerTx := models.WalletTransaction{
			WalletID:    uintPtr(referrerWallet.ID),
			UserID:      uintPtr(referrer.ID),
			Type:        "referral_bonus",
			Amount:      referrerBonus,
			Description: "Referral bonus - new user joined",
			Reference:   fmt.Sprintf("referral_%d", referral.ID),
		}
		if err := dbTx.Create(&referrerTx).Error; err != nil {
			log.Printf("Failed to create referrer wallet transaction: %v", err)
		}

		// Credit referred user wallet
		var referredWallet models.Wallet
		if err := dbTx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", userID).First(&referredWallet).Error; err != nil {
			referredWallet = models.Wallet{UserID: userID, Balance: 0}
			if err := dbTx.Create(&referredWallet).Error; err != nil {
				dbTx.Rollback()
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to credit your wallet"})
				return
			}
		}
		referredWallet.Balance += referredBonus
		if err := dbTx.Save(&referredWallet).Error; err != nil {
			dbTx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to credit your wallet"})
			return
		}
		referredTxn := models.WalletTransaction{
			WalletID:    uintPtr(referredWallet.ID),
			UserID:      uintPtr(userID),
			Type:        "referral_bonus",
			Amount:      referredBonus,
			Description: "Welcome bonus from referral",
			Reference:   fmt.Sprintf("referral_%d", referral.ID),
		}
		if err := dbTx.Create(&referredTxn).Error; err != nil {
			log.Printf("Failed to create referred wallet transaction: %v", err)
		}

		if err := dbTx.Commit().Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to apply referral code"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"message":        "Referral code applied successfully!",
				"referrer_bonus": referrerBonus,
				"referred_bonus": referredBonus,
			},
			"timestamp": time.Now(),
		})
	}
}

// GetReferralStats returns the user's referral statistics and recent referrals.
func GetReferralStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
			return
		}

		var totalReferrals int64
		var totalEarned float64
		db.Model(&models.Referral{}).Where("referrer_id = ?", userID).Count(&totalReferrals)
		db.Model(&models.Referral{}).Where("referrer_id = ?", userID).Select("COALESCE(SUM(referrer_bonus), 0)").Scan(&totalEarned)

		// Get recent referrals with referred user names
		type ReferralInfo struct {
			ID            uint      `json:"id"`
			ReferredName  string    `json:"referred_name"`
			ReferrerBonus float64   `json:"referrer_bonus"`
			Status        string    `json:"status"`
			CreatedAt     time.Time `json:"created_at"`
		}
		var recentReferrals []ReferralInfo
		db.Model(&models.Referral{}).
			Select("referrals.id, users.name as referred_name, referrals.referrer_bonus, referrals.status, referrals.created_at").
			Joins("JOIN users ON users.id = referrals.referred_id").
			Where("referrals.referrer_id = ?", userID).
			Order("referrals.created_at DESC").
			Limit(20).
			Scan(&recentReferrals)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"referral_code":    user.ReferralCode,
				"total_referrals":  totalReferrals,
				"total_earned":     totalEarned,
				"recent_referrals": recentReferrals,
			},
			"timestamp": time.Now(),
		})
	}
}

// ==================== Announcements ====================

// GetAnnouncements returns active, non-expired announcements (public, for mobile)
func GetAnnouncements(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var announcements []models.Announcement
		if err := db.Session(&gorm.Session{SkipDefaultTransaction: true}).
			Where("is_active = ? AND (expires_at IS NULL OR expires_at > ?)", true, time.Now()).
			Order("created_at DESC").
			Limit(10).
			Find(&announcements).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch announcements"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": announcements})
	}
}

// AdminGetAnnouncements returns ALL announcements for admin management (including inactive/expired)
func AdminGetAnnouncements(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var announcements []models.Announcement
		if err := db.Session(&gorm.Session{SkipDefaultTransaction: true}).
			Order("created_at DESC").
			Find(&announcements).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch announcements"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": announcements, "timestamp": time.Now()})
	}
}

// AdminCreateAnnouncement creates a new announcement (admin only)
func AdminCreateAnnouncement(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Title     string     `json:"title" binding:"required"`
			Message   string     `json:"message" binding:"required"`
			Type      string     `json:"type"`
			ExpiresAt *time.Time `json:"expires_at"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Title and message are required"})
			return
		}

		annType := input.Type
		if annType == "" {
			annType = "info"
		}
		validTypes := map[string]bool{"info": true, "warning": true, "promo": true, "update": true}
		if !validTypes[annType] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid type. Must be info, warning, promo, or update"})
			return
		}

		announcement := models.Announcement{
			Title:     input.Title,
			Message:   input.Message,
			Type:      annType,
			IsActive:  true,
			ExpiresAt: input.ExpiresAt,
		}

		if err := db.Create(&announcement).Error; err != nil {
			log.Printf("Failed to create announcement: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create announcement"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"success": true, "data": announcement, "timestamp": time.Now()})
	}
}

// AdminUpdateAnnouncement updates an existing announcement
func AdminUpdateAnnouncement(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid announcement ID"})
			return
		}

		var announcement models.Announcement
		if err := db.First(&announcement, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Announcement not found"})
			return
		}

		var input struct {
			Title     *string    `json:"title"`
			Message   *string    `json:"message"`
			Type      *string    `json:"type"`
			IsActive  *bool      `json:"is_active"`
			ExpiresAt *time.Time `json:"expires_at"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}

		updates := map[string]interface{}{}
		if input.Title != nil {
			updates["title"] = *input.Title
		}
		if input.Message != nil {
			updates["message"] = *input.Message
		}
		if input.Type != nil {
			validTypes := map[string]bool{"info": true, "warning": true, "promo": true, "update": true}
			if !validTypes[*input.Type] {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid type. Must be info, warning, promo, or update"})
				return
			}
			updates["type"] = *input.Type
		}
		if input.IsActive != nil {
			updates["is_active"] = *input.IsActive
		}
		if input.ExpiresAt != nil {
			updates["expires_at"] = *input.ExpiresAt
		}

		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No fields to update"})
			return
		}

		if err := db.Model(&announcement).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update announcement"})
			return
		}

		if err := db.First(&announcement, id).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to retrieve updated announcement"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": announcement, "timestamp": time.Now()})
	}
}

// AdminDeleteAnnouncement soft-deletes an announcement by setting is_active = false
func AdminDeleteAnnouncement(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid announcement ID"})
			return
		}

		result := db.Model(&models.Announcement{}).Where("id = ?", id).Update("is_active", false)
		if result.Error != nil {
			log.Printf("Failed to delete announcement %d: %v", id, result.Error)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete announcement"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Announcement not found"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Announcement deleted"}, "timestamp": time.Now()})
	}
}

// ===== ADMIN REFERRAL HANDLERS =====

// AdminGetReferrals returns all referrals with referrer/referred user info and summary stats.
func AdminGetReferrals(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		type ReferralResponse struct {
			ID            uint    `json:"id"`
			ReferrerID    uint    `json:"referrer_id"`
			ReferredID    uint    `json:"referred_id"`
			ReferrerBonus float64 `json:"referrer_bonus"`
			ReferredBonus float64 `json:"referred_bonus"`
			Status        string  `json:"status"`
			CreatedAt     string  `json:"created_at"`
			Referrer      *struct {
				ID    uint   `json:"id"`
				Name  string `json:"name"`
				Phone string `json:"phone"`
			} `json:"Referrer"`
			Referred *struct {
				ID    uint   `json:"id"`
				Name  string `json:"name"`
				Phone string `json:"phone"`
			} `json:"Referred"`
		}

		var referrals []models.Referral
		if err := db.Order("created_at DESC").Find(&referrals).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to load referrals"})
			return
		}

		// Collect unique user IDs
		userIDSet := make(map[uint]bool)
		for _, r := range referrals {
			userIDSet[r.ReferrerID] = true
			userIDSet[r.ReferredID] = true
		}
		userIDs := make([]uint, 0, len(userIDSet))
		for id := range userIDSet {
			userIDs = append(userIDs, id)
		}

		// Batch fetch users
		var users []models.User
		if len(userIDs) > 0 {
			db.Where("id IN ?", userIDs).Find(&users)
		}
		userMap := make(map[uint]models.User)
		for _, u := range users {
			userMap[u.ID] = u
		}

		// Build response
		result := make([]ReferralResponse, 0, len(referrals))
		for _, r := range referrals {
			item := ReferralResponse{
				ID:            r.ID,
				ReferrerID:    r.ReferrerID,
				ReferredID:    r.ReferredID,
				ReferrerBonus: r.ReferrerBonus,
				ReferredBonus: r.ReferredBonus,
				Status:        r.Status,
				CreatedAt:     r.CreatedAt.Format(time.RFC3339),
			}
			if referrer, ok := userMap[r.ReferrerID]; ok {
				item.Referrer = &struct {
					ID    uint   `json:"id"`
					Name  string `json:"name"`
					Phone string `json:"phone"`
				}{ID: referrer.ID, Name: referrer.Name, Phone: referrer.Phone}
			}
			if referred, ok := userMap[r.ReferredID]; ok {
				item.Referred = &struct {
					ID    uint   `json:"id"`
					Name  string `json:"name"`
					Phone string `json:"phone"`
				}{ID: referred.ID, Name: referred.Name, Phone: referred.Phone}
			}
			result = append(result, item)
		}

		// Summary stats
		var totalReferrals int64
		db.Model(&models.Referral{}).Count(&totalReferrals)

		var totalBonuses float64
		db.Model(&models.Referral{}).Select("COALESCE(SUM(referrer_bonus + referred_bonus), 0)").Scan(&totalBonuses)

		var activeReferrers int64
		db.Model(&models.Referral{}).Distinct("referrer_id").Count(&activeReferrers)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"referrals":        result,
				"total_referrals":  totalReferrals,
				"total_bonuses":    totalBonuses,
				"active_referrers": activeReferrers,
			},
		})
	}
}
