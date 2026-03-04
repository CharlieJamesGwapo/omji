# 🚀 OMJI COMPLETE DEPLOYMENT GUIDE
## Deploy to: Vercel (Admin) + Render (Backend) + Expo (Mobile)
## Database: Supabase PostgreSQL

---

## 📋 WHAT YOU'LL DEPLOY

1. **Backend API** → Render (Free tier)
2. **Admin Dashboard** → Vercel (Free tier)
3. **Mobile App** → Expo (Free tier)
4. **Database** → Supabase (Free tier)

**Total Cost: $0 (All free tiers!)**

---

## 🎯 STEP 1: SETUP SUPABASE DATABASE (15 minutes)

### 1.1 Create Supabase Account

1. Go to https://supabase.com
2. Click **"Start your project"** → Sign up with GitHub
3. Verify your email

### 1.2 Create New Project

1. Click **"New Project"**
2. Fill in:
   - **Organization**: Create new or select existing
   - **Name**: `omji-database`
   - **Database Password**: Create strong password (SAVE THIS!)
   - **Region**: Southeast Asia (or closest to you)
   - **Pricing Plan**: Free
3. Click **"Create new project"**
4. ⏳ Wait 2-3 minutes for database setup

### 1.3 Get Database Connection String

1. Go to **Project Settings** (⚙️ icon)
2. Click **"Database"** in sidebar
3. Scroll to **"Connection string"** section
4. Select **"URI"** tab
5. Copy the connection string (looks like):
   ```
   postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```
6. **Replace `[YOUR-PASSWORD]`** with the password you created
7. **SAVE THIS STRING** - you'll need it!

### 1.4 Initialize Database Tables

**Option A: Auto-Migration (Recommended)**
- Your backend will auto-create tables on first run
- No manual SQL needed!

**Option B: Manual SQL (If needed)**
1. In Supabase, click **"SQL Editor"**
2. Click **"New query"**
3. Copy SQL from `SUPABASE_SETUP.md`
4. Click **"Run"**

✅ **Supabase is ready!**

---

## 🎯 STEP 2: DEPLOY BACKEND TO RENDER (20 minutes)

### 2.1 Prepare Code for GitHub

```bash
cd /Users/dev3/omji

# Create .gitignore if not exists
cat > .gitignore <<'EOF'
# Backend
backend/.env
backend/bin/
backend/tmp/

# Admin
admin/.env
admin/.env.local
admin/.env.production
admin/dist/
admin/node_modules/

# Mobile
mobile/.env
mobile/.expo/
mobile/node_modules/
mobile/.expo-shared/

# General
.DS_Store
*.log
EOF

# Initialize git
git init
git add .
git commit -m "Initial commit - OMJI Platform"
```

### 2.2 Push to GitHub

1. Go to https://github.com/new
2. Create repository: `omji-platform`
3. **DON'T** initialize with README
4. Copy the commands and run:

```bash
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/omji-platform.git
git push -u origin main
```

### 2.3 Deploy Backend to Render

1. Go to https://dashboard.render.com
2. Sign up/Login with GitHub
3. Click **"New +"** → **"Web Service"**
4. Click **"Connect account"** → Authorize GitHub
5. Select your `omji-platform` repository
6. Configure:

**Basic Settings:**
- **Name**: `omji-backend`
- **Region**: Singapore (or closest)
- **Branch**: `main`
- **Root Directory**: `backend`
- **Runtime**: `Go`
- **Build Command**: `go build -o bin/server cmd/main.go`
- **Start Command**: `./bin/server`

**Advanced Settings - Environment Variables:**

Click "Advanced" and add:

| Key | Value |
|-----|-------|
| `PORT` | `8080` |
| `GIN_MODE` | `release` |
| `DATABASE_URL` | `[Your Supabase connection string]` |
| `JWT_SECRET` | `[Generate with: openssl rand -base64 32]` |
| `ALLOWED_ORIGINS` | `*` |

7. **Instance Type**: Free
8. Click **"Create Web Service"**
9. ⏳ Wait 5-10 minutes for deployment

### 2.4 Get Your Backend URL

After deployment, you'll see:
```
https://omji-backend-xxxx.onrender.com
```

### 2.5 Test Backend

```bash
curl https://your-backend-url.onrender.com/health
```

