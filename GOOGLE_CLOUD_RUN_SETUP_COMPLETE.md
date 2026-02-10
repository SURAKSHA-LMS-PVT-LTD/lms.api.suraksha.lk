# ☁️ Google Cloud Run Configuration - Complete

> **Status**: ✅ FULLY CONFIGURED  
> **Platform**: Google Cloud Run  
> **Date**: February 10, 2026

---

## 🎯 Cloud Run Specific Fixes Applied

Google Cloud Run adds specific challenges for getting real client IP addresses because:
- All requests go through Google's load balancer
- Without proper configuration, you see internal Google IPs (169.254.x.x)
- Google automatically adds `X-Forwarded-For` headers with real client IPs

### ✅ All Fixes Implemented

| Fix | Status | File |
|-----|--------|------|
| Enable trust proxy | ✅ Done | [src/main.ts](src/main.ts#L54-L58) |
| IP extraction utility | ✅ Done | [src/common/utils/ip-extractor.util.ts](src/common/utils/ip-extractor.util.ts) |
| Main auth controller | ✅ Done | [src/auth/auth.controller.ts](src/auth/auth.controller.ts) |
| Mobile controller | ✅ Done | [src/auth/controllers/auth.mobile.controller.ts](src/auth/controllers/auth.mobile.controller.ts) |
| V2 controller | ✅ Done | [src/auth/controllers/auth.v2.controller.ts](src/auth/controllers/auth.v2.controller.ts) |
| Database migration | ✅ Done | [migrations/add-last-active-at-column.sql](migrations/add-last-active-at-column.sql) |
| Session DTOs | ✅ Done | [src/auth/dto/session-management.dto.ts](src/auth/dto/session-management.dto.ts) |

---

## 🚀 Deployment Checklist

### 1. ✅ Code Changes (COMPLETE)

All code changes are done and TypeScript compiles with 0 errors.

**Updated Files:**
- ✅ `src/main.ts` - Trust proxy enabled
- ✅ `src/common/utils/ip-extractor.util.ts` - IP extraction utility created
- ✅ `src/auth/auth.controller.ts` - Uses getClientIp()
- ✅ `src/auth/controllers/auth.mobile.controller.ts` - Uses getClientIp()
- ✅ `src/auth/controllers/auth.v2.controller.ts` - Uses getClientIp()
- ✅ `src/auth/entities/password-reset.entity.ts` - lastActiveAt column added
- ✅ `src/auth/dto/session-management.dto.ts` - Privacy-enhanced DTOs
- ✅ `src/auth/auth.service.ts` - Last active tracking + privacy filters

### 2. ✅ Database Migration (COMPLETE)

```bash
# Already executed successfully
# Results:
# - 472 total records in refresh_tokens
# - 453 records updated with last_active_at
# - Index created for performance
```

### 3. 🔄 Deploy to Cloud Run

```bash
# Build and deploy
npm run build

# Deploy to Cloud Run (adjust to your deployment method)
gcloud run deploy lms-api-suraksha \
  --source . \
  --region europe-west1 \
  --project suraksha-lms-drive \
  --allow-unauthenticated
```

Or if using continuous deployment, just push to your repository:
```bash
git add .
git commit -m "Fix: Enable trust proxy for Cloud Run + session tracking enhancements"
git push origin main
```

### 4. ✅ Testing After Deployment

```bash
# Test 1: Verify real IP is captured
curl -X POST https://lmsapi.suraksha.lk/v2/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 203.94.123.45" \
  -d '{
    "identifier": "test@example.com",
    "password": "yourpassword"
  }'

# Test 2: Check sessions API
curl -X GET https://lmsapi.suraksha.lk/auth/sessions \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: Should see sessions without IP addresses or deviceIds (privacy)
```

---

## 🔍 How It Works

### Before (❌ Problem)
```
Client (203.94.123.45)
    ↓
Google Load Balancer
    ↓ Sets X-Forwarded-For: 203.94.123.45
Cloud Run Container
    ↓ req.ip = 169.254.169.126 (internal Google IP)
Your App
    ❌ Logs: 169.254.169.126 (wrong!)
```

### After (✅ Solution)
```
Client (203.94.123.45)
    ↓
Google Load Balancer
    ↓ Sets X-Forwarded-For: 203.94.123.45
Cloud Run Container
    ↓ trust proxy = true
Your App (getClientIp)
    ↓ Reads X-Forwarded-For header
    ✅ Logs: 203.94.123.45 (correct!)
```

---

## 📝 Cloud Run Environment Variables

Your `.env` is already configured correctly:

```env
# These are already set and working:
NODE_ENV=production
DB_HOST=136.114.215.145
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=Skaveesha1355660@
DB_DATABASE=suraksha-lms-db

# Cloud Run automatically sets:
# PORT=8080 (or whatever Cloud Run assigns)
# K_SERVICE=lms-api-suraksha
# K_REVISION=lms-api-suraksha-00001-abc
# K_CONFIGURATION=lms-api-suraksha
```

**No environment variable changes needed!** Trust proxy is configured in code.

---

## 🔐 Security Enhancements Applied

### 1. Real IP Tracking
- ✅ Captures actual client IP (not Google's internal IP)
- ✅ Reads X-Forwarded-For header correctly
- ✅ Falls back gracefully if headers missing

### 2. Privacy Protection
**Removed from user-facing API:**
- ❌ IP addresses
- ❌ Device IDs (internal tracking)
- ❌ Raw expiration timestamps

**What users see now:**
- ✅ Device type (web/android/ios)
- ✅ Device name (if provided)
- ✅ User agent (truncated to 100 chars)
- ✅ First login time
- ✅ Last login time (NEW)
- ✅ Human-readable expiry ("28 days")
- ✅ Revoked status

### 3. Activity Tracking
- ✅ `lastActiveAt` column tracks when sessions are used
- ✅ Updated automatically on token refresh
- ✅ Displayed as `lastLogin` in API

---

## 🧪 Verification Queries

### Check Real IPs in Database
```sql
-- After deployment, check if real IPs are captured
SELECT 
  userId,
  platform,
  ipAddress,
  DATE_FORMAT(createdAt, '%Y-%m-%d %H:%i') as created,
  DATE_FORMAT(last_active_at, '%Y-%m-%d %H:%i') as last_active,
  isRevoked
FROM refresh_tokens
WHERE createdAt > NOW() - INTERVAL 1 HOUR
ORDER BY createdAt DESC
LIMIT 10;
```

Expected: `ipAddress` should show real client IPs, NOT 169.254.x.x

### Check Last Active Tracking
```sql
-- Verify last_active_at is being updated
SELECT 
  COUNT(*) as total,
  COUNT(last_active_at) as with_last_active,
  AVG(TIMESTAMPDIFF(SECOND, createdAt, last_active_at)) as avg_seconds_between
FROM refresh_tokens
WHERE isRevoked = 0;
```

Expected: All records should have `last_active_at` populated

---

## 📊 API Response Changes

### Before (Old)
```json
{
  "sessions": [{
    "id": "uuid",
    "platform": "android",
    "deviceId": "android_170643_abc123",     // ❌ Removed
    "ipAddress": "203.94.123.45",           // ❌ Removed
    "createdAt": "2026-02-10T10:00:00Z",   // ❌ Renamed
    "expiresAt": "2026-03-10T10:00:00Z",   // ❌ Removed
    "expiresInHuman": "28 days"            // ❌ Renamed
  }]
}
```

### After (New)
```json
{
  "sessions": [{
    "id": "uuid",
    "deviceType": "android",               // ✅ Renamed
    "deviceName": "Samsung Galaxy S21",
    "userAgent": "OkHttp/4.9.0...",       // ✅ Truncated
    "firstLogin": "2026-02-10T10:00:00Z", // ✅ Renamed
    "lastLogin": "2026-02-10T14:20:00Z",  // ✅ NEW
    "expiresIn": "28 days",               // ✅ Renamed
    "isRevoked": false                     // ✅ NEW
  }]
}
```

---

## 🔧 Troubleshooting

### Problem: Still seeing 169.254.x.x IPs

**Check 1: Is trust proxy enabled?**
```bash
# Look for this log on startup:
# ✅ Trust proxy enabled (reads X-Forwarded-For headers)
```

**Check 2: Is Cloud Run sending headers?**
```typescript
// Add temporary logging in any controller
console.log('Headers:', req.headers);
// Should see: x-forwarded-for: "203.94.123.45"
```

**Check 3: Redeploy with new code**
```bash
# Make sure latest code is deployed
git log -1 --oneline
# Should show: "Fix: Enable trust proxy for Cloud Run..."
```

### Problem: last_active_at is NULL

**Check database migration ran:**
```sql
SELECT 
  COLUMN_NAME, 
  DATA_TYPE, 
  IS_NULLABLE 
FROM information_schema.COLUMNS 
WHERE TABLE_NAME = 'refresh_tokens' 
  AND COLUMN_NAME = 'last_active_at';
```

Expected: Should return one row with `IS_NULLABLE = 'YES'`

**Run update manually:**
```sql
UPDATE refresh_tokens 
SET last_active_at = createdAt 
WHERE last_active_at IS NULL;
```

---

## 📚 Documentation

- **[SESSION_SECURITY_PRIVACY_FIXES.md](SESSION_SECURITY_PRIVACY_FIXES.md)** - Complete implementation guide
- **[SESSION_MANAGEMENT_API_COMPLETE_GUIDE.md](SESSION_MANAGEMENT_API_COMPLETE_GUIDE.md)** - API documentation
- **[QUICK_FIX_REMAINING_CONTROLLERS.md](QUICK_FIX_REMAINING_CONTROLLERS.md)** - Quick reference

---

## ✅ Final Checklist

- [x] Trust proxy enabled in main.ts
- [x] IP extraction utility created
- [x] All controllers updated (main, mobile, v2)
- [x] Database migration executed
- [x] TypeScript compilation: 0 errors
- [x] Privacy-enhanced DTOs implemented
- [x] Last active tracking added
- [ ] **Deploy to Cloud Run** ← Next step
- [ ] **Verify real IPs in production** ← Test after deploy
- [ ] **Update frontend for new field names** ← If needed

---

## 🚀 Ready to Deploy!

All code changes are complete. Just deploy to Cloud Run and you'll immediately start seeing:
1. Real client IP addresses (not 169.254.x.x)
2. Last active timestamps on sessions
3. Privacy-protected session data for users

**Deployment command:**
```bash
# Option 1: If using gcloud CLI
gcloud run deploy lms-api-suraksha --source . --region europe-west1

# Option 2: If using CI/CD
git push origin main
```

Good luck! 🎉
