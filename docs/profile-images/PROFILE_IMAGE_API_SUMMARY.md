# Profile Image Management API - Quick Reference

## Overview
System Admin APIs for managing user profile images with direct cloud storage upload using signed URLs.

---

## API Endpoints

### Student ID Based (Use when you have Student ID like "STU-20260123-001")

```
GET    /admin/users/student/lookup/:studentId
POST   /admin/users/student/profile-image/generate-url
POST   /admin/users/student/profile-image/assign
POST   /admin/users/student/:studentId/profile-image (Quick method)
```

### User ID Based (Use when you have User ID like 123)

```
GET    /admin/users/lookup/:userId
POST   /admin/users/profile-image/generate-url
POST   /admin/users/profile-image/assign
POST   /admin/users/:userId/profile-image (Quick method)
```

---

## Workflow

### 3-Step Process (Recommended)

1. **Lookup** (Optional but recommended)
   ```
   GET /admin/users/student/lookup/STU-20260123-001
   or
   GET /admin/users/lookup/123
   ```
   Returns current profile image and user details.

2. **Generate URL**
   ```
   POST /admin/users/student/profile-image/generate-url
   {
     "studentId": "STU-20260123-001",
     "fileName": "profile.jpg",
     "contentType": "image/jpeg",
     "fileSize": 1048576
   }
   
   or
   
   POST /admin/users/profile-image/generate-url
   {
     "userId": 123,
     "fileName": "profile.jpg",
     "contentType": "image/jpeg",
     "fileSize": 1048576
   }
   ```
   Returns signed upload URL (expires in 10 minutes).

3. **Upload to Cloud** (Frontend)
   ```javascript
   // Direct PUT to signed URL
   await fetch(uploadUrl, {
     method: 'PUT',
     headers: { 'Content-Type': 'image/jpeg' },
     body: fileBlob
   });
   ```

4. **Assign Image**
   ```
   POST /admin/users/student/profile-image/assign
   {
     "studentId": "STU-20260123-001",
     "relativePath": "profile-images/123/1737628800000_profile.jpg"
   }
   
   or
   
   POST /admin/users/profile-image/assign
   {
     "userId": 123,
     "relativePath": "profile-images/123/1737628800000_profile.jpg"
   }
   ```
   Updates user.imageUrl in database.

---

## File Requirements

| Property | Requirement |
|----------|------------|
| **Max Size** | 5MB (5,242,880 bytes) |
| **Allowed Types** | `image/jpeg`, `image/png`, `image/gif`, `image/webp` |
| **URL Expiry** | 10 minutes |
| **Storage Path** | `profile-images/{userId}/{timestamp}_{filename}` |

---

## Response Examples

### Generate URL Response
```json
{
  "success": true,
  "studentId": "STU-20260123-001",
  "userId": "123",
  "studentName": "John Doe",
  "uploadUrl": "https://storage.googleapis.com/...",
  "relativePath": "profile-images/123/1737628800000_profile.jpg",
  "expiresAt": "2026-01-23T13:07:00.000Z",
  "contentType": "image/jpeg"
}
```

### Assign Image Response
```json
{
  "success": true,
  "studentId": "STU-20260123-001",
  "userId": "123",
  "studentName": "John Doe",
  "imageUrl": "https://storage.googleapis.com/profile-images/123/1737628800000_profile.jpg",
  "previousImageUrl": "https://storage.googleapis.com/old-image.jpg",
  "message": "Profile image updated successfully"
}
```

---

## Implementation Files

- **Controller**: `src/modules/user/controllers/system-admin-user.controller.ts`
  - 8 new endpoints (4 for student ID, 4 for user ID)
  
- **Service**: `src/modules/user/services/system-admin-user.service.ts`
  - 6 new methods (3 for student ID, 3 for user ID)
  
- **DTOs**: `src/modules/user/dto/create-family-unit.dto.ts`
  - GenerateProfileImageUrlByUserIdDto
  - AssignProfileImageByUserIdDto
  
- **Frontend Guide**: `PROFILE_IMAGE_FRONTEND_GUIDE.md`
  - Complete implementation examples
  - React, Vue.js components
  - Error handling
  - Best practices

---

## Quick Test (Postman/Swagger)

1. **Get Auth Token** (System Admin)
2. **Lookup User**
   ```
   GET /admin/users/lookup/123
   Authorization: Bearer {token}
   ```

3. **Generate Upload URL**
   ```
   POST /admin/users/:userId/profile-image
   {
     "fileName": "test.jpg",
     "contentType": "image/jpeg",
     "fileSize": 50000
   }
   ```

4. **Upload File** (use uploadUrl from step 3)
   ```
   PUT {uploadUrl}
   Content-Type: image/jpeg
   Body: [binary file data]
   ```

5. **Assign Image**
   ```
   POST /admin/users/profile-image/assign
   {
     "userId": 123,
     "relativePath": "{relativePath from step 3}"
   }
   ```

---

## Security Features

✅ JWT Authentication required  
✅ System Admin role required  
✅ Signed URLs (10-minute expiry)  
✅ File type validation  
✅ File size validation (5MB max)  
✅ File existence verification before assignment  
✅ Audit logging

---

## Error Handling

| Error | Reason |
|-------|--------|
| 404 Not Found | Student/User doesn't exist |
| 400 Bad Request | Invalid file type or size exceeds 5MB |
| 400 Bad Request | File not found in storage after upload |
| 401 Unauthorized | Missing or invalid auth token |
| 403 Forbidden | Not a System Admin |

---

## Frontend Integration

See [PROFILE_IMAGE_FRONTEND_GUIDE.md](./PROFILE_IMAGE_FRONTEND_GUIDE.md) for:
- Complete React/Vue.js components
- Upload progress tracking
- Image compression
- Error handling
- Complete workflow examples

---

**Implementation Date**: January 23, 2026  
**Status**: ✅ Complete and Tested
