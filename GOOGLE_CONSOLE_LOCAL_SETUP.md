# ✅ Google Cloud Console Configuration - EXACT URLs

## 🎯 Your Configuration

**Frontend:** `http://localhost:8080`  
**Backend:** `http://localhost:8081`  
**Callback:** `http://localhost:8081/drive-access/callback`

---

## 📋 URLs to Add in Google Cloud Console

### **STEP 1: Go to Google Cloud Console**
https://console.cloud.google.com/apis/credentials

### **STEP 2: Click on your OAuth Client ID**
(or create new one: "+ CREATE CREDENTIALS" → "OAuth client ID" → "Web application")

### **STEP 3: Add these EXACT URLs**

#### **Authorized JavaScript origins** (2 URLs)
```
http://localhost:8080
http://localhost:8081
```

**Why both?**
- `8080` = Your frontend origin
- `8081` = Your backend API origin

#### **Authorized redirect URIs** (1 URL)
```
http://localhost:8081/drive-access/callback
```

**⚠️ CRITICAL:** Must be EXACTLY `http://localhost:8081/drive-access/callback`
- ✅ Correct: `http://localhost:8081/drive-access/callback`
- ❌ Wrong: `http://localhost:8080/drive-access/callback` (wrong port)
- ❌ Wrong: `http://localhost:8081/drive-access/callback/` (trailing slash)
- ❌ Wrong: `https://localhost:8081/drive-access/callback` (https instead of http)

### **STEP 4: Click "SAVE"**

---

## 🧪 Test the Flow

### **1. Start Backend**
```powershell
npm run start:dev
```

Expected output:
```
[NestApplication] Nest application successfully started +2ms
Listening on port 8081
[UserDriveAccessModule] UserDriveAccessModule initialized
```

### **2. Test Connection Endpoint**

Open Postman or use curl:

**Get Connection Status:**
```http
GET http://localhost:8081/drive-access/status
Authorization: Bearer YOUR_JWT_TOKEN
```

**Expected Response:**
```json
{
  "isConnected": false,
  "googleEmail": null,
  "googleDisplayName": null,
  "lastUsedAt": null
}
```

### **3. Initiate OAuth Flow**

```http
GET http://localhost:8081/drive-access/connect?returnUrl=/homework
Authorization: Bearer YOUR_JWT_TOKEN
```

**Expected Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http%3A%2F%2Flocalhost%3A8081%2Fdrive-access%2Fcallback&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file%20openid%20email%20profile&access_type=offline&prompt=consent&state=...",
  "state": "eyJ1c2VySWQiOiIxMjMiLCJyZXR1cm5VcmwiOiIvaG9tZXdvcmsifQ"
}
```

### **4. Complete OAuth in Browser**

1. Copy the `authUrl` from the response
2. Paste it in your browser
3. Sign in with Google
4. Click "Allow" to grant permissions
5. You'll be redirected to: `http://localhost:8080/homework?drive_connected=true&google_email=user@gmail.com`

✅ **If you see `drive_connected=true` in URL, it worked!**

### **5. Get Access Token**

```http
GET http://localhost:8081/drive-access/token
Authorization: Bearer YOUR_JWT_TOKEN
```

**Expected Response:**
```json
{
  "accessToken": "ya29.a0AfB_byC1234567890abcdefghijklmnopqrstuvwxyz...",
  "expiresIn": 3599,
  "expiresAt": "2026-02-13T16:45:00.000Z"
}
```

✅ **If you got an access token, Google Drive integration is WORKING!**

---

## 🎨 Frontend Integration

Your frontend needs to:

1. **Handle the callback** at `/homework` (or wherever `returnUrl` points)
2. **Check URL params** for `drive_connected` and `google_email`
3. **Show success/error** message

### **React Example:**

```typescript
// In your Homework or Auth callback component
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner'; // or your toast library

function HomeworkPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const driveConnected = searchParams.get('drive_connected');
    const googleEmail = searchParams.get('google_email');
    const error = searchParams.get('error');

    if (driveConnected === 'true') {
      toast.success('Google Drive connected!', {
        description: `Connected as ${googleEmail}`,
      });
      // Clean up URL params
      searchParams.delete('drive_connected');
      searchParams.delete('google_email');
      setSearchParams(searchParams);
    } else if (error) {
      toast.error('Drive connection failed', {
        description: error,
      });
      searchParams.delete('error');
      setSearchParams(searchParams);
    }
  }, [searchParams]);

  return (
    <div>
      {/* Your homework page content */}
    </div>
  );
}
```

---

## 📸 Visual Guide - Google Console

### **What you should see:**

