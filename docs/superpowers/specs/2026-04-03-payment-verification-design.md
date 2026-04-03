# Payment Verification System — Design Spec

**Date:** 2026-04-03
**Status:** Approved
**Approach:** Manual transfer with proof-of-payment verification (Option A)

## Problem

GCash/Maya payments have zero verification. Users tap "I've Completed Payment" with no proof. This creates a trust gap — riders/stores can't confirm payment was made, and the platform has no record.

## Solution

Add a proof-of-payment upload flow where users submit a screenshot + reference number after transferring via GCash/Maya. Riders verify on-site; admins have override authority.

---

## Payment Flow

```
User selects GCash/Maya as payment method
    ↓
PaymentScreen shows QR code + account details
    ↓
User transfers money in GCash/Maya app
    ↓
User returns to OMJI app
    ↓
User uploads screenshot proof + enters reference number
    ↓
PaymentProof created with status: "submitted"
Ride/Delivery/Order.PaymentStatus → "submitted"
    ↓
Rider sees proof in their app → taps "Verify Payment"
  OR Admin verifies from dashboard
    ↓
Status → "verified" → service proceeds to completion
    ↓
If rejected: user sees reason, can retry (max 2 attempts)
After 2 rejections: forced to switch to cash
```

### Payment Statuses
- `pending` — waiting for user to pay
- `submitted` — user uploaded proof
- `verified` — rider/admin confirmed payment
- `rejected` — proof invalid, user must retry or switch to cash

