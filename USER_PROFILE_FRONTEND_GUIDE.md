# User Profile Management - Frontend Integration Guide

**Date:** January 10, 2026  
**Priority:** High  
**Version:** 2.0

---

## 📋 Overview

This document provides comprehensive guidance for implementing user profile pages in the frontend, including GET and UPDATE operations with proper field handling based on user type.

---

## 🔗 API Endpoints

### 1. GET User Profile
**Endpoint:** `GET /users/profile`  
**Authentication:** Required (JWT Bearer Token)  
**Description:** Retrieve the authenticated user's complete profile

### 2. UPDATE User Profile
**Endpoint:** `PATCH /users/profile`  
**Authentication:** Required (JWT Bearer Token)  
**Description:** Update the authenticated user's profile

### 3. UPDATE Profile Image
**Endpoint:** `POST /users/:id/profile-image`  
**Authentication:** Required (JWT Bearer Token)  
**Rate Limit:** 5 requests per 15 minutes  
**Description:** Update user profile picture using secure signed URL workflow

---

## 📥 GET Profile Response

### Request
```http
GET /users/profile
Authorization: Bearer <access_token>
```

### Response Structure
```typescript
interface UserProfileResponse {
  id: string;
  nameWithInitials: string;         // ✅ Always present
  email: string;                    // ⚠️ MASKED (e.g., "j***@example.com")
  phoneNumber?: string;             // ⚠️ MASKED (e.g., "+94****567")
  userType: 'STUDENT' | 'PARENT' | 'TEACHER' | 'INSTITUTE_ADMIN' | 'SUPERADMIN' | 'ORGANIZATION_MANAGER';
  imageUrl?: string;                // Profile image URL
  
  // Personal Information (Optional fields)
  nic?: string;
  birthCertificateNo?: string;
  dateOfBirth?: string;             // Format: "yyyy-MM-dd"
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  
  // Address Information
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district: string;                 // ✅ Always present
  province: string;                 // ✅ Always present
  postalCode?: string;
  country?: string;
  
  // Additional Information
  preferredLanguage?: 'ENGLISH' | 'SINHALA' | 'TAMIL';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  
  // Type-specific fields (conditionally present based on userType)
  // STUDENT specific:
  studentId?: string;
  emergencyContact?: string;
  bloodGroup?: string;
  
  // PARENT specific:
  occupation?: string;
  workplace?: string;
  educationLevel?: string;
}
```

### Example Response
```json
{
  "id": "12345",
  "nameWithInitials": "J. Doe",
  "email": "j***@example.com",
  "phoneNumber": "+94****567",
  "userType": "STUDENT",
  "imageUrl": "https://storage.googleapis.com/bucket/profile-images/user-12345.jpg",
  "nic": "200012345678",
  "dateOfBirth": "2000-05-15",
  "gender": "MALE",
  "addressLine1": "123 Main Street",
  "city": "Colombo",
  "district": "COLOMBO",
  "province": "WESTERN",
  "postalCode": "10100",
  "country": "SRI_LANKA",
  "preferredLanguage": "ENGLISH",
  "isActive": true,
  "studentId": "STU2024001",
  "emergencyContact": "+94771234567",
  "bloodGroup": "O+",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2026-01-10T14:20:00.000Z"
}
```

---

## 📤 UPDATE Profile Request

### Request
```http
PATCH /users/profile
Authorization: Bearer <access_token>
Content-Type: application/json
```

### ⚠️ IMPORTANT RULES