Expected response:
```json
{"status":"OMJI Backend is running!"}
```

✅ **Backend is live!**

---

## 🎯 STEP 3: DEPLOY ADMIN WEB TO VERCEL (10 minutes)

### 3.1 Install Vercel CLI

```bash
npm install -g vercel
```

### 3.2 Create Production Config

```bash
cd /Users/dev3/omji/admin

# Create production environment file
cat > .env.production <<EOF
VITE_API_URL=https://your-backend-url.onrender.com/api/v1
EOF
```

**Replace** `your-backend-url.onrender.com` with your actual Render URL!

### 3.3 Deploy to Vercel

```bash
cd /Users/dev3/omji/admin
vercel login
vercel --prod
```

Answer prompts:
- **Set up and deploy?** → Yes
- **Which scope?** → Your account
- **Link to existing project?** → No
- **Project name?** → `omji-admin`
- **Directory?** → `./`
- **Override settings?** → No

### 3.4 Get Your Admin URL

After deployment:
```
https://omji-admin.vercel.app
```

### 3.5 Test Admin Dashboard

1. Open `https://omji-admin.vercel.app`
2. Login with admin credentials
3. Check if it connects to backend

✅ **Admin dashboard is live!**

---

## 🎯 STEP 4: DEPLOY MOBILE APP TO EXPO (30 minutes)

### 4.1 Install EAS CLI

```bash
npm install -g eas-cli
```

### 4.2 Login to Expo

```bash
cd /Users/dev3/omji/mobile
eas login
```

Create account at https://expo.dev if you don't have one.

### 4.3 Update Production API URL

Edit `/Users/dev3/omji/mobile/src/config/api.config.ts`:

```typescript
const ENV = {
  dev: {
    apiUrl: 'http://192.168.0.28:8080/api/v1',
  },
  prod: {
    apiUrl: 'https://your-backend-url.onrender.com/api/v1', // YOUR RENDER URL HERE!
  },
};

const getEnvVars = () => {
  if (__DEV__) {
    return ENV.dev;
  }
  return ENV.prod;
};

export default getEnvVars();
```

### 4.4 Update app.json

Edit `/Users/dev3/omji/mobile/app.json` - update the owner:

```json
{
  "expo": {
    "owner": "your-expo-username"
  }
}
```

### 4.5 Initialize EAS Build

```bash
cd /Users/dev3/omji/mobile
eas build:configure
```

This creates a project ID automatically.

### 4.6 Build Android APK

```bash
eas build --platform android --profile production
```

This will:
1. Upload your code to Expo
2. Build APK in the cloud
3. Takes 10-20 minutes
4. Give you a download link

**Copy the project URL** - you'll need it!

### 4.7 Download and Test APK

1. Wait for build to complete
2. Download APK from the link provided
3. Transfer to your Android phone
4. Install and test

### 4.8 (Optional) Build for iOS

**Requires Apple Developer Account ($99/year)**

```bash
eas build --platform ios --profile production
```

✅ **Mobile app is built!**

---

## 🎯 STEP 5: FINAL CONFIGURATION

### 5.1 Update CORS on Backend

If admin can't connect to backend, update Render environment:

```
ALLOWED_ORIGINS=https://omji-admin.vercel.app,*
```

### 5.2 Test Complete Flow

**Mobile App:**
1. Install APK on phone
2. Register new user
3. Book a delivery with photo
4. Book a ride

**Admin Dashboard:**
1. Open `https://omji-admin.vercel.app`
2. Login as admin
3. View users, deliveries, rides
4. Check all data is there

**Database:**
1. Open Supabase Dashboard
2. Click "Table Editor"
3. Check tables have data

✅ **Everything is connected!**

---

## 📊 YOUR DEPLOYMENT URLS

After completing all steps, save these:

```
Backend API:     https://omji-backend-xxxx.onrender.com
Admin Dashboard: https://omji-admin.vercel.app
Mobile App:      [Expo build download link]
Database:        [Supabase project URL]
```

---

## 🔄 UPDATING YOUR APP

### Update Backend

```bash
cd /Users/dev3/omji
git add .
git commit -m "Backend update"
git push
```

Render auto-deploys! ✅

### Update Admin Web

