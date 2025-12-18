# AWS S3 CORS Configuration

## ⚠️ CORS Required for Browser Uploads

CORS (Cross-Origin Resource Sharing) is **required** for client-side uploads from browser to AWS S3.

---

## 🔧 Configuration Steps

### 1. Go to AWS S3 Console
```
https://s3.console.aws.amazon.com/s3/buckets/suraksha-lms-main-bucket
```

### 2. Click on "Permissions" Tab

### 3. Scroll to "Cross-origin resource sharing (CORS)"

### 4. Click "Edit"

### 5. Paste This Configuration

```json
[
  {
    "AllowedHeaders": [
      "*"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST"
    ],
    "AllowedOrigins": [
      "https://lms.suraksha.lk",
      "https://org.suraksha.lk",
      "https://transport.suraksha.lk",
      "https://admin.suraksha.lk",
      "https://42a7fd4e-369f-4288-9aa1-22c217e09605.lovableproject.com",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:8080"
    ],
    "ExposeHeaders": [
      "ETag",
      "x-amz-request-id",
      "x-amz-server-side-encryption"
    ],
    "MaxAgeSeconds": 3000
  }
]
```

### 6. Click "Save changes"

---

## ✅ Verification

After configuring CORS, run the test:

```bash
node test-upload-system.js
```

You should see:
```
✅ CORS configured with 1 rule(s)
```

---

## 🔍 What This Does

| Setting | Purpose |
|---------|---------|
| **AllowedOrigins** | Only these domains can upload to S3 |
| **AllowedMethods** | GET (download), PUT/POST (upload) |
| **AllowedHeaders** | All headers allowed (flexible for signed URLs) |
| **ExposeHeaders** | Headers visible to JavaScript |
| **MaxAgeSeconds** | Browser caches CORS check for 50 minutes |

---

## 🚫 Without CORS

**Error in browser:**
```
Access to fetch at 'https://s3.amazonaws.com/...' from origin 
'https://lms.suraksha.lk' has been blocked by CORS policy
```

**Upload fails:** Client cannot upload files directly to S3

---

## ✅ With CORS

**Frontend can:**
- Upload files directly to S3
- Check upload status
- Download public files
- All from browser JavaScript

---

## 🔒 Security

CORS does NOT bypass authentication. It only allows:
- Your whitelisted domains to make requests
- Still requires valid presigned URL from backend
- Still enforces all security features (size limits, content types, etc.)

---

## 🧪 Testing CORS

```javascript
// Frontend test code
const formData = new FormData();
Object.keys(fields).forEach(key => formData.append(key, fields[key]));
formData.append('file', fileBlob);

const response = await fetch(uploadUrl, {
  method: 'POST',
  body: formData
});

// ✅ Should work without CORS errors
console.log('Upload successful:', response.ok);
```

---

## 📝 Production Checklist

- [ ] CORS configured in AWS S3 Console
- [ ] Only production domains in AllowedOrigins
- [ ] Remove localhost origins in production
- [ ] Test upload from production frontend
- [ ] Monitor CORS errors in CloudWatch

---

## 🆘 Troubleshooting

### Error: "No 'Access-Control-Allow-Origin' header"
**Solution:** CORS not configured. Follow steps above.

### Error: "CORS policy blocks origin 'https://newdomain.com'"
**Solution:** Add domain to AllowedOrigins list.

### Error: "Method POST not allowed by CORS"
**Solution:** Ensure "POST" is in AllowedMethods.

---

## 🎯 Summary

**Status:** ⚠️ CORS Not Configured Yet  
**Impact:** Browser uploads will fail  
**Action Required:** Follow steps above  
**Time to Fix:** 2 minutes  
**Priority:** HIGH (required for production)