1. **❌ DO NOT SEND** `email` and `phoneNumber` in update requests (they are masked in responses)
2. **❌ DO NOT SEND** `addressLine2` unless user explicitly filled it (it's optional)
3. **✅ SEND ONLY** fields that user can actually edit
4. **✅ VALIDATE** all fields client-side before sending

### Request Body Structure
```typescript
interface UpdateUserProfileRequest {
  // Personal Information
  nic?: string;                     // Optional, max 12 chars
  birthCertificateNo?: string;      // Optional, max 50 chars
  dateOfBirth?: string;             // Format: "yyyy-MM-dd"
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  
  // Address Information
  addressLine1?: string;            // Optional, max 200 chars
  addressLine2?: string;            // ⚠️ Only if user fills it, max 200 chars
  city?: string;                    // Optional, max 50 chars
  district?: string;                // Optional (but recommended)
  province?: string;                // Optional (but recommended)
  postalCode?: string;              // Optional, max 6 chars
  country?: string;                 // Optional, default: SRI_LANKA
  
  // Additional Settings
  preferredLanguage?: 'ENGLISH' | 'SINHALA' | 'TAMIL';
  
  // Type-specific fields (send only if userType matches)
  // STUDENT specific:
  emergencyContact?: string;        // Optional, 10-15 chars
  bloodGroup?: string;              // Optional
  
  // PARENT specific:
  occupation?: string;              // Optional, max 100 chars
  workplace?: string;               // Optional, max 100 chars
  educationLevel?: string;          // Optional
}
```

### Example Update Request
```json
{
  "nic": "200012345678",
  "dateOfBirth": "2000-05-15",
  "gender": "MALE",
  "addressLine1": "123 Main Street",
  "city": "Colombo",
  "district": "COLOMBO",
  "province": "WESTERN",
  "postalCode": "10100",
  "preferredLanguage": "ENGLISH",
  "emergencyContact": "+94771234567",
  "bloodGroup": "O+"
}
```

### ❌ WRONG - Do Not Send Email/Phone
```json
{
  "email": "john.doe@example.com",       // ❌ DON'T SEND
  "phoneNumber": "+94771234567",         // ❌ DON'T SEND
  "addressLine1": "123 Main Street"
}
```

### Response (200 OK)
```json
{
  "id": "12345",
  "nameWithInitials": "J. Doe",
  "email": "j***@example.com",
  "phoneNumber": "+94****567",
  "userType": "STUDENT",
  "dateOfBirth": "2000-05-15",
  "gender": "MALE",
  "addressLine1": "123 Main Street",
  "city": "Colombo",
  "district": "COLOMBO",
  "province": "WESTERN",
  "postalCode": "10100",
  "isActive": true,
  "updatedAt": "2026-01-10T14:30:00.000Z"
}
```

---

## 🖼️ PROFILE IMAGE UPLOAD

### Overview
Profile image updates use a **secure 3-step signed URL workflow** to prevent direct file uploads and ensure security. The workflow is:

1. **Generate signed URL** - Get a short-lived (10 min) private upload URL
2. **Upload to cloud** - Upload file directly to cloud storage using PUT request
3. **Verify & update** - Backend verifies file and updates user profile

This ensures files are validated, size-limited, and only authorized uploads succeed.

---

### Step 1: Generate Signed Upload URL

**Endpoint:** `POST /upload/generate-signed-url`

```http
POST /upload/generate-signed-url
Authorization: Bearer <access_token>
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
    "uploadUrl": "https://storage.googleapis.com/bucket/profile-images/user-12345-uuid.jpg?X-Goog-Algorithm=...",
    "relativePath": "profile-images/user-12345-uuid.jpg",
    "expiresAt": "2026-01-10T15:00:00.000Z",
    "maxFileSize": 5242880,
    "contentType": "image/jpeg"
  },
  "instructions": {
    "uploadMethod": "PUT",
    "headers": {
      "Content-Type": "image/jpeg",
      "x-goog-content-length-range": "0,5242880"
    },
    "maxFileSize": 5242880
  }
}
```

**⚠️ IMPORTANT:**
- **Expires in 10 minutes** - Upload must complete within this time
- **File size limit:** 5MB (5242880 bytes) for profile images
- **Allowed formats:** JPG, JPEG, PNG, WEBP only
- Save `relativePath` for step 3

---

### Step 2: Upload File to Cloud Storage

Use the `uploadUrl` from step 1 to upload the file directly using a **PUT request**.

```typescript
// Upload file using PUT request
async uploadFileToSignedUrl(
  uploadUrl: string, 
  file: File, 
  contentType: string
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-goog-content-length-range': '0,5242880' // REQUIRED
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }
}
```

**⚠️ CRITICAL REQUIREMENTS:**
- Must use **PUT method** (not POST)
- Must include **Content-Type header** matching the contentType from step 1
- Must include **x-goog-content-length-range header** for size validation
- Upload the raw file (not FormData)

---

### Step 3: Verify and Update Profile

**Endpoint:** `POST /upload/verify-and-publish`

After successful upload, verify the file and make it public:

```http
POST /upload/verify-and-publish
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "relativePath": "profile-images/user-12345-uuid.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "message": "File verified and made public successfully",
  "publicUrl": "https://storage.googleapis.com/bucket/profile-images/user-12345-uuid.jpg",
  "relativePath": "profile-images/user-12345-uuid.jpg"
}
```

---

### Step 4: Update User Profile with Image URL

**Endpoint:** `POST /users/:id/profile-image`

Now update the user's profile with the verified image URL:

```http
POST /users/123/profile-image
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "imageUrl": "https://storage.googleapis.com/bucket/profile-images/user-12345-uuid.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile image updated successfully",
  "data": {
    "userId": "123",
    "imageUrl": "https://storage.googleapis.com/bucket/profile-images/user-12345-uuid.jpg"
  }
}
```

---

### Complete Implementation

```typescript
// services/profile-image.service.ts
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

interface UploadProgress {
  step: number;
  message: string;
  progress: number;
}

export const profileImageService = {
  /**
   * Complete workflow to upload and update profile image
   * @param file - Image file to upload
   * @param userId - User ID to update
   * @param onProgress - Progress callback
   */
  async uploadProfileImage(
    file: File,
    userId: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<string> {
    try {
      // Validate file
      this.validateImageFile(file);

      // Step 1: Generate signed URL
      onProgress?.({ step: 1, message: 'Generating upload URL...', progress: 20 });
      
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
            Authorization: `Bearer ${localStorage.getItem('access_token')}`
          }
        }
      );

      const { uploadUrl, relativePath } = signedUrlResponse.data.data;
      const { headers } = signedUrlResponse.data.instructions;

      // Step 2: Upload file to cloud storage
      onProgress?.({ step: 2, message: 'Uploading image...', progress: 40 });
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': headers['Content-Type'],
          'x-goog-content-length-range': headers['x-goog-content-length-range']
        },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      // Step 3: Verify and publish
      onProgress?.({ step: 3, message: 'Verifying upload...', progress: 70 });
      
      const verifyResponse = await axios.post(
        `${API_BASE_URL}/upload/verify-and-publish`,
        { relativePath },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('access_token')}`
          }
        }
      );

      const publicUrl = verifyResponse.data.publicUrl;

      // Step 4: Update user profile
      onProgress?.({ step: 4, message: 'Updating profile...', progress: 90 });
      
      await axios.post(
        `${API_BASE_URL}/users/${userId}/profile-image`,
        { imageUrl: publicUrl },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('access_token')}`
          }
        }
      );

      onProgress?.({ step: 4, message: 'Complete!', progress: 100 });

      return publicUrl;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.message || 
        error.message || 
        'Failed to upload profile image'
      );
    }
  },

  /**
   * Validate image file before upload
   */
  validateImageFile(file: File): void {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Only JPG, PNG, and WebP images are allowed');
    }

    // Check file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new Error('Image size must be less than 5MB');
    }

    // Check file name for security (no double extensions)
    const fileName = file.name.toLowerCase();
    const dangerousPatterns = [
      /\.php/,
      /\.exe/,
      /\.sh/,
      /\.bat/,
      /\.\w+\.(jpg|jpeg|png|webp)$/ // Double extension like .php.jpg
    ];

    if (dangerousPatterns.some(pattern => pattern.test(fileName))) {
      throw new Error('Invalid file name detected');
    }
  }
};
```

