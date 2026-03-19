# Rider Selection & Request System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users see nearby riders, select one, and send a direct ride request with 30-second accept/decline timer — fully real-time via WebSocket.

**Architecture:** Backend adds a `DriverTracker` (like existing `RideTracker`) to manage driver WebSocket connections. CreateRide gains optional `driver_id` field for targeted requests with `requested` status. A 30s goroutine auto-expires unanswered requests. Mobile adds RiderSelectionScreen, RiderWaitingScreen, and RiderRequestModal.

**Tech Stack:** Go/Gin + GORM + gorilla/websocket (backend), React Native + TypeScript (mobile), existing WebSocket infra extended.

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `mobile/src/screens/Main/RiderSelectionScreen.tsx` | List nearby riders, let user pick one and create ride |
| `mobile/src/screens/Main/RiderWaitingScreen.tsx` | 30s countdown while waiting for rider response |
| `mobile/src/components/RiderRequestModal.tsx` | Driver-side popup to accept/decline incoming request |

### Modified Files
| File | Changes |
|------|---------|
| `backend/pkg/handlers/handlers.go` | Add DriverTracker, modify CreateRide, add DeclineRideRequest, add 30s expiry goroutine, modify AcceptRequest to broadcast via WS |
| `backend/cmd/main.go` | Add `/driver/requests/:id/decline-ride` route |
| `mobile/src/services/api.ts` | Add `declineRideRequest` method |
| `mobile/src/navigation/MainNavigator.tsx` | Register RiderSelectionScreen and RiderWaitingScreen |
| `mobile/src/screens/Main/PasundoScreen.tsx` | Change "Book Now" to navigate to RiderSelectionScreen |
| `mobile/src/screens/Rider/RiderDashboardScreen.tsx` | Add WebSocket connection for ride_request events + RiderRequestModal |

---

### Task 1: Backend — Add DriverTracker for WebSocket Push

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:3271-3313` (add DriverTracker after RideTracker)
- Modify: `backend/pkg/handlers/handlers.go:3492-3530` (WebSocketDriverHandler — register connection)

- [ ] **Step 1: Add DriverTracker struct and global instance**

Add after line 3313 in `handlers.go` (after the RideTracker code):

```go
// DriverTracker manages WebSocket connections per driver for push notifications
type DriverTracker struct {
	mu    sync.RWMutex
	conns map[string]*websocket.Conn // driverID -> conn
}

var driverTracker = &DriverTracker{conns: make(map[string]*websocket.Conn)}

func (dt *DriverTracker) Set(driverID string, conn *websocket.Conn) {
	dt.mu.Lock()
	defer dt.mu.Unlock()
	// Close existing connection if any
	if old, ok := dt.conns[driverID]; ok {
		old.Close()
	}
	dt.conns[driverID] = conn
}

func (dt *DriverTracker) Remove(driverID string) {
	dt.mu.Lock()
	defer dt.mu.Unlock()
	delete(dt.conns, driverID)
}

func (dt *DriverTracker) Send(driverID string, msg interface{}) error {
	dt.mu.RLock()
	defer dt.mu.RUnlock()
	conn, ok := dt.conns[driverID]
	if !ok {
		return fmt.Errorf("driver %s not connected", driverID)
	}
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, data)
}
```

- [ ] **Step 2: Register driver connection in WebSocketDriverHandler**

Modify `WebSocketDriverHandler` (line 3492) to register/unregister the connection with `driverTracker`. After the WebSocket upgrade (line 3501), add:

```go
driverTracker.Set(driverID, conn)
defer driverTracker.Remove(driverID)
```

Insert these two lines right after `defer conn.Close()` (line 3505).

- [ ] **Step 3: Add `fmt` to imports if not already present**

Check line 3 imports block — ensure `"fmt"` is included.

- [ ] **Step 4: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "feat: add DriverTracker for WebSocket push to drivers"
```

---

