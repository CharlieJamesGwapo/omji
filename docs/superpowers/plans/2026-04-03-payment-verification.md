# Payment Verification System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add proof-of-payment verification for GCash/Maya payments so riders/admins can confirm payment before service completion, and fix 6 existing payment bugs.

**Architecture:** New `PaymentProof` model stores uploaded proof screenshots with status tracking. Mobile users upload proof after transferring, riders verify on-site, admins have override authority. Existing wallet/cash flows unchanged.

**Tech Stack:** Go/Gin + GORM (backend), React Native/Expo (mobile), React (admin)

---

### Task 1: Add PaymentProof Model + PaymentStatus Fields (Backend)

**Files:**
- Modify: `backend/pkg/models/models.go:333-422`

- [ ] **Step 1: Add PaymentProof struct after PaymentConfig (line 342)**

Add this after the `PaymentConfig` struct closing brace at line 342:

```go
// PaymentProof stores proof-of-payment for GCash/Maya transactions
type PaymentProof struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	ServiceType     string    `gorm:"index:idx_proof_service;not null" json:"service_type"` // ride, delivery, order
	ServiceID       uint      `gorm:"index:idx_proof_service;not null" json:"service_id"`
	UserID          uint      `gorm:"index:idx_proof_user_status;not null" json:"user_id"`
	User            *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	PaymentMethod   string    `gorm:"not null" json:"payment_method"` // gcash, maya
	ReferenceNumber string    `gorm:"not null" json:"reference_number"`
	Amount          float64   `gorm:"not null" json:"amount"`
	ProofImageURL   string    `gorm:"type:text;not null" json:"proof_image_url"` // base64 data URL
	Status          string    `gorm:"default:'submitted';index:idx_proof_user_status;index:idx_proof_status" json:"status"` // submitted, verified, rejected
	VerifiedByID    *uint     `json:"verified_by_id,omitempty"`
	VerifiedByRole  string    `json:"verified_by_role,omitempty"` // rider, admin
	RejectionReason string    `json:"rejection_reason,omitempty"`
	AttemptNumber   int       `gorm:"default:1" json:"attempt_number"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}
```

- [ ] **Step 2: Add PaymentStatus field to Ride model (line 112)**

After the `PaymentMethod` field at line 112 in the Ride struct, add:

```go
	PaymentStatus       string    `gorm:"default:'pending'" json:"payment_status"` // pending, submitted, verified, rejected
```

- [ ] **Step 3: Add PaymentStatus field to Delivery model (line 164)**

After the `PaymentMethod` field at line 164 in the Delivery struct, add:

```go
	PaymentStatus       string    `gorm:"default:'pending'" json:"payment_status"` // pending, submitted, verified, rejected
```

- [ ] **Step 4: Add PaymentStatus field to Order model (line 230)**

After the `PaymentMethod` field at line 230 in the Order struct, add:

```go
	PaymentStatus       string    `gorm:"default:'pending'" json:"payment_status"` // pending, submitted, verified, rejected
```

- [ ] **Step 5: Register PaymentProof in AutoMigrate (line 396-421)**

Add `&PaymentProof{}` to the AutoMigrate call, after `&WithdrawalRequest{}` (line 418):

```go
		&PaymentProof{},
