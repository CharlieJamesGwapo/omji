# Deploy OMJI Admin Dashboard to Vercel

## Prerequisites

Before starting, make sure you have:
- ✅ Code pushed to GitHub: https://github.com/CharlieJamesGwapo/omji
- ✅ Backend deployed to Render (get the URL first)

## Step-by-Step Vercel Deployment Guide

### 1. Go to Vercel Dashboard
- Visit: https://vercel.com
- Click **"Sign Up"** or **"Login"**
- Choose **"Continue with GitHub"** for easy integration

### 2. Import Your Project

- Click **"Add New..."** → **"Project"**
- Click **"Import Git Repository"**
- Find **"CharlieJamesGwapo/omji"** in the list
- Click **"Import"**

### 3. Configure Project

#### Framework Preset:
- Select **"Vite"**

#### Root Directory:
- Click **"Edit"**
- Set to: `admin`

#### Build Settings:
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### 4. Add Environment Variables

Click **"Environment Variables"** and add:

**Variable Name**: `VITE_API_URL`
**Value**: `https://omji-backend.onrender.com/api/v1`

⚠️ **IMPORTANT**: 
- Replace `omji-backend.onrender.com` with your actual Render backend URL
- Don't add quotes around the URL
- Make sure it ends with `/api/v1`

### 5. Deploy

- Click **"Deploy"**
- Vercel will now:
  1. Clone your repository
  2. Install dependencies (npm install)
  3. Build the admin dashboard (npm run build)
  4. Deploy to global CDN
  5. Assign a public URL

### 6. Wait for Build

You'll see build logs. Wait for:
```
✓ Build completed
🎉 Deployed to production
```

### 7. Get Your Admin Dashboard URL

After deployment, you'll get a URL like:
```
https://omji.vercel.app
```

Or:
```
https://omji-charlie.vercel.app
```

**This is your live admin dashboard!**

### 8. Test Your Admin Dashboard

1. Open the Vercel URL in your browser
2. You should see the OMJI Admin login page
3. Try logging in with:
   - Email: `admin`
   - Password: `admin123`

If login works, you'll see the dashboard with analytics!

### 9. Configure Custom Domain (Optional)

If you have a custom domain:

1. Go to your project settings
2. Click **"Domains"**
3. Add your domain (e.g., `admin.omji.com`)
4. Follow Vercel's DNS configuration instructions

## Update Backend URL (If Needed)

If you need to change the backend URL after deployment:

1. Go to your Vercel project
2. Click **"Settings"** → **"Environment Variables"**
3. Edit `VITE_API_URL`
4. Click **"Save"**
5. Go to **"Deployments"** tab
6. Click **"..."** on latest deployment → **"Redeploy"**

## Troubleshooting

### Build Fails with "Module not found"
- Make sure root directory is set to `admin`
- Check that `package.json` exists in `admin/` folder
- Verify all dependencies are in `package.json`

### Blank Page After Deployment
- Check browser console for errors
- Verify `VITE_API_URL` is set correctly
- Make sure backend is deployed and running
- Check that `vercel.json` redirects are working

### Login Fails
- Test backend health: `curl https://omji-backend.onrender.com/health`
- Check CORS settings on backend (ALLOWED_ORIGINS)
- Verify JWT_SECRET is set on Render
- Check browser Network tab for API errors

### Environment Variable Not Working
- Vite requires variables to start with `VITE_`
- Must redeploy after changing environment variables
- Variables are embedded at build time, not runtime

## Free Tier Limitations

✅ **Vercel Free Tier**:
- Unlimited deployments
- Automatic HTTPS
- Global CDN
- 100GB bandwidth/month
- Perfect for admin dashboard!

## Quick Reference

**Repository**: https://github.com/CharlieJamesGwapo/omji
**Root Directory**: `admin/`
**Framework**: Vite
**Build Command**: `npm run build`
**Output Directory**: `dist`
**Environment Variable**: `VITE_API_URL=https://omji-backend.onrender.com/api/v1`

## After Successful Deployment

✅ **You'll have**:
- Live admin dashboard URL
- Automatic HTTPS
- Auto-deploy on git push
- Global CDN delivery

🎉 **Admin dashboard is now live!**

---

## Next Steps

After Vercel deployment:

1. ✅ Test admin login
2. ✅ Verify dashboard loads data from backend
3. ⏳ Build mobile app with Expo
4. ⏳ Test entire system end-to-end

Good luck! 🚀