### Task 2: Backend — Modify CreateRide for Targeted Requests

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:318-395` (CreateRide handler)

- [ ] **Step 1: Add `driver_id` to CreateRide input struct**

At line 331, add to the input struct:

```go
DriverID      *uint   `json:"driver_id"`
```

- [ ] **Step 2: Set ride status based on driver_id presence**

Replace line 379's status assignment. Change the ride creation block (lines 376-380) to:

```go
rideStatus := "pending"
if input.DriverID != nil {
    // Verify the target driver exists, is verified, and available
    var targetDriver models.Driver
    if err := db.Where("id = ? AND is_verified = ? AND is_available = ?", *input.DriverID, true, true).First(&targetDriver).Error; err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Selected rider is no longer available"})
        return
    }
    rideStatus = "requested"
}
ride := models.Ride{
    UserID: userID, PickupLocation: input.PickupLocation, PickupLatitude: input.PickupLatitude, PickupLongitude: input.PickupLongitude,
    DropoffLocation: input.DropoffLocation, DropoffLatitude: input.DropoffLatitude, DropoffLongitude: input.DropoffLongitude,
    Distance: distance, EstimatedFare: fare, VehicleType: input.VehicleType, Status: rideStatus, PromoID: promoID, PaymentMethod: input.PaymentMethod,
    DriverID: input.DriverID,
}
```

- [ ] **Step 3: Send WebSocket push to targeted driver after ride creation**

After the ride is created successfully (after line 384), and before the notification, add:

```go
// If targeted request, notify driver via WebSocket and start expiry timer
if input.DriverID != nil {
    // Get passenger name for the notification
    var passenger models.User
    db.First(&passenger, userID)

    rideIDStr := fmt.Sprintf("%d", ride.ID)
    wsMsg := map[string]interface{}{
        "type":             "ride_request",
        "ride_id":          ride.ID,
        "pickup_location":  ride.PickupLocation,
        "dropoff_location": ride.DropoffLocation,
        "distance":         ride.Distance,
        "estimated_fare":   ride.EstimatedFare,
        "vehicle_type":     ride.VehicleType,
        "payment_method":   ride.PaymentMethod,
        "passenger_name":   passenger.Name,
        "expires_at":       time.Now().Add(30 * time.Second).Unix(),
    }
    driverIDStr := fmt.Sprintf("%d", *input.DriverID)
    if err := driverTracker.Send(driverIDStr, wsMsg); err != nil {
        log.Printf("Failed to send ride request to driver %s via WS: %v", driverIDStr, err)
    }

    // Start 30-second expiry goroutine
    go func(rideID uint, driverID uint) {
        time.Sleep(30 * time.Second)
        var r models.Ride
        if err := db.Where("id = ? AND status = ?", rideID, "requested").First(&r).Error; err != nil {
            return // Already accepted, declined, or cancelled
        }
        // Expire the request
        db.Model(&r).Updates(map[string]interface{}{"status": "cancelled", "driver_id": nil})
        // Notify passenger via ride tracking WS
        tracker.Broadcast(fmt.Sprintf("%d", rideID), map[string]interface{}{
            "type":    "ride_expired",
            "ride_id": rideID,
        })
        // Notify driver
        driverTracker.Send(fmt.Sprintf("%d", driverID), map[string]interface{}{
            "type":    "ride_expired",
            "ride_id": rideID,
        })
        // Set driver back to available
        db.Model(&models.Driver{}).Where("id = ?", driverID).Update("is_available", true)
        log.Printf("Ride #%d expired (30s timeout)", rideID)
    }(ride.ID, *input.DriverID)
}
```

- [ ] **Step 4: Update notification text for targeted requests**

Change the notification creation (line 386) to differentiate:

```go
notifBody := "Your ride request has been submitted. A rider will accept soon."
if input.DriverID != nil {
    notifBody = "Your ride request has been sent to the selected rider. Waiting for response..."
}
if err := db.Create(&models.Notification{UserID: userID, Title: "Ride Booked", Body: notifBody, Type: "ride_request"}).Error; err != nil {
    log.Printf("Failed to create ride booking notification: %v", err)
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/handlers.go
git commit -m "feat: CreateRide supports targeted driver requests with 30s expiry"
```

---

### Task 3: Backend — Modify AcceptRequest + Add DeclineRideRequest

**Files:**
- Modify: `backend/pkg/handlers/handlers.go:1640-1700` (AcceptRequest)
- Add new handler: DeclineRideRequest
- Modify: `backend/cmd/main.go:103-104` (add new route)

- [ ] **Step 1: Modify AcceptRequest to handle `requested` status and broadcast via WS**

In AcceptRequest (line 1656), the WHERE clause currently only matches `status = "pending"`. Change to also match `"requested"`:

```go
if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND status IN ?", requestID, []string{"pending", "requested"}).First(&ride).Error; err != nil {
```

After the ride is accepted successfully (after line 1672, inside `if rideErr == nil`), add WebSocket broadcast to passenger:

```go
// Broadcast acceptance to passenger via ride tracking WS
rideIDStr := fmt.Sprintf("%d", ride.ID)
tracker.Broadcast(rideIDStr, map[string]interface{}{
    "type":          "ride_accepted",
    "ride_id":       ride.ID,
    "driver_name":   driver.User.Name,
    "driver_rating":  driver.Rating,
    "vehicle_type":  driver.VehicleType,
    "vehicle_plate": driver.VehiclePlate,
    "driver_lat":    driver.CurrentLatitude,
    "driver_lng":    driver.CurrentLongitude,
})
```

Note: Need to preload driver user. Add before the transaction (after line 1647):

```go
db.Preload("User").First(&driver, driver.ID)
```

- [ ] **Step 2: Add DeclineRideRequest handler**

Add new handler after the existing RejectRequest handler:

```go
func DeclineRideRequest(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.MustGet("userID").(uint)
		var driver models.Driver
		if err := db.Where("user_id = ?", userID).First(&driver).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Driver not found"})
			return
		}
		requestID := c.Param("id")
		var ride models.Ride
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("id = ? AND status = ? AND driver_id = ?", requestID, "requested", driver.ID).
				First(&ride).Error; err != nil {
				return err
			}
			ride.Status = "cancelled"
			ride.DriverID = nil
			return tx.Save(&ride).Error
		})
		if err != nil {
			c.JSON(http.StatusConflict, gin.H{"success": false, "error": "Request not found or already handled"})
			return
		}
		// Notify passenger via WS
		rideIDStr := fmt.Sprintf("%d", ride.ID)
		tracker.Broadcast(rideIDStr, map[string]interface{}{
			"type":    "ride_declined",
			"ride_id": ride.ID,
		})
		// Create notification for passenger
		if err := db.Create(&models.Notification{
			UserID: ride.UserID, Title: "Ride Declined",
			Body: "The rider declined your request. Please select another rider.",
			Type: "ride_request",
		}).Error; err != nil {
			log.Printf("Failed to create decline notification: %v", err)
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"message": "Request declined"}})
	}
}
```

- [ ] **Step 3: Add route in main.go**

After line 104 in `main.go`, add:

```go
protected.POST("/driver/requests/:id/decline-ride", handlers.DeclineRideRequest(database))
```

- [ ] **Step 4: Add API method in mobile api.ts**

After `rejectRequest` (line 234) in `driverService`, add:

```typescript
declineRideRequest: (id: number) => api.post(`/driver/requests/${id}/decline-ride`),
```

- [ ] **Step 5: Commit**

```bash
git add backend/pkg/handlers/handlers.go backend/cmd/main.go mobile/src/services/api.ts
git commit -m "feat: add decline-ride endpoint + AcceptRequest broadcasts via WS"
```

---

### Task 4: Mobile — RiderSelectionScreen

**Files:**
- Create: `mobile/src/screens/Main/RiderSelectionScreen.tsx`
- Modify: `mobile/src/navigation/MainNavigator.tsx` (register screen)

- [ ] **Step 1: Create RiderSelectionScreen**

```typescript
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, moderateScale, fontScale, verticalScale } from '../../utils/responsive';
import { rideService } from '../../services/api';
import Toast, { ToastType } from '../../components/Toast';

