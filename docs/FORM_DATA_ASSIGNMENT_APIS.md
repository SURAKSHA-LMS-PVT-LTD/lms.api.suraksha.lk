# Form-Data Support for Assignment APIs

## Overview

All 4 enhanced assignment APIs now support **both JSON and form-data** formats, with **optional image upload** during user assignment.

---

## Supported Endpoints

### 1. Assign User by Phone
**Endpoint:** `POST /institute-users/institute/:instituteId/assign-user-by-phone`

### 2. Assign Parent by Phone  
**Endpoint:** `POST /institute-users/student/:studentId/assign-parent-by-phone`

### 3. Assign Student by RFID
**Endpoint:** `POST /institute-users/institute/:instituteId/assign-student-by-rfid`

### 4. Bulk Assign Users
**Endpoint:** `POST /institute-users/institute/:instituteId/bulk-assign-users` (JSON only, no image support)

---

## Usage Examples

### Option A: JSON Format (No Image)

#### 1. Assign User by Phone (JSON)

```bash
curl -X POST "https://api.suraksha.lk/institute-users/institute/1/assign-user-by-phone" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+94771234567",
    "instituteUserType": "STUDENT",
    "userIdByInstitute": "STU2024001"
  }'
```

#### 2. Assign Student by RFID (JSON)

```bash
curl -X POST "https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rfid": "RFID123456789",
    "instituteUserType": "STUDENT",
    "userIdByInstitute": "STU2024001"
  }'
```

#### 3. Assign Parent by Phone (JSON)

```bash
curl -X POST "https://api.suraksha.lk/institute-users/student/123/assign-parent-by-phone" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+94771234567",
    "parentRole": "father"
  }'
```

---

### Option B: Form-Data Format (With Optional Image)

#### 1. Assign User by Phone (Form-Data + Image)

```bash
curl -X POST "https://api.suraksha.lk/institute-users/institute/1/assign-user-by-phone" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "phoneNumber=+94771234567" \
  -F "instituteUserType=STUDENT" \
  -F "userIdByInstitute=STU2024001" \
  -F "image=@/path/to/student-photo.jpg"
```

#### 2. Assign Student by RFID (Form-Data + Image)

```bash
curl -X POST "https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "rfid=RFID123456789" \
  -F "instituteUserType=STUDENT" \
  -F "userIdByInstitute=STU2024001" \
  -F "image=@/path/to/student-photo.jpg"
```

#### 3. Assign Parent by Phone (Form-Data + Image)

```bash
curl -X POST "https://api.suraksha.lk/institute-users/student/123/assign-parent-by-phone" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "phoneNumber=+94771234567" \
  -F "parentRole=father" \
  -F "image=@/path/to/parent-photo.jpg"
```

---

## JavaScript/Fetch Examples

### JSON Request (No Image)

```javascript
const response = await fetch(
  'https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      rfid: 'RFID123456789',
      instituteUserType: 'STUDENT',
      userIdByInstitute: 'STU2024001'
    })
  }
);

const data = await response.json();
console.log(data);
```

### Form-Data Request (With Image)

```javascript
const formData = new FormData();
formData.append('rfid', 'RFID123456789');
formData.append('instituteUserType', 'STUDENT');
formData.append('userIdByInstitute', 'STU2024001');
formData.append('image', fileInput.files[0]); // From <input type="file">

const response = await fetch(
  'https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
      // Don't set Content-Type - browser sets it with boundary
    },
    body: formData
  }
);

const data = await response.json();
console.log(data);
```

---

## Postman Examples

### JSON Request

1. **Method:** POST
2. **URL:** `https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid`
3. **Headers:**
   - `Authorization`: `Bearer YOUR_JWT_TOKEN`
   - `Content-Type`: `application/json`
4. **Body:**
   - Select **"raw"**
   - Select **"JSON"**
   ```json
   {
     "rfid": "RFID123456789",
     "instituteUserType": "STUDENT",
     "userIdByInstitute": "STU2024001"
   }
   ```

### Form-Data Request (With Image)

1. **Method:** POST
2. **URL:** `https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid`
3. **Headers:**
   - `Authorization`: `Bearer YOUR_JWT_TOKEN`
   - **DO NOT set Content-Type** (Postman sets it automatically)
4. **Body:**
   - Select **"form-data"**
   - Add fields:
     | Key | Type | Value |
     |-----|------|-------|
     | `rfid` | Text | `RFID123456789` |
     | `instituteUserType` | Text | `STUDENT` |
     | `userIdByInstitute` | Text | `STU2024001` |
     | `image` | **File** | Select image file |

---

## Field Specifications

