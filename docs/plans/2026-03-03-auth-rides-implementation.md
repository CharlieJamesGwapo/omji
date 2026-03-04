# Auth + Rides (Pasundo) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make authentication and ride booking fully functional with real database operations, JWT auth, and WebSocket tracking.

**Architecture:** Backend-first approach. Replace all stub handlers in `pkg/handlers/handlers.go` with real implementations that perform GORM database operations. Split the monolithic handlers file into domain-specific files. Wire up mobile app after backend is functional.

**Tech Stack:** Go 1.21, Gin, GORM, PostgreSQL, JWT (golang-jwt/v5), bcrypt (golang.org/x/crypto), Gorilla WebSocket, React Native (Expo)

---

## Prerequisites

- PostgreSQL running locally with database `omji_db` created
- Go 1.21+ installed
- Node.js 16+ and Expo CLI for mobile

---

### Task 1: Fix project structure and add JWT helper

**Files:**
- Move: `backend/pkg/services/utils.go` -> `backend/pkg/handlers/utils.go`
- Create: `backend/pkg/handlers/jwt.go`

**Step 1: Move utils.go to correct package directory**

The file `pkg/services/utils.go` declares `package handlers` but lives in the `services/` directory. This is a Go compilation error. Move it:

```bash
cd /Users/dev3/omji/backend
mv pkg/services/utils.go pkg/handlers/utils.go
rmdir pkg/services 2>/dev/null || true
```

**Step 2: Fix the Haversine distance calculation in utils.go**

Replace the broken `GetDistance` function in `pkg/handlers/utils.go` with a correct implementation:

```go
package handlers

import (
	"crypto/rand"
	"fmt"
	"math"
	"math/big"
	"time"

	"omji/pkg/models"

	"gorm.io/gorm"
)

// GenerateOTP generates a random 6-digit OTP
func GenerateOTP() string {
	max := big.NewInt(900000)
	num, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "123456"
	}
	return fmt.Sprintf("%06d", num.Int64()+100000)
}

// CalculateFare calculates the fare based on distance and vehicle type
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

// SendOTPEmail prints OTP to console (production: send via email)
func SendOTPEmail(email, otp string) error {
	fmt.Printf("OTP for %s: %s (expires in 5 minutes)\n", email, otp)
	return nil
}

// SendOTPSMS prints OTP to console (production: send via SMS)
func SendOTPSMS(phone, otp string) error {
	fmt.Printf("SMS OTP for %s: %s (expires in 5 minutes)\n", phone, otp)
	return nil
}

// UpdateOTP updates the OTP for a user
func UpdateOTP(db *gorm.DB, email string) (string, error) {
	otp := GenerateOTP()
	expiry := time.Now().Add(5 * time.Minute)

	if err := db.Model(&models.User{}).Where("email = ?", email).Updates(map[string]interface{}{
		"otp_code":   otp,
		"otp_expiry": expiry,
	}).Error; err != nil {
		return "", err
	}

	return otp, nil
}

// GetDistance calculates distance between two coordinates using Haversine formula
func GetDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371 // Earth radius in km

	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	lat1Rad := lat1 * math.Pi / 180
	lat2Rad := lat2 * math.Pi / 180

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return math.Round(R*c*100) / 100
}
```

**Step 3: Create JWT helper**

Create `backend/pkg/handlers/jwt.go`:

```go
package handlers

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Must match the secret in middleware/middleware.go
const jwtSecret = "your-super-secret-key-change-in-production"

func GenerateToken(userID uint, email, role string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": float64(userID),
		"email":   email,
		"role":    role,
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(jwtSecret))
}
```

**Step 4: Verify the project compiles**

```bash
cd /Users/dev3/omji/backend && go build ./...
```

Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add -A && git commit -m "fix: move utils.go to handlers package, fix Haversine, add JWT helper"
```

---

### Task 2: Implement auth handlers (Register, Login, VerifyOTP)

**Files:**
- Create: `backend/pkg/handlers/auth_handlers.go`
- Modify: `backend/pkg/handlers/handlers.go` (remove auth stubs at lines 8-25)

**Step 1: Create auth_handlers.go**

Create `backend/pkg/handlers/auth_handlers.go`:

```go
package handlers

