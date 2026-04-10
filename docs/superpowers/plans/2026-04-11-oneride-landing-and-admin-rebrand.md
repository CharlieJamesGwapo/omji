# One Ride Landing Page + Admin Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the admin app with the onerider.jpeg logo and create a fully responsive One Ride landing page deployed at one-ride.netlify.app.

**Architecture:** Two independent deliverables — (1) admin branding patch (logo swap + title update + rebuild + redeploy to oneride-balingasag.netlify.app), (2) static HTML/CSS landing page in a new `landing-oneride/` folder deployed to one-ride.netlify.app, mirroring the dark-themed OMJI landing page style but branded for One Ride Balingasag.

**Tech Stack:** React 18 + Tailwind (admin), vanilla HTML/CSS/JS (landing), Netlify CLI for deployment.

---

## Task 1: Admin — Copy logo and update index.html

**Files:**
- Copy: `onerider.jpeg` → `admin/public/onerider.jpeg`
- Modify: `admin/index.html`

- [ ] **Step 1: Copy the logo**

```bash
cp /Users/dev3/omji/onerider.jpeg /Users/dev3/omji/admin/public/onerider.jpeg
```

- [ ] **Step 2: Update admin/index.html title**

Change:
```html
<title>ONE RIDE Admin Dashboard</title>
```
To:
```html
<title>ONE RIDE Balingasag — Admin</title>
```

- [ ] **Step 3: Commit**

```bash
cd /Users/dev3/omji
git add admin/public/onerider.jpeg admin/index.html
git commit -m "chore: add onerider logo and update admin title"
```

---

## Task 2: Admin — Update logo references in App.tsx

**Files:**
- Modify: `admin/src/App.tsx`

Replace all 3 occurrences of `/logo.png` with `/onerider.jpeg` in App.tsx (sidebar brand, mobile top bar).
Also update "Admin Panel" subtitle under logo to "Balingasag".

- [ ] **Step 1: Replace logo src in sidebar brand (line ~106)**

Old:
```tsx
<img src="/logo.png" alt="ONE RIDE" className="w-full h-full object-cover" />
```
New:
```tsx
<img src="/onerider.jpeg" alt="ONE RIDE" className="w-full h-full object-cover" />
```

- [ ] **Step 2: Replace logo src in mobile top bar (line ~266)**

Old:
```tsx
<img src="/logo.png" alt="ONE RIDE" className="w-full h-full object-cover" />
```
New:
```tsx
<img src="/onerider.jpeg" alt="ONE RIDE" className="w-full h-full object-cover" />
```

- [ ] **Step 3: Update sidebar subtitle**

Old:
```tsx
<p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${isDark ? 'text-emerald-400' : 'text-gray-400'}`}>Admin Panel</p>
```
New:
```tsx
<p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${isDark ? 'text-emerald-400' : 'text-gray-400'}`}>Balingasag</p>
```

- [ ] **Step 4: Commit**

```bash
git add admin/src/App.tsx
git commit -m "chore: update sidebar logo to onerider.jpeg, subtitle to Balingasag"
```

---

## Task 3: Admin — Update LoginPage.tsx logo + branding

**Files:**
- Modify: `admin/src/pages/LoginPage.tsx`

- [ ] **Step 1: Replace logo src**

Old:
```tsx
<img src="/logo.png" alt="ONE RIDE" className="w-full h-full object-cover" />
```
New:
```tsx
<img src="/onerider.jpeg" alt="ONE RIDE" className="w-full h-full object-cover" />
```

- [ ] **Step 2: Make logo container larger and remove red bg (logo already has red bg)**

Old:
```tsx
<div className="w-16 h-16 bg-red-600 rounded-xl mx-auto mb-3 flex items-center justify-center overflow-hidden">
```
New:
```tsx
<div className="w-24 h-24 rounded-2xl mx-auto mb-3 flex items-center justify-center overflow-hidden shadow-lg">
```

- [ ] **Step 3: Update login page title text**

Old:
```tsx
<h1 className="text-2xl font-bold text-gray-900">ONE RIDE Admin</h1>
<p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
```
New:
```tsx
<h1 className="text-2xl font-bold text-gray-900">ONE RIDE Balingasag</h1>
<p className="text-gray-500 text-sm mt-1">Admin Portal — Sign in</p>
```

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/LoginPage.tsx
git commit -m "chore: update login page logo size and branding to One Ride Balingasag"
```

---

## Task 4: Admin — Build and redeploy to oneride-balingasag.netlify.app

**Files:**
- Run from: `admin/`

- [ ] **Step 1: Build**

```bash
cd /Users/dev3/omji/admin && npm run build
```
Expected: `✓ built in ~3s` with no TypeScript errors.

- [ ] **Step 2: Deploy to production**

```bash
netlify deploy --prod --dir=dist
```
Expected output includes: `Deployed to production URL: https://oneride-balingasag.netlify.app`

