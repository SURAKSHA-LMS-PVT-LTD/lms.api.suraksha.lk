# 🔄 Multer to Signed URL Migration Guide

## Overview

This document outlines the migration from **Multer-based file uploads** to **Signed URL direct uploads** across the entire LMS system.

---

## 🎯 Why Migrate?

### Problems with Multer:
- ❌ Files go through backend (uses bandwidth & memory)
- ❌ Backend becomes bottleneck for large files
- ❌ Difficult to implement progress tracking
- ❌ Memory intensive for concurrent uploads
- ❌ Requires cleanup logic for failed uploads

### Benefits of Signed URLs:
- ✅ Direct client-to-cloud uploads (bypasses backend)
- ✅ No backend bandwidth/memory usage
- ✅ Scalable for any file size
- ✅ Built-in progress tracking on client
- ✅ Short-lived private URLs (10 min)
- ✅ Backend verification before making public
- ✅ No cleanup needed (TTL auto-expires)

---

## 🔐 New Upload Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 1. Request signed URL
       │    POST /upload/generate-signed-url
       │    { folder, fileName, contentType, fileSize }
       ▼
┌─────────────┐
│   Backend   │
└──────┬──────┘
       │
       │ 2. Validate & Generate
       │    - Validate file extension
       │    - Validate file size
       │    - Generate 10-min private URL
       ▼
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 3. Upload directly
       │    PUT uploadUrl
       │    (File goes straight to cloud)
       ▼
┌─────────────┐
│Cloud Storage│
└──────┬──────┘
       │
       │ 4. Verify & Publish
       │    POST /upload/verify-and-publish
       │    { relativePath }
       ▼
┌─────────────┐
│   Backend   │
└──────┬──────┘
       │
       │ 5. Make public & return URL
       │    - Verify file exists
       │    - Make publicly accessible
       │    - Return long-term public URL
       ▼
┌─────────────┐
│   Client    │
└─────────────┘
```

---

## 📝 Implementation Guide

### Step 1: Frontend - Request Signed URL

```javascript
// Get file from input
const file = document.getElementById('fileInput').files[0];

// Request signed URL
const response = await fetch('/upload/generate-signed-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    folder: 'profile-images',
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size  // REQUIRED for validation
  })
});

const { uploadUrl, relativePath } = await response.json();
```

### Step 2: Frontend - Upload to Cloud

```javascript
// Upload directly to cloud storage
await fetch(uploadUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': file.type
  },
  body: file
});
```

### Step 3: Frontend - Verify & Get Public URL

```javascript
// Verify and make public
const verifyResponse = await fetch('/upload/verify-and-publish', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    relativePath
  })
});

const { publicUrl } = await verifyResponse.json();

// Now use publicUrl in your API calls
await fetch('/users/comprehensive', {
  method: 'POST',
  body: JSON.stringify({
    firstName: 'John',
    lastName: 'Doe',
    imageUrl: publicUrl  // ← Use the verified public URL
  })
});
```

---

## 🔧 Backend Changes

### Controllers to Update

All controllers with these patterns need updating:

```typescript
// ❌ OLD (Multer-based)
@UseInterceptors(FileInterceptor('image'))
async create(
  @Body() dto: CreateDto,
  @UploadedFile() image: Express.Multer.File
) {
  // Upload file
  const result = await this.cloudStorage.uploadProfileImage(image, userId);
  
  // Create record
  await this.service.create({ ...dto, imageUrl: result.url });
}

// ✅ NEW (Signed URL-based)
async create(@Body() dto: CreateDto) {
  // imageUrl already in DTO - no file upload needed
  await this.service.create(dto);
}
```

### DTOs to Update

```typescript
// Add imageUrl field to all DTOs
export class CreateUserDto {
  // ... other fields
  
  @ApiPropertyOptional({ 
    description: 'Profile image URL (from /upload/generate-signed-url)',
    example: 'https://storage.googleapis.com/suraksha-lms/profile-images/user-123.jpg'
  })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}
