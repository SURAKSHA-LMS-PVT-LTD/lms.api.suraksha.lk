# ✅ Production URLs Configuration Complete

## 📋 `.env` Updated for Production

Your `.env` file now has production settings:

```env
NODE_ENV=production
PORT=3000

GOOGLE_CLIENT_ID=696735498700-vifcskk15iiq8731ic53fm2ukfo7g3av.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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

GOOGLE_DRIVE_CALLBACK_URI=https://lmsapi.suraksha.lk/drive-access/callback
FRONTEND_URL=https://lms.suraksha.lk

DRIVE_TOKEN_ENCRYPTION_KEY=0c7b533f5cf85b7901518ae6ea97df06f3366d8508862898943eb4e7f4708dbf
```

---

## 🔐 Update Google Cloud Console for Production

### **STEP 1: Open Google Cloud Console**
https://console.cloud.google.com/apis/credentials

### **STEP 2: Edit OAuth Client ID**
Click on: `696735498700-vifcskk15iiq8731ic53fm2ukfo7g3av`

### **STEP 3: Add Production URLs**

#### **Authorized JavaScript origins:**
```
https://lms.suraksha.lk
https://lmsapi.suraksha.lk
```

**Keep local development URLs too:**
```
http://localhost:8080
http://localhost:8081
```

**Total JavaScript origins (4 URLs):**
```
✅ https://lms.suraksha.lk           (Production Frontend)
✅ https://lmsapi.suraksha.lk        (Production Backend API)
✅ http://localhost:8080             (Local Frontend)
✅ http://localhost:8081             (Local Backend)
```

#### **Authorized redirect URIs:**
```
https://lmsapi.suraksha.lk/drive-access/callback
```

**Keep local development too:**
```
http://localhost:8081/drive-access/callback
```

**Total redirect URIs (2 URLs):**
```
✅ https://lmsapi.suraksha.lk/drive-access/callback    (Production)
✅ http://localhost:8081/drive-access/callback         (Local)
```

### **STEP 4: Click "SAVE"**

---

## 🚀 Deployment Steps

### **1. Verify Configuration**
```powershell
# Make sure .env has production URLs
cat .env | Select-String "NODE_ENV|PORT|GOOGLE_DRIVE_CALLBACK|FRONTEND_URL"
```

Expected output:
```
NODE_ENV=production
PORT=3000
GOOGLE_DRIVE_CALLBACK_URI=https://lmsapi.suraksha.lk/drive-access/callback
FRONTEND_URL=https://lms.suraksha.lk
```

### **2. Run Database Migrations**
```powershell
# Run pending migrations (demographic fields + Drive tables)
npm run migration:run
```

### **3. Build for Production**
```powershell
npm run build
```

### **4. Start Production Server**
```powershell
npm run start:prod
```

**Or with PM2:**
```powershell
pm2 start ecosystem.config.js --env production
```

---

## 🧪 Test Production OAuth Flow

### **1. Initiate Connection**
```http
GET https://lmsapi.suraksha.lk/drive-access/connect?returnUrl=/profile
Authorization: Bearer YOUR_JWT_TOKEN
```

### **2. Open authUrl in Browser**
Copy the `authUrl` from response and open in browser

### **3. Grant Permission**
Sign in with Google and allow Drive access

### **4. Verify Redirect**
You'll be redirected to:
```
https://lms.suraksha.lk/profile?drive_connected=true&google_email=user@gmail.com
```

### **5. Check Status**
```http
GET https://lmsapi.suraksha.lk/drive-access/status
Authorization: Bearer YOUR_JWT_TOKEN
```

Expected:
```json
{
  "isConnected": true,
  "googleEmail": "ceylontourride@gmail.com",
  "googleDisplayName": "Your Name",
  "lastUsedAt": "2026-02-13T..."
}
```

### **6. Get Access Token for Upload**
```http
GET https://lmsapi.suraksha.lk/drive-access/token
Authorization: Bearer YOUR_JWT_TOKEN
```

Expected:
```json
{
  "accessToken": "ya29.a0...",
  "expiresIn": 3599,
  "expiresAt": "2026-02-13T..."
}
```

---

## 📸 Google Console - What It Should Look Like

### **Authorized JavaScript origins:**
```
┌────────────────────────────────────┐
│ https://lms.suraksha.lk            │  ← Production Frontend
│ https://lmsapi.suraksha.lk         │  ← Production Backend
│ http://localhost:8080              │  ← Local Frontend
│ http://localhost:8081              │  ← Local Backend
└────────────────────────────────────┘
```

### **Authorized redirect URIs:**
```
┌───────────────────────────────────────────────────────────┐
│ https://lmsapi.suraksha.lk/drive-access/callback          │  ← Production
│ http://localhost:8081/drive-access/callback               │  ← Local
└───────────────────────────────────────────────────────────┘
```

---

## ⚠️ Important Notes

### **SSL/HTTPS Required**
- Production OAuth **REQUIRES HTTPS** (except localhost)
- Make sure your domain has valid SSL certificate
- Redirect URIs must use `https://` protocol

### **DNS Configuration**
Verify your domains resolve correctly:
```powershell
nslookup lms.suraksha.lk
nslookup lmsapi.suraksha.lk
```

### **Firewall/Security**
- Port 3000 must be accessible (or use reverse proxy)
- CORS configured for `https://lms.suraksha.lk`
- Origin validation configured

### **Environment Switching**
To switch back to local development:
```env
NODE_ENV=development
PORT=8081
GOOGLE_DRIVE_CALLBACK_URI=http://localhost:8081/drive-access/callback
FRONTEND_URL=http://localhost:8080
```

---

## ✅ Production Checklist

Before going live:

- [ ] `.env` updated with production URLs
- [ ] Google Console has production URLs added
- [ ] Database migrations run on production DB
- [ ] SSL certificate installed and valid
- [ ] DNS records pointing to server
- [ ] CORS configured for production frontend
- [ ] Firewall allows backend API access
- [ ] `DRIVE_TOKEN_ENCRYPTION_KEY` backed up securely
- [ ] Google Drive API enabled in Cloud Console
- [ ] People API enabled in Cloud Console
- [ ] OAuth consent screen published (or test users added)
- [ ] Backend deployed and running on port 3000
- [ ] Frontend deployed on https://lms.suraksha.lk
- [ ] End-to-end OAuth flow tested in production

---

## 🎯 Summary

**Local Development:**
- Backend: `http://localhost:8081`
- Frontend: `http://localhost:8080`
- Callback: `http://localhost:8081/drive-access/callback`

**Production:**
- Backend: `https://lmsapi.suraksha.lk`
- Frontend: `https://lms.suraksha.lk`
- Callback: `https://lmsapi.suraksha.lk/drive-access/callback`

**Both configurations work simultaneously in Google Console!**

🚀 **Ready for production deployment!**