- [ ] **Step 3: Verify**

Open https://oneride-balingasag.netlify.app — confirm onerider.jpeg logo appears in sidebar and login page.

---

## Task 5: Landing page — Create landing-oneride/ directory and HTML

**Files:**
- Create: `landing-oneride/index.html`
- Create: `landing-oneride/netlify.toml`
- Copy: `onerider.jpeg` → `landing-oneride/onerider.jpeg`

This is the main deliverable — a full single-file landing page matching the screenshot style (dark bg, hero with colored heading, services section, how it works, features, app download, footer).

- [ ] **Step 1: Create directory and copy assets**

```bash
mkdir -p /Users/dev3/omji/landing-oneride
cp /Users/dev3/omji/onerider.jpeg /Users/dev3/omji/landing-oneride/onerider.jpeg
```

- [ ] **Step 2: Create netlify.toml**

```toml
[build]
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 3: Create index.html**

Full content below — complete, no placeholders.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ONE RIDE Balingasag — Ride, Deliver & Pasabay</title>
  <meta name="description" content="ONE RIDE is Balingasag's all-in-one app for rides, deliveries, and ride sharing. Download free and experience convenience.">
  <meta property="og:title" content="ONE RIDE Balingasag">
  <meta property="og:description" content="Your all-in-one Ride, Delivery & Pasabay app for Balingasag.">
  <meta property="og:image" content="onerider.jpeg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #0A0806; color: #D4CABC; line-height: 1.6; overflow-x: hidden; }
    a { text-decoration: none; color: inherit; }
    img { max-width: 100%; display: block; }
    ul { list-style: none; }

    :root {
      --primary: #DC2626;
      --primary-dark: #B91C1C;
      --primary-light: #EF4444;
      --primary-glow: rgba(220,38,38,0.3);
      --accent: #F97316;
      --accent-light: #FB923C;
      --accent-glow: rgba(249,115,22,0.3);
      --bg-dark: #0A0806;
      --bg-section: #120D0B;
      --bg-card: #1A1210;
      --bg-card-hover: #241816;
      --text: #D4CABC;
      --text-muted: #7A6E62;
      --text-bright: #FFFFFF;
      --success: #22C55E;
      --gradient-fire: linear-gradient(135deg, var(--accent), var(--primary));
      --gradient-red: linear-gradient(135deg, var(--primary), #7F1D1D);
    }

    /* BANNER */
    .banner {
      background: var(--gradient-fire);
      color: white; text-align: center; padding: 10px 40px 10px 20px;
      font-size: 0.85rem; font-weight: 600; position: relative; overflow: hidden;
    }
    .banner-text { display: inline-block; animation: ticker 20s linear infinite; white-space: nowrap; }
    @keyframes ticker { 0% { transform: translateX(100vw); } 100% { transform: translateX(-100%); } }
    .banner-close {
      position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: white; font-size: 1.3rem; cursor: pointer;
    }

    /* NAVBAR */
    .navbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
      padding: 14px 0; transition: all 0.3s ease;
      background: rgba(10,8,6,0.88); backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
    }
    .navbar.scrolled { box-shadow: 0 1px 30px rgba(249,115,22,0.08); }
    .nav-container {
      max-width: 1200px; margin: 0 auto; padding: 0 24px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .nav-logo { font-size: 1.5rem; font-weight: 900; color: var(--text-bright); display: flex; align-items: center; gap: 10px; }
    .nav-logo img { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; }
    .nav-logo-text span { background: var(--gradient-fire); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .nav-logo-text small { display: block; font-size: 0.5rem; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: var(--text-muted); -webkit-text-fill-color: var(--text-muted); }
    .nav-links { display: flex; align-items: center; gap: 32px; }
    .nav-links a { font-size: 0.9rem; font-weight: 500; color: var(--text); transition: color 0.2s; position: relative; }
    .nav-links a:hover { color: var(--accent-light); }
    .nav-links a::after { content: ''; position: absolute; bottom: -4px; left: 0; width: 0; height: 2px; background: var(--accent); transition: width 0.3s; }
    .nav-links a:hover::after { width: 100%; }
    .nav-cta {
      background: var(--gradient-fire) !important; color: white !important;
      padding: 10px 24px; border-radius: 50px; font-weight: 700 !important;
      box-shadow: 0 2px 15px var(--accent-glow); transition: transform 0.2s, box-shadow 0.2s !important;
    }
    .nav-cta::after { display: none !important; }
    .nav-cta:hover { transform: translateY(-2px); box-shadow: 0 6px 25px var(--accent-glow); }
    .hamburger { display: none; flex-direction: column; gap: 5px; cursor: pointer; background: none; border: none; padding: 5px; }
    .hamburger span { width: 25px; height: 2.5px; background: var(--text-bright); border-radius: 2px; transition: all 0.3s; }
    .hamburger.active span:nth-child(1) { transform: rotate(45deg) translate(5px,5px); }
    .hamburger.active span:nth-child(2) { opacity: 0; }
    .hamburger.active span:nth-child(3) { transform: rotate(-45deg) translate(5px,-5px); }
    .mobile-menu {
      display: none; position: fixed; top: 68px; left: 0; right: 0;
      background: rgba(10,8,6,0.98); backdrop-filter: blur(16px);
      padding: 24px; flex-direction: column; gap: 16px; z-index: 999;
      border-bottom: 1px solid rgba(249,115,22,0.1);
    }
    .mobile-menu.active { display: flex; }
    .mobile-menu a { font-size: 1.05rem; font-weight: 500; color: var(--text); padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .mobile-menu .nav-cta { text-align: center; border-bottom: none; }

    /* HERO */
    .hero-wrapper { background: var(--bg-dark); padding-top: 68px; }
    .hero {
      padding: 80px 24px 80px; max-width: 1200px; margin: 0 auto;
      display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; position: relative;
    }
    .hero-glow-1 {
      position: absolute; top: -80px; left: -200px; width: 600px; height: 600px;
      background: radial-gradient(circle, rgba(249,115,22,0.1), transparent 65%);
      pointer-events: none; filter: blur(50px);
    }
    .hero-glow-2 {
      position: absolute; bottom: -80px; right: -150px; width: 500px; height: 500px;
      background: radial-gradient(circle, rgba(220,38,38,0.08), transparent 65%);
      pointer-events: none; filter: blur(50px);
    }
    .hero-badge {
      display: inline-flex; align-items: center; gap: 8px;
      background: rgba(249,115,22,0.08); border: 1px solid rgba(249,115,22,0.25);
      padding: 8px 18px; border-radius: 50px; font-size: 0.85rem; font-weight: 600;
      color: var(--accent-light); margin-bottom: 24px;
    }
    .hero-badge-dot { width: 8px; height: 8px; background: var(--success); border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; box-shadow: 0 0 0 0 rgba(34,197,94,0.4); } 50% { opacity:0.7; box-shadow: 0 0 0 6px rgba(34,197,94,0); } }
    .hero h1 { font-size: clamp(2.2rem, 4.5vw, 3.4rem); font-weight: 900; color: var(--text-bright); line-height: 1.1; margin-bottom: 20px; }
    .hero h1 .highlight { background: var(--gradient-fire); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .hero-desc { font-size: 1.05rem; color: var(--text-muted); margin-bottom: 36px; max-width: 480px; line-height: 1.75; }
    .hero-buttons { display: flex; gap: 16px; margin-bottom: 48px; flex-wrap: wrap; }
    .btn-primary {
      background: var(--gradient-fire); color: white; padding: 15px 36px; border-radius: 50px;
      font-weight: 700; font-size: 1rem; border: none; cursor: pointer;
      display: inline-flex; align-items: center; gap: 8px;
      transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 20px var(--accent-glow);
    }
    .btn-primary:hover { transform: translateY(-3px); box-shadow: 0 8px 30px var(--accent-glow); }
    .btn-secondary {
      background: transparent; color: var(--text-bright); padding: 15px 36px;
      border-radius: 50px; font-weight: 600; font-size: 1rem;
      border: 2px solid rgba(255,255,255,0.12); cursor: pointer; transition: all 0.2s;
    }
    .btn-secondary:hover { border-color: var(--accent); color: var(--accent-light); background: rgba(249,115,22,0.05); }
    .hero-stats { display: flex; gap: 40px; flex-wrap: wrap; }
    .hero-stat h3 { font-size: 1.6rem; font-weight: 900; }
    .hero-stat h3.orange { color: var(--accent-light); }
    .hero-stat h3.red { color: var(--primary-light); }
    .hero-stat h3.green { color: var(--success); }
    .hero-stat p { font-size: 0.82rem; color: var(--text-muted); margin-top: 2px; }
    .hero-visual { display: flex; justify-content: center; align-items: center; position: relative; }
    .hero-logo-wrap { position: relative; display: flex; flex-direction: column; align-items: center; }
    .hero-logo-img {
      width: min(340px, 90vw); height: min(340px, 90vw); border-radius: 32px; object-fit: cover;
      box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(249,115,22,0.2);
      border: 3px solid rgba(249,115,22,0.2); animation: float 4s ease-in-out infinite;
    }
    @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
    .hero-logo-glow {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
      width: 420px; height: 420px;
      background: radial-gradient(ellipse, rgba(249,115,22,0.15), transparent 70%);
      filter: blur(50px); pointer-events: none;
    }
    .hero-badge-dti {
      margin-top: 20px; padding: 10px 20px; border-radius: 12px;
      background: rgba(249,115,22,0.06); border: 1px solid rgba(249,115,22,0.15);
      font-size: 0.75rem; color: var(--text-muted); text-align: center;
    }
    .hero-badge-dti strong { color: var(--accent-light); }

    /* SECTION COMMON */
    .section { padding: 100px 24px; }
    .section-alt { background: var(--bg-section); }
    .section-inner { max-width: 1200px; margin: 0 auto; }
    .section-tag {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(249,115,22,0.08); border: 1px solid rgba(249,115,22,0.2);
      padding: 6px 14px; border-radius: 50px; font-size: 0.78rem; font-weight: 700;
      color: var(--accent-light); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px;
    }
    .section-header { text-align: center; margin-bottom: 56px; }
    .section-header h2 { font-size: clamp(1.8rem,3.5vw,2.8rem); font-weight: 900; color: var(--text-bright); margin-bottom: 12px; }
    .section-header h2 .highlight { background: var(--gradient-fire); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .section-header p { color: var(--text-muted); font-size: 1.05rem; max-width: 540px; margin: 0 auto; }

    /* SERVICES */
    .services-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; }
    .service-card {
      background: var(--bg-card); border-radius: 24px; padding: 40px 28px; text-align: center;
      border: 1px solid rgba(255,255,255,0.04); transition: all 0.4s cubic-bezier(0.4,0,0.2,1);
      position: relative; overflow: hidden; cursor: default;
    }
    .service-card::before { content:''; position:absolute; top:0; left:0; right:0; height:3px; background: var(--gradient-fire); opacity:0; transition: opacity 0.3s; }
    .service-card:hover { transform: translateY(-8px); background: var(--bg-card-hover); box-shadow: 0 20px 50px rgba(0,0,0,0.3); }
    .service-card:hover::before { opacity: 1; }
    .service-icon { width: 72px; height: 72px; border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin: 0 auto 24px; }
    .icon-orange { background: rgba(249,115,22,0.12); }
    .icon-red { background: rgba(220,38,38,0.1); }
    .icon-green { background: rgba(34,197,94,0.1); }
    .service-card h3 { font-size: 1.3rem; font-weight: 800; color: var(--text-bright); margin-bottom: 6px; }
    .service-bisaya { font-size: 0.82rem; font-weight: 700; margin-bottom: 14px; display: inline-block; padding: 2px 12px; border-radius: 50px; }
    .bisaya-orange { color: var(--accent-light); background: rgba(249,115,22,0.08); }
    .bisaya-red { color: var(--primary-light); background: rgba(220,38,38,0.08); }
    .bisaya-green { color: var(--success); background: rgba(34,197,94,0.08); }
    .service-card p { font-size: 0.92rem; color: var(--text-muted); line-height: 1.65; }

    /* HOW IT WORKS */
    .steps-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 32px; position: relative; }
    .steps-grid::before {
      content: ''; position: absolute; top: 40px; left: calc(16.66% + 8px); right: calc(16.66% + 8px);
      height: 2px; background: linear-gradient(90deg, var(--accent), var(--primary)); opacity: 0.25;
    }
    .step-card { text-align: center; padding: 24px 16px; }
    .step-number {
      width: 80px; height: 80px; border-radius: 50%; background: var(--bg-card);
      border: 2px solid rgba(249,115,22,0.2); display: flex; align-items: center; justify-content: center;
      font-size: 1.8rem; font-weight: 900; margin: 0 auto 20px;
      background: var(--gradient-fire); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      background-clip: text; box-shadow: 0 0 30px rgba(249,115,22,0.1);
    }
    .step-icon { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin: 0 auto 20px; background: var(--bg-card); border: 2px solid rgba(249,115,22,0.15); }
    .step-card h3 { font-size: 1.15rem; font-weight: 800; color: var(--text-bright); margin-bottom: 10px; }
    .step-card p { font-size: 0.9rem; color: var(--text-muted); line-height: 1.65; }

    /* FEATURES */
    .features-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 24px; }
    .feature-card {
      background: var(--bg-card); border-radius: 20px; padding: 32px 28px;
      border: 1px solid rgba(255,255,255,0.04); display: flex; gap: 20px; align-items: flex-start;
      transition: all 0.3s ease;
    }
    .feature-card:hover { background: var(--bg-card-hover); transform: translateY(-4px); box-shadow: 0 12px 40px rgba(0,0,0,0.2); }
    .feature-icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; flex-shrink: 0; }
    .fi-orange { background: rgba(249,115,22,0.1); }
    .fi-red { background: rgba(220,38,38,0.1); }
    .fi-green { background: rgba(34,197,94,0.1); }
    .fi-blue { background: rgba(59,130,246,0.1); }
    .fi-purple { background: rgba(168,85,247,0.1); }
    .fi-yellow { background: rgba(234,179,8,0.1); }
    .feature-content h3 { font-size: 1.05rem; font-weight: 800; color: var(--text-bright); margin-bottom: 6px; }
    .feature-content p { font-size: 0.88rem; color: var(--text-muted); line-height: 1.6; }

    /* APP DOWNLOAD */
    .download-section {
      background: linear-gradient(135deg, rgba(220,38,38,0.08) 0%, rgba(249,115,22,0.05) 100%);
      border-top: 1px solid rgba(249,115,22,0.1); border-bottom: 1px solid rgba(249,115,22,0.1);
    }
    .download-inner { max-width: 800px; margin: 0 auto; text-align: center; }
    .download-inner h2 { font-size: clamp(1.8rem,3vw,2.5rem); font-weight: 900; color: var(--text-bright); margin-bottom: 12px; }
    .download-inner p { color: var(--text-muted); font-size: 1.05rem; margin-bottom: 36px; }
    .download-btns { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
    .download-btn {
      display: inline-flex; align-items: center; gap: 12px;
      background: var(--bg-card); border: 1px solid rgba(255,255,255,0.08);
      padding: 14px 28px; border-radius: 14px; color: var(--text-bright);
      font-weight: 600; transition: all 0.3s; font-size: 0.95rem;
    }
    .download-btn:hover { background: var(--bg-card-hover); border-color: var(--accent); transform: translateY(-3px); box-shadow: 0 8px 30px rgba(0,0,0,0.2); }
    .download-btn-icon { font-size: 1.8rem; }
    .download-btn small { display: block; font-size: 0.68rem; color: var(--text-muted); font-weight: 500; margin-bottom: 2px; }
    .download-note { margin-top: 24px; font-size: 0.82rem; color: var(--text-muted); }
    .download-note a { color: var(--accent-light); }

    /* FOOTER */
    .footer { background: #060403; padding: 60px 24px 32px; }
    .footer-inner { max-width: 1200px; margin: 0 auto; }
    .footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 48px; margin-bottom: 48px; }
    .footer-brand { }
    .footer-logo { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .footer-logo img { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; }
    .footer-logo-name { font-size: 1.3rem; font-weight: 900; color: var(--text-bright); }
    .footer-logo-name span { background: var(--gradient-fire); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .footer-brand p { font-size: 0.9rem; color: var(--text-muted); line-height: 1.7; max-width: 320px; }
    .footer-col h4 { font-size: 0.85rem; font-weight: 700; color: var(--text-bright); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
    .footer-col ul li { margin-bottom: 10px; }
    .footer-col ul li a { font-size: 0.9rem; color: var(--text-muted); transition: color 0.2s; }
    .footer-col ul li a:hover { color: var(--accent-light); }
    .footer-bottom { border-top: 1px solid rgba(255,255,255,0.05); padding-top: 28px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
    .footer-bottom p { font-size: 0.82rem; color: var(--text-muted); }
    .footer-bottom a { color: var(--accent-light); }

    /* RESPONSIVE */
    @media (max-width: 1024px) {
      .services-grid { grid-template-columns: repeat(2,1fr); }
      .features-grid { grid-template-columns: 1fr; }
      .footer-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 768px) {
      .hero { grid-template-columns: 1fr; gap: 40px; padding: 60px 20px 60px; }
      .hero-visual { order: -1; }
      .hero-logo-img { width: 240px; height: 240px; }
      .hero-logo-glow { width: 280px; height: 280px; }
      .hero-stats { gap: 24px; }
      .services-grid { grid-template-columns: 1fr; }
      .steps-grid { grid-template-columns: 1fr; }
      .steps-grid::before { display: none; }
      .nav-links { display: none; }
      .hamburger { display: flex; }
      .section { padding: 70px 20px; }
      .footer-grid { grid-template-columns: 1fr; gap: 32px; }
      .footer-bottom { flex-direction: column; text-align: center; }
    }
    @media (max-width: 480px) {
      .hero h1 { font-size: 2rem; }
      .hero-buttons { flex-direction: column; }
      .hero-buttons .btn-primary, .hero-buttons .btn-secondary { width: 100%; justify-content: center; }
      .download-btns { flex-direction: column; align-items: center; }
      .hero-stat h3 { font-size: 1.3rem; }
    }

    /* ANIMATIONS */
    .fade-in { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
    .fade-in.visible { opacity: 1; transform: translateY(0); }
  </style>
</head>
<body>

<!-- BANNER -->
<div class="banner" id="banner">
  <span class="banner-text">🏍️ Now available in Balingasag! &nbsp;·&nbsp; Book rides, send packages, and order from local stores &nbsp;·&nbsp; FREE to download &nbsp;·&nbsp; 24/7 available &nbsp;·&nbsp; ONE RIDE — Your Community App &nbsp;·&nbsp;</span>
  <button class="banner-close" onclick="document.getElementById('banner').style.display='none'" aria-label="Close banner">✕</button>
</div>

<!-- NAVBAR -->
<nav class="navbar" id="navbar">
  <div class="nav-container">
    <a href="#" class="nav-logo">
      <img src="onerider.jpeg" alt="ONE RIDE" />
      <div class="nav-logo-text">
        <span>ONE RIDE</span>
        <small>Balingasag</small>
      </div>
    </a>
    <div class="nav-links">
      <a href="#services">Services</a>
      <a href="#how-it-works">How It Works</a>
      <a href="#features">Features</a>
      <a href="#download">App</a>
      <a href="#download" class="nav-cta">Download Free</a>
    </div>
    <button class="hamburger" id="hamburger" aria-label="Toggle menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>

<!-- MOBILE MENU -->
<div class="mobile-menu" id="mobileMenu">
  <a href="#services" onclick="closeMobile()">Services</a>
  <a href="#how-it-works" onclick="closeMobile()">How It Works</a>
  <a href="#features" onclick="closeMobile()">Features</a>
  <a href="#download" onclick="closeMobile()">App</a>
  <a href="#download" class="nav-cta" onclick="closeMobile()">Download Free</a>
</div>

<!-- HERO -->
<div class="hero-wrapper">
  <div class="hero">
    <div class="hero-glow-1"></div>
    <div class="hero-glow-2"></div>

    <div class="hero-content fade-in">
      <div class="hero-badge">
        <div class="hero-badge-dot"></div>
        Beta Testing · Balingasag
      </div>
      <h1>Your All-in-One<br><span class="highlight">Ride, Delivery</span><br>&amp; Pasabay App</h1>
      <p class="hero-desc">Book rides, send packages, and share trips with neighbors — all in one app. Built for Balingasag, powered by the community.</p>
      <div class="hero-buttons">
        <a href="#download" class="btn-primary">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.42c1.32.06 2.22.72 3.01.76.96-.19 1.88-.83 3.11-.89 1.37-.08 2.71.51 3.46 1.67-3.35 2.01-2.57 6.51.65 7.89-.62 1.37-1.27 2.65-2.23 3.43zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          Download on iOS
        </a>
        <a href="#download" class="btn-secondary">Explore Services →</a>
      </div>
      <div class="hero-stats">
        <div class="hero-stat">
          <h3 class="orange">3</h3>
          <p>Services</p>
        </div>
        <div class="hero-stat">
          <h3 class="green">Free</h3>
          <p>To Download</p>
        </div>
        <div class="hero-stat">
          <h3 class="red">24/7</h3>
          <p>Available</p>
        </div>
      </div>
    </div>

    <div class="hero-visual fade-in">
      <div class="hero-logo-wrap">
        <div class="hero-logo-glow"></div>
        <img src="onerider.jpeg" alt="ONE RIDE Balingasag" class="hero-logo-img" />
        <div class="hero-badge-dti">
          <strong>ONE RIDE Balingasag</strong> — Community-powered transport & delivery
        </div>
      </div>
    </div>
  </div>
</div>

<!-- SERVICES -->
<section class="section" id="services">
  <div class="section-inner">
    <div class="section-header fade-in">
      <div class="section-tag">⚡ Our Services</div>
      <h2>Everything You Need,<br><span class="highlight">One App</span></h2>
      <p>Three core services designed for the daily needs of Balingasag residents.</p>
    </div>
    <div class="services-grid">
      <div class="service-card fade-in">
        <div class="service-icon icon-orange">🏍️</div>
        <h3>Pasundo</h3>
        <span class="service-bisaya bisaya-orange">Ride Service</span>
        <p>Book a motorcycle ride anywhere in Balingasag. Fast, safe, and affordable — track your rider in real-time.</p>
      </div>
      <div class="service-card fade-in">
        <div class="service-icon icon-red">📦</div>
        <h3>Pasugo</h3>
        <span class="service-bisaya bisaya-red">Delivery Service</span>
        <p>Send packages, documents, or goods across town. Reliable door-to-door delivery with live tracking.</p>
      </div>
      <div class="service-card fade-in">
        <div class="service-icon icon-green">🤝</div>
        <h3>Pasabay</h3>
        <span class="service-bisaya bisaya-green">Ride Sharing</span>
        <p>Share a ride with neighbors heading the same way. Save money, reduce traffic, build community.</p>
      </div>
    </div>
  </div>
</section>

<!-- HOW IT WORKS -->
<section class="section section-alt" id="how-it-works">
  <div class="section-inner">
    <div class="section-header fade-in">
      <div class="section-tag">📱 How It Works</div>
      <h2>Ride in <span class="highlight">3 Easy Steps</span></h2>
      <p>Getting started with ONE RIDE takes less than 2 minutes.</p>
    </div>
    <div class="steps-grid">
      <div class="step-card fade-in">
        <div class="step-icon">📲</div>
        <h3>1. Download the App</h3>
        <p>Install ONE RIDE for free on your phone. Sign up with your mobile number — no credit card needed.</p>
      </div>
      <div class="step-card fade-in">
        <div class="step-icon">📍</div>
        <h3>2. Set Your Location</h3>
        <p>Enter your pickup point and destination. Choose your service — Pasundo, Pasugo, or Pasabay.</p>
      </div>
      <div class="step-card fade-in">
        <div class="step-icon">✅</div>
        <h3>3. Book & Ride</h3>
        <p>A nearby rider accepts your booking in seconds. Track them live and pay via GCash, Maya, or cash.</p>
      </div>
    </div>
  </div>
</section>

<!-- FEATURES -->
<section class="section" id="features">
  <div class="section-inner">
    <div class="section-header fade-in">
      <div class="section-tag">✨ Features</div>
      <h2>Built for <span class="highlight">Balingasag</span></h2>
      <p>Everything you need for a safe, convenient, and connected community transport experience.</p>
    </div>
    <div class="features-grid">
      <div class="feature-card fade-in">
        <div class="feature-icon fi-orange">📍</div>
        <div class="feature-content">
          <h3>Real-Time Tracking</h3>
          <p>Watch your rider's live location on the map from booking to arrival. Always know where they are.</p>
        </div>
      </div>
      <div class="feature-card fade-in">
        <div class="feature-icon fi-green">💳</div>
        <div class="feature-content">
          <h3>Built-In Wallet</h3>
          <p>Top up via GCash or Maya. Pay instantly without cash — fast, secure, and hassle-free.</p>
        </div>
      </div>
      <div class="feature-card fade-in">
        <div class="feature-icon fi-red">🎁</div>
        <div class="feature-content">
          <h3>Promo Codes</h3>
          <p>Unlock discounts with promo codes. Get rewarded for referring friends and loyal rides.</p>
        </div>
      </div>
      <div class="feature-card fade-in">
        <div class="feature-icon fi-blue">⭐</div>
        <div class="feature-content">
          <h3>Ratings & Reviews</h3>
          <p>Rate your rider after every trip. Our community accountability system keeps everyone safe.</p>
        </div>
      </div>
      <div class="feature-card fade-in">
        <div class="feature-icon fi-purple">💬</div>
        <div class="feature-content">
          <h3>In-App Chat</h3>
          <p>Message your rider directly inside the app. No need to exchange personal numbers.</p>
        </div>
      </div>
      <div class="feature-card fade-in">
        <div class="feature-icon fi-yellow">🔔</div>
        <div class="feature-content">
          <h3>Push Notifications</h3>
          <p>Get instant alerts on booking confirmations, rider status, and special promos.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- DOWNLOAD -->
<section class="section download-section" id="download">
  <div class="section-inner">
    <div class="download-inner fade-in">
      <div class="section-tag" style="margin: 0 auto 16px; display: table;">📱 Get The App</div>
      <h2>Download ONE RIDE <span style="background: var(--gradient-fire); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Free Today</span></h2>
      <p>Join riders and drivers in Balingasag. Available on Android and iOS — 100% free to download.</p>
      <div class="download-btns">
        <a href="https://play.google.com/store" target="_blank" class="download-btn">
          <span class="download-btn-icon">🤖</span>
          <div>
            <small>Get it on</small>
            Google Play
          </div>
        </a>
        <a href="https://apps.apple.com" target="_blank" class="download-btn">
          <span class="download-btn-icon">🍎</span>
          <div>
            <small>Download on the</small>
            App Store
          </div>
        </a>
      </div>
      <p class="download-note">Questions? Contact us at <a href="mailto:oneride.balingasag@gmail.com">oneride.balingasag@gmail.com</a></p>
    </div>
  </div>
</section>

<!-- FOOTER -->
<footer class="footer">
  <div class="footer-inner">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="footer-logo">
          <img src="onerider.jpeg" alt="ONE RIDE" />
          <div>
            <div class="footer-logo-name"><span>ONE RIDE</span></div>
            <div style="font-size: 0.65rem; color: var(--text-muted); letter-spacing: 2px; text-transform: uppercase;">Balingasag</div>
          </div>
        </div>
        <p>Your community-powered all-in-one transport and delivery app. Built for the people of Balingasag, Misamis Oriental.</p>
      </div>
      <div class="footer-col">
        <h4>Services</h4>
        <ul>
          <li><a href="#services">Pasundo (Ride)</a></li>
          <li><a href="#services">Pasugo (Delivery)</a></li>
          <li><a href="#services">Pasabay (Ride Share)</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Company</h4>
        <ul>
          <li><a href="#how-it-works">How It Works</a></li>
          <li><a href="#features">Features</a></li>
          <li><a href="#download">Download App</a></li>
          <li><a href="/privacy-policy.txt">Privacy Policy</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>© 2026 ONE RIDE Balingasag. All rights reserved.</p>
      <p>Made with ❤️ for the community of <a href="#">Balingasag, Misamis Oriental</a></p>
    </div>
  </div>
</footer>

<script>
  // Navbar scroll effect
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  // Hamburger menu
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    mobileMenu.classList.toggle('active');
  });
  function closeMobile() {
    hamburger.classList.remove('active');
    mobileMenu.classList.remove('active');
  }

  // Intersection Observer for fade-in animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 72;
        window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - offset, behavior: 'smooth' });
      }
    });
  });
</script>
</body>
</html>
```

- [ ] **Step 4: Commit**

```bash
cd /Users/dev3/omji
git add landing-oneride/
git commit -m "feat: add One Ride Balingasag landing page"
```

---

## Task 6: Landing page — Create Netlify site and deploy

**Files:**
- Run from: `landing-oneride/`

- [ ] **Step 1: Create Netlify site named one-ride via API**

```bash
netlify api createSite --data '{"name":"one-ride"}'
```
Note the `id` field from the response.

- [ ] **Step 2: Link to site**

```bash
mkdir -p /Users/dev3/omji/landing-oneride/.netlify
echo '{"siteId":"<ID_FROM_STEP_1>"}' > /Users/dev3/omji/landing-oneride/.netlify/state.json
```

- [ ] **Step 3: Deploy**

```bash
cd /Users/dev3/omji/landing-oneride && netlify deploy --prod --dir=.
```
Expected: `Deployed to production URL: https://one-ride.netlify.app`

- [ ] **Step 4: Verify**

Open https://one-ride.netlify.app — confirm logo, hero, services, how it works, features, download sections all render correctly on both desktop and mobile.
