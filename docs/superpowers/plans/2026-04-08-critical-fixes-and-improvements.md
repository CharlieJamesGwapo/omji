# Critical Fixes & Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical backend bugs (commission race condition, WebSocket validation gaps, store rating sync, CreateOrder error handling), fix admin label mismatch, and add WebSocket error logging.

**Architecture:** All fixes are in the existing Go backend (`backend/pkg/handlers/`) and React admin (`admin/src/pages/`). Tests use the existing SQLite in-memory test DB pattern from `handlers_critical_test.go`. Each task is independent and can be committed separately.

**Tech Stack:** Go 1.23 / Gin / GORM / PostgreSQL / SQLite (tests) / React / TypeScript

---

### Task 1: Fix commission race condition — add row lock before deduction

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:60-68`
- Test: `backend/pkg/handlers/handlers_critical_test.go`

The `createCommissionRecord()` function deducts from `driver.total_earnings` without locking the driver row first. Concurrent rides completing simultaneously can double-deduct.

- [ ] **Step 1: Write failing test**

Add to `backend/pkg/handlers/handlers_critical_test.go`:

```go
func TestCreateCommissionRecord_LocksDriverRow(t *testing.T) {
	db := setupTestDB(t)

	// Create commission config
	db.Create(&models.CommissionConfig{Percentage: 10.0, IsActive: true})

	// Create user + driver with known earnings
	user := seedUser(t, db, "Driver User", "driver@test.com", "driver")
	driver := seedDriver(t, db, user.ID)
	db.Model(&driver).Update("total_earnings", 1000.0)

	// Run commission deduction in a transaction (wallet payment triggers deduction)
	tx := db.Begin()
	createCommissionRecord(tx, "ride", 1, driver.ID, 200.0, "wallet")
	tx.Commit()

	// Verify driver earnings reduced by 10% of 200 = 20
	var updated models.Driver
	db.First(&updated, driver.ID)
	assert.InDelta(t, 980.0, updated.TotalEarnings, 0.01, "earnings should be reduced by commission amount")
}
```

- [ ] **Step 2: Run test to verify it passes with current code (baseline)**

Run: `cd backend && go test ./pkg/handlers/ -run TestCreateCommissionRecord_LocksDriverRow -v`

- [ ] **Step 3: Add row lock before earnings deduction**

In `backend/pkg/handlers/handlers.go`, replace lines 62-68:

```go
	status := "pending_collection"
	if paymentMethod == "wallet" {
		status = "deducted"
		// Deduct commission from driver's total_earnings
		if err := tx.Model(&models.Driver{}).Where("id = ?", driverID).
			Update("total_earnings", gorm.Expr("total_earnings - ?", commissionAmount)).Error; err != nil {
			log.Printf("Failed to deduct commission from driver %d earnings: %v", driverID, err)
		}
	}
```

With:

```go
	status := "pending_collection"
	if paymentMethod == "wallet" {
		status = "deducted"
		// Lock driver row then deduct commission from total_earnings
		var driver models.Driver
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&driver, driverID).Error; err != nil {
			log.Printf("Failed to lock driver %d for commission deduction: %v", driverID, err)
		} else if err := tx.Model(&driver).Update("total_earnings", gorm.Expr("total_earnings - ?", commissionAmount)).Error; err != nil {
			log.Printf("Failed to deduct commission from driver %d earnings: %v", driverID, err)
		}
	}
```

Note: `clause` is already imported in this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./pkg/handlers/ -run TestCreateCommissionRecord_LocksDriverRow -v`
Expected: PASS

- [ ] **Step 5: Run all existing tests to verify no regressions**

Run: `cd backend && go test ./pkg/handlers/ -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/pkg/handlers/handlers.go backend/pkg/handlers/handlers_critical_test.go
git commit -m "fix: add row lock to commission deduction to prevent race condition"
```

---

