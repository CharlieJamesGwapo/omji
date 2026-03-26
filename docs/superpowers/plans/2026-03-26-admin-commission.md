# Admin Commission System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform commission system where admin sets a global percentage taken from driver earnings, auto-deducted for wallet payments and tracked for cash.

**Architecture:** Two new models (CommissionConfig, CommissionRecord) in the existing Go/Gin backend. Commission logic hooks into 6 existing completion code paths (REST ride, REST delivery, WS ride, WS delivery, admin order status, admin delivery/ride status). A new React page in the admin web panel for config + history.

**Tech Stack:** Go/Gin, GORM, PostgreSQL, React 18, TypeScript, Tailwind CSS, Axios

---

### Task 1: Add CommissionConfig and CommissionRecord Models

**Files:**
- Modify: `backend/pkg/models/models.go`

- [ ] **Step 1: Add CommissionConfig model after PaymentConfig**

Add this after the `PaymentConfig` struct (line ~317):

```go
// CommissionConfig model for admin-managed platform commission
type CommissionConfig struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	Percentage float64   `gorm:"default:10" json:"percentage"` // e.g. 15.0 = 15%
	IsActive   bool      `gorm:"default:true" json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
```

- [ ] **Step 2: Add CommissionRecord model after CommissionConfig**

```go
// CommissionRecord tracks commission per completed service
type CommissionRecord struct {
	ID                   uint      `gorm:"primaryKey" json:"id"`
	ServiceType          string    `gorm:"index:idx_commission_service_type" json:"service_type"` // ride, delivery, order
	ServiceID            uint      `json:"service_id"`
	DriverID             uint      `gorm:"index:idx_commission_driver_id" json:"driver_id"`
	Driver               Driver    `gorm:"foreignKey:DriverID" json:"driver,omitempty"`
	TotalFare            float64   `json:"total_fare"`
	CommissionPercentage float64   `json:"commission_percentage"`
	CommissionAmount     float64   `json:"commission_amount"`
	PaymentMethod        string    `json:"payment_method"`
	Status               string    `gorm:"index:idx_commission_status;default:'pending_collection'" json:"status"` // deducted, pending_collection
	CreatedAt            time.Time `json:"created_at"`
}
```

- [ ] **Step 3: Add both models to AutoMigrate**

In the `AutoMigrate` function, add `&CommissionConfig{}` and `&CommissionRecord{}` to the list:

```go
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&User{},
		&SavedAddress{},
		&PaymentMethod{},
		&Driver{},
		&Ride{},
		&RideShare{},
		&Delivery{},
		&Store{},
		&MenuItem{},
		&Order{},
		&Promo{},
		&ChatMessage{},
		&Notification{},
		&Wallet{},
		&WalletTransaction{},
		&Favorite{},
		&RateConfig{},
		&PaymentConfig{},
		&CommissionConfig{},
		&CommissionRecord{},
	)
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/pkg/models/models.go
git commit -m "feat: add CommissionConfig and CommissionRecord models"
```

---

### Task 2: Seed CommissionConfig on Startup

**Files:**
- Modify: `backend/pkg/db/database.go`

- [ ] **Step 1: Add CommissionConfig seed after existing seeds**

After the sample promos seeding block (near end of `SeedDB` function), add:

```go
	// Seed default commission config if none exists
	var commissionCount int64
	db.Model(&models.CommissionConfig{}).Count(&commissionCount)
	if commissionCount == 0 {
		defaultCommission := models.CommissionConfig{
			Percentage: 10.0,
			IsActive:   true,
		}
		if err := db.Create(&defaultCommission).Error; err != nil {
			slog.Error("Failed to create default commission config", "error", err)
		} else {
			slog.Info("Default commission config created", "percentage", 10.0)
		}
	}
```

- [ ] **Step 2: Commit**

```bash
git add backend/pkg/db/database.go
git commit -m "feat: seed default commission config (10%) on startup"
```

---

### Task 3: Add Commission Admin Handlers (Backend)

**Files:**
- Modify: `backend/pkg/handlers/handlers.go`

- [ ] **Step 1: Add AdminGetCommissionConfig handler**

Add after the existing PaymentConfig handlers:

```go
// AdminGetCommissionConfig returns the current commission config
func AdminGetCommissionConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var config models.CommissionConfig
		if err := db.First(&config).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Commission config not found"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": config, "timestamp": time.Now()})
	}
}
```

- [ ] **Step 2: Add AdminUpdateCommissionConfig handler**

```go
// AdminUpdateCommissionConfig updates the commission percentage
func AdminUpdateCommissionConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Percentage float64 `json:"percentage" binding:"required,min=0,max=100"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Percentage must be between 0 and 100"})
			return
		}
		var config models.CommissionConfig
		if err := db.First(&config).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Commission config not found"})
			return
		}
		config.Percentage = input.Percentage
		if err := db.Save(&config).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to update commission config"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": config, "timestamp": time.Now()})
	}
}
```

