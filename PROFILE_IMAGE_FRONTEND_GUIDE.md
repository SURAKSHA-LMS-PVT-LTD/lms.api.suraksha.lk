# Profile Image Management - Frontend Implementation Guide

## Overview
Complete guide for implementing profile image upload and management in the frontend application using System Admin APIs.

---

## Table of Contents
1. [API Endpoints Overview](#api-endpoints-overview)
2. [Implementation Approaches](#implementation-approaches)
3. [Student ID Based Implementation](#student-id-based-implementation)
4. [User ID Based Implementation](#user-id-based-implementation)
5. [Complete Code Examples](#complete-code-examples)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)

---

## API Endpoints Overview

### Student ID Based Endpoints
Use these when you have the student's unique ID (e.g., "STU-20260123-001")

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/admin/users/student/lookup/:studentId` | Lookup student details |
| POST | `/admin/users/student/profile-image/generate-url` | Generate upload URL |
| POST | `/admin/users/student/profile-image/assign` | Assign uploaded image |
| POST | `/admin/users/student/:studentId/profile-image` | Quick URL generation |

### User ID Based Endpoints
Use these when you have the user's numeric ID (e.g., 123)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/admin/users/lookup/:userId` | Lookup user details |
| POST | `/admin/users/profile-image/generate-url` | Generate upload URL |
| POST | `/admin/users/profile-image/assign` | Assign uploaded image |
| POST | `/admin/users/:userId/profile-image` | Quick URL generation |

---

## Implementation Approaches

### Approach 1: Three-Step Process (Recommended)
1. **Lookup** - Verify user/student exists and get current image
2. **Generate URL** - Get signed upload URL from backend
3. **Upload** - Upload directly to cloud storage (S3/GCS)
4. **Assign** - Notify backend to update database

### Approach 2: Two-Step Process (Quick)
1. **Generate URL** - Direct generation (skip lookup)
2. **Upload & Assign** - Upload and assign in sequence

---

## Student ID Based Implementation

### Step 1: Lookup Student by Student ID

```typescript
interface LookupStudentResponse {
  success: boolean;
  userId: number;
  studentId: string;
  nameWithInitials: string;
  imageUrl?: string;
}

async function lookupStudent(studentId: string): Promise<LookupStudentResponse> {
  const response = await fetch(
    `${API_BASE_URL}/admin/users/student/lookup/${studentId}`,
    {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Student not found');
  }

  return response.json();
}

// Usage
const student = await lookupStudent('STU-20260123-001');
console.log('Current image:', student.imageUrl);
```

### Step 2: Generate Signed Upload URL

```typescript
interface GenerateUrlRequest {
  studentId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}

interface GenerateUrlResponse {
  success: boolean;
  uploadUrl: string;
  relativePath: string;
  expiresAt: string;
}

async function generateUploadUrl(
  file: File,
  studentId: string
): Promise<GenerateUrlResponse> {
  const requestBody: GenerateUrlRequest = {
    studentId,
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  };

  const response = await fetch(
    `${API_BASE_URL}/admin/users/student/profile-image/generate-url`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to generate upload URL');
  }

  return response.json();
}

// Usage
const file = document.getElementById('fileInput').files[0];
const urlData = await generateUploadUrl(file, 'STU-20260123-001');
console.log('Upload URL expires at:', urlData.expiresAt);
```

### Step 3: Upload File to Cloud Storage

```typescript
async function uploadToCloudStorage(
  file: File,
  uploadUrl: string
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error('Failed to upload file to cloud storage');
  }
}

// Usage with progress tracking
async function uploadWithProgress(
  file: File,
  uploadUrl: string,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100;
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200 || xhr.status === 204) {
        resolve();
      } else {
        reject(new Error('Upload failed'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload error')));

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}
```

### Step 4: Assign Profile Image

```typescript
interface AssignImageRequest {
  studentId: string;
  relativePath: string;
}

interface AssignImageResponse {
  success: boolean;
  imageUrl: string;
  previousImageUrl?: string;
}

async function assignProfileImage(
  studentId: string,
  relativePath: string
): Promise<AssignImageResponse> {
  const requestBody: AssignImageRequest = {
    studentId,
    relativePath,
  };

  const response = await fetch(
    `${API_BASE_URL}/admin/users/student/profile-image/assign`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to assign profile image');
  }

  return response.json();
}

// Usage
const result = await assignProfileImage(
  'STU-20260123-001',
  'profile-images/123/1737628800000_profile.jpg'
);
console.log('New image URL:', result.imageUrl);
```

---

## User ID Based Implementation

### Step 1: Lookup User by User ID

```typescript
async function lookupUser(userId: number): Promise<LookupStudentResponse> {
  const response = await fetch(
    `${API_BASE_URL}/admin/users/lookup/${userId}`,
    {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('User not found');
  }

  return response.json();
}

// Usage
const user = await lookupUser(123);
console.log('User details:', user);
```

### Step 2: Generate Signed Upload URL

```typescript
interface GenerateUrlByUserIdRequest {
  userId: number;
  fileName: string;
  contentType: string;
  fileSize: number;
}

async function generateUploadUrlByUserId(
  file: File,
  userId: number
): Promise<GenerateUrlResponse> {
  const requestBody: GenerateUrlByUserIdRequest = {
    userId,
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  };

  const response = await fetch(
    `${API_BASE_URL}/admin/users/profile-image/generate-url`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to generate upload URL');
  }

  return response.json();
}

// Quick method using path param
async function quickGenerateUrlByUserId(
  file: File,
  userId: number
): Promise<GenerateUrlResponse> {
  const requestBody = {
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  };

  const response = await fetch(
    `${API_BASE_URL}/admin/users/${userId}/profile-image`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to generate upload URL');
  }

  return response.json();
}
```

### Step 3: Upload to Cloud (Same as Above)
Use the same `uploadToCloudStorage` or `uploadWithProgress` functions.

### Step 4: Assign Profile Image by User ID

```typescript
interface AssignImageByUserIdRequest {
  userId: number;
  relativePath: string;
}

async function assignProfileImageByUserId(
  userId: number,
  relativePath: string
): Promise<AssignImageResponse> {
  const requestBody: AssignImageByUserIdRequest = {
    userId,
    relativePath,
  };

  const response = await fetch(
    `${API_BASE_URL}/admin/users/profile-image/assign`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to assign profile image');
  }

  return response.json();
}
```

---

## Complete Code Examples

### React Component - Student ID Based

```tsx
import React, { useState } from 'react';

interface ProfileImageUploaderProps {
  studentId: string;
  onSuccess?: (imageUrl: string) => void;
}

export const ProfileImageUploader: React.FC<ProfileImageUploaderProps> = ({
  studentId,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError('Invalid file type. Please select a JPEG, PNG, GIF, or WebP image.');
      return;
    }

    // Validate file size (5MB max)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('File size exceeds 5MB limit.');
      return;
    }

    setFile(selectedFile);
    setError(null);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // Step 1: Generate signed URL
      const urlData = await generateUploadUrl(file, studentId);

      // Step 2: Upload to cloud storage
      await uploadWithProgress(file, urlData.uploadUrl, (p) => setProgress(p));

      // Step 3: Assign profile image
      const result = await assignProfileImage(studentId, urlData.relativePath);

      setProgress(100);
      onSuccess?.(result.imageUrl);
      
      alert('Profile image uploaded successfully!');
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="profile-image-uploader">
      <h3>Upload Profile Image</h3>
      
      {previewUrl && (
        <div className="preview">
          <img src={previewUrl} alt="Preview" style={{ maxWidth: '200px' }} />
        </div>
      )}

      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleFileChange}
        disabled={uploading}
      />

      {file && (
        <div className="file-info">
          <p>File: {file.name}</p>
          <p>Size: {(file.size / 1024).toFixed(2)} KB</p>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {uploading && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }}>
            {progress.toFixed(0)}%
          </div>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
      >
        {uploading ? 'Uploading...' : 'Upload Image'}
      </button>
    </div>
  );
};
```

### React Component - User ID Based

```tsx
interface ProfileImageUploaderByUserIdProps {
  userId: number;
  onSuccess?: (imageUrl: string) => void;
}

export const ProfileImageUploaderByUserId: React.FC<ProfileImageUploaderByUserIdProps> = ({
  userId,
  onSuccess,
}) => {
  // Same implementation as above, but replace:
  // - generateUploadUrl with generateUploadUrlByUserId
  // - assignProfileImage with assignProfileImageByUserId
  // - Pass userId instead of studentId

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const urlData = await generateUploadUrlByUserId(file, userId);
      await uploadWithProgress(file, urlData.uploadUrl, (p) => setProgress(p));
      const result = await assignProfileImageByUserId(userId, urlData.relativePath);

      setProgress(100);
      onSuccess?.(result.imageUrl);
      
      alert('Profile image uploaded successfully!');
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ... rest of the component same as above
};
```

### Vue.js Component Example

```vue
<template>
  <div class="profile-image-uploader">
    <h3>Upload Profile Image</h3>
    
    <div v-if="previewUrl" class="preview">
      <img :src="previewUrl" alt="Preview" style="max-width: 200px" />
    </div>

    <input
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      @change="handleFileChange"
      :disabled="uploading"
    />

    <div v-if="file" class="file-info">
      <p>File: {{ file.name }}</p>
      <p>Size: {{ (file.size / 1024).toFixed(2) }} KB</p>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="uploading" class="progress">
      <div class="progress-bar" :style="{ width: progress + '%' }">
        {{ progress.toFixed(0) }}%
      </div>
    </div>

    <button @click="handleUpload" :disabled="!file || uploading">
      {{ uploading ? 'Uploading...' : 'Upload Image' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  studentId?: string;
  userId?: number;
}>();

const emit = defineEmits<{
  success: [imageUrl: string];
}>();

const file = ref<File | null>(null);
const uploading = ref(false);
const progress = ref(0);
const error = ref<string | null>(null);
const previewUrl = ref<string | null>(null);

const handleFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const selectedFile = target.files?.[0];
  if (!selectedFile) return;

  // Validate
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(selectedFile.type)) {
    error.value = 'Invalid file type';
    return;
  }

  if (selectedFile.size > 5 * 1024 * 1024) {
    error.value = 'File size exceeds 5MB';
    return;
  }

  file.value = selectedFile;
  error.value = null;

  // Preview
  const reader = new FileReader();
  reader.onloadend = () => {
    previewUrl.value = reader.result as string;
  };
  reader.readAsDataURL(selectedFile);
};

const handleUpload = async () => {
  if (!file.value) return;

  uploading.value = true;
  error.value = null;
  progress.value = 0;

  try {
    let urlData, result;

    if (props.studentId) {
      urlData = await generateUploadUrl(file.value, props.studentId);
      await uploadWithProgress(file.value, urlData.uploadUrl, (p) => {
        progress.value = p;
      });
      result = await assignProfileImage(props.studentId, urlData.relativePath);
    } else if (props.userId) {
      urlData = await generateUploadUrlByUserId(file.value, props.userId);
      await uploadWithProgress(file.value, urlData.uploadUrl, (p) => {
        progress.value = p;
      });
      result = await assignProfileImageByUserId(props.userId, urlData.relativePath);
    }

    progress.value = 100;
    emit('success', result.imageUrl);
    alert('Upload successful!');
  } catch (err: any) {
    error.value = err.message || 'Upload failed';
  } finally {
    uploading.value = false;
  }
};
</script>
```

---

## Error Handling

### Common Errors and Solutions

```typescript
async function uploadProfileImage(file: File, studentId: string) {
  try {
    const urlData = await generateUploadUrl(file, studentId);
    await uploadToCloudStorage(file, urlData.uploadUrl);
    const result = await assignProfileImage(studentId, urlData.relativePath);
    return result;
  } catch (error) {
    if (error.message.includes('not found')) {
      // Student/User doesn't exist
      alert('Student not found. Please check the ID.');
    } else if (error.message.includes('File size')) {
      // File too large
      alert('File size must not exceed 5MB');
    } else if (error.message.includes('content type')) {
      // Invalid file type
      alert('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
    } else if (error.message.includes('File not found in storage')) {
      // Upload didn't complete
      alert('Upload failed. Please try again.');
    } else if (error.message.includes('expired')) {
      // URL expired
      alert('Upload URL expired. Please generate a new one.');
    } else {
      // Generic error
      alert('An error occurred: ' + error.message);
    }
    throw error;
  }
}
```

### Handling Expired URLs

```typescript
async function uploadWithRetry(
  file: File,
  studentId: string,
  maxRetries: number = 3
): Promise<AssignImageResponse> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Generate fresh URL for each attempt
      const urlData = await generateUploadUrl(file, studentId);
      
      // Upload must complete within 10 minutes
      await uploadToCloudStorage(file, urlData.uploadUrl);
      
      // Assign the image
      return await assignProfileImage(studentId, urlData.relativePath);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`Attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
    }
  }
}
```

---

## Best Practices

### 1. File Validation

```typescript
function validateImageFile(file: File): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Please select JPEG, PNG, GIF, or WebP.',
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'File size exceeds 5MB limit.',
    };
  }

  return { valid: true };
}
```

### 2. Image Compression Before Upload

```typescript
async function compressImage(file: File, maxWidth: number = 800): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(new File([blob], file.name, { type: file.type }));
            } else {
              reject(new Error('Compression failed'));
            }
          },
          file.type,
          0.9 // Quality
        );
      };
    };
    
    reader.onerror = reject;
  });
}