```

- [ ] **Step 6: Commit**

```bash
git add backend/pkg/models/models.go
git commit -m "feat: add PaymentProof model and PaymentStatus fields to Ride/Delivery/Order"
```

---

### Task 2: Add Payment Proof Handlers (Backend — User Endpoints)

**Files:**
- Modify: `backend/pkg/handlers/handlers.go` (after line 5357)

- [ ] **Step 1: Add UploadPaymentProof handler**

Add after the `GetPaymentConfigs` function (after line 5357):

```go
// UploadPaymentProof handles proof-of-payment image uploads from mobile users
func UploadPaymentProof(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		file, err := c.FormFile("proof_image")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "No file uploaded"})
			return
		}
		if file.Size > 5*1024*1024 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "File too large. Maximum 5MB allowed"})
			return
		}
		ext := strings.ToLower(filepath.Ext(file.Filename))
		mimeTypes := map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
		mimeType, ok := mimeTypes[ext]
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid file type. Only PNG, JPG, JPEG, WEBP allowed"})
			return
		}
		src, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to read file"})
			return
		}
		defer src.Close()
		data, err := io.ReadAll(src)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to read file"})
			return
		}
		dataURL := fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(data))
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"url": dataURL}})
	}
}
```

- [ ] **Step 2: Add SubmitPaymentProof handler**

```go
// SubmitPaymentProof creates a payment proof record and updates service payment status
func SubmitPaymentProof(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("user_id")
		var input struct {
			ServiceType     string  `json:"service_type" binding:"required"`
			ServiceID       uint    `json:"service_id" binding:"required"`
			PaymentMethod   string  `json:"payment_method" binding:"required"`
			ReferenceNumber string  `json:"reference_number" binding:"required"`
			Amount          float64 `json:"amount" binding:"required"`
			ProofImageURL   string  `json:"proof_image_url" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Missing required fields: service_type, service_id, payment_method, reference_number, amount, proof_image_url"})
			return
		}
		// Validate service_type
		validTypes := map[string]bool{"ride": true, "delivery": true, "order": true}
		if !validTypes[input.ServiceType] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid service_type. Must be ride, delivery, or order"})
			return
		}
		// Validate payment_method
		if input.PaymentMethod != "gcash" && input.PaymentMethod != "maya" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid payment_method. Must be gcash or maya"})
			return
		}
		// Validate proof_image_url starts with data:image/
		if !strings.HasPrefix(input.ProofImageURL, "data:image/") {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid proof image format"})
			return
		}
		uid := userID.(uint)

		// Check how many attempts already exist
		var attemptCount int64
		db.Model(&models.PaymentProof{}).Where("service_type = ? AND service_id = ? AND user_id = ?",
			input.ServiceType, input.ServiceID, uid).Count(&attemptCount)
		if attemptCount >= 2 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Maximum proof attempts reached. Please switch to cash payment."})
			return
		}

		proof := models.PaymentProof{
			ServiceType:     input.ServiceType,
			ServiceID:       input.ServiceID,
			UserID:          uid,
			PaymentMethod:   input.PaymentMethod,
			ReferenceNumber: input.ReferenceNumber,
			Amount:          input.Amount,
			ProofImageURL:   input.ProofImageURL,
			Status:          "submitted",
			AttemptNumber:   int(attemptCount) + 1,
		}

		if err := db.Create(&proof).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to submit payment proof"})
			return
		}

		// Update service payment_status to "submitted"
		switch input.ServiceType {
		case "ride":
			db.Model(&models.Ride{}).Where("id = ? AND user_id = ?", input.ServiceID, uid).Update("payment_status", "submitted")
		case "delivery":
			db.Model(&models.Delivery{}).Where("id = ? AND user_id = ?", input.ServiceID, uid).Update("payment_status", "submitted")
		case "order":
			db.Model(&models.Order{}).Where("id = ? AND user_id = ?", input.ServiceID, uid).Update("payment_status", "submitted")
		}

		c.JSON(http.StatusCreated, gin.H{"success": true, "data": proof})
	}
}
```

- [ ] **Step 3: Add GetPaymentProofStatus handler**

```go
// GetPaymentProofStatus returns the latest payment proof for a service
func GetPaymentProofStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		serviceType := c.Param("serviceType")
		serviceID := c.Param("serviceId")
		userID, _ := c.Get("user_id")

		var proof models.PaymentProof
		err := db.Where("service_type = ? AND service_id = ? AND user_id = ?",
			serviceType, serviceID, userID.(uint)).
			Order("created_at DESC").First(&proof).Error
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "No payment proof found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": proof})
	}
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "feat: add user payment proof handlers (upload, submit, status)"
```

---

### Task 3: Add Payment Proof Handlers (Backend — Rider + Admin Endpoints)

**Files:**
- Modify: `backend/pkg/handlers/handlers.go` (append after Task 2 handlers)

- [ ] **Step 1: Add RiderGetPaymentProof handler**

```go
// RiderGetPaymentProof returns payment proof for a service assigned to the rider
func RiderGetPaymentProof(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("user_id")
		serviceType := c.Param("serviceType")
		serviceID := c.Param("serviceId")

		// Verify the rider is assigned to this service
		uid := userID.(uint)
		var driverID uint
		var driver models.Driver
		if err := db.Where("user_id = ?", uid).First(&driver).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Driver profile not found"})
			return
		}
		driverID = driver.ID

		assigned := false
		switch serviceType {
		case "ride":
			var ride models.Ride
			if err := db.Where("id = ? AND driver_id = ?", serviceID, driverID).First(&ride).Error; err == nil {
				assigned = true
			}
		case "delivery":
			var delivery models.Delivery
			if err := db.Where("id = ? AND driver_id = ?", serviceID, driverID).First(&delivery).Error; err == nil {
				assigned = true
			}
		}
		if !assigned {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "You are not assigned to this service"})
			return
		}

		var proof models.PaymentProof
		err := db.Where("service_type = ? AND service_id = ? AND status = ?",
			serviceType, serviceID, "submitted").
			Order("created_at DESC").First(&proof).Error
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "No pending payment proof found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": proof})
	}
}
```

- [ ] **Step 2: Add RiderVerifyPaymentProof handler**

```go
// RiderVerifyPaymentProof marks a payment proof as verified by the rider
func RiderVerifyPaymentProof(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("user_id")
		proofID := c.Param("id")
		uid := userID.(uint)

		var proof models.PaymentProof
		if err := db.First(&proof, proofID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Payment proof not found"})
			return
		}
		if proof.Status != "submitted" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Proof is not in submitted status"})
			return
		}

		proof.Status = "verified"
		proof.VerifiedByID = &uid
		proof.VerifiedByRole = "rider"
		if err := db.Save(&proof).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to verify payment proof"})
			return
		}

		// Update service payment_status
		switch proof.ServiceType {
		case "ride":
			db.Model(&models.Ride{}).Where("id = ?", proof.ServiceID).Update("payment_status", "verified")
		case "delivery":
			db.Model(&models.Delivery{}).Where("id = ?", proof.ServiceID).Update("payment_status", "verified")
		case "order":
			db.Model(&models.Order{}).Where("id = ?", proof.ServiceID).Update("payment_status", "verified")
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Payment verified"})
	}
}
```

- [ ] **Step 3: Add RiderRejectPaymentProof handler**

```go
// RiderRejectPaymentProof marks a payment proof as rejected with a reason
func RiderRejectPaymentProof(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		proofID := c.Param("id")
		var input struct {
			Reason string `json:"reason" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Rejection reason is required"})
			return
		}

		var proof models.PaymentProof
		if err := db.First(&proof, proofID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Payment proof not found"})
			return
		}
		if proof.Status != "submitted" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Proof is not in submitted status"})
			return
		}

		proof.Status = "rejected"
		proof.RejectionReason = input.Reason
		if err := db.Save(&proof).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to reject payment proof"})
			return
		}

		// Update service payment_status
		switch proof.ServiceType {
		case "ride":
			db.Model(&models.Ride{}).Where("id = ?", proof.ServiceID).Update("payment_status", "rejected")
		case "delivery":
			db.Model(&models.Delivery{}).Where("id = ?", proof.ServiceID).Update("payment_status", "rejected")
		case "order":
			db.Model(&models.Order{}).Where("id = ?", proof.ServiceID).Update("payment_status", "rejected")
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Payment proof rejected"})
	}
}
```

- [ ] **Step 4: Add Admin payment proof handlers**

```go
// AdminGetPaymentProofs returns paginated payment proofs with optional filters
func AdminGetPaymentProofs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := c.DefaultQuery("status", "submitted")
		serviceType := c.Query("service_type")
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
		if page < 1 { page = 1 }
		if limit < 1 || limit > 100 { limit = 20 }
		offset := (page - 1) * limit

		query := db.Model(&models.PaymentProof{}).Preload("User")
		if status != "" {
			query = query.Where("status = ?", status)
		}
		if serviceType != "" {
			query = query.Where("service_type = ?", serviceType)
		}

		var total int64
		query.Count(&total)

		var proofs []models.PaymentProof
		if err := query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&proofs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch payment proofs"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": proofs, "total": total, "page": page, "limit": limit})
	}
}

// AdminVerifyPaymentProof marks a payment proof as verified by admin
func AdminVerifyPaymentProof(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("user_id")
		proofID := c.Param("id")
		uid := userID.(uint)

		var proof models.PaymentProof
		if err := db.First(&proof, proofID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Payment proof not found"})
			return
		}
		if proof.Status != "submitted" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Proof is not in submitted status"})
			return
		}

		proof.Status = "verified"
		proof.VerifiedByID = &uid
		proof.VerifiedByRole = "admin"
		if err := db.Save(&proof).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to verify payment proof"})
			return
		}

		switch proof.ServiceType {
		case "ride":
			db.Model(&models.Ride{}).Where("id = ?", proof.ServiceID).Update("payment_status", "verified")
		case "delivery":
			db.Model(&models.Delivery{}).Where("id = ?", proof.ServiceID).Update("payment_status", "verified")
		case "order":
			db.Model(&models.Order{}).Where("id = ?", proof.ServiceID).Update("payment_status", "verified")
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Payment verified by admin"})
	}
}

