# ONE RIDE BALINGASAG - Full Platform Rebrand

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the entire OMJI platform (mobile, backend, admin) as "ONE RIDE BALINGASAG" on the `one-ride-balingasag` git branch.

**Architecture:** White-label rebrand — same codebase structure, different branding (name, colors, logos, package IDs, URLs). Separate backend deployment on Render + separate Supabase database. The `one-ride-balingasag` branch diverges from `main` and is maintained independently.

**Tech Stack:** React Native/Expo (mobile), Go/Gin (backend), React/Vite (admin), PostgreSQL/Supabase (database)

**Branding Map:**
| Old | New |
|-----|-----|
| OMJI | ONE RIDE |
| omji | oneride |
| com.omji.app | com.oneridebalingasag.app |
| omji-backend.onrender.com | oneride-backend.onrender.com |
| omji-admin.onrender.com | oneride-admin.onrender.com |
| #EF4444 (primary red) | #F97316 (orange) |
| #DC2626 (primary dark) | #EA580C (orange dark) |
| #FCA5A5 (primary light) | #FDBA74 (orange light) |
| #3B82F6 (accent blue) | #DC2626 (accent red) |
| Balingasag | Balingasag & Salay |
| support@omji.app | infoomjisys@gmail.com |

---

### Task 1: Mobile - App Configuration (app.json, eas.json, package.json)

**Files:**
- Modify: `mobile/app.json`
- Modify: `mobile/eas.json`
- Modify: `mobile/package.json`

- [ ] **Step 1: Update app.json**

Replace all OMJI branding in `mobile/app.json`:
- `"name": "OMJI"` → `"name": "ONE RIDE"`
- `"slug": "omji"` → `"slug": "oneride-balingasag"`
- `"scheme": "omji"` → `"scheme": "oneride"`
- `"bundleIdentifier": "com.omji.app"` → `"bundleIdentifier": "com.oneridebalingasag.app"`
- `"package": "com.omji.app"` → `"package": "com.oneridebalingasag.app"`
- All permission descriptions: "OMJI" → "ONE RIDE"
- `"owner": "bboydevzxczc"` stays (same Expo account)
- Update EAS projectId after creating new Expo project

- [ ] **Step 2: Update package.json**

Change `"name": "omji-mobile"` → `"name": "oneride-mobile"`

- [ ] **Step 3: Update eas.json**

Update `serviceAccountKeyPath` if using different Google Play key.
Keep build profiles the same.

- [ ] **Step 4: Commit**

```bash
git add mobile/app.json mobile/package.json mobile/eas.json
git commit -m "rebrand: update app config to ONE RIDE BALINGASAG"
```

---

### Task 2: Mobile - Theme Colors

**Files:**
- Modify: `mobile/src/constants/theme.ts`

- [ ] **Step 1: Update brand colors**

Replace in `mobile/src/constants/theme.ts`:
```typescript
// ONE RIDE Brand Colors
primary: '#F97316',      // ONE RIDE Orange (was #EF4444)
primaryDark: '#EA580C',  // (was #DC2626)
primaryLight: '#FDBA74', // (was #FCA5A5)

// Accent color
secondary: '#DC2626',    // Red accent (was #3B82F6 blue)
```

Keep service colors (Pasundo, Pasugo, Pasabay) the same — they're functional, not brand colors.

- [ ] **Step 2: Verify no hardcoded color values elsewhere**

