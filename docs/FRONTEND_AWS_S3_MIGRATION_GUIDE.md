# Frontend AWS S3 Upload Migration Guide

## 🎯 Overview

This guide helps you migrate from Google Cloud Storage (GCS) PUT uploads to AWS S3 POST uploads with multipart/form-data.

---

## 📋 Key Changes

### Before (GCS - PUT Method)
```javascript
// Old GCS approach
const response = await fetch(signedUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': contentType
  },
  body: file
});
```

### After (AWS S3 - POST Method)
```javascript
// New AWS S3 approach
const formData = new FormData();
// Add all fields from backend response FIRST
Object.keys(fields).forEach(key => {
  formData.append(key, fields[key]);
});
// Add file LAST
formData.append('file', file);

const response = await fetch(uploadUrl, {
  method: 'POST',
  body: formData
  // NO Content-Type header - browser sets it automatically
});
```

---

## 🚀 Complete Migration Steps

### Step 1: Update Backend API Call

**Request Signed URL (Same for both providers):**
```javascript
const getSignedUrl = async (folder, file) => {
  const token = localStorage.getItem('access_token');
  
  const params = new URLSearchParams({
    folder: folder,                    // e.g., 'profile-images'
    fileName: file.name,               // e.g., 'avatar.jpg'
    contentType: file.type,            // e.g., 'image/jpeg'
    fileSize: file.size                // e.g., 2048576
  });

  const response = await fetch(
    `${API_BASE_URL}/upload/get-signed-url?${params}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get signed URL');
  }

  return response.json();
};
```

**Backend Response Structure:**
```json
{
  "success": true,
  "message": "Signed URL generated successfully (10 min expiry)",
  "uploadUrl": "https://s3.amazonaws.com/suraksha-lms-main-bucket",
  "publicUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/file-uuid.jpg",
  "relativePath": "profile-images/file-uuid.jpg",
  "fields": {
    "key": "profile-images/file-uuid.jpg",
    "Content-Type": "image/jpeg",
    "x-amz-server-side-encryption": "AES256",
    "x-amz-meta-upload-timestamp": "2025-11-28T11:00:00.000Z",
    "x-amz-meta-original-filename": "avatar.jpg",
    "bucket": "suraksha-lms-main-bucket",
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": "...",
    "X-Amz-Date": "...",
    "Policy": "...",
    "X-Amz-Signature": "..."
  },
  "instructions": {
    "step1": "Upload file using: POST https://s3.amazonaws.com/...",
    "step2": "Submit multipart/form-data with file field + provided fields",
    "step3": "Call POST /upload/verify-and-publish with relativePath",
    "step4": "Use publicUrl in your application"
  }
}
```

---

### Step 2: Upload File to S3

**React/JavaScript Example:**
```javascript
const uploadToS3 = async (uploadUrl, fields, file) => {
  const formData = new FormData();
  
  // IMPORTANT: Add all fields from backend BEFORE the file
  Object.keys(fields).forEach(key => {
    formData.append(key, fields[key]);
  });
  
  // Add file LAST
  formData.append('file', file);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
    // DO NOT set Content-Type header - browser handles it
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`S3 upload failed: ${errorText}`);
  }

  return response;
};
```

**Axios Example:**
```javascript
import axios from 'axios';

const uploadToS3Axios = async (uploadUrl, fields, file) => {
  const formData = new FormData();
  
  // Add all fields first
  Object.keys(fields).forEach(key => {
    formData.append(key, fields[key]);
  });
  
  // Add file last
  formData.append('file', file);

  try {
    const response = await axios.post(uploadUrl, formData, {
      headers: {
        // Let axios set Content-Type automatically
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        console.log(`Upload progress: ${percentCompleted}%`);
      }
    });
    return response;
  } catch (error) {
    console.error('S3 upload error:', error.response?.data);
    throw error;
  }
};
```

---

### Step 3: Verify and Make Public

**After successful S3 upload, verify the file:**
```javascript
const verifyAndPublish = async (relativePath) => {
  const token = localStorage.getItem('access_token');

  const response = await fetch(
    `${API_BASE_URL}/upload/verify-and-publish`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ relativePath })
    }
  );

  if (!response.ok) {
    throw new Error('Failed to verify upload');
  }

  return response.json();
};
```

**Response:**
```json
{
  "success": true,
  "message": "File verified and made public successfully",
  "publicUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/file-uuid.jpg",
  "fileDetails": {
    "size": 2048576,
    "contentType": "image/jpeg",
    "lastModified": "2025-11-28T11:00:00.000Z"
  }
}
```

---

## 🔧 Complete Upload Function

**All-in-One Upload Handler:**
```javascript
/**
 * Complete upload handler for AWS S3
 * @param {File} file - File object from input
 * @param {string} folder - Target folder (e.g., 'profile-images')
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<string>} - Public URL of uploaded file
 */
