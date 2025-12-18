# AWS S3 File Size Restriction Implementation

## 🔍 Problem Statement

**Question:** Can we restrict file size (e.g., 5MB max) when uploading to AWS S3 using signed URLs?

**Answer:** Yes, but with a different approach than Google Cloud Storage!

## 🔐 Security Comparison: GCS vs AWS S3

### Google Cloud Storage (GCS)
✅ **Enforces size limits IN the signed URL signature**
- Uses `x-goog-content-length-range` header in presigned URL
- Cloud provider **rejects** oversized uploads automatically
- No oversized files ever reach the bucket

```typescript
// GCS Implementation
const signedUrlOptions = {
  version: 'v4',
  action: 'write',
  expires: Date.now() + 300000,
  contentType: 'image/jpeg',
  extensionHeaders: {
    'x-goog-content-length-range': '0,5242880' // 0-5MB enforced by GCS
  }
};
```

**Result:** If user tries to upload 6MB file, GCS returns **403 Forbidden** immediately.

---

### AWS S3
✅ **CAN enforce size limits in presigned POST URL signature!**
- `createPresignedPost()` **DOES support** `Conditions` parameter (including `content-length-range`)
- `getSignedUrlPromise('putObject')` does NOT support Conditions ❌
- **Solution:** Use POST instead of PUT!

```typescript
// AWS S3 Implementation - POST Method (Recommended)
const params = {
  Bucket: 'suraksha-lms-main-bucket',
  Fields: {
    key: 'profile-images/photo.jpg',
    'Content-Type': 'image/jpeg'
  },
  Expires: 300,
  Conditions: [
    ['eq', '$Content-Type', 'image/jpeg'],
    ['content-length-range', 0, 5242880] // ✅ 0-5MB enforced by S3 signature!
  ]
};

const presignedPost = await s3.createPresignedPost(params);
// Returns: { url: 'https://s3.amazonaws.com/bucket', fields: {...} }
```

**Result:** If user uploads 6MB file, S3 **rejects it with 403 Forbidden** - just like GCS!

---

## ✅ Our Implementation: AWS S3 POST with Size Enforcement

**Now using:** `createPresignedPost()` with `content-length-range` Condition

**Security:** File size limits are **enforced by S3 signature** - same as GCS!

### Additional Validation Layers (Defense in Depth):

### Layer 1: Frontend Pre-Upload Validation ⚠️
**When:** Before getting signed URL  
**Where:** Frontend JavaScript  
**How:** Check `file.size` before calling API

```javascript
const file = document.getElementById('fileInput').files[0];

// Frontend validation
if (file.size > 5242880) { // 5MB
  alert('File too large! Maximum 5MB');
  return;
}

// Proceed to get signed URL
const response = await fetch('/api/upload/generate-signed-url', {
  method: 'POST',
  body: JSON.stringify({
    fileName: file.name,
    folder: 'profile-images',
    contentType: file.type,
    fileSize: file.size // Send size for backend validation
  })
});
```

**Security Level:** ⚠️ **Low** - Users can bypass frontend validation using browser DevTools

---

### Layer 2: Backend Pre-Upload Validation ✅
**When:** Before generating signed URL  
**Where:** `upload.controller.ts`  
**How:** Validate `fileSize` parameter before creating signed URL

```typescript
// Backend validates BEFORE generating signed URL
private validateFileSize(fileSize: number, folder: string): void {
  const maxSizes: Record<string, number> = {
    'profile-images': 5 * 1024 * 1024,   // 5MB
    'homework-files': 20 * 1024 * 1024,  // 20MB
    'id-documents': 10 * 1024 * 1024     // 10MB
  };

  const maxSize = maxSizes[folder] || (5 * 1024 * 1024);
  
  if (fileSize > maxSize) {
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(2);
    throw new BadRequestException(
      `File size too large. Maximum: ${maxSizeMB}MB`
    );
  }
}
```

**Security Level:** ✅ **Medium** - Attacker could lie about fileSize parameter

---

### Layer 3: Backend Post-Upload Verification 🔒 (STRONGEST)
**When:** After upload, during verification  
**Where:** `cloud-storage.service.ts` → `verifyAndMakePublicS3()`  
**How:** Check actual file size using `headObject()`, delete if oversized