interface NearbyDriver {
  id: number;
  name: string;
  rating: number;
  total_ratings: number;
  vehicle_type: string;
  vehicle_plate: string;
  distance: number;
  eta_minutes: number;
}

export default function RiderSelectionScreen({ navigation, route }: any) {
  const { bookingData } = route.params;
  const insets = useSafeAreaInsets();
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const excludedIds = useRef<Set<number>>(new Set(route.params?.excludeDriverIds || []));
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });
  const showToast = (message: string, type: ToastType = 'info') => setToast({ visible: true, message, type });

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await rideService.getNearbyDrivers({
        latitude: bookingData.pickup_latitude,
        longitude: bookingData.pickup_longitude,
        vehicle_type: bookingData.vehicle_type,
        max_distance: 15,
      });
      const data = res?.data?.data;
      if (Array.isArray(data)) {
        setDrivers(data.filter((d: NearbyDriver) => !excludedIds.current.has(d.id)));
      }
    } catch {
      showToast('Failed to load nearby riders', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingData]);

  useEffect(() => {
    fetchDrivers();
    refreshInterval.current = setInterval(fetchDrivers, 15000);
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, [fetchDrivers]);

  const handleSelectRider = async (driver: NearbyDriver) => {
    setSubmitting(true);
    try {
      const response = await rideService.createRide({
        ...bookingData,
        driver_id: driver.id,
      });
      const ride = response.data?.data;
      if (!ride?.id) {
        showToast('Failed to create ride. Try again.', 'error');
        setSubmitting(false);
        return;
      }
      navigation.replace('RiderWaiting', {
        rideId: ride.id,
        driverName: driver.name,
        driverRating: driver.rating,
        driverVehicle: `${driver.vehicle_type} - ${driver.vehicle_plate}`,
        bookingData,
        excludeDriverIds: Array.from(excludedIds.current),
      });
    } catch (error: any) {
      const msg = error.response?.data?.error || 'Failed to send request. Try again.';
      showToast(msg, 'error');
      fetchDrivers(); // Refresh list — rider may no longer be available
    } finally {
      setSubmitting(false);
    }
  };

  const renderDriver = ({ item }: { item: NearbyDriver }) => (
    <TouchableOpacity
      style={styles.driverCard}
      onPress={() => handleSelectRider(item)}
      activeOpacity={0.7}
      disabled={submitting}
    >
      <View style={styles.driverLeft}>
        <View style={[styles.avatar, { backgroundColor: COLORS.accent }]}>
          <Text style={styles.avatarText}>{(item.name || 'R').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.driverInfo}>
          <Text style={styles.driverName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color="#F59E0B" />
            <Text style={styles.ratingText}>{(item.rating || 0).toFixed(1)}</Text>
            <Text style={styles.ratingCount}>({item.total_ratings || 0})</Text>
          </View>
          <Text style={styles.vehicleText}>{item.vehicle_type} - {item.vehicle_plate}</Text>
        </View>
      </View>
      <View style={styles.driverRight}>
        <Text style={styles.distanceText}>{item.distance.toFixed(1)} km</Text>
        <Text style={styles.etaText}>~{Math.max(1, Math.round(item.eta_minutes))} min</Text>
        <View style={styles.selectBadge}>
          <Text style={styles.selectText}>Select</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Select a Rider</Text>
          <Text style={styles.headerSub}>
            {drivers.length} rider{drivers.length !== 1 ? 's' : ''} nearby
          </Text>
        </View>
        <TouchableOpacity onPress={fetchDrivers} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color={COLORS.accent} />
        </TouchableOpacity>
      </View>

      {/* Ride Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
          <Text style={styles.summaryText} numberOfLines={1}>{bookingData.pickup_location}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <View style={[styles.dot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.summaryText} numberOfLines={1}>{bookingData.dropoff_location}</Text>
        </View>
        <Text style={styles.fareText}>Estimated Fare: ₱{(bookingData.estimated_fare || 0).toFixed(0)}</Text>
      </View>

      {/* Driver List */}
      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Finding nearby riders...</Text>
        </View>
      ) : drivers.length === 0 ? (
        <View style={styles.centerWrap}>
          <Ionicons name="car-outline" size={64} color={COLORS.gray300} />
          <Text style={styles.emptyTitle}>No riders available nearby</Text>
          <Text style={styles.emptySubtitle}>Try again in a moment</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchDrivers}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={drivers}
          renderItem={renderDriver}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDrivers(); }} colors={[COLORS.accent]} tintColor={COLORS.accent} />
          }
        />
      )}

      {submitting && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={styles.overlayText}>Sending request...</Text>
          </View>
        </View>
      )}
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast(p => ({ ...p, visible: false }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: RESPONSIVE.paddingHorizontal,
    paddingVertical: verticalScale(12),
    backgroundColor: COLORS.white,
    ...SHADOWS.sm,
  },
  backBtn: { padding: 8 },
  headerCenter: { flex: 1, marginLeft: moderateScale(12) },
  headerTitle: { fontSize: fontScale(18), fontWeight: '700', color: COLORS.gray900 },
  headerSub: { fontSize: fontScale(12), color: COLORS.gray500, marginTop: 2 },
  refreshBtn: { padding: 8 },
  summaryCard: {
    margin: RESPONSIVE.paddingHorizontal, marginTop: verticalScale(12),
    backgroundColor: COLORS.white, borderRadius: moderateScale(14),
    padding: moderateScale(14), ...SHADOWS.sm,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(10) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  summaryDivider: {
    width: 1, height: verticalScale(16), backgroundColor: COLORS.gray200,
    marginLeft: 4, marginVertical: 4,
  },
  summaryText: { flex: 1, fontSize: fontScale(13), color: COLORS.gray700 },
  fareText: {
    fontSize: fontScale(14), fontWeight: '700', color: COLORS.accent,
    marginTop: verticalScale(10), textAlign: 'right',
  },
  list: { padding: RESPONSIVE.paddingHorizontal, paddingBottom: verticalScale(20) },
  driverCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.white, borderRadius: moderateScale(14),
    padding: moderateScale(14), marginBottom: verticalScale(10), ...SHADOWS.sm,
  },
  driverLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: moderateScale(48), height: moderateScale(48),
    borderRadius: moderateScale(24), alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: fontScale(18), fontWeight: '700', color: COLORS.white },
  driverInfo: { marginLeft: moderateScale(12), flex: 1 },
  driverName: { fontSize: fontScale(15), fontWeight: '700', color: COLORS.gray900 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  ratingText: { fontSize: fontScale(13), fontWeight: '600', color: COLORS.gray800 },
  ratingCount: { fontSize: fontScale(11), color: COLORS.gray400 },
  vehicleText: { fontSize: fontScale(12), color: COLORS.gray500, marginTop: 2, textTransform: 'capitalize' },
  driverRight: { alignItems: 'flex-end', marginLeft: moderateScale(8) },
  distanceText: { fontSize: fontScale(13), fontWeight: '600', color: COLORS.gray700 },
  etaText: { fontSize: fontScale(11), color: COLORS.gray400, marginTop: 2 },
  selectBadge: {
    marginTop: verticalScale(6), backgroundColor: COLORS.accentBg,
    paddingHorizontal: moderateScale(12), paddingVertical: moderateScale(5),
    borderRadius: moderateScale(8),
  },
  selectText: { fontSize: fontScale(12), fontWeight: '600', color: COLORS.accent },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  loadingText: { fontSize: fontScale(14), color: COLORS.gray500, marginTop: verticalScale(12) },
  emptyTitle: { fontSize: fontScale(18), fontWeight: '700', color: COLORS.gray700, marginTop: verticalScale(16) },
  emptySubtitle: { fontSize: fontScale(14), color: COLORS.gray400, marginTop: 4 },
  retryBtn: {
    marginTop: verticalScale(16), backgroundColor: COLORS.accent,
    paddingHorizontal: moderateScale(28), paddingVertical: moderateScale(12),
    borderRadius: moderateScale(12),
  },
  retryText: { fontSize: fontScale(14), fontWeight: '700', color: COLORS.white },
  overlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  overlayCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    paddingHorizontal: moderateScale(24), paddingVertical: moderateScale(16),
    borderRadius: moderateScale(14), gap: moderateScale(12), ...SHADOWS.lg,
  },
  overlayText: { fontSize: fontScale(14), color: COLORS.gray700, fontWeight: '500' },
});
```

- [ ] **Step 2: Register in MainNavigator**

In `mobile/src/navigation/MainNavigator.tsx`, add import after existing screen imports (around line 28):

```typescript
import RiderSelectionScreen from '../screens/Main/RiderSelectionScreen';
import RiderWaitingScreen from '../screens/Main/RiderWaitingScreen';
```

Add screen registrations inside the Stack.Navigator (after the Pasundo screen, around line 104):

```typescript
<Stack.Screen name="RiderSelection" component={RiderSelectionScreen} options={{ headerShown: false }} />
<Stack.Screen name="RiderWaiting" component={RiderWaitingScreen} options={{ headerShown: false }} />
```

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/Main/RiderSelectionScreen.tsx mobile/src/navigation/MainNavigator.tsx
git commit -m "feat: add RiderSelectionScreen with nearby rider list"
```

