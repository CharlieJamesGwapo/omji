# OMJI Auth + Rides (Pasundo) - Design Document

**Date:** 2026-03-03
**Scope:** Make authentication and ride booking fully functional
**Approach:** Backend-First — implement all Go handlers, then wire up mobile app
**Target platform:** Mobile (React Native/Expo) first, web follows automatically

---

## Current State

- 65+ backend handlers are **stubs** (return placeholder messages)
- Mobile/web UI is scaffolded with API service layers ready
- Database models defined in GORM, PostgreSQL configured
- Middleware (JWT, CORS, role-based auth) is functional
- WebSocket handler is stubbed

## What We're Building

### Phase 1: Authentication System

**Registration:**
- User submits: name, email, phone, password
- Backend hashes password with bcrypt
- Creates user record in PostgreSQL via GORM
- Generates 6-digit OTP with 5-minute expiry
- Returns OTP in response (production: send via SMS)

**Login:**
- User submits email + password
- Backend verifies bcrypt hash
- Generates JWT (24hr expiry) with user_id and role
- Returns token + user profile

**OTP Verification:**
- User submits phone + OTP code
- Backend validates OTP + checks expiry
- Marks user as verified
- Returns JWT token

**Token Management:**
- JWT middleware on all protected routes
- Token payload: user_id, role (user/driver/admin), exp
- 401 response triggers auto-logout on clients (already implemented)

### Phase 2: Ride Booking (Pasundo)

**Creating a Ride:**
- Input: pickup (lat/lng + address), dropoff (lat/lng + address), vehicle_type
- Calculate distance: Haversine formula (exists in utils)
- Fare calculation (simple distance-based):
  - Motorcycle: 40 PHP base + 10 PHP/km
  - Car: 60 PHP base + 15 PHP/km
- Create ride record with status `pending`
- Broadcast to available drivers within 5km via WebSocket

**Driver Matching (Broadcast Model):**
- All drivers where `is_available = true` and within 5km of pickup receive request
- First to accept wins (database transaction prevents double-accept)
- Status: `pending` -> `accepted`
- No driver within 2 min: status -> `no_driver_found`

**Ride Lifecycle:**
```
pending -> accepted -> driver_arrived -> in_progress -> completed
                                                    \-> cancelled
```

**Real-time Tracking (WebSocket):**
- Channel: `ws://localhost:8080/ws/tracking/:rideId`
- Driver sends location every 3 seconds
- Passenger receives location updates + status changes
- Bidirectional for status updates

**Ride Completion:**
- Driver marks `completed`
- Final fare calculated on actual distance
- Both parties can rate (1-5 stars + comment)

**Cancellation:**
- Either party can cancel before `in_progress`
- Cancellation reason stored

### Phase 3: Driver System

**Driver Registration:**
- Submit vehicle info (type, plate, color)
- Separate driver record linked to user

**Driver Operations:**
- View incoming ride requests (pending rides within range)
- Accept/decline rides
- Update availability status and location
- View earnings summary

### Phase 4: Mobile App Updates

**Minimal changes needed (API layer exists):**
- Ensure screens handle real response data shapes
- Add WebSocket connection for ride tracking screen
- Add map components (react-native-maps installed but unused)
- Integrate logo.jpeg as app branding

## API Endpoints (Implementation Priority)

| # | Endpoint | Purpose |
|---|----------|---------|
| 1 | `POST /api/v1/public/auth/register` | Create user, hash password, generate OTP |
| 2 | `POST /api/v1/public/auth/login` | Verify credentials, return JWT |
| 3 | `POST /api/v1/public/auth/verify-otp` | Verify OTP, mark verified |
| 4 | `GET /api/v1/user/profile` | Get user profile from JWT |
| 5 | `PUT /api/v1/user/profile` | Update user details |
| 6 | `POST /api/v1/rides/create` | Calculate fare, create ride, broadcast |
| 7 | `GET /api/v1/rides/active` | Get user's active rides |
| 8 | `GET /api/v1/rides/:id` | Get ride details + driver info |
| 9 | `PUT /api/v1/rides/:id/cancel` | Cancel ride with reason |
| 10 | `POST /api/v1/rides/:id/rate` | Rate completed ride |
| 11 | `POST /api/v1/driver/register` | Register as driver |
| 12 | `GET /api/v1/driver/requests` | Get nearby pending rides |
| 13 | `POST /api/v1/driver/requests/:id/accept` | Accept ride (with DB lock) |
| 14 | `PUT /api/v1/driver/status` | Update availability + location |
| 15 | `GET /api/v1/driver/earnings` | Earnings summary |
| 16 | `WS /ws/tracking/:rideId` | Real-time location + status |

## Fare Calculation

```
motorcycle_fare = 40 + (distance_km * 10)
car_fare = 60 + (distance_km * 15)
```

Distance calculated using Haversine formula (already in `pkg/services/utils.go`).

## Database

- PostgreSQL (already installed locally)
- GORM models already defined (13 tables)
- Auto-migration on startup (already configured)
- Transactions for ride acceptance (prevent double-accept)

## Tech Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Fare model | Simple distance-based | Clear, predictable pricing |
| Driver matching | Broadcast (first-accept) | Industry standard, simple |
| Real-time | WebSocket | Already scaffolded, better UX than polling |
| Database | PostgreSQL | Already configured, production-ready |
| Auth | JWT + bcrypt + OTP | Already in middleware, secure |

## Out of Scope (Future Phases)

- Delivery (Pasugo) handlers
- Food/store ordering handlers
- Payment gateway integration
- Ride sharing (Pasabay)
- Admin dashboard backend integration
- Push notifications (FCM/APNs)
- SMS OTP delivery
- Multi-language support