### 1. Assign User by Phone

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phoneNumber` | string | ✅ Yes | Phone number with country code |
| `instituteUserType` | enum | ✅ Yes | `STUDENT`, `TEACHER`, `INSTITUTE_ADMIN`, `ATTENDANCE_MARKER` |
| `userIdByInstitute` | string | ❌ No | Institute-specific ID (max 50 chars) |
| `image` | file | ❌ No | Profile image (JPEG, PNG, WebP, max 2MB) |

### 2. Assign Student by RFID

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rfid` | string | ✅ Yes | RFID tag identifier |
| `instituteUserType` | enum | ✅ Yes | `STUDENT`, `TEACHER`, `INSTITUTE_ADMIN`, `ATTENDANCE_MARKER` |
| `userIdByInstitute` | string | ❌ No | Institute-specific ID (max 50 chars) |
| `image` | file | ❌ No | Profile image (JPEG, PNG, WebP, max 2MB) |

### 3. Assign Parent by Phone

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phoneNumber` | string | ✅ Yes | Parent's phone number with country code |
| `parentRole` | enum | ✅ Yes | `father`, `mother`, `guardian` |
| `image` | file | ❌ No | Parent's profile image (JPEG, PNG, WebP, max 2MB) |

---

## Image Upload Specifications

### Supported Formats
- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- WebP (`.webp`)

### File Size Limit
- **Maximum:** 2MB per image

### Validation
- MIME type must match: `image/jpeg`, `image/png`, or `image/webp`
- File size must not exceed 2,097,152 bytes (2MB)

---

## Success Responses

### With Image Upload

```json
{
  "success": true,
  "message": "Student John Doe successfully assigned to institute with ID: STU2024001 (image uploaded)",
  "userId": "123",
  "instituteId": "1",
  "userIdByInstitute": "STU2024001"
}
```

### Without Image

```json
{
  "success": true,
  "message": "Student John Doe successfully assigned to institute with ID: STU2024001",
  "userId": "123",
  "instituteId": "1",
  "userIdByInstitute": "STU2024001"
}
```

---

## Error Responses

### Invalid File Type

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Only JPEG, PNG, and WebP images are allowed"
}
```

### File Too Large

```json
{
  "success": false,
  "statusCode": 400,
  "message": "File size exceeds 2MB limit"
}
```

### Missing Required Field (JSON)

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Bad Request",
  "errors": [
    "rfid should not be empty",
    "instituteUserType must be one of: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER"
  ]
}
```

### Missing Required Field (Form-Data)

Same as JSON - validation works for both formats.

---

## React Example

### With Image Upload

```tsx
import { useState } from 'react';

function AssignStudentForm() {
  const [image, setImage] = useState<File | null>(null);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('rfid', 'RFID123456789');
    formData.append('instituteUserType', 'STUDENT');
    formData.append('userIdByInstitute', 'STU2024001');
    
    if (image) {
      formData.append('image', image);
    }
    
    try {
      const response = await fetch(
        'https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: formData
        }
      );
      
      const data = await response.json();
      
      if (data.success) {
        alert('Student assigned successfully!');
      } else {
        alert('Error: ' + data.message);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => setImage(e.target.files?.[0] || null)}
      />
      <button type="submit">Assign Student</button>
    </form>
  );
}
```

---

## Important Notes

### 1. Image Upload is Optional
- All endpoints work **with or without** an image
- Assignment succeeds even if image upload fails
- Image upload failure is logged but doesn't block assignment

### 2. Content-Type Handling
- **JSON:** Must set `Content-Type: application/json`
- **Form-Data:** Browser/client sets `Content-Type: multipart/form-data; boundary=...` automatically
- **Never manually set** `Content-Type` for form-data (the boundary parameter is required)

### 3. Bulk Assignment
- The **bulk-assign-users** endpoint does **NOT support images**
- Bulk assignment only accepts **JSON format**
- For bulk operations with images, call individual endpoints in a loop

### 4. Image Storage
- Images are stored in cloud storage (Google Cloud Storage / AWS S3)
- Image URLs are automatically set in the `instituteUserImageUrl` field
- Images are organized by institute and user: `institute-users/institute-{id}/users/{userId}/`

---

## Migration Guide

### Before (JSON Only)

```javascript
// Old way - JSON only
const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ rfid, instituteUserType })
});
```

### After (Form-Data with Image)

```javascript
// New way - Form-data with optional image
const formData = new FormData();
formData.append('rfid', rfid);
formData.append('instituteUserType', instituteUserType);
if (imageFile) {
  formData.append('image', imageFile);
}

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
    // No Content-Type header!
  },
  body: formData
});
```

### Both Still Work!

The endpoints now accept **both formats**, so existing JSON-based integrations continue to work without changes.

---

## FAQ

### Q: Can I upload an image later?
**A:** Yes! Use the separate image upload endpoint:
```
POST /institute-users/institute/:instituteId/users/:userId/upload-image
```

### Q: What happens if image upload fails?
**A:** The user is still assigned successfully. Image upload failure is logged but doesn't block the assignment.

### Q: Can I update the image after assignment?
**A:** Yes, use the image upload endpoint again to replace the existing image.

### Q: Why use form-data instead of JSON for images?
**A:** JSON cannot contain binary data (images). Form-data (`multipart/form-data`) is the standard HTTP format for file uploads.

### Q: Can I send multiple images?
**A:** No, only one image per request is supported. Use the `image` field name.

---

**Last Updated:** October 19, 2025
