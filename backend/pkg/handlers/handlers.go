package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
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
		otp := GenerateOTP()
		user := models.User{
			Name: input.Name, Email: input.Email, Phone: input.Phone,
			Password: string(hashedPassword), OTPCode: otp,
			OTPExpiry: time.Now().Add(5 * time.Minute), Role: "user",
			IsVerified: true, // Regular users are auto-verified, only riders need approval
		}
		if err := db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create account"})
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
		otp := GenerateOTP()
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
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if input.PaymentMethod == "" {
			input.PaymentMethod = "cash"
		}
		distance := GetDistance(input.PickupLatitude, input.PickupLongitude, input.DropoffLatitude, input.DropoffLongitude)
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
		ride := models.Ride{
			UserID: userID, PickupLocation: input.PickupLocation, PickupLatitude: input.PickupLatitude, PickupLongitude: input.PickupLongitude,
			DropoffLocation: input.DropoffLocation, DropoffLatitude: input.DropoffLatitude, DropoffLongitude: input.DropoffLongitude,
			Distance: distance, EstimatedFare: fare, VehicleType: input.VehicleType, Status: "pending", PromoID: promoID, PaymentMethod: input.PaymentMethod,
		}
		if err := db.Create(&ride).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create ride"})
			return
		}
		// Notify user of successful ride booking
		if err := db.Create(&models.Notification{UserID: userID, Title: "Ride Booked", Body: "Your ride request has been submitted. A rider will accept soon.", Type: "ride_request"}).Error; err != nil {
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
		if err := db.Where("user_id = ? AND status IN ?", userID, []string{"pending", "accepted", "driver_arrived", "in_progress"}).Preload("Driver").Preload("Driver.User").Order("created_at DESC").Find(&rides).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch active rides"})
			return
		}
		results := make([]gin.H, len(rides))
		for i, r := range rides {
			result := gin.H{"id": r.ID, "status": r.Status, "pickup_location": r.PickupLocation, "pickup_latitude": r.PickupLatitude, "pickup_longitude": r.PickupLongitude, "dropoff_location": r.DropoffLocation, "dropoff_latitude": r.DropoffLatitude, "dropoff_longitude": r.DropoffLongitude, "distance": r.Distance, "estimated_fare": r.EstimatedFare, "final_fare": r.FinalFare, "vehicle_type": r.VehicleType, "payment_method": r.PaymentMethod, "created_at": r.CreatedAt}
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
		var ride models.Ride
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&ride).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Ride not found"})
			return
		}
		if ride.Status == "in_progress" || ride.Status == "completed" || ride.Status == "cancelled" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Cannot cancel ride in " + ride.Status + " status"})
			return
		}
		// Free the driver if one was assigned
		if ride.DriverID != nil {
			if err := db.Model(&models.Driver{}).Where("id = ?", *ride.DriverID).Update("is_available", true).Error; err != nil {
				log.Printf("Failed to free driver %d on ride cancel: %v", *ride.DriverID, err)
			}
		}
		if err := db.Model(&ride).Update("status", "cancelled").Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to cancel ride"})
			return
		}
		// Notify driver if one was assigned
		if ride.DriverID != nil {
			var driver models.Driver
			if err := db.Where("id = ?", *ride.DriverID).First(&driver).Error; err == nil {
				if err := db.Create(&models.Notification{UserID: driver.UserID, Title: "Ride Cancelled", Body: "The passenger cancelled the ride from " + ride.PickupLocation + ".", Type: "ride_cancelled"}).Error; err != nil {
					log.Printf("Failed to create ride cancel notification for driver: %v", err)
				}
			}
		}
		// Notify user
		if err := db.Create(&models.Notification{UserID: ride.UserID, Title: "Ride Cancelled", Body: "Your ride has been cancelled.", Type: "ride_cancelled"}).Error; err != nil {
			log.Printf("Failed to create ride cancel notification: %v", err)
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Ride cancelled", "id": ride.ID}, "timestamp": time.Now()})
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
				var driver models.Driver
				if tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&driver, *ride.DriverID).Error == nil {
					newTotal := driver.TotalRatings + 1
					newRating := ((driver.Rating * float64(driver.TotalRatings)) + input.Rating) / float64(newTotal)
					if err := tx.Model(&driver).Updates(map[string]interface{}{"rating": newRating, "total_ratings": newTotal}).Error; err != nil {
						return err
					}
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
			DriverID: driver.ID, PickupLocation: input.PickupLocation, PickupLatitude: input.PickupLatitude, PickupLongitude: input.PickupLongitude,
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
			if driver.ID == rs.DriverID {
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
			UserID:           userID,
			DriverID:         &rs.DriverID,
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
		var pickupLat, pickupLng, dropoffLat, dropoffLng, weight float64

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

			// Handle file upload
			file, err := c.FormFile("item_photo")
			if err == nil && file != nil {
				os.MkdirAll("uploads", os.ModePerm)
				filename := strconv.FormatUint(uint64(userID), 10) + "_" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "_" + filepath.Base(file.Filename)
				savePath := "uploads/" + filename
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
		}

		if paymentMethod == "" {
			paymentMethod = "cash"
		}
		distance := GetDistance(pickupLat, pickupLng, dropoffLat, dropoffLng)
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
			UserID: userID, PickupLocation: pickupLocation, PickupLatitude: pickupLat, PickupLongitude: pickupLng,
			DropoffLocation: dropoffLocation, DropoffLatitude: dropoffLat, DropoffLongitude: dropoffLng,
			ItemDescription: itemDescription, ItemPhoto: itemPhoto, Notes: notes, Weight: weight, Distance: distance, DeliveryFee: fee, Status: "pending",
			PaymentMethod: paymentMethod, BarcodeNumber: GenerateOTP(), PromoID: promoID,
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
		var d models.Delivery
		if err := db.Where("id = ? AND user_id = ? AND status IN ?", c.Param("id"), userID, []string{"pending", "accepted", "driver_arrived"}).First(&d).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Delivery not found or cannot cancel"})
			return
		}
		if d.DriverID != nil {
			if err := db.Model(&models.Driver{}).Where("id = ?", *d.DriverID).Update("is_available", true).Error; err != nil {
				log.Printf("Failed to free driver %d on delivery cancel: %v", *d.DriverID, err)
			}
		}
		if err := db.Model(&d).Update("status", "cancelled").Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to cancel delivery"})
			return
		}
		// Notify driver if one was assigned
		if d.DriverID != nil {
			var driver models.Driver
			if err := db.Where("id = ?", *d.DriverID).First(&driver).Error; err == nil {
				if err := db.Create(&models.Notification{UserID: driver.UserID, Title: "Delivery Cancelled", Body: "The customer cancelled the delivery from " + d.PickupLocation + ".", Type: "delivery_cancelled"}).Error; err != nil {
					log.Printf("Failed to create delivery cancel notification for driver: %v", err)
				}
			}
		}
		// Notify user
		if err := db.Create(&models.Notification{UserID: d.UserID, Title: "Delivery Cancelled", Body: "Your delivery has been cancelled.", Type: "delivery_cancelled"}).Error; err != nil {
			log.Printf("Failed to create delivery cancel notification: %v", err)
		}
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
				var driver models.Driver
				if tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&driver, *d.DriverID).Error == nil {
					newTotal := driver.TotalRatings + 1
					newRating := ((driver.Rating * float64(driver.TotalRatings)) + input.Rating) / float64(newTotal)
					if err := tx.Model(&driver).Updates(map[string]interface{}{"rating": newRating, "total_ratings": newTotal}).Error; err != nil {
						return err
					}
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
			UserID: userID, StoreID: input.StoreID, Items: datatypes.JSON(input.Items), Subtotal: subtotal, DeliveryFee: deliveryFee, Tax: tax,
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
				os.MkdirAll("uploads", os.ModePerm)
				filename := strconv.FormatUint(uint64(userID), 10) + "_" + field + "_" + strconv.FormatInt(time.Now().UnixMilli(), 10) + "_" + filepath.Base(file.Filename)
				savePath := "uploads/" + filename
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
		// Get pending rides
		var rides []models.Ride
		if err := db.Where("status = ? AND driver_id IS NULL", "pending").Preload("User").Order("created_at DESC").Limit(20).Find(&rides).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch pending rides"})
			return
		}
		results := make([]gin.H, 0, len(rides)+10)
		for _, r := range rides {
			results = append(results, gin.H{"id": r.ID, "type": "ride", "status": "pending", "pickup": r.PickupLocation, "pickup_lat": r.PickupLatitude, "pickup_lng": r.PickupLongitude, "dropoff": r.DropoffLocation, "dropoff_lat": r.DropoffLatitude, "dropoff_lng": r.DropoffLongitude, "distance_km": r.Distance, "estimated_fare": r.EstimatedFare, "vehicle_type": r.VehicleType, "passenger_name": r.User.Name, "passenger_phone": r.User.Phone, "payment_method": r.PaymentMethod, "created_at": r.CreatedAt})
		}
		// Get pending deliveries
		var deliveries []models.Delivery
		if err := db.Where("status = ? AND driver_id IS NULL", "pending").Preload("User").Order("created_at DESC").Limit(20).Find(&deliveries).Error; err != nil {
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
		requestID := c.Param("id")
		// Try ride first
		var ride models.Ride
		rideErr := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND status = ?", requestID, "pending").First(&ride).Error; err != nil {
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
				if err := db.Create(&models.Notification{UserID: ride.UserID, Title: "Ride Accepted", Body: "A driver has accepted your ride request", Type: "ride_request"}).Error; err != nil {
					log.Printf("Failed to create ride accepted notification: %v", err)
				}
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
				if err := db.Create(&models.Notification{UserID: delivery.UserID, Title: "Delivery Accepted", Body: "A driver has accepted your delivery request", Type: "delivery_request"}).Error; err != nil {
					log.Printf("Failed to create delivery accepted notification: %v", err)
				}
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
				tx.Create(&models.Notification{UserID: ride.UserID, Title: "Driver Unavailable", Body: "Your ride is being reassigned to another driver", Type: "ride_request"})
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
				tx.Create(&models.Notification{UserID: delivery.UserID, Title: "Driver Unavailable", Body: "Your delivery is being reassigned to another driver", Type: "delivery_request"})
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
								} else if err := tx.Create(&models.WalletTransaction{
									WalletID: wallet.ID, UserID: ride.UserID, Type: "payment",
									Amount: fare, Description: "Ride payment #" + strconv.Itoa(int(ride.ID)),
									Reference: "RIDE-" + strconv.Itoa(int(ride.ID)),
								}).Error; err != nil {
									log.Printf("Failed to create wallet tx for ride %d: %v", ride.ID, err)
									updates["payment_method"] = "cash"
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
					if err := tx.Create(&models.Notification{UserID: ride.UserID, Title: rideStatusTitle, Body: rideStatusBody, Type: "ride_update"}).Error; err != nil {
						log.Printf("Failed to create ride status notification: %v", err)
					}
				}
				if input.Status == "completed" {
					finalFare := ride.FinalFare
					if finalFare == 0 {
						finalFare = ride.EstimatedFare
					}
					if err := tx.Create(&models.Notification{UserID: ride.UserID, Title: "Ride Completed", Body: "Your ride has been completed. Fare: ₱" + strconv.FormatFloat(finalFare, 'f', 0, 64), Type: "ride"}).Error; err != nil {
						log.Printf("Failed to create ride completed notification: %v", err)
					}
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
								} else if err := tx.Create(&models.WalletTransaction{
									WalletID: wallet.ID, UserID: delivery.UserID, Type: "payment",
									Amount: fee, Description: "Delivery payment #" + strconv.Itoa(int(delivery.ID)),
									Reference: "DEL-" + strconv.Itoa(int(delivery.ID)),
								}).Error; err != nil {
									log.Printf("Failed to create wallet tx for delivery %d: %v", delivery.ID, err)
									updates["payment_method"] = "cash"
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
					if err := tx.Create(&models.Notification{UserID: delivery.UserID, Title: delStatusTitle, Body: delStatusBody, Type: "delivery_update"}).Error; err != nil {
						log.Printf("Failed to create delivery status notification: %v", err)
					}
				}
				if input.Status == "completed" {
					if err := tx.Create(&models.Notification{UserID: delivery.UserID, Title: "Delivery Completed", Body: "Your delivery has been completed. Fee: ₱" + strconv.FormatFloat(delivery.DeliveryFee, 'f', 0, 64), Type: "delivery"}).Error; err != nil {
						log.Printf("Failed to create delivery completed notification: %v", err)
					}
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
		msg := models.ChatMessage{SenderID: userID, ReceiverID: input.ReceiverID, RideID: &rideIDUint, Message: input.Message}
		if err := db.Create(&msg).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to send message"})
			return
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
		result := db.Delete(&models.User{}, id)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete user"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
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
		result := db.Delete(&models.Driver{}, id)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete driver"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
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
		if err := c.ShouldBindJSON(&store); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if err := db.Save(&store).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update store"})
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
		result := db.Delete(&models.Store{}, id)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete store"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Store not found"})
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
		if err := c.ShouldBindJSON(&promo); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		if err := db.Save(&promo).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update promo"})
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
		result := db.Delete(&models.Promo{}, id)
		if result.Error != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete promo"})
			return
		}
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Promo not found"})
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
			}
		case "users":
			if err := db.Model(&models.User{}).Where("role = ?", "user").Pluck("id", &userIDs).Error; err != nil {
				log.Printf("Failed to pluck user IDs: %v", err)
			}
		default: // all
			if err := db.Model(&models.User{}).Pluck("id", &userIDs).Error; err != nil {
				log.Printf("Failed to pluck all user IDs: %v", err)
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
		validRideStatuses := map[string]bool{"pending": true, "accepted": true, "driver_arrived": true, "in_progress": true, "completed": true, "cancelled": true}
		if !validRideStatuses[input.Status] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid status. Must be one of: pending, accepted, driver_arrived, in_progress, completed, cancelled"})
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
			if err := db.Create(&models.Notification{UserID: order.UserID, Title: orderStatusTitle, Body: orderStatusBody, Type: "order_update"}).Error; err != nil {
				log.Printf("Failed to create order status notification: %v", err)
			}
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": order, "timestamp": time.Now()})
	}
}