// AdminRejectPaymentProof marks a payment proof as rejected by admin
func AdminRejectPaymentProof(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		proofID := c.Param("id")
		var input struct {
			Reason string `json:"reason" binding:"required"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Rejection reason is required"})
			return
		}

		var proof models.PaymentProof
		if err := db.First(&proof, proofID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Payment proof not found"})
			return
		}
		if proof.Status != "submitted" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Proof is not in submitted status"})
			return
		}

		proof.Status = "rejected"
		proof.RejectionReason = input.Reason
		if err := db.Save(&proof).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to reject payment proof"})
			return
		}

		switch proof.ServiceType {
		case "ride":
			db.Model(&models.Ride{}).Where("id = ?", proof.ServiceID).Update("payment_status", "rejected")
		case "delivery":
			db.Model(&models.Delivery{}).Where("id = ?", proof.ServiceID).Update("payment_status", "rejected")
		case "order":
			db.Model(&models.Order{}).Where("id = ?", proof.ServiceID).Update("payment_status", "rejected")
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Payment proof rejected by admin"})
	}
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "feat: add rider and admin payment proof verification handlers"
```

---

### Task 4: Register Payment Proof Routes (Backend)

**Files:**
- Modify: `backend/cmd/main.go:123-335`

- [ ] **Step 1: Add user payment proof routes in protected group**

After the payment methods routes (line 168), add:

```go
		// Payment proof routes
		protected.POST("/payment-proof/upload", handlers.UploadPaymentProof(database))
		protected.POST("/payment-proof/submit", handlers.SubmitPaymentProof(database))
		protected.GET("/payment-proof/:serviceType/:serviceId", handlers.GetPaymentProofStatus(database))
```

- [ ] **Step 2: Add rider payment proof routes in protected group**

After the driver routes section (after line 188), add:

```go
		// Rider payment proof verification
		protected.GET("/driver/payment-proof/:serviceType/:serviceId", handlers.RiderGetPaymentProof(database))
		protected.PUT("/driver/payment-proof/:id/verify", handlers.RiderVerifyPaymentProof(database))
		protected.PUT("/driver/payment-proof/:id/reject", handlers.RiderRejectPaymentProof(database))
```

- [ ] **Step 3: Add admin payment proof routes in admin group**

After the payment-configs routes (after line 335), add:

```go
		// Payment proof management
		admin.GET("/payment-proofs", handlers.AdminGetPaymentProofs(database))
		admin.PUT("/payment-proof/:id/verify", handlers.AdminVerifyPaymentProof(database))
		admin.PUT("/payment-proof/:id/reject", handlers.AdminRejectPaymentProof(database))
```

- [ ] **Step 4: Build and verify**

Run: `cd /Users/dev3/omji/backend && go build ./...`
Expected: Clean build with no errors

- [ ] **Step 5: Commit**

```bash
git add backend/cmd/main.go
git commit -m "feat: register payment proof routes for user, rider, and admin"
```

---

### Task 5: Backend Bug Fixes

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:2282-2315` (wallet fallback)
- Modify: `backend/pkg/handlers/handlers.go:5281-5295` (deletion protection)
- Modify: `backend/pkg/handlers/handlers.go:1495-1513` (type validation)

- [ ] **Step 1: Fix wallet fallback silently completing (line 2309-2313)**

Replace the wallet fallback section. Find lines where `updates["payment_method"] = "cash"` appears (lines 2294, 2306, 2310, 2313) inside the `if ride.PaymentMethod == "wallet"` block.

Replace the entire wallet payment block (lines 2283-2315):

```go
					if ride.PaymentMethod == "wallet" {
						var wallet models.Wallet
						if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ?", ride.UserID).First(&wallet).Error; err == nil {
							fare := ride.FinalFare
							if fare == 0 {
								fare = ride.EstimatedFare
							}
							if wallet.Balance >= fare {
								wallet.Balance -= fare
								if err := tx.Save(&wallet).Error; err != nil {
									log.Printf("Failed to save wallet for ride %d: %v", ride.ID, err)
									updates["payment_method"] = "cash"
									updates["payment_status"] = "pending"
								} else {
									if err := tx.Create(&models.WalletTransaction{
										WalletID: uintPtr(wallet.ID), UserID: ride.UserID, Type: "payment",
										Amount: fare, Description: "Ride payment #" + strconv.Itoa(int(ride.ID)),
										Reference: "RIDE-" + strconv.Itoa(int(ride.ID)),
									}).Error; err != nil {
										log.Printf("Failed to create wallet tx for ride %d, rolling back wallet: %v", ride.ID, err)
										wallet.Balance += fare
										if err := tx.Save(&wallet).Error; err != nil {
											log.Printf("CRITICAL: Failed to rollback wallet for ride %d: %v", ride.ID, err)
										}
										updates["payment_method"] = "cash"
										updates["payment_status"] = "pending"
									} else {
										updates["payment_status"] = "verified"
									}
								}
							} else {
								updates["payment_method"] = "cash"
								updates["payment_status"] = "pending"
							}
						} else {
							updates["payment_method"] = "cash"
							updates["payment_status"] = "pending"
						}
					}
```

- [ ] **Step 2: Fix AdminDeletePaymentConfig — add deletion protection (lines 5281-5295)**

Replace the entire `AdminDeletePaymentConfig` function:

```go
func AdminDeletePaymentConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var config models.PaymentConfig
		if err := db.First(&config, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Payment config not found"})
			return
		}
		if config.IsActive {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Cannot delete an active payment config. Deactivate it first."})
			return
		}
		if err := db.Delete(&config).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete payment config"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Payment config deleted"})
	}
}
```

- [ ] **Step 3: Fix AddPaymentMethod — add type validation (lines 1495-1513)**

In the `AddPaymentMethod` handler, after binding JSON input, add validation. Find the struct binding and add after it:

```go
		validTypes := map[string]bool{"cash": true, "gcash": true, "maya": true, "wallet": true}
		if !validTypes[input.Type] {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid payment type. Must be cash, gcash, maya, or wallet"})
			return
		}
```

- [ ] **Step 4: Build and verify**

Run: `cd /Users/dev3/omji/backend && go build ./...`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "fix: wallet fallback tracks payment_status, deletion protection, type validation"
```

---

### Task 6: Add PaymentProof Types + API Services (Mobile)

**Files:**
- Modify: `mobile/src/types/index.ts:182`
- Modify: `mobile/src/services/api.ts:201-204`

