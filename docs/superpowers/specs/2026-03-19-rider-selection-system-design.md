# Rider Selection & Request System Design

## Problem

Users book a Pasundo ride and it sits as "pending" with no driver assigned. Drivers only discover requests via 10-second polling on their dashboard. Users cannot see or choose available riders. There is no real-time notification to drivers when a ride is created.

## Solution

Let users see nearby available riders, select one, and send a direct request. The selected rider gets an instant WebSocket notification with a 30-second window to accept or decline. If declined or expired, user returns to the rider list to pick another.

## New Ride Status

Add `requested` status to the ride lifecycle:

```
requested → accepted → driver_arrived → in_progress → completed
    ↓
cancelled (if declined or expired)
```

- `requested`: ride created with a specific `driver_id`, waiting for driver response
- Existing `pending` status remains for future broadcast-to-all-riders use

## User Flow (Mobile)

### Step 1: PasundoScreen (existing, modified)

User fills pickup, dropoff, vehicle type, payment method as before. "Book Pickup Service" button text changes to "Find Rider". On tap, navigates to `RiderSelectionScreen` passing all booking details.

### Step 2: RiderSelectionScreen (new)

- Calls `GET /rides/nearby-drivers` with pickup coords and vehicle type
- Displays a FlatList of rider cards, each showing:
  - Avatar (first letter of name)
  - Name, star rating (e.g. 4.8)
  - Vehicle type and plate number
  - Distance from pickup (e.g. "1.2 km away")
  - Estimated arrival time (e.g. "~3 min")
- Pull-to-refresh + auto-refresh every 15 seconds
- Empty state: "No riders available nearby. Try again in a moment." with retry button
- Accepts a `excludeDriverIds` param to filter out previously declined riders
- On rider tap: show confirmation alert "Request [Name]? They have 30s to respond"
- On confirm: call `POST /rides/create` with `driver_id` set, navigate to RiderWaitingScreen

### Step 3: RiderWaitingScreen (new)

- Shows selected rider info (name, rating, vehicle)
- Animated 30-second countdown (circular progress or linear bar)
- Text: "Waiting for [Name] to accept..."
- Cancel button to abort (calls `PUT /rides/:id/cancel`)
- Connects to WebSocket `/ws/tracking/:rideId` and listens for:
  - `ride_accepted` → navigate to TrackingScreen
  - `ride_declined` or `ride_expired` → toast "Rider declined", navigate back to RiderSelectionScreen with this driver added to excludeDriverIds
- Also polls `GET /rides/:id` every 5s as WebSocket fallback

### Step 4: TrackingScreen (existing, no changes needed)

Works as before once ride status is `accepted`.

## Driver Flow (Mobile)

### RiderDashboardScreen (existing, modified)

When driver is online (`is_available = true`):

- Maintains a WebSocket connection to `/ws/driver/:driverId`
- On receiving `ride_request` event: opens `RiderRequestModal`

### RiderRequestModal (new component)

Full-screen modal overlay:
- 30-second countdown bar at top (animated, red when < 10s)
- Ride details: pickup address, dropoff address, distance, estimated fare, payment method, passenger name
- Two buttons: Accept (green, full width top) / Decline (red outline, full width bottom)
- Auto-declines when timer reaches 0
- Accept: calls `POST /driver/requests/:id/accept`, closes modal
- Decline: calls `POST /driver/requests/:id/decline`, closes modal

## Backend Changes

### Modified: POST /rides/create

```go
// If driver_id is provided in request body:
// - Set ride status to "requested" instead of "pending"
// - Send WebSocket event "ride_request" to the targeted driver
// - Start 30-second expiry goroutine
// If no driver_id:
// - Existing behavior (status = "pending")
```

### New: POST /driver/requests/:id/decline

```go
// 1. Verify ride exists and status == "requested"
// 2. Verify requesting driver matches ride.driver_id
// 3. Set ride status to "cancelled", clear driver_id
// 4. Set driver is_available = true
// 5. Send WebSocket event "ride_declined" to passenger
```

### New: 30-Second Expiry Goroutine

```go
// On ride creation with status "requested":
// go func() {
//   time.Sleep(30 * time.Second)
//   Re-check ride status from DB
//   If still "requested":
//     Set status = "cancelled", clear driver_id
//     Send WebSocket "ride_expired" to both passenger and driver
// }()
```

### Modified: WebSocket Handlers

**WebSocketDriverHandler** — add handling for incoming `ride_request` event (server → driver):
- The handler already receives messages from the driver
- Add: when a ride_request is created targeting this driver, push the event through the existing connection

**WebSocketTrackingHandler** — already handles status broadcasts, no changes needed.

### New WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `ride_request` | Server → Driver | ride_id, pickup, dropoff, distance, fare, payment_method, passenger_name, expires_at |
| `ride_accepted` | Server → Passenger | ride_id, driver_name, driver_rating, vehicle_type, vehicle_plate, driver_lat, driver_lng |
| `ride_declined` | Server → Passenger | ride_id, reason ("declined" or "expired") |
| `ride_expired` | Server → Driver | ride_id |

### Modified: POST /driver/requests/:id/accept

Add: send WebSocket event `ride_accepted` to the passenger (via tracking channel).

## Map Performance Improvements

### MapPicker Optimizations (already applied + additional)

1. **CDN**: Use jsDelivr CDN with minified Leaflet (faster than unpkg)
2. **Script loading**: Load JS at end of body (non-blocking render)
3. **Tile layer**: Use main OSM servers with `keepBuffer: 4`, `updateWhenIdle: true`
4. **HTML memoization**: `useMemo` prevents re-generating HTML on state changes
5. **Geocode debounce**: 600ms debounce on reverse geocoding (was firing every pan pixel)
6. **Location strategy**: Show last-known location instantly, fetch accurate GPS in background
7. **WebView caching**: `cacheEnabled={true}`, `cacheMode="LOAD_CACHE_ELSE_NETWORK"`
8. **Hardware acceleration**: `renderToHardwareTextureAndroid={true}`
9. **Pin animation**: Lifts on drag, settles on release for responsive feel
10. **Loading UX**: Card-style loader instead of full-screen overlay

### RiderSelectionScreen (no map needed)

- Pure list-based UI — no map, no WebView overhead
- Distance/ETA shown as text, calculated server-side
- Keeps the screen instant and focused

## Files

### New Files
- `mobile/src/screens/Main/RiderSelectionScreen.tsx`
- `mobile/src/screens/Main/RiderWaitingScreen.tsx`
- `mobile/src/components/RiderRequestModal.tsx`

### Modified Files
- `mobile/src/screens/Main/PasundoScreen.tsx` — "Find Rider" button → navigate to RiderSelectionScreen
- `mobile/src/screens/Rider/RiderDashboardScreen.tsx` — WebSocket listener + RiderRequestModal
- `mobile/src/navigation/MainNavigator.tsx` — register new screens
- `mobile/src/services/api.ts` — add `declineRequest` method
- `backend/pkg/handlers/handlers.go` — modify CreateRide, add DeclineRequest handler, add expiry goroutine
- `backend/cmd/main.go` — add decline route

## Out of Scope

- Auto-matching / broadcast to all riders (future feature)
- Push notifications (FCM/APNs) — using WebSocket + polling fallback
- Driver location on map in RiderSelectionScreen — just list with distance
- Rating system changes
- Payment system changes