```bash
cd /Users/dev3/omji
git add .
git commit -m "Admin update"
git push
```

Vercel auto-deploys! ✅

### Update Mobile App

**For code changes (JavaScript/UI):**
```bash
cd /Users/dev3/omji/mobile
eas update --branch production --message "Bug fixes"
```

Users get update on next app restart! ✅

**For native changes (dependencies/config):**
```bash
eas build --platform android --profile production
```

Users need to download new APK.

---

## 📱 PUBLISHING TO APP STORES

### Google Play Store

1. **Create Developer Account**: $25 one-time
   - https://play.google.com/console

2. **Build AAB (App Bundle)**:
   ```bash
   eas build --platform android --profile production
   ```

3. **Upload to Play Console**
4. **Fill store listing**
5. **Submit for review** (1-3 days)

### Apple App Store

1. **Enroll in Apple Developer Program**: $99/year
   - https://developer.apple.com

2. **Create App ID**
3. **Build iOS**:
   ```bash
   eas build --platform ios --profile production
   ```

4. **Submit via App Store Connect**
5. **Wait for review** (1-3 days)

---

## 💰 COST BREAKDOWN

| Service | Free Tier | Paid Plans |
|---------|-----------|------------|
| **Supabase** | 500MB DB, 1GB Storage | $25/month |
| **Render** | 750 hours/month | $7/month |
| **Vercel** | 100GB bandwidth | $20/month |
| **Expo** | Unlimited builds | $29/month |

**Total Cost: $0** (Free tiers are enough for development and small apps!)

---

## 🆘 TROUBLESHOOTING

### Backend won't start on Render

**Check:**
- DATABASE_URL is correct in environment variables
- Build logs for errors
- Go version compatibility

**Fix:**
```bash
# Test locally first
cd backend
go run cmd/main.go
```

### Admin can't connect to backend

**Check:**
- VITE_API_URL in Vercel environment
- CORS settings on backend
- Backend is running

**Fix:**
- Update ALLOWED_ORIGINS on Render
- Redeploy Vercel with correct API URL

### Mobile app can't connect

**Check:**
- Production URL in `api.config.ts`
- Backend is accessible from internet
- HTTPS (not HTTP)

**Fix:**
```typescript
// Ensure production URL is correct
prod: {
  apiUrl: 'https://omji-backend-xxxx.onrender.com/api/v1'
}
```

### Database connection fails

**Check:**
- Supabase password is correct
- Connection string format
- Database is active

**Fix:**
- Get fresh connection string from Supabase
- Ensure you replaced [YOUR-PASSWORD]

---

## ✅ DEPLOYMENT CHECKLIST

- [ ] Supabase database created
- [ ] Database connection string saved
- [ ] Code pushed to GitHub
- [ ] Backend deployed to Render
- [ ] Backend health check passes
- [ ] Admin deployed to Vercel
- [ ] Admin connects to backend
- [ ] Mobile app API config updated
- [ ] Android APK built on Expo
- [ ] APK tested on real device
- [ ] All features work end-to-end
- [ ] Admin can see user data
- [ ] Photos are uploading
- [ ] Map locations saving

---

## 🎉 CONGRATULATIONS!

Your OMJI platform is now **LIVE IN PRODUCTION**!

**What you've accomplished:**
✅ Free PostgreSQL database (Supabase)
✅ Backend API running 24/7 (Render)
✅ Admin dashboard accessible worldwide (Vercel)
✅ Mobile app ready to distribute (Expo)
✅ All features fully functional
✅ Zero hosting costs!

**Next Steps:**
1. Share mobile app with test users
2. Gather feedback
3. Fix bugs and improve features
4. Consider publishing to app stores
5. Scale up as you grow!

**Your platform is production-ready! 🚀**

---

## 📚 HELPFUL RESOURCES

- [Supabase Docs](https://supabase.com/docs)
- [Render Docs](https://render.com/docs)
- [Vercel Docs](https://vercel.com/docs)
- [Expo Docs](https://docs.expo.dev)
- [React Native Docs](https://reactnative.dev)

**Need help?** Check the logs:
- **Backend**: Render Dashboard → Logs
- **Admin**: Vercel Dashboard → Deployments → Logs
- **Mobile**: `eas build:list` and `eas update:list`

Good luck with your OMJI platform! 🎊