---

### React Component Example

```typescript
// components/ProfileImageUpload.tsx
import React, { useState } from 'react';
import { profileImageService } from '../services/profile-image.service';

interface Props {
  userId: string;
  currentImageUrl?: string;
  onSuccess: (newImageUrl: string) => void;
}

export const ProfileImageUpload: React.FC<Props> = ({ 
  userId, 
  currentImageUrl, 
  onSuccess 
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ step: 0, message: '', progress: 0 });
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);
      
      // Validate file
      profileImageService.validateImageFile(file);
      
      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
      
      // Upload
      setUploading(true);
      const newImageUrl = await profileImageService.uploadProfileImage(
        file,
        userId,
        (prog) => setProgress(prog)
      );
      
      onSuccess(newImageUrl);
      setUploading(false);
    } catch (err: any) {
      setError(err.message);
      setUploading(false);
      setPreview(null);
    }
  };

  return (
    <div className="profile-image-upload">
      <div className="image-preview">
        <img 
          src={preview || currentImageUrl || '/default-avatar.png'} 
          alt="Profile" 
          className="profile-image"
        />
      </div>

      {error && (
        <div className="error-message">{error}</div>
      )}

      {uploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress.progress}%` }}
            />
          </div>
          <p className="progress-text">
            Step {progress.step}/4: {progress.message}
          </p>
        </div>
      )}

      <label className="upload-button">
        <input
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handleFileSelect}
          disabled={uploading}
          style={{ display: 'none' }}
        />
        {uploading ? 'Uploading...' : 'Change Photo'}
      </label>

      <p className="upload-hint">
        Allowed: JPG, PNG, WebP • Max size: 5MB
      </p>
    </div>
  );
};
```

---

### Error Handling

```typescript
// Common errors and solutions
const ERROR_MESSAGES: Record<string, string> = {
  'FILE_TOO_LARGE': 'Image size exceeds 5MB. Please compress and try again.',
  'INVALID_FILE_TYPE': 'Only JPG, PNG, and WebP images are allowed.',
  'UPLOAD_EXPIRED': 'Upload time expired. Please try again.',
  'FILE_NOT_FOUND': 'Upload verification failed. Please try again.',
  'UNAUTHORIZED': 'Session expired. Please log in again.',
  'RATE_LIMIT': 'Too many attempts. Please wait 15 minutes.'
};