// Usage
const originalFile = document.getElementById('fileInput').files[0];
const compressedFile = await compressImage(originalFile);
```

### 3. Show Current Profile Image

```typescript
async function loadCurrentProfileImage(studentId: string): Promise<string | null> {
  try {
    const student = await lookupStudent(studentId);
    return student.imageUrl || null;
  } catch (error) {
    console.error('Failed to load current image:', error);
    return null;
  }
}

// In your component
useEffect(() => {
  loadCurrentProfileImage(studentId).then(imageUrl => {
    if (imageUrl) {
      setCurrentImageUrl(imageUrl);
    }
  });
}, [studentId]);
```

### 4. Cleanup Old Images (Optional)

```typescript
async function replaceProfileImage(
  file: File,
  studentId: string
): Promise<AssignImageResponse> {
  // Lookup current image first
  const student = await lookupStudent(studentId);
  const oldImageUrl = student.imageUrl;

  // Upload new image
  const urlData = await generateUploadUrl(file, studentId);
  await uploadToCloudStorage(file, urlData.uploadUrl);
  const result = await assignProfileImage(studentId, urlData.relativePath);

  // Log for potential cleanup
  if (oldImageUrl) {
    console.log('Previous image:', oldImageUrl);
    // Backend could implement a cleanup endpoint later
  }

  return result;
}
```

### 5. URL Expiry Warning

```typescript
function showExpiryWarning(expiresAt: string) {
  const expiryTime = new Date(expiresAt);
  const now = new Date();
  const minutesRemaining = (expiryTime.getTime() - now.getTime()) / 60000;

  if (minutesRemaining < 2) {
    alert(`Upload URL expires in ${minutesRemaining.toFixed(1)} minutes! Please complete upload soon.`);
  }
}
```

### 6. Loading States

```typescript
type UploadState = 
  | { status: 'idle' }
  | { status: 'generating-url' }
  | { status: 'uploading'; progress: number }
  | { status: 'assigning' }
  | { status: 'success'; imageUrl: string }
  | { status: 'error'; message: string };

