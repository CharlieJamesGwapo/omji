package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
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
		token, _ := GenerateToken(user.ID, user.Email, user.Role)
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
		token, _ := GenerateToken(user.ID, user.Email, user.Role)
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
		db.Model(&user).Updates(map[string]interface{}{"is_verified": true, "otp_code": ""})
		token, _ := GenerateToken(user.ID, user.Email, user.Role)
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
		db.Model(&user).Updates(map[string]interface{}{
			"otp_code":   otp,
			"otp_expiry": time.Now().Add(5 * time.Minute),
		})
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
		db.Model(&models.User{}).Where("id = ?", userID).Updates(updates)
		var user models.User
		db.First(&user, userID)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"id": user.ID, "name": user.Name, "email": user.Email, "phone": user.Phone, "profile_image": user.ProfileImage, "role": user.Role}, "timestamp": time.Now()})
	}
}

func GetSavedAddresses(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var addresses []models.SavedAddress
		db.Where("user_id = ?", userID).Find(&addresses)
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
		db.Create(&addr)
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": addr, "timestamp": time.Now()})
	}
}

func DeleteSavedAddress(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		result := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).Delete(&models.SavedAddress{})
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
		fare := CalculateFare(distance, input.VehicleType)
		var promoID *uint
		if input.PromoCode != "" {
			var promo models.Promo
			if err := db.Where("code = ? AND is_active = ? AND applicable_to IN ?", input.PromoCode, true, []string{"rides", "all"}).First(&promo).Error; err == nil {
				if fare >= promo.MinimumAmount && promo.UsageCount < promo.UsageLimit {
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
					promoID = &promo.ID
					db.Model(&promo).Update("usage_count", gorm.Expr("usage_count + 1"))
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
		c.JSON(http.StatusCreated, gin.H{
			"success":   true,
			"data":      gin.H{"id": ride.ID, "status": ride.Status, "pickup": ride.PickupLocation, "dropoff": ride.DropoffLocation, "distance_km": ride.Distance, "estimated_fare": ride.EstimatedFare, "vehicle_type": ride.VehicleType, "created_at": ride.CreatedAt},
			"timestamp": time.Now(),
		})
	}
}

func GetActiveRides(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var rides []models.Ride
		db.Where("user_id = ? AND status IN ?", userID, []string{"pending", "accepted", "driver_arrived", "in_progress"}).Preload("Driver").Preload("Driver.User").Order("created_at DESC").Find(&rides)
		results := make([]gin.H, len(rides))
		for i, r := range rides {
			result := gin.H{"id": r.ID, "status": r.Status, "pickup_location": r.PickupLocation, "pickup_latitude": r.PickupLatitude, "pickup_longitude": r.PickupLongitude, "dropoff_location": r.DropoffLocation, "dropoff_latitude": r.DropoffLatitude, "dropoff_longitude": r.DropoffLongitude, "distance": r.Distance, "estimated_fare": r.EstimatedFare, "vehicle_type": r.VehicleType, "payment_method": r.PaymentMethod, "created_at": r.CreatedAt}
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
			db.Model(&models.Driver{}).Where("id = ?", *ride.DriverID).Update("is_available", true)
		}
		db.Model(&ride).Update("status", "cancelled")
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
		db.Model(&ride).Updates(map[string]interface{}{"driver_rating": input.Rating, "driver_review": input.Review})
		if ride.DriverID != nil {
			var driver models.Driver
			if db.First(&driver, *ride.DriverID).Error == nil {
				newTotal := driver.TotalRatings + 1
				newRating := ((driver.Rating * float64(driver.TotalRatings)) + input.Rating) / float64(newTotal)
				db.Model(&driver).Updates(map[string]interface{}{"rating": newRating, "total_ratings": newTotal})
			}
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
		depTime, _ := time.Parse(time.RFC3339, input.DepartureTime)
		rs := models.RideShare{
			DriverID: driver.ID, PickupLocation: input.PickupLocation, PickupLatitude: input.PickupLatitude, PickupLongitude: input.PickupLongitude,
			DropoffLocation: input.DropoffLocation, DropoffLatitude: input.DropoffLatitude, DropoffLongitude: input.DropoffLongitude,
			TotalSeats: input.TotalSeats, AvailableSeats: input.TotalSeats, BaseFare: input.BaseFare, Status: "active", DepartureTime: depTime,
		}
		db.Create(&rs)
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": rs, "timestamp": time.Now()})
	}
}

func GetAvailableRideShares(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var shares []models.RideShare
		db.Where("status = ? AND available_seats > 0", "active").Preload("Driver").Preload("Driver.User").Order("departure_time ASC").Find(&shares)
		results := make([]gin.H, len(shares))
		for i, s := range shares {
			result := gin.H{"id": s.ID, "pickup_location": s.PickupLocation, "dropoff_location": s.DropoffLocation, "total_seats": s.TotalSeats, "available_seats": s.AvailableSeats, "base_fare": s.BaseFare, "departure_time": s.DepartureTime, "status": s.Status, "created_at": s.CreatedAt}
			result["driver"] = gin.H{"id": s.Driver.ID, "name": s.Driver.User.Name, "phone": s.Driver.User.Phone, "vehicle_type": s.Driver.VehicleType, "vehicle_plate": s.Driver.VehiclePlate, "rating": s.Driver.Rating}
			results[i] = result
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results, "timestamp": time.Now()})
	}
}