// Handle API errors
try {
  await profileImageService.uploadProfileImage(file, userId);
} catch (error: any) {
  const errorCode = error.response?.data?.error;
  const message = ERROR_MESSAGES[errorCode] || error.message;
  alert(message);
}
```

---

### Best Practices

1. **✅ Client-Side Validation:**
   - Validate file type before upload
   - Check file size (max 5MB)
   - Show preview before uploading
   - Validate file name (no double extensions)

2. **✅ Progress Feedback:**
   - Show progress indicator during upload
   - Display current step (1-4)
   - Show percentage completion
   - Disable upload button while processing

3. **✅ Error Recovery:**
   - Catch and display user-friendly errors
   - Allow retry on failure
   - Clear preview on error
   - Log errors for debugging

4. **✅ Security:**
   - Never skip validation steps
   - Always use signed URLs (never direct upload)
   - Verify file after upload
   - Respect rate limits (5 uploads per 15 min)

5. **✅ UX Considerations:**
   - Show current profile image
   - Allow image preview before upload
   - Display upload progress clearly
   - Confirm successful upload
   - Update UI immediately after success

---

### Rate Limiting

**Profile image uploads are rate-limited:**
- **Limit:** 5 uploads per 15 minutes per user
- **Reason:** Prevent abuse and excessive storage usage
- **Response:** 429 Too Many Requests

```typescript
// Handle rate limit
if (error.response?.status === 429) {
  const retryAfter = error.response.headers['retry-after'];
  alert(`Too many uploads. Please wait ${retryAfter} seconds.`);
}
```

---

### File Size Limits

| Image Type | Max Size | Allowed Formats |
|-----------|----------|-----------------|
| Profile Images | 5MB | JPG, JPEG, PNG, WEBP |

**Server-side enforcement:**
- Size validated in signed URL generation
- Size validated in cloud storage PUT request
- Size validated during backend verification

---

## 🎯 Frontend Implementation Guide

### Step 1: Create TypeScript Interfaces

```typescript
// types/user-profile.ts

export enum UserType {
  STUDENT = 'STUDENT',
  PARENT = 'PARENT',
  TEACHER = 'TEACHER',
  INSTITUTE_ADMIN = 'INSTITUTE_ADMIN',
  SUPERADMIN = 'SUPERADMIN',
  ORGANIZATION_MANAGER = 'ORGANIZATION_MANAGER'
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER'
}

export enum Province {
  WESTERN = 'WESTERN',
  CENTRAL = 'CENTRAL',
  SOUTHERN = 'SOUTHERN',
  NORTHERN = 'NORTHERN',
  EASTERN = 'EASTERN',
  NORTH_WESTERN = 'NORTH_WESTERN',
  NORTH_CENTRAL = 'NORTH_CENTRAL',
  UVA = 'UVA',
  SABARAGAMUWA = 'SABARAGAMUWA'
}

export enum District {
  COLOMBO = 'COLOMBO',
  GAMPAHA = 'GAMPAHA',
  KALUTARA = 'KALUTARA',
  KANDY = 'KANDY',
  MATALE = 'MATALE',
  // ... add all districts
}

export interface UserProfile {
  id: string;
  nameWithInitials: string;
  email: string;                    // Masked
  phoneNumber?: string;             // Masked
  userType: UserType;
  imageUrl?: string;
  
  // Personal
  nic?: string;
  birthCertificateNo?: string;
  dateOfBirth?: string;
  gender?: Gender;
  
  // Address
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district: District;
  province: Province;
  postalCode?: string;
  country?: string;
  
  // Additional
  preferredLanguage?: 'ENGLISH' | 'SINHALA' | 'TAMIL';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  
  // Type-specific (optional)
  studentId?: string;
  emergencyContact?: string;
  bloodGroup?: string;
  occupation?: string;
  workplace?: string;
  educationLevel?: string;
}

