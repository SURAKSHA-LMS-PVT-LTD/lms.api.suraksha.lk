# 📸 First Login Profile Image Upload - Complete API Guide

## 🎯 Overview

This guide covers profile image upload during the **first login flow**. When users complete their first login and upload a profile image, it follows the same secure workflow as normal login but with specific endpoints for the first login context.

**Key Points:**
- ✅ Profile images uploaded during first login are set to **PENDING** status
- ✅ All images require **admin verification** before becoming visible
- ✅ Uses the same **3-step signed URL workflow** as normal login
- ✅ Secure, scalable, and cost-effective approach

---

## 🔐 Security & Verification Flow

```
User Uploads Image → Status = PENDING → Admin Reviews → APPROVED/REJECTED
                                                              ↓
                                                         User Notified
```

**Image Verification Statuses:**
- `PENDING`: Image awaits admin review (default for all uploads)
- `VERIFIED`: Admin approved - image is visible
- `REJECTED`: Admin rejected - user receives re-upload link

---

## 📋 Complete Upload Workflow

### Overview

The profile image upload process follows a **secure 3-step workflow**:

1. **Generate Signed URL** → Get a short-lived (10 min) upload URL
2. **Upload to Cloud Storage** → Client uploads directly to cloud (PUT request)
3. **Update Profile** → Send image URL to backend for verification

This ensures files are validated, size-limited, and only authorized uploads succeed.

---

## 🔄 Integration Points

### First Login Endpoints

There are **two main first login completion endpoints** that accept profile images:

#### 1️⃣ Enhanced OTP Complete (Single-Step)
**Endpoint:** `POST /auth/verify-otp-complete`

Verify OTP + update profile + upload image in one call.

#### 2️⃣ Profile Completion (Two-Step)
**Endpoint:** `POST /auth/first-login/complete-profile`

Complete profile after OTP verification (requires JWT from verification).

---

## 📡 API Endpoints

### Step 1: Generate Signed Upload URL

**Endpoint:** `POST /upload/generate-signed-url`

**Authentication:** JWT Required (from first login OTP verification)

**Request:**
```http
POST /upload/generate-signed-url
Authorization: Bearer <first_login_jwt_token>
Content-Type: application/json

{
  "folder": "profile-images",
  "fileName": "profile-photo.jpg",
  "contentType": "image/jpeg",
  "fileSize": 2048576
}
```

**Request Body:**
```typescript
interface GenerateSignedUrlRequest {
  folder: 'profile-images';           // Fixed for profile images
  fileName: string;                   // Original filename
  contentType: string;                // MIME type (image/jpeg, image/png, image/webp)
  fileSize: number;                   // File size in bytes (REQUIRED)
}
```

**Response:**
```json
{
  "success": true,
  "message": "SHORT-LIVED private upload URL generated (expires in 10 minutes)",
  "data": {
    "uploadUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-uuid.jpg?X-Goog-Algorithm=...",
    "relativePath": "profile-images/user-12345-uuid.jpg",
    "expiresAt": "2026-02-15T12:10:00.000Z",
    "maxFileSize": 5242880,
    "contentType": "image/jpeg"
  },
  "instructions": {
    "step1": "Upload file to uploadUrl using PUT request",
    "step2": "Send relativePath to /upload/verify-and-publish endpoint",
    "step3": "Backend verifies and returns long-term public URL",
    "uploadMethod": "PUT",
    "uploadUrl": "https://storage.googleapis.com/...",
    "headers": {
      "Content-Type": "image/jpeg",
      "x-goog-content-length-range": "0,5242880"
    },
    "maxFileSize": 5242880,
    "expiresIn": "10 minutes",
    "important": "File will be PRIVATE until verified by backend. MUST include all headers in PUT request."
  }
}
```

**Validation Rules:**
- ✅ File size: Max 5 MB (5,242,880 bytes)
- ✅ Allowed formats: JPEG, PNG, GIF, WebP
- ✅ URL expires in: 10 minutes

