# ONE RIDE 1.0.4 — Closed Testing Release

**Build:** 1.0.4 / versionCode 18
**Date:** 2026-04-20
**Track:** Play Console closed testing
**Branch:** one-ride-balingasag

## What's new

- Driver trips no longer stall after a long background — Android keeps the app alive via a foreground service while an active ride is in progress.
- Withdrawals cannot be submitted twice by accidental double-tap. Backend rejects replayed submissions and returns the original result.
- Profile photo changes now actually save (previous builds dropped the file). Server stores the uploaded image and returns a stable URL.
- Crash-recovery screen wraps the whole app — a render error shows a "Try again" fallback instead of a white screen.
- GPS precision adapts to the trip state: high-precision during active rides, battery-friendly while idle or backgrounded.
- Promo-code usage limits are no longer bypassable via concurrent submissions.
- Driver disconnects (explicit or silent) cancel the passenger's phantom pickup. A 30-second backend reaper catches silent WS drops.
- Driver WebSocket reconnection is indefinite; a "Reconnecting…" banner surfaces prolonged outages.
- Location updates outside the Philippine bounding box are rejected before hitting the backend.
- Rates fetch failure on the vehicle-select screen now surfaces a tappable retry banner instead of silently using stale prices.

## What we want testers to stress

- Go online, accept a ride, background the app for ~15 min, come back — the trip should still be active and the persistent notification should have been visible.
- Submit a withdrawal, tap the button twice fast — only one record should appear in the driver's withdrawal history.
- Edit your profile photo, force-close the app, reopen — the new photo should persist.
- Toggle airplane mode mid-trip for ~10 seconds, then back on — the rider dashboard should show "Reconnecting…" then recover on its own; the passenger's pickup should not be cancelled.
- Apply a promo code that's near its usage limit from multiple devices simultaneously (if you have more than one tester) — the count should never exceed the stated limit.
- Pick a rider profile photo and save — the server URL, not the local file, should show up after reopen.

## Known issues (not shipping in this release)

- Admin web console token is stored in localStorage — migration to httpOnly cookie is a separate release.
- Map library consolidation (react-native-maps vs Leaflet-in-WebView) pending — on some low-end Android devices the tracking map may stutter.
- Battery / adaptive-polling optimizations beyond what is covered by the tiered GPS accuracy are pending.

## Build

The `.aab` is NOT built as part of this commit. Build it locally with:

- **If EAS is configured:** `cd mobile && npx eas build --platform android --profile production`
  Download the resulting `.aab` from the EAS build page.

- **If classic Gradle:** `cd mobile/android && ./gradlew bundleRelease`
  Output: `mobile/android/app/build/outputs/bundle/release/app-release.aab`.

Before uploading to the Play Console, verify the build by installing on a real device (convert `.aab → .apks` with `bundletool` or install via EAS).
