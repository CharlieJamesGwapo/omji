# ONE RIDE — Comprehensive Audit Findings (2026-04-18)

> **Status:** Report only. No code changed yet. Decide scope before executing.
> **Scope:** Backend (Go/Gin), Mobile user-side, Mobile rider-side, Admin web, Maps (cross-cutting).
> **Baseline:** Does NOT duplicate the 11-task plan at `2026-04-02-comprehensive-bug-fixes.md`.

---

## Summary

| Area | Critical | High | Medium | Nice | Maps 🗺️ |
|------|---------:|-----:|-------:|-----:|--------:|
| Backend | 8 | 8 | 7 | 6 | — |
| Mobile (user) | 6 | 9 | 11 | 7 | 8 |
| Mobile (rider) | 5 | 12 | 7 | 6 | 6 |
| Admin web | 6 | 10 | 8 | 6 | 2 |
| **Total** | **25** | **39** | **33** | **25** | **24** |

**Grand total: ~135 findings.** Not all need fixing before launch — the Critical tier does.

---

## 🚨 TOP 20 — "Must fix before production"

Consolidated across all 4 audits. These are the real blockers for a stable launch.

### Money / correctness (6)
1. **Wallet balance deducted but transaction record never saved** — `backend/pkg/handlers/handlers.go:2861,2985,4561,5055,5119` — Money can go missing with no audit trail.
2. **Commission deduction failures silently logged, transaction continues** — `backend/pkg/handlers/handlers.go:92-94,108-110`
3. **Withdrawal amount accepts "100.50.25" as 100.5025** — `mobile/src/screens/Rider/RiderEarningsScreen.tsx:238-240`
4. **No idempotency on withdrawal submit** — `RiderEarningsScreen.tsx:258-298` — Double-tap = double payout.
5. **Promo usage_count race condition** — `backend/pkg/handlers/handlers.go:787,1552,2241` — Concurrent claims can exceed limit.
6. **Referral wallet credit without lock** — `handlers.go:6530,6538` — Lost/double referral bonuses.

### Auth / security (4)
7. **AdminUpdateUser has no `MustBeAdmin()` check** — `handlers.go:5549-5618` — Any authenticated user could edit any user.
8. **Admin token in localStorage (XSS theft)** — `admin/src/App.tsx:363-364`
9. **WebSocket CheckOrigin allows `*`** — `handlers.go:4731-4732` — Cross-origin WS hijacking risk.
10. **No CSRF protection on admin state-changing requests** — `admin/src/services/api.ts`

### Ride lifecycle / driver state (4)
11. **Driver goes offline but rides stuck "accepted", passenger sees phantom pickup** — `RiderDashboardScreen.tsx:365-375`
12. **Location fallback sends 0,0 to backend if GPS fails** — `RiderDashboardScreen.tsx:318-353`
13. **WS reconnect hard-stops after 5 attempts** — `RiderDashboardScreen.tsx:258-262` — Driver silently disappears.
14. **Accept-ride button mash double-fires API** — `RiderDashboardScreen.tsx:378-420`

### Crashes / unmounted setState (3)
15. **PaymentScreen `.find()` without `Array.isArray` check** — `PaymentScreen.tsx:141`
16. **OrdersScreen setState after unmount** — `OrdersScreen.tsx:100-109`
17. **No React Error Boundary in navigation layer** — whole app crashes on any render error.

### Maps / location (3)
18. **Hardcoded Balingasag fallback coords shown as if real** — `TrackingScreen.tsx:547-553`, `MapPicker.tsx:33-34`
19. **GPS accuracy set to Balanced (100-500m error) — passengers see driver in wrong spot** — `RiderDashboardScreen.tsx:287`
20. **No Android foreground service — driver app killed in ~10min background** — `RiderDashboardScreen.tsx` (no service declared)

---

## Recommended execution order (phased)

### Batch A — Security & money (do first, ~1–2 days)
Items 1–10 above + the following from the wider list:
- Missing `.Scan()` error checks on admin/analytics dashboards (fake-zero data)
- File size validation before image upload (DoS risk)
- Admin XSS paths in announcements/notifications display

### Batch B — Ride reliability & crash fixes (~1–2 days)
Items 11–17 above + the existing 11-task plan at `2026-04-02-comprehensive-bug-fixes.md`.

### Batch C — Maps stability (~1 day)
Items 18–20 above + the 24 map-specific findings below.

