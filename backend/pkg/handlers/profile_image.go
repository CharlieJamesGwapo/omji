package handlers

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"oneride/pkg/models"
	"oneride/pkg/validate"
)

const maxProfileImageBytes = 5 * 1024 * 1024 // 5 MB

// UploadProfileImage accepts multipart/form-data with field name "image",
// validates and saves it under <UPLOAD_DIR>/profile/, updates the user's
// profile_image column, and returns the public URL.
//
// SanitizeImage re-encodes the upload as JPEG, stripping EXIF and defeating
// polyglot payloads. The handler therefore always writes a .jpg file regardless
// of the original extension supplied by the client.
func UploadProfileImage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)

		fh, err := c.FormFile("image")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "image file is required"})
			return
		}
		if fh.Size > maxProfileImageBytes {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"success": false, "error": "Image must be 5 MB or smaller"})
			return
		}

		src, err := fh.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Could not read uploaded file"})
			return
		}
		defer src.Close()

		// SanitizeImage sniffs the MIME type, decodes the image, enforces
		// dimension limits, and re-encodes as JPEG. It returns the clean bytes
		// and a server-generated UUID filename.
		cleanBytes, filename, serr := validate.SanitizeImage(src, fh.Size)
		if serr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": serr.Error()})
			return
		}

		dir := filepath.Join(getUploadDir(), "profile")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Upload storage unavailable"})
			return
		}

		destPath := filepath.Join(dir, filename)
		if err := os.WriteFile(destPath, cleanBytes, 0o644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Could not save image"})
			return
		}

		baseURL := os.Getenv("BASE_URL")
		if baseURL == "" {
			baseURL = "https://oneride-backend.onrender.com"
		}
		publicURL := baseURL + "/uploads/profile/" + filename

		if err := db.Model(&models.User{}).Where("id = ?", userID).Update("profile_image", publicURL).Error; err != nil {
			os.Remove(destPath)
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Could not update profile"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    gin.H{"profile_image": publicURL},
		})
	}
}
