# 🗄️ OMJI - SUPABASE DATABASE SETUP GUIDE

This guide will help you set up Supabase as your database for the OMJI platform.

---

## 📋 WHAT IS SUPABASE?

Supabase is an open-source Firebase alternative that provides:
- **PostgreSQL Database** (free tier available)
- **Auto-generated REST API**
- **Real-time subscriptions**
- **Authentication** (optional - we're using our own)
- **File storage** (for photos)
- **Free tier**: 500MB database, unlimited API requests

---

## 🚀 STEP-BY-STEP SETUP

### Step 1: Create Supabase Account

1. Go to https://supabase.com
2. Click **"Start your project"**
3. Sign up with GitHub (recommended) or email
4. Verify your email

### Step 2: Create New Project

1. Click **"New Project"**
2. Fill in:
   - **Name**: `omji-database`
   - **Database Password**: Create a strong password (SAVE THIS!)
   - **Region**: Choose closest to your users (e.g., Southeast Asia)
   - **Pricing Plan**: Free
3. Click **"Create new project"**
4. Wait 2-3 minutes for setup to complete

### Step 3: Get Database Connection Details

1. In your Supabase project dashboard, click **"Settings"** (gear icon)
2. Click **"Database"** in the sidebar
3. Scroll to **"Connection string"**
4. Copy the **"URI"** connection string
5. It looks like: `postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres`

**IMPORTANT**: Replace `[YOUR-PASSWORD]` with the password you created in Step 2

---

## 🔧 CONFIGURE BACKEND FOR SUPABASE

### Update Backend Environment Variables

Edit `/Users/dev3/omji/backend/.env`:

```bash
# Supabase Database Connection
DATABASE_URL=postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres

# Server Configuration
PORT=8080
GIN_MODE=debug

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-change-this

# CORS
ALLOWED_ORIGINS=*
```

**Replace**:
- `[project-ref]` with your project reference
- `[YOUR-PASSWORD]` with your database password
- `[region]` with your region (e.g., ap-southeast-1)

---

## 📊 CREATE DATABASE TABLES

### Option 1: Using Supabase SQL Editor (Recommended)

1. In Supabase Dashboard, click **"SQL Editor"**
2. Click **"New Query"**
3. Copy and paste the SQL below
4. Click **"Run"**

### Option 2: Using Backend Auto-Migration

Your backend already has GORM auto-migration. Just run:

```bash
cd /Users/dev3/omji/backend
go run cmd/main.go
```

The tables will be created automatically!

---

## 📝 SUPABASE SQL SCHEMA (If needed)

If you want to manually create tables, use this SQL:

```sql
-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    password TEXT,
    profile_image TEXT,
    otp_code TEXT,
    otp_expiry TIMESTAMPTZ,
    is_verified BOOLEAN DEFAULT FALSE,
    role TEXT DEFAULT 'user',
    rating NUMERIC DEFAULT 5,
    total_ratings INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deliveries Table
CREATE TABLE IF NOT EXISTS deliveries (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    driver_id BIGINT,
    pickup_location TEXT,
    pickup_latitude NUMERIC,
    pickup_longitude NUMERIC,
    dropoff_location TEXT,
    dropoff_latitude NUMERIC,
    dropoff_longitude NUMERIC,
    item_description TEXT,
    item_photo TEXT,
    notes TEXT,
    weight NUMERIC,
    distance NUMERIC,
    delivery_fee NUMERIC,
    tip NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'pending',
    barcode_number TEXT,
    promo_id BIGINT,
    scheduled_for TIMESTAMPTZ,
    user_rating NUMERIC,
    driver_rating NUMERIC,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rides Table
CREATE TABLE IF NOT EXISTS rides (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    driver_id BIGINT,
    pickup_location TEXT,
    pickup_latitude NUMERIC,
    pickup_longitude NUMERIC,
    dropoff_location TEXT,
    dropoff_latitude NUMERIC,
    dropoff_longitude NUMERIC,
    distance NUMERIC,
    estimated_fare NUMERIC,
    final_fare NUMERIC,
    status TEXT DEFAULT 'pending',
    vehicle_type TEXT,
    promo_id BIGINT,
    user_rating NUMERIC,
    user_review TEXT,
    driver_rating NUMERIC,
    driver_review TEXT,
    scheduled_for TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drivers Table
CREATE TABLE IF NOT EXISTS drivers (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT UNIQUE REFERENCES users(id),
    vehicle_type TEXT,
    vehicle_model TEXT,
    vehicle_plate TEXT UNIQUE,
    license_number TEXT UNIQUE,
    is_verified BOOLEAN DEFAULT FALSE,
    is_available BOOLEAN DEFAULT FALSE,
    current_latitude NUMERIC,
    current_longitude NUMERIC,
    total_earnings NUMERIC DEFAULT 0,
    completed_rides INTEGER DEFAULT 0,
    rating NUMERIC DEFAULT 5,
    total_ratings INTEGER DEFAULT 0,
    documents JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stores Table
CREATE TABLE IF NOT EXISTS stores (
    id BIGSERIAL PRIMARY KEY,
    name TEXT,
    category TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    address TEXT,
    phone TEXT,
    description TEXT,
    logo TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    rating NUMERIC DEFAULT 5,
    total_ratings INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    store_id BIGINT REFERENCES stores(id),
    items JSONB,
    subtotal NUMERIC,
    delivery_fee NUMERIC,
    tax NUMERIC,
    total_amount NUMERIC,
    promo_id BIGINT,
    status TEXT DEFAULT 'pending',
    delivery_location TEXT,
    delivery_latitude NUMERIC,
    delivery_longitude NUMERIC,
    payment_method TEXT,
    user_rating NUMERIC,
    store_rating NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Other supporting tables...
CREATE TABLE IF NOT EXISTS saved_addresses (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    label TEXT,
    address TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_methods (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    type TEXT,
    token TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promos (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE,
    description TEXT,
    discount_type TEXT,
    discount_value NUMERIC,
    min_amount NUMERIC,
    max_discount NUMERIC,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    usage_limit INTEGER,
    times_used INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    ride_id BIGINT,
    sender_id BIGINT REFERENCES users(id),
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    title TEXT,
    message TEXT,
    type TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## ✅ TEST YOUR CONNECTION

### Method 1: Run Backend Locally

```bash
cd /Users/dev3/omji/backend
go run cmd/main.go
```

You should see:
```
✅ Database connected successfully
✅ Database migrations completed
🚀 OMJI Backend starting on port 8080
```

### Method 2: Test API

```bash
curl http://localhost:8080/health
```

Should return: `{"status":"OMJI Backend is running!"}`

### Method 3: Check Supabase Dashboard

1. Go to Supabase Dashboard
2. Click **"Table Editor"**
3. You should see all your tables created

---

## 🌐 DEPLOYMENT CONFIGURATION

### For Render Deployment

When deploying to Render, add this environment variable:

```
DATABASE_URL=postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
```

### For Local Development

Create `/Users/dev3/omji/backend/.env`:

```bash
DATABASE_URL=postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
PORT=8080
GIN_MODE=debug
JWT_SECRET=local-dev-secret
ALLOWED_ORIGINS=*
```

---

## 📸 BONUS: Use Supabase Storage for Photos

Supabase also provides file storage! You can store delivery photos there:

### Enable Storage

1. In Supabase Dashboard, click **"Storage"**
2. Click **"Create a new bucket"**
3. Name it: `delivery-photos`
4. Set as **Public** (or Private if you want authentication)
5. Click **"Create bucket"**

### Get Storage URL

Your storage URL will be:
```
https://[project-ref].supabase.co/storage/v1/object/public/delivery-photos/
```

### Update Backend to Upload Photos

You can later update your backend to upload base64 photos to Supabase Storage instead of storing them directly in the database.

---

## 🔐 SECURITY BEST PRACTICES

1. **Never commit your `.env` file** - Add it to `.gitignore`
2. **Use strong database password** - At least 16 characters
3. **Rotate JWT_SECRET** - Change it for production
4. **Enable Row Level Security** (RLS) in Supabase for extra protection
5. **Monitor usage** - Check Supabase dashboard regularly

---

## 📊 SUPABASE FREE TIER LIMITS

- **Database**: 500 MB
- **File Storage**: 1 GB
- **Bandwidth**: 2 GB/month
- **API Requests**: Unlimited
- **Realtime Connections**: 200 concurrent

Perfect for development and small to medium apps!

---

## 🆘 TROUBLESHOOTING

### Problem: "Connection refused"

**Solution**: Check your DATABASE_URL is correct. Make sure you:
- Replaced `[YOUR-PASSWORD]` with actual password
- Copied the entire connection string
- Used the **Pooler** connection string (port 6543)

### Problem: "SSL required"

**Solution**: Add `?sslmode=require` to your DATABASE_URL:
```
DATABASE_URL=postgresql://...postgres?sslmode=require
```

### Problem: Tables not created

**Solution**: 
1. Run backend with auto-migration
2. Or manually run SQL in Supabase SQL Editor

---

## 🎉 YOU'RE DONE!

Your OMJI platform is now using Supabase as the database!

**Benefits**:
- ✅ Free PostgreSQL database
- ✅ Auto-scaling
- ✅ Automatic backups
- ✅ Web dashboard for data management
- ✅ No credit card required
- ✅ Easy to deploy anywhere

**Next Steps**:
1. Test registration and login
2. Create some deliveries
3. Check data in Supabase dashboard
4. Deploy to Render/Vercel
5. Launch your app!

---

## 📚 RESOURCES

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Database Guide](https://supabase.com/docs/guides/database)
- [Supabase Storage Guide](https://supabase.com/docs/guides/storage)
- [PostgreSQL Connection Strings](https://supabase.com/docs/guides/database/connecting-to-postgres)

**Happy Coding! 🚀**
