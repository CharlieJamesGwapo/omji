package auth

import (
	"os"
	"testing"
	"time"

	"oneride/pkg/models"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.RefreshToken{}); err != nil {
		t.Fatal(err)
	}
	return db
}

func setPepper(t *testing.T) {
	t.Helper()
	os.Setenv("REFRESH_TOKEN_PEPPER", "test-pepper-0000000000000000000000")
}

func TestIssue_CreatesRow(t *testing.T) {
	setPepper(t)
	db := newDB(t)
	user := models.User{Name: "a", Email: "a@b.c", Phone: "1"}
	db.Create(&user)

	raw, rec, err := Issue(db, user.ID, "ua", "1.2.3.4", "")
	if err != nil {
		t.Fatal(err)
	}
	if raw == "" || rec.FamilyID == "" || rec.TokenHash == "" {
		t.Fatal("missing fields")
	}
	if rec.TokenHash == raw {
		t.Fatal("hash must not equal raw")
	}
}

func TestRedeem_RotatesAndRevokesOld(t *testing.T) {
	setPepper(t)
	db := newDB(t)
	u := models.User{Name: "a", Email: "a@b.c", Phone: "1"}
	db.Create(&u)

	raw, old, _ := Issue(db, u.ID, "ua", "1.2.3.4", "")

	newRaw, newRec, err := Redeem(db, raw, "ua", "1.2.3.4")
	if err != nil {
		t.Fatal(err)
	}
	if newRaw == raw {
		t.Fatal("expected rotation")
	}
	if newRec.FamilyID != old.FamilyID {
		t.Fatal("family must be preserved on rotation")
	}

	var reloaded models.RefreshToken
	db.First(&reloaded, old.ID)
	if reloaded.RevokedAt == nil {
		t.Fatal("old token must be revoked after rotation")
	}
}

func TestRedeem_ReuseRevokesFamily(t *testing.T) {
	setPepper(t)
	db := newDB(t)
	u := models.User{Name: "a", Email: "a@b.c", Phone: "1"}
	db.Create(&u)

	raw, _, _ := Issue(db, u.ID, "ua", "1.2.3.4", "")
	_, _, _ = Redeem(db, raw, "ua", "1.2.3.4") // rotate

	_, _, err := Redeem(db, raw, "ua", "1.2.3.4")
	if err == nil {
		t.Fatal("expected reuse error")
	}

	var all []models.RefreshToken
	db.Where("user_id = ?", u.ID).Find(&all)
	for _, tk := range all {
		if tk.RevokedAt == nil {
			t.Fatalf("token %d not revoked after reuse", tk.ID)
		}
	}
}

func TestRedeem_RejectsExpired(t *testing.T) {
	setPepper(t)
	db := newDB(t)
	u := models.User{Name: "a", Email: "a@b.c", Phone: "1"}
	db.Create(&u)

	raw, rec, _ := Issue(db, u.ID, "ua", "1.2.3.4", "")
	db.Model(&rec).Update("expires_at", time.Now().Add(-time.Hour))

	_, _, err := Redeem(db, raw, "ua", "1.2.3.4")
	if err == nil {
		t.Fatal("expected expired error")
	}
}