---

### Task 5: Mobile — RiderWaitingScreen

**Files:**
- Create: `mobile/src/screens/Main/RiderWaitingScreen.tsx`

- [ ] **Step 1: Create RiderWaitingScreen with 30s countdown and WebSocket**

```typescript
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { COLORS, SHADOWS } from '../../constants/theme';
import { RESPONSIVE, moderateScale, fontScale, verticalScale } from '../../utils/responsive';
import { rideService } from '../../services/api';
import Toast, { ToastType } from '../../components/Toast';

const TIMEOUT_SECONDS = 30;
const API_BASE = 'https://omji-backend.onrender.com/api/v1';

export default function RiderWaitingScreen({ navigation, route }: any) {
  const { rideId, driverName, driverRating, driverVehicle, bookingData, excludeDriverIds = [] } = route.params;
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);
  const [status, setStatus] = useState<'waiting' | 'accepted' | 'declined' | 'expired' | 'cancelled'>('waiting');
  const progress = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' as ToastType });

  // Pulse animation for the waiting indicator
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // Countdown bar animation
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: TIMEOUT_SECONDS * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  // Countdown timer
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const handleResponse = useCallback((type: string) => {
    if (status !== 'waiting') return;
    if (type === 'ride_accepted') {
      setStatus('accepted');
      setTimeout(() => {
        navigation.replace('Tracking', {
          type: 'ride',
          rideId,
          pickup: bookingData.pickup_location,
          dropoff: bookingData.dropoff_location,
          fare: bookingData.estimated_fare,
        });
      }, 1000);
    } else if (type === 'ride_declined' || type === 'ride_expired') {
      setStatus(type === 'ride_declined' ? 'declined' : 'expired');
      setTimeout(() => {
        const newExcluded = [...excludeDriverIds];
        // We don't have driver.id here directly, but the ride was cancelled
        // Navigate back to selection
        navigation.replace('RiderSelection', {
          bookingData,
          excludeDriverIds: newExcluded,
        });
      }, 1500);
    }
  }, [status, navigation, rideId, bookingData, excludeDriverIds]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const wsUrl = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://').replace('/api/v1', '');
    const ws = new WebSocket(`${wsUrl}/ws/tracking/${rideId}?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ride_accepted' || data.type === 'ride_declined' || data.type === 'ride_expired') {
          handleResponse(data.type);
        }
      } catch {}
    };

    ws.onerror = () => {};
    ws.onclose = () => {};

    return () => { ws.close(); };
  }, [rideId, token, handleResponse]);

  // Polling fallback — check ride status every 3s
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await rideService.getRideDetails(rideId);
        const ride = res?.data?.data;
        if (!ride) return;
        if (ride.status === 'accepted') handleResponse('ride_accepted');
        else if (ride.status === 'cancelled') handleResponse('ride_declined');
      } catch {}
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [rideId, handleResponse]);

  const handleCancel = async () => {
    setStatus('cancelled');
    try {
      await rideService.cancelRide(rideId);
    } catch {}
    navigation.goBack();
  };

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const barColor = secondsLeft <= 10 ? COLORS.primary : COLORS.accent;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Countdown bar */}
      <View style={styles.progressBar}>
        <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: barColor }]} />
      </View>

      <View style={styles.content}>
        {/* Pulsing indicator */}
        <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.innerCircle}>
            {status === 'waiting' && <Ionicons name="time-outline" size={40} color={COLORS.accent} />}
            {status === 'accepted' && <Ionicons name="checkmark-circle" size={40} color={COLORS.success} />}
            {(status === 'declined' || status === 'expired') && <Ionicons name="close-circle" size={40} color={COLORS.primary} />}
          </View>
        </Animated.View>

        {/* Status text */}
        <Text style={styles.statusTitle}>
          {status === 'waiting' && 'Waiting for response...'}
          {status === 'accepted' && 'Ride Accepted!'}
          {status === 'declined' && 'Rider Declined'}
          {status === 'expired' && 'Request Expired'}
        </Text>
        {status === 'waiting' && (
          <Text style={styles.timerText}>{secondsLeft}s remaining</Text>
        )}
        {status === 'accepted' && (
          <Text style={styles.subText}>Connecting you with your rider...</Text>
        )}
        {(status === 'declined' || status === 'expired') && (
          <Text style={styles.subText}>Returning to rider list...</Text>
        )}

        {/* Driver info card */}
        <View style={styles.driverCard}>
          <View style={styles.driverAvatar}>
            <Text style={styles.driverAvatarText}>{(driverName || 'R').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.driverDetails}>
            <Text style={styles.driverName}>{driverName}</Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={14} color="#F59E0B" />
              <Text style={styles.ratingText}>{(driverRating || 0).toFixed(1)}</Text>
            </View>
            <Text style={styles.vehicleText}>{driverVehicle}</Text>
          </View>
        </View>

        {/* Route summary */}
        <View style={styles.routeCard}>
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.routeText} numberOfLines={1}>{bookingData.pickup_location}</Text>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeRow}>
            <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
            <Text style={styles.routeText} numberOfLines={1}>{bookingData.dropoff_location}</Text>
          </View>
        </View>

        {/* Cancel button */}
        {status === 'waiting' && (
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel Request</Text>
          </TouchableOpacity>
        )}
      </View>
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast(p => ({ ...p, visible: false }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  progressBar: {
    height: 4, backgroundColor: COLORS.gray200, width: '100%',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: RESPONSIVE.paddingHorizontal },
  pulseCircle: {
    width: moderateScale(100), height: moderateScale(100), borderRadius: moderateScale(50),
    backgroundColor: COLORS.accentBg, alignItems: 'center', justifyContent: 'center',
    marginBottom: verticalScale(24),
  },
  innerCircle: {
    width: moderateScale(72), height: moderateScale(72), borderRadius: moderateScale(36),
    backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', ...SHADOWS.md,
  },
  statusTitle: { fontSize: fontScale(22), fontWeight: '700', color: COLORS.gray900, marginBottom: 8 },
  timerText: { fontSize: fontScale(16), fontWeight: '600', color: COLORS.accent, marginBottom: verticalScale(8) },
  subText: { fontSize: fontScale(14), color: COLORS.gray500, marginBottom: verticalScale(24) },
  driverCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    borderRadius: moderateScale(16), padding: moderateScale(16),
    width: '100%', marginBottom: verticalScale(16), ...SHADOWS.sm,
  },
  driverAvatar: {
    width: moderateScale(52), height: moderateScale(52), borderRadius: moderateScale(26),
    backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center',
  },
  driverAvatarText: { fontSize: fontScale(20), fontWeight: '700', color: COLORS.white },
  driverDetails: { marginLeft: moderateScale(14), flex: 1 },
  driverName: { fontSize: fontScale(16), fontWeight: '700', color: COLORS.gray900 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  ratingText: { fontSize: fontScale(13), fontWeight: '600', color: COLORS.gray800 },
  vehicleText: { fontSize: fontScale(12), color: COLORS.gray500, marginTop: 2, textTransform: 'capitalize' },
  routeCard: {
    backgroundColor: COLORS.white, borderRadius: moderateScale(14),
    padding: moderateScale(14), width: '100%', marginBottom: verticalScale(24), ...SHADOWS.sm,
  },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: moderateScale(10) },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  routeLine: {
    width: 1, height: verticalScale(16), backgroundColor: COLORS.gray200,
    marginLeft: 4, marginVertical: 4,
  },
  routeText: { flex: 1, fontSize: fontScale(13), color: COLORS.gray700 },
  cancelBtn: {
    paddingHorizontal: moderateScale(32), paddingVertical: moderateScale(14),
    borderRadius: moderateScale(12), borderWidth: 1.5, borderColor: COLORS.gray300,
  },
  cancelText: { fontSize: fontScale(14), fontWeight: '600', color: COLORS.gray600 },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/screens/Main/RiderWaitingScreen.tsx
git commit -m "feat: add RiderWaitingScreen with 30s countdown and WebSocket"
```

---

### Task 6: Mobile — Modify PasundoScreen to Navigate to RiderSelection

**Files:**
- Modify: `mobile/src/screens/Main/PasundoScreen.tsx:314-336`

- [ ] **Step 1: Change the booking confirmation to navigate to RiderSelectionScreen**

Replace the "Book Now" `onPress` handler. In the `Alert.alert('Confirm Pickup', ...)` (starting at line 314), replace the entire alert with:

```typescript
Alert.alert(
  'Confirm Pickup',
  `${pickupType === 'person' ? `Person: ${personName}\n` : `Type: ${pickupType}\n`}Vehicle: ${selectedVehicle.name}\nPickup: ${pickupLocation.address}\nDropoff: ${dropoffLocation.address}\nDistance: ${distance.toFixed(1)} km\nEstimated Fare: ₱${estimatedFare.toFixed(0)}\nPayment: ${paymentMethod.toUpperCase()}`,
  [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Find Rider',
      onPress: () => {
        navigation.navigate('RiderSelection', {
          bookingData: {
            pickup_location: pickupLabel,
            pickup_latitude: pickupLocation.latitude,
            pickup_longitude: pickupLocation.longitude,
            dropoff_location: dropoffLocation.address,
            dropoff_latitude: dropoffLocation.latitude,
            dropoff_longitude: dropoffLocation.longitude,
            vehicle_type: vehicleType,
            payment_method: paymentMethod,
            estimated_fare: estimatedFare,
            ...(promoApplied && promoCode.trim() ? { promo_code: promoCode.trim() } : {}),
          },
        });
      },
    },
  ]
);
```

This removes the inline ride creation and navigates to RiderSelectionScreen instead. The actual `createRide` call happens in RiderSelectionScreen after user picks a driver.

- [ ] **Step 2: Clean up — remove the loading state and inline ride creation code**

The `setLoading(true)` and the try/catch block with `rideService.createRide()` inside the old "Book Now" onPress (lines 322-365 approximately) are no longer needed since ride creation moved to RiderSelectionScreen. The `Alert.alert` replacement above is the entire new implementation.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/Main/PasundoScreen.tsx
git commit -m "feat: PasundoScreen navigates to RiderSelection instead of direct booking"
```