import (
	"net/http"
	"time"

	"omji/pkg/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type RegisterInput struct {
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Phone    string `json:"phone" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
}

func Register(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input RegisterInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		// Check if email already exists
		var existing models.User
		if err := db.Where("email = ?", input.Email).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"error":   "Email already registered",
			})
			return
		}

		// Check if phone already exists
		if err := db.Where("phone = ?", input.Phone).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"error":   "Phone number already registered",
			})
			return
		}

		// Hash password
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to process password",
			})
			return
		}

		// Generate OTP
		otp := GenerateOTP()

		user := models.User{
			Name:       input.Name,
			Email:      input.Email,
			Phone:      input.Phone,
			Password:   string(hashedPassword),
			OTPCode:    otp,
			OTPExpiry:  time.Now().Add(5 * time.Minute),
			IsVerified: false,
			Role:       "user",
		}

		if err := db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to create account",
			})
			return
		}

		// Log OTP to console (production: send via SMS/email)
		SendOTPSMS(input.Phone, otp)
		SendOTPEmail(input.Email, otp)

		// Generate token so user can use the app immediately
		token, _ := GenerateToken(user.ID, user.Email, user.Role)

		c.JSON(http.StatusCreated, gin.H{
			"success": true,
			"data": gin.H{
				"token": token,
				"user": gin.H{
					"id":    user.ID,
					"name":  user.Name,
					"email": user.Email,
					"phone": user.Phone,
					"role":  user.Role,
				},
				"otp": otp, // Remove in production
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
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		if input.Email == "" && input.Phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Email or phone is required",
			})
			return
		}

		// Find user by email or phone
		var user models.User
		query := db
		if input.Email != "" {
			query = query.Where("email = ?", input.Email)
		} else {
			query = query.Where("phone = ?", input.Phone)
		}

		if err := query.First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid credentials",
			})
			return
		}

		// Verify password
		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid credentials",
			})
			return
		}

		// Generate JWT
		token, err := GenerateToken(user.ID, user.Email, user.Role)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to generate token",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"token": token,
				"user": gin.H{
					"id":          user.ID,
					"name":        user.Name,
					"email":       user.Email,
					"phone":       user.Phone,
					"role":        user.Role,
					"is_verified": user.IsVerified,
					"rating":      user.Rating,
				},
			},
			"timestamp": time.Now(),
		})
	}
}

type VerifyOTPInput struct {
	Phone string `json:"phone" binding:"required"`
	OTP   string `json:"otp" binding:"required"`
}

func VerifyOTP(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input VerifyOTPInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		var user models.User
		if err := db.Where("phone = ?", input.Phone).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "User not found",
			})
			return
		}

		// Check OTP
		if user.OTPCode != input.OTP {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Invalid OTP",
			})
			return
		}

		// Check OTP expiry
		if time.Now().After(user.OTPExpiry) {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "OTP has expired",
			})
			return
		}

		// Mark user as verified
		db.Model(&user).Updates(map[string]interface{}{
			"is_verified": true,
			"otp_code":    "",
		})

		// Generate fresh token
		token, _ := GenerateToken(user.ID, user.Email, user.Role)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"token": token,
				"user": gin.H{
					"id":          user.ID,
					"name":        user.Name,
					"email":       user.Email,
					"phone":       user.Phone,
					"role":        user.Role,
					"is_verified": true,
				},
			},
			"timestamp": time.Now(),
		})
	}
}
```

**Step 2: Remove auth stubs from handlers.go**

In `backend/pkg/handlers/handlers.go`, delete lines 8-25 (the Register, Login, VerifyOTP stubs). Keep the rest.

**Step 3: Verify it compiles**

```bash
cd /Users/dev3/omji/backend && go build ./...
```

**Step 4: Start server and test register**

```bash
cd /Users/dev3/omji/backend && go run cmd/main.go &
sleep 2
curl -s -X POST http://localhost:8080/api/v1/public/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@omji.app","phone":"+639123456789","password":"password123"}' | python3 -m json.tool
```

Expected: 201 response with token, user object, and OTP.

**Step 5: Test login**

```bash
curl -s -X POST http://localhost:8080/api/v1/public/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@omji.app","password":"password123"}' | python3 -m json.tool
```

Expected: 200 response with token and user data.

**Step 6: Test OTP verification**

Use the OTP from the register response:

```bash
curl -s -X POST http://localhost:8080/api/v1/public/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+639123456789","otp":"<OTP_FROM_REGISTER>"}' | python3 -m json.tool
```

Expected: 200 response with token and is_verified: true.

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: implement auth handlers (register, login, verify-otp)"
```

---

### Task 3: Implement user profile handlers

**Files:**
- Create: `backend/pkg/handlers/user_handlers.go`
- Modify: `backend/pkg/handlers/handlers.go` (remove user stubs at lines 27-56)

**Step 1: Create user_handlers.go**

Create `backend/pkg/handlers/user_handlers.go`:

```go
package handlers

import (
	"net/http"
	"time"

	"omji/pkg/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func GetUserProfile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "User not found",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"id":            user.ID,
				"name":          user.Name,
				"email":         user.Email,
				"phone":         user.Phone,
				"profile_image": user.ProfileImage,
				"role":          user.Role,
				"is_verified":   user.IsVerified,
				"rating":        user.Rating,
				"total_ratings": user.TotalRatings,
				"created_at":    user.CreatedAt,
			},
			"timestamp": time.Now(),
		})
	}
}

type UpdateProfileInput struct {
	Name         string `json:"name"`
	Phone        string `json:"phone"`
	ProfileImage string `json:"profile_image"`
}

func UpdateUserProfile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var input UpdateProfileInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
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

		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "No fields to update",
			})
			return
		}

		if err := db.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to update profile",
			})
			return
		}

		var user models.User
		db.First(&user, userID)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"id":            user.ID,
				"name":          user.Name,
				"email":         user.Email,
				"phone":         user.Phone,
				"profile_image": user.ProfileImage,
				"role":          user.Role,
			},
			"timestamp": time.Now(),
		})
	}
}

func GetSavedAddresses(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var addresses []models.SavedAddress
		db.Where("user_id = ?", userID).Find(&addresses)

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      addresses,
			"timestamp": time.Now(),
		})
	}
}

type AddAddressInput struct {
	Label     string  `json:"label" binding:"required"`
	Address   string  `json:"address" binding:"required"`
	Latitude  float64 `json:"latitude" binding:"required"`
	Longitude float64 `json:"longitude" binding:"required"`
}

func AddSavedAddress(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var input AddAddressInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		address := models.SavedAddress{
			UserID:    userID,
			Label:     input.Label,
			Address:   input.Address,
			Latitude:  input.Latitude,
			Longitude: input.Longitude,
		}

		if err := db.Create(&address).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to save address",
			})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"success":   true,
			"data":      address,
			"timestamp": time.Now(),
		})
	}
}