### Batch D — Admin UX polish (~1 day)
Stale-data-after-edit, form error retention, timezone in commission filter, CSV export completeness.

### Batch E — Rider battery / background (~1–2 days)
Android foreground service, adaptive polling, WS backoff, location accuracy tiers by state (online/enroute/idle).

### Batch F — Nice-to-have (defer)
Telemetry, haptics, accessibility, bundle size, etc.

---

## Full findings by area

### 1. Backend (Go/Gin) — `backend/pkg/handlers/handlers.go`

#### Critical
- Commission deduction silent fail — `handlers.go:92-94`
- Missing `.Scan()` error checks — `handlers.go:6432,6587,6873,6258-6276,3835,3841,3844`
- Wallet balance deduction can orphan money — `handlers.go:2861,2985,4561,5055,5119`
- Promo usage_count race — `handlers.go:787,1552,2241`
- Referral wallet credit race — `handlers.go:6530,6538`
- WS CheckOrigin wildcard — `handlers.go:4731-4732`
- AdminUpdateUser missing auth check — `handlers.go:5549-5618`
- Commission record errors ignored — `handlers.go:108-110`

#### High
- Driver availability restore not fatal on error — `handlers.go:2823,2957`
- Concurrent ride vs delivery accept race — `handlers.go:2518,2930`
- payment_method fallback to cash but status=verified — `handlers.go:2862-2891,2985-3008`
- Wallet rollback uses stale balance — `handlers.go:2873,2997`

#### Medium
- Floating-point commission rounding — `handlers.go:84`
- Client-inflated estimated_fare (up to 2×) — `handlers.go:763-764`
- Whitespace-only type field passes empty check — `handlers.go:5838-5846`
- Withdrawal state doesn't guard `completed` — `handlers.go:4659-4666`
- RateRide string/int param mismatch — `handlers.go:1160-1167`
- File size not validated before upload — `handlers.go:2313,5407,5942,5981`
- Ride expiry goroutine leak under peak load — `handlers.go:851-881`
- Server-local-TZ in GetDriverEarnings — `handlers.go:2645-2647`

#### Nice-to-have
- Missing composite indexes (user_id, status)
- token_version increment without lock — `handlers.go:436,579`
- ChatMessage/Notification cascade on DeleteUser — `handlers.go:3298,3301`

---

### 2. Mobile — User (passenger) side

#### Critical
- PaymentScreen `.find()` without array check — `PaymentScreen.tsx:141`
- OrdersScreen unmounted setState — `OrdersScreen.tsx:100-109`
- TrackingScreen canRate logic falsy-string edge case — `TrackingScreen.tsx:475`
- TrackingScreen silent Balingasag fallback — `TrackingScreen.tsx:547-549`
- MapPicker geocode has no catch — `components/MapPicker.tsx:241-248`
- PasundoScreen rates fetch silent failure — `PasundoScreen.tsx:182-206`

#### High
- HomeScreen dotPulse animation leak — `HomeScreen.tsx:78-87`
- PasundoScreen missing mount guard — `PasundoScreen.tsx:154-168`
- RiderWaitingScreen WS leak on fast nav — `RiderWaitingScreen.tsx:97-146`
- RiderWaitingScreen poll interval race — `RiderWaitingScreen.tsx:149-160`
- AuthContext AsyncStorage no try/catch — `AuthContext.tsx:80-81,104-105`
- NotificationsScreen no error feedback on refresh — `NotificationsScreen.tsx:56-63`
- ProfileScreen null created_at crash — `ProfileScreen.tsx:173-182`
- SavedAddresses geocode silent fail — `SavedAddressesScreen.tsx:145-153`
- EditProfile image upload silent stub — `EditProfileScreen.tsx:245-250`

#### Medium (selected)
- Missing loading skeleton in NotificationsScreen
- OTP resend rapid-tap
- PasundoScreen promo error rollback missing
- MapPicker initialLocationSent race
- Register button enables mid-typing
- TrackingScreen WebView no coord validation
- PaymentScreen session timeout doesn't abort uploads
- OrdersScreen missing mount in mark-read
- Keyboard covers payment buttons
- **No error boundary anywhere**
- Store carousel keyExtractor collision

---

### 3. Mobile — Rider (driver) side