Search for `#EF4444`, `#DC2626`, `#FCA5A5`, `#3B82F6` across all .tsx/.ts files. Replace any hardcoded instances with theme references or the new colors.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/constants/theme.ts
git commit -m "rebrand: update theme colors to ONE RIDE orange"
```

---

### Task 3: Mobile - Android Native Config

**Files:**
- Modify: `mobile/android/settings.gradle` (line 34)
- Modify: `mobile/android/app/build.gradle` (lines 90, 92, 108-111)
- Modify: `mobile/android/app/src/main/res/values/strings.xml` (line 2)
- Modify: `mobile/android/app/src/main/AndroidManifest.xml` (line 49)
- Rename: `mobile/android/app/src/main/java/com/omji/app/` → `mobile/android/app/src/main/java/com/oneridebalingasag/app/`
- Modify: `MainActivity.kt` and `MainApplication.kt` package declarations

- [ ] **Step 1: Update settings.gradle**

```
rootProject.name = 'ONE RIDE'
```

- [ ] **Step 2: Update app/build.gradle**

```
namespace 'com.oneridebalingasag.app'
applicationId 'com.oneridebalingasag.app'
```

Keystore references — generate new keystore for ONE RIDE or keep existing and just rename references.

- [ ] **Step 3: Update strings.xml**

```xml
<string name="app_name">ONE RIDE</string>
```

- [ ] **Step 4: Update AndroidManifest.xml**

Change deep link scheme: `android:scheme="oneride"`

- [ ] **Step 5: Rename Java/Kotlin package directory**

```bash
mkdir -p mobile/android/app/src/main/java/com/oneridebalingasag/app/
mv mobile/android/app/src/main/java/com/omji/app/MainActivity.kt mobile/android/app/src/main/java/com/oneridebalingasag/app/
mv mobile/android/app/src/main/java/com/omji/app/MainApplication.kt mobile/android/app/src/main/java/com/oneridebalingasag/app/
```

Update `package com.omji.app` → `package com.oneridebalingasag.app` in both files.

- [ ] **Step 6: Commit**

```bash
git add mobile/android/
git commit -m "rebrand: update Android config to com.oneridebalingasag.app"
```

---

### Task 4: Mobile - Screen Text & Branding (Bulk Replace)

**Files:** All files in `mobile/src/` containing "OMJI" or "omji"

- [ ] **Step 1: Replace brand name in screen text**

Systematic replacements across all .tsx/.ts files:

| Find | Replace |
|------|---------|
| `'OMJI'` (app name in UI) | `'ONE RIDE'` |
| `"OMJI"` (app name in UI) | `"ONE RIDE"` |
| `OMJI Wallet` | `ONE RIDE Wallet` |
| `Earn with OMJI` | `Earn with ONE RIDE` |
| `Welcome to OMJI` | `Welcome to ONE RIDE` |
| `Join OMJI` | `Join ONE RIDE` |
| `about OMJI` | `about ONE RIDE` |
| `Call OMJI Support` | `Call ONE RIDE Support` |
| `riding with OMJI` | `riding with ONE RIDE` |
| `OMJI - Balingasag` | `ONE RIDE - Balingasag & Salay` |
| `OMJI v1.0.0` | `ONE RIDE v1.0.0` |
| `support@omji.app` | `infoomjisys@gmail.com` |
| `https://omji.app/terms` | `https://oneride-balingasag.netlify.app/terms` |
| `https://omji.app/privacy` | `https://oneride-balingasag.netlify.app/privacy` |
| `code OMJI20` | `code ONERIDE20` |

- [ ] **Step 2: Replace storage keys and identifiers**

| Find | Replace |
|------|---------|
| `@omji_onboarded` | `@oneride_onboarded` |
| `@omji_offline_queue` | `@oneride_offline_queue` |
| `OMJI-App/1.0` (User-Agent) | `OneRide-App/1.0` |
| `OMJI-${` (payment ref) | `ONERIDE-${` |

- [ ] **Step 3: Update deep linking**

In `mobile/src/utils/deepLinking.ts`:
```typescript
prefixes: ['oneride://', 'https://oneride-balingasag.netlify.app']
```

- [ ] **Step 4: Update API config**

In `mobile/src/config/api.config.ts`:
```typescript
API_BASE_URL: 'https://oneride-backend.onrender.com/api/v1'
```

- [ ] **Step 5: Verify with grep**

```bash
grep -rn "OMJI\|omji" mobile/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Fix any remaining references.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/
git commit -m "rebrand: replace all OMJI references in mobile app with ONE RIDE"
```

---

### Task 5: Mobile - Assets (Icons, Splash, Logo)

**Files:**
- Replace: `mobile/assets/icon.png`
- Replace: `mobile/assets/adaptive-icon.png`
- Replace: `mobile/assets/splash.png`
- Replace: `mobile/assets/notification-icon.png`
- Replace: `mobile/assets/favicon.png`

- [ ] **Step 1: Generate new app icons from ONE RIDE logo**

Use the onerider.jpeg logo to create:
- `icon.png` (1024x1024)
- `adaptive-icon.png` (1024x1024, with padding for adaptive icon)
- `splash.png` (1284x2778, logo centered on orange/red background)
- `notification-icon.png` (96x96, white on transparent)
- `favicon.png` (48x48)

Note: Use `sips` or ImageMagick to resize. Update splash background color in app.json from `#3B82F6` to `#DC2626`.

- [ ] **Step 2: Update app.json splash color**

```json
"backgroundColor": "#DC2626"
```

- [ ] **Step 3: Commit**

```bash
git add mobile/assets/
git commit -m "rebrand: update app icons and splash for ONE RIDE"
```

---

### Task 6: Backend - Go Module & Import Paths

**Files:**
- Modify: `backend/go.mod`
- Modify: ALL .go files with `"omji/..."` imports

- [ ] **Step 1: Update go.mod module name**

```
module oneride
```

- [ ] **Step 2: Update all import paths**

Replace `"omji/` with `"oneride/` in ALL .go files:
- `backend/cmd/main.go`
- `backend/cmd/cleanup-db/main.go`
- `backend/pkg/handlers/handlers.go`
- `backend/pkg/handlers/utils.go`
- `backend/pkg/handlers/jwt.go`
- `backend/pkg/db/database.go`
- `backend/pkg/middleware/middleware.go`
- All test files in `backend/pkg/handlers/`

- [ ] **Step 3: Update log messages**

In `backend/cmd/main.go`:
- `"OMJI Backend starting"` → `"ONE RIDE Backend starting"`
- Play Store URL: update `com.omji.app` → `com.oneridebalingasag.app`

In `backend/cmd/cleanup-db/main.go`:
- `"OMJI Database Cleanup Tool"` → `"ONE RIDE Database Cleanup Tool"`

