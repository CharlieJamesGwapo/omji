# Comprehensive Bug Fixes - Admin CRUD, User App, Rider App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix critical bugs across all three apps — backend admin CRUD operations, mobile user app, and rider app

**Architecture:** Go/Gin backend with handlers.go as main handler file, React Native mobile app with screens in src/screens/, admin React frontend in admin/

**Tech Stack:** Go/Gin/GORM backend, React Native/Expo mobile, React admin frontend

---

## File Structure

**Backend (modify):**
- `backend/pkg/handlers/handlers.go` — Main handlers: DeclineRideRequest, AdminUpdateUser, AdminUpdateWithdrawal, AdminGetCommissionSummary, AdminCreatePaymentConfig, UpdateRideStatus
- `backend/pkg/handlers/utils.go` — Utility functions (freeDriver, etc.)

**Mobile (modify):**
- `mobile/src/screens/Rider/RiderDashboardScreen.tsx` — WebSocket logging, location fallback
- `mobile/src/screens/Main/RiderWaitingScreen.tsx` — WebSocket error/close handlers
- `mobile/src/screens/Main/TrackingScreen.tsx` — Mounted checks
- `mobile/src/screens/Main/OrdersScreen.tsx` — Mounted checks for state updates
- `mobile/src/screens/Main/PaymentScreen.tsx` — Array validation for configs
- `mobile/src/screens/Rider/RiderEarningsScreen.tsx` — Input sanitization

---

### Task 1: Fix DeclineRideRequest — Driver availability + WebSocket notification

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:2029-2061`

- [ ] **Step 1: Add is_available reset and driver WebSocket notification inside DeclineRideRequest transaction**

In DeclineRideRequest, the transaction sets ride to cancelled but never resets driver.is_available to true, and never sends ride_expired to the driver's WebSocket.

- [ ] **Step 2: Verify backend compiles**

Run: `cd backend && go build ./...`

- [ ] **Step 3: Commit**

---

### Task 2: Fix UpdateRideStatus — Add cancelled status + restore driver availability

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:2199` (validStatuses map)

- [ ] **Step 1: Add "cancelled" to validStatuses and handle driver availability restoration**

The driver-side UpdateRideStatus doesn't allow "cancelled" status, so if a ride needs cancelling after acceptance, the driver is stuck unavailable.

- [ ] **Step 2: Verify backend compiles**

- [ ] **Step 3: Commit**

---

### Task 3: Fix AdminUpdateUser — Email/phone uniqueness validation

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:4926-4930`

- [ ] **Step 1: Add email/phone uniqueness checks before update**

- [ ] **Step 2: Verify backend compiles**

- [ ] **Step 3: Commit**

---

### Task 4: Fix AdminUpdateWithdrawal — Allow rejected->pending retry

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:4025-4031`

- [ ] **Step 1: Add rejected->pending transition to state machine**

- [ ] **Step 2: Verify backend compiles**

- [ ] **Step 3: Commit**

---

### Task 5: Fix AdminGetCommissionSummary — Error handling for Row().Scan()

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:5437-5459`

- [ ] **Step 1: Add error checks for Row().Scan() calls**

- [ ] **Step 2: Verify backend compiles**

- [ ] **Step 3: Commit**

---

### Task 6: Fix AdminCreatePaymentConfig — Case-insensitive type validation

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:5177-5178`

- [ ] **Step 1: Normalize config.Type to lowercase before validation**

- [ ] **Step 2: Verify backend compiles**

- [ ] **Step 3: Commit**

---

### Task 7: Fix RiderDashboardScreen — WebSocket logging + location fallback

**Files:**
- Modify: `mobile/src/screens/Rider/RiderDashboardScreen.tsx:246,251,338-341`

- [ ] **Step 1: Add console.warn to WebSocket catch block and onerror handler**

- [ ] **Step 2: Remove hardcoded Balingasag fallback coordinates, show error instead**

- [ ] **Step 3: Verify mobile compiles**

---

### Task 8: Fix RiderWaitingScreen — WebSocket error/close handlers

**Files:**
- Modify: `mobile/src/screens/Main/RiderWaitingScreen.tsx:118-119`

- [ ] **Step 1: Add logging to ws.onerror and ws.onclose handlers**

- [ ] **Step 2: Verify mobile compiles**

---

### Task 9: Fix OrdersScreen — Add mounted check for state updates

**Files:**
- Modify: `mobile/src/screens/Main/OrdersScreen.tsx:95-104`

- [ ] **Step 1: Add mountedRef and check before all setState calls in fetchOrders**

- [ ] **Step 2: Verify mobile compiles**

---

### Task 10: Fix PaymentScreen — Validate configs is array

**Files:**
- Modify: `mobile/src/screens/Main/PaymentScreen.tsx:125`

- [ ] **Step 1: Use Array.isArray() before calling .find()**

- [ ] **Step 2: Verify mobile compiles**

---

### Task 11: Fix RiderEarningsScreen — Sanitize withdrawal input

**Files:**
- Modify: `mobile/src/screens/Rider/RiderEarningsScreen.tsx:238`

- [ ] **Step 1: Sanitize withdrawAmount to strip non-numeric chars before parseFloat**

- [ ] **Step 2: Verify mobile compiles**

---