func DeleteSavedAddress(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		addressID := c.Param("id")

		result := db.Where("id = ? AND user_id = ?", addressID, userID).Delete(&models.SavedAddress{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Address not found",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      gin.H{"message": "Address deleted"},
			"timestamp": time.Now(),
		})
	}
}
```

**Step 2: Remove user stubs from handlers.go**

Delete the `GetUserProfile`, `UpdateUserProfile`, `GetSavedAddresses`, `AddSavedAddress`, `DeleteSavedAddress` stubs from `handlers.go` (lines 27-56).

**Step 3: Verify and test**

```bash
cd /Users/dev3/omji/backend && go build ./...
```

Test with a valid token from the login step:

```bash
TOKEN="<token_from_login>"
curl -s http://localhost:8080/api/v1/user/profile \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: 200 with user profile data.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: implement user profile handlers (get, update, addresses)"
```

---

### Task 4: Implement ride handlers (create, active, details, cancel, rate)

**Files:**
- Create: `backend/pkg/handlers/ride_handlers.go`
- Modify: `backend/pkg/handlers/handlers.go` (remove ride stubs at lines 58-87)

**Step 1: Create ride_handlers.go**

Create `backend/pkg/handlers/ride_handlers.go`:

```go
package handlers

import (
	"net/http"
	"strconv"
	"time"

	"omji/pkg/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type CreateRideInput struct {
	PickupLocation  string  `json:"pickup_location" binding:"required"`
	PickupLatitude  float64 `json:"pickup_latitude" binding:"required"`
	PickupLongitude float64 `json:"pickup_longitude" binding:"required"`
	DropoffLocation string  `json:"dropoff_location" binding:"required"`
	DropoffLatitude float64 `json:"dropoff_latitude" binding:"required"`
	DropoffLongitude float64 `json:"dropoff_longitude" binding:"required"`
	VehicleType     string  `json:"vehicle_type" binding:"required"`
	PromoCode       string  `json:"promo_code"`
}

func CreateRide(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var input CreateRideInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		if input.VehicleType != "motorcycle" && input.VehicleType != "car" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Vehicle type must be 'motorcycle' or 'car'",
			})
			return
		}

		// Calculate distance and fare
		distance := GetDistance(
			input.PickupLatitude, input.PickupLongitude,
			input.DropoffLatitude, input.DropoffLongitude,
		)
		fare := CalculateFare(distance, input.VehicleType)

		// Apply promo if provided
		var promoID *uint
		if input.PromoCode != "" {
			var promo models.Promo
			if err := db.Where("code = ? AND is_active = ? AND applicable_to IN ?",
				input.PromoCode, true, []string{"rides", "all"}).First(&promo).Error; err == nil {
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
					db.Model(&promo).Update("usage_count", promo.UsageCount+1)
				}
			}
		}

		ride := models.Ride{
			UserID:           userID,
			PickupLocation:   input.PickupLocation,
			PickupLatitude:   input.PickupLatitude,
			PickupLongitude:  input.PickupLongitude,
			DropoffLocation:  input.DropoffLocation,
			DropoffLatitude:  input.DropoffLatitude,
			DropoffLongitude: input.DropoffLongitude,
			Distance:         distance,
			EstimatedFare:    fare,
			VehicleType:      input.VehicleType,
			Status:           "pending",
			PromoID:          promoID,
		}

		if err := db.Create(&ride).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to create ride",
			})
			return
		}

		// Notify available drivers via WebSocket (broadcast)
		BroadcastToDrivers(ride)

		c.JSON(http.StatusCreated, gin.H{
			"success": true,
			"data": gin.H{
				"id":             ride.ID,
				"status":         ride.Status,
				"pickup":         ride.PickupLocation,
				"dropoff":        ride.DropoffLocation,
				"distance_km":    ride.Distance,
				"estimated_fare": ride.EstimatedFare,
				"vehicle_type":   ride.VehicleType,
			},
			"timestamp": time.Now(),
		})
	}
}

func GetActiveRides(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var rides []models.Ride
		db.Where("user_id = ? AND status IN ?", userID,
			[]string{"pending", "accepted", "in_progress"}).
			Preload("Driver").Preload("Driver.User").
			Order("created_at DESC").
			Find(&rides)

		results := make([]gin.H, len(rides))
		for i, ride := range rides {
			result := gin.H{
				"id":             ride.ID,
				"status":         ride.Status,
				"pickup":         ride.PickupLocation,
				"dropoff":        ride.DropoffLocation,
				"distance_km":    ride.Distance,
				"estimated_fare": ride.EstimatedFare,
				"vehicle_type":   ride.VehicleType,
				"created_at":     ride.CreatedAt,
			}
			if ride.Driver != nil {
				result["driver"] = gin.H{
					"id":           ride.Driver.ID,
					"name":         ride.Driver.User.Name,
					"phone":        ride.Driver.User.Phone,
					"vehicle_type": ride.Driver.VehicleType,
					"vehicle_plate": ride.Driver.VehiclePlate,
					"rating":       ride.Driver.Rating,
					"latitude":     ride.Driver.CurrentLatitude,
					"longitude":    ride.Driver.CurrentLongitude,
				}
			}
			results[i] = result
		}

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      results,
			"timestamp": time.Now(),
		})
	}
}

func GetRideDetails(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		rideID := c.Param("id")

		var ride models.Ride
		if err := db.Preload("Driver").Preload("Driver.User").
			Where("id = ? AND user_id = ?", rideID, userID).
			First(&ride).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Ride not found",
			})
			return
		}

		result := gin.H{
			"id":              ride.ID,
			"status":          ride.Status,
			"pickup":          ride.PickupLocation,
			"pickup_lat":      ride.PickupLatitude,
			"pickup_lng":      ride.PickupLongitude,
			"dropoff":         ride.DropoffLocation,
			"dropoff_lat":     ride.DropoffLatitude,
			"dropoff_lng":     ride.DropoffLongitude,
			"distance_km":     ride.Distance,
			"estimated_fare":  ride.EstimatedFare,
			"final_fare":      ride.FinalFare,
			"vehicle_type":    ride.VehicleType,
			"user_rating":     ride.UserRating,
			"driver_rating":   ride.DriverRating,
			"started_at":      ride.StartedAt,
			"completed_at":    ride.CompletedAt,
			"created_at":      ride.CreatedAt,
		}
		if ride.Driver != nil {
			result["driver"] = gin.H{
				"id":            ride.Driver.ID,
				"name":          ride.Driver.User.Name,
				"phone":         ride.Driver.User.Phone,
				"vehicle_type":  ride.Driver.VehicleType,
				"vehicle_model": ride.Driver.VehicleModel,
				"vehicle_plate": ride.Driver.VehiclePlate,
				"rating":        ride.Driver.Rating,
				"latitude":      ride.Driver.CurrentLatitude,
				"longitude":     ride.Driver.CurrentLongitude,
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      result,
			"timestamp": time.Now(),
		})
	}
}

