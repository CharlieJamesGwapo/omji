# Full App Improvement Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all hardcoded pixels, fix bugs, and add UI polish across the entire OMJI mobile app.

**Architecture:** Fix responsive issues in-place using existing `moderateScale()`, `verticalScale()`, `fontScale()`, and `RESPONSIVE` utilities from `src/utils/responsive.ts`. Add animations using React Native's built-in `Animated` API. No new dependencies.

**Tech Stack:** React Native 0.81.5, React 19.1, Expo SDK 54, TypeScript

---

### Task 1: Fix PasugoScreen Responsive Issues

**Files:**
- Modify: `src/screens/Main/PasugoScreen.tsx`

**Fixes (7 hardcoded values):**
- Line 311: `width: 40` → `width: moderateScale(40)`
- Line 314: `paddingBottom: 40` → `paddingBottom: verticalScale(40)`
- Line 322: `marginLeft: 12` → `marginLeft: moderateScale(12)`
- Line 377: `gap: 8` → `gap: moderateScale(8)`
- Line 427: `minHeight: 60` → `minHeight: verticalScale(60)`
- Line 518: `width: 28` → `width: moderateScale(28)`
- Line 532: `width: 28` → `width: moderateScale(28)`

---

### Task 2: Fix StoreDetailScreen Responsive Issues

**Files:**
- Modify: `src/screens/Main/StoreDetailScreen.tsx`

**Fixes (shadow properties + spacers):**
- Line 257: `height: 100` → `height: verticalScale(100)`
- All `shadowOffset: { width: 0, height: 2 }` → `height: verticalScale(2)`
- All `shadowRadius: 4/8` → `moderateScale(4/8)`
- All `elevation: 2/3/5` → `moderateScale(2/3/5)`
- Line 322: `borderBottomWidth: 1` (keep - 1px borders are standard)
- Line 346: `width: 1` (keep - 1px dividers are standard)

---

### Task 3: Fix PasabayScreen Responsive Issues

**Files:**
- Modify: `src/screens/Main/PasabayScreen.tsx`

**Fixes (4 values):**
- `borderRadius: 6` → `RESPONSIVE.borderRadius.small`
- `marginTop: 8` → `verticalScale(8)`
- `borderRadius: 8` → `RESPONSIVE.borderRadius.small`
- `marginTop: 6/4` → `verticalScale(6/4)`

---

### Task 4: Fix HomeScreen Responsive Issues

**Files:**
- Modify: `src/screens/Main/HomeScreen.tsx`

**Fixes:**
- Line 246: `paddingBottom: 100` → `paddingBottom: verticalScale(100)`
- Lines 260, 269, 307, 313: hardcoded margins (16, 4, 12, 4) → moderateScale/verticalScale

---

### Task 5: Fix OrdersScreen Responsive Issues

**Files:**
- Modify: `src/screens/Main/OrdersScreen.tsx`

**Fixes:**
- Skeleton loader hardcoded dimensions → responsive
- Line 450: `height: 100` → `verticalScale(100)`

---

### Task 6: Fix CartScreen + WalletScreen Responsive Issues

**Files:**
- Modify: `src/screens/Main/CartScreen.tsx`
- Modify: `src/screens/Main/WalletScreen.tsx`

**Fixes:**
- CartScreen Line 362: `marginTop: 2` → `verticalScale(2)`
- WalletScreen spacer: `height: 100` → `verticalScale(100)`

---

### Task 7: UI Polish - Add Screen Transition Animations

**Files:**
- Modify: `src/navigation/MainNavigator.tsx`
- Modify: `src/navigation/AuthNavigator.tsx`
- Modify: `src/navigation/RiderNavigator.tsx`

**Changes:**
- Add slide-from-right transitions for stack navigators
- Add fade transitions for tab navigator
- Add card overlay for modals

---

### Task 8: UI Polish - Add List Item Animations

**Files:**
- Modify: `src/screens/Main/HomeScreen.tsx`
- Modify: `src/screens/Rider/RiderDashboardScreen.tsx`
- Modify: `src/screens/Main/OrdersScreen.tsx`

**Changes:**
- Add fade-in animation for list items on mount
- Add scale animation on card press (activeOpacity + transform)

---

### Task 9: UI Polish - Improve Card Designs

**Files:**
- Multiple screen files

**Changes:**
- Add subtle gradient backgrounds to service cards
- Improve shadow consistency across all cards
- Add status indicator animations (pulsing dot for active rides)

---

### Task 10: End-to-End Flow Verification

**Verify all flows compile and render correctly:**
- TypeScript compilation check
- Review all navigation routes match screen names
- Verify all API service calls match backend endpoints
- Check all status transitions are handled

---