---

### Task 7: Mobile — RiderRequestModal (Driver Side)

**Files:**
- Create: `mobile/src/components/RiderRequestModal.tsx`

- [ ] **Step 1: Create RiderRequestModal component**

```typescript
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Easing, Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../constants/theme';
import { moderateScale, fontScale, verticalScale, RESPONSIVE } from '../utils/responsive';

interface RideRequestData {
  ride_id: number;
  pickup_location: string;
  dropoff_location: string;
  distance: number;
  estimated_fare: number;
  vehicle_type: string;
  payment_method: string;
  passenger_name: string;
  expires_at: number;
}

interface Props {
  visible: boolean;
  request: RideRequestData | null;
  onAccept: (rideId: number) => void;
  onDecline: (rideId: number) => void;
}

const TIMEOUT = 30;

export default function RiderRequestModal({ visible, request, onAccept, onDecline }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT);
  const progress = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (visible && request) {
      // Calculate remaining time from server expires_at
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(1, (request.expires_at || now + TIMEOUT) - now);
      setSecondsLeft(remaining);

      Vibration.vibrate([0, 400, 200, 400]);

      // Slide in
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start();

      // Progress bar
      progress.setValue(1);
      Animated.timing(progress, {
        toValue: 0, duration: remaining * 1000,
        easing: Easing.linear, useNativeDriver: false,
      }).start();

      // Countdown
      countdownRef.current = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            if (request) onDecline(request.ride_id);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      slideAnim.setValue(0);
    };
  }, [visible, request]);

  if (!visible || !request) return null;

  const barColor = secondsLeft <= 10 ? COLORS.primary : COLORS.accent;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, { transform: [{ translateY }] }]}>
          {/* Timer bar */}
          <View style={styles.timerBar}>
            <Animated.View style={[styles.timerFill, {
              width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: barColor,
            }]} />
          </View>

          <View style={styles.cardContent}>
            {/* Header */}
            <View style={styles.headerRow}>
              <Text style={styles.title}>New Ride Request</Text>
              <View style={[styles.timerBadge, secondsLeft <= 10 && { backgroundColor: COLORS.primaryBg }]}>
                <Text style={[styles.timerText, secondsLeft <= 10 && { color: COLORS.primary }]}>{secondsLeft}s</Text>
              </View>
            </View>

            {/* Passenger */}
            <View style={styles.passengerRow}>
              <View style={styles.passengerAvatar}>
                <Text style={styles.passengerAvatarText}>
                  {(request.passenger_name || 'P').charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.passengerName}>{request.passenger_name || 'Passenger'}</Text>
            </View>

            {/* Route */}
            <View style={styles.routeSection}>
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.success }]} />
                <Text style={styles.routeLabel} numberOfLines={2}>{request.pickup_location}</Text>
              </View>
              <View style={styles.routeDivider} />
              <View style={styles.routeRow}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
                <Text style={styles.routeLabel} numberOfLines={2}>{request.dropoff_location}</Text>
              </View>
            </View>

            {/* Details */}
            <View style={styles.detailsRow}>
              <View style={styles.detailItem}>
                <Ionicons name="cash-outline" size={18} color={COLORS.accent} />
                <Text style={styles.detailValue}>₱{(request.estimated_fare || 0).toFixed(0)}</Text>
              </View>
              <View style={styles.detailItem}>
                <Ionicons name="navigate-outline" size={18} color={COLORS.accent} />
                <Text style={styles.detailValue}>{(request.distance || 0).toFixed(1)} km</Text>
              </View>
              <View style={styles.detailItem}>
                <Ionicons name="card-outline" size={18} color={COLORS.accent} />
                <Text style={styles.detailValue}>{(request.payment_method || 'cash').toUpperCase()}</Text>
              </View>
            </View>

            {/* Buttons */}
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => onAccept(request.ride_id)}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
              <Text style={styles.acceptText}>Accept Ride</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={() => onDecline(request.ride_id)}
              activeOpacity={0.7}
            >
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: moderateScale(24), borderTopRightRadius: moderateScale(24),
    overflow: 'hidden', ...SHADOWS.xl,
  },
  timerBar: { height: 5, backgroundColor: COLORS.gray200, width: '100%' },
  timerFill: { height: '100%', borderRadius: 3 },
  cardContent: { padding: RESPONSIVE.paddingHorizontal, paddingBottom: verticalScale(32) },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: verticalScale(16), marginBottom: verticalScale(16),
  },
  title: { fontSize: fontScale(20), fontWeight: '700', color: COLORS.gray900 },
  timerBadge: {
    backgroundColor: COLORS.accentBg, paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(6), borderRadius: moderateScale(10),
  },
  timerText: { fontSize: fontScale(14), fontWeight: '700', color: COLORS.accent },
  passengerRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(16),
  },
  passengerAvatar: {
    width: moderateScale(40), height: moderateScale(40), borderRadius: moderateScale(20),
    backgroundColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center',
  },
  passengerAvatarText: { fontSize: fontScale(16), fontWeight: '700', color: COLORS.gray700 },
  passengerName: { fontSize: fontScale(15), fontWeight: '600', color: COLORS.gray800, marginLeft: moderateScale(12) },
  routeSection: {
    backgroundColor: COLORS.gray50, borderRadius: moderateScale(14),
    padding: moderateScale(14), marginBottom: verticalScale(16),
  },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: moderateScale(10) },
  routeDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  routeLabel: { flex: 1, fontSize: fontScale(13), color: COLORS.gray700, lineHeight: verticalScale(20) },
  routeDivider: {
    width: 1, height: verticalScale(14), backgroundColor: COLORS.gray300,
    marginLeft: 4, marginVertical: 4,
  },
  detailsRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginBottom: verticalScale(20), paddingVertical: verticalScale(10),
    backgroundColor: COLORS.gray50, borderRadius: moderateScale(12),
  },
  detailItem: { alignItems: 'center', gap: 4 },
  detailValue: { fontSize: fontScale(13), fontWeight: '700', color: COLORS.gray800 },
  acceptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.success, borderRadius: moderateScale(14),
    paddingVertical: moderateScale(16), gap: moderateScale(8),
    marginBottom: verticalScale(10),
  },
  acceptText: { fontSize: fontScale(16), fontWeight: '700', color: COLORS.white },
  declineBtn: {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: moderateScale(14), paddingVertical: moderateScale(14),
    borderWidth: 1.5, borderColor: COLORS.gray300,
  },
  declineText: { fontSize: fontScale(14), fontWeight: '600', color: COLORS.gray600 },
});
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/components/RiderRequestModal.tsx
git commit -m "feat: add RiderRequestModal component for driver-side ride requests"
```