---

### Step 2: Upload File to Cloud Storage

**Upload directly to the signed URL returned in Step 1.**

**Request:**
```http
PUT <uploadUrl_from_step1>
Content-Type: image/jpeg
x-goog-content-length-range: 0,5242880

[Binary file data]
```

**Important Headers:**
- `Content-Type`: Must match the contentType from Step 1
- `x-goog-content-length-range`: Enforces file size limit

**Example (JavaScript/Fetch):**
```javascript
async function uploadToCloudStorage(file, uploadUrl) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      'x-goog-content-length-range': '0,5242880'
    },
    body: file
  });

  if (!response.ok) {
    throw new Error('Upload failed: ' + response.statusText);
  }

  return response;
}
```

---

### Step 3A: Verify and Publish (Optional)

**Endpoint:** `POST /upload/verify-and-publish`

**Optional Step:** Only needed if you want to verify the upload before profile completion.

**Request:**
```http
POST /upload/verify-and-publish
Authorization: Bearer <first_login_jwt_token>
Content-Type: application/json

{
  "relativePath": "profile-images/user-12345-uuid.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "message": "File verified and published successfully",
  "data": {
    "publicUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-12345-uuid.jpg",
    "relativePath": "profile-images/user-12345-uuid.jpg"
  }
}
```

---

### Step 3B: Complete First Login with Profile Image

Choose one of these endpoints based on your flow:

---

#### Option 1: Enhanced OTP Complete (Single-Step)

**Endpoint:** `POST /auth/verify-otp-complete`

**Purpose:** Verify OTP + complete profile + upload image in one call

**Request:**
```http
POST /auth/verify-otp-complete
Content-Type: application/json

{
  "email": "user@example.com",
  "otp": "123456",
  "nameWithInitials": "J. Doe",
  "fullName": "John Doe",
  "password": "SecurePass123!",
  "gender": "MALE",
  "dateOfBirth": "2000-01-15",
  "phoneNumber": "+94712345678",
  "profileImageUrl": "profile-images/user-12345-uuid.jpg"
}
```

**Request Body:**
```typescript
interface EnhancedVerifyOtpDto {
  email: string;
  otp: string;
  nameWithInitials: string;
  fullName: string;
  password?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth?: string;              // Format: YYYY-MM-DD
  phoneNumber?: string;
  profileImageUrl?: string;          // ✅ RELATIVE PATH from Step 1
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  province?: string;
  country?: string;
  
  // Student-specific fields
  studentId?: string;
  emergencyContact?: string;
  bloodGroup?: string;
  
  // Parent-specific fields
  occupation?: string;
  workplace?: string;
  educationLevel?: string;
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified and profile completed successfully. You can now access the application.",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI...",
  "user": {
    "id": "12345",
    "email": "user@example.com",
    "nameWithInitials": "J. Doe",
    "fullName": "John Doe",
    "firstName": "John",
    "lastName": "Doe",
    "userType": "STUDENT",
    "phoneNumber": "+94712345678",
    "dateOfBirth": "2000-01-15",
    "gender": "MALE",
    "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-12345-uuid.jpg",
    "imageVerificationStatus": "PENDING",
    "addressLine1": "123 Main St",
    "city": "Colombo"
  }
}
```

**Important:**
- ✅ `profileImageUrl` must be the **relative path** (e.g., `profile-images/user-12345-uuid.jpg`)
- ✅ Backend automatically sets `imageVerificationStatus` to `PENDING`
- ✅ Admin must review and approve the image
- ✅ User receives email notification after admin review

---

#### Option 2: Profile Completion (Two-Step)

**Endpoint:** `POST /auth/first-login/complete-profile`

**Purpose:** Complete profile after OTP verification (requires JWT)

**Prerequisites:**
1. User must have verified OTP first
2. JWT token from OTP verification required