func JoinRideShare(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var rs models.RideShare
		if err := db.Preload("Driver").Where("id = ? AND status = ? AND available_seats > 0", c.Param("id"), "active").First(&rs).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Ride share not available"})
			return
		}
		var user models.User
		db.First(&user, userID)
		db.Model(&rs).Association("Passengers").Append(&user)
		db.Model(&rs).Update("available_seats", gorm.Expr("available_seats - 1"))
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
			PaymentMethod:    "cash",
		}
		db.Create(&ride)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Joined ride share", "fare": rs.BaseFare, "ride_id": ride.ID, "pickup": rs.PickupLocation, "dropoff": rs.DropoffLocation}, "timestamp": time.Now()})
	}
}

// ===== DELIVERY HANDLERS =====

func CreateDelivery(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var pickupLocation, dropoffLocation, itemDescription, itemPhoto, notes, paymentMethod string
		var pickupLat, pickupLng, dropoffLat, dropoffLng, weight float64

		contentType := c.ContentType()
		isMultipart := len(contentType) >= 9 && contentType[:9] == "multipart"
		if isMultipart {
			pickupLocation = c.PostForm("pickup_location")
			dropoffLocation = c.PostForm("dropoff_location")
			itemDescription = c.PostForm("item_description")
			notes = c.PostForm("notes")
			paymentMethod = c.PostForm("payment_method")
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
		}

		if paymentMethod == "" {
			paymentMethod = "cash"
		}
		distance := GetDistance(pickupLat, pickupLng, dropoffLat, dropoffLng)
		if distance < 0.1 {
			distance = 1.0
		}
		fee := 50.0 + (distance * 15.0)
		delivery := models.Delivery{
			UserID: userID, PickupLocation: pickupLocation, PickupLatitude: pickupLat, PickupLongitude: pickupLng,
			DropoffLocation: dropoffLocation, DropoffLatitude: dropoffLat, DropoffLongitude: dropoffLng,
			ItemDescription: itemDescription, ItemPhoto: itemPhoto, Notes: notes, Weight: weight, Distance: distance, DeliveryFee: fee, Status: "pending",
			PaymentMethod: paymentMethod, BarcodeNumber: GenerateOTP(),
		}
		db.Create(&delivery)
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": gin.H{"id": delivery.ID, "status": delivery.Status, "pickup_location": delivery.PickupLocation, "dropoff_location": delivery.DropoffLocation, "distance": delivery.Distance, "delivery_fee": delivery.DeliveryFee, "item_description": delivery.ItemDescription, "item_photo": delivery.ItemPhoto, "payment_method": delivery.PaymentMethod, "created_at": delivery.CreatedAt}, "timestamp": time.Now()})
	}
}

func GetActiveDeliveries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var deliveries []models.Delivery
		db.Where("user_id = ? AND status IN ?", userID, []string{"pending", "accepted", "driver_arrived", "picked_up", "in_progress"}).Preload("Driver").Preload("Driver.User").Order("created_at DESC").Find(&deliveries)
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
			result["driver"] = gin.H{"id": d.Driver.ID, "user_id": d.Driver.UserID, "name": d.Driver.User.Name, "phone": d.Driver.User.Phone, "profile_image": d.Driver.User.ProfileImage, "vehicle_type": d.Driver.VehicleType, "vehicle_model": d.Driver.VehicleModel, "vehicle_plate": d.Driver.VehiclePlate, "rating": d.Driver.Rating, "latitude": d.Driver.CurrentLatitude, "longitude": d.Driver.CurrentLongitude}
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
			db.Model(&models.Driver{}).Where("id = ?", *d.DriverID).Update("is_available", true)
		}
		db.Model(&d).Update("status", "cancelled")
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
		db.Model(&d).Update("driver_rating", input.Rating)
		if d.DriverID != nil {
			var driver models.Driver
			if db.First(&driver, *d.DriverID).Error == nil {
				newTotal := driver.TotalRatings + 1
				newRating := ((driver.Rating * float64(driver.TotalRatings)) + input.Rating) / float64(newTotal)
				db.Model(&driver).Updates(map[string]interface{}{"rating": newRating, "total_ratings": newTotal})
			}
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
		q.Find(&stores)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": stores, "timestamp": time.Now()})
	}
}