- [ ] **Step 3: Add AdminGetCommissionRecords handler (paginated, filterable)**

```go
// AdminGetCommissionRecords returns paginated commission records
func AdminGetCommissionRecords(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 20
		}
		offset := (page - 1) * limit

		query := db.Model(&models.CommissionRecord{})

		if serviceType := c.Query("service_type"); serviceType != "" {
			query = query.Where("service_type = ?", serviceType)
		}
		if status := c.Query("status"); status != "" {
			query = query.Where("status = ?", status)
		}
		if paymentMethod := c.Query("payment_method"); paymentMethod != "" {
			query = query.Where("payment_method = ?", paymentMethod)
		}
		if dateFrom := c.Query("date_from"); dateFrom != "" {
			if t, err := time.Parse(time.RFC3339, dateFrom); err == nil {
				query = query.Where("created_at >= ?", t)
			}
		}
		if dateTo := c.Query("date_to"); dateTo != "" {
			if t, err := time.Parse(time.RFC3339, dateTo); err == nil {
				query = query.Where("created_at <= ?", t)
			}
		}

		var total int64
		query.Count(&total)

		var records []models.CommissionRecord
		if err := query.Preload("Driver.User").Order("created_at DESC").Offset(offset).Limit(limit).Find(&records).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to fetch commission records"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"records": records,
				"total":   total,
				"page":    page,
				"limit":   limit,
			},
			"timestamp": time.Now(),
		})
	}
}
```

- [ ] **Step 4: Add AdminGetCommissionSummary handler**

```go
// AdminGetCommissionSummary returns aggregate commission stats
func AdminGetCommissionSummary(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var summary struct {
			TotalCommission        float64
			TotalDeducted          float64
			TotalPendingCollection float64
			RideCommission         float64
			DeliveryCommission     float64
			OrderCommission        float64
			CurrentMonthCommission float64
		}

		db.Model(&models.CommissionRecord{}).Select(
			"COALESCE(SUM(commission_amount), 0) as total_commission, "+
				"COALESCE(SUM(CASE WHEN status = 'deducted' THEN commission_amount ELSE 0 END), 0) as total_deducted, "+
				"COALESCE(SUM(CASE WHEN status = 'pending_collection' THEN commission_amount ELSE 0 END), 0) as total_pending_collection, "+
				"COALESCE(SUM(CASE WHEN service_type = 'ride' THEN commission_amount ELSE 0 END), 0) as ride_commission, "+
				"COALESCE(SUM(CASE WHEN service_type = 'delivery' THEN commission_amount ELSE 0 END), 0) as delivery_commission, "+
				"COALESCE(SUM(CASE WHEN service_type = 'order' THEN commission_amount ELSE 0 END), 0) as order_commission").
			Row().Scan(
			&summary.TotalCommission,
			&summary.TotalDeducted,
			&summary.TotalPendingCollection,
			&summary.RideCommission,
			&summary.DeliveryCommission,
			&summary.OrderCommission,
		)

		// Current month commission
		now := time.Now()
		monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		db.Model(&models.CommissionRecord{}).
			Where("created_at >= ?", monthStart).
			Select("COALESCE(SUM(commission_amount), 0)").
			Row().Scan(&summary.CurrentMonthCommission)

		// Get current percentage
		var config models.CommissionConfig
		var currentPercentage float64
		if db.First(&config).Error == nil {
			currentPercentage = config.Percentage
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"total_commission":         summary.TotalCommission,
				"total_deducted":           summary.TotalDeducted,
				"total_pending_collection": summary.TotalPendingCollection,
				"ride_commission":          summary.RideCommission,
				"delivery_commission":      summary.DeliveryCommission,
				"order_commission":         summary.OrderCommission,
				"current_month_commission": summary.CurrentMonthCommission,
				"current_percentage":       currentPercentage,
			},
			"timestamp": time.Now(),
		})
	}
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "feat: add commission config and records admin handlers"
```

