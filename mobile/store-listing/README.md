# OMJI App Store Listings

## Files
- `play-store.md` - Google Play Store listing content
- `app-store.md` - Apple App Store listing content

## Screenshots Needed

### Phone Screenshots (both stores)
1. **Home Screen** — showing services grid and search bar
2. **Ride Booking** — Pasundo screen with map and fare estimate
3. **Live Tracking** — tracking screen with driver on map
4. **Store Menu** — food ordering from a local store
5. **Wallet** — wallet balance and transaction history
6. **Chat** — in-app messaging with rider

### Sizes Required
- **Play Store**: min 320px, max 3840px (16:9 or 9:16)
- **App Store 6.7"**: 1290 x 2796px (iPhone 15 Pro Max)
- **App Store 6.5"**: 1284 x 2778px (iPhone 14 Plus)
- **App Store 5.5"**: 1242 x 2208px (iPhone 8 Plus)

### Feature Graphic (Play Store only)
- 1024 x 500px
- Brand logo + tagline + service icons

## Before Submitting
1. Set `EXPO_PUBLIC_SENTRY_DSN` in EAS secrets
2. Verify `google-services.json` matches production Firebase project
3. Run `eas build --platform all --profile production`
4. Test production build on real devices
5. Run `eas submit --platform all`