func GetStoreMenu(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var items []models.MenuItem
		db.Where("store_id = ? AND available = ?", c.Param("id"), true).Find(&items)
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
		// Calculate subtotal from items using DB prices
		subtotal := 0.0
		var orderItems []struct {
			ItemID   uint `json:"item_id"`
			Quantity int  `json:"quantity"`
		}
		if err := json.Unmarshal(input.Items, &orderItems); err == nil {
			for _, item := range orderItems {
				if item.Quantity > 0 && item.ItemID > 0 {
					var menuItem models.MenuItem
					if err := db.Where("id = ? AND store_id = ?", item.ItemID, input.StoreID).First(&menuItem).Error; err == nil {
						subtotal += menuItem.Price * float64(item.Quantity)
					}
				}
			}
		}
		if subtotal <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid order items"})
			return
		}
		deliveryFee := 30.0
		tax := subtotal * 0.05
		order := models.Order{
			UserID: userID, StoreID: input.StoreID, Items: datatypes.JSON(input.Items), Subtotal: subtotal, DeliveryFee: deliveryFee, Tax: tax,
			TotalAmount: subtotal + deliveryFee + tax, Status: "pending",
			DeliveryLocation: input.DeliveryLocation, DeliveryLatitude: input.DeliveryLatitude, DeliveryLongitude: input.DeliveryLongitude,
			PaymentMethod: input.PaymentMethod,
		}
		db.Create(&order)
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": gin.H{"id": order.ID, "status": order.Status, "total_amount": order.TotalAmount}, "timestamp": time.Now()})
	}
}

func GetActiveOrders(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var orders []models.Order
		db.Where("user_id = ? AND status IN ?", userID, []string{"pending", "confirmed", "preparing", "ready", "out_for_delivery"}).Preload("Store").Order("created_at DESC").Find(&orders)
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
		db.Model(&order).Update("status", "cancelled")
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
		db.Model(&order).Update("store_rating", input.Rating)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Rating submitted"}, "timestamp": time.Now()})
	}
}

func GetOrderHistory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var orders []models.Order
		db.Where("user_id = ?", userID).Preload("Store").Order("created_at DESC").Limit(50).Find(&orders)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": orders, "timestamp": time.Now()})
	}
}

// ===== PAYMENT HANDLERS =====

func GetPaymentMethods(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var methods []models.PaymentMethod
		db.Where("user_id = ?", userID).Find(&methods)
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
		db.Create(&pm)
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": pm, "timestamp": time.Now()})
	}
}

func DeletePaymentMethod(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		result := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).Delete(&models.PaymentMethod{})
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
		query.Order("created_at DESC").Find(&favorites)

		// Enrich with item details
		var result []gin.H
		for _, fav := range favorites {
			item := gin.H{
				"id":         fav.ID,
				"type":       fav.Type,
				"item_id":    fav.ItemID,
				"created_at": fav.CreatedAt,
			}
			if fav.Type == "store" {
				var store models.Store
				if err := db.First(&store, fav.ItemID).Error; err == nil {
					item["name"] = store.Name
					item["category"] = store.Category
					item["rating"] = store.Rating
					item["logo"] = store.Logo
					item["address"] = store.Address
				}
			}
			result = append(result, item)
		}
		if result == nil {
			result = []gin.H{}
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
		itemID := c.Query("item_id")
		var fav models.Favorite
		err := db.Where("user_id = ? AND type = ? AND item_id = ?", userID, itemType, itemID).First(&fav).Error
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"is_favorite": err == nil}, "timestamp": time.Now()})
	}
}

// ===== PROMO HANDLERS =====

func GetAvailablePromos(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var promos []models.Promo
		db.Where("is_active = ? AND usage_count < usage_limit", true).Find(&promos)
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
		db.Model(&models.User{}).Where("id = ?", userID).Update("role", "driver")
		email := c.MustGet("email").(string)
		token, _ := GenerateToken(userID, email, "driver")
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": gin.H{"driver": driver, "token": token}, "timestamp": time.Now()})
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
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"id": driver.ID, "name": driver.User.Name, "phone": driver.User.Phone, "email": driver.User.Email, "vehicle_type": driver.VehicleType, "vehicle_model": driver.VehicleModel, "vehicle_plate": driver.VehiclePlate, "is_verified": driver.IsVerified, "is_available": driver.IsAvailable, "total_earnings": driver.TotalEarnings, "completed_rides": driver.CompletedRides, "rating": driver.Rating, "total_ratings": driver.TotalRatings}, "timestamp": time.Now()})
	}
}