const uploadFileToS3 = async (file, folder, onProgress) => {
  try {
    // Validate file size (frontend validation)
    const maxSizes = {
      'profile-images': 5 * 1024 * 1024,      // 5MB
      'student-images': 5 * 1024 * 1024,      // 5MB
      'institute-images': 10 * 1024 * 1024,   // 10MB
      'homework-files': 20 * 1024 * 1024,     // 20MB
      'payment-receipts': 10 * 1024 * 1024    // 10MB
    };

    if (file.size > maxSizes[folder]) {
      throw new Error(`File too large. Max size: ${maxSizes[folder] / 1024 / 1024}MB`);
    }

    // Step 1: Get signed URL
    onProgress?.({ stage: 'preparing', progress: 10 });
    const signedUrlData = await getSignedUrl(folder, file);
    const { uploadUrl, fields, relativePath, publicUrl } = signedUrlData;

    // Step 2: Upload to S3
    onProgress?.({ stage: 'uploading', progress: 30 });
    const formData = new FormData();
    
    Object.keys(fields).forEach(key => {
      formData.append(key, fields[key]);
    });
    formData.append('file', file);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      throw new Error(`S3 upload failed: ${uploadResponse.statusText}`);
    }

    // Step 3: Verify and make public
    onProgress?.({ stage: 'verifying', progress: 80 });
    const verifyResult = await verifyAndPublish(relativePath);

    onProgress?.({ stage: 'complete', progress: 100 });
    
    return verifyResult.publicUrl || publicUrl;

  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
};
```

---

## 🎨 React Component Example

**Complete React Upload Component:**
```jsx
import React, { useState } from 'react';