export interface UpdateProfileRequest {
  nic?: string;
  birthCertificateNo?: string;
  dateOfBirth?: string;
  gender?: Gender;
  addressLine1?: string;
  addressLine2?: string;            // Only if filled
  city?: string;
  district?: District;
  province?: Province;
  postalCode?: string;
  country?: string;
  preferredLanguage?: 'ENGLISH' | 'SINHALA' | 'TAMIL';
  
  // Student specific
  emergencyContact?: string;
  bloodGroup?: string;
  
  // Parent specific
  occupation?: string;
  workplace?: string;
  educationLevel?: string;
}
```

### Step 2: API Service

```typescript
// services/user-profile.service.ts
import axios from 'axios';
import { UserProfile, UpdateProfileRequest } from '../types/user-profile';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

export const userProfileService = {
  /**
   * Get current user profile
   */
  async getProfile(): Promise<UserProfile> {
    const response = await axios.get(`${API_BASE_URL}/users/profile`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('access_token')}`
      }
    });
    return response.data;
  },

  /**
   * Update current user profile
   * ⚠️ DO NOT send email and phoneNumber (they are masked)
   */
  async updateProfile(data: UpdateProfileRequest): Promise<UserProfile> {
    // ✅ Filter out email and phoneNumber if accidentally included
    const { email, phoneNumber, ...cleanData } = data as any;
    
    // ✅ Remove addressLine2 if empty
    if (cleanData.addressLine2 === '' || cleanData.addressLine2 === null) {
      delete cleanData.addressLine2;
    }
    
    const response = await axios.patch(
      `${API_BASE_URL}/users/profile`,
      cleanData,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`
        }
      }
    );
    return response.data;
  }
};
```

### Step 3: Profile Form Component

```typescript
// components/UserProfileForm.tsx
import React, { useState, useEffect } from 'react';
import { userProfileService } from '../services/user-profile.service';
import { UserProfile, UpdateProfileRequest, UserType } from '../types/user-profile';