- [ ] **Step 4: Update CORS origins**

In `backend/pkg/middleware/middleware.go`:
- `"https://omji-admin.onrender.com"` → `"https://oneride-admin.onrender.com"`

In `backend/render.yaml`:
- Service name: `oneride-backend`
- ALLOWED_ORIGINS: `https://oneride-admin.onrender.com`

- [ ] **Step 5: Update handler references**

In `backend/pkg/handlers/handlers.go`:
- Backend URL references → `oneride-backend.onrender.com`
- Promo code prefix `"OMJI-"` → `"ONERIDE-"`

- [ ] **Step 6: Update config defaults**

In `backend/config/config.go`:
- `DBUser: "oneride_user"`
- `DBName: "oneride_db"`

- [ ] **Step 7: Verify build**

```bash
cd backend && go build ./...
```

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "rebrand: update backend module and references to ONE RIDE"
```

---

### Task 7: Admin - Rebrand Dashboard

**Files:**
- Modify: `admin/package.json`
- Modify: `admin/index.html`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/services/api.ts`
- Modify: `admin/src/pages/LoginPage.tsx`
- Modify: `admin/src/pages/ReportsPage.tsx`

- [ ] **Step 1: Update package.json**

`"name": "omji-admin"` → `"name": "oneride-admin"`

- [ ] **Step 2: Update index.html title**

`<title>OMJI Admin Dashboard</title>` → `<title>ONE RIDE Admin Dashboard</title>`

- [ ] **Step 3: Update API URL**

In `admin/src/services/api.ts`:
```typescript
'https://oneride-backend.onrender.com/api/v1'
```

- [ ] **Step 4: Update App.tsx branding**

Replace all `"OMJI"` with `"ONE RIDE"` in sidebar, logos, alt text.

- [ ] **Step 5: Update LoginPage.tsx**

Replace `"OMJI Admin"` → `"ONE RIDE Admin"` and any API URL references.

- [ ] **Step 6: Update ReportsPage.tsx**

CSV filename: `'omji-revenue-report-'` → `'oneride-revenue-report-'`

- [ ] **Step 7: Commit**

```bash
git add admin/
git commit -m "rebrand: update admin dashboard to ONE RIDE"
```

---

### Task 8: Infrastructure - Separate Backend Deployment

**Manual steps (user must do):**

- [ ] **Step 1: Create new Supabase project**

1. Go to supabase.com → New Project
2. Name: "oneride"
3. Region: same as OMJI
4. Copy the DATABASE_URL from Settings → Database

- [ ] **Step 2: Create new Render service**

1. Go to render.com → New Web Service
2. Connect the `one-ride-balingasag` branch
3. Name: `oneride-backend`
4. Root directory: `backend`
5. Build command: `go build -o bin/server cmd/main.go`
6. Start command: `./bin/server`
7. Set environment variables:
   - `DATABASE_URL` = (from Supabase)
   - `JWT_SECRET` = (generate new one)
   - `ALLOWED_ORIGINS` = `https://oneride-admin.onrender.com`
   - `PORT` = `8080`

- [ ] **Step 3: Deploy admin on Render**

1. New Static Site on Render
2. Name: `oneride-admin`
3. Branch: `one-ride-balingasag`
4. Root directory: `admin`
5. Build command: `npm install && npm run build`
6. Publish directory: `dist`
7. Set env: `VITE_API_URL` = `https://oneride-backend.onrender.com/api/v1`

- [ ] **Step 4: Create new Expo project**

```bash
cd mobile && eas project:init
```

Select "Create a new project" → name: `oneride-balingasag`
Update the `projectId` in app.json.

- [ ] **Step 5: Generate new Android keystore**

```bash
eas credentials --platform android
```

Select "Create new keystore" for the new package name.

---

### Task 9: Store Listing & Landing Page

**Files:**
- Modify: `mobile/store-listing/play-store.md`
- Modify: `mobile/store-listing/app-store.md`
- Already done: `landing/index.html` (ONE RIDE landing page)

- [ ] **Step 1: Update store listings**

Replace all "OMJI" with "ONE RIDE" and "Balingasag" with "Balingasag & Salay" in store listing files.

- [ ] **Step 2: Commit**

```bash
git add mobile/store-listing/ landing/
git commit -m "rebrand: update store listings and landing page for ONE RIDE"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Full text search for remaining OMJI references**

```bash
grep -rn "OMJI\|omji" --include="*.ts" --include="*.tsx" --include="*.go" --include="*.json" --include="*.html" --include="*.md" --include="*.yaml" --include="*.gradle" --include="*.xml" --include="*.kt" . | grep -v node_modules | grep -v .git | grep -v landing/google-apps-script.js
```

Fix any remaining references.

- [ ] **Step 2: Test mobile build**

```bash
cd mobile && npx expo start
```

Verify the app launches with ONE RIDE branding.

- [ ] **Step 3: Test backend build**

```bash
cd backend && go build ./...
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "rebrand: final cleanup - ONE RIDE BALINGASAG complete"
```
