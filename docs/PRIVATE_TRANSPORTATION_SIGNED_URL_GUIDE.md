# Private Transportation Module - Signed URL Upload Guide

## Overview
The Private Transportation (Bookhire) module now uses **signed URL client-side upload** for all image uploads, eliminating Multer file processing and improving security and scalability.

## Image Types

### 1. Vehicle Images (`bookhire-vehicle-images`)
- **Used for**: Bookhire vehicle photos
- **Entity field**: `BookhireEntity.vehicleImages` (array of strings)
- **Max file size**: 5MB (configurable via `MAX_BOOKHIRE_VEHICLE_IMAGE_SIZE_MB`)
- **Allowed formats**: `.jpg`, `.jpeg`, `.png`, `.webp`

### 2. Owner Profile Images (`bookhire-owner-images`)
- **Used for**: Bookhire owner profile photos
- **Entity field**: `BookhireOwnerEntity.profileImage` (string)
- **Max file size**: 5MB (configurable via `MAX_BOOKHIRE_OWNER_IMAGE_SIZE_MB`)
- **Allowed formats**: `.jpg`, `.jpeg`, `.png`, `.webp`

## Upload Flow

### Step 1: Generate Signed URL
Request a signed upload URL from the backend:

**Endpoint**: `POST /upload/generate-signed-url` or `GET /upload/get-signed-url`

**Request (POST)**:
```json
{
  "folder": "bookhire-vehicle-images",
  "fileName": "vehicle-front.jpg",
  "contentType": "image/jpeg",
  "fileSize": 2048576
}
```

**Request (GET)**:
```
GET /upload/get-signed-url?folder=bookhire-vehicle-images&fileName=vehicle-front.jpg&contentType=image/jpeg&fileSize=2048576
```

**Response**:
```json
{
  "success": true,
  "message": "SHORT-LIVED private upload URL generated (expires in 10 minutes)",
  "data": {
    "uploadUrl": "https://storage.googleapis.com/suraksha-lms/bookhire-vehicle-images/vehicle-front-uuid.jpg?X-Goog-Algorithm=...",
    "relativePath": "bookhire-vehicle-images/vehicle-front-uuid.jpg",
    "expiresAt": "2025-01-08T12:10:00.000Z",
    "maxFileSize": 5242880,
    "contentType": "image/jpeg"
  },
  "instructions": {
    "uploadMethod": "PUT",
    "headers": {
      "Content-Type": "image/jpeg",
      "x-goog-content-length-range": "0,5242880"
    }
  }
}
```

### Step 2: Upload File to GCS
Upload the file directly to Google Cloud Storage using the signed URL:

**Client-side Example (JavaScript/Fetch)**:
```javascript
const response = await fetch(uploadUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': contentType,
    'x-goog-content-length-range': `0,${maxFileSize}`
  },
  body: fileBlob
});

if (!response.ok) {
  throw new Error('Upload failed');
}
```

**Important**:
- Use **PUT** method (not POST)
- Include **Content-Type** header matching the one from signed URL
- Include **x-goog-content-length-range** header for size validation
- File will be **PRIVATE** until verified

### Step 3: Verify and Publish
Verify the upload and make the file public:

**Endpoint**: `POST /upload/verify-and-publish`

**Request**:
```json
{
  "relativePath": "bookhire-vehicle-images/vehicle-front-uuid.jpg"
}
```

**Response**:
```json
{
  "success": true,
  "message": "File verified and made public successfully",
  "publicUrl": "https://storage.googleapis.com/suraksha-lms/bookhire-vehicle-images/vehicle-front-uuid.jpg",
  "relativePath": "bookhire-vehicle-images/vehicle-front-uuid.jpg"
}
```

### Step 4: Use Relative Path in API Calls
Use the **relative path** (not the full URL) when creating/updating bookhires:

**Create Bookhire Example**:
```json
POST /bookhires
{
  "title": "School Bus Service",
  "year": 2023,
  "vehicleNumber": "ABC-1234",
  "capacity": 30,
  "route": "Main St to School",
  "imageUrl": "bookhire-vehicle-images/vehicle-front-uuid.jpg"
}
```

