# OMJI Architecture

## System Overview

OMJI is a comprehensive multi-service platform built with modern technologies for scalability and performance.

```
┌─────────────────────────────────────────────────────────────┐
│                     OMJI Platform                           │
└─────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
    ┌──────────┐         ┌──────────┐        ┌──────────┐
    │  Mobile  │         │   Web    │        │  Admin   │
    │(React-   │         │(React +  │        │(React +  │
    │ Native)  │         │Tailwind) │        │Recharts) │
    │ Expo     │         │          │        │          │
    └──────────┘         └──────────┘        └──────────┘
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Axios HTTP Client  │
                    │   JWT Authentication │
                    │   Token Management   │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
    ┌──────────────────────────────────────────────────────┐
    │         Go Backend API Server (Gin)                  │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  Handlers (Routes & Controllers)               │  │
    │  │  - Auth (Register, Login, OTP)                │  │
    │  │  - Rides (Pasundo)                            │  │
    │  │  - Deliveries (Pasugo)                        │  │
    │  │  - Orders (Food & Stores)                     │  │
    │  │  - Ride Sharing (Pasabay)                     │  │
    │  │  - Driver Management                          │  │
    │  │  - Admin Operations                           │  │
    │  └────────────────────────────────────────────────┘  │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  Middleware                                    │  │
    │  │  - JWT Authentication                         │  │
    │  │  - CORS Headers                               │  │
    │  │  - Admin Authorization                        │  │
    │  └────────────────────────────────────────────────┘  │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  Services (Business Logic)                     │  │
    │  │  - Fare Calculation                           │  │
    │  │  - User Management                            │  │
    │  │  - Driver Matching                            │  │
    │  │  - Promo Application                          │  │
    │  └────────────────────────────────────────────────┘  │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  WebSocket Support                            │  │
    │  │  - Real-time Driver Tracking                  │  │
    │  │  - Live Ride Status Updates                   │  │
    │  │  - Chat Messages                              │  │
    │  └────────────────────────────────────────────────┘  │
    └──────────────────┬───────────────────────────────────┘
                       │
                       ▼
    ┌──────────────────────────────────────────────────────┐
    │         PostgreSQL Database                          │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  Tables:                                       │  │
    │  │  - users, drivers, saved_addresses            │  │
    │  │  - rides, rideshares, deliveries              │  │
    │  │  - stores, menu_items, orders                 │  │
    │  │  - payment_methods, promos                     │  │
    │  │  - chat_messages, notifications               │  │
    │  └────────────────────────────────────────────────┘  │
    └──────────────────────────────────────────────────────┘
```

## Component Architecture

### Backend (Go)
- **Gin Framework**: High-performance HTTP server
- **GORM**: Object-Relational Mapping for database
- **PostgreSQL**: Relational database
- **JWT**: Stateless authentication
- **WebSocket**: Real-time communication
- **Gorilla WebSocket**: WebSocket library

### Frontend (React Native)
- **React Navigation**: Navigation between screens
- **Expo**: Cross-platform development
- **Axios**: HTTP requests
- **AsyncStorage**: Local data persistence
- **React Native Maps**: Map display
- **Socket.io Client**: Real-time updates

### Web App (React)
- **React Router**: Client-side routing
- **Tailwind CSS**: Utility-first styling
- **Zustand**: Simple state management
- **Axios**: HTTP requests
- **Vite**: Fast build tool
- **react-hot-toast**: Toast notifications

### Admin Dashboard
- **Recharts**: Analytics charts
- **Tailwind CSS**: Responsive design
- **Zustand**: State management
- **Axios**: API integration

## Data Flow

### Ride Booking Flow