type CancelRideInput struct {
	Reason string `json:"reason"`
}

func CancelRide(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		rideID := c.Param("id")

		var ride models.Ride
		if err := db.Where("id = ? AND user_id = ?", rideID, userID).First(&ride).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Ride not found",
			})
			return
		}

		if ride.Status == "in_progress" || ride.Status == "completed" || ride.Status == "cancelled" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Cannot cancel ride with status: " + ride.Status,
			})
			return
		}

		db.Model(&ride).Updates(map[string]interface{}{
			"status":      "cancelled",
			"user_review": c.DefaultQuery("reason", "Cancelled by user"),
		})

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    gin.H{"message": "Ride cancelled", "id": ride.ID},
			"timestamp": time.Now(),
		})
	}
}

type RateRideInput struct {
	Rating float64 `json:"rating" binding:"required,min=1,max=5"`
	Review string  `json:"review"`
}

func RateRide(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		rideID := c.Param("id")

		var input RateRideInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		var ride models.Ride
		if err := db.Where("id = ? AND user_id = ? AND status = ?",
			rideID, userID, "completed").First(&ride).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Completed ride not found",
			})
			return
		}

		// Save user's rating of the driver
		db.Model(&ride).Updates(map[string]interface{}{
			"driver_rating": input.Rating,
			"driver_review": input.Review,
		})

		// Update driver's average rating
		if ride.DriverID != nil {
			var driver models.Driver
			if err := db.First(&driver, *ride.DriverID).Error; err == nil {
				newTotal := driver.TotalRatings + 1
				newRating := ((driver.Rating * float64(driver.TotalRatings)) + input.Rating) / float64(newTotal)
				db.Model(&driver).Updates(map[string]interface{}{
					"rating":        newRating,
					"total_ratings": newTotal,
				})
			}
		}

		rideIDNum, _ := strconv.Atoi(rideID)
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    gin.H{"message": "Rating submitted", "ride_id": rideIDNum},
			"timestamp": time.Now(),
		})
	}
}
```

**Step 2: Remove ride stubs from handlers.go**

Delete `CreateRide`, `GetActiveRides`, `GetRideDetails`, `CancelRide`, `RateRide` stubs from `handlers.go` (lines 58-87).

**Step 3: Verify and test**

```bash
cd /Users/dev3/omji/backend && go build ./...
```

Test creating a ride:

```bash
TOKEN="<token_from_login>"
curl -s -X POST http://localhost:8080/api/v1/rides/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_location": "SM Balingasag",
    "pickup_latitude": 8.4343,
    "pickup_longitude": 124.5000,
    "dropoff_location": "Poblacion",
    "dropoff_latitude": 8.4400,
    "dropoff_longitude": 124.5100,
    "vehicle_type": "motorcycle"
  }' | python3 -m json.tool
```

Expected: 201 with ride ID, distance, and fare.

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: implement ride handlers (create, active, details, cancel, rate)"
```

---

### Task 5: Implement driver handlers

**Files:**
- Create: `backend/pkg/handlers/driver_handlers.go`
- Modify: `backend/pkg/handlers/handlers.go` (remove driver stubs at lines 239-286)

**Step 1: Create driver_handlers.go**

Create `backend/pkg/handlers/driver_handlers.go`:

```go
package handlers

import (
	"net/http"
	"time"

	"omji/pkg/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type RegisterDriverInput struct {
	VehicleType   string `json:"vehicle_type" binding:"required"`
	VehicleModel  string `json:"vehicle_model" binding:"required"`
	VehiclePlate  string `json:"vehicle_plate" binding:"required"`
	LicenseNumber string `json:"license_number" binding:"required"`
}

func RegisterDriver(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var input RegisterDriverInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		if input.VehicleType != "motorcycle" && input.VehicleType != "car" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   "Vehicle type must be 'motorcycle' or 'car'",
			})
			return
		}

		// Check if already registered as driver
		var existing models.Driver
		if err := db.Where("user_id = ?", userID).First(&existing).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"error":   "Already registered as a driver",
			})
			return
		}

		driver := models.Driver{
			UserID:        userID,
			VehicleType:   input.VehicleType,
			VehicleModel:  input.VehicleModel,
			VehiclePlate:  input.VehiclePlate,
			LicenseNumber: input.LicenseNumber,
			IsVerified:    true, // Auto-verify for now
			IsAvailable:   false,
		}

		if err := db.Create(&driver).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to register driver: " + err.Error(),
			})
			return
		}

		// Update user role to driver
		db.Model(&models.User{}).Where("id = ?", userID).Update("role", "driver")

		// Re-generate token with new role
		email := c.MustGet("email").(string)
		token, _ := GenerateToken(userID, email, "driver")

		c.JSON(http.StatusCreated, gin.H{
			"success": true,
			"data": gin.H{
				"driver": driver,
				"token":  token,
			},
			"timestamp": time.Now(),
		})
	}
}

func GetDriverProfile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var driver models.Driver
		if err := db.Preload("User").Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Driver profile not found",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"id":              driver.ID,
				"name":            driver.User.Name,
				"phone":           driver.User.Phone,
				"email":           driver.User.Email,
				"vehicle_type":    driver.VehicleType,
				"vehicle_model":   driver.VehicleModel,
				"vehicle_plate":   driver.VehiclePlate,
				"is_verified":     driver.IsVerified,
				"is_available":    driver.IsAvailable,
				"total_earnings":  driver.TotalEarnings,
				"completed_rides": driver.CompletedRides,
				"rating":          driver.Rating,
				"total_ratings":   driver.TotalRatings,
			},
			"timestamp": time.Now(),
		})
	}
}

type UpdateDriverInput struct {
	VehicleModel string `json:"vehicle_model"`
	VehiclePlate string `json:"vehicle_plate"`
}

func UpdateDriverProfile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var input UpdateDriverInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		updates := map[string]interface{}{}
		if input.VehicleModel != "" {
			updates["vehicle_model"] = input.VehicleModel
		}
		if input.VehiclePlate != "" {
			updates["vehicle_plate"] = input.VehiclePlate
		}

		if err := db.Model(&models.Driver{}).Where("user_id = ?", userID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to update profile",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      gin.H{"message": "Profile updated"},
			"timestamp": time.Now(),
		})
	}
}

func GetDriverRequests(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		// Get driver's info for vehicle type matching and location
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Driver not found",
			})
			return
		}

		// Find pending rides matching driver's vehicle type
		var rides []models.Ride
		query := db.Where("status = ? AND vehicle_type = ?", "pending", driver.VehicleType).
			Preload("User").
			Order("created_at DESC").
			Limit(20)

		// If driver has location, filter by 5km radius
		if driver.CurrentLatitude != 0 && driver.CurrentLongitude != 0 {
			// Simple bounding box filter (approx 5km)
			latDelta := 0.045 // ~5km
			lngDelta := 0.045
			query = query.Where(
				"pickup_latitude BETWEEN ? AND ? AND pickup_longitude BETWEEN ? AND ?",
				driver.CurrentLatitude-latDelta, driver.CurrentLatitude+latDelta,
				driver.CurrentLongitude-lngDelta, driver.CurrentLongitude+lngDelta,
			)
		}

		query.Find(&rides)

		results := make([]gin.H, len(rides))
		for i, ride := range rides {
			results[i] = gin.H{
				"id":             ride.ID,
				"pickup":         ride.PickupLocation,
				"pickup_lat":     ride.PickupLatitude,
				"pickup_lng":     ride.PickupLongitude,
				"dropoff":        ride.DropoffLocation,
				"dropoff_lat":    ride.DropoffLatitude,
				"dropoff_lng":    ride.DropoffLongitude,
				"distance_km":    ride.Distance,
				"estimated_fare": ride.EstimatedFare,
				"vehicle_type":   ride.VehicleType,
				"passenger_name": ride.User.Name,
				"passenger_phone": ride.User.Phone,
				"created_at":     ride.CreatedAt,
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      results,
			"timestamp": time.Now(),
		})
	}
}

func AcceptRequest(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		rideID := c.Param("id")

		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Driver not found",
			})
			return
		}

		// Use pessimistic locking to prevent double-accept
		var ride models.Ride
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("id = ? AND status = ?", rideID, "pending").
				First(&ride).Error; err != nil {
				return err
			}

			ride.DriverID = &driver.ID
			ride.Status = "accepted"
			return tx.Save(&ride).Error
		})

		if err != nil {
			c.JSON(http.StatusConflict, gin.H{
				"success": false,
				"error":   "Ride already taken or not found",
			})
			return
		}

		// Mark driver as unavailable
		db.Model(&driver).Update("is_available", false)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"message":  "Ride accepted",
				"ride_id":  ride.ID,
				"status":   "accepted",
				"pickup":   ride.PickupLocation,
				"dropoff":  ride.DropoffLocation,
				"fare":     ride.EstimatedFare,
			},
			"timestamp": time.Now(),
		})
	}
}

func RejectRequest(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Driver simply doesn't accept -- no action needed on the ride
		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"data":      gin.H{"message": "Request declined"},
			"timestamp": time.Now(),
		})
	}
}

func GetDriverEarnings(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Driver not found",
			})
			return
		}

		// Get today's earnings
		today := time.Now().Truncate(24 * time.Hour)
		var todayEarnings float64
		var todayRides int64
		db.Model(&models.Ride{}).
			Where("driver_id = ? AND status = ? AND completed_at >= ?",
				driver.ID, "completed", today).
			Count(&todayRides).
			Select("COALESCE(SUM(final_fare), 0)").
			Row().Scan(&todayEarnings)

		// Get this week's earnings
		weekStart := today.AddDate(0, 0, -int(today.Weekday()))
		var weekEarnings float64
		var weekRides int64
		db.Model(&models.Ride{}).
			Where("driver_id = ? AND status = ? AND completed_at >= ?",
				driver.ID, "completed", weekStart).
			Count(&weekRides).
			Select("COALESCE(SUM(final_fare), 0)").
			Row().Scan(&weekEarnings)

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"total_earnings":  driver.TotalEarnings,
				"completed_rides": driver.CompletedRides,
				"today_earnings":  todayEarnings,
				"today_rides":     todayRides,
				"week_earnings":   weekEarnings,
				"week_rides":      weekRides,
				"rating":          driver.Rating,
			},
			"timestamp": time.Now(),
		})
	}
}

type SetAvailabilityInput struct {
	Available bool    `json:"available"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