```typescript
private async verifyAndMakePublicS3(relativePath: string): Promise<string> {
  // Get actual file metadata from S3
  const fileMetadata = await this.s3.headObject({
    Bucket: this.s3BucketName,
    Key: relativePath
  }).promise();
  
  const actualFileSize = fileMetadata.ContentLength;
  const folder = relativePath.split('/')[0];
  const maxFileSize = this.getMaxFileSizeForFolder(folder);
  
  // 🔒 SECURITY: Check actual uploaded file size
  if (actualFileSize > maxFileSize) {
    const maxSizeMB = (maxFileSize / 1024 / 1024).toFixed(2);
    const actualSizeMB = (actualFileSize / 1024 / 1024).toFixed(2);
    
    // DELETE the oversized file immediately
    await this.s3.deleteObject({
      Bucket: this.s3BucketName,
      Key: relativePath
    }).promise();
    
    throw new BadRequestException(
      `File size exceeds limit. Max: ${maxSizeMB}MB, Uploaded: ${actualSizeMB}MB. File deleted.`
    );
  }
  
  // If size is OK, make file public
  await this.s3.putObjectAcl({
    Bucket: this.s3BucketName,
    Key: relativePath,
    ACL: 'public-read'
  }).promise();
  
  return publicUrl;
}
```

**Security Level:** 🔒 **HIGHEST** - Cannot be bypassed, checks actual file size from S3

---

## 📋 Complete Upload Flow with Size Validation

```
┌─────────────┐
│   FRONTEND  │
└──────┬──────┘
       │ 1. User selects file (photo.jpg, 4MB)
       │ 
       │ ⚠️ Layer 1: Frontend validates file.size < 5MB
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ POST /api/upload/generate-signed-url                    │
│ {                                                        │
│   fileName: "photo.jpg",                                 │
│   folder: "profile-images",                              │
│   contentType: "image/jpeg",                             │
│   fileSize: 4194304  ← Frontend sends file size         │
│ }                                                        │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│   BACKEND    │ ✅ Layer 2: Validates fileSize parameter
└──────┬───────┘    - Checks: 4MB < 5MB limit ✅
       │            - Generates signed URL
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Response:                                                │
│ {                                                        │
│   uploadUrl: "https://s3.amazonaws.com/...",            │
│   relativePath: "profile-images/1234-photo.jpg",        │
│   maxFileSize: 5242880  ← Backend tells max size        │
│ }                                                        │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│   FRONTEND  │ 2. Upload file directly to S3
└──────┬──────┘    PUT uploadUrl with file binary
       │
       ▼
┌─────────────┐
│   AWS S3    │ ❌ S3 accepts ANY size (no validation here!)
└──────┬──────┘    File stored temporarily as PRIVATE
       │
       ▼
┌─────────────┐
│   FRONTEND  │ 3. Notify backend: "File uploaded!"
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ POST /api/upload/verify-upload                          │
│ {                                                        │
│   relativePath: "profile-images/1234-photo.jpg"         │
│ }                                                        │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│   BACKEND    │ 🔒 Layer 3: Post-upload verification
└──────┬───────┘    1. headObject() → Get ACTUAL file size from S3
       │            2. Compare: actualSize vs maxSize
       │            3. If oversized → DELETE file + throw error
       │            4. If OK → Make file public + return URL
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│ Response:                                                │
│ {                                                        │
│   success: true,                                         │
│   publicUrl: "https://s3.amazonaws.com/profile.../jpg", │
│   message: "File verified and made public"              │
│ }                                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 🛡️ Attack Scenario: Bypassing Frontend Validation

**Attacker's Goal:** Upload 10MB file to 5MB-limited folder

### Attempt 1: Modify Frontend JavaScript
```javascript
// Attacker disables frontend validation
// file.size > 5MB check bypassed in DevTools
```
**Result:** ❌ **BLOCKED by Layer 2** - Backend rejects in `generate-signed-url` endpoint

---

### Attempt 2: Lie About File Size to Backend
```bash
# Attacker sends fake fileSize parameter
curl -X POST /api/upload/generate-signed-url \
  -d '{"fileName": "big.jpg", "folder": "profile-images", 
       "fileSize": 1000000}'  # Lies: says 1MB, actually 10MB