const FileUploader = ({ folder, onUploadComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const publicUrl = await uploadFileToS3(
        file,
        folder,
        ({ stage, progress }) => {
          setProgress(progress);
          console.log(`${stage}: ${progress}%`);
        }
      );

      onUploadComplete?.(publicUrl);
      alert('Upload successful!');
      
    } catch (err) {
      setError(err.message);
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="file-uploader">
      <input
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        disabled={uploading}
      />
      
      {uploading && (
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${progress}%` }}
          />
          <span>{progress}%</span>
        </div>
      )}
      
      {error && (
        <div className="error-message">
          Error: {error}
        </div>
      )}
    </div>
  );
};

export default FileUploader;
```

---

## 📱 Mobile (React Native) Example

**React Native Upload:**
```javascript
import { launchImageLibrary } from 'react-native-image-picker';

const uploadImageMobile = async (folder) => {
  try {
    // Step 1: Select image
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8
    });

    if (result.didCancel) return;

    const file = result.assets[0];
    
    // Step 2: Get signed URL
    const signedUrlData = await getSignedUrl(folder, {
      name: file.fileName,
      type: file.type,
      size: file.fileSize
    });

    // Step 3: Upload to S3
    const formData = new FormData();
    
    Object.keys(signedUrlData.fields).forEach(key => {
      formData.append(key, signedUrlData.fields[key]);
    });
    
    formData.append('file', {
      uri: file.uri,
      type: file.type,
      name: file.fileName
    });

    const uploadResponse = await fetch(signedUrlData.uploadUrl, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      throw new Error('Upload failed');
    }

    // Step 4: Verify
    const verifyResult = await verifyAndPublish(signedUrlData.relativePath);
    
    return verifyResult.publicUrl;

  } catch (error) {
    console.error('Mobile upload error:', error);
    throw error;
  }
};
```

---

## ⚠️ Common Issues & Solutions

### Issue 1: 403 Forbidden - SignatureDoesNotMatch
**Cause:** Fields added in wrong order or Content-Type header manually set

**Solution:**
```javascript
// ❌ WRONG - Setting Content-Type manually
const formData = new FormData();
formData.append('file', file);
fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'multipart/form-data' }, // ❌ DON'T DO THIS
  body: formData
});

// ✅ CORRECT - Let browser set Content-Type
const formData = new FormData();
Object.keys(fields).forEach(key => formData.append(key, fields[key]));
formData.append('file', file);
fetch(url, {
  method: 'POST',
  body: formData  // ✅ No headers needed
});
```

---

### Issue 2: CORS Error
**Cause:** S3 bucket CORS not configured

**Solution:** Configure CORS in AWS S3 Console:
```json
[
  {
    "AllowedOrigins": [
      "https://lms.suraksha.lk",
      "https://admin.suraksha.lk",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "POST", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

See: `docs/AWS_S3_CORS_CONFIGURATION.md`

---

### Issue 3: EntityTooLarge
**Cause:** File exceeds size limit in S3 policy

**Solution:** Validate file size before upload:
```javascript
const validateFileSize = (file, folder) => {
  const limits = {
    'profile-images': 5 * 1024 * 1024,
    'homework-files': 20 * 1024 * 1024
  };

  if (file.size > limits[folder]) {
    throw new Error(
      `File too large. Maximum: ${limits[folder] / 1024 / 1024}MB`
    );
  }
};
```

---

### Issue 4: Invalid Content-Type
**Cause:** Uploading wrong file type for folder

**Solution:** Validate content type:
```javascript
const validateContentType = (file, folder) => {
  const allowedTypes = {
    'profile-images': ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    'payment-receipts': ['image/jpeg', 'image/png', 'application/pdf'],
    'homework-files': ['application/pdf', 'image/jpeg', 'image/png']
  };

  if (!allowedTypes[folder].includes(file.type)) {
    throw new Error(`Invalid file type for ${folder}`);
  }
};
```

---

## 🔒 Security Best Practices

### 1. Client-Side Validation
```javascript
const validateFile = (file, folder) => {
  // Size validation
  const maxSize = getMaxSizeForFolder(folder);
  if (file.size > maxSize) {
    throw new Error('File too large');
  }

  // Type validation
  const allowedTypes = getAllowedTypesForFolder(folder);
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type');
  }

  // Extension validation
  const suspiciousExtensions = ['.exe', '.php', '.sh', '.bat'];
  if (suspiciousExtensions.some(ext => file.name.endsWith(ext))) {
    throw new Error('Suspicious file extension');
  }
};
```

### 2. Progress Monitoring
```javascript
const uploadWithProgress = async (file, folder, onProgress) => {
  const xhr = new XMLHttpRequest();
  
  return new Promise((resolve, reject) => {
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        onProgress?.(percentComplete);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 204 || xhr.status === 200) {
        resolve(xhr.response);
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    // Get signed URL and upload...
  });
};
```

### 3. Error Handling
```javascript
const uploadWithRetry = async (file, folder, maxRetries = 3) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await uploadFileToS3(file, folder);
    } catch (error) {
      lastError = error;
      console.warn(`Upload attempt ${i + 1} failed:`, error);
      
      if (i < maxRetries - 1) {
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, i) * 1000)
        );
      }
    }
  }
  
  throw lastError;
};
```

---

## 📊 Folder Configuration Reference

| Folder | Max Size | Allowed Types | Use Case |
|--------|----------|---------------|----------|
| `profile-images` | 5MB | JPEG, PNG, GIF, WebP | User avatars |
| `student-images` | 5MB | JPEG, PNG, GIF, WebP | Student photos |
| `institute-images` | 10MB | JPEG, PNG, SVG | Institute logos |
| `institute-user-images` | 5MB | JPEG, PNG, GIF, WebP | Staff photos |
| `subject-images` | 5MB | JPEG, PNG, SVG | Subject icons |
| `homework-files` | 20MB | PDF, JPEG, PNG | Student homework |
| `correction-files` | 20MB | PDF, JPEG, PNG | Teacher corrections |
| `payment-receipts` | 10MB | PDF, JPEG, PNG | Payment proofs |
| `id-documents` | 10MB | PDF, JPEG, PNG | ID cards, certificates |
| `bookhire-vehicle-images` | 10MB | JPEG, PNG | Vehicle photos |
| `bookhire-owner-images` | 5MB | JPEG, PNG | Owner photos |

---

## 🧪 Testing Checklist

- [ ] Upload succeeds for valid files
- [ ] Oversized files are rejected (client-side)
- [ ] Oversized files are rejected (server-side)
- [ ] Invalid content types are rejected
- [ ] Suspicious extensions are blocked
- [ ] Progress tracking works
- [ ] Error handling works
- [ ] Retry logic works
- [ ] CORS configured properly
- [ ] Public URLs are accessible
- [ ] Files are encrypted (AES-256)
- [ ] Metadata is tracked

---

## 📞 Support

**Documentation:**
- AWS S3 Implementation: `docs/AWS_S3_SIGNED_URL_IMPLEMENTATION.md`
- Security Features: `docs/UPLOAD_SECURITY_FEATURES.md`
- CORS Setup: `docs/AWS_S3_CORS_CONFIGURATION.md`
- IAM Permissions: `docs/AWS_IAM_PERMISSIONS_REQUIRED.md`

**API Endpoints:**
- Get Signed URL: `GET /upload/get-signed-url`
- Verify Upload: `POST /upload/verify-and-publish`
- Alternative POST: `POST /upload/generate-signed-url` (with body)

**Environment:**
- Storage Provider: `STORAGE_PROVIDER=aws`
- S3 Bucket: `suraksha-lms-main-bucket`
- Region: `us-east-1`
- Encryption: AES-256 (mandatory)

---

## 🎯 Quick Migration Summary

1. **Change HTTP method**: PUT → POST
2. **Use FormData**: Add all fields, then file
3. **Remove Content-Type header**: Let browser set it
4. **Add verification step**: Call `/verify-and-publish`
5. **Configure CORS**: Follow S3 CORS guide
6. **Test thoroughly**: All folders, sizes, types

**Migration Time Estimate:** 2-4 hours per application

---

*Last Updated: November 28, 2025*
*Backend Version: AWS S3 POST with 10+ security layers*