**Request:**
```http
POST /auth/first-login/complete-profile
Authorization: Bearer <first_login_jwt_token>
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "password": "SecurePass123!",
  "nameWithInitials": "J. Doe",
  "dateOfBirth": "2000-01-15",
  "gender": "MALE",
  "imageUrl": "profile-images/user-12345-uuid.jpg"
}
```

**Request Body:**
```typescript
interface CompleteFirstLoginProfileDto {
  firstName: string;
  lastName: string;
  password: string;
  nameWithInitials?: string;
  userType?: string;
  dateOfBirth?: string;              // Format: YYYY-MM-DD
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  nic?: string;
  imageUrl?: string;                 // ✅ RELATIVE PATH from Step 1
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  province?: string;
  country?: string;
  
  // Student-specific fields
  emergencyContact?: string;
  medicalConditions?: string;
  allergies?: string;
  bloodGroup?: string;
  
  // Parent-specific fields
  occupation?: string;
  workplace?: string;
  workPhone?: string;
  educationLevel?: string;
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile completed and logged in successfully.",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI...",
  "expires_in": 1800,
  "refresh_expires_in": 2592000,
  "user": {
    "id": "12345",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "nameWithInitials": "J. Doe",
    "fullName": "John Doe",
    "userType": "STUDENT",
    "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-12345-uuid.jpg",
    "imageVerificationStatus": "PENDING"
  }
}
```

**Important:**
- ✅ `imageUrl` must be the **relative path** (e.g., `profile-images/user-12345-uuid.jpg`)
- ✅ Backend automatically sets `imageVerificationStatus` to `PENDING`
- ✅ Returns full login tokens (access + refresh)

---

## 🖼️ Image Verification Process

After upload, the image goes through admin verification:

### 1. Pending Status
- Image is uploaded but not yet verified
- User can see their image but it may show "Under Review" badge
- Admin can see the image in verification queue

### 2. Admin Actions

**Admin Reviews Image:**

```http
POST /admin/users/images/approve
Authorization: Bearer <admin_token>

{
  "userId": "12345"
}
```

OR

```http
POST /admin/users/images/reject
Authorization: Bearer <admin_token>

{
  "userId": "12345",
  "rejectionReason": "Image does not meet guidelines. Please upload a clear photo."
}
```

### 3. User Notification

**If Approved:**
- Email sent: "✅ Profile Image Approved"
- Status changed to `VERIFIED`
- Image fully visible

**If Rejected:**
- Email sent: "❌ Profile Image Rejected" with reason
- Status changed to `REJECTED`
- Image deleted from cloud storage
- Email contains re-upload link (valid for 7 days)

---

## 📊 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    FIRST LOGIN IMAGE UPLOAD                  │
└─────────────────────────────────────────────────────────────┘

1. OTP Verification
   ↓
2. Generate Signed URL
   POST /upload/generate-signed-url
   → Returns: uploadUrl, relativePath
   ↓
3. Upload to Cloud (Client-Side)
   PUT <uploadUrl>
   → File stored in cloud
   ↓
4. Complete Profile with Image
   POST /auth/verify-otp-complete
   OR
   POST /auth/first-login/complete-profile
   → Body includes: profileImageUrl or imageUrl (relative path)
   ↓
5. Backend Processing
   - Sets imageUrl
   - Sets imageVerificationStatus = PENDING
   - Clears imageVerifiedBy, imageVerifiedAt, imageRejectionReason
   ↓
6. Admin Review
   - Admin sees image in verification queue
   - Admin approves or rejects
   ↓
7. User Notification
   - Email sent with result
   - Status updated (VERIFIED or REJECTED)
```

---

## 💻 Complete Code Examples

### React/TypeScript Implementation

```typescript
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

interface UploadProgress {
  step: number;
  message: string;
  progress: number;
}

/**
 * Complete workflow to upload profile image during first login
 */
