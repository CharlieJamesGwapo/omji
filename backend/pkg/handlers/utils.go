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

func GenerateOTP() string {
	max := big.NewInt(900000)
	num, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "123456"
	}
	return fmt.Sprintf("%06d", num.Int64()+100000)
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

func SendOTPEmail(email, otp string) error {
	fmt.Printf("OTP for %s: %s (expires in 5 minutes)\n", email, otp)
	return nil
}

func SendOTPSMS(phone, otp string) error {
	fmt.Printf("SMS OTP for %s: %s (expires in 5 minutes)\n", phone, otp)
	return nil
}

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
