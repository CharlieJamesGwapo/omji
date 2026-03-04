# Deploy OMJI Mobile App with Expo

## Prerequisites

Before building the mobile app:
- ✅ Code pushed to GitHub
- ✅ Backend deployed to Render and working
- ✅ Admin dashboard deployed to Vercel (optional)

## Step-by-Step Expo Deployment Guide

### 1. Install EAS CLI

Open terminal and install Expo's build service CLI:

```bash
npm install -g eas-cli
```

### 2. Login to Expo

```bash
eas login
```

If you don't have an Expo account:
- Go to https://expo.dev/signup
- Create a free account
- Come back and run `eas login` again

### 3. Configure Expo Project

Navigate to mobile directory:

```bash
cd /Users/dev3/omji/mobile
```

Update [app.json](mobile/app.json) with your Expo account details:

```bash
# Edit app.json and update these fields:
# Line 65: "projectId": "your-expo-project-id"
# Line 68: "owner": "your-expo-username"
```

### 4. Initialize EAS Build

```bash
eas build:configure
```

This will create `eas.json` configuration file.

### 5. Update Production API URL

The production API URL is already set in [mobile/src/config/api.config.ts:9](mobile/src/config/api.config.ts#L9):

```typescript
prod: {
  apiUrl: 'https://omji-backend.onrender.com/api/v1',
}
```

If your Render backend URL is different, update this file.

### 6. Build APK for Android (Recommended for Testing)

Build an APK file you can directly install on Android devices:

```bash
eas build --platform android --profile production
```

This will:
1. Upload your code to Expo servers
2. Install dependencies
3. Build the Android app
4. Generate an APK file
5. Give you a download link

**Build time**: 10-20 minutes

### 7. Download and Install APK

After build completes:

1. You'll get a download link like:
   ```
   https://expo.dev/accounts/your-account/projects/omji/builds/build-id
   ```

2. Open the link on your Android phone
3. Download the APK
4. Install it (you may need to enable "Install from unknown sources")

### 8. Build for iOS (Optional - Requires Apple Developer Account)

For iOS:

```bash
eas build --platform ios --profile production
```

⚠️ **Note**: iOS builds require:
- Apple Developer Account ($99/year)
- Valid provisioning profiles
- Code signing certificates

### 9. Submit to Google Play Store (Optional)

To publish on Play Store:

1. Create Google Play Console account ($25 one-time fee)
2. Build AAB instead of APK:
   ```bash
   eas build --platform android --profile production
   ```

3. Submit to Play Store:
   ```bash
   eas submit --platform android
   ```

### 10. Submit to App Store (Optional)

To publish on App Store:

1. Build for iOS
2. Submit to App Store:
   ```bash
   eas submit --platform ios
   ```

## Alternative: Expo Go Development Build

For quick testing without building APK:

### Option A: Development Build in Expo Go

1. Install Expo Go app from Play Store/App Store

2. Start development server:
   ```bash
   cd /Users/dev3/omji/mobile
   npx expo start
   ```

3. Scan QR code with Expo Go app

⚠️ **Limitation**: This uses development API (http://192.168.0.28:8080), not production

### Option B: Publish Update to Expo

Publish your app to Expo's servers:

```bash
cd /Users/dev3/omji/mobile
eas update --branch production
```

Users with Expo Go can then access it via a published link.

## Configuration Files Reference

### [mobile/app.json](mobile/app.json)
```json
{
  "expo": {
    "name": "OMJI",
    "slug": "omji",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.omji.balingasag"
    },
    "android": {
      "package": "com.omji.balingasag"
    },
    "extra": {
      "eas": {
        "projectId": "your-project-id-here"  // UPDATE THIS
      }
    },
    "owner": "your-expo-username"  // UPDATE THIS
  }
}
```

### [mobile/eas.json](mobile/eas.json)
```json
{
  "build": {
    "production": {
      "android": {
        "buildType": "apk"
      }
    }
  }
}
```

### [mobile/src/config/api.config.ts](mobile/src/config/api.config.ts)
```typescript
const ENV = {
  dev: {
    apiUrl: 'http://192.168.0.28:8080/api/v1',  // Local development
  },
  prod: {
    apiUrl: 'https://omji-backend.onrender.com/api/v1',  // Production
  },
};
```

## Troubleshooting

### "No Expo project found"
- Make sure you're in `/Users/dev3/omji/mobile` directory
- Check that `app.json` exists
- Run `npm install` to ensure dependencies are installed

### Build Fails with "Module not found"
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again
- Try building again

### APK Won't Install on Phone
- Enable "Install from unknown sources" in Android settings
- Make sure you downloaded the complete APK file
- Try clearing Downloads and downloading again

### App Crashes on Startup
- Check that backend URL is correct in `api.config.ts`
- Verify backend is running: `curl https://omji-backend.onrender.com/health`
- Check Expo build logs for errors

### Maps Not Working
- Verify Google Maps API key in `app.json`
- Check that location permissions are granted
- Make sure device has internet connection

### "Unauthorized" Error on Login
- Backend might be sleeping (Render free tier)
- Wait 30 seconds and try again
- Check backend logs on Render dashboard

## Free Tier Limitations

### Expo EAS Build (Free Tier):
- 30 builds per month
- Slower build queue
- 15 day build expiration
- Perfect for development and testing!

### Render Backend (Free Tier):
- Spins down after 15 minutes of inactivity
- First request takes ~30 seconds to wake up
- Users might experience delay on first app open

## Testing Your Mobile App

### Test Checklist:

1. **Authentication**
   - ✅ Register new account
   - ✅ Login with credentials
   - ✅ Auto-verify user

2. **Pasakay (Ride Booking)**
   - ✅ Select pickup location on map
   - ✅ Select dropoff location on map
   - ✅ Choose vehicle type
   - ✅ View estimated fare
   - ✅ Book ride
   - ✅ Data saves to Supabase database

3. **Pasugo (Delivery)**
   - ✅ Select pickup location
   - ✅ Select dropoff location
   - ✅ Enter item description
   - ✅ Upload item photo
   - ✅ Add notes for rider
   - ✅ View estimated fare
   - ✅ Book delivery
   - ✅ Photo and notes save to database

4. **Pasabay (Shopping)**
   - ✅ Browse stores
   - ✅ Add items to cart
   - ✅ Place order
   - ✅ Track order status

5. **Maps**
   - ✅ Map loads correctly
   - ✅ Can search locations
   - ✅ Current location works
   - ✅ Marker draggable
   - ✅ Address reverse geocoding

6. **Profile**
   - ✅ View profile
   - ✅ Edit profile information
   - ✅ Upload profile photo

## Quick Command Reference

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build Android APK
cd /Users/dev3/omji/mobile
eas build --platform android --profile production

# Build iOS (requires Apple account)
eas build --platform ios --profile production

# Publish update
eas update --branch production

# Development mode
npx expo start
```

## Expected Output After Successful Build

```
✔ Build finished.

📱 Install and run your app:

› Download the build:
  https://expo.dev/accounts/your-account/projects/omji/builds/abc123

› Or scan this QR code to download on your device:
  
  █████████████████████████████
  █████████████████████████████
  █████████████████████████████
  
› The build will be available for 15 days.

💡 Learn more about distributing your app:
   https://docs.expo.dev/distribution/introduction/
```

## Next Steps After Building

1. ✅ Download APK to Android phone
2. ✅ Install and test all features
3. ✅ Share APK with testers
4. ✅ Collect feedback
5. ⏳ Fix bugs if needed
6. ⏳ Build new version
7. ⏳ Submit to Play Store (optional)

---

## Full System Architecture

```
┌─────────────────────────────────────────────────┐
│                                                 │
│           OMJI Platform - Live System           │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  📱 Mobile App (Expo/React Native)              │
│     - Users book rides/deliveries               │
│     - Deployed via EAS Build (APK)              │
│     - API: https://omji-backend.onrender.com    │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  🌐 Admin Dashboard (React/Vite)                │
│     - Manage users, drivers, analytics          │
│     - Deployed on Vercel                        │
│     - URL: https://omji.vercel.app              │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  ⚙️  Backend API (Go/Gin)                       │
│     - REST API for all operations               │
│     - Deployed on Render                        │
│     - URL: https://omji-backend.onrender.com    │
│                                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  🗄️  Database (PostgreSQL)                      │
│     - Hosted on Supabase                        │
│     - 14 tables with auto-migration             │
│     - Stores all users, rides, deliveries       │
│                                                 │
└─────────────────────────────────────────────────┘
```

🎉 **Your complete OMJI platform is now ready for production!**

Good luck! 🚀