async function uploadProfileImageFirstLogin(
  file: File,
  firstLoginToken: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<string> {
  try {
    // Step 1: Generate signed upload URL
    onProgress?.({ 
      step: 1, 
      message: 'Generating upload URL...', 
      progress: 20 
    });
    
    const signedUrlResponse = await axios.post(
      `${API_BASE_URL}/upload/generate-signed-url`,
      {
        folder: 'profile-images',
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size
      },
      {
        headers: {
          'Authorization': `Bearer ${firstLoginToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { uploadUrl, relativePath } = signedUrlResponse.data.data;
    const { headers } = signedUrlResponse.data.instructions;

    // Step 2: Upload file to cloud storage
    onProgress?.({ 
      step: 2, 
      message: 'Uploading image...', 
      progress: 40 
    });
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': headers['Content-Type'],
        'x-goog-content-length-range': headers['x-goog-content-length-range']
      },
      body: file
    });

    if (!uploadResponse.ok) {
      throw new Error('Upload failed: ' + uploadResponse.statusText);
    }

    onProgress?.({ 
      step: 3, 
      message: 'Upload complete!', 
      progress: 100 
    });

    // Return relative path to use in profile completion
    return relativePath;
    
  } catch (error: any) {
    console.error('Upload error:', error);
    throw new Error(error.response?.data?.message || 'Upload failed');
  }
}

/**
 * Complete first login profile with uploaded image
 */
async function completeFirstLoginProfile(
  profileData: {
    firstName: string;
    lastName: string;
    password: string;
    imageUrl?: string;  // Relative path from upload
    // ... other fields
  },
  firstLoginToken: string
): Promise<any> {
  const response = await axios.post(
    `${API_BASE_URL}/auth/first-login/complete-profile`,
    profileData,
    {
      headers: {
        'Authorization': `Bearer ${firstLoginToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

/**
 * Complete example: Upload image and complete profile
 */
async function handleFirstLoginWithImage(
  file: File,
  profileData: any,
  firstLoginToken: string
): Promise<any> {
  try {
    // Upload image first
    const relativePath = await uploadProfileImageFirstLogin(
      file,
      firstLoginToken,
      (progress) => {
        console.log(`Step ${progress.step}: ${progress.message} (${progress.progress}%)`);
      }
    );

    // Complete profile with image path
    const result = await completeFirstLoginProfile(
      {
        ...profileData,
        imageUrl: relativePath  // Add relative path to profile
      },
      firstLoginToken
    );

    console.log('First login completed:', result);
    return result;
    
  } catch (error: any) {
    console.error('Error:', error.message);
    throw error;
  }
}

// Usage Example
const profileImage = document.querySelector('input[type="file"]').files[0];
const token = localStorage.getItem('first_login_token');

handleFirstLoginWithImage(
  profileImage,
  {
    firstName: 'John',
    lastName: 'Doe',
    password: 'SecurePass123!',
    dateOfBirth: '2000-01-15',
    gender: 'MALE'
  },
  token
).then(result => {
  // Store tokens
  localStorage.setItem('access_token', result.access_token);
  localStorage.setItem('refresh_token', result.refresh_token);
  
  // Redirect to dashboard
  window.location.href = '/dashboard';
});
```

---

### Vue.js Implementation

```vue
<template>
  <div class="first-login-profile">
    <h2>Complete Your Profile</h2>
    
    <form @submit.prevent="handleSubmit">
      <div class="form-group">
        <label>First Name</label>
        <input v-model="formData.firstName" required />
      </div>

      <div class="form-group">
        <label>Last Name</label>
        <input v-model="formData.lastName" required />
      </div>

      <div class="form-group">
        <label>Password</label>
        <input v-model="formData.password" type="password" required />
      </div>

      <div class="form-group">
        <label>Profile Image (Optional)</label>
        <input 
          type="file" 
          accept="image/jpeg,image/png,image/webp"
          @change="handleFileSelect"
        />
      </div>

      <div v-if="uploading" class="upload-progress">
        <p>{{ uploadProgress.message }}</p>
        <div class="progress-bar">
          <div 
            class="progress-fill" 
            :style="{ width: uploadProgress.progress + '%' }"
          ></div>
        </div>
      </div>

      <button type="submit" :disabled="uploading">
        {{ uploading ? 'Uploading...' : 'Complete Profile' }}
      </button>

      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const formData = ref({
  firstName: '',
  lastName: '',
  password: '',
  dateOfBirth: '',
  gender: 'MALE'
});

const selectedFile = ref<File | null>(null);
const uploading = ref(false);
const uploadProgress = ref({ step: 0, message: '', progress: 0 });
const error = ref('');

const firstLoginToken = localStorage.getItem('first_login_token');

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (file) {
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      error.value = 'File size must not exceed 5MB';
      target.value = '';
      return;
    }
    
    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      error.value = 'Please select a JPEG, PNG, or WebP image';
      target.value = '';
      return;
    }
    
    selectedFile.value = file;
    error.value = '';
  }
}

async function uploadImage(file: File): Promise<string> {
  // Step 1: Generate signed URL
  uploadProgress.value = { step: 1, message: 'Generating upload URL...', progress: 20 };
  
  const signedUrlResponse = await axios.post(
    `${API_BASE_URL}/upload/generate-signed-url`,
    {
      folder: 'profile-images',
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size
    },
    {
      headers: {
        'Authorization': `Bearer ${firstLoginToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const { uploadUrl, relativePath } = signedUrlResponse.data.data;
  const { headers } = signedUrlResponse.data.instructions;

  // Step 2: Upload to cloud
  uploadProgress.value = { step: 2, message: 'Uploading image...', progress: 60 };
  
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': headers['Content-Type'],
      'x-goog-content-length-range': headers['x-goog-content-length-range']
    },
    body: file
  });

  if (!uploadResponse.ok) {
    throw new Error('Upload failed');
  }

  uploadProgress.value = { step: 3, message: 'Upload complete!', progress: 100 };
  
  return relativePath;
}

async function handleSubmit() {
  try {
    uploading.value = true;
    error.value = '';

    let imageUrl: string | undefined;

    // Upload image if selected
    if (selectedFile.value) {
      imageUrl = await uploadImage(selectedFile.value);
    }

    // Complete profile
    const response = await axios.post(
      `${API_BASE_URL}/auth/first-login/complete-profile`,
      {
        ...formData.value,
        imageUrl
      },
      {
        headers: {
          'Authorization': `Bearer ${firstLoginToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Store tokens
    localStorage.setItem('access_token', response.data.access_token);
    localStorage.setItem('refresh_token', response.data.refresh_token);
    localStorage.removeItem('first_login_token');

    // Show success message
    alert('Profile completed successfully! Your image will be reviewed by our team.');

    // Redirect to dashboard
    window.location.href = '/dashboard';
    
  } catch (err: any) {
    error.value = err.response?.data?.message || 'Failed to complete profile';
  } finally {
    uploading.value = false;
  }
}
</script>

<style scoped>
.first-login-profile {
  max-width: 500px;
  margin: 0 auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 15px;
}

.upload-progress {
  margin: 15px 0;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #4caf50;
  transition: width 0.3s ease;
}

.error {
  color: #f44336;
  margin-top: 10px;
}
</style>
```

---

## ⚠️ Error Handling

### Common Errors

#### 1. File Too Large
```json
{
  "success": false,
  "message": "File size exceeds maximum allowed size of 5MB",
  "error": "FILE_SIZE_EXCEEDED"
}
```

**Solution:** Resize or compress image before upload

#### 2. Invalid File Type
```json
{
  "success": false,
  "message": "Invalid file type. Allowed: JPEG, PNG, GIF, WebP",
  "error": "INVALID_FILE_TYPE"
}
```

**Solution:** Convert file to supported format

#### 3. Upload URL Expired
```json
{
  "success": false,
  "message": "Upload URL has expired",
  "error": "UPLOAD_URL_EXPIRED"
}
```

**Solution:** Generate new signed URL (Step 1) and retry

#### 4. File Not Found
```json
{
  "success": false,
  "message": "Image file not found in storage. Please upload the file first.",
  "error": "FILE_NOT_FOUND"
}
```

**Solution:** Ensure upload to signed URL completed successfully before calling profile completion

---

## 🔒 Security Best Practices

### 1. File Validation (Client-Side)
```javascript
function validateFile(file: File): boolean {
  // Check file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File too large (max 5MB)');
  }

  // Check file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type');
  }

  return true;
}
```

### 2. Token Management
```javascript
// Store first login token securely
const firstLoginToken = sessionStorage.getItem('first_login_token');

// After profile completion, clear first login token
sessionStorage.removeItem('first_login_token');

// Store new access/refresh tokens
localStorage.setItem('access_token', response.access_token);
localStorage.setItem('refresh_token', response.refresh_token);
```

### 3. Progress Feedback
```javascript
// Show upload progress to user
function showProgress(step: number, message: string, progress: number) {
  console.log(`[Step ${step}] ${message} - ${progress}%`);
  // Update UI progress bar
  updateProgressBar(progress);
}
```

---

## 📱 Mobile App Integration (React Native)

```typescript
import { launchImageLibrary } from 'react-native-image-picker';
import axios from 'axios';

async function selectAndUploadImage(firstLoginToken: string): Promise<string> {
  // Step 1: Select image
  const result = await launchImageLibrary({
    mediaType: 'photo',
    quality: 0.8,
    maxWidth: 1080,
    maxHeight: 1080
  });

  if (result.didCancel || !result.assets?.[0]) {
    throw new Error('Image selection cancelled');
  }

  const asset = result.assets[0];
  
  // Step 2: Generate signed URL
  const signedUrlResponse = await axios.post(
    `${API_BASE_URL}/upload/generate-signed-url`,
    {
      folder: 'profile-images',
      fileName: asset.fileName,
      contentType: asset.type,
      fileSize: asset.fileSize
    },
    {
      headers: {
        'Authorization': `Bearer ${firstLoginToken}`
      }
    }
  );

  const { uploadUrl, relativePath } = signedUrlResponse.data.data;

  // Step 3: Upload to cloud
  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    type: asset.type,
    name: asset.fileName
  });

  await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': asset.type
    },
    body: formData
  });

  return relativePath;
}
```

---

## 🧪 Testing

### Manual Testing

```bash
# 1. Generate signed URL
curl -X POST http://localhost:3000/upload/generate-signed-url \
  -H "Authorization: Bearer <first_login_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "folder": "profile-images",
    "fileName": "test-profile.jpg",
    "contentType": "image/jpeg",
    "fileSize": 1048576
  }'

