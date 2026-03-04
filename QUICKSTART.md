# OMJI - Quick Start Guide

## Installation & Running

### Option 1: Docker Compose (Recommended)

```bash
# Navigate to project root
cd omji

# Start all services
docker-compose up -d

# Services will be available at:
# - Backend API: http://localhost:8080
# - Web App: http://localhost:3000
# - Admin Dashboard: http://localhost:3001
# - Database: localhost:5432
```

### Option 2: Manual Setup

#### 1. Backend Setup

```bash
cd backend

# Install Go dependencies
go mod tidy

# Set up environment
cp .env.example .env

# Update .env with your PostgreSQL credentials
# Default:
# DB_HOST=localhost
# DB_PORT=5432
# DB_USER=omji_user
# DB_PASSWORD=omji_password
# DB_NAME=omji_db

# Run the backend server
go run cmd/main.go

# Server runs on http://localhost:8080
```

#### 2. Database Setup

```bash
# Create PostgreSQL user and database
psql -U postgres

# In PostgreSQL console:
CREATE USER omji_user WITH PASSWORD 'omji_password';
CREATE DATABASE omji_db OWNER omji_user;
GRANT ALL PRIVILEGES ON DATABASE omji_db TO omji_user;
\q
```

#### 3. Web App Setup

```bash
cd web

# Install dependencies
npm install

# Start development server
npm run dev

# App runs on http://localhost:3000
```

#### 4. Mobile App Setup

```bash
cd mobile

# Install dependencies
npm install

# Run on iOS (Mac only)
npm run ios

# Run on Android
npm run android

# Run on web
npm run web
```

#### 5. Admin Dashboard Setup

```bash
cd admin

# Install dependencies
npm install

# Start development server
npm run dev

# Dashboard runs on http://localhost:3001
```

## API Testing

### Login Example

```bash
curl -X POST http://localhost:8080/api/v1/public/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

### Book a Ride

```bash
curl -X POST http://localhost:8080/api/v1/rides/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "pickupLocation": "Manila Bay",
    "dropoffLocation": "SM Mall of Asia",
    "vehicleType": "car"
  }'
```

## Project Features

### ✅ Implemented
- [x] Backend API with all endpoints
- [x] Database models and migrations
- [x] User authentication (JWT)
- [x] Ride booking (Pasundo)
- [x] Delivery service (Pasugo)
- [x] Food & store orders
- [x] Ride sharing (Pasabay)
- [x] Driver dashboard
- [x] Admin dashboard
- [x] Web app (responsive)
- [x] Mobile app (React Native)
- [x] Real-time tracking (WebSocket ready)
- [x] Payment methods
- [x] Promo codes
- [x] Rating system
- [x] Chat system

### 🚀 Coming Soon
- Real-time map tracking
- Payment gateway integration
- Push notifications
- Email notifications
- SMS notifications
- Advanced analytics
- Machine learning for ride matching

## Configuration Files

### Backend Configuration
- `.env` - Environment variables
- `config/config.go` - Configuration loader
- `go.mod` - Go dependencies

### Frontend Configuration
- `vite.config.ts` - Vite build configuration
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.js` - Tailwind CSS (Web & Admin)
- `package.json` - NPM dependencies

## Database Models

The system includes the following entities:
- Users
- Drivers
- Rides
- Ride Shares
- Deliveries
- Stores
- Menu Items
- Orders
- Payment Methods
- Promos
- Chat Messages
- Notifications

## API Documentation

Complete API documentation is available in the README.md file.

Key endpoints:
- `/api/v1/rides/*` - Ride management
- `/api/v1/deliveries/*` - Delivery management
- `/api/v1/orders/*` - Order management
- `/api/v1/stores/*` - Store information
- `/api/v1/driver/*` - Driver operations
- `/api/v1/admin/*` - Admin operations

## WebSocket Endpoints

Real-time features use WebSocket:
- `ws://localhost:8080/ws/tracking/:rideId` - Ride tracking
- `ws://localhost:8080/ws/driver/:driverId` - Driver location

## Troubleshooting

### Backend won't start
```bash
# Check if port 8080 is in use
lsof -i :8080

# Kill the process if needed
kill -9 <PID>
```

### Database connection error
```bash
# Verify PostgreSQL is running
sudo service postgresql status

# Check connection credentials in .env
# Test connection:
psql -h localhost -U omji_user -d omji_db
```

### Web app not loading
```bash
# Clear cache
rm -rf node_modules
npm install

# Check if port 3000 is available
lsof -i :3000
```

## Performance Tips

1. Enable caching on backend
2. Use database indexes
3. Implement pagination for large lists
4. Use CDN for static assets
5. Enable compression on API responses
6. Use lazy loading in React components

## Security Checklist

- [ ] Change JWT_SECRET in production
- [ ] Use environment variables for all secrets
- [ ] Enable HTTPS/SSL
- [ ] Implement rate limiting
- [ ] Add request validation
- [ ] Use strong database passwords
- [ ] Enable CORS only for trusted domains
- [ ] Implement input sanitization

## Monitoring & Logging

To enable monitoring:
1. Set up error tracking (Sentry, etc.)
2. Configure logging (Winston, Pino, etc.)
3. Monitor database performance
4. Set up API monitoring
5. Enable real-time alerts

## Production Deployment

### Using Docker

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Manual Deployment

1. Deploy backend to a VPS (Heroku, DigitalOcean, AWS)
2. Deploy web app to Vercel or Netlify
3. Deploy admin to same as web app
4. Set up database backups
5. Configure CDN
6. Set up monitoring and logging
7. Enable SSL certificates

## Support

For issues or questions:
1. Check the README.md
2. Review API documentation
3. Check error logs
4. Open an issue on GitHub

Happy developing! 🚀
