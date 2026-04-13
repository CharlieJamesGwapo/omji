// Package audit writes append-only audit log entries. Entries are never
// updated or deleted; retention is policy-managed at the DB level.
package audit

import (
	"encoding/json"
	"log/slog"

	"oneride/pkg/models"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// Log writes a single audit entry. It extracts actor context from the Gin
// context (userID, role, requestID) and client metadata (IP, UA) from the
// request. Errors writing the audit row are logged but never returned —
// audit failures must not break the triggering request.
func Log(db *gorm.DB, c *gin.Context, action, targetType, targetID string, metadata map[string]any) {
	var actorID *uint
	if v, ok := c.Get("userID"); ok {
		if u, ok := v.(uint); ok {
			actorID = &u
		}
	}
	role, _ := c.Get("role")
	reqID, _ := c.Get("requestID")

	var meta datatypes.JSON
	if metadata != nil {
		if b, err := json.Marshal(metadata); err == nil {
			meta = b
		}
	}

	var ip, ua string
	if c.Request != nil {
		ip = c.ClientIP()
		ua = c.GetHeader("User-Agent")
	}

	entry := models.AuditLog{
		ActorUserID: actorID,
		ActorRole:   strOrEmpty(role),
		Action:      action,
		TargetType:  targetType,
		TargetID:    targetID,
		Metadata:    meta,
		IP:          ip,
		UserAgent:   ua,
		RequestID:   strOrEmpty(reqID),
	}

	if err := db.Create(&entry).Error; err != nil {
		slog.Error("audit log write failed",
			"action", action,
			"target_type", targetType,
			"target_id", targetID,
			"error", err,
		)
	}
}

func strOrEmpty(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
