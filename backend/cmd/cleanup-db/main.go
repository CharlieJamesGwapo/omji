package main

import (
	"fmt"
	"log"
	"os"

	"oneride/config"
	"oneride/pkg/db"

	"gorm.io/gorm"
)

// cleanTable truncates a table and resets the auto-increment counter
func cleanTable(database *gorm.DB, table string) {
	result := database.Exec(fmt.Sprintf("DELETE FROM %s", table))
	if result.Error != nil {
		log.Printf("  WARNING: Failed to clean %s: %v", table, result.Error)
	} else {
		log.Printf("  Cleaned %s (%d rows deleted)", table, result.RowsAffected)
	}
	// Reset auto-increment
	database.Exec(fmt.Sprintf("ALTER SEQUENCE IF EXISTS %s_id_seq RESTART WITH 1", table))
}

func main() {
	// Safety check
	if len(os.Args) < 2 || os.Args[1] != "--confirm" {
		fmt.Println("ONE RIDE Database Cleanup Tool")
		fmt.Println("==========================")
		fmt.Println()
		fmt.Println("This will DELETE all test/dummy data from the database.")
		fmt.Println("It will clean ALL transactional data but preserve:")
		fmt.Println("  - Admin users (role='admin')")
		fmt.Println("  - Stores and menu items")
		fmt.Println("  - Rates configuration")
		fmt.Println("  - Payment configs")
		fmt.Println("  - Promos")
		fmt.Println("  - Announcements")
		fmt.Println()
		fmt.Println("Usage: go run cmd/cleanup-db/main.go --confirm")
		fmt.Println()
		fmt.Println("Add --all to also remove stores, menu items, promos, rates, and announcements.")
		os.Exit(0)
	}

	cleanAll := len(os.Args) >= 3 && os.Args[2] == "--all"

	cfg := config.LoadConfig()
	database := db.InitDB(cfg)

	log.Println("Starting database cleanup...")
	log.Println()

	// Order matters due to foreign key constraints
	// Clean child tables first, then parent tables

	log.Println("[1/6] Cleaning chat & notifications...")
	cleanTable(database, "chat_messages")
	cleanTable(database, "notifications")
	cleanTable(database, "push_tokens")

	log.Println("[2/6] Cleaning rides & deliveries...")
	cleanTable(database, "ratings")
	cleanTable(database, "rides")
	cleanTable(database, "ride_shares")
	cleanTable(database, "deliveries")

	log.Println("[3/6] Cleaning orders...")
	cleanTable(database, "order_items")
	cleanTable(database, "orders")

	log.Println("[4/6] Cleaning wallet & transactions...")
	cleanTable(database, "wallet_transactions")
	cleanTable(database, "withdrawals")
	cleanTable(database, "wallets")

	log.Println("[5/6] Cleaning user data...")
	cleanTable(database, "promo_usages")
	cleanTable(database, "referrals")
	cleanTable(database, "favorites")
	cleanTable(database, "saved_addresses")
	cleanTable(database, "payment_methods")
	cleanTable(database, "activity_logs")

	log.Println("[6/6] Cleaning users...")
	// Delete drivers first (references users)
	cleanTable(database, "drivers")
	// Delete non-admin users only (preserve admin accounts)
	result := database.Exec("DELETE FROM users WHERE role != 'admin'")
	if result.Error != nil {
		log.Printf("  WARNING: Failed to clean non-admin users: %v", result.Error)
	} else {
		log.Printf("  Cleaned non-admin users (%d rows deleted)", result.RowsAffected)
	}

	if cleanAll {
		log.Println()
		log.Println("[EXTRA] Cleaning configuration data...")
		cleanTable(database, "menu_items")
		cleanTable(database, "stores")
		cleanTable(database, "promos")
		cleanTable(database, "rates")
		cleanTable(database, "payment_configs")
		cleanTable(database, "announcements")
	}

	// Reset admin wallet balances to 0
	database.Exec("UPDATE wallets SET balance = 0 WHERE user_id IN (SELECT id FROM users WHERE role = 'admin')")

	log.Println()
	log.Println("Database cleanup complete!")
	log.Println()

	// Show remaining data
	var adminCount int64
	database.Table("users").Where("role = 'admin'").Count(&adminCount)
	log.Printf("Remaining admin users: %d", adminCount)

	if !cleanAll {
		var storeCount, menuCount, promoCount int64
		database.Table("stores").Count(&storeCount)
		database.Table("menu_items").Count(&menuCount)
		database.Table("promos").Count(&promoCount)
		log.Printf("Preserved: %d stores, %d menu items, %d promos", storeCount, menuCount, promoCount)
	}
}
