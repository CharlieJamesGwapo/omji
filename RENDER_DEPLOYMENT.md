# Deploy OMJI Backend to Render

## Step-by-Step Render Deployment Guide

### 1. Go to Render Dashboard
- Visit: https://render.com
- Sign up or log in (you can use your GitHub account)

### 2. Create New Web Service

Click **"New +"** button → Select **"Web Service"**

### 3. Connect GitHub Repository

- Click **"Connect account"** to link your GitHub
- Select **"CharlieJamesGwapo/omji"** repository
- Click **"Connect"**

### 4. Configure Web Service

Fill in these exact settings:

#### Basic Settings:
- **Name**: `omji-backend`
- **Region**: Singapore (closest to Philippines) or any other region
- **Branch**: `main`
- **Root Directory**: `backend`
- **Runtime**: `Go`
- **Build Command**:
  ```
  go build -o bin/server cmd/main.go
  ```
- **Start Command**:
  ```
  ./bin/server
  ```

#### Instance Type:
- Select **"Free"** (or paid plan if you prefer)

### 5. Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add these exact variables:

```
DATABASE_URL = postgresql://postgres:Bboy110422@!@db.wvpgtoszqnpwqdmtrusm.supabase.co:5432/postgres

PORT = 8080

GIN_MODE = release

JWT_SECRET = omji-super-secret-jwt-key-2024-change-in-production

ALLOWED_ORIGINS = *
```

⚠️ **IMPORTANT**: Copy these exactly, including the password with special characters!

### 6. Deploy

- Click **"Create Web Service"**
- Render will now:
  1. Clone your repository
  2. Install Go dependencies
  3. Build your backend
  4. Start the server
  5. Assign a public URL

### 7. Wait for Deployment

You'll see build logs in real-time. Wait for:
```
==> Your service is live 🎉
```

### 8. Get Your Backend URL

After successful deployment, you'll get a URL like:
```
https://omji-backend.onrender.com
```

**Copy this URL** - you'll need it for:
- Admin dashboard configuration
- Mobile app configuration

### 9. Test Your Backend

Once deployed, test the health endpoint:

```bash
curl https://omji-backend.onrender.com/health
```

You should see:
```json
{
  "database": "connected",
  "status": "healthy",
  "timestamp": "2026-03-05T..."
}
```

### 10. Test Authentication

Test user registration:
```bash
curl -X POST https://omji-backend.onrender.com/api/v1/public/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@omji.com",
    "phone": "09123456789",
    "password": "test123"
  }'
```

## Troubleshooting

### Build Fails
- Check that `backend/` directory exists in your repository
- Verify `go.mod` and `go.sum` are present
- Check build logs for specific errors

### Database Connection Fails
- Verify DATABASE_URL is exactly correct
- Check Supabase is allowing connections
- Password must include special characters: `Bboy110422@!`

### Service Won't Start
- Check PORT is set to 8080
- Verify `cmd/main.go` exists
- Review start command logs

## Free Tier Limitations

⚠️ **Render Free Tier**:
- Service spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- 750 hours/month free
- Good for testing, upgrade for production

## Next Steps After Deployment

Once you see "Your service is live":

1. ✅ Copy your backend URL
2. ⏳ Update admin dashboard to use production API
3. ⏳ Update mobile app to use production API
4. ⏳ Deploy admin to Vercel
5. ⏳ Build mobile app with Expo

---

## Quick Reference

**Repository**: https://github.com/CharlieJamesGwapo/omji
**Backend Directory**: `backend/`
**Build Command**: `go build -o bin/server cmd/main.go`
**Start Command**: `./bin/server`
**Port**: 8080
**Database**: Supabase PostgreSQL

Good luck! 🚀