### Rules
- Rider CAN verify (fastest — they're on-site)
- Admin CAN verify or reject (override authority)
- Service completion blocked until payment verified (for GCash/Maya)
- Cash and wallet payments skip verification (existing flow unchanged)
- Max 2 rejection attempts → forced to cash fallback (with user notification)

---

## Data Model

### New Model: PaymentProof

```go
type PaymentProof struct {
    ID              uint      `json:"id" gorm:"primaryKey"`
    ServiceType     string    `json:"service_type"`     // "ride", "delivery", "order"
    ServiceID       uint      `json:"service_id"`
    UserID          uint      `json:"user_id"`
    PaymentMethod   string    `json:"payment_method"`   // "gcash", "maya"
    ReferenceNumber string    `json:"reference_number"`
    Amount          float64   `json:"amount"`
    ProofImageURL   string    `json:"proof_image_url"`  // base64 data URL
    Status          string    `json:"status" gorm:"default:submitted"` // submitted, verified, rejected
    VerifiedByID    *uint     `json:"verified_by_id"`
    VerifiedByRole  string    `json:"verified_by_role"` // "rider", "admin"
    RejectionReason string    `json:"rejection_reason"`
    AttemptNumber   int       `json:"attempt_number" gorm:"default:1"`
    CreatedAt       time.Time `json:"created_at"`
    UpdatedAt       time.Time `json:"updated_at"`
}
```

### Changes to Existing Models

Add `PaymentStatus` field to:
- `Ride` — `PaymentStatus string json:"payment_status" gorm:"default:pending"`
- `Delivery` — `PaymentStatus string json:"payment_status" gorm:"default:pending"`
- `Order` — `PaymentStatus string json:"payment_status" gorm:"default:pending"`

### Database Indexes
- `payment_proof(service_type, service_id)` — lookup by service
- `payment_proof(user_id, status)` — user's pending proofs
- `payment_proof(status)` — admin queue of pending verifications

---

## API Endpoints

### Mobile (User)

**POST /api/v1/payment-proof/upload**
- Multipart form: `proof_image` (max 5MB, PNG/JPG/WEBP)
- Returns: `{ success: true, data: { url: "base64..." } }`

**POST /api/v1/payment-proof/submit**
- Body: `{ service_type, service_id, payment_method, reference_number, amount, proof_image_url }`
- Creates PaymentProof with status "submitted"
- Updates service PaymentStatus to "submitted"
- Returns: `{ success: true, data: PaymentProof }`

**GET /api/v1/payment-proof/:serviceType/:serviceId**
- Returns latest PaymentProof for this service
- Used to poll verification status

### Rider

**GET /api/v1/rider/payment-proof/:serviceType/:serviceId**
- Returns PaymentProof with image for verification
- Only accessible if rider is assigned to this service

**PUT /api/v1/rider/payment-proof/:id/verify**
- Sets status to "verified", records verifier
- Updates service PaymentStatus to "verified"
- Returns: `{ success: true }`

**PUT /api/v1/rider/payment-proof/:id/reject**
- Body: `{ reason: "..." }`
- Sets status to "rejected", records reason
- Updates service PaymentStatus to "rejected"
- If attempt_number >= 2, also sets a flag for cash fallback
- Returns: `{ success: true }`

### Admin

**GET /api/v1/admin/payment-proofs**
- Query params: `?status=submitted&service_type=ride&page=1&limit=20`
- Returns paginated list of payment proofs
- Default: shows "submitted" (pending verification)

**PUT /api/v1/admin/payment-proof/:id/verify**
- Same as rider verify but with role "admin"

**PUT /api/v1/admin/payment-proof/:id/reject**
- Same as rider reject but with role "admin"

---

## Screen Changes

### Mobile — PaymentScreen (improved)

Current screen (865 lines) will be modified:

1. **QR Display Section** (existing, improved)
   - Fix 15-second timeout race condition: cancel image load on unmount
   - Better loading skeleton while QR loads
   - Larger QR code display area

2. **NEW: Proof Upload Section** (appears after user taps "I've Transferred")
   - Camera button → opens camera
   - Gallery button → opens image picker
   - Image preview with crop/retake option
   - Reference number text input (required)
   - Amount display (pre-filled, read-only)
   - "Submit Proof" button

3. **NEW: Verification Status Section** (appears after submission)
   - Status badge: Submitted (yellow) / Verified (green) / Rejected (red)
   - If rejected: shows reason + "Upload New Proof" button
   - If rejected 2x: shows "Switch to Cash" button only
   - Auto-polls every 5 seconds for status updates

4. **Reference Number Fix**
   - Old: `OMJI-${Date.now().toString(36)}` (collision risk)
   - New: `OMJI-${userID}-${Date.now()}-${Math.random().toString(36).substr(2,4)}`

### Rider App — PaymentVerificationCard (new component)

Appears on the rider's active ride/delivery screen when payment method is GCash/Maya:

- Payment proof screenshot (tappable for full-screen view)
- Reference number display
- Amount display
- Payment method badge (GCash/Maya)
- "Verify Payment" button (green)
- "Reject Payment" button (red) → opens reason input modal

### Admin — PaymentConfigsPage (bug fixes)

1. **QR Upload fixes:**
   - Validate image is actually a QR code format (dimension check)
   - Show upload progress indicator
   - Better error messages on failure

2. **Deletion protection:**
   - Confirm dialog before deleting active config
   - Warning: "Users currently paying with {type} will lose access"

3. **Validation:**
   - Account number format validation (11 digits for GCash, 10-12 for Maya)
   - Account name required, min 2 characters
   - QR image required for active configs

### Admin — PaymentProofsPage (new page)

New admin page for managing payment verifications:

- Table columns: Service Type, Service ID, User, Method, Amount, Reference, Status, Date
- Image preview on row click/hover
- Bulk actions: verify selected, reject selected
- Filters: status, service type, payment method, date range
- Pagination (20 per page)

---

## Bug Fixes

### 1. Reference Number Collisions (Mobile PaymentScreen)
- **Problem:** `OMJI-${Date.now().toString(36)}` can collide at millisecond precision
- **Fix:** `OMJI-${userID}-${Date.now()}-${random4chars}`

### 2. QR Image Race Condition (Mobile PaymentScreen)
- **Problem:** 15-second timeout races with image load; stale state after unmount
- **Fix:** Use AbortController, cancel on unmount, clear timeout on success

### 3. Payment Config Deletion Risk (Backend + Admin)
- **Problem:** Active payment config can be deleted, breaking in-progress payments
- **Fix:** Backend returns error if config is active and has recent usage; admin shows confirm dialog

### 4. QR URL Validation (Backend)
- **Problem:** Backend accepts any string as qr_code_url
- **Fix:** Validate starts with `data:image/` (base64) or is valid URL format

### 5. Wallet Fallback Silent Completion (Backend)
- **Problem:** If wallet balance insufficient, silently switches to cash and completes service
- **Fix:** Return error to user, let them choose: top up wallet or switch to cash

### 6. Payment Type Validation (Backend)
- **Problem:** No enum validation on payment method types
- **Fix:** Validate against allowed types: "cash", "gcash", "maya", "wallet"

---

## Files to Modify

### Backend
- `backend/pkg/models/models.go` — Add PaymentProof model, PaymentStatus fields
- `backend/pkg/handlers/handlers.go` — Add 8 new endpoints, fix wallet fallback, add validation
- `backend/cmd/main.go` — Register new routes

### Mobile
- `mobile/src/screens/Main/PaymentScreen.tsx` — Major rework: proof upload, status polling, bug fixes
- `mobile/src/services/api.ts` — Add payment proof API calls
- `mobile/src/types/index.ts` — Add PaymentProof type, PaymentStatus type

### Rider App (mobile)
- `mobile/src/screens/Rider/RiderActiveScreen.tsx` (or equivalent) — Add PaymentVerificationCard
- `mobile/src/components/PaymentVerificationCard.tsx` — New component

### Admin
- `admin/src/pages/PaymentConfigsPage.tsx` — Bug fixes, validation, deletion protection
- `admin/src/pages/PaymentProofsPage.tsx` — New page
- `admin/src/services/api.ts` — Add payment proof admin API calls
- `admin/src/types/index.ts` — Add PaymentProof type
- `admin/src/App.tsx` (or router) — Add route for PaymentProofsPage

---

## Out of Scope
- PayMongo/Xendit integration (future consideration when volume justifies)
- Automatic QR code scanning/OCR
- Push notifications for verification status (can add later)
- Refund flow (manual for now)