func SetAvailability(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		var input SetAvailabilityInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"error":   err.Error(),
			})
			return
		}

		updates := map[string]interface{}{
			"is_available": input.Available,
		}
		if input.Latitude != 0 {
			updates["current_latitude"] = input.Latitude
			updates["current_longitude"] = input.Longitude
		}

		result := db.Model(&models.Driver{}).Where("user_id = ?", userID).Updates(updates)
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "Driver not found",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"available": input.Available,
				"message":   "Availability updated",
			},
			"timestamp": time.Now(),
		})
	}
}
```

**Step 2: Remove driver stubs from handlers.go**

Delete `RegisterDriver`, `GetDriverProfile`, `UpdateDriverProfile`, `GetDriverRequests`, `AcceptRequest`, `RejectRequest`, `GetDriverEarnings`, `SetAvailability` stubs from `handlers.go` (lines 239-286).

**Step 3: Verify and test**

```bash
cd /Users/dev3/omji/backend && go build ./...
```

Test registering as a driver:

```bash
TOKEN="<token_from_login>"
curl -s -X POST http://localhost:8080/api/v1/driver/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_type": "motorcycle",
    "vehicle_model": "Honda Click 125i",
    "vehicle_plate": "ABC-1234",
    "license_number": "N01-12-345678"
  }' | python3 -m json.tool
```

Expected: 201 with driver data and new token with role "driver".

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: implement driver handlers (register, profile, requests, accept, earnings)"
```

---

### Task 6: Implement WebSocket tracking

**Files:**
- Create: `backend/pkg/handlers/websocket_handlers.go`
- Modify: `backend/pkg/handlers/handlers.go` (remove WebSocket stubs at lines 388-399)

**Step 1: Create websocket_handlers.go**

Create `backend/pkg/handlers/websocket_handlers.go`:

```go
package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"omji/pkg/models"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Track active WebSocket connections per ride
type RideTracker struct {
	mu    sync.RWMutex
	rides map[string][]*websocket.Conn
}

var tracker = &RideTracker{
	rides: make(map[string][]*websocket.Conn),
}

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

// BroadcastToDrivers sends new ride notifications (called from CreateRide)
func BroadcastToDrivers(ride models.Ride) {
	// In production, this would target specific nearby drivers
	// For now, log the broadcast
	log.Printf("Broadcasting ride #%d to nearby drivers (pickup: %s)", ride.ID, ride.PickupLocation)
}

type WSMessage struct {
	Type      string  `json:"type"` // location_update, status_update, ride_complete
	Latitude  float64 `json:"latitude,omitempty"`
	Longitude float64 `json:"longitude,omitempty"`
	Status    string  `json:"status,omitempty"`
	RideID    string  `json:"ride_id,omitempty"`
}

func WebSocketTrackingHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rideID := c.Param("rideId")

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
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
				log.Printf("WebSocket read error for ride #%s: %v", rideID, err)
				break
			}

			var msg WSMessage
			if err := json.Unmarshal(message, &msg); err != nil {
				continue
			}

			switch msg.Type {
			case "location_update":
				// Driver sending location -- broadcast to all watchers of this ride
				tracker.Broadcast(rideID, gin.H{
					"type":      "location_update",
					"latitude":  msg.Latitude,
					"longitude": msg.Longitude,
					"timestamp": time.Now(),
				})

			case "status_update":
				// Update ride status in database
				updates := map[string]interface{}{"status": msg.Status}
				now := time.Now()
				switch msg.Status {
				case "driver_arrived":
					// no extra fields
				case "in_progress":
					updates["started_at"] = now
				case "completed":
					updates["completed_at"] = now
					// Calculate final fare based on actual distance
					var ride models.Ride
					if db.First(&ride, "id = ?", rideID).Error == nil {
						updates["final_fare"] = ride.EstimatedFare
						// Update driver stats
						if ride.DriverID != nil {
							db.Model(&models.Driver{}).Where("id = ?", *ride.DriverID).Updates(map[string]interface{}{
								"completed_rides": gorm.Expr("completed_rides + 1"),
								"total_earnings":  gorm.Expr("total_earnings + ?", ride.EstimatedFare),
								"is_available":    true,
							})
						}
					}
				}

				db.Model(&models.Ride{}).Where("id = ?", rideID).Updates(updates)

				// Broadcast status change to all watchers
				tracker.Broadcast(rideID, gin.H{
					"type":      "status_update",
					"status":    msg.Status,
					"timestamp": time.Now(),
				})
			}
		}
	}
}

func WebSocketDriverHandler(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		driverID := c.Param("driverId")

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}
		defer conn.Close()

		log.Printf("Driver #%s WebSocket connected", driverID)

		// Keep connection alive and listen for driver location updates
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				break
			}

			var msg WSMessage
			if err := json.Unmarshal(message, &msg); err != nil {
				continue
			}

			if msg.Type == "location_update" {
				// Update driver's location in database
				db.Model(&models.Driver{}).Where("id = ?", driverID).Updates(map[string]interface{}{
					"current_latitude":  msg.Latitude,
					"current_longitude": msg.Longitude,
				})
			}
		}
	}
}
```

**Step 2: Remove WebSocket stubs from handlers.go**

Delete `WebSocketTrackingHandler` and `WebSocketDriverHandler` stubs from `handlers.go` (lines 388-399).

**Step 3: Verify**

```bash
cd /Users/dev3/omji/backend && go build ./...
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: implement WebSocket handlers for real-time ride tracking"
```

---

### Task 7: Clean up handlers.go (remaining stubs stay)

**Files:**
- Modify: `backend/pkg/handlers/handlers.go`

**Step 1: Verify handlers.go only contains non-auth/ride/driver/websocket stubs**

