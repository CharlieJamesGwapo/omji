package handlers

import (
	"omji/config"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func GenerateToken(userID uint, email, role string) (string, error) {
	claims := jwt.MapClaims{
		"user_id": float64(userID),
		"email":   email,
		"role":    role,
		"exp":     time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.GetJWTSecret()))
}
