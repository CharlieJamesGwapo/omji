package handlers

import (
	"oneride/config"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	AccessTokenLifetime = 1 * time.Hour
	JWTIssuer           = "oneride-api"
	AudienceMobile      = "oneride-mobile"
	AudienceAdmin       = "oneride-admin"
)

// GenerateAccessToken mints a short-lived JWT access token. audience must be
// one of AudienceMobile or AudienceAdmin. tokenVersion is the user's current
// TokenVersion field; AuthMiddleware rejects tokens whose tver is stale.
func GenerateAccessToken(userID uint, email, role string, tokenVersion int, audience string) (string, error) {
	lifetime := AccessTokenLifetime
	if !config.SecurityV2Enabled() {
		lifetime = 30 * 24 * time.Hour
	}
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   strconv.FormatUint(uint64(userID), 10),
		"email": email,
		"role":  role,
		"iss":   JWTIssuer,
		"aud":   audience,
		"exp":   now.Add(lifetime).Unix(),
		"iat":   now.Unix(),
		"nbf":   now.Unix(),
		"jti":   uuid.NewString(),
		"tver":  tokenVersion,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.GetJWTSecret()))
}

// GenerateToken is kept as a thin shim for legacy call sites while the
// codebase is migrated. Delete once all callers use GenerateAccessToken.
//
// Deprecated: use GenerateAccessToken.
func GenerateToken(userID uint, email, role string) (string, error) {
	return GenerateAccessToken(userID, email, role, 1, AudienceMobile)
}
