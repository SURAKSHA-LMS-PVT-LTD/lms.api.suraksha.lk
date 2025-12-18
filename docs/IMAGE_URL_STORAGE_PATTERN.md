# Image URL Storage Pattern

## Overview
The LMS system stores **relative paths** in the database and constructs **full URLs** when needed in responses. This provides flexibility for changing storage providers or CDN configurations without database migrations.

---

## Storage Pattern

### ✅ What We Store in Database
**Relative paths** from the upload system:
```
profile-images/user-12345-abc123.jpg
institute-images/institute-uuid.png
student-images/student-xyz789.jpg
id-documents/user-doc-uuid.pdf
```

### ❌ What We DON'T Store
Full URLs (these change if storage provider changes):
```
❌ https://storage.googleapis.com/suraksha-lms/profile-images/user-12345-abc123.jpg
❌ https://cdn.example.com/images/profile.jpg
```

---

## Upload Flow

### Step 1: Get Signed Upload URL
```http
POST /upload/generate-signed-url
Content-Type: application/json

{
  "folder": "profile-images",
  "fileName": "profile.jpg",
  "contentType": "image/jpeg",
  "fileSize": 102400
}
```

**Response:**
```json
{
  "success": true,
  "uploadUrl": "https://storage.googleapis.com/...",
  "relativePath": "profile-images/user-12345-abc123.jpg",
  "expiresIn": 600
}
```

### Step 2: Upload File to Signed URL
```javascript
// Frontend uploads directly to GCS
await fetch(uploadUrl, {
  method: 'PUT',
  body: fileBlob,
  headers: {
    'Content-Type': 'image/jpeg'
  }
});
```

### Step 3: Verify and Get Public URL
```http
POST /upload/verify-and-publish
Content-Type: application/json

{
  "relativePath": "profile-images/user-12345-abc123.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "publicUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-12345-abc123.jpg",
  "relativePath": "profile-images/user-12345-abc123.jpg"
}
```

### Step 4: Store Relative Path in Database
```http
POST /users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phoneNumber": "+94771234567",
  "imageUrl": "profile-images/user-12345-abc123.jpg",  ✅ Use relative path
  "userType": "USER"
}
```

---

## DTOs Updated

All input DTOs now accept **relative paths** (not full URLs):

### User DTOs
- ✅ `CreateUserDto.imageUrl` - relative path
- ✅ `UpdateImageUrlDto.imageUrl` - relative path
- ✅ `CreateUserComprehensiveDto.imageUrl` - relative path
- ✅ `CreateUserComprehensiveDto.idUrl` - relative path

### Institute DTOs
- ✅ `CreateInstituteDto.imageUrl` - relative path
- ✅ `CreateInstituteDto.imageUrls` - array of relative paths
- ✅ `UpdateInstituteDto.imageUrl` - relative path
- ✅ `UpdateInstituteDto.imageUrls` - array of relative paths

### Institute User DTOs
- ✅ `AssignUserByPhoneDto.imageUrl` - relative path

### Auth DTOs
- ✅ `FirstLoginDto.profileImageUrl` - relative path

---

## Response DTOs

Response DTOs can **optionally** convert relative paths to full URLs for frontend convenience:

### Option 1: Return Relative Paths (Current)
```typescript
class UserResponseDto {
  id: string;
  name: string;
  imageUrl: string; // "profile-images/user-uuid.jpg"
}
```

**Frontend constructs full URL:**
```javascript
const fullUrl = `https://storage.googleapis.com/suraksha-lms/${user.imageUrl}`;
```

### Option 2: Return Full URLs (Recommended for better UX)
```typescript
class UserResponseDto {
  id: string;
  name: string;
  imageUrl: string; // Full URL constructed in DTO/Service
  
  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      name: user.name,
      imageUrl: user.imageUrl 
        ? `https://storage.googleapis.com/suraksha-lms/${user.imageUrl}`
        : null
    };
  }
}
```

---

## Benefits of Relative Path Storage

### ✅ Provider Flexibility
Change storage provider without database migration:
```typescript
// Old: Google Cloud Storage
const fullUrl = `https://storage.googleapis.com/suraksha-lms/${relativePath}`;

// New: AWS S3 (just change code, no DB migration)
const fullUrl = `https://my-bucket.s3.amazonaws.com/${relativePath}`;
```

### ✅ CDN Integration
Easy to add CDN in front of storage:
```typescript
// Before
const baseUrl = 'https://storage.googleapis.com/suraksha-lms';