**Authorized JavaScript origins:**
```
┌──────────────────────────────────────┐
│ http://localhost:8080                │  ← Frontend
├──────────────────────────────────────┤
│ http://localhost:8081                │  ← Backend
└──────────────────────────────────────┘
```

**Authorized redirect URIs:**
```
┌────────────────────────────────────────────────────┐
│ http://localhost:8081/drive-access/callback        │
└────────────────────────────────────────────────────┘
```

---

## 🔄 Complete Flow Diagram

```
┌─────────────────┐
│   Frontend      │
│ localhost:8080  │
└────────┬────────┘
         │
         │ 1. User clicks "Connect Drive"
         │
         v
    Call API:
    GET /drive-access/connect
         │
         v
┌─────────────────┐
│   Backend       │
│ localhost:8081  │
└────────┬────────┘
         │
         │ 2. Returns authUrl
         │
         v
    Redirect user to:
    https://accounts.google.com/...
         │
         │ 3. User grants permission
         │
         v
    Google redirects to:
    http://localhost:8081/drive-access/callback?code=...
         │
         v
┌─────────────────┐
│   Backend       │
│ localhost:8081  │
└────────┬────────┘
         │
         │ 4. Exchanges code for refresh token
         │ 5. Encrypts and stores in database
         │
         v
    Redirects to:
    http://localhost:8080/homework?drive_connected=true
         │
         v
┌─────────────────┐
│   Frontend      │
│ localhost:8080  │
└────────┬────────┘
         │
         │ 6. Shows success message
         │
         v
    ✅ Drive Connected!
```

---

## 🐛 Common Errors & Fixes

### **Error: "redirect_uri_mismatch"**

**Screenshot shows:**
```
Error 400: redirect_uri_mismatch
```

**Cause:** Google Console redirect URI doesn't match `.env`

**Fix:**
1. Check `.env`: `GOOGLE_DRIVE_CALLBACK_URI=http://localhost:8081/drive-access/callback`
2. Check Google Console: Must have EXACTLY `http://localhost:8081/drive-access/callback`
3. Make sure there's no trailing slash
4. Make sure it's `http` not `https`
5. Make sure port is `8081` not `8080`

### **Error: "Access blocked: This app's request is invalid"**

**Cause:** OAuth consent screen not configured or missing test users

**Fix:**
1. Go to: https://console.cloud.google.com/apis/credentials/consent
2. Complete OAuth consent screen configuration
3. Add your email to "Test users" (if app is in testing mode)

### **Error: CORS issue in browser**

**Cause:** Frontend on 8080 trying to call backend on 8081

**Fix:** Make sure your backend has CORS enabled for `http://localhost:8080`

Check `main.ts`:
```typescript
app.enableCors({
  origin: ['http://localhost:8080', 'http://localhost:5173'],
  credentials: true,
});
```

---

## ✅ Pre-Flight Checklist

Before testing, verify:

- [ ] `.env` has `PORT=8081`
- [ ] `.env` has `FRONTEND_URL=http://localhost:8080`
- [ ] `.env` has `GOOGLE_DRIVE_CALLBACK_URI=http://localhost:8081/drive-access/callback`
- [ ] `.env` has valid `GOOGLE_CLIENT_ID`
- [ ] `.env` has valid `GOOGLE_CLIENT_SECRET`
- [ ] `.env` has `DRIVE_TOKEN_ENCRYPTION_KEY=0c7b533f5cf85b7901518ae6ea97df06f3366d8508862898943eb4e7f4708dbf`
- [ ] Google Console has `http://localhost:8080` in JavaScript origins
- [ ] Google Console has `http://localhost:8081` in JavaScript origins
- [ ] Google Console has `http://localhost:8081/drive-access/callback` in redirect URIs
- [ ] Database migrations have been run (`npm run migration:run`)
- [ ] Google Drive API is enabled in Google Cloud
- [ ] People API is enabled in Google Cloud
- [ ] Your email is added to test users (if app is in testing mode)

---

## 🚀 Quick Start Command

```powershell
# Make sure you're in the project directory
cd D:\User\Desktop\production\Production\lms-api-suraksha-lk

# Start the backend
npm run start:dev

# In another terminal, start your frontend on port 8080
```

---

## 📝 Summary

**Add to Google Cloud Console:**

**Authorized JavaScript origins:**
- `http://localhost:8080`
- `http://localhost:8081`

**Authorized redirect URIs:**
- `http://localhost:8081/drive-access/callback`

**That's it!** These are the ONLY URLs you need to add for local development.

For production, you'll add:
- JavaScript origins: `https://lms.yourdomain.com`, `https://api.yourdomain.com`
- Redirect URI: `https://api.yourdomain.com/drive-access/callback`