# 2. Upload file to signed URL
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: image/jpeg" \
  -H "x-goog-content-length-range: 0,5242880" \
  --data-binary @test-profile.jpg

# 3. Complete profile with image
curl -X POST http://localhost:3000/auth/first-login/complete-profile \
  -H "Authorization: Bearer <first_login_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "password": "Test123!",
    "imageUrl": "profile-images/test-profile-uuid.jpg"
  }'
```

---

## 📚 Related Documentation

- [User Profile Frontend Guide](./USER_PROFILE_FRONTEND_GUIDE.md)
- [Image Verification System](./IMAGE_VERIFICATION_FRONTEND_GUIDE.md)
- [First Login Implementation](./FIRST_LOGIN_FRONTEND_GUIDE.md)
- [Profile Image API Summary](./PROFILE_IMAGE_API_SUMMARY.md)

---

## 🆘 Support

**Common Issues:**

1. **Upload fails silently** → Check browser console for CORS errors
2. **Image not appearing** → Check if imageVerificationStatus is PENDING
3. **404 errors** → Verify API base URL is correct
4. **Token expired** → Generate new first login token

**Need Help?**
- Check error response messages carefully
- Ensure all headers are included in PUT request
- Verify file meets size/type requirements
- Contact support if issue persists

---

**Last Updated:** February 15, 2026
**API Version:** v2.0