---

### Task 4: Register Commission Routes

**Files:**
- Modify: `backend/cmd/main.go`

- [ ] **Step 1: Add commission routes to admin group**

After the payment config routes (line ~266), add:

```go
		// Commission management
		admin.GET("/commission/config", handlers.AdminGetCommissionConfig(database))
		admin.PUT("/commission/config", handlers.AdminUpdateCommissionConfig(database))
		admin.GET("/commission/records", handlers.AdminGetCommissionRecords(database))
		admin.GET("/commission/summary", handlers.AdminGetCommissionSummary(database))
```

- [ ] **Step 2: Commit**

```bash
git add backend/cmd/main.go
git commit -m "feat: register commission admin routes"
```

---

### Task 5: Add Commission Logic to Completion Handlers

**Files:**
- Modify: `backend/pkg/handlers/handlers.go`

This is the most critical task. Commission must be calculated and recorded in 6 places where services complete:

1. REST `UpdateRideStatus` — ride completed (line ~2047)
2. REST `UpdateRideStatus` — delivery completed (line ~2154)
3. WebSocket ride completed (line ~3653)
4. WebSocket delivery completed (line ~3721)
5. `AdminUpdateOrderStatus` — order delivered (line ~3250)
6. `AdminUpdateDeliveryStatus` — delivery completed via admin (line ~3209)

- [ ] **Step 1: Add a helper function for commission calculation**

Add this helper near the top of handlers.go (after imports):

```go
// createCommissionRecord calculates and records commission for a completed service.
// For wallet payments, it deducts commission from driver earnings.
// For cash payments, it records as pending_collection.
// Must be called within an existing transaction (tx).
func createCommissionRecord(tx *gorm.DB, serviceType string, serviceID uint, driverID uint, totalFare float64, paymentMethod string) {
	var config models.CommissionConfig
	if err := tx.First(&config).Error; err != nil || !config.IsActive {
		return // No config or inactive — skip commission
	}
	if config.Percentage <= 0 {
		return
	}

	commissionAmount := math.Round(totalFare*config.Percentage) / 100 // totalFare * percentage / 100, rounded to 2 decimals

	status := "pending_collection"
	if paymentMethod == "wallet" {
		status = "deducted"
		// Deduct commission from driver's total_earnings
		if err := tx.Model(&models.Driver{}).Where("id = ?", driverID).
			Update("total_earnings", gorm.Expr("total_earnings - ?", commissionAmount)).Error; err != nil {
			log.Printf("Failed to deduct commission from driver %d earnings: %v", driverID, err)
		}
	}

	record := models.CommissionRecord{
		ServiceType:          serviceType,
		ServiceID:            serviceID,
		DriverID:             driverID,
		TotalFare:            totalFare,
		CommissionPercentage: config.Percentage,
		CommissionAmount:     commissionAmount,
		PaymentMethod:        paymentMethod,
		Status:               status,
	}
	if err := tx.Create(&record).Error; err != nil {
		log.Printf("Failed to create commission record for %s %d: %v", serviceType, serviceID, err)
	}
}
```

Also add `"math"` to the imports if not already present.

- [ ] **Step 2: Add commission to REST ride completion**

In the `UpdateRideStatus` handler, after the driver stats update block for rides (after line ~2059 where it logs "Failed to update driver stats for ride"), add:

```go
					// Record commission
					fare := ride.FinalFare
					if fare == 0 {
						fare = ride.EstimatedFare
					}
					if ride.DriverID != nil {
						createCommissionRecord(tx, "ride", ride.ID, *ride.DriverID, fare, ride.PaymentMethod)
					}
```

- [ ] **Step 3: Add commission to REST delivery completion**

In the `UpdateRideStatus` handler, after the driver stats update block for deliveries (after line ~2162 where it logs "Failed to update driver stats for delivery"), add:

```go
					// Record commission
					if delivery.DriverID != nil {
						createCommissionRecord(tx, "delivery", delivery.ID, *delivery.DriverID, delivery.DeliveryFee, delivery.PaymentMethod)
					}
```

- [ ] **Step 4: Add commission to WebSocket ride completion**

In `WebSocketTrackingHandler`, after the driver stats update for ride completion (after line ~3660), add:

```go
								createCommissionRecord(tx, "ride", ride.ID, *ride.DriverID, ride.EstimatedFare, ride.PaymentMethod)
```

