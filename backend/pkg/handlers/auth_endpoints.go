package handlers

import (
	"errors"
	"net/http"
	"strconv"

	"oneride/pkg/audit"
	"oneride/pkg/auth"
	"oneride/pkg/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// RefreshToken handles POST /auth/refresh.
// Accepts {"refresh_token": "<raw>"}, redeems via auth.Redeem (with rotation),
// and returns a fresh access token + refresh token.
func RefreshToken(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			RefreshToken string `json:"refresh_token" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "refresh_token is required"})
			return
		}

		ua := c.GetHeader("User-Agent")
		ip := c.ClientIP()

		newRaw, newRec, err := auth.Redeem(db, input.RefreshToken, ua, ip)
		if err != nil {
			if errors.Is(err, auth.ErrRefreshReuse) {
				audit.Log(db, c, "auth.refresh_reuse_detected", "user",
					strconv.FormatUint(uint64(newRec.UserID), 10),
					map[string]any{"family_id": newRec.FamilyID})
				c.JSON(http.StatusUnauthorized, gin.H{"error": "refresh token reuse detected"})
				return
			}
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired refresh token"})
			return
		}

		// Load the user to get role and token version.
		var user models.User
		if err := db.First(&user, newRec.UserID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "user not found"})
			return
		}

		audience := AudienceMobile
		if user.Role == "admin" {
			audience = AudienceAdmin
		}

		access, err := GenerateAccessToken(user.ID, user.Email, user.Role, user.TokenVersion, audience)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate access token"})
			return
		}

		audit.Log(db, c, "auth.refresh", "user",
			strconv.FormatUint(uint64(user.ID), 10), nil)

		c.JSON(http.StatusOK, gin.H{
			"access_token":  access,
			"refresh_token": newRaw,
			"expires_in":    int(AccessTokenLifetime.Seconds()),
		})
	}
}

// Logout handles POST /auth/logout.
// Optionally accepts {"refresh_token": "<raw>"}. If provided, looks up the
// token row by hash and revokes its entire family (preventing reuse of any
// sibling token in the rotation chain). Always returns success.
func Logout(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			RefreshToken string `json:"refresh_token"`
		}
		// Best-effort bind — body may be empty.
		_ = c.ShouldBindJSON(&input)

		if input.RefreshToken != "" {
			tokenHash := auth.HashForTest(input.RefreshToken)
			var rec models.RefreshToken
			if err := db.Where("token_hash = ?", tokenHash).First(&rec).Error; err == nil {
				auth.RevokeFamily(db, rec.FamilyID)
			}
		}

		audit.Log(db, c, "auth.logout", "user", "", nil)

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}

// LogoutAll handles POST /auth/logout-all.
// Requires an authenticated request (userID set in gin context by
// AuthMiddleware). Revokes all refresh tokens and bumps TokenVersion so
// existing access tokens are also invalidated at next use.
func LogoutAll(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		v, exists := c.Get("userID")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
			return
		}
		userID, ok := v.(uint)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user context"})
			return
		}

		auth.RevokeAllForUser(db, userID)

		if err := db.Model(&models.User{}).
			Where("id = ?", userID).
			Update("token_version", gorm.Expr("token_version + 1")).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not invalidate sessions"})
			return
		}

		audit.Log(db, c, "auth.logout_all", "user",
			strconv.FormatUint(uint64(userID), 10), nil)

		c.JSON(http.StatusOK, gin.H{"success": true})
	}
}
