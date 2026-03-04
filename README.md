# OMJI – One App. All Rides.

🚗 🏍️ 📦 🍔 **Pasugo • Pasabay • Pasundo • Stores** – All in one for Balingasag

Complete ride-hailing, delivery, pick-up, and local store delivery platform built with React Native and Go

## Project Structure

```
omji/
├── logo.jpeg              # OMJI Brand Logo
├── backend/               # Go Backend Server
│   ├── cmd/main.go        # Application entry point
│   ├── pkg/
│   │   ├── handlers/      # API handlers
│   │   ├── models/        # Database models
│   │   ├── services/      # Business logic
│   │   ├── db/            # Database setup
│   │   ├── middleware/    # Auth & CORS
│   │   └── websocket/     # Real-time tracking
│   └── config/            # Configuration
├── mobile/                # React Native Mobile App
│   ├── src/
│   │   ├── screens/       # Mobile screens
│   │   ├── services/      # API services
│   │   ├── context/       # Auth context
│   │   └── components/    # Reusable components
│   └── App.tsx            # Main app
├── web/                   # React Web App (Desktop)
│   ├── src/
│   │   ├── pages/         # Page components
│   │   ├── components/    # Reusable components
│   │   ├── services/      # API integration
│   │   ├── context/       # State management
│   │   └── styles/        # Global styles
│   └── App.tsx            # Main app
└── admin/                 # Admin Dashboard
    ├── src/
    │   └── App.tsx        # Admin dashboard
    └── package.json
```

## Features

### 🏍 PASUGO (Delivery Service)
Like Move It + Lalamove for Balingasag
- Book instant delivery with real-time tracking
- Pick-up & drop-off location (Google Maps integration)
- Real-time rider tracking
- Distance-based fare auto-calculation
- Upload item photo
- Notes for rider
- In-app chat & call
- Multiple drop-off option
- Cash / GCash / Maya / OMJI Wallet payment
- Complete delivery history

### 🧍‍♂️ PASABAY (Ride Sharing)
Like Angkas / Move It - Motorcycle rides
- Book motorcycle ride instantly
- Live rider tracking
- Estimated fare before booking
- Schedule ride option
- Save favorite locations (Home, Work)
- Complete ride history
- Rider rating system
- Emergency SOS button

### 👨‍👩‍👧 PASUNDO (Pick-up Service)
For school, market, parcel, and family pickup
- School pickup with recurring bookings
- Market pickup
- Parcel pickup
- Elderly/Family pickup
- Schedule pick-up time/date
- Add contact person details
- Driver notes
- Guardian notification

### 🛍 STORE DELIVERY
All stores in Balingasag - Like Foodpanda + GrabMart
- Browse local stores by category
  - Grocery, Pharmacy, Fast food, Hardware, Milk tea, Restaurants
- Upload products with price & photo
- Complete inventory management
- Order dashboard for stores
- Sales reports
- Add to cart & checkout
- Track delivery in real-time
- Promo codes support

### 👥 User & Driver Features
- OTP-based authentication
- Profile management
- Payment method management
- Ride/delivery history
- Rating and feedback system

### 🎯 Admin Dashboard
- User and driver management
- Ride/delivery analytics
- Earnings tracking
- Promo code management
- Real-time monitoring

## Tech Stack

### Backend
- **Go** - High-performance, concurrent API server
- **Gin** - Web framework
- **PostgreSQL** - Database
- **GORM** - ORM
- **JWT** - Authentication
- **WebSocket** - Real-time tracking
- **Gorilla WebSocket** - WebSocket support

### Mobile
- **React Native** (Expo) - Cross-platform mobile
- **Navigation** - React Navigation
- **Axios** - HTTP client
- **Async Storage** - Local storage
- **React Native Maps** - Map display

### Web
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **React Router** - Navigation
- **Zustand** - State management
- **Axios** - HTTP client
- **Recharts** - Analytics charts

## Getting Started