export const UserProfileForm: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<UpdateProfileRequest>({});

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await userProfileService.getProfile();
      setProfile(data);
      
      // Initialize form with existing data
      setFormData({
        nic: data.nic || '',
        birthCertificateNo: data.birthCertificateNo || '',
        dateOfBirth: data.dateOfBirth || '',
        gender: data.gender,
        addressLine1: data.addressLine1 || '',
        addressLine2: data.addressLine2 || '',
        city: data.city || '',
        district: data.district,
        province: data.province,
        postalCode: data.postalCode || '',
        country: data.country || 'SRI_LANKA',
        preferredLanguage: data.preferredLanguage || 'ENGLISH',
        emergencyContact: data.emergencyContact || '',
        bloodGroup: data.bloodGroup || '',
        occupation: data.occupation || '',
        workplace: data.workplace || '',
        educationLevel: data.educationLevel || ''
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      setError(null);
      
      // ✅ Prepare clean data (remove empty strings and addressLine2 if not needed)
      const cleanData: UpdateProfileRequest = {};
      
      Object.entries(formData).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          cleanData[key as keyof UpdateProfileRequest] = value;
        }
      });
      
      // ✅ Remove addressLine2 if empty
      if (!cleanData.addressLine2 || cleanData.addressLine2.trim() === '') {
        delete cleanData.addressLine2;
      }
      
      const updated = await userProfileService.updateProfile(cleanData);
      setProfile(updated);
      alert('Profile updated successfully!');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof UpdateProfileRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading) return <div>Loading profile...</div>;
  if (!profile) return <div>Profile not found</div>;

  return (
    <form onSubmit={handleSubmit} className="profile-form">
      <h2>User Profile</h2>
      
      {error && <div className="error-message">{error}</div>}
      
      {/* Display Only Fields */}
      <div className="readonly-section">
        <h3>Account Information</h3>
        <div className="form-field">
          <label>Name:</label>
          <input type="text" value={profile.nameWithInitials} disabled />
        </div>
        <div className="form-field">
          <label>Email:</label>
          <input type="text" value={profile.email} disabled />
          <small className="help-text">⚠️ Contact admin to change email</small>
        </div>
        {profile.phoneNumber && (
          <div className="form-field">
            <label>Phone:</label>
            <input type="text" value={profile.phoneNumber} disabled />
            <small className="help-text">⚠️ Contact admin to change phone</small>
          </div>
        )}
        <div className="form-field">
          <label>User Type:</label>
          <input type="text" value={profile.userType} disabled />
        </div>
      </div>

      {/* Editable Fields */}
      <div className="editable-section">
        <h3>Personal Information</h3>
        
        <div className="form-field">
          <label>NIC (Optional):</label>
          <input
            type="text"
            value={formData.nic || ''}
            onChange={(e) => handleChange('nic', e.target.value)}
            maxLength={12}
            placeholder="123456789V or 200012345678"
          />
        </div>

        <div className="form-field">
          <label>Date of Birth (Optional):</label>
          <input
            type="date"
            value={formData.dateOfBirth || ''}
            onChange={(e) => handleChange('dateOfBirth', e.target.value)}
          />
        </div>

        <div className="form-field">
          <label>Gender (Optional):</label>
          <select
            value={formData.gender || ''}
            onChange={(e) => handleChange('gender', e.target.value)}
          >
            <option value="">Select Gender</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <h3>Address Information</h3>
        
        <div className="form-field">
          <label>Address Line 1 (Optional):</label>
          <input
            type="text"
            value={formData.addressLine1 || ''}
            onChange={(e) => handleChange('addressLine1', e.target.value)}
            maxLength={200}
            placeholder="Street address"
          />
        </div>

        <div className="form-field">
          <label>Address Line 2 (Optional):</label>
          <input
            type="text"
            value={formData.addressLine2 || ''}
            onChange={(e) => handleChange('addressLine2', e.target.value)}
            maxLength={200}
            placeholder="Apartment, suite, etc. (optional)"
          />
          <small className="help-text">Leave empty if not needed</small>
        </div>

        <div className="form-field">
          <label>City (Optional):</label>
          <input
            type="text"
            value={formData.city || ''}
            onChange={(e) => handleChange('city', e.target.value)}
            maxLength={50}
          />
        </div>

        <div className="form-field">
          <label>District (Required):</label>
          <select
            value={formData.district || ''}
            onChange={(e) => handleChange('district', e.target.value)}
            required
          >
            <option value="">Select District</option>
            <option value="COLOMBO">Colombo</option>
            <option value="GAMPAHA">Gampaha</option>
            {/* Add all districts */}
          </select>
        </div>

        <div className="form-field">
          <label>Province (Required):</label>
          <select
            value={formData.province || ''}
            onChange={(e) => handleChange('province', e.target.value)}
            required
          >
            <option value="">Select Province</option>
            <option value="WESTERN">Western</option>
            <option value="CENTRAL">Central</option>
            {/* Add all provinces */}
          </select>
        </div>

        <div className="form-field">
          <label>Postal Code (Optional):</label>
          <input
            type="text"
            value={formData.postalCode || ''}
            onChange={(e) => handleChange('postalCode', e.target.value)}
            maxLength={6}
            placeholder="10100"
          />
        </div>

        {/* Conditional Fields Based on User Type */}
        {profile.userType === UserType.STUDENT && (
          <>
            <h3>Student Information</h3>
            
            {profile.studentId && (
              <div className="form-field">
                <label>Student ID:</label>
                <input type="text" value={profile.studentId} disabled />
              </div>
            )}
            
            <div className="form-field">
              <label>Emergency Contact (Optional):</label>
              <input
                type="text"
                value={formData.emergencyContact || ''}
                onChange={(e) => handleChange('emergencyContact', e.target.value)}
                maxLength={15}
                placeholder="+94771234567"
              />
            </div>

            <div className="form-field">
              <label>Blood Group (Optional):</label>
              <select
                value={formData.bloodGroup || ''}
                onChange={(e) => handleChange('bloodGroup', e.target.value)}
              >
                <option value="">Select Blood Group</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
            </div>
          </>
        )}

        {profile.userType === UserType.PARENT && (
          <>
            <h3>Parent Information</h3>
            
            <div className="form-field">
              <label>Occupation (Optional):</label>
              <input
                type="text"
                value={formData.occupation || ''}
                onChange={(e) => handleChange('occupation', e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="form-field">
              <label>Workplace (Optional):</label>
              <input
                type="text"
                value={formData.workplace || ''}
                onChange={(e) => handleChange('workplace', e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="form-field">
              <label>Education Level (Optional):</label>
              <input
                type="text"
                value={formData.educationLevel || ''}
                onChange={(e) => handleChange('educationLevel', e.target.value)}
                maxLength={50}
              />
            </div>
          </>
        )}
      </div>

      <button type="submit" disabled={saving}>
        {saving ? 'Saving...' : 'Update Profile'}
      </button>
    </form>
  );
};
```

---

## 🎨 UI/UX Guidelines

### 1. **Field Visibility Rules**

```typescript
// Field visibility based on user type and data availability
const getVisibleFields = (profile: UserProfile): string[] => {
  const commonFields = [
    'nameWithInitials',
    'email',
    'phoneNumber',
    'userType',
    'nic',
    'dateOfBirth',
    'gender',
    'addressLine1',
    'addressLine2',
    'city',
    'district',
    'province',
    'postalCode'
  ];

  const typeSpecificFields: Record<UserType, string[]> = {
    [UserType.STUDENT]: ['studentId', 'emergencyContact', 'bloodGroup'],
    [UserType.PARENT]: ['occupation', 'workplace', 'educationLevel'],
    [UserType.TEACHER]: [],
    [UserType.INSTITUTE_ADMIN]: [],
    [UserType.SUPERADMIN]: [],
    [UserType.ORGANIZATION_MANAGER]: []
  };

  return [
    ...commonFields,
    ...(typeSpecificFields[profile.userType] || [])
  ];
};

// Only show fields that exist in response
const shouldShowField = (field: string, profile: UserProfile): boolean => {
  const visibleFields = getVisibleFields(profile);
  return visibleFields.includes(field) && profile[field] !== undefined;
};
```

### 2. **Read-Only vs Editable Fields**

```typescript
// Read-only fields (display only, cannot be edited)
const READ_ONLY_FIELDS = [
  'id',
  'nameWithInitials',
  'email',           // ⚠️ Masked
  'phoneNumber',     // ⚠️ Masked
  'userType',
  'studentId',       // System generated
  'isActive',
  'createdAt',
  'updatedAt'
];

// Editable fields
const EDITABLE_FIELDS = [
  'nic',
  'birthCertificateNo',
  'dateOfBirth',
  'gender',
  'addressLine1',
  'addressLine2',
  'city',
  'district',
  'province',
  'postalCode',
  'country',
  'preferredLanguage',
  'emergencyContact',    // Student only
  'bloodGroup',          // Student only
  'occupation',          // Parent only
  'workplace',           // Parent only
  'educationLevel'       // Parent only
];
```

### 3. **Field Groups**

```typescript
const FIELD_GROUPS = {
  'Account Information': [
    'nameWithInitials',
    'email',
    'phoneNumber',
    'userType'
  ],
  'Personal Information': [
    'nic',
    'birthCertificateNo',
    'dateOfBirth',
    'gender'
  ],
  'Address Information': [
    'addressLine1',
    'addressLine2',
    'city',
    'district',
    'province',
    'postalCode',
    'country'
  ],
  'Student Information': [     // Show only if userType === 'STUDENT'
    'studentId',
    'emergencyContact',
    'bloodGroup'
  ],
  'Parent Information': [      // Show only if userType === 'PARENT'
    'occupation',
    'workplace',
    'educationLevel'
  ],
  'Settings': [
    'preferredLanguage'
  ]
};
```

---

## ⚠️ Common Pitfalls & Solutions

### ❌ Pitfall 1: Sending Masked Email/Phone in Updates
```typescript
// ❌ WRONG
const updateData = {
  email: 'j***@example.com',        // This is masked!
  phoneNumber: '+94****567',        // This is masked!
  addressLine1: '123 Main St'
};

// ✅ CORRECT
const updateData = {
  // Don't include email and phoneNumber at all
  addressLine1: '123 Main St'
};
```

### ❌ Pitfall 2: Sending Empty addressLine2
```typescript
// ❌ WRONG
const updateData = {
  addressLine1: '123 Main St',
  addressLine2: '',                 // Empty string
};

// ✅ CORRECT
const updateData = {
  addressLine1: '123 Main St',
  // Don't include addressLine2 if empty
};

// Or filter it out:
if (updateData.addressLine2 === '') {
  delete updateData.addressLine2;
}
```

### ❌ Pitfall 3: Showing Wrong Fields for User Type
```typescript
// ❌ WRONG - Always showing student fields
<div>
  <label>Emergency Contact:</label>
  <input value={profile.emergencyContact} />
</div>

// ✅ CORRECT - Conditional rendering
{profile.userType === 'STUDENT' && profile.emergencyContact && (
  <div>
    <label>Emergency Contact:</label>
    <input value={profile.emergencyContact} />
  </div>
)}
```

### ❌ Pitfall 4: Not Validating Date Format
```typescript
// ❌ WRONG - Sending wrong date format
const updateData = {
  dateOfBirth: '15/05/2000'         // Wrong format!
};

// ✅ CORRECT - Use yyyy-MM-dd format
const updateData = {
  dateOfBirth: '2000-05-15'         // Correct format
};
```

---

## ✅ Validation Rules

### Client-Side Validation
```typescript
const validateProfileData = (data: UpdateProfileRequest): string[] => {
  const errors: string[] = [];

  // NIC validation
  if (data.nic && !/^(\d{9}[VvXx]|\d{12})$/.test(data.nic)) {
    errors.push('NIC must be in format 123456789V or 200012345678');
  }

  // Date of birth validation
  if (data.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth)) {
    errors.push('Date of birth must be in yyyy-MM-dd format');
  }

  // Phone number validation (emergency contact)
  if (data.emergencyContact && !/^\+?\d{10,15}$/.test(data.emergencyContact)) {
    errors.push('Emergency contact must be 10-15 digits');
  }

  // Postal code validation
  if (data.postalCode && !/^\d{5,6}$/.test(data.postalCode)) {
    errors.push('Postal code must be 5-6 digits');
  }

  // String length validations
  if (data.addressLine1 && data.addressLine1.length > 200) {
    errors.push('Address line 1 must be max 200 characters');
  }

  if (data.addressLine2 && data.addressLine2.length > 200) {
    errors.push('Address line 2 must be max 200 characters');
  }

  if (data.city && data.city.length > 50) {
    errors.push('City must be max 50 characters');
  }

  return errors;
};
```

---

## 📊 Testing Checklist

- [ ] **GET Profile**
  - [ ] Verify nameWithInitials is displayed correctly
  - [ ] Verify email is masked (e.g., "j***@example.com")
  - [ ] Verify phoneNumber is masked (e.g., "+94****567")
  - [ ] Verify optional fields are hidden when null/undefined
  - [ ] Verify type-specific fields show only for matching userType
  - [ ] Verify imageUrl is displayed correctly (or default avatar)

- [ ] **UPDATE Profile**
  - [ ] Verify email and phoneNumber are NOT sent in request
  - [ ] Verify addressLine2 is NOT sent if empty
  - [ ] Verify only changed fields are sent
  - [ ] Verify date format is yyyy-MM-dd
  - [ ] Verify validation errors are displayed
  - [ ] Verify success message after update
  - [ ] Verify profile reloads with updated data

- [ ] **UPLOAD Profile Image**
  - [ ] File validation works (type, size, name)
  - [ ] Preview shows before upload
  - [ ] Progress indicator displays all 4 steps
  - [ ] Signed URL is generated successfully
  - [ ] File uploads to cloud storage via PUT
  - [ ] Verification succeeds and returns public URL
  - [ ] Profile updates with new image URL
  - [ ] UI displays new image immediately
  - [ ] Old image is replaced (not duplicated)
  - [ ] Rate limit is enforced (5 per 15 min)
  - [ ] Errors are caught and displayed clearly
  - [ ] Upload button is disabled during upload
  - [ ] Failed uploads can be retried

- [ ] **Field Visibility**
  - [ ] Student sees: studentId, emergencyContact, bloodGroup
  - [ ] Parent sees: occupation, workplace, educationLevel
  - [ ] Teacher sees: only common fields
  - [ ] All users see: personal and address fields

- [ ] **Error Handling**
  - [ ] Network errors are caught and displayed
  - [ ] Validation errors are shown per field
  - [ ] 401 Unauthorized redirects to login
  - [ ] 403 Forbidden shows appropriate message
  - [ ] 429 Rate Limit displays retry-after time
  - [ ] File upload errors are user-friendly

---

## 🔐 Security Notes

1. **Masked Fields:** Email and phone are masked in responses for privacy
2. **Read-Only:** Some fields (email, phone, userType) cannot be changed via profile update
3. **Validation:** All inputs are validated on both client and server
4. **Authentication:** All endpoints require valid JWT token
5. **Rate Limiting:** Profile updates and image uploads are rate-limited to prevent abuse
6. **Signed URLs:** Profile images use secure signed URL workflow (10 min expiry)
7. **File Validation:** Image type, size, and name are validated before upload
8. **Storage Security:** Files are private until backend verification completes

---

## 📞 Support

For API issues or questions:
- Check API documentation at `/api/docs` (Swagger)
- Review error responses for specific validation messages
- Contact backend team for clarification

---

**Last Updated:** January 10, 2026  
**API Version:** v2  
**Status:** Production Ready ✅
