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
					var affectedRides []models.Ride
					if err := tx.Where("driver_id = ? AND status = ?", d.ID, "driver_offline").
						Find(&affectedRides).Error; err == nil {
						for _, r := range affectedRides {
							if r.UserID != nil {
								notifyUser(tx, *r.UserID, "Ride Cancelled", "Your driver disconnected. Please book again.", "ride_cancelled")
							}
						}
					}
					var affectedDeliveries []models.Delivery
					if err := tx.Where("driver_id = ? AND status = ?", d.ID, "driver_offline").
						Find(&affectedDeliveries).Error; err == nil {
						for _, del := range affectedDeliveries {
							if del.UserID != nil {
								notifyUser(tx, *del.UserID, "Delivery Cancelled", "Your driver disconnected. Please book again.", "delivery_cancelled")
							}
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