const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });

async function handleCompleteUpload(file: File, studentId: string) {
  try {
    setUploadState({ status: 'generating-url' });
    const urlData = await generateUploadUrl(file, studentId);

    setUploadState({ status: 'uploading', progress: 0 });
    await uploadWithProgress(file, urlData.uploadUrl, (progress) => {
      setUploadState({ status: 'uploading', progress });
    });

    setUploadState({ status: 'assigning' });
    const result = await assignProfileImage(studentId, urlData.relativePath);

    setUploadState({ status: 'success', imageUrl: result.imageUrl });
  } catch (error) {
    setUploadState({ status: 'error', message: error.message });
  }
}

// Render based on state
{uploadState.status === 'generating-url' && <p>Preparing upload...</p>}
{uploadState.status === 'uploading' && <ProgressBar progress={uploadState.progress} />}
{uploadState.status === 'assigning' && <p>Finalizing...</p>}
{uploadState.status === 'success' && <p>✅ Upload successful!</p>}
{uploadState.status === 'error' && <p className="error">❌ {uploadState.message}</p>}
```

---

## Security Considerations

1. **Always use HTTPS** for API calls
2. **Validate auth tokens** before each request
3. **Validate file types** on frontend AND backend
4. **Check file size** before uploading
5. **Use signed URLs** (automatically handled by backend)
6. **URLs expire after 10 minutes** (automatic security)

---

## Testing Checklist

- [ ] File type validation works
- [ ] File size validation works (5MB limit)
- [ ] Upload progress displays correctly
- [ ] Error messages are user-friendly
- [ ] Image preview works
- [ ] Current image displays before upload
- [ ] Success message shows after upload
- [ ] Page updates with new image URL
- [ ] Works for both student ID and user ID
- [ ] Handles network errors gracefully
- [ ] Handles expired URLs
- [ ] Loading states work correctly

---

## Support

For issues or questions:
- Check error messages in browser console
- Verify auth token is valid
- Ensure student/user ID exists in database
- Check file meets requirements (type, size)
- Verify URL hasn't expired (10 min limit)

**Backend API Version:** v1.0  
**Last Updated:** January 23, 2026