After tasks 2-6, `handlers.go` should only contain stubs for:
- RideShare (Pasabay): `CreateRideShare`, `GetAvailableRideShares`, `JoinRideShare`
- Delivery (Pasugo): `CreateDelivery`, `GetActiveDeliveries`, `GetDeliveryDetails`, `CancelDelivery`, `RateDelivery`
- Store/Order: `GetStores`, `GetStoreMenu`, `CreateOrder`, etc.
- Payment: `GetPaymentMethods`, `AddPaymentMethod`, `DeletePaymentMethod`
- Promo: `GetAvailablePromos`, `ApplyPromo`
- Chat: `GetChatMessages`, `SendChatMessage`
- Admin: all admin stubs

These stay as stubs for now (future phases). Make sure the file compiles and all removed functions exist in their new files.

**Step 2: Verify the full backend compiles and runs**

```bash
cd /Users/dev3/omji/backend && go build ./... && go run cmd/main.go
```

Expected: Server starts on port 8080 with all routes registered.

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: clean up handlers.go, keep non-auth/ride stubs for future"
```

---

### Task 8: Update mobile auth to handle real API responses

**Files:**
- Modify: `mobile/src/context/AuthContext.tsx`
- Modify: `mobile/src/screens/Auth/LoginScreen.tsx`
- Modify: `mobile/src/screens/Auth/RegisterScreen.tsx`

**Step 1: Update AuthContext to handle the real API response shape**

The backend returns `{ success: true, data: { token, user } }`. Update `AuthContext.tsx` to extract data correctly:

```tsx
// In the login function, update the response handling:
const login = async (phone: string, password: string) => {
  try {
    const response = await authService.login({ phone, password });
    const { token, user } = response.data.data;
    await AsyncStorage.setItem('userToken', token);
    await AsyncStorage.setItem('userData', JSON.stringify(user));
    setUser(user);
  } catch (error: any) {
    const message = error.response?.data?.error || 'Login failed';
    throw new Error(message);
  }
};

// In the register function:
const register = async (name: string, email: string, phone: string, password: string) => {
  try {
    const response = await authService.register({ name, email, phone, password });
    const { token, user } = response.data.data;
    await AsyncStorage.setItem('userToken', token);
    await AsyncStorage.setItem('userData', JSON.stringify(user));
    setUser(user);
  } catch (error: any) {
    const message = error.response?.data?.error || 'Registration failed';
    throw new Error(message);
  }
};
```

**Step 2: Update LoginScreen to use email or phone**

The backend accepts either `email` or `phone` for login. Update the LoginScreen to send `phone` (since it currently has a phone input):

In `LoginScreen.tsx`, update the login call:
```tsx
// Change from:
await login(phone, password);
// The AuthContext login already sends phone + password, which matches backend
```

Verify the login form submits `phone` + `password` matching the backend `LoginInput` struct.

**Step 3: Update RegisterScreen to match backend fields**

Ensure the register form sends `name`, `email`, `phone`, `password` matching the backend `RegisterInput` struct.

**Step 4: Update API base URL for local development**

In `mobile/src/services/api.ts`, update the base URL to point to your machine's local IP (not `localhost`, since the mobile emulator can't reach `localhost`):

```tsx
const API = axios.create({
  baseURL: 'http://YOUR_LOCAL_IP:8080/api/v1', // e.g., http://192.168.1.100:8080/api/v1
});
```

Find your IP with: `ifconfig | grep "inet " | grep -v 127.0.0.1`

**Step 5: Test login flow on mobile**

```bash
cd /Users/dev3/omji/mobile && npx expo start
```

Open on device/emulator, test login with the test user created earlier.

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: wire up mobile auth screens to real backend API"
```

---

### Task 9: Update mobile ride booking for real data

**Files:**
- Modify: `mobile/src/screens/Main/PasundoScreen.tsx`
- Modify: `mobile/src/screens/Main/TrackingScreen.tsx`

**Step 1: Update PasundoScreen to call real API**

The screen currently has a form but doesn't call the ride API. Update it to:
1. Call `rideService.createRide()` with the form data
2. Navigate to tracking with the real ride ID from the response
3. Show the calculated fare from the backend (not hardcoded)

Key changes in PasundoScreen:
```tsx
const handleBooking = async () => {
  try {
    const response = await rideService.createRide({
      pickup_location: pickupLocation,
      pickup_latitude: 8.4343,  // Use real geolocation in production
      pickup_longitude: 124.5000,
      dropoff_location: dropoffLocation,
      dropoff_latitude: 8.4400,
      dropoff_longitude: 124.5100,
      vehicle_type: selectedType, // 'motorcycle' or 'car'
    });
    const ride = response.data.data;
    navigation.navigate('Tracking', { rideId: ride.id, type: 'ride' });
  } catch (error: any) {
    Alert.alert('Error', error.response?.data?.error || 'Failed to book ride');
  }
};
```

**Step 2: Update TrackingScreen to use WebSocket**

Replace the simulated status progression with a real WebSocket connection:

```tsx
useEffect(() => {
  if (!rideId) return;

  const ws = new WebSocket(`ws://YOUR_LOCAL_IP:8080/ws/tracking/${rideId}`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'location_update') {
      setDriverLocation({
        latitude: data.latitude,
        longitude: data.longitude,
      });
    }
    if (data.type === 'status_update') {
      setCurrentStatus(data.status);
    }
  };

  ws.onerror = (error) => console.log('WebSocket error:', error);

  return () => ws.close();
}, [rideId]);
```

**Step 3: Test the full ride flow**

1. Login as a user
2. Book a ride from PasundoScreen
3. Verify the ride appears in the database
4. Check the tracking screen connects via WebSocket

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: wire up mobile ride booking and tracking to real backend"
```

---

### Task 10: Update mobile driver dashboard for real data

**Files:**
- Modify: `mobile/src/screens/Rider/RiderDashboardScreen.tsx`

**Step 1: Replace mock data with real API calls**