---

### Task 8: Mobile — Integrate RiderRequestModal into RiderDashboardScreen

**Files:**
- Modify: `mobile/src/screens/Rider/RiderDashboardScreen.tsx`

- [ ] **Step 1: Add imports**

Add at the top of the file imports:

```typescript
import RiderRequestModal from '../../components/RiderRequestModal';
import { driverService } from '../../services/api';
```

(Check if driverService is already imported — it likely is.)

- [ ] **Step 2: Add state and WebSocket connection for ride requests**

Inside the component, add state for the modal:

```typescript
const [rideRequest, setRideRequest] = useState<any>(null);
const [showRequestModal, setShowRequestModal] = useState(false);
const driverWsRef = useRef<WebSocket | null>(null);
```

Add a useEffect that connects to the driver WebSocket when the driver is online. Add after the existing polling useEffect:

```typescript
// WebSocket for receiving targeted ride requests
useEffect(() => {
  if (!isOnline || !driverProfile?.id) return;

  const API_BASE = 'https://omji-backend.onrender.com/api/v1';
  const wsUrl = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://').replace('/api/v1', '');
  const ws = new WebSocket(`${wsUrl}/ws/driver/${driverProfile.id}?token=${token}`);
  driverWsRef.current = ws;

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'ride_request') {
        setRideRequest(data);
        setShowRequestModal(true);
      } else if (data.type === 'ride_expired') {
        setShowRequestModal(false);
        setRideRequest(null);
      }
    } catch {}
  };

  ws.onerror = () => {};
  ws.onclose = () => {};

  return () => { ws.close(); driverWsRef.current = null; };
}, [isOnline, driverProfile?.id, token]);
```

