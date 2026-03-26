# Admin Commission System Design

## Overview

Add a platform commission system where the admin sets a global percentage taken from driver earnings on every completed ride, delivery, and order. Commission is auto-deducted for wallet payments and tracked for manual collection on cash payments. A new Commission page in the admin web panel lets the admin configure the rate and view commission history.

## Data Model

### CommissionConfig (single-row global setting)

| Field | Type | Notes |
|-------|------|-------|
| id | uint (PK) | Auto-increment |
| percentage | float64 | e.g., 15.0 = 15%. Range: 0-100 |
| is_active | bool | Default true |
| created_at | timestamp | Auto |
| updated_at | timestamp | Auto |

- Only one row exists, seeded on startup with default 10%.
- Admin can update percentage but cannot create/delete rows.

### CommissionRecord (per-transaction log)

| Field | Type | Notes |
|-------|------|-------|
| id | uint (PK) | Auto-increment |
| service_type | string | "ride", "delivery", "order" |
| service_id | uint | FK to the completed ride/delivery/order |
| driver_id | uint | FK to driver |
| total_fare | float64 | The full fare/fee/amount before commission |
| commission_percentage | float64 | Snapshot of percentage at time of completion |
| commission_amount | float64 | Calculated: total_fare * commission_percentage / 100 |
| payment_method | string | "wallet", "cash", etc. |
| status | string | "deducted" (wallet) or "pending_collection" (cash) |
| created_at | timestamp | Auto |

Index: `idx_commission_record_service_type`, `idx_commission_record_driver_id`, `idx_commission_record_status`.

## Commission Logic (on service completion)

Applied in existing completion handlers for rides, deliveries, and orders:

1. Fetch current `CommissionConfig.percentage`.
2. Calculate `commission_amount = total_fare * percentage / 100`, rounded to 2 decimals.
3. Create a `CommissionRecord` with a snapshot of the percentage.
4. **Wallet payment:** Deduct commission from driver earnings. Driver receives `total_fare - commission_amount`. Record status = "deducted".
5. **Cash payment:** Driver receives full fare in hand. Record status = "pending_collection" for manual admin settlement.

## Backend API

All endpoints require admin authentication.

### Commission Config

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/v1/admin/commission/config` | Get current commission config |
| PUT | `/api/v1/admin/commission/config` | Update commission percentage |

PUT body: `{ "percentage": 15.0 }`
Validation: percentage must be >= 0 and <= 100.

### Commission Records

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/v1/admin/commission/records` | List records (paginated, filterable) |
| GET | `/api/v1/admin/commission/summary` | Aggregate commission stats |

**Records query params:**
- `service_type` — filter by ride/delivery/order
- `status` — filter by deducted/pending_collection
- `payment_method` — filter by wallet/cash
- `date_from`, `date_to` — date range (RFC3339)
- `page` (default 1), `limit` (default 20)

**Summary response:**
```json
{
  "total_commission": 12500.00,
  "total_deducted": 8000.00,
  "total_pending_collection": 4500.00,
  "ride_commission": 6000.00,
  "delivery_commission": 4000.00,
  "order_commission": 2500.00,
  "current_percentage": 15.0
}
```

## Admin Web UI — Commission Page

**Route:** `/commission`
**Sidebar position:** Settings group, between Rates and Payments.

### Layout (top to bottom)

**1. Commission Rate Card**
- Displays current percentage prominently.
- "Edit" button opens modal with number input (0-100, step 0.1).
- Shows last updated timestamp.

**2. Summary Cards Row (4 cards)**
- Total Commission Earned
- Auto-Deducted (wallet — collected)
- Pending Collection (cash — manual settlement needed)
- Current Month Commission

**3. Filters Bar**
- Service type dropdown: All / Rides / Deliveries / Orders
- Status dropdown: All / Deducted / Pending Collection
- Date range: from/to date inputs

**4. Commission Records Table**
- Columns: Date, Service Type, Driver Name, Total Fare, Commission %, Commission Amount, Payment Method, Status
- Status badges: green "Deducted", yellow "Pending Collection"
- Pagination at bottom (default 20 per page)

## Seeding

On startup, if no `CommissionConfig` row exists, seed one with `percentage: 10.0, is_active: true`.

## Files to Modify

### Backend (Go)
- `backend/pkg/models/models.go` — Add CommissionConfig and CommissionRecord models
- `backend/cmd/main.go` — Add commission routes, seed CommissionConfig
- `backend/pkg/handlers/handlers.go` — Add commission handlers, modify completion handlers for rides/deliveries/orders

### Admin Web (React)
- `admin/src/pages/CommissionPage.tsx` — New page
- `admin/src/services/api.ts` — Add commission API methods
- `admin/src/App.tsx` — Add route and sidebar entry
- `admin/src/types/index.ts` — Add TypeScript interfaces (if file exists)