- [ ] **Step 5: Add commission to WebSocket delivery completion**

In `WebSocketTrackingHandler`, after the driver stats update for delivery completion (after line ~3725), add:

```go
									createCommissionRecord(tx, "delivery", delivery.ID, *delivery.DriverID, delivery.DeliveryFee, delivery.PaymentMethod)
```

- [ ] **Step 6: Add commission to AdminUpdateOrderStatus for delivered orders**

In `AdminUpdateOrderStatus`, the order completion doesn't currently track driver earnings (orders go to stores, not drivers). However, orders do have a delivery fee component. Since orders don't have a DriverID, we'll skip commission for orders for now — orders are store-based, not driver-based.

Actually, looking at the Order model, there is no DriverID field. Orders are store orders. The commission on orders should be on the store's `TotalAmount`. But stores aren't drivers.

**Decision:** Skip order commission for now since orders don't have drivers. The commission system applies to rides and deliveries only (driver services). The admin summary will show `order_commission` as 0. This can be extended later if store commission is needed.

- [ ] **Step 7: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "feat: add commission calculation on ride and delivery completion"
```

---

### Task 6: Add Commission API Methods to Admin Frontend

**Files:**
- Modify: `admin/src/services/api.ts`

- [ ] **Step 1: Add commission methods to adminService**

After the payment configs section (line ~227), add these methods inside the `adminService` object:

```typescript
  // Commission
  getCommissionConfig: () => cachedGet('/admin/commission/config'),
  updateCommissionConfig: (data: { percentage: number }) => API.put('/admin/commission/config', data),
  getCommissionRecords: (params?: {
    page?: number;
    limit?: number;
    service_type?: string;
    status?: string;
    payment_method?: string;
    date_from?: string;
    date_to?: string;
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== 'all') {
          query.set(key, String(value));
        }
      });
    }
    const qs = query.toString();
    return cachedGet(`/admin/commission/records${qs ? `?${qs}` : ''}`);
  },
  getCommissionSummary: () => cachedGet('/admin/commission/summary'),
