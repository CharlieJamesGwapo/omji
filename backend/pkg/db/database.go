package db

import (
	"log"
	"omji/config"
	"omji/pkg/models"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB

func InitDB(cfg *config.Config) *gorm.DB {
	dsn := cfg.GetDSN()
	
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	DB = db
	log.Println("✅ Database connected successfully")
	return db
}

func MigrateDB(db *gorm.DB) {
	models.AutoMigrate(db)
	log.Println("✅ Database migrations completed")

	// Seed initial data
	seedData(db)
}

func seedData(db *gorm.DB) {
	// Create default admin user if none exists
	var adminCount int64
	db.Model(&models.User{}).Where("role = ?", "admin").Count(&adminCount)
	if adminCount == 0 {
		// Hash the password "admin"
		hashedPassword, _ := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)

		adminUser := models.User{
			Name:       "Admin",
			Email:      "admin",
			Phone:      "admin",
			Password:   string(hashedPassword),
			Role:       "admin",
			IsVerified: true,
		}

		db.Create(&adminUser)
		log.Println("✅ Default admin user created (username: admin, password: admin)")
	}

	// Create sample stores if none exist
	var count int64
	db.Model(&models.Store{}).Count(&count)
	if count == 0 {
		stores := []models.Store{
			{
				Name:       "McDonald's Balingasag",
				Category:   "restaurant",
				Latitude:   8.4343,
				Longitude:  124.5000,
				Address:    "Main St, Balingasag",
				Phone:      "+63912345678",
				Description: "Fast food restaurant",
				IsVerified: true,
				Rating:     4.5,
			},
			{
				Name:       "SM Grocery",
				Category:   "grocery",
				Latitude:   8.4340,
				Longitude:  124.4995,
				Address:    "Plaza St, Balingasag",
				Phone:      "+63912345679",
				Description: "Grocery store",
				IsVerified: true,
				Rating:     4.7,
			},
			{
				Name:       "Pharmacy Plus",
				Category:   "pharmacy",
				Latitude:   8.4345,
				Longitude:  124.5005,
				Address:    "Medical Ave, Balingasag",
				Phone:      "+63912345680",
				Description: "Medicine and health products",
				IsVerified: true,
				Rating:     4.8,
			},
		}

		for _, store := range stores {
			db.Create(&store)
		}
		log.Println("✅ Sample stores created")
	}

	// Create sample promos if none exist
	db.Model(&models.Promo{}).Count(&count)
	if count == 0 {
		promos := []models.Promo{
			{
				Code:           "WELCOME50",
				Description:    "50% off on first ride",
				DiscountType:   "percentage",
				DiscountValue:  50,
				MinimumAmount:  100,
				MaxDiscount:    500,
				UsageLimit:     1000,
				ApplicableTo:   "rides",
				IsActive:       true,
			},
			{
				Code:           "DELIVERY2024",
				Description:    "Free delivery on orders above 500",
				DiscountType:   "fixed",
				DiscountValue:  0,
				MinimumAmount:  500,
				UsageLimit:     5000,
				ApplicableTo:   "orders",
				IsActive:       true,
			},
		}

		for _, promo := range promos {
			db.Create(&promo)
		}
		log.Println("✅ Sample promos created")
	}
}

func GetDB() *gorm.DB {
	return DB
}