// ===== WALLET HANDLERS =====

func GetWalletBalance(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var wallet models.Wallet
		if err := db.Where("user_id = ?", userID).First(&wallet).Error; err != nil {
			// Create wallet if not exists
			wallet = models.Wallet{UserID: userID, Balance: 0}
			if err := db.Create(&wallet).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create wallet"})
				return
			}
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
			WalletID:    wallet.ID,
			UserID:      userID,
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
		dbTx.Commit()
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
			WalletID: wallet.ID, UserID: userID, Type: "withdrawal",
			Amount: input.Amount, Description: "Withdrawal to " + input.PaymentMethod,
			Reference: "WD-" + strconv.FormatInt(time.Now().UnixMilli(), 10),
		}
		if err := tx.Create(&transaction).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Withdrawal failed"})
			return
		}
		tx.Commit()
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"balance": wallet.Balance, "transaction": transaction}, "timestamp": time.Now()})
	}
}

// ===== WEBSOCKET HANDLERS =====

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
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
}

func (t *RideTracker) Broadcast(rideID string, msg interface{}) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("WebSocket broadcast marshal error for ride #%s: %v", rideID, err)
		return
	}
	for _, conn := range t.rides[rideID] {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("WebSocket write error for ride #%s: %v", rideID, err)
		}
	}
}

func WebSocketTrackingHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rideID := c.Param("rideId")
		conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}
		defer conn.Close()
		tracker.Add(rideID, conn)
		defer tracker.Remove(rideID, conn)
		log.Printf("WebSocket connected for ride #%s", rideID)
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
							}
							// Process wallet payment via WebSocket
							if ride.PaymentMethod == "wallet" {
								var wallet models.Wallet
								if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", ride.UserID).First(&wallet).Error; err == nil {
									fare := ride.EstimatedFare
									if wallet.Balance >= fare {
										wallet.Balance -= fare
										if err := tx.Save(&wallet).Error; err == nil {
											tx.Create(&models.WalletTransaction{WalletID: wallet.ID, UserID: ride.UserID, Type: "payment", Amount: fare, Description: "Ride payment", Reference: "RIDE-WS"})
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
							tx.Create(&models.Notification{UserID: ride.UserID, Title: nTitle, Body: nBody, Type: "ride_update"})
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
								}
								// Process wallet payment via WebSocket
								if delivery.PaymentMethod == "wallet" {
									var wallet models.Wallet
									if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", delivery.UserID).First(&wallet).Error; err == nil {
										if wallet.Balance >= delivery.DeliveryFee {
											wallet.Balance -= delivery.DeliveryFee
											if err := tx.Save(&wallet).Error; err == nil {
												tx.Create(&models.WalletTransaction{WalletID: wallet.ID, UserID: delivery.UserID, Type: "payment", Amount: delivery.DeliveryFee, Description: "Delivery payment", Reference: "DEL-WS"})
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
								tx.Create(&models.Notification{UserID: delivery.UserID, Title: dTitle, Body: dBody, Type: "delivery_update"})
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
		// Validate driver exists
		var driver models.Driver
		if err := db.First(&driver, driverID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		defer conn.Close()
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
		if input.ServiceType == "ride" && input.VehicleType == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "vehicle_type is required for rides"})
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