```

- [ ] **Step 2: Commit**

```bash
git add admin/src/services/api.ts
git commit -m "feat: add commission API methods to admin service"
```

---

### Task 7: Create CommissionPage Component

**Files:**
- Create: `admin/src/pages/CommissionPage.tsx`

- [ ] **Step 1: Create the full CommissionPage**

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../services/api';
import toast from 'react-hot-toast';

interface CommissionConfig {
  id: number;
  percentage: number;
  is_active: boolean;
  updated_at: string;
}

interface CommissionRecord {
  id: number;
  service_type: string;
  service_id: number;
  driver_id: number;
  driver?: { user?: { name?: string } };
  total_fare: number;
  commission_percentage: number;
  commission_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

interface CommissionSummary {
  total_commission: number;
  total_deducted: number;
  total_pending_collection: number;
  ride_commission: number;
  delivery_commission: number;
  order_commission: number;
  current_month_commission: number;
  current_percentage: number;
}

const CommissionPage: React.FC = () => {
  const [config, setConfig] = useState<CommissionConfig | null>(null);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPercentage, setEditPercentage] = useState('');

  // Filters
  const [filterServiceType, setFilterServiceType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [configRes, summaryRes, recordsRes] = await Promise.all([
        adminService.getCommissionConfig(),
        adminService.getCommissionSummary(),
        adminService.getCommissionRecords({
          page,
          limit,
          service_type: filterServiceType,
          status: filterStatus,
          date_from: filterDateFrom ? new Date(filterDateFrom).toISOString() : '',
          date_to: filterDateTo ? new Date(filterDateTo + 'T23:59:59').toISOString() : '',
        }),
      ]);
      setConfig(configRes.data?.data || null);
      setSummary(summaryRes.data?.data || null);
      const recordsData = recordsRes.data?.data;
      setRecords(recordsData?.records || []);
      setTotal(recordsData?.total || 0);
    } catch {
      toast.error('Failed to load commission data');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filterServiceType, filterStatus, filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSavePercentage = async () => {
    const pct = parseFloat(editPercentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast.error('Percentage must be between 0 and 100');
      return;
    }
    try {
      setSaving(true);
      await adminService.updateCommissionConfig({ percentage: pct });
      toast.success(`Commission updated to ${pct}%`);
      setShowEditModal(false);
      fetchData();
    } catch {
      toast.error('Failed to update commission');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (n: number) => `₱${(n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatDate = (s: string) => new Date(s).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const totalPages = Math.ceil(total / limit);

  const serviceLabel = (t: string) => {
    const map: Record<string, string> = { ride: 'Ride', delivery: 'Delivery', order: 'Order' };
    return map[t] || t;
  };

  if (loading && !config) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-32 bg-gray-200 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
        </div>
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Commission</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage platform commission rate and view earnings</p>
      </div>

      {/* Commission Rate Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Current Commission Rate</p>
            <p className="text-4xl font-bold text-emerald-600 mt-1">{config?.percentage ?? 0}%</p>
            {config?.updated_at && (
              <p className="text-xs text-gray-400 mt-1">Last updated: {formatDate(config.updated_at)}</p>
            )}
          </div>
          <button
            onClick={() => { setEditPercentage(String(config?.percentage ?? 0)); setShowEditModal(true); }}
            className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 transition-colors"
          >
            Edit Rate
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Commission</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(summary.total_commission)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Auto-Deducted</p>
            <p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(summary.total_deducted)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending Collection</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{formatCurrency(summary.total_pending_collection)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">This Month</p>
            <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(summary.current_month_commission)}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3">
          <select
            value={filterServiceType}
            onChange={(e) => { setFilterServiceType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="all">All Services</option>
            <option value="ride">Rides</option>
            <option value="delivery">Deliveries</option>
            <option value="order">Orders</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
          >
            <option value="all">All Status</option>
            <option value="deducted">Deducted</option>
            <option value="pending_collection">Pending Collection</option>
          </select>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="From"
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="To"
          />
          {(filterServiceType !== 'all' || filterStatus !== 'all' || filterDateFrom || filterDateTo) && (
            <button
              onClick={() => { setFilterServiceType('all'); setFilterStatus('all'); setFilterDateFrom(''); setFilterDateTo(''); setPage(1); }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Service</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Driver</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total Fare</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Rate</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Commission</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Payment</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    No commission records found
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        r.service_type === 'ride' ? 'bg-blue-50 text-blue-700' :
                        r.service_type === 'delivery' ? 'bg-purple-50 text-purple-700' :
                        'bg-orange-50 text-orange-700'
                      }`}>
                        {serviceLabel(r.service_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{r.driver?.user?.name || `Driver #${r.driver_id}`}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(r.total_fare)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{r.commission_percentage}%</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(r.commission_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs text-gray-500 capitalize">{r.payment_method}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'deducted'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {r.status === 'deducted' ? 'Deducted' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-100 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Edit Commission Rate</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={editPercentage}
                onChange={(e) => setEditPercentage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">Enter a value between 0 and 100</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePercentage}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionPage;
```

- [ ] **Step 2: Commit**

```bash
git add admin/src/pages/CommissionPage.tsx
git commit -m "feat: add CommissionPage component for admin panel"
```

---

### Task 8: Register CommissionPage Route and Sidebar Entry

**Files:**
- Modify: `admin/src/App.tsx`

- [ ] **Step 1: Add import for CommissionPage**

After the PaymentConfigsPage import (line 16), add:

```typescript
import CommissionPage from './pages/CommissionPage';
```

- [ ] **Step 2: Add Commission to sidebar nav in Settings group**

In the `navGroups` array, in the Settings group (line ~44), add a Commission entry between Rates and Payments:

```typescript
  {
    label: 'Settings',
    items: [
      { path: '/rates', label: 'Rates', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
      { path: '/commission', label: 'Commission', icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z' },
      { path: '/payment-configs', label: 'Payments', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
      { path: '/promos', label: 'Promos', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
      { path: '/notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    ],
  },
```

- [ ] **Step 3: Add Route for CommissionPage**

In the Routes section (line ~225), add after the rates route:

```tsx
<Route path="/commission" element={<CommissionPage />} />
```

- [ ] **Step 4: Commit**

```bash
git add admin/src/App.tsx
git commit -m "feat: add Commission page route and sidebar entry"
```

---

### Task 9: Verify and Test

- [ ] **Step 1: Build the admin frontend to check for TypeScript errors**

```bash
cd /Users/dev3/omji/admin && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Build the Go backend to check for compilation errors**

```bash
cd /Users/dev3/omji/backend && go build ./...
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Fix any build errors found**

Address any compilation or type errors.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve build errors in commission feature"
```
