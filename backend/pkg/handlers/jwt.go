package handlers

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

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
