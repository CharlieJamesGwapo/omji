# OMJI Mobile App

**One App. All Rides.** 🚀

A comprehensive multi-service mobile application for Balingasag featuring ride-hailing, delivery, and local store services.

## Features

### 🏍 Pasugo (Delivery Service)
- Book instant delivery with real-time tracking
- Pick-up & drop-off location selection
- Upload item photos
- Distance-based fare calculation
- Multiple payment options (Cash, GCash, Maya, Wallet)
- In-app chat with rider

### 🚴 Pasabay (Ride Sharing)
- Book motorcycle rides instantly
- Live rider tracking on map
- Estimated fare before booking
- Save favorite locations (Home, Work)
- Rider rating system
- Ride history

### 👨‍👩‍👧 Pasundo (Pick-up Service)
- School pickup
- Market pickup
- Parcel pickup
- Schedule pick-up time/date
- Recurring bookings
- Contact person management

### 🛍 Store Delivery
- Browse local stores by category
- Grocery, Pharmacy, Food, Hardware, and more
- Product catalog with images
- Add to cart and checkout
- Real-time order tracking
- Promo codes

### 💳 Payment System
- Cash on Delivery
- GCash integration
- Maya payment
- OMJI Wallet system
- Transaction history

### 🏍 Rider Features (Separate App Mode)
- Online/Offline toggle
- Accept/Reject jobs
- Real-time navigation
- Earnings dashboard
- Daily/Weekly income reports
- Withdrawal requests

## Tech Stack

- **Framework:** React Native with Expo
- **Language:** TypeScript
- **Navigation:** React Navigation (Stack & Bottom Tabs)
- **State Management:** React Context API
- **Maps:** React Native Maps
- **UI Icons:** @expo/vector-icons (Ionicons)
- **HTTP Client:** Axios
- **Storage:** AsyncStorage
- **Backend:** Go (Gin Framework)

## Project Structure

```
mobile/
├── src/
│   ├── screens/
│   │   ├── Auth/          # Login, Register, OTP
│   │   ├── Main/          # All user-facing screens
│   │   └── Rider/         # Rider app screens
│   ├── context/           # React Context (Auth)
│   ├── services/          # API services
│   ├── components/        # Reusable components
│   ├── types/             # TypeScript types
│   └── utils/             # Utility functions
├── assets/                # Images, fonts, etc.
├── App.tsx                # Main app entry
├── app.json               # Expo configuration
└── package.json           # Dependencies
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (Mac) or Android Studio
- Expo Go app on your phone (for testing)

### Installation

1. Navigate to mobile directory:
   ```bash
   cd mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Run on device/simulator:
   - Press `i` for iOS Simulator
   - Press `a` for Android Emulator
   - Scan QR code with Expo Go app

## Available Scripts

- `npm start` - Start Expo development server
- `npm run android` - Run on Android
- `npm run ios` - Run on iOS
- `npm run web` - Run on web browser

## Environment Setup

The app connects to the backend API. Update the API base URL in:

```typescript
// src/services/api.ts
const API_BASE_URL = 'http://localhost:8080/api/v1';
```

For testing on physical device, use your computer's IP address:
```typescript
const API_BASE_URL = 'http://192.168.1.x:8080/api/v1';
```

## Color Scheme

- **Primary Blue:** #3B82F6
- **Success Green:** #10B981
- **Warning Orange:** #F59E0B
- **Danger Red:** #EF4444
- **Background:** #F9FAFB
- **Text Dark:** #1F2937
- **Text Gray:** #6B7280

## Key Screens

### User Screens
1. **Home** - Service cards and quick actions
2. **Pasugo** - Delivery booking
3. **Pasabay** - Ride booking
4. **Pasundo** - Pick-up service
5. **Stores** - Browse local stores
6. **Cart** - Shopping cart
7. **Orders** - Order history
8. **Tracking** - Real-time tracking
9. **Profile** - User settings
10. **Wallet** - Balance & transactions

### Rider Screens
1. **Dashboard** - Job management
2. **Earnings** - Income tracking
3. **Profile** - Rider settings

## Features

### Authentication
- Phone-based registration
- OTP verification
- Secure login with JWT
- Role-based access (User/Rider)

### Real-time Features
- Live location tracking
- Push notifications
- In-app chat
- WebSocket integration

### Payment Integration
- Multiple payment methods
- Wallet system
- Transaction history
- Promo codes

## API Integration

All API calls are centralized in `src/services/api.ts`:

```typescript
// Example usage
import { rideAPI } from './services/api';

const bookRide = async () => {
  const response = await rideAPI.bookRide({
    pickupLocation: { lat: 8.9, lng: 124.7, address: "..." },
    dropoffLocation: { lat: 8.91, lng: 124.71, address: "..." },
    paymentMethod: 'cash'
  });
};
```

## Performance Optimizations

- Lazy loading of screens
- Image optimization
- Cached API responses
- Minimal re-renders with React.memo
- Efficient list rendering with FlatList

## Testing

Test user credentials (when backend is running):
- **Phone:** 09123456789
- **Password:** password123

## Deployment

### Build for Production

1. Build Android APK:
   ```bash
   expo build:android
   ```

2. Build iOS IPA:
   ```bash
   expo build:ios
   ```

3. Or use EAS Build:
   ```bash
   eas build --platform all
   ```

## Contributing

This is a complete production-ready app. To add features:

1. Create new screen in `src/screens/`
2. Add route in `App.tsx`
3. Add API service in `src/services/api.ts`
4. Update navigation types

## Support

For issues or questions about OMJI mobile app, please check the main README.md

## License

Copyright © 2024 OMJI Balingasag

---

Built with ❤️ for Balingasag, Misamis Oriental