func UpdateDriverProfile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			VehicleModel string `json:"vehicle_model"`
			VehiclePlate string `json:"vehicle_plate"`
		}
		c.ShouldBindJSON(&input)
		updates := map[string]interface{}{}
		if input.VehicleModel != "" {
			updates["vehicle_model"] = input.VehicleModel
		}
		if input.VehiclePlate != "" {
			updates["vehicle_plate"] = input.VehiclePlate
		}
		db.Model(&models.Driver{}).Where("user_id = ?", userID).Updates(updates)
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
		db.Where("driver_id = ? AND status IN ?", driver.ID, []string{"accepted", "driver_arrived", "in_progress"}).Preload("User").Order("created_at DESC").Find(&activeRides)
		active := make([]gin.H, 0, len(activeRides)+5)
		for _, r := range activeRides {
			active = append(active, gin.H{"id": r.ID, "type": "ride", "status": r.Status, "pickup": r.PickupLocation, "pickup_lat": r.PickupLatitude, "pickup_lng": r.PickupLongitude, "dropoff": r.DropoffLocation, "dropoff_lat": r.DropoffLatitude, "dropoff_lng": r.DropoffLongitude, "distance_km": r.Distance, "estimated_fare": r.EstimatedFare, "vehicle_type": r.VehicleType, "passenger_name": r.User.Name, "passenger_phone": r.User.Phone, "payment_method": r.PaymentMethod, "created_at": r.CreatedAt})
		}
		// Get driver's active deliveries
		var activeDeliveries []models.Delivery
		db.Where("driver_id = ? AND status IN ?", driver.ID, []string{"accepted", "driver_arrived", "picked_up", "in_progress"}).Preload("User").Order("created_at DESC").Find(&activeDeliveries)
		for _, d := range activeDeliveries {
			active = append(active, gin.H{"id": d.ID, "type": "delivery", "status": d.Status, "pickup": d.PickupLocation, "pickup_lat": d.PickupLatitude, "pickup_lng": d.PickupLongitude, "dropoff": d.DropoffLocation, "dropoff_lat": d.DropoffLatitude, "dropoff_lng": d.DropoffLongitude, "distance_km": d.Distance, "delivery_fee": d.DeliveryFee, "item_description": d.ItemDescription, "passenger_name": d.User.Name, "passenger_phone": d.User.Phone, "payment_method": d.PaymentMethod, "created_at": d.CreatedAt})
		}
		// Get pending rides
		var rides []models.Ride
		db.Where("status = ? AND driver_id IS NULL", "pending").Preload("User").Order("created_at DESC").Limit(20).Find(&rides)
		results := make([]gin.H, 0, len(rides)+10)
		for _, r := range rides {
			results = append(results, gin.H{"id": r.ID, "type": "ride", "status": "pending", "pickup": r.PickupLocation, "pickup_lat": r.PickupLatitude, "pickup_lng": r.PickupLongitude, "dropoff": r.DropoffLocation, "dropoff_lat": r.DropoffLatitude, "dropoff_lng": r.DropoffLongitude, "distance_km": r.Distance, "estimated_fare": r.EstimatedFare, "vehicle_type": r.VehicleType, "passenger_name": r.User.Name, "passenger_phone": r.User.Phone, "payment_method": r.PaymentMethod, "created_at": r.CreatedAt})
		}
		// Get pending deliveries
		var deliveries []models.Delivery
		db.Where("status = ? AND driver_id IS NULL", "pending").Preload("User").Order("created_at DESC").Limit(20).Find(&deliveries)
		for _, d := range deliveries {
			results = append(results, gin.H{"id": d.ID, "type": "delivery", "status": "pending", "pickup": d.PickupLocation, "pickup_lat": d.PickupLatitude, "pickup_lng": d.PickupLongitude, "dropoff": d.DropoffLocation, "dropoff_lat": d.DropoffLatitude, "dropoff_lng": d.DropoffLongitude, "distance_km": d.Distance, "delivery_fee": d.DeliveryFee, "item_description": d.ItemDescription, "passenger_name": d.User.Name, "passenger_phone": d.User.Phone, "payment_method": d.PaymentMethod, "created_at": d.CreatedAt})
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
		requestID := c.Param("id")
		// Try ride first
		var ride models.Ride
		rideErr := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND status = ?", requestID, "pending").First(&ride).Error; err != nil {
				return err
			}
			ride.DriverID = &driver.ID
			ride.Status = "accepted"
			return tx.Save(&ride).Error
		})
		if rideErr == nil {
			db.Model(&driver).Update("is_available", false)
			// Notify customer
			if ride.ID != 0 {
				db.Create(&models.Notification{UserID: ride.UserID, Title: "Ride Accepted", Body: "A driver has accepted your ride request", Type: "ride_request"})
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
			return tx.Save(&delivery).Error
		})
		if delErr == nil {
			db.Model(&driver).Update("is_available", false)
			if delivery.ID != 0 {
				db.Create(&models.Notification{UserID: delivery.UserID, Title: "Delivery Accepted", Body: "A driver has accepted your delivery request", Type: "delivery_request"})
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Delivery accepted", "ride_id": delivery.ID, "type": "delivery", "status": "accepted", "pickup": delivery.PickupLocation, "dropoff": delivery.DropoffLocation, "fare": delivery.DeliveryFee}, "timestamp": time.Now()})
			return
		}
		c.JSON(http.StatusConflict, gin.H{"success": false, "error": "Request already taken or not found"})
	}
}