### Prerequisites
- Node.js 16+
- Go 1.21+
- PostgreSQL 12+
- Expo CLI (for mobile)

### Backend Setup

```bash
cd backend

# Install dependencies
go mod tidy

# Set up environment
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
go run cmd/main.go

# Server starts on http://localhost:8080
```

### Mobile App Setup

```bash
cd mobile

# Install dependencies
npm install

# Run on iOS
npm run ios

# Run on Android
npm run android

# Run on web
npm run web
```

### Web App Setup

```bash
cd web

# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm build
```

### Admin Dashboard Setup

```bash
cd admin

# Install dependencies
npm install

# Development server
npm run dev

# Build for production
npm build
```

## API Endpoints

### Authentication
- `POST /api/v1/public/auth/register` - Register
- `POST /api/v1/public/auth/login` - Login
- `POST /api/v1/public/auth/verify-otp` - Verify OTP

### Rides
- `POST /api/v1/rides/create` - Create ride
- `GET /api/v1/rides/active` - Get active rides
- `GET /api/v1/rides/:id` - Get ride details
- `PUT /api/v1/rides/:id/cancel` - Cancel ride
- `POST /api/v1/rides/:id/rate` - Rate ride

### Deliveries
- `POST /api/v1/deliveries/create` - Create delivery
- `GET /api/v1/deliveries/active` - Get active deliveries
- `PUT /api/v1/deliveries/:id/cancel` - Cancel delivery
- `POST /api/v1/deliveries/:id/rate` - Rate delivery

### Orders
- `POST /api/v1/orders/create` - Create order
- `GET /api/v1/orders/active` - Get active orders
- `PUT /api/v1/orders/:id/cancel` - Cancel order
- `POST /api/v1/orders/:id/rate` - Rate order

### Stores
- `GET /api/v1/stores` - Get all stores
- `GET /api/v1/stores/:id/menu` - Get store menu

### Driver
- `POST /api/v1/driver/register` - Register driver
- `GET /api/v1/driver/profile` - Get driver profile
- `GET /api/v1/driver/requests` - Get driver requests
- `POST /api/v1/driver/requests/:id/accept` - Accept request
- `GET /api/v1/driver/earnings` - Get earnings

## WebSocket Events (Real-time)

### Driver Location Tracking
```
ws://localhost:8080/ws/tracking/:rideId
```

## Database Schema

The database includes the following tables:
- users
- drivers
- rides
- rideshares
- deliveries
- stores
- menu_items
- orders
- payment_methods
- promos
- chat_messages
- notifications

## Environment Variables

### Backend (.env)
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=omji_user
DB_PASSWORD=omji_password
DB_NAME=omji_db
JWT_SECRET=your-secret-key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
PORT=8080
```

## Deployment

### Docker
Dockerfiles for each service are available:
```bash
# Build backend
docker build -t omji-backend ./backend

# Build web
docker build -t omji-web ./web

# Build admin
docker build -t omji-admin ./admin
```

### Docker Compose
Use docker-compose for full stack deployment:
```bash
docker-compose up -d
```

## API Response Format

All API responses follow this format:

```json
{
  "success": true/false,
  "data": {...},
  "error": null/error_message,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Security Features

- JWT authentication
- Password hashing (bcrypt)
- CORS configuration
- Rate limiting
- SQL injection prevention (GORM)
- XSS protection
- HTTPS ready

## Performance Optimizations

- Go concurrency for handling multiple requests
- Database connection pooling
- Caching with Redis (optional)
- WebSocket for real-time updates
- React lazy loading and code splitting
- Mobile app optimization

## Future Enhancements

- [ ] Multi-language support
- [ ] Multi-currency support
- [ ] AI-based route optimization
- [ ] Advanced analytics
- [ ] In-app wallet
- [ ] Blockchain for transparency
- [ ] 3D maps
- [ ] Augmented reality features
- [ ] Social features
- [ ] Integration with payment gateways

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License

## Support

For support, email support@omji.app or create an issue in the repository

## 2024 - OMJI - Your All-in-One Service App