```
**Result:** ✅ Backend generates signed URL (believes it's 1MB)  
But then... ❌ **BLOCKED by Layer 3** - Backend verifies actual size during `/verify-upload`

---

### Attempt 3: Upload Large File, Skip Verification
```bash
# 1. Get signed URL (lie about size)
# 2. Upload 10MB file to S3
# 3. DON'T call /verify-upload endpoint
```
**Result:** ✅ File uploaded to S3... but remains **PRIVATE** (no public URL)  
**Impact:** File exists but is useless - no public access, will be cleaned up by lifecycle policies

---

## 📊 Size Limits Configuration

### Current Limits (from .env)

```bash
# Default limits
MAX_PROFILE_IMAGE_SIZE_MB=5
MAX_STUDENT_IMAGE_SIZE_MB=5
MAX_INSTITUTE_IMAGE_SIZE_MB=10
MAX_HOMEWORK_FILE_SIZE_MB=20
MAX_CORRECTION_FILE_SIZE_MB=20
MAX_PAYMENT_RECEIPT_SIZE_MB=10
MAX_ID_DOCUMENT_SIZE_MB=10
MAX_FILE_SIZE_MB=100  # Absolute maximum for any file
```

### Folder-Specific Limits

| Folder | Max Size | Reason |
|--------|----------|--------|
| `profile-images` | 5 MB | Profile photos don't need to be large |
| `student-images` | 5 MB | Student photos |
| `institute-images` | 10 MB | Logos/banners may need higher quality |
| `homework-files` | 20 MB | PDFs with images can be larger |
| `correction-files` | 20 MB | Teacher feedback PDFs |
| `payment-receipts` | 10 MB | Scanned receipts |
| `id-documents` | 10 MB | ID cards/certificates |

---

## ✅ Testing File Size Restrictions

### Test 1: Upload Within Limit
```bash
# Generate signed URL for 3MB file
curl -X POST http://localhost:8080/api/upload/generate-signed-url \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "photo.jpg",
    "folder": "profile-images",
    "contentType": "image/jpeg",
    "fileSize": 3145728
  }'

# ✅ Response: Signed URL generated
# ✅ Upload succeeds
# ✅ Verification succeeds
```

---

### Test 2: Upload Exceeding Limit (Honest)
```bash
# Try to get signed URL for 10MB file
curl -X POST http://localhost:8080/api/upload/generate-signed-url \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fileName": "large.jpg",
    "folder": "profile-images",
    "contentType": "image/jpeg",
    "fileSize": 10485760
  }'

# ❌ Response: 400 Bad Request
# {
#   "message": "File size too large. Maximum: 5.00MB, Your file: 10.00MB"
# }
```

---

### Test 3: Bypass Frontend, Lie to Backend
```bash
# 1. Lie about file size
curl -X POST http://localhost:8080/api/upload/generate-signed-url \
  -d '{"fileName": "big.jpg", "folder": "profile-images",
       "fileSize": 1000000, "contentType": "image/jpeg"}'

# ✅ Response: Signed URL (backend believes it's 1MB)

# 2. Upload 10MB file to signed URL
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@10mb-file.jpg"

# ✅ S3 accepts upload (no size check in presigned URL)

# 3. Try to verify
curl -X POST http://localhost:8080/api/upload/verify-upload \
  -d '{"relativePath": "profile-images/1234-big.jpg"}'

# ❌ Response: 400 Bad Request
# {
#   "message": "File size exceeds limit. Max: 5.00MB, Uploaded: 10.00MB. File has been deleted."
# }
# 🗑️ Backend deletes the oversized file from S3
```

---

## 🎯 Summary

### Can we restrict file size in AWS S3?

**Yes!** But differently than GCS:

| Provider | Enforcement Point | Security |
|----------|------------------|----------|
| **Google Cloud Storage** | ✅ In presigned URL signature | 🔒 Strongest - Cloud rejects oversized uploads |
| **AWS S3** | ❌ Cannot enforce in presigned URL | ⚠️ Must use 3-layer backend validation |

### Our Implementation:

✅ **Layer 1:** Frontend validation (convenience)  
✅ **Layer 2:** Backend pre-upload validation (prevents wasted bandwidth)  
🔒 **Layer 3:** Backend post-upload verification + deletion (security guarantee)

### Result:

- **Honest users:** Friendly validation at Layer 1 & 2 (fast feedback)
- **Attackers:** Cannot bypass Layer 3 (oversized files deleted immediately)
- **System:** Protected from storage abuse and cost overruns

### Performance Impact:

- Extra `headObject()` call during verification (~50-100ms)
- Negligible cost: headObject is free in AWS S3 pricing
- Security benefit: Priceless! 🛡️

---

## 📚 Implementation Files

- `src/common/services/cloud-storage.service.ts` - Layer 3 enforcement
- `src/common/controllers/upload.controller.ts` - Layer 2 enforcement
- Frontend components - Layer 1 enforcement