func RejectRequest(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Request rejected", "id": c.Param("id")}, "timestamp": time.Now()})
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
		today := time.Now().Truncate(24 * time.Hour)
		var todayRideEarnings float64
		var todayRideCount int64
		var todayDeliveryEarnings float64
		var todayDeliveryCount int64
		db.Model(&models.Ride{}).Where("driver_id = ? AND status = ? AND completed_at >= ?", driver.ID, "completed", today).Count(&todayRideCount)
		db.Model(&models.Ride{}).Where("driver_id = ? AND status = ? AND completed_at >= ?", driver.ID, "completed", today).Select("COALESCE(SUM(final_fare), 0)").Row().Scan(&todayRideEarnings)
		db.Model(&models.Delivery{}).Where("driver_id = ? AND status = ? AND completed_at >= ?", driver.ID, "completed", today).Count(&todayDeliveryCount)
		db.Model(&models.Delivery{}).Where("driver_id = ? AND status = ? AND completed_at >= ?", driver.ID, "completed", today).Select("COALESCE(SUM(delivery_fee), 0)").Row().Scan(&todayDeliveryEarnings)

		// Total breakdown
		var totalRideEarnings float64
		var totalRideCount int64
		var totalDeliveryEarnings float64
		var totalDeliveryCount int64
		db.Model(&models.Ride{}).Where("driver_id = ? AND status = ?", driver.ID, "completed").Count(&totalRideCount)
		db.Model(&models.Ride{}).Where("driver_id = ? AND status = ?", driver.ID, "completed").Select("COALESCE(SUM(final_fare), 0)").Row().Scan(&totalRideEarnings)
		db.Model(&models.Delivery{}).Where("driver_id = ? AND status = ?", driver.ID, "completed").Count(&totalDeliveryCount)
		db.Model(&models.Delivery{}).Where("driver_id = ? AND status = ?", driver.ID, "completed").Select("COALESCE(SUM(delivery_fee), 0)").Row().Scan(&totalDeliveryEarnings)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"total_earnings":   driver.TotalEarnings,
				"completed_rides":  driver.CompletedRides,
				"today_earnings":   todayRideEarnings + todayDeliveryEarnings,
				"today_rides":      todayRideCount + todayDeliveryCount,
				"rating":           driver.Rating,
				"ride_earnings":    totalRideEarnings,
				"ride_count":       totalRideCount,
				"delivery_earnings": totalDeliveryEarnings,
				"delivery_count":   totalDeliveryCount,
				"today_ride_earnings":    todayRideEarnings,
				"today_delivery_earnings": todayDeliveryEarnings,
				"today_ride_count":       todayRideCount,
				"today_delivery_count":   todayDeliveryCount,
			},
			"timestamp": time.Now(),
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
		c.ShouldBindJSON(&input)
		updates := map[string]interface{}{"is_available": input.Available}
		if input.Latitude != 0 {
			updates["current_latitude"] = input.Latitude
			updates["current_longitude"] = input.Longitude
		}
		result := db.Model(&models.Driver{}).Where("user_id = ?", userID).Updates(updates)
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
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
		// Try ride first
		var ride models.Ride
		if err := db.Where("id = ? AND driver_id = ?", rideID, driver.ID).First(&ride).Error; err == nil {
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
				return
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
				db.Model(&driver).Updates(map[string]interface{}{
					"completed_rides": gorm.Expr("completed_rides + 1"),
					"total_earnings":  gorm.Expr("total_earnings + ?", ride.EstimatedFare),
					"is_available":    true,
				})
				// Process wallet payment
				if ride.PaymentMethod == "wallet" {
					walletTx := db.Begin()
					var wallet models.Wallet
					if err := walletTx.Where("user_id = ?", ride.UserID).First(&wallet).Error; err == nil {
						fare := ride.FinalFare
						if fare == 0 {
							fare = ride.EstimatedFare
						}
						if wallet.Balance >= fare {
							wallet.Balance -= fare
							walletTx.Save(&wallet)
							walletTx.Create(&models.WalletTransaction{
								WalletID: wallet.ID, UserID: ride.UserID, Type: "payment",
								Amount: fare, Description: "Ride payment #" + strconv.Itoa(int(ride.ID)),
								Reference: "RIDE-" + strconv.Itoa(int(ride.ID)),
							})
							walletTx.Commit()
						} else {
							walletTx.Rollback()
						}
					} else {
						walletTx.Rollback()
					}
				}
			}
			db.Model(&ride).Updates(updates)
			c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Status updated", "status": input.Status, "id": ride.ID, "type": "ride"}, "timestamp": time.Now()})
			return
		}
		// Try delivery
		var delivery models.Delivery
		if err := db.Where("id = ? AND driver_id = ?", rideID, driver.ID).First(&delivery).Error; err == nil {
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
				return
			}
			updates := map[string]interface{}{"status": input.Status}
			if input.Status == "in_progress" {
				now := time.Now()
				updates["started_at"] = &now
			}
			if input.Status == "completed" {
				now := time.Now()
				updates["completed_at"] = &now
				db.Model(&driver).Updates(map[string]interface{}{
					"completed_rides": gorm.Expr("completed_rides + 1"),
					"total_earnings":  gorm.Expr("total_earnings + ?", delivery.DeliveryFee),
					"is_available":    true,
				})
				// Process wallet payment for delivery
				if delivery.PaymentMethod == "wallet" {
					walletTx := db.Begin()
					var wallet models.Wallet
					if err := walletTx.Where("user_id = ?", delivery.UserID).First(&wallet).Error; err == nil {
						fee := delivery.DeliveryFee
						if wallet.Balance >= fee {
							wallet.Balance -= fee
							walletTx.Save(&wallet)
							walletTx.Create(&models.WalletTransaction{
								WalletID: wallet.ID, UserID: delivery.UserID, Type: "payment",
								Amount: fee, Description: "Delivery payment #" + strconv.Itoa(int(delivery.ID)),
								Reference: "DEL-" + strconv.Itoa(int(delivery.ID)),
							})
							walletTx.Commit()
						} else {
							walletTx.Rollback()
						}
					} else {
						walletTx.Rollback()
					}
				}
			}
			db.Model(&delivery).Updates(updates)
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
		db.Where("user_id = ? AND status IN ?", userID, []string{"completed", "cancelled"}).Preload("Driver").Preload("Driver.User").Order("created_at DESC").Limit(50).Find(&rides)
		results := make([]gin.H, len(rides))
		for i, r := range rides {
			result := gin.H{"id": r.ID, "status": r.Status, "pickup_location": r.PickupLocation, "pickup_latitude": r.PickupLatitude, "pickup_longitude": r.PickupLongitude, "dropoff_location": r.DropoffLocation, "dropoff_latitude": r.DropoffLatitude, "dropoff_longitude": r.DropoffLongitude, "distance_km": r.Distance, "estimated_fare": r.EstimatedFare, "final_fare": r.FinalFare, "vehicle_type": r.VehicleType, "payment_method": r.PaymentMethod, "created_at": r.CreatedAt, "completed_at": r.CompletedAt}
			if r.Driver != nil {
				result["driver"] = gin.H{"id": r.Driver.ID, "name": r.Driver.User.Name, "phone": r.Driver.User.Phone, "rating": r.Driver.Rating, "vehicle_type": r.Driver.VehicleType, "plate_number": r.Driver.VehiclePlate}
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
		db.Where("user_id = ? AND status IN ?", userID, []string{"completed", "cancelled"}).Preload("Driver").Preload("Driver.User").Order("created_at DESC").Limit(50).Find(&deliveries)
		results := make([]gin.H, len(deliveries))
		for i, d := range deliveries {
			result := gin.H{"id": d.ID, "status": d.Status, "pickup_location": d.PickupLocation, "pickup_latitude": d.PickupLatitude, "pickup_longitude": d.PickupLongitude, "dropoff_location": d.DropoffLocation, "dropoff_latitude": d.DropoffLatitude, "dropoff_longitude": d.DropoffLongitude, "distance_km": d.Distance, "delivery_fee": d.DeliveryFee, "payment_method": d.PaymentMethod, "item_description": d.ItemDescription, "created_at": d.CreatedAt, "completed_at": d.CompletedAt}
			if d.Driver != nil {
				result["driver"] = gin.H{"id": d.Driver.ID, "name": d.Driver.User.Name, "phone": d.Driver.User.Phone, "rating": d.Driver.Rating, "vehicle_type": d.Driver.VehicleType, "plate_number": d.Driver.VehiclePlate}
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
		db.Where("ride_id = ? AND (sender_id = ? OR receiver_id = ?)", rideID, userID, userID).Order("created_at ASC").Find(&messages)
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
		rideIDParsed, _ := strconv.ParseUint(rideIDStr, 10, 64)
		rideIDUint := uint(rideIDParsed)
		msg := models.ChatMessage{SenderID: userID, ReceiverID: input.ReceiverID, RideID: &rideIDUint, Message: input.Message}
		db.Create(&msg)
		c.JSON(http.StatusCreated, gin.H{"success": true, "data": msg, "timestamp": time.Now()})
	}
}

// ===== USER NOTIFICATION HANDLERS =====

func GetUserNotifications(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var notifications []models.Notification
		db.Where("user_id = ?", userID).Order("created_at DESC").Limit(50).Find(&notifications)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": notifications, "timestamp": time.Now()})
	}
}

func MarkNotificationRead(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		id := c.Param("id")
		result := db.Model(&models.Notification{}).Where("id = ? AND user_id = ?", id, userID).Update("read", true)
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
		var users []models.User
		db.Order("created_at DESC").Find(&users)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": users, "count": len(users), "timestamp": time.Now()})
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
		result := db.Delete(&models.User{}, c.Param("id"))
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "User not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "User deleted"}, "timestamp": time.Now()})
	}
}