```
┌──────────────┐
│ User App     │
│ Input Ride   │
│ Request      │
└────────┬─────┘
         │
         ▼
┌──────────────────────────────────────┐
│ POST /api/v1/rides/create            │
│ - pickup_location                    │
│ - dropoff_location                   │
│ - vehicle_type                       │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Backend Handler                      │
│ 1. Validate input                    │
│ 2. Calculate distance & fare         │
│ 3. Find available drivers            │
│ 4. Create ride record                │
│ 5. Send notifications to drivers     │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Database                             │
│ - Save ride                          │
│ - Create notification                │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ WebSocket Broadcast                  │
│ - Notify drivers                     │
│ - Return ride ID to user             │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ Driver App                           │
│ - Receive notification               │
│ - Accept/Reject ride                 │
│ - Update status in real-time         │
└──────────────────────────────────────┘
```

## Authentication Flow

```
┌──────────────────────────────┐
│ User Login Form              │
│ - Email: user@example.com    │
│ - Password: ****             │
└───────────┬──────────────────┘
            │
            ▼
┌──────────────────────────────────────────────┐
│ POST /api/v1/public/auth/login               │
│ 1. Hash password                             │
│ 2. Find user in database                     │
│ 3. Compare passwords                         │
│ 4. Generate JWT token                        │
│ 5. Return token + user info                  │
└───────────┬──────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────┐
│ Client Storage                               │
│ - Save token in AsyncStorage (mobile)        │
│ - Save token in localStorage (web)           │
│ - Save user info                             │
└───────────┬──────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────┐
│ Protected API Requests                       │
│ Headers: { Authorization: Bearer <token> }   │
│ - Verified by middleware                     │
│ - JWT decoded to get user ID                 │
│ - Request proceeds if valid                  │
└──────────────────────────────────────────────┘
```

## Database Schema Relationships

```
users (1) ──────► (n) rides
         └────────► (n) deliveries
         └────────► (n) orders
         └────────► (n) payment_methods
         └────────► (n) saved_addresses
         └────────► (n) chat_messages

drivers (1) ──────► (n) rides
         └────────► (n) deliveries

stores (1) ──────► (n) menu_items
        └────────► (n) orders

promos (1) ──────► (n) rides
       └────────► (n) deliveries
       └────────► (n) orders
```

## Deployment Architecture

```
┌──────────────────────────────────────────────────┐
│  Load Balancer (Nginx, HAProxy)                  │
└───────────────────────┬──────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Backend 1   │ │ Backend 2   │ │ Backend 3   │
│ (Go Server) │ │ (Go Server) │ │ (Go Server) │
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       │               │               │
       └───────────────┼───────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │  PostgreSQL Database Cluster │
        │  (Primary + Replicas)        │
        │  With Backups                │
        └──────────────────────────────┘

Frontend Deployment (CDN):
        ↓
  Vercel / Netlify
  (Web App + Admin)
```

## Performance Considerations

1. **Database**: Indexes on frequently queried columns
2. **Caching**: Redis for session management
3. **API**: Rate limiting per user/IP
4. **WebSocket**: Connection pooling
5. **Mobile**: Image optimization, lazy loading
6. **Web**: Code splitting, lazy routes

## Security Layers

1. **Transport**: HTTPS/TLS encryption
2. **Authentication**: JWT tokens with expiration
3. **Authorization**: Role-based access control
4. **Input**: Validation and sanitization
5. **Database**: Parameterized queries (GORM)
6. **Headers**: CORS, CSP, X-Frame-Options

## Scaling Strategy

### Horizontal Scaling
- Multiple backend servers behind load balancer
- Database read replicas
- Cache layer (Redis)

### Vertical Scaling
- Increase server resources
- Database optimization
- Query optimization

### Database Scaling
- Replication for read queries
- Sharding for large datasets
- Archive old data

## Monitoring & Logging

```
Application Logs → Log Aggregator (ELK/Datadog)
Metrics → Prometheus → Grafana
Errors → Sentry
Uptime → StatusCake/UptimeRobot
```

## Future Enhancements

1. Microservices architecture
2. Message queue (RabbitMQ/Kafka)
3. AI for ride matching
4. Blockchain for transparency
5. 3D maps and AR features
6. Machine learning predictions