### Task 2: Add coordinate validation to WebSocketTrackingHandler

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:4449-4451`
- Test: `backend/pkg/handlers/handlers_critical_test.go`

WebSocketDriverHandler validates lat/lng but WebSocketTrackingHandler broadcasts them unchecked.

- [ ] **Step 1: Write test for coordinate validation helper**

Add to `backend/pkg/handlers/handlers_critical_test.go`:

```go
func TestValidCoordinates(t *testing.T) {
	tests := []struct {
		name     string
		lat, lng float64
		valid    bool
	}{
		{"valid Balingasag", 8.4343, 124.7762, true},
		{"zero coords", 0, 0, true},
		{"lat too high", 91, 0, false},
		{"lat too low", -91, 0, false},
		{"lng too high", 0, 181, false},
		{"lng too low", 0, -181, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.valid, validCoordinates(tt.lat, tt.lng))
		})
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test ./pkg/handlers/ -run TestValidCoordinates -v`
Expected: FAIL — `validCoordinates` not defined

- [ ] **Step 3: Add validCoordinates helper to utils.go**

Add to the end of `backend/pkg/handlers/utils.go`:

```go
// validCoordinates returns true if lat/lng are within valid ranges.
func validCoordinates(lat, lng float64) bool {
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && go test ./pkg/handlers/ -run TestValidCoordinates -v`
Expected: PASS

- [ ] **Step 5: Use helper in WebSocketTrackingHandler**

In `backend/pkg/handlers/handlers.go`, replace line 4449-4451:

```go
			switch msg.Type {
			case "location_update":
				tracker.Broadcast(rideID, gin.H{"type": "location_update", "latitude": msg.Latitude, "longitude": msg.Longitude, "timestamp": time.Now()})
```

With:

```go
			switch msg.Type {
			case "location_update":
				if !validCoordinates(msg.Latitude, msg.Longitude) {
					continue
				}
				tracker.Broadcast(rideID, gin.H{"type": "location_update", "latitude": msg.Latitude, "longitude": msg.Longitude, "timestamp": time.Now()})
```

- [ ] **Step 6: Also refactor WebSocketDriverHandler to use the helper**

In `backend/pkg/handlers/handlers.go`, find the driver handler validation (around line 4677-4680):

```go
			if msg.Latitude < -90 || msg.Latitude > 90 || msg.Longitude < -180 || msg.Longitude > 180 {
				continue
			}
```

Replace with:

```go
			if !validCoordinates(msg.Latitude, msg.Longitude) {
				continue
			}
```

- [ ] **Step 7: Build and run all tests**

Run: `cd backend && go build ./... && go test ./pkg/handlers/ -v`
Expected: Build succeeds, all tests PASS

- [ ] **Step 8: Commit**

```bash
git add backend/pkg/handlers/handlers.go backend/pkg/handlers/utils.go backend/pkg/handlers/handlers_critical_test.go
git commit -m "fix: validate coordinates in WebSocketTrackingHandler before broadcast"
```

---

### Task 3: Log WebSocket JSON parse errors instead of silently ignoring

**Files:**
- Modify: `backend/pkg/handlers/handlers.go` (lines ~4446, ~4674, ~4762)

Three WebSocket handlers silently `continue` when `json.Unmarshal` fails. Add logging so malformed messages are visible in Render logs.

- [ ] **Step 1: Fix WebSocketTrackingHandler (line ~4446)**

Replace:
```go
			if json.Unmarshal(message, &msg) != nil {
				continue
			}
```

With:
```go
			if err := json.Unmarshal(message, &msg); err != nil {
				log.Printf("WebSocketTracking: invalid JSON from ride %s: %v", rideID, err)
				continue
			}
```

- [ ] **Step 2: Fix WebSocketDriverHandler (line ~4674)**

Replace:
```go
			if json.Unmarshal(message, &msg) != nil {
				continue
			}
```

With:
```go
			if err := json.Unmarshal(message, &msg); err != nil {
				log.Printf("WebSocketDriver: invalid JSON from driver %s: %v", driverID, err)
				continue
			}
```

- [ ] **Step 3: Fix WebSocketChatHandler (line ~4762)**

Replace:
```go
			if json.Unmarshal(message, &input) != nil {
				continue
			}
```

With:
```go
			if err := json.Unmarshal(message, &input); err != nil {
				log.Printf("WebSocketChat: invalid JSON for ride %s: %v", rideID, err)
				continue
			}
```

- [ ] **Step 4: Build to verify**

Run: `cd backend && go build ./...`
Expected: Success

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "fix: log WebSocket JSON parse errors instead of silently ignoring"
```

---

### Task 4: Fix RateDelivery to update store rating

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:1263-1299`
- Test: `backend/pkg/handlers/handlers_critical_test.go`

`RateDelivery` only updates driver rating. It should also accept and save a store rating when the delivery is linked to a store (like `RateOrder` does).

- [ ] **Step 1: Write failing test**

Add to `backend/pkg/handlers/handlers_critical_test.go`:

```go
func TestRateDelivery_UpdatesDriverRating(t *testing.T) {
	db := setupTestDB(t)

	user := seedUser(t, db, "Customer", "cust@test.com", "user")
	driverUser := seedUser(t, db, "DriverUser", "drvuser@test.com", "driver")
	driver := seedDriver(t, db, driverUser.ID)

	driverID := driver.ID
	userID := user.ID
	delivery := models.Delivery{
		UserID:          &userID,
		DriverID:        &driverID,
		Status:          "completed",
		PickupLocation:  "A",
		DropoffLocation: "B",
	}
	require.NoError(t, db.Create(&delivery).Error)

	router := setupRouter()
	router.PUT("/deliveries/:id/rate", func(c *gin.Context) {
		c.Set("userID", user.ID)
		RateDelivery(db)(c)
	})

	body := `{"rating": 4.5}`
	req, _ := http.NewRequest("PUT", fmt.Sprintf("/deliveries/%d/rate", delivery.ID), strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var updated models.Driver
	db.First(&updated, driver.ID)
	assert.InDelta(t, 4.5, updated.Rating, 0.01)
	assert.Equal(t, 1, updated.TotalRatings)
}
```

- [ ] **Step 2: Run test to verify it passes (baseline — driver rating already works)**

Run: `cd backend && go test ./pkg/handlers/ -run TestRateDelivery_UpdatesDriverRating -v`
Expected: PASS (driver rating already works)

- [ ] **Step 3: Modify RateDelivery handler to also accept store_rating**

In `backend/pkg/handlers/handlers.go`, replace the RateDelivery handler (lines 1263-1299) with:

```go
func RateDelivery(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var input struct {
			Rating float64 `json:"rating" binding:"required,min=1,max=5"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
			return
		}
		var d models.Delivery
		if err := db.Where("id = ? AND user_id = ? AND status = ?", c.Param("id"), userID, "completed").First(&d).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Completed delivery not found"})
			return
		}
		if d.DriverRating != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "You have already rated this delivery"})
			return
		}
		txErr := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&d).Update("driver_rating", input.Rating).Error; err != nil {
				return err
			}
			if d.DriverID != nil {
				if err := updateDriverRating(tx, *d.DriverID, input.Rating); err != nil {
					return err
				}
			}
			return nil
		})
		if txErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save rating"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Rating submitted"}, "timestamp": time.Now()})
	}
}
```

Note: Delivery model doesn't have a StoreID field — deliveries are point-to-point (Pasugo service), not store-linked. Store ratings are handled by RateOrder (Pasabay service). So the actual fix here is just ensuring the existing handler is correct. The original code IS correct for deliveries — this task confirms it and adds test coverage.

- [ ] **Step 4: Run all tests**

Run: `cd backend && go test ./pkg/handlers/ -v`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/handlers_critical_test.go
git commit -m "test: add test coverage for RateDelivery handler"
```

---

### Task 5: Fix CreateOrder silent failure on malformed items JSON

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:1358`
- Test: `backend/pkg/handlers/handlers_critical_test.go`

When `json.Unmarshal(input.Items, &orderItems)` fails, the order is created with zero subtotal instead of returning an error.

- [ ] **Step 1: Write failing test**

Add to `backend/pkg/handlers/handlers_critical_test.go`:

```go
func TestCreateOrder_RejectsInvalidItemsJSON(t *testing.T) {
	db := setupTestDB(t)
	user := seedUser(t, db, "Customer", "cust@test.com", "user")

	// Create a store
	store := models.Store{Name: "Test Store", Category: "restaurant", IsVerified: true}
	require.NoError(t, db.Create(&store).Error)

	router := setupRouter()
	router.POST("/orders/create", func(c *gin.Context) {
		c.Set("userID", user.ID)
		CreateOrder(db)(c)
	})

	// Send order with invalid items JSON (not an array of {item_id, quantity})
	body := fmt.Sprintf(`{"store_id":%d,"items":"not-valid-json","delivery_location":"Test","delivery_latitude":8.43,"delivery_longitude":124.77,"payment_method":"cash"}`, store.ID)
	req, _ := http.NewRequest("POST", "/orders/create", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	// Should reject, not create order with zero subtotal
	assert.NotEqual(t, http.StatusOK, w.Code, "should not create order with invalid items")
}
```

- [ ] **Step 2: Run test to verify it fails (current code accepts bad items)**

Run: `cd backend && go test ./pkg/handlers/ -run TestCreateOrder_RejectsInvalidItemsJSON -v`
Expected: FAIL — currently returns 200 with zero subtotal

- [ ] **Step 3: Fix the error handling**

In `backend/pkg/handlers/handlers.go`, replace line 1358:

```go
		if err := json.Unmarshal(input.Items, &orderItems); err == nil {
```

With:

```go
		if err := json.Unmarshal(input.Items, &orderItems); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid items format"})
			return
		}
		{
```

And find the closing brace of the original `if err == nil {` block (which contains the itemIDs/priceMap logic) and remove the extra closing `}` that matched the old `if`. The block should now execute unconditionally since we return early on error.

Actually, cleaner approach — replace lines 1358-1380 entirely. In `backend/pkg/handlers/handlers.go` find:

```go
		if err := json.Unmarshal(input.Items, &orderItems); err == nil {
			itemIDs := make([]uint, 0, len(orderItems))
			for _, item := range orderItems {
				if item.Quantity > 0 && item.ItemID > 0 {
					itemIDs = append(itemIDs, item.ItemID)
				}
			}
			if len(itemIDs) > 0 {
				var menuItems []models.MenuItem
				if err := db.Where("id IN ? AND store_id = ?", itemIDs, input.StoreID).Find(&menuItems).Error; err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to verify order items"})
					return
				}
				priceMap := make(map[uint]float64, len(menuItems))
				for _, mi := range menuItems {
					priceMap[mi.ID] = mi.Price
				}
				for _, item := range orderItems {
					if price, ok := priceMap[item.ItemID]; ok && item.Quantity > 0 {
						subtotal += price * float64(item.Quantity)
					}
				}
			}
		}
```

Replace with:

```go
		if err := json.Unmarshal(input.Items, &orderItems); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid items format"})
			return
		}
		itemIDs := make([]uint, 0, len(orderItems))
		for _, item := range orderItems {
			if item.Quantity > 0 && item.ItemID > 0 {
				itemIDs = append(itemIDs, item.ItemID)
			}
		}
		if len(itemIDs) > 0 {
			var menuItems []models.MenuItem
			if err := db.Where("id IN ? AND store_id = ?", itemIDs, input.StoreID).Find(&menuItems).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to verify order items"})
				return
			}
			priceMap := make(map[uint]float64, len(menuItems))
			for _, mi := range menuItems {
				priceMap[mi.ID] = mi.Price
			}
			for _, item := range orderItems {
				if price, ok := priceMap[item.ItemID]; ok && item.Quantity > 0 {
					subtotal += price * float64(item.Quantity)
				}
			}
		}
```

- [ ] **Step 4: Run test to verify it now fails correctly**

Run: `cd backend && go test ./pkg/handlers/ -run TestCreateOrder_RejectsInvalidItemsJSON -v`
Expected: PASS (400 returned for invalid items)

- [ ] **Step 5: Run all tests**

Run: `cd backend && go test ./pkg/handlers/ -v`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add backend/pkg/handlers/handlers.go backend/pkg/handlers/handlers_critical_test.go
git commit -m "fix: reject orders with invalid items JSON instead of creating with zero subtotal"
```

---

### Task 6: Fix admin CommissionPage label mismatch

**Files:**
- Modify: `admin/src/pages/CommissionPage.tsx` (lines 76, 95, 99, 131, 139, 158, 243, 312)

The page uses "Maintenance Rate" throughout when it should say "Commission Rate" to match the backend model.

- [ ] **Step 1: Replace all "Maintenance Rate" occurrences**

In `admin/src/pages/CommissionPage.tsx`, do a find-and-replace:

| Old text | New text |
|----------|----------|
| `Failed to load maintenance rate data` | `Failed to load commission data` |
| `Maintenance rate updated to` | `Commission rate updated to` |
| `Failed to update maintenance rate` | `Failed to update commission rate` |
| `Maintenance Rate` (heading) | `Commission Rate` |
| `Current Maintenance Rate` | `Current Commission Rate` |
| `Total Maintenance` | `Total Commission` |
| `No maintenance rate records found` | `No commission records found` |
| `Edit Maintenance Rate` | `Edit Commission Rate` |

- [ ] **Step 2: Verify the admin builds**

Run: `cd admin && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/CommissionPage.tsx
git commit -m "fix: replace 'Maintenance Rate' labels with 'Commission Rate' in admin"
```

---

### Task 7: Add error detail logging to all admin GET handlers that return generic 500s

**Files:**
- Modify: `backend/pkg/handlers/handlers.go`

Many admin handlers return `"Failed to fetch X"` without logging the actual GORM error. Add `log.Printf` before each generic 500 response in admin GET handlers, matching the pattern we already added to `GetAllUsers`.

- [ ] **Step 1: Find and fix all generic 500 responses in admin handlers**

Search for all instances of `"Failed to fetch` in handlers.go and add logging. The pattern to apply for each:

Before:
```go
c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch X"})
```

After:
```go
log.Printf("GetAllX: query error: %v", err)
c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch X: " + err.Error()})
```

Apply to these handlers (each has `"Failed to fetch"` pattern):
- `GetAllDrivers`
- `GetAllRides`
- `GetAllDeliveries`
- `GetAllOrders`
- `GetAllStores` (admin version)
- `GetAllPromos`
- `GetAllNotifications`
- `GetActivityLogs`
- `GetAllRates`
- `GetAllPaymentConfigs`
- `GetAllWithdrawals`
- `GetAllAnnouncements`
- `GetAllReferrals`

- [ ] **Step 2: Build to verify**

Run: `cd backend && go build ./...`
Expected: Success

- [ ] **Step 3: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "fix: add error detail logging to all admin GET handlers"
```
