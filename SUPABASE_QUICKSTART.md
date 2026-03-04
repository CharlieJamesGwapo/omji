# 🚀 SUPABASE QUICK SETUP - OMJI

You're logged into Supabase! Here's what to do next:

---

## ✅ STEP 1: COMPLETE CLI LOGIN

1. **Enter verification code in your terminal**: `dd72e1e6`
2. Press Enter
3. You'll see: "Logged in successfully"

---

## 📋 STEP 2: GET YOUR DATABASE CONNECTION STRING

### Option A: From Supabase Dashboard (Easiest)

1. Go to https://app.supabase.com
2. Click on your project: `omji-database`
3. Go to **Settings** (⚙️ icon in sidebar)
4. Click **"Database"**
5. Scroll to **"Connection string"** section
6. Select **"URI"** tab
7. Copy the connection string (looks like):
   ```
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
8. **IMPORTANT**: Replace `[YOUR-PASSWORD]` with your actual database password

### Option B: Using CLI

```bash
# Get project details
supabase projects list

# Get database connection info
supabase db remote show
```

---

## 🔧 STEP 3: CONFIGURE BACKEND

Create `.env` file in backend folder:

```bash
cd /Users/dev3/omji/backend

cat > .env <<'ENVFILE'
# Supabase Database Connection
DATABASE_URL=postgresql://postgres.xxxxx:your-password@aws-0-region.pooler.supabase.com:6543/postgres

# Server
PORT=8080
GIN_MODE=debug

# JWT Secret
JWT_SECRET=super-secret-change-this-in-production

# CORS
ALLOWED_ORIGINS=*
ENVFILE
```

**Then edit `.env` and paste your actual DATABASE_URL!**

---

## 🚀 STEP 4: TEST CONNECTION

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

---

## 🎯 STEP 5: VERIFY TABLES CREATED

Go to Supabase Dashboard:
1. Click **"Table Editor"** in sidebar
2. You should see all tables:
   - users
   - deliveries
   - rides
   - drivers
   - stores
   - orders
   - etc.

---

## ✨ YOU'RE DONE!

Your backend is now connected to Supabase!

**Test it:**
```bash
curl http://localhost:8080/health
```

Expected: `{"status":"OMJI Backend is running!"}`

---

## 🔐 IMPORTANT: SECURITY

Add `.env` to `.gitignore`:

```bash
echo "backend/.env" >> .gitignore
echo "backend/.env.local" >> .gitignore
```

**NEVER** commit your `.env` file with real credentials!

---

## 📱 NEXT: DEPLOY TO PRODUCTION

Once local development works:

1. **Deploy Backend to Render**
   - Add DATABASE_URL as environment variable
   - Use your Supabase connection string

2. **Deploy Admin to Vercel**
   - Add VITE_API_URL pointing to Render

3. **Build Mobile App with Expo**
   - Update production API URL
   - Build APK

See `DEPLOYMENT_GUIDE_COMPLETE.md` for full instructions!

---

## 🆘 TROUBLESHOOTING

### Can't connect to database

**Error**: `dial tcp: lookup ... no such host`

**Fix**: 
- Check DATABASE_URL is correct
- Ensure password is replaced
- Use the **Pooler** connection (port 6543, not 5432)

### Tables not created

**Solution**: 
- Check migrations ran (look for "✅ Database migrations completed")
- Or manually run SQL in Supabase SQL Editor

### Connection timeout

**Fix**:
- Check Supabase project is active (not paused)
- Verify internet connection
- Try restarting backend

---

**Happy coding! 🎉**
