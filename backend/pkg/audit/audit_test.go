package audit

import (
	"testing"

	"oneride/pkg/models"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.AuditLog{}); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestLog_WritesRow(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := newTestDB(t)

	c, _ := gin.CreateTestContext(nil)
	c.Set("userID", uint(42))
	c.Set("role", "admin")
	c.Set("requestID", "req-123")

	Log(db, c, "user.delete", "user", "99", map[string]any{"reason": "fraud"})

	var row models.AuditLog
	if err := db.First(&row).Error; err != nil {
		t.Fatal(err)
	}
	if row.Action != "user.delete" || row.TargetID != "99" || row.ActorRole != "admin" {
		t.Fatalf("unexpected row: %+v", row)
	}
	if row.ActorUserID == nil || *row.ActorUserID != 42 {
		t.Fatalf("expected actor user 42, got %v", row.ActorUserID)
	}
	if row.RequestID != "req-123" {
		t.Fatalf("expected request id req-123, got %q", row.RequestID)
	}
}
