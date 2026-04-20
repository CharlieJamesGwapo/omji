package handlers

import (
	"log"
	"time"

	"oneride/pkg/models"

	"gorm.io/gorm"
)

// StartStaleDriverReaper cancels active rides for drivers whose last_ping
// is older than staleAfter and marks them offline. Runs until stop is closed.
func StartStaleDriverReaper(db *gorm.DB, interval time.Duration, staleAfter time.Duration, stop <-chan struct{}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			cutoff := time.Now().Add(-staleAfter)
			var stale []models.Driver
			if err := db.Where("is_available = ? AND last_ping < ?", true, cutoff).Find(&stale).Error; err != nil {
				log.Printf("reaper: find stale drivers: %v", err)
				continue
			}
			for _, d := range stale {
				d := d // capture range variable
				err := db.Transaction(func(tx *gorm.DB) error {
					// Collect active ride/delivery (ID, UserID) pairs BEFORE the bulk
					// update so notifications are scoped only to this invocation and do
					// not bleed into rows already in driver_offline from prior events.
					type idUser struct {
						ID     uint
						UserID *uint
					}
					var activeRides []idUser
					if err := tx.Model(&models.Ride{}).
						Select("id, user_id").
						Where("driver_id = ? AND status IN ?", d.ID, []string{"accepted", "driver_arrived", "in_progress"}).
						Scan(&activeRides).Error; err != nil {
						return err
					}
					var activeDeliveries []idUser
					if err := tx.Model(&models.Delivery{}).
						Select("id, user_id").
						Where("driver_id = ? AND status IN ?", d.ID, []string{"accepted", "driver_arrived", "picked_up", "in_progress"}).
						Scan(&activeDeliveries).Error; err != nil {
						return err
					}
					if err := tx.Model(&models.Ride{}).
						Where("driver_id = ? AND status IN ?", d.ID, []string{"accepted", "driver_arrived", "in_progress"}).
						Updates(map[string]interface{}{"status": "driver_offline", "cancellation_reason": "Driver connection lost"}).
						Error; err != nil {
						return err
					}
					if err := tx.Model(&models.Delivery{}).
						Where("driver_id = ? AND status IN ?", d.ID, []string{"accepted", "driver_arrived", "picked_up", "in_progress"}).
						Updates(map[string]interface{}{"status": "driver_offline", "cancellation_reason": "Driver connection lost"}).
						Error; err != nil {
						return err
					}
					// Notify affected passengers.
					for _, r := range activeRides {
						if r.UserID != nil {
							notifyUser(tx, *r.UserID, "Ride Cancelled", "Your driver disconnected. Please book again.", "ride_cancelled")
						}
					}
					for _, del := range activeDeliveries {
						if del.UserID != nil {
							notifyUser(tx, *del.UserID, "Delivery Cancelled", "Your driver disconnected. Please book again.", "delivery_cancelled")
						}
					}
					return tx.Model(&d).Updates(map[string]interface{}{"is_available": false}).Error
				})
				if err != nil {
					log.Printf("reaper: cancel stale driver %d: %v", d.ID, err)
				} else {
					log.Printf("reaper: marked driver %d offline (last_ping stale)", d.ID)
				}
			}
		}
	}
}