- [ ] **Step 1: Add PaymentProof interface and PaymentStatus type to types**

After line 182 in `mobile/src/types/index.ts` (after the `PaymentMethod` type), add:

```typescript
export type PaymentStatus = 'pending' | 'submitted' | 'verified' | 'rejected';

export interface PaymentProof {
  id: number;
  service_type: 'ride' | 'delivery' | 'order';
  service_id: number;
  user_id: number;
  payment_method: 'gcash' | 'maya';
  reference_number: string;
  amount: number;
  proof_image_url: string;
  status: PaymentStatus;
  verified_by_id?: number;
  verified_by_role?: 'rider' | 'admin';
  rejection_reason?: string;
  attempt_number: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Add paymentProofService to api.ts**

After the `paymentConfigService` block (line 204) in `mobile/src/services/api.ts`, add:

```typescript
export const paymentProofService = {
  upload: (formData: FormData) =>
    api.post('/payment-proof/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    }),
  submit: (data: {
    service_type: string;
    service_id: number;
    payment_method: string;
    reference_number: string;
    amount: number;
    proof_image_url: string;
  }) => api.post('/payment-proof/submit', data),
  getStatus: (serviceType: string, serviceId: number) =>
    api.get(`/payment-proof/${serviceType}/${serviceId}`),
};
```

- [ ] **Step 3: Commit**

```bash
git add mobile/src/types/index.ts mobile/src/services/api.ts
git commit -m "feat: add PaymentProof types and API service for mobile"
```

---

### Task 7: Rework PaymentScreen — Proof Upload Flow (Mobile)

**Files:**
- Modify: `mobile/src/screens/Main/PaymentScreen.tsx` (major rework)

- [ ] **Step 1: Add new imports at the top (line 1-22)**

Add these imports after the existing ones:

```typescript
import * as ImagePicker from 'expo-image-picker';
import { paymentProofService } from '../../services/api';
```

- [ ] **Step 2: Fix reference number generation (line 40)**

Replace line 40:
```typescript
  const [referenceNo] = useState(() => `OMJI-${Date.now().toString(36).toUpperCase()}`);
```
With:
```typescript
  const [referenceNo] = useState(() => {
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `OMJI-${Date.now().toString(36).toUpperCase()}-${rand}`;
  });
```

- [ ] **Step 3: Add proof-related state variables after line 48**

After `const isLeavingRef = useRef(false);` (line 48), add:

```typescript
  // Proof upload state
  const [proofStep, setProofStep] = useState<'payment' | 'upload' | 'status'>('payment');
  const [proofImageUrl, setProofImageUrl] = useState<string | null>(null);
  const [proofStatus, setProofStatus] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

- [ ] **Step 4: Add cleanup for status polling in the first useEffect (line 69-72)**

Update the cleanup return at line 69:
```typescript
    return () => {
      clearTimeout(qrTimeout);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
```

- [ ] **Step 5: Add proof upload and submission functions after handleSelectTip**

After the `handleSelectTip` function (around line 208), add:

```typescript
  const pickProofImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Please allow access to your photo library to upload proof.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      uploadProofImage(result.assets[0].uri);
    }
  };

  const takeProofPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Please allow camera access to take a photo of your proof.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      base64: false,
    });
    if (!result.canceled && result.assets[0]) {
      uploadProofImage(result.assets[0].uri);
    }
  };

  const uploadProofImage = async (uri: string) => {
    setUploadingProof(true);
    try {
      const formData = new FormData();
      const filename = uri.split('/').pop() || 'proof.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      formData.append('proof_image', { uri, name: filename, type: mimeType } as any);
      const res = await paymentProofService.upload(formData);
      const url = res.data?.data?.url;
      if (url) {
        setProofImageUrl(url);
      } else {
        Alert.alert('Upload Failed', 'Could not upload image. Please try again.');
      }
    } catch {
      Alert.alert('Upload Failed', 'Could not upload image. Please try again.');
    } finally {
      setUploadingProof(false);
    }
  };

  const submitProof = async () => {
    if (!proofImageUrl) {
      Alert.alert('Missing Proof', 'Please upload a screenshot of your payment.');
      return;
    }
    setSubmittingProof(true);
    try {
      await paymentProofService.submit({
        service_type: serviceType || 'ride',
        service_id: rideId || 0,
        payment_method: type,
        reference_number: referenceNo,
        amount: totalAmount,
        proof_image_url: proofImageUrl,
      });
      setProofStep('status');
      setProofStatus('submitted');
      startPollingStatus();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to submit proof. Please try again.';
      Alert.alert('Submission Failed', msg);
    } finally {
      setSubmittingProof(false);
    }
  };

  const startPollingStatus = () => {
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    statusPollRef.current = setInterval(async () => {
      try {
        const res = await paymentProofService.getStatus(serviceType || 'ride', rideId || 0);
        const proof = res.data?.data;
        if (proof) {
          setProofStatus(proof.status);
          if (proof.status === 'verified') {
            if (statusPollRef.current) clearInterval(statusPollRef.current);
          } else if (proof.status === 'rejected') {
            if (statusPollRef.current) clearInterval(statusPollRef.current);
            setRejectionReason(proof.rejection_reason || 'Payment proof was rejected.');
            setAttemptNumber(proof.attempt_number);
          }
        }
      } catch {
        // silent — keep polling
      }
    }, 5000);
  };

  const retryProof = () => {
    setProofImageUrl(null);
    setProofStatus(null);
    setRejectionReason(null);
    setProofStep('upload');
  };

  const switchToCash = () => {
    Alert.alert(
      'Switch to Cash',
      'Your payment method will be changed to cash. You will pay the rider directly.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch to Cash', onPress: handleDone },
      ]
    );
  };
```

- [ ] **Step 6: Replace "I've Completed Payment" button (lines 466-475) with proof flow**

Replace the `handleDone` button section (lines 465-475) with:

```typescript
        {/* Payment Action Section */}
        {proofStep === 'payment' && (
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => setProofStep('upload')}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-upload" size={moderateScale(22)} color="#DC2626" />
            <Text style={styles.doneButtonText}>I've Sent Payment — Upload Proof</Text>
          </TouchableOpacity>
        )}

        {proofStep === 'upload' && (
          <View style={styles.proofSection}>
            <Text style={styles.proofTitle}>Upload Payment Proof</Text>
            <Text style={styles.proofSubtitle}>
              Take a screenshot of your {brandName} payment confirmation
            </Text>

            {proofImageUrl ? (
              <View style={styles.proofPreviewContainer}>
                <Image source={{ uri: proofImageUrl }} style={styles.proofPreview} resizeMode="contain" />
                <TouchableOpacity style={styles.retakeButton} onPress={pickProofImage}>
                  <Ionicons name="refresh" size={moderateScale(16)} color="#fff" />
                  <Text style={styles.retakeText}>Change Image</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.proofButtons}>
                <TouchableOpacity
                  style={styles.proofPickButton}
                  onPress={takeProofPhoto}
                  disabled={uploadingProof}
                >
                  <Ionicons name="camera" size={moderateScale(24)} color="#DC2626" />
                  <Text style={styles.proofPickText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.proofPickButton}
                  onPress={pickProofImage}
                  disabled={uploadingProof}
                >
                  <Ionicons name="images" size={moderateScale(24)} color="#DC2626" />
                  <Text style={styles.proofPickText}>Gallery</Text>
                </TouchableOpacity>
              </View>
            )}
            {uploadingProof && (
              <ActivityIndicator size="small" color="#DC2626" style={{ marginTop: verticalScale(8) }} />
            )}

            <View style={styles.refInputRow}>
              <Text style={styles.refInputLabel}>Reference #</Text>
              <Text style={styles.refInputValue}>{referenceNo}</Text>
            </View>

            <TouchableOpacity
              style={[styles.submitProofButton, (!proofImageUrl || submittingProof) && { opacity: 0.5 }]}
              onPress={submitProof}
              disabled={!proofImageUrl || submittingProof}
              activeOpacity={0.8}
            >
              {submittingProof ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={moderateScale(20)} color="#fff" />
                  <Text style={styles.submitProofText}>Submit Proof</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {proofStep === 'status' && (
          <View style={styles.proofSection}>
            {proofStatus === 'submitted' && (
              <>
                <View style={styles.statusBadge}>
                  <ActivityIndicator size="small" color="#F59E0B" />
                  <Text style={[styles.statusText, { color: '#F59E0B' }]}>Waiting for Verification</Text>
                </View>
                <Text style={styles.statusSubtext}>
                  Your payment proof has been submitted. The rider will verify your payment shortly.
                </Text>
              </>
            )}
            {proofStatus === 'verified' && (
              <>
                <View style={styles.statusBadge}>
                  <Ionicons name="checkmark-circle" size={moderateScale(24)} color="#10B981" />
                  <Text style={[styles.statusText, { color: '#10B981' }]}>Payment Verified!</Text>
                </View>
                <TouchableOpacity style={styles.doneButton} onPress={handleDone} activeOpacity={0.8}>
                  <Text style={styles.doneButtonText}>Continue</Text>
                </TouchableOpacity>
              </>
            )}
            {proofStatus === 'rejected' && (
              <>
                <View style={styles.statusBadge}>
                  <Ionicons name="close-circle" size={moderateScale(24)} color="#EF4444" />
                  <Text style={[styles.statusText, { color: '#EF4444' }]}>Proof Rejected</Text>
                </View>
                <Text style={styles.rejectionText}>{rejectionReason}</Text>
                {attemptNumber < 2 ? (
                  <TouchableOpacity style={styles.doneButton} onPress={retryProof} activeOpacity={0.8}>
                    <Ionicons name="refresh" size={moderateScale(20)} color="#DC2626" />
                    <Text style={styles.doneButtonText}>Upload New Proof</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.doneButton, { borderColor: '#6B7280' }]} onPress={switchToCash} activeOpacity={0.8}>
                    <Ionicons name="cash" size={moderateScale(20)} color="#6B7280" />
                    <Text style={[styles.doneButtonText, { color: '#6B7280' }]}>Switch to Cash Payment</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}
```

- [ ] **Step 7: Add new styles to the StyleSheet**

Add these styles at the end of the `StyleSheet.create` block (before the closing `});`):

```typescript
  proofSection: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(16),
    marginHorizontal: RESPONSIVE.paddingHorizontal,
    marginTop: verticalScale(12),
    marginBottom: verticalScale(20),
    padding: moderateScale(16),
    alignItems: 'center',
  },
  proofTitle: {
    fontSize: fontScale(17),
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: verticalScale(4),
  },
  proofSubtitle: {
    fontSize: fontScale(13),
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: verticalScale(16),
  },
  proofButtons: {
    flexDirection: 'row',
    gap: moderateScale(16),
  },
  proofPickButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: moderateScale(100),
    height: moderateScale(80),
    borderRadius: moderateScale(12),
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  proofPickText: {
    fontSize: fontScale(12),
    color: '#DC2626',
    marginTop: verticalScale(4),
    fontWeight: '600',
  },
  proofPreviewContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  proofPreview: {
    width: moderateScale(200),
    height: moderateScale(260),
    borderRadius: moderateScale(12),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6B7280',
    borderRadius: moderateScale(8),
    paddingHorizontal: moderateScale(12),
    paddingVertical: verticalScale(6),
    marginTop: verticalScale(8),
    gap: moderateScale(4),
  },
  retakeText: {
    fontSize: fontScale(12),
    color: '#fff',
    fontWeight: '600',
  },
  refInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: verticalScale(10),
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    marginTop: verticalScale(12),
  },
  refInputLabel: {
    fontSize: fontScale(13),
    color: '#6B7280',
    fontWeight: '600',
  },
  refInputValue: {
    fontSize: fontScale(13),
    color: '#1F2937',
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  submitProofButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(14),
    width: '100%',
    marginTop: verticalScale(12),
    gap: moderateScale(8),
  },
  submitProofText: {
    fontSize: fontScale(15),
    fontWeight: '700',
    color: '#fff',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
    marginBottom: verticalScale(8),
  },
  statusText: {
    fontSize: fontScale(16),
    fontWeight: '700',
  },
  statusSubtext: {
    fontSize: fontScale(13),
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: verticalScale(8),
  },
  rejectionText: {
    fontSize: fontScale(13),
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: verticalScale(12),
    fontStyle: 'italic',
  },
```

- [ ] **Step 8: Commit**

```bash
git add mobile/src/screens/Main/PaymentScreen.tsx
git commit -m "feat: rework PaymentScreen with proof upload, submission, and status polling"
```

---

### Task 8: Add PaymentVerificationCard to Rider Dashboard (Mobile)

**Files:**
- Create: `mobile/src/components/PaymentVerificationCard.tsx`
- Modify: `mobile/src/screens/Rider/RiderDashboardScreen.tsx`
- Modify: `mobile/src/services/api.ts`

- [ ] **Step 1: Add rider payment proof API service**

After the `paymentProofService` block in `mobile/src/services/api.ts`, add:

```typescript
export const riderPaymentProofService = {
  getProof: (serviceType: string, serviceId: number) =>
    api.get(`/driver/payment-proof/${serviceType}/${serviceId}`),
  verify: (proofId: number) =>
    api.put(`/driver/payment-proof/${proofId}/verify`),
  reject: (proofId: number, reason: string) =>
    api.put(`/driver/payment-proof/${proofId}/reject`, { reason }),
};
```

- [ ] **Step 2: Create PaymentVerificationCard component**

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { riderPaymentProofService } from '../services/api';
import { COLORS } from '../constants/theme';
import { fontScale, verticalScale, moderateScale, RESPONSIVE } from '../utils/responsive';

interface Props {
  serviceType: 'ride' | 'delivery';
  serviceId: number;
  paymentMethod: string;
  onVerified?: () => void;
}

export default function PaymentVerificationCard({ serviceType, serviceId, paymentMethod, onVerified }: Props) {
  const [proof, setProof] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  React.useEffect(() => {
    if (paymentMethod === 'gcash' || paymentMethod === 'maya') {
      fetchProof();
      const interval = setInterval(fetchProof, 5000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [serviceType, serviceId, paymentMethod]);

  const fetchProof = async () => {
    try {
      const res = await riderPaymentProofService.getProof(serviceType, serviceId);
      setProof(res.data?.data || null);
    } catch {
      setProof(null);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = () => {
    Alert.alert('Verify Payment', 'Confirm that you have verified this payment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Verify',
        onPress: async () => {
          setVerifying(true);
          try {
            await riderPaymentProofService.verify(proof.id);
            setProof((prev: any) => ({ ...prev, status: 'verified' }));
            onVerified?.();
          } catch {
            Alert.alert('Error', 'Failed to verify payment. Please try again.');
          } finally {
            setVerifying(false);
          }
        },
      },
    ]);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      Alert.alert('Required', 'Please enter a reason for rejection.');
      return;
    }
    setRejecting(true);
    try {
      await riderPaymentProofService.reject(proof.id, rejectReason.trim());
      setProof((prev: any) => ({ ...prev, status: 'rejected' }));
      setShowRejectModal(false);
      setRejectReason('');
    } catch {
      Alert.alert('Error', 'Failed to reject payment. Please try again.');
    } finally {
      setRejecting(false);
    }
  };

  if (paymentMethod !== 'gcash' && paymentMethod !== 'maya') return null;
  if (loading) return <ActivityIndicator size="small" color="#DC2626" style={{ margin: verticalScale(8) }} />;

  if (!proof) {
    return (
      <View style={styles.card}>
        <View style={styles.waitingRow}>
          <ActivityIndicator size="small" color="#F59E0B" />
          <Text style={styles.waitingText}>Waiting for payment proof from customer...</Text>
        </View>
      </View>
    );
  }

  if (proof.status === 'verified') {
    return (
      <View style={[styles.card, { borderColor: '#10B981' }]}>
        <View style={styles.verifiedRow}>
          <Ionicons name="checkmark-circle" size={moderateScale(20)} color="#10B981" />
          <Text style={[styles.statusLabel, { color: '#10B981' }]}>Payment Verified</Text>
        </View>
      </View>
    );
  }

  if (proof.status === 'rejected') {
    return (
      <View style={[styles.card, { borderColor: '#EF4444' }]}>
        <View style={styles.verifiedRow}>
          <Ionicons name="close-circle" size={moderateScale(20)} color="#EF4444" />
          <Text style={[styles.statusLabel, { color: '#EF4444' }]}>Proof Rejected — Waiting for retry</Text>
        </View>
      </View>
    );
  }

  const brandName = paymentMethod === 'gcash' ? 'GCash' : 'Maya';

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.methodBadge, { backgroundColor: paymentMethod === 'gcash' ? '#007bff' : '#34A853' }]}>
            <Text style={styles.methodText}>{brandName}</Text>
          </View>
          <Text style={styles.amountText}>₱{proof.amount?.toFixed(2)}</Text>
        </View>

        <TouchableOpacity onPress={() => setShowFullImage(true)} style={styles.proofImageContainer}>
          <Image source={{ uri: proof.proof_image_url }} style={styles.proofImage} resizeMode="contain" />
          <Text style={styles.tapHint}>Tap to view full size</Text>
        </TouchableOpacity>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Reference:</Text>
          <Text style={styles.detailValue}>{proof.reference_number}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.verifyButton}
            onPress={handleVerify}
            disabled={verifying}
          >
            {verifying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={moderateScale(18)} color="#fff" />
                <Text style={styles.verifyText}>Verify</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={() => setShowRejectModal(true)}
          >
            <Ionicons name="close" size={moderateScale(18)} color="#fff" />
            <Text style={styles.rejectText}>Reject</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Full-size image modal */}
      <Modal visible={showFullImage} transparent animationType="fade">
        <TouchableOpacity style={styles.fullImageOverlay} onPress={() => setShowFullImage(false)} activeOpacity={1}>
          <Image source={{ uri: proof.proof_image_url }} style={styles.fullImage} resizeMode="contain" />
          <TouchableOpacity style={styles.closeFullImage} onPress={() => setShowFullImage(false)}>
            <Ionicons name="close-circle" size={moderateScale(36)} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Reject reason modal */}
      <Modal visible={showRejectModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rejection Reason</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Why is this proof invalid?"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowRejectModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalReject} onPress={handleReject} disabled={rejecting}>
                {rejecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalRejectText}>Reject</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: moderateScale(12),
    marginVertical: verticalScale(8),
    marginHorizontal: RESPONSIVE.paddingHorizontal,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  methodBadge: {
    paddingHorizontal: moderateScale(10),
    paddingVertical: verticalScale(3),
    borderRadius: moderateScale(6),
  },
  methodText: {
    color: '#fff',
    fontSize: fontScale(12),
    fontWeight: '700',
  },
  amountText: {
    fontSize: fontScale(18),
    fontWeight: '700',
    color: '#1F2937',
  },
  proofImageContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  proofImage: {
    width: moderateScale(180),
    height: moderateScale(220),
    borderRadius: moderateScale(8),
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tapHint: {
    fontSize: fontScale(11),
    color: '#9CA3AF',
    marginTop: verticalScale(4),
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(6),
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  detailLabel: {
    fontSize: fontScale(13),
    color: '#6B7280',
  },
  detailValue: {
    fontSize: fontScale(13),
    fontWeight: '600',
    color: '#1F2937',
  },
  actionRow: {
    flexDirection: 'row',
    gap: moderateScale(10),
    marginTop: verticalScale(10),
  },
  verifyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(11),
    gap: moderateScale(6),
  },
  verifyText: {
    color: '#fff',
    fontSize: fontScale(14),
    fontWeight: '700',
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(11),
    gap: moderateScale(6),
  },
  rejectText: {
    color: '#fff',
    fontSize: fontScale(14),
    fontWeight: '700',
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
  },
  waitingText: {
    fontSize: fontScale(13),
    color: '#F59E0B',
    fontWeight: '600',
    flex: 1,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: moderateScale(8),
  },
  statusLabel: {
    fontSize: fontScale(14),
    fontWeight: '700',
  },
  fullImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '90%',
    height: '80%',
  },
  closeFullImage: {
    position: 'absolute',
    top: verticalScale(50),
    right: moderateScale(20),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    padding: moderateScale(20),
  },
  modalTitle: {
    fontSize: fontScale(17),
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: verticalScale(12),
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: moderateScale(10),
    padding: moderateScale(12),
    fontSize: fontScale(14),
    minHeight: verticalScale(80),
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    gap: moderateScale(10),
    marginTop: verticalScale(16),
  },
  modalCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(10),
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  modalCancelText: {
    fontSize: fontScale(14),
    fontWeight: '600',
    color: '#6B7280',
  },
  modalReject: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: verticalScale(12),
    borderRadius: moderateScale(10),
    backgroundColor: '#EF4444',
  },
  modalRejectText: {
    fontSize: fontScale(14),
    fontWeight: '700',
    color: '#fff',
  },
});
```

- [ ] **Step 3: Integrate PaymentVerificationCard into RiderDashboardScreen**

Add import at the top of `RiderDashboardScreen.tsx`:

```typescript
import PaymentVerificationCard from '../../components/PaymentVerificationCard';
```

In the active jobs rendering section, after showing job details (pickup, dropoff, fare), add the card for each active job:

```typescript
{activeJobs.map(job => (
  <View key={job.id}>
    {/* ... existing job card content ... */}
    <PaymentVerificationCard
      serviceType={job.type === 'delivery' ? 'delivery' : 'ride'}
      serviceId={job.id}
      paymentMethod={job.payment_method || 'cash'}
      onVerified={() => showToast('Payment verified!', 'success')}
    />
  </View>
))}
```

- [ ] **Step 4: Install expo-image-picker**

Run: `cd /Users/dev3/omji/mobile && npx expo install expo-image-picker`

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/PaymentVerificationCard.tsx mobile/src/screens/Rider/RiderDashboardScreen.tsx mobile/src/services/api.ts mobile/package.json mobile/package-lock.json
git commit -m "feat: add PaymentVerificationCard for rider payment proof verification"
```

