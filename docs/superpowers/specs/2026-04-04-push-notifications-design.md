# Push Notifications — Full Wiring Design Spec

**Date:** 2026-04-04
**Status:** Approved

## Problem

Only chat messages send actual push notifications. All other events (ride accepted, driver arrived, payment verified, etc.) only create in-app `Notification` records that users never see unless they open the app.

## Solution

Wire `sendExpoPushNotification()` to all critical event triggers. Create a `sendPushToUser` helper that looks up PushToken by UserID.

---

## Helper Function

```go
func sendPushToUser(db *gorm.DB, userID uint, title, body string, data map[string]interface{})
```

- Queries `PushToken` by `user_id`
- If token exists, calls `sendExpoPushNotification(token, title, body, data)`
- If no token, silently returns (user hasn't enabled notifications)
- Fire-and-forget (non-blocking, runs in goroutine)

## Push Notification Triggers

### Rider receives (sent to driver's user_id):
| Event | Title | Body | Data type |
|-------|-------|------|-----------|
| New ride request | New Ride Request! | [user] needs a ride from [pickup] | ride_request |
| New delivery request | New Delivery Request! | [user] needs a delivery from [pickup] | delivery_request |
| Ride cancelled by user | Ride Cancelled | Ride #X was cancelled by the passenger | ride_update |
| Delivery cancelled by user | Delivery Cancelled | Delivery #X was cancelled | delivery_update |

### User receives (sent to ride/delivery/order user_id):
| Event | Title | Body | Data type |
|-------|-------|------|-----------|
| Ride accepted | Rider On The Way! | Your rider is heading to your pickup location | ride_accepted |
| Driver arrived | Rider Arrived! | Your rider has arrived at the pickup location | ride_update |
| Trip started | Trip Started | Your ride is now in progress! | ride_update |
| Trip completed | Ride Complete! | Rate your rider and share feedback | ride_update |
| Delivery accepted | Rider Assigned! | A rider is heading to pick up your package | delivery_update |
| Delivery picked up | Package Picked Up | Your package is on the way! | delivery_update |
| Delivery completed | Delivery Complete! | Your package has been delivered | delivery_update |
| Order confirmed | Order Confirmed | Your order is being prepared | order_update |
| Order ready | Order Ready! | Your order is ready for pickup | order_update |
| Order out for delivery | On The Way! | Your order is out for delivery | order_update |
| Order delivered | Order Delivered! | Your order has been delivered | order_update |
| Payment verified | Payment Verified! | Your payment has been confirmed | payment_update |
| Payment rejected | Payment Rejected | Your payment proof was rejected. Please resubmit. | payment_update |
| Driver approved | You're Approved! | You can now start accepting rides | account_update |

### Admin broadcasts:
| Event | Title | Body | Data type |
|-------|-------|------|-----------|
| Admin notification | [custom title] | [custom body] | announcement |

## App Version Check

- Backend: `GET /api/v1/app-version` returns `{ version: "1.0.1", force_update: false }`
- Mobile: Check on app launch, show update prompt if newer version available
- Not a push notification — just an API check

## Files to Modify

### Backend
- `backend/pkg/handlers/handlers.go` — Add sendPushToUser helper, wire ~15 trigger points, add app version endpoint
- `backend/cmd/main.go` — Add app version route

### Mobile
- `mobile/src/services/api.ts` — Add app version check
- `mobile/App.tsx` or root component — Version check on launch

## Out of Scope
- Push notification analytics/tracking
- Notification scheduling
- Retry mechanism (keep fire-and-forget for now)
- Rich notifications with images