```

### Services to Update

```typescript
// Remove file parameter, use imageUrl from DTO
async create(dto: CreateUserDto) {
  // imageUrl is already validated and public
  const user = this.repository.create(dto);
  return this.repository.save(user);
}
```

---

## 📋 Migration Checklist

### Controllers with Multer (Need Update):

- [ ] `user.controller.ts` - Profile photo upload
- [ ] `user-profile-image.controller.ts` - Profile & ID images (DONE ✅)
- [ ] `first-login.controller.ts` - First login profile image
- [ ] `institute.controller.ts` - Institute logo/image
- [ ] `institue_user.controller.ts` - Institute user images (6 endpoints)
- [ ] `subject.controller.ts` - Subject thumbnails (2 endpoints)
- [ ] `student.controller.ts` - Student photos
- [ ] `institue_class.controller.ts` - Class images (3 endpoints)
- [ ] `organization.controller.ts` - Organization images (2 endpoints)
- [ ] `payment.controller.ts` - Payment receipts
- [ ] `institute-payment-submission.controller.ts` - Payment proof
- [ ] `institute-class-subject-payment-submission.controller.ts` - Receipt upload
- [ ] `sms.controller.ts` - Payment slip upload
- [ ] `homework-submission.controller.ts` - Homework file upload (2 endpoints)

### Services with Multer References:

- [ ] `user.service.ts` - uploadMulterFile references
- [ ] `subject.service.ts` - imageFile parameters
- [ ] `student.service.ts` - image parameter
- [ ] `institute-payment.service.ts` - file parameter

### Modules to Update:

- [ ] `payment.module.ts` - Remove MulterModule import

---

## 🔒 Security Features

### File Extension Validation

```typescript
// Only proper extensions allowed
✅ .jpg, .jpeg, .png, .pdf
❌ .mysql.jpg, .exe.png, .php.jpg
```

### File Size Validation

Reads from environment variables:

```env
MAX_PROFILE_IMAGE_SIZE_MB=5
MAX_STUDENT_IMAGE_SIZE_MB=5
MAX_INSTITUTE_IMAGE_SIZE_MB=10
MAX_HOMEWORK_FILE_SIZE_MB=20
MAX_FILE_SIZE_MB=100  # Absolute maximum
```

### Short-Lived Private URLs

- Upload URLs expire in 10 minutes
- Files are PRIVATE after upload
- Requires backend verification to make public

---

## 🎓 Best Practices

### 1. Always Validate File Size on Client

```javascript
if (file.size > 5 * 1024 * 1024) {
  alert('File too large. Maximum: 5MB');
  return;
}
```

### 2. Show Upload Progress

```javascript
const xhr = new XMLHttpRequest();
xhr.upload.addEventListener('progress', (e) => {
  const percent = (e.loaded / e.total) * 100;
  console.log(`Upload progress: ${percent}%`);
});
xhr.open('PUT', uploadUrl);
xhr.send(file);
```

### 3. Handle Upload Errors

```javascript
try {
  await uploadToCloud(uploadUrl, file);
} catch (error) {
  console.error('Upload failed:', error);
  // Show user-friendly error message
}
```

### 4. Use Relative Paths in Database

```typescript
// ✅ GOOD - Store relative path
imageUrl: 'profile-images/user-123.jpg'

// ❌ BAD - Don't store full URL
imageUrl: 'https://storage.googleapis.com/suraksha-lms/profile-images/user-123.jpg'
```

---

## 🚀 Deployment Checklist

### Environment Variables

- [ ] Add file size limits to `.env`
- [ ] Configure `SIGNED_URL_EXPIRY_SECONDS`
- [ ] Verify `GCS_BUCKET_NAME` is correct
- [ ] Test with production credentials

### Testing

- [ ] Test signed URL generation
- [ ] Test direct upload to cloud
- [ ] Test verification endpoint
- [ ] Test with various file sizes
- [ ] Test with invalid extensions
- [ ] Test expired URLs (wait 10 min)

### Documentation

- [ ] Update API documentation
- [ ] Update frontend documentation
- [ ] Create migration guide for frontend team
- [ ] Document error codes

---

## 📊 Performance Comparison

### Multer (Old):

```
File → Client → Backend → Cloud Storage
       |         ▲    ▼
       |      Uses backend
       |      bandwidth & memory
       └────────────────────────
```

**10MB File Upload:**
- Backend bandwidth: 10MB (upload) + 10MB (to cloud) = 20MB
- Backend memory: ~10MB
- Time: ~5-10 seconds (depends on backend speed)

### Signed URL (New):

```
File → Client → Cloud Storage
       |         ▲
       |         |
       └─────────┘ (Direct)
```

**10MB File Upload:**
- Backend bandwidth: < 1KB (just URL generation)
- Backend memory: < 1MB
- Time: ~2-3 seconds (full client bandwidth)

---

## 🐛 Common Issues & Solutions

### Issue: "File not found" after upload

**Solution:** Ensure you're calling `/upload/verify-and-publish` with the correct `relativePath`

### Issue: Upload URL expired

**Solution:** URLs expire in 10 minutes. Generate a new one if upload takes longer.

### Issue: File is private after upload

**Solution:** This is intentional. Call `/upload/verify-and-publish` to make it public.

### Issue: File size validation fails

**Solution:** Check that `fileSize` in request matches actual file size.

---

## 📞 Support

For questions or issues during migration:
- Check this documentation first
- Review the implementation in `upload.controller.ts`
- Test with `/upload/generate-signed-url` endpoint
- Contact backend team for assistance

---

**Migration Status:** ✅ Upload system implemented, controllers need updating
**Last Updated:** November 8, 2025
