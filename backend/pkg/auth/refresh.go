// Package auth owns JWT + refresh token issuance, rotation, and revocation.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"os"
	"time"

	"oneride/pkg/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	RefreshTokenLifetime = 14 * 24 * time.Hour
	RefreshTokenBytes    = 32
	MaxActivePerUser     = 10
)

var (
	ErrRefreshNotFound = errors.New("refresh token not found")
	ErrRefreshRevoked  = errors.New("refresh token revoked")
	ErrRefreshExpired  = errors.New("refresh token expired")
	ErrRefreshReuse    = errors.New("refresh token reuse detected")
)

func hash(raw string) string {
	pepper := os.Getenv("REFRESH_TOKEN_PEPPER")
	h := sha256.Sum256([]byte(pepper + raw))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

// HashForTest exposes the internal hash function to handler callers that
// need to look up a token by its raw value.
func HashForTest(raw string) string { return hash(raw) }

func randomToken() (string, error) {
	b := make([]byte, RefreshTokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// Issue creates a new refresh token for a user. Pass familyID="" to start a
// new family; pass an existing familyID during rotation to link the new
// token to the original lineage.
func Issue(db *gorm.DB, userID uint, ua, ip, familyID string) (raw string, rec models.RefreshToken, err error) {
	raw, err = randomToken()
	if err != nil {
		return "", rec, err
	}
	if familyID == "" {
		familyID = uuid.NewString()
	}
	rec = models.RefreshToken{
		UserID:    userID,
		FamilyID:  familyID,
		TokenHash: hash(raw),
		ExpiresAt: time.Now().Add(RefreshTokenLifetime),
		UserAgent: ua,
		IP:        ip,
	}
	if err := db.Create(&rec).Error; err != nil {
		return "", rec, err
	}

	var count int64
	db.Model(&models.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Count(&count)
	if count > MaxActivePerUser {
		excess := count - MaxActivePerUser
		var oldest []models.RefreshToken
		db.Where("user_id = ? AND revoked_at IS NULL", userID).
			Order("created_at ASC").
			Limit(int(excess)).
			Find(&oldest)
		now := time.Now()
		for _, t := range oldest {
			db.Model(&t).Update("revoked_at", now)
		}
	}
	return raw, rec, nil
}

// Redeem validates a refresh token and issues a rotated replacement in the
// same family. If the presented token is valid-but-already-revoked, it is
// treated as theft: the entire family is revoked and ErrRefreshReuse is
// returned.
func Redeem(db *gorm.DB, raw, ua, ip string) (newRaw string, newRec models.RefreshToken, err error) {
	var rec models.RefreshToken
	if err := db.Where("token_hash = ?", hash(raw)).First(&rec).Error; err != nil {
		return "", models.RefreshToken{}, ErrRefreshNotFound
	}

	if rec.RevokedAt != nil {
		RevokeFamily(db, rec.FamilyID)
		return "", models.RefreshToken{}, ErrRefreshReuse
	}
	if time.Now().After(rec.ExpiresAt) {
		now := time.Now()
		db.Model(&rec).Update("revoked_at", now)
		return "", models.RefreshToken{}, ErrRefreshExpired
	}

	now := time.Now()
	if err := db.Model(&rec).Update("revoked_at", now).Error; err != nil {
		return "", models.RefreshToken{}, err
	}
	return Issue(db, rec.UserID, ua, ip, rec.FamilyID)
}

// RevokeFamily revokes every active token in a family (used for
// reuse/theft handling and for logout-all).
func RevokeFamily(db *gorm.DB, familyID string) {
	now := time.Now()
	db.Model(&models.RefreshToken{}).
		Where("family_id = ? AND revoked_at IS NULL", familyID).
		Update("revoked_at", now)
}

// RevokeAllForUser revokes every active refresh token for a user.
func RevokeAllForUser(db *gorm.DB, userID uint) {
	now := time.Now()
	db.Model(&models.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", now)
}