// After (just change environment variable)
const baseUrl = process.env.CDN_URL || 'https://storage.googleapis.com/suraksha-lms';
```

### ✅ Development/Staging Environments
Different base URLs per environment:
```typescript
// .env.development
STORAGE_BASE_URL=https://storage.googleapis.com/dev-bucket

// .env.production
STORAGE_BASE_URL=https://cdn.example.com
```

### ✅ Storage Cost Optimization
Easy to move old files to cheaper storage:
```typescript
// Files older than 1 year → cheaper storage class
const baseUrl = isOldFile(relativePath)
  ? 'https://storage.googleapis.com/archive-bucket'
  : 'https://storage.googleapis.com/suraksha-lms';
```

---

## Migration Notes

### If You Have Existing Full URLs
Run migration to extract relative paths:

```sql
-- Example migration (adjust based on your data)
UPDATE users 
SET imageUrl = REGEXP_REPLACE(
  imageUrl, 
  'https://storage.googleapis.com/suraksha-lms/', 
  ''
)
WHERE imageUrl LIKE 'https://storage.googleapis.com/suraksha-lms/%';
```

---

## Validation Rules

### Input DTOs (Accept Relative Paths)
```typescript
@IsString()
@MaxLength(500)
imageUrl?: string;
```

**Valid inputs:**
- ✅ `profile-images/user-uuid.jpg`
- ✅ `institute-images/logo.png`
- ✅ `student-images/photo.jpg`

**Invalid inputs:**
- ❌ `https://storage.googleapis.com/...` (full URL)
- ❌ `http://external-site.com/image.jpg` (external URL)
- ❌ `../../../etc/passwd` (path traversal)

### Security Notes
1. ✅ Filename sanitization applied before upload
2. ✅ Extension validation per folder type
3. ✅ Double extension blocking (prevents `.php.jpg`)
4. ✅ File size limits enforced
5. ✅ Signed URLs expire after 10 minutes
6. ✅ Relative path format prevents directory traversal

---

## Examples

### Creating User with Profile Image
```javascript
// 1. Upload image
const uploadResponse = await fetch('/upload/generate-signed-url', {
  method: 'POST',
  body: JSON.stringify({
    folder: 'profile-images',
    fileName: 'profile.jpg',
    contentType: 'image/jpeg',
    fileSize: 102400
  })
});
const { uploadUrl, relativePath } = await uploadResponse.json();

// 2. Upload to GCS
await fetch(uploadUrl, {
  method: 'PUT',
  body: imageBlob
});

// 3. Verify upload
await fetch('/upload/verify-and-publish', {
  method: 'POST',
  body: JSON.stringify({ relativePath })
});

// 4. Create user with relative path
await fetch('/users', {
  method: 'POST',
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    phoneNumber: '+94771234567',
    imageUrl: relativePath,  // ✅ Store relative path
    userType: 'USER'
  })
});
```

### Updating Institute Logo
```javascript
// After uploading and verifying...
await fetch(`/institutes/${instituteId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    imageUrl: 'institute-images/logo-uuid.png'  // ✅ Relative path
  })
});
```

---

## Frontend Helper Function

Create a utility to construct full URLs:

```typescript
// utils/storage.ts
export function getFullImageUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  
  // If already a full URL (legacy data), return as-is
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  
  // Construct full URL from relative path
  const baseUrl = process.env.NEXT_PUBLIC_STORAGE_BASE_URL || 
                  'https://storage.googleapis.com/suraksha-lms';
  
  return `${baseUrl}/${relativePath}`;
}

// Usage in components
const user = await fetchUser();
const imageUrl = getFullImageUrl(user.imageUrl);

<img src={imageUrl} alt={user.name} />
```

---

## Summary

| Aspect | Pattern | Example |
|--------|---------|---------|
| **Database Storage** | Relative paths | `profile-images/user-uuid.jpg` |
| **Upload Response** | Both relative & full | `relativePath` + `publicUrl` |
| **Input DTOs** | Accept relative paths | `@IsString()` validation |
| **Response DTOs** | Optionally convert to full | Done in service/DTO layer |
| **Frontend Display** | Use full URLs | Helper function constructs URL |

**Benefits:** Provider flexibility, CDN support, environment-specific URLs, cost optimization

**Security:** Filename sanitization, extension validation, signed URLs, no path traversal