---

### Task 9: Admin PaymentProofsPage (Admin Panel)

**Files:**
- Create: `admin/src/pages/PaymentProofsPage.tsx`
- Modify: `admin/src/services/api.ts:236-247`
- Modify: `admin/src/types/index.ts:177-186`
- Modify: `admin/src/App.tsx`

- [ ] **Step 1: Add PaymentProof type to admin types**

After the `PaymentConfig` interface in `admin/src/types/index.ts` (after line 186), add:

```typescript
export interface PaymentProof {
  id: number;
  service_type: 'ride' | 'delivery' | 'order';
  service_id: number;
  user_id: number;
  user?: { id: number; name: string; email: string; phone: string };
  payment_method: 'gcash' | 'maya';
  reference_number: string;
  amount: number;
  proof_image_url: string;
  status: 'submitted' | 'verified' | 'rejected';
  verified_by_id?: number;
  verified_by_role?: 'rider' | 'admin';
  rejection_reason?: string;
  attempt_number: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Add admin payment proof API methods**

After the `uploadQRCode` method in `admin/src/services/api.ts` (after line 247), add:

```typescript
  // Payment Proofs
  getPaymentProofs: (params?: { status?: string; service_type?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.service_type) query.set('service_type', params.service_type);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    return API.get(`/admin/payment-proofs?${query.toString()}`);
  },
  verifyPaymentProof: (id: number) => API.put(`/admin/payment-proof/${id}/verify`),
  rejectPaymentProof: (id: number, reason: string) => API.put(`/admin/payment-proof/${id}/reject`, { reason }),
