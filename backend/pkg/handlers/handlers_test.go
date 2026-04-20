package handlers

import (
	"oneride/pkg/models"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestRecordCommission_DeductionFailurePropagates(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("sqlite open: %v", err)
	}
	if err := db.AutoMigrate(&models.Driver{}, &models.CommissionRecord{}, &models.CommissionConfig{}); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	db.Create(&models.CommissionConfig{Percentage: 10, IsActive: true})
	// Do NOT seed the driver — triggers First(&driver, 9999) failure path

	err = db.Transaction(func(tx *gorm.DB) error {
		return createCommissionRecord(tx, "ride", 999, 9999, 100.0, "wallet")
	})
	if err == nil {
		t.Fatal("expected commission deduction failure to propagate as error; got nil")
	}
}