- [ ] **Step 3: Add accept/decline handlers for the modal**

```typescript
const handleAcceptRideRequest = async (rideId: number) => {
  setShowRequestModal(false);
  try {
    await driverService.acceptRequest(rideId);
    showToast('Ride accepted!', 'success');
    fetchData();
    navigation.navigate('Tracking', {
      type: 'ride',
      rideId,
      pickup: rideRequest?.pickup_location || '',
      dropoff: rideRequest?.dropoff_location || '',
      fare: rideRequest?.estimated_fare || 0,
    });
  } catch (error: any) {
    showToast(error.response?.data?.error || 'Failed to accept ride', 'error');
    fetchData();
  }
  setRideRequest(null);
};

const handleDeclineRideRequest = async (rideId: number) => {
  setShowRequestModal(false);
  try {
    await driverService.declineRideRequest(rideId);
  } catch {}
  setRideRequest(null);
};
```

- [ ] **Step 4: Add the modal to the render tree**

Add just before the closing `</View>` of the component (or before the Toast component):

```tsx
<RiderRequestModal
  visible={showRequestModal}
  request={rideRequest}
  onAccept={handleAcceptRideRequest}
  onDecline={handleDeclineRideRequest}
/>
```

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/Rider/RiderDashboardScreen.tsx
git commit -m "feat: integrate RiderRequestModal with WebSocket in driver dashboard"
```

---

### Task 9: Verification & Polish

- [ ] **Step 1: Verify all imports compile**

Run from the mobile directory:

```bash
npx expo start --clear
```

Check for any red screen errors or TypeScript issues.

- [ ] **Step 2: Test the full flow manually**

1. Open user app → go to Pasundo → fill all fields → tap "Book Pickup Service"
2. Confirm details → taps "Find Rider" → navigates to RiderSelectionScreen
3. See nearby riders list (if drivers are online with location)
4. Tap a rider → ride created with `driver_id` + status `requested`
5. Navigate to RiderWaitingScreen → see 30s countdown
6. On driver app (must be online + connected to WS): RiderRequestModal pops up
7. Driver taps Accept → passenger navigates to TrackingScreen
8. Or driver taps Decline / timer expires → passenger returns to rider list

- [ ] **Step 3: Commit all final changes**

```bash
git add -A
git commit -m "feat: complete rider selection system - user picks rider, 30s accept/decline"
```
