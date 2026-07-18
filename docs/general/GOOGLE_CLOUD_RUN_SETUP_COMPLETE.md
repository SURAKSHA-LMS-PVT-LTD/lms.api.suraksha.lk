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

### 2. 🔄 Deploy to Cloud Run

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
git commit -m "Fix: Enable trust proxy for Cloud Run to capture real client IPs"
git push origin main
```

### 3. ✅ Testing After Deployment

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

## 🔐 Security Enhancement

### Real IP Tracking
- ✅ Captures actual client IP (not Google's internal IP)
- ✅ Reads X-Forwarded-For header correctly
- ✅ Falls back gracefully if headers missing
- ✅ Validates IP addresses to detect link-local IPs

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
  isRevoked
FROM refresh_tokens
WHERE createdAt > NOW() - INTERVAL 1 HOUR
ORDER BY createdAt DESC
LIMIT 10;
```

Expected: `ipAddress` should show real client IPs, NOT 169.254.x.x

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

---

## 📚 Related Documentation

- **[SESSION_MANAGEMENT_API_COMPLETE_GUIDE.md](SESSION_MANAGEMENT_API_COMPLETE_GUIDE.md)** - Session API documentation
- **[AUTH_COMPLETE_IMPLEMENTATION_GUIDE.md](AUTH_COMPLETE_IMPLEMENTATION_GUIDE.md)** - Complete auth system

---

## ✅ Final Checklist

- [x] Trust proxy enabled in main.ts
- [x] IP extraction utility created
- [x] All controllers updated (main, mobile, v2)
- [x] TypeScript compilation: 0 errors
- [ ] **Deploy to Cloud Run** ← Next step
- [ ] **Verify real IPs in production** ← Test after deploy

---

## 🚀 Ready to Deploy!

All code changes are complete. Just deploy to Cloud Run and you'll immediately start seeing real client IP addresses (not 169.254.x.x).

**Deployment command:**
```bash
# Build
npm run build

# Option 1: If using gcloud CLI
gcloud run deploy lms-api-suraksha --source . --region europe-west1

# Option 2: If using CI/CD
git add .
git commit -m "Fix: Enable trust proxy for Cloud Run to capture real client IPs"
git push origin main
```

Good luck! 🎉