```

- [ ] **Step 3: Create PaymentProofsPage**

Create `admin/src/pages/PaymentProofsPage.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { adminService } from '../services/api';
import type { PaymentProof } from '../types';
import { useTheme } from '../context/ThemeContext';
import ConfirmDialog from '../components/ConfirmDialog';
import PageSkeleton from '../components/PageSkeleton';

export default function PaymentProofsPage() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('submitted');
  const [serviceFilter, setServiceFilter] = useState('');
  const [selectedProof, setSelectedProof] = useState<PaymentProof | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadProofs(); }, [page, statusFilter, serviceFilter]);

  const loadProofs = async () => {
    setLoading(true);
    try {
      const res = await adminService.getPaymentProofs({
        status: statusFilter || undefined,
        service_type: serviceFilter || undefined,
        page,
        limit: 20,
      });
      setProofs(res.data?.data || []);
      setTotal(res.data?.total || 0);
    } catch {
      setProofs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (proof: PaymentProof) => {
    setActionLoading(true);
    try {
      await adminService.verifyPaymentProof(proof.id);
      loadProofs();
    } catch {
      alert('Failed to verify payment proof');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedProof || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await adminService.rejectPaymentProof(selectedProof.id, rejectReason.trim());
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedProof(null);
      loadProofs();
    } catch {
      alert('Failed to reject payment proof');
    } finally {
      setActionLoading(false);
    }
  };

  const totalPages = Math.ceil(total / 20);
  const bg = isDark ? 'bg-gray-900' : 'bg-gray-50';
  const cardBg = isDark ? 'bg-gray-800' : 'bg-white';
  const textColor = isDark ? 'text-gray-100' : 'text-gray-900';
  const subText = isDark ? 'text-gray-400' : 'text-gray-500';
  const borderColor = isDark ? 'border-gray-700' : 'border-gray-200';

  if (loading && proofs.length === 0) return <PageSkeleton />;

  return (
    <div className={`${bg} min-h-screen`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <h1 className={`text-2xl font-bold ${textColor}`}>Payment Proofs</h1>
        <div className="flex gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg border text-sm ${cardBg} ${borderColor} ${textColor}`}
          >
            <option value="">All Statuses</option>
            <option value="submitted">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            value={serviceFilter}
            onChange={e => { setServiceFilter(e.target.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg border text-sm ${cardBg} ${borderColor} ${textColor}`}
          >
            <option value="">All Services</option>
            <option value="ride">Rides</option>
            <option value="delivery">Deliveries</option>
            <option value="order">Orders</option>
          </select>
        </div>
      </div>

      {proofs.length === 0 ? (
        <div className={`${cardBg} rounded-xl p-12 text-center ${subText}`}>
          No payment proofs found.
        </div>
      ) : (
        <div className={`${cardBg} rounded-xl border ${borderColor} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={`${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} border-b ${borderColor}`}>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>User</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Service</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Method</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Amount</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Reference</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Status</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Proof</th>
                <th className={`px-4 py-3 text-left font-semibold ${subText}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {proofs.map(proof => (
                <tr key={proof.id} className={`border-b ${borderColor} hover:${isDark ? 'bg-gray-700/30' : 'bg-gray-50'}`}>
                  <td className={`px-4 py-3 ${textColor}`}>{proof.user?.name || `User #${proof.user_id}`}</td>
                  <td className={`px-4 py-3 ${textColor} capitalize`}>{proof.service_type} #{proof.service_id}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${proof.payment_method === 'gcash' ? 'bg-blue-500' : 'bg-green-500'}`}>
                      {proof.payment_method === 'gcash' ? 'GCash' : 'Maya'}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${textColor}`}>₱{proof.amount?.toFixed(2)}</td>
                  <td className={`px-4 py-3 font-mono text-xs ${subText}`}>{proof.reference_number}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      proof.status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                      proof.status === 'verified' ? 'bg-green-100 text-green-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {proof.status === 'submitted' ? 'Pending' : proof.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setSelectedProof(proof); setShowImageModal(true); }}
                      className="text-blue-500 hover:text-blue-700 text-xs font-semibold"
                    >
                      View
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {proof.status === 'submitted' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleVerify(proof)}
                          disabled={actionLoading}
                          className="px-3 py-1 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 disabled:opacity-50"
                        >
                          Verify
                        </button>
                        <button
                          onClick={() => { setSelectedProof(proof); setShowRejectModal(true); }}
                          disabled={actionLoading}
                          className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className={`px-3 py-1 rounded border ${borderColor} ${cardBg} ${textColor} disabled:opacity-40`}
          >
            Prev
          </button>
          <span className={`px-3 py-1 ${subText}`}>Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className={`px-3 py-1 rounded border ${borderColor} ${cardBg} ${textColor} disabled:opacity-40`}
          >
            Next
          </button>
        </div>
      )}

      {/* Image Modal */}
      {showImageModal && selectedProof && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowImageModal(false)}>
          <div className={`${cardBg} rounded-xl p-4 max-w-lg w-full max-h-[90vh] overflow-auto`} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className={`font-bold ${textColor}`}>Payment Proof</h3>
              <button onClick={() => setShowImageModal(false)} className={subText}>✕</button>
            </div>
            <img src={selectedProof.proof_image_url} alt="Payment proof" className="w-full rounded-lg" />
            <div className={`mt-3 text-sm ${subText}`}>
              <p>Reference: <span className="font-mono font-bold">{selectedProof.reference_number}</span></p>
              <p>Amount: <span className="font-bold">₱{selectedProof.amount?.toFixed(2)}</span></p>
              <p>Attempt: {selectedProof.attempt_number}</p>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedProof && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className={`${cardBg} rounded-xl p-6 max-w-md w-full`}>
            <h3 className={`font-bold text-lg mb-3 ${textColor}`}>Reject Payment Proof</h3>
            <p className={`text-sm mb-3 ${subText}`}>
              {selectedProof.user?.name} — ₱{selectedProof.amount?.toFixed(2)} via {selectedProof.payment_method}
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..."
              className={`w-full p-3 rounded-lg border ${borderColor} ${cardBg} ${textColor} text-sm`}
              rows={3}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className={`flex-1 py-2 rounded-lg border ${borderColor} ${textColor} font-semibold`}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading || !rejectReason.trim()}
                className="flex-1 py-2 rounded-lg bg-red-500 text-white font-bold disabled:opacity-50"
              >
                {actionLoading ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Register PaymentProofsPage in App.tsx**

Add import in `admin/src/App.tsx` imports section:

```typescript
import PaymentProofsPage from './pages/PaymentProofsPage';
```

Add nav item in the Settings group (after the payment-configs item at line 61):

```typescript
      { path: '/payment-proofs', label: 'Payment Proofs', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
```

Add route (after line 309):

```typescript
            <Route path="/payment-proofs" element={<PaymentProofsPage />} />
```

- [ ] **Step 5: Commit**

```bash
git add admin/src/pages/PaymentProofsPage.tsx admin/src/services/api.ts admin/src/types/index.ts admin/src/App.tsx
git commit -m "feat: add PaymentProofsPage with verify/reject workflow in admin panel"
```

---

### Task 10: Fix Admin PaymentConfigsPage Bugs

**Files:**
- Modify: `admin/src/pages/PaymentConfigsPage.tsx`

- [ ] **Step 1: Add deletion protection**

Find the delete handler (the function that calls `adminService.deletePaymentConfig`). Before the API call, add a check:

```typescript
    // Prevent deleting active configs
    const configToDelete = configs.find(c => c.id === deleteId);
    if (configToDelete?.is_active) {
      alert('Cannot delete an active payment config. Deactivate it first.');
      return;
    }
```

- [ ] **Step 2: Add account number validation in the save handler**

In the validation logic (around lines 81-85), enhance it:

```typescript
    if (!form.account_name.trim() || form.account_name.trim().length < 2) {
      showToast?.('Account name must be at least 2 characters', 'error');
      return;
    }
    if (!form.account_number.trim()) {
      showToast?.('Account number is required', 'error');
      return;
    }
    if (form.is_active && !form.qr_code_url) {
      showToast?.('QR code is required for active payment configs', 'error');
      return;
    }
```

- [ ] **Step 3: Add QR upload error handling improvement**

In the QR upload handler (around lines 103-131), improve error display. Replace the generic catch:

```typescript
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to upload QR code. Please try again.';
      showToast?.(msg, 'error');
    }
```

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/PaymentConfigsPage.tsx
git commit -m "fix: admin payment config deletion protection, validation, and error handling"
```

---

### Task 11: Final Build Verification

- [ ] **Step 1: Build backend**

Run: `cd /Users/dev3/omji/backend && go build ./...`
Expected: Clean build

- [ ] **Step 2: Check mobile for TypeScript errors**

Run: `cd /Users/dev3/omji/mobile && npx tsc --noEmit`
Expected: No errors (or only pre-existing ones)

- [ ] **Step 3: Check admin for build errors**

Run: `cd /Users/dev3/omji/admin && npm run build`
Expected: Clean build

- [ ] **Step 4: Create final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve build errors from payment verification implementation"
```