#### Critical
- Stuck online after network drop — `RiderDashboardScreen.tsx:365-375`
- 0,0 coords to backend — `RiderDashboardScreen.tsx:318-353`
- WS reconnect hard-stops after 5 — `RiderDashboardScreen.tsx:258-262`
- Accept button double-fire — `RiderDashboardScreen.tsx:378-420`
- rideRequest state leak — `RiderDashboardScreen.tsx:78-79,449-467`

#### High
- No re-check of permissions after re-grant — `RiderDashboardScreen.tsx:282-300`
- 60s location cadence + no focus resume — same file
- Accuracy.Balanced (300m error) — line 287
- 10s polling no adaptive throttle — 202-221
- No Android foreground service
- fetchData no mount guard — 164-194
- WS close doesn't notify backend
- Withdrawal multi-decimal accepted — `RiderEarningsScreen.tsx:238-240`
- Commission period view math inconsistent — same file 110-116
- Payment proof crash unrecoverable
- Status update race on Tracking — `TrackingScreen.tsx:295-328`

#### Medium
- Generic "network error" message
- Withdraw submit no idempotency
- Currency symbol hardcoded
- Decline reason silent backend reject
- WebView map instance bloat
- ETA calc divide by 0 silent
- Acceptance rate NaN display

---

### 4. Admin web

#### Critical
- Token in localStorage — `App.tsx:363-364`, `services/api.ts:42`
- 401 redirect race — `services/api.ts:80`
- No CSRF — `services/api.ts`
- CSV injection risk — `UsersPage.tsx:226-228`
- Announcement XSS if backend doesn't sanitize — `AnnouncementsPage.tsx:177-189`
- Withdrawal note state vs ref sync — `WithdrawalsPage.tsx:54-55,393-398`

#### High
- Cache: detail not invalidated on list edit — `services/api.ts:64-65`
- Stale selectedUser in detail modal — `UsersPage.tsx:80-84`
- Delete confirm lacks "who" — `UsersPage.tsx:117-133`
- Save button missing `disabled` — `PaymentConfigsPage.tsx:81-109`
- Pagination page-change race — `UsersPage.tsx:42-45`
- Commission date TZ (UTC vs local) — `CommissionPage.tsx:66-67`
- Rider auto-refresh clobbers selection — `RiderApprovalPage.tsx:70-77`
- No optimistic lock on approve — `WithdrawalsPage.tsx:51-76`
- Invalid URL status params silently pass — `RidesPage.tsx:85-88`
- Empty state missing on stale page — `UsersPage.tsx:170-172`

#### Medium
- Email/phone uniqueness frontend-absent
- Timezone display — `utils/index.ts:30-38`
- Orders CSV missing columns — `OrdersPage.tsx:127-128`
- QR upload silent failure — `PaymentConfigsPage.tsx:111-139`
- Pagination re-enable glitch
- Unknown status = grey default
- Rejection reason required but no message
- No refresh button debounce — `WithdrawalsPage.tsx:130-138`

---

### 5. Maps — cross-cutting (24 items)

**User side:**
- Hardcoded Balingasag fallback, no indication (MapPicker, TrackingScreen)
- WebView postMessage no ready check (TrackingScreen:465-469)
- Polyline coord arrays never validated
- Nominatim rate-limit hazard (no debounce)
- Reverse geocode no fallback handling
- PasundoScreen useRoadDistance no coord check
- Inline HTML/JS WebView, no CSP

**Rider side:**
- 0,0 silent fallback breaks matching
- Polyline not cleared between rides (DOM bloat)
- postMessage while WebView not mounted = dropped
- No bounds validation (lat ±90, lng ±180)
- Background location not configured (iOS + Android)
- Accuracy.Balanced (300m) — should be High while enroute

**Admin:**
- No live ride tracking map (feature gap)
- Driver lat/lng fetched but never rendered

**Cross-cutting:**
- No shared coord validator utility (reimplemented per screen)
- No "location permission denied" recovery UI
- No map retry/timeout patterns

---

## Open questions for you

1. **Deadline?** Play Store re-upload opens Apr 20 ~07:23 PHT. Do you want anything from Batch A/B in the next build?
2. **Priority ordering** — does Batch A → B → C → D → E → F match your risk tolerance, or do you want Maps (C) before money (A)?
3. **Maps library** — should we standardize on a single library (react-native-maps vs Leaflet WebView)? Current app mixes both which doubles the maintenance surface.
4. **Admin deploy** — where is admin hosted (Vercel?). Security fixes (token → httpOnly cookie, CSRF) need backend + deploy changes, not just frontend.