**Update Owner Profile Example**:
```json
PUT /bookhire-owner-auth/profile
{
  "ownerName": "John Doe",
  "phoneNumber": "+1234567890",
  "address": "123 Main St",
  "profileImageUrl": "bookhire-owner-images/profile-uuid.jpg"
}
```

## API Endpoints

### Bookhire Management

#### Create Bookhire
```
POST /bookhires
Authorization: Bearer <bookhire-owner-jwt>
Content-Type: application/json

{
  "title": "Morning School Service",
  "year": 2023,
  "vehicleNumber": "ABC-1234",
  "description": "Morning school transportation",
  "capacity": 30,
  "route": "Main Street to School Campus",
  "imageUrl": "bookhire-vehicle-images/vehicle-123-uuid.jpg"
}
```

#### Update Bookhire
```
PUT /bookhires/my-bookhires/:id
Authorization: Bearer <bookhire-owner-jwt>
Content-Type: application/json

{
  "title": "Updated Service Name",
  "capacity": 35,
  "imageUrl": "bookhire-vehicle-images/new-vehicle-uuid.jpg"
}
```

#### Get My Bookhires
```
GET /bookhires/my-bookhires?page=1&limit=10
Authorization: Bearer <bookhire-owner-jwt>
```

### Bookhire Owner Management

#### Update Profile
```
PUT /bookhire-owner-auth/profile
Authorization: Bearer <bookhire-owner-jwt>
Content-Type: application/json

{
  "ownerName": "John Doe",
  "phoneNumber": "+1234567890",
  "address": "123 Main St, City",
  "profileImageUrl": "bookhire-owner-images/profile-abc-uuid.jpg"
}
```

#### Get Profile
```
GET /bookhire-owner-auth/profile
Authorization: Bearer <bookhire-owner-jwt>
```

## URL Transformation

### Automatic URL Conversion
The backend automatically converts relative paths to full URLs in API responses:

**Stored in Database** (relative path):
```
"bookhire-vehicle-images/vehicle-123-uuid.jpg"
```

**Returned in API Response** (full URL):
```
"https://storage.googleapis.com/suraksha-lms/bookhire-vehicle-images/vehicle-123-uuid.jpg"
```

This is handled by:
1. **Entity-level**: `BookhireEntity.@AfterLoad()` hook
2. **Service-level**: `StorageUrlService.toFullUrl()` and `toFullUrls()` methods
3. **DTO transformation**: Service methods like `transformEntityToDto()`

### Why Relative Paths?
- **Database portability**: Change storage location without updating all records
- **Environment flexibility**: Different storage buckets for dev/staging/prod
- **Consistent URL format**: Automatic URL generation based on environment

## Security Features

### File Size Protection
- **Client-side validation**: Frontend checks file size before upload
- **Signed URL enforcement**: GCS rejects files exceeding size limit via `x-goog-content-length-range`
- **Backend validation**: Server validates size before generating signed URL

### Extension Validation
- **Whitelist only**: Only `.jpg`, `.jpeg`, `.png`, `.webp` allowed
- **Double extension blocked**: Files like `.pdf.jpg` are rejected
- **Case-insensitive**: Validates against lowercase extensions

### Short-lived URLs
- **10-minute expiry**: Signed URLs expire after 10 minutes
- **Private by default**: Files are private until verified
- **Verification required**: Backend must explicitly make files public

### Content-Type Enforcement
- **Signed URL restriction**: Upload must use exact Content-Type
- **GCS validation**: Google Cloud Storage enforces Content-Type header
- **Prevents MIME abuse**: Cannot upload executable as image

## Environment Variables

Add these to your `.env` file:

```bash
# Bookhire Image Settings
MAX_BOOKHIRE_VEHICLE_IMAGE_SIZE_MB=5
MAX_BOOKHIRE_OWNER_IMAGE_SIZE_MB=5

# Upload URL Expiry
UPLOAD_URL_EXPIRY_SECONDS=600

# Storage Configuration
GCS_BUCKET_NAME=suraksha-lms
STORAGE_BASE_URL=https://storage.googleapis.com
GCS_BASE_URL=https://storage.googleapis.com/suraksha-lms
```

## Frontend Integration Example

### Complete Upload Flow (React)
```javascript
async function uploadVehicleImage(file, bookhireOwnerToken) {
  try {
    // Step 1: Generate signed URL
    const signedUrlResponse = await fetch('/upload/generate-signed-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bookhireOwnerToken}`
      },
      body: JSON.stringify({
        folder: 'bookhire-vehicle-images',
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size
      })
    });
    
    const { data, instructions } = await signedUrlResponse.json();
    
    // Step 2: Upload to GCS
    const uploadResponse = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: instructions.headers,
      body: file
    });
    
    if (!uploadResponse.ok) {
      throw new Error('Upload to storage failed');
    }
    
    // Step 3: Verify and publish
    const verifyResponse = await fetch('/upload/verify-and-publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bookhireOwnerToken}`
      },
      body: JSON.stringify({
        relativePath: data.relativePath
      })
    });
    
    const verifyData = await verifyResponse.json();
    
    // Step 4: Use relativePath in bookhire creation/update
    return data.relativePath; // Store this, not publicUrl
    
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
}

// Usage in bookhire creation
async function createBookhire(vehicleData, imageFile, token) {
  const imageUrl = await uploadVehicleImage(imageFile, token);
  
  const response = await fetch('/bookhires', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      ...vehicleData,
      imageUrl: imageUrl // Relative path
    })
  });
  
  return response.json();
}
```

## Troubleshooting

### Upload Returns 403 Forbidden
- **Cause**: Signed URL expired (> 10 minutes) or incorrect Content-Type
- **Solution**: Generate new signed URL, ensure Content-Type matches

### File Not Found After Upload
- **Cause**: Forgot to call `/upload/verify-and-publish`
- **Solution**: Always verify uploads to make them public

### Image Not Displaying in API Response
- **Cause**: Stored full URL instead of relative path
- **Solution**: Store relative path (e.g., `bookhire-vehicle-images/file.jpg`), backend converts to full URL

### Upload Works But Image Shows as Private
- **Cause**: Didn't call verification endpoint
- **Solution**: Call `POST /upload/verify-and-publish` with relativePath

### Wrong Folder Type Error
- **Cause**: Using incorrect folder name
- **Solution**: Use `bookhire-vehicle-images` or `bookhire-owner-images` (exact names)

## Migration from Multer

If you have existing code using Multer file uploads:

**Old Code (Multer)**:
```typescript
@Post()
@UseInterceptors(FileInterceptor('image'))
async create(@UploadedFile() file: Express.Multer.File) {
  const imageUrl = await this.uploadService.upload(file);
  // ...
}
```

**New Code (Signed URL)**:
```typescript
@Post()
async create(@Body() createDto: CreateBookhireDto) {
  // imageUrl comes as string (relative path) in DTO
  // No file processing needed - frontend already uploaded
  return this.bookhireService.create(ownerId, createDto);
}
```

## Benefits

1. **Better Security**: Files validated before upload, short-lived URLs
2. **Improved Performance**: No backend file processing, direct GCS upload
3. **Scalability**: Backend doesn't handle file bytes, reduces memory/CPU usage
4. **Better UX**: Frontend can show upload progress directly
5. **Cost Effective**: Reduced backend bandwidth costs
6. **Cloud-Native**: Leverages GCS signed URLs feature

## Related Documentation
- [COMPLETE_UPLOAD_SYSTEM_AUDIT.md](./COMPLETE_UPLOAD_SYSTEM_AUDIT.md)
- [MULTER_TO_SIGNED_URL_MIGRATION.md](./MULTER_TO_SIGNED_URL_MIGRATION.md)
- [IMAGE_URL_STORAGE_PATTERN.md](./IMAGE_URL_STORAGE_PATTERN.md)