func GetAllDrivers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var drivers []models.Driver
		db.Preload("User").Order("created_at DESC").Find(&drivers)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": drivers, "count": len(drivers), "timestamp": time.Now()})
	}
}

func VerifyDriver(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		result := db.Model(&models.Driver{}).Where("id = ?", c.Param("id")).Update("is_verified", true)
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Driver verified"}, "timestamp": time.Now()})
	}
}

func DeleteDriver(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		result := db.Delete(&models.Driver{}, c.Param("id"))
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
		var stores []models.Store
		db.Order("created_at DESC").Find(&stores)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": stores, "count": len(stores), "timestamp": time.Now()})
	}
}

func CreateStore(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var store models.Store
		if err := c.ShouldBindJSON(&store); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		db.Create(&store)
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
		c.ShouldBindJSON(&store)
		db.Save(&store)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": store, "timestamp": time.Now()})
	}
}

func DeleteStore(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		result := db.Delete(&models.Store{}, c.Param("id"))
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
		var total, completed, cancelled, active int64
		db.Model(&models.Ride{}).Count(&total)
		db.Model(&models.Ride{}).Where("status = ?", "completed").Count(&completed)
		db.Model(&models.Ride{}).Where("status = ?", "cancelled").Count(&cancelled)
		db.Model(&models.Ride{}).Where("status IN ?", []string{"pending", "accepted", "in_progress"}).Count(&active)
		var totalRevenue float64
		db.Model(&models.Ride{}).Where("status = ?", "completed").Select("COALESCE(SUM(final_fare), 0)").Row().Scan(&totalRevenue)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"total": total, "completed": completed, "cancelled": cancelled, "active": active, "total_revenue": totalRevenue}, "timestamp": time.Now()})
	}
}

func GetDeliveriesAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var total, completed, cancelled int64
		db.Model(&models.Delivery{}).Count(&total)
		db.Model(&models.Delivery{}).Where("status = ?", "completed").Count(&completed)
		db.Model(&models.Delivery{}).Where("status = ?", "cancelled").Count(&cancelled)
		var totalRevenue float64
		db.Model(&models.Delivery{}).Where("status = ?", "completed").Select("COALESCE(SUM(delivery_fee), 0)").Row().Scan(&totalRevenue)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"total": total, "completed": completed, "cancelled": cancelled, "total_revenue": totalRevenue}, "timestamp": time.Now()})
	}
}

func GetOrdersAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var total, delivered, cancelled int64
		db.Model(&models.Order{}).Count(&total)
		db.Model(&models.Order{}).Where("status = ?", "delivered").Count(&delivered)
		db.Model(&models.Order{}).Where("status = ?", "cancelled").Count(&cancelled)
		var totalRevenue float64
		db.Model(&models.Order{}).Where("status = ?", "delivered").Select("COALESCE(SUM(total_amount), 0)").Row().Scan(&totalRevenue)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"total": total, "delivered": delivered, "cancelled": cancelled, "total_revenue": totalRevenue}, "timestamp": time.Now()})
	}
}

func GetEarningsAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var rideRevenue, deliveryRevenue, orderRevenue float64
		db.Model(&models.Ride{}).Where("status = ?", "completed").Select("COALESCE(SUM(final_fare), 0)").Row().Scan(&rideRevenue)
		db.Model(&models.Delivery{}).Where("status = ?", "completed").Select("COALESCE(SUM(delivery_fee), 0)").Row().Scan(&deliveryRevenue)
		db.Model(&models.Order{}).Where("status = ?", "delivered").Select("COALESCE(SUM(total_amount), 0)").Row().Scan(&orderRevenue)
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

		var monthlyRevenue []MonthlyData
		now := time.Now()

		// Generate last 12 months of data
		for i := 11; i >= 0; i-- {
			monthStart := time.Date(now.Year(), now.Month()-time.Month(i), 1, 0, 0, 0, 0, time.UTC)
			monthEnd := monthStart.AddDate(0, 1, 0)
			monthName := monthStart.Format("Jan")

			var rideRevenue, deliveryRevenue, orderRevenue float64

			// Get ride revenue for this month
			db.Model(&models.Ride{}).
				Where("status = ? AND created_at >= ? AND created_at < ?", "completed", monthStart, monthEnd).
				Select("COALESCE(SUM(final_fare), 0)").
				Row().Scan(&rideRevenue)

			// Get delivery revenue for this month
			db.Model(&models.Delivery{}).
				Where("status = ? AND created_at >= ? AND created_at < ?", "completed", monthStart, monthEnd).
				Select("COALESCE(SUM(delivery_fee), 0)").
				Row().Scan(&deliveryRevenue)

			// Get order revenue for this month
			db.Model(&models.Order{}).
				Where("status = ? AND created_at >= ? AND created_at < ?", "delivered", monthStart, monthEnd).
				Select("COALESCE(SUM(total_amount), 0)").
				Row().Scan(&orderRevenue)

			totalRevenue := rideRevenue + deliveryRevenue + orderRevenue
			monthlyRevenue = append(monthlyRevenue, MonthlyData{
				Month:   monthName,
				Revenue: totalRevenue,
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

		var growthData []GrowthData
		now := time.Now()

		// Generate last 12 months of data
		for i := 11; i >= 0; i-- {
			monthStart := time.Date(now.Year(), now.Month()-time.Month(i), 1, 0, 0, 0, 0, time.UTC)
			monthEnd := monthStart.AddDate(0, 1, 0)
			monthName := monthStart.Format("Jan")

			var userCount, driverCount, orderCount int64

			// Count users created in this month
			db.Model(&models.User{}).
				Where("created_at >= ? AND created_at < ? AND role = ?", monthStart, monthEnd, "user").
				Count(&userCount)

			// Count drivers created in this month
			db.Model(&models.Driver{}).
				Where("created_at >= ? AND created_at < ?", monthStart, monthEnd).
				Count(&driverCount)

			// Count orders created in this month
			db.Model(&models.Order{}).
				Where("created_at >= ? AND created_at < ?", monthStart, monthEnd).
				Count(&orderCount)

			growthData = append(growthData, GrowthData{
				Month:   monthName,
				Users:   userCount,
				Drivers: driverCount,
				Orders:  orderCount,
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
		var promos []models.Promo
		db.Order("created_at DESC").Find(&promos)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": promos, "count": len(promos), "timestamp": time.Now()})
	}
}

func CreatePromo(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var promo models.Promo
		if err := c.ShouldBindJSON(&promo); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		db.Create(&promo)
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
		c.ShouldBindJSON(&promo)
		db.Save(&promo)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": promo, "timestamp": time.Now()})
	}
}

func DeletePromo(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		result := db.Delete(&models.Promo{}, c.Param("id"))
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
		var rides []models.Ride
		db.Preload("User").Preload("Driver").Preload("Driver.User").Order("created_at DESC").Find(&rides)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": rides, "count": len(rides), "timestamp": time.Now()})
	}
}

// AdminGetAllDeliveries returns all deliveries with user and driver details
func AdminGetAllDeliveries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var deliveries []models.Delivery
		db.Preload("User").Preload("Driver").Preload("Driver.User").Order("created_at DESC").Find(&deliveries)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": deliveries, "count": len(deliveries), "timestamp": time.Now()})
	}
}