Update the driver dashboard to:
1. Load real ride requests from `driverService.getRequests()`
2. Accept rides via `driverService.acceptRequest(rideId)`
3. Toggle availability via `driverService.setAvailability()`
4. Show real earnings from `driverService.getEarnings()`

Key changes:
```tsx
// Load available ride requests
useEffect(() => {
  if (isOnline) {
    loadRequests();
  }
}, [isOnline]);

const loadRequests = async () => {
  try {
    const response = await driverService.getRequests();
    setAvailableJobs(response.data.data);
  } catch (error) {
    console.log('Failed to load requests:', error);
  }
};

// Accept a ride
const handleAcceptRide = async (rideId: number) => {
  try {
    await driverService.acceptRequest(rideId);
    Alert.alert('Success', 'Ride accepted!');
    navigation.navigate('Tracking', { rideId, type: 'driver' });
  } catch (error: any) {
    Alert.alert('Error', error.response?.data?.error || 'Failed to accept ride');
  }
};

// Toggle availability
const toggleOnline = async () => {
  try {
    await driverService.setAvailability({ available: !isOnline, latitude: 8.4343, longitude: 124.5 });
    setIsOnline(!isOnline);
  } catch (error) {
    Alert.alert('Error', 'Failed to update availability');
  }
};
```

**Step 2: Load real earnings**

```tsx
const loadEarnings = async () => {
  try {
    const response = await driverService.getEarnings();
    const data = response.data.data;
    setTodayEarnings(data.today_earnings);
    setTodayRides(data.today_rides);
    setRating(data.rating);
  } catch (error) {
    console.log('Failed to load earnings:', error);
  }
};
```

**Step 3: Test the full driver flow**

1. Register a second user and register as a driver
2. Set availability to online
3. From the first user, book a ride
4. On the driver dashboard, see the ride request appear
5. Accept the ride
6. Verify ride status changes to "accepted"

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: wire up mobile driver dashboard to real backend"
```

---

### Task 11: Add logo and branding

**Files:**
- Modify: `mobile/src/screens/Auth/LoginScreen.tsx`
- Modify: `mobile/App.tsx`

**Step 1: Add logo to login screen**

The `logo.jpeg` is at `/Users/dev3/omji/logo.jpeg`. Copy it to the mobile assets:

```bash
mkdir -p /Users/dev3/omji/mobile/assets
cp /Users/dev3/omji/logo.jpeg /Users/dev3/omji/mobile/assets/logo.jpeg
```

In `LoginScreen.tsx`, replace the text-based logo section with the image:

```tsx
import { Image } from 'react-native';

// Replace the logo placeholder with:
<Image
  source={require('../../assets/logo.jpeg')}
  style={{ width: 120, height: 120, borderRadius: 60, alignSelf: 'center', marginBottom: 16 }}
  resizeMode="cover"
/>
```

**Step 2: Add logo to splash/loading screen**

In `App.tsx`, update the loading screen to show the logo:

```tsx
// In the loading return block:
<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#3B82F6' }}>
  <Image
    source={require('./assets/logo.jpeg')}
    style={{ width: 150, height: 150, borderRadius: 75, marginBottom: 20 }}
  />
  <ActivityIndicator size="large" color="white" />
</View>
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add OMJI logo to mobile login and splash screens"
```

---

### Task 12: End-to-end test

**No files to modify. Manual testing checklist.**

**Step 1: Start the backend**

```bash
cd /Users/dev3/omji/backend && go run cmd/main.go
```

Verify: Server starts, database connected, migrations complete.

**Step 2: Start the mobile app**

```bash
cd /Users/dev3/omji/mobile && npx expo start
```

**Step 3: Test the complete flow**

1. **Register** a new user -> should get token and OTP in console
2. **Login** with the registered user -> should get token and user data
3. **View profile** -> should show user details
4. **Book a ride** (Pasundo) -> should create ride with calculated fare
5. **Register as driver** (with a second account) -> should get driver profile
6. **Go online** as driver -> should update availability
7. **See ride request** on driver dashboard -> should show the pending ride
8. **Accept ride** -> ride status should change to "accepted"
9. **Track ride** via WebSocket -> should receive location updates
10. **Rate ride** after completion -> rating should update driver's average

**Step 4: Verify web app also works**

Since the web app uses the same API endpoints:

```bash
cd /Users/dev3/omji/web && npm run dev
```

Open http://localhost:5173, login with the test user. Dashboard and ride booking should work with real data.

**Step 5: Final commit**

```bash
git add -A && git commit -m "chore: complete auth + rides implementation, ready for testing"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Fix utils.go + add JWT helper | `handlers/utils.go`, `handlers/jwt.go` |
| 2 | Auth handlers | `handlers/auth_handlers.go` |
| 3 | User profile handlers | `handlers/user_handlers.go` |
| 4 | Ride handlers | `handlers/ride_handlers.go` |
| 5 | Driver handlers | `handlers/driver_handlers.go` |
| 6 | WebSocket tracking | `handlers/websocket_handlers.go` |
| 7 | Clean up handlers.go | `handlers/handlers.go` |
| 8 | Mobile auth integration | `AuthContext.tsx`, screens |
| 9 | Mobile ride booking | `PasundoScreen.tsx`, `TrackingScreen.tsx` |
| 10 | Mobile driver dashboard | `RiderDashboardScreen.tsx` |
| 11 | Logo and branding | `LoginScreen.tsx`, `App.tsx` |
| 12 | End-to-end testing | Manual testing |

## Future Phases

After auth + rides are working:
- **Phase 2:** Delivery (Pasugo) handlers
- **Phase 3:** Food/store ordering handlers
- **Phase 4:** Admin dashboard backend integration
- **Phase 5:** Payment gateway integration
- **Phase 6:** Push notifications
