-- OMJI Platform - Supabase Tables Creation Script
-- Run this in Supabase SQL Editor if tables don't appear

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

-- Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
    id BIGSERIAL PRIMARY KEY,
    store_id BIGINT REFERENCES stores(id),
    name TEXT,
    price NUMERIC,
    image TEXT,
    category TEXT,
    available BOOLEAN DEFAULT TRUE,
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

-- Saved Addresses Table
CREATE TABLE IF NOT EXISTS saved_addresses (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    label TEXT,
    address TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Methods Table
CREATE TABLE IF NOT EXISTS payment_methods (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    type TEXT,
    token TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Promos Table
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

-- Ride Share Table
CREATE TABLE IF NOT EXISTS ride_shares (
    id BIGSERIAL PRIMARY KEY,
    driver_id BIGINT,
    pickup_location TEXT,
    pickup_latitude NUMERIC,
    pickup_longitude NUMERIC,
    dropoff_location TEXT,
    dropoff_latitude NUMERIC,
    dropoff_longitude NUMERIC,
    total_seats INTEGER,
    available_seats INTEGER,
    base_fare NUMERIC,
    status TEXT DEFAULT 'active',
    departure_time TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ride Share Passengers Table
CREATE TABLE IF NOT EXISTS rideshare_passengers (
    id BIGSERIAL PRIMARY KEY,
    rideshare_id BIGINT,
    user_id BIGINT REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    ride_id BIGINT,
    sender_id BIGINT REFERENCES users(id),
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    title TEXT,
    message TEXT,
    type TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Success message
SELECT 'All tables created successfully!' as status;