// AdminGetAllOrders returns all orders with user and store details
func AdminGetAllOrders(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var orders []models.Order
		db.Preload("User").Preload("Store").Order("created_at DESC").Find(&orders)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": orders, "count": len(orders), "timestamp": time.Now()})
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
		db.Preload("User").Order("created_at DESC").Limit(50).Find(&rides)
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
		db.Preload("User").Order("created_at DESC").Limit(50).Find(&deliveries)
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
		db.Preload("User").Preload("Store").Order("created_at DESC").Limit(50).Find(&orders)
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
		db.Where("role = ?", "user").Order("created_at DESC").Limit(30).Find(&users)
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
		db.Preload("User").Order("created_at DESC").Limit(30).Find(&drivers)
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
		for i := 0; i < len(logs); i++ {
			for j := i + 1; j < len(logs); j++ {
				if logs[j].CreatedAt.After(logs[i].CreatedAt) {
					logs[i], logs[j] = logs[j], logs[i]
				}
			}
		}

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
		var notifications []models.Notification
		db.Order("created_at DESC").Find(&notifications)
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

		// Get target users based on target_type
		var userIDs []uint
		switch input.TargetType {
		case "drivers":
			var drivers []models.Driver
			db.Select("user_id").Find(&drivers)
			for _, d := range drivers {
				userIDs = append(userIDs, d.UserID)
			}
		case "users":
			var users []models.User
			db.Where("role = ?", "user").Select("id").Find(&users)
			for _, u := range users {
				userIDs = append(userIDs, u.ID)
			}
		default: // all
			var users []models.User
			db.Select("id").Find(&users)
			for _, u := range users {
				userIDs = append(userIDs, u.ID)
			}
		}

		sentCount := 0
		for _, uid := range userIDs {
			notif := models.Notification{
				UserID: uid,
				Title:  input.Title,
				Body:   input.Message,
				Type:   notifType,
			}
			if err := db.Create(&notif).Error; err == nil {
				sentCount++
			}
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
		ride.Status = input.Status
		if input.Status == "completed" {
			now := time.Now()
			ride.CompletedAt = &now
			ride.FinalFare = ride.EstimatedFare
		}
		db.Save(&ride)
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
		delivery.Status = input.Status
		if input.Status == "completed" {
			now := time.Now()
			delivery.CompletedAt = &now
		}
		db.Save(&delivery)
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
		order.Status = input.Status
		db.Save(&order)
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
			db.Create(&wallet)
		}
		var transactions []models.WalletTransaction
		db.Where("user_id = ?", userID).Order("created_at DESC").Limit(20).Find(&transactions)
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
		if err := dbTx.Where("user_id = ?", userID).First(&wallet).Error; err != nil {
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
		if err := tx.Where("user_id = ?", userID).First(&wallet).Error; err != nil {
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
	data, _ := json.Marshal(msg)
	for _, conn := range t.rides[rideID] {
		conn.WriteMessage(websocket.TextMessage, data)
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
				updates := map[string]interface{}{"status": msg.Status}
				now := time.Now()
				if msg.Status == "in_progress" {
					updates["started_at"] = now
				}
				if msg.Status == "completed" {
					updates["completed_at"] = now
					var ride models.Ride
					if db.First(&ride, "id = ?", rideID).Error == nil {
						updates["final_fare"] = ride.EstimatedFare
						if ride.DriverID != nil {
							db.Model(&models.Driver{}).Where("id = ?", *ride.DriverID).Updates(map[string]interface{}{"completed_rides": gorm.Expr("completed_rides + 1"), "total_earnings": gorm.Expr("total_earnings + ?", ride.EstimatedFare), "is_available": true})
						}
					}
				}
				db.Model(&models.Ride{}).Where("id = ?", rideID).Updates(updates)
				tracker.Broadcast(rideID, gin.H{"type": "status_update", "status": msg.Status, "timestamp": time.Now()})
			}
		}
	}
}

func WebSocketDriverHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		driverID := c.Param("driverId")
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
				db.Model(&models.Driver{}).Where("id = ?", driverID).Updates(map[string]interface{}{"current_latitude": msg.Latitude, "current_longitude": msg.Longitude})
			}
		}
	}
}
