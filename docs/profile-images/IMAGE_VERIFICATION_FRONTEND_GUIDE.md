# 📸 Image Verification System - Frontend Implementation Guide

## 🎯 Overview

This guide covers the complete implementation of the **User Profile Image Verification System** on the frontend. The system allows:

- **System Admins** to review, approve, or reject user-uploaded profile images
- **Users** to re-upload rejected images via email links with 7-day validity
- Automatic **PENDING** status for all user-uploaded images
- Email notifications with rejection reasons and re-upload links

---

## 🏗️ System Architecture

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   User      │◄────────┤   Backend    │────────►│  System      │
│   Upload    │  Email  │   API +      │  Admin  │  Admin       │
│   Page      │  Token  │   Cloud      │  Panel  │  Dashboard   │
└─────────────┘         └──────────────┘         └──────────────┘
                              │
                              ▼
                        ┌──────────────┐
                        │   Google     │
                        │   Cloud      │
                        │   Storage    │
                        └──────────────┘
```

---

## 📋 API Endpoints Reference

### **1. System Admin Endpoints** (Protected)

#### **GET /admin/users/unverified**
Retrieve paginated list of users with pending/unverified images.

**Headers:**
```json
{
  "Authorization": "Bearer <system_admin_jwt_token>"
}
```

**Query Parameters:**
```typescript
{
  page?: number;        // Default: 1
  limit?: number;       // Default: 20
  status?: 'PENDING' | 'VERIFIED' | 'REJECTED'; // Default: PENDING
}
```

**Response:**
```json
{
  "users": [
    {
      "userId": 123,
      "nameWithInitials": "J. Doe",
      "email": "j***e@example.com",      // Masked
      "phoneNumber": "077****789",        // Masked
      "imageUrl": "https://storage.googleapis.com/...",
      "imageVerificationStatus": "PENDING",
      "imageUploadedAt": "2025-02-01T10:30:00Z",
      "userType": "STUDENT"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

---

#### **POST /admin/users/:userId/approve-image**
Approve a user's profile image and send confirmation email.

**Headers:**
```json
{
  "Authorization": "Bearer <system_admin_jwt_token>",
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "note": "Image meets all guidelines"  // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "User image approved successfully",
  "userId": 123,
  "status": "VERIFIED",
  "approvedBy": "admin_456",
  "approvedAt": "2025-02-01T14:25:30+05:30"
}
```

---

#### **POST /admin/users/:userId/reject-image**
Reject user's image, delete from cloud, send email with 7-day re-upload link.

**Headers:**
```json
{
  "Authorization": "Bearer <system_admin_jwt_token>",
  "Content-Type": "application/json"
}
```

**Body:**
```json
{
  "rejectionReason": "Image quality is too low. Please upload a clear, well-lit photo.",
  "userEmail": "user@example.com",  // Optional override
  "urlValidityDays": 7              // Optional (1-30), default: 7
}
```

**Response:**
```json
{
  "success": true,
  "message": "User image rejected successfully. User notified via email.",
  "userId": 123,
  "rejectionReason": "Image quality is too low...",
  "uploadUrl": "https://lms.suraksha.lk/profile/image/upload?token=eyJ1c2VySWQiOjEyMywiZXhwIjoxNzM4NTAwMDAwfQ",
  "expiresAt": "2025-02-08T14:25:30Z",
  "emailSent": true,
  "uploadToken": "eyJ1c2VySWQiOjEyMywiZXhwIjoxNzM4NTAwMDAwfQ"
}
```

---

### **2. Institute Admin Endpoints** (Protected — institute admin or teacher JWT)

> ⚠️ **Frontend note**: Do NOT call `/admin/users/unverified-images` from institute admin views.  
> That route requires SUPERADMIN and will return **403/404**.  
> Use the `/institute-users/...` endpoints below instead.

---

#### **GET /institute-users/institute/:instituteId/users/unverified-with-images**
Get paginated list of institute users who have uploaded images pending verification.

**Headers:**
```json
{
  "Authorization": "Bearer <institute_admin_jwt_token>"
}
```

**Query Parameters:**
```typescript
{
  page?: number;   // Default: 1
  limit?: number;  // Default: 20
}
```

**Response:**
```json
{
  "data": [
    {
      "userId": "456",
      "nameWithInitials": "K.A. Perera",
      "email": "k.perera@example.com",
      "phoneNumber": "077XXXXXXX",
      "instituteUserImageUrl": "https://storage.googleapis.com/...",
      "imageVerificationStatus": "PENDING",
      "instituteUserType": "STUDENT",
      "userIdByInstitute": "STU2024001"
    }
  ],
  "total": 12,
  "page": 1,
  "limit": 20
}
```

---

#### **GET /institute-users/institute/:instituteId/users/unverified-with-images/count**
Get the count of unverified images — use this for dashboard badges.

**Response:**
```json
{
  "count": 12,
  "message": "Unverified users count retrieved successfully"
}
```

---

#### **POST /institute-users/institute/:instituteId/users/:userId/verify-image**
Approve or reject an institute user's profile image.

**Body:**
```json
{
  "status": "VERIFIED",        // or "REJECTED"
  "rejectionReason": null      // Required when status is REJECTED
}
```

**Response:**
```json
{
  "success": true,
  "message": "Image verification status updated successfully",
  "status": "VERIFIED"
}
```

---

#### **GET /institute-users/institute/:instituteId/users/image-verification**
Full paginated list with all verification states (for an admin dashboard filter).

**Query Parameters:**
```typescript
{
  page?: number;
  limit?: number;
  status?: 'PENDING' | 'VERIFIED' | 'REJECTED';
}
```

---

### **3. Public Re-upload Endpoint** (No Auth Required)

#### **POST /users/profile/image/reupload**
Allows users to re-upload profile image using token from rejection email.

**Body:**
```json
{
  "token": "eyJ1c2VySWQiOjEyMywiZXhwIjoxNzM4NTAwMDAwfQ",
  "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-123-profile.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile image uploaded successfully. It will be reviewed by our team.",
  "data": {
    "userId": "123",
    "imageUrl": "https://storage.googleapis.com/...",
    "status": "PENDING"
  }
}
```

**Error Responses:**
```json
// Expired token
{
  "statusCode": 400,
  "message": "Upload token has expired. Please request a new link from support.",
  "error": "Bad Request"
}

// Invalid token
{
  "statusCode": 400,
  "message": "Invalid or malformed upload token",
  "error": "Bad Request"
}
```

---

## 🎨 Frontend Implementation

### **A. System Admin Dashboard**

#### **1. Unverified Users List Component**

```tsx
// components/admin/UnverifiedUsersList.tsx
import React, { useState, useEffect } from 'react';
import { getUnverifiedUsers, approveUserImage, rejectUserImage } from '@/services/adminService';

interface UnverifiedUser {
  userId: number;
  nameWithInitials: string;
  email: string;
  phoneNumber: string;
  imageUrl: string;
  imageVerificationStatus: string;
  imageUploadedAt: string;
  userType: string;
}

export const UnverifiedUsersList: React.FC = () => {
  const [users, setUsers] = useState<UnverifiedUser[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UnverifiedUser | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await getUnverifiedUsers({ page, limit: 20 });
      setUsers(response.users);
      setTotalPages(response.totalPages);
    } catch (error) {
      console.error('Failed to fetch unverified users:', error);
      // Show error toast notification
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: number) => {
    try {
      await approveUserImage(userId, {
        note: 'Image approved by system admin'
      });
      
      // Show success notification
      alert('✅ Image approved successfully! User will receive confirmation email.');
      
      // Refresh list
      fetchUsers();
    } catch (error) {
      console.error('Failed to approve image:', error);
      alert('❌ Failed to approve image. Please try again.');
    }
  };

  const handleReject = async (userId: number) => {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    try {
      const response = await rejectUserImage(userId, {
        rejectionReason,
        urlValidityDays: 7
      });
      
      // Show success notification
      alert(`✅ Image rejected. Email sent with upload link (expires: ${new Date(response.expiresAt).toLocaleDateString()})`);
      
      // Close modal and refresh
      setSelectedUser(null);
      setRejectionReason('');
      fetchUsers();
    } catch (error) {
      console.error('Failed to reject image:', error);
      alert('❌ Failed to reject image. Please try again.');
    }
  };

  return (
    <div className="unverified-users-list">
      <h2>📸 Pending Image Verifications ({users.length})</h2>
      
      {loading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => (
            <div key={user.userId} className="user-card border rounded-lg p-4 shadow-lg">
              {/* Profile Image */}
              <div className="image-preview mb-3">
                <img
                  src={user.imageUrl}
                  alt={user.nameWithInitials}
                  className="w-full h-64 object-cover rounded-lg cursor-pointer"
                  onClick={() => window.open(user.imageUrl, '_blank')}
                />
              </div>
              
              {/* User Info */}
              <div className="user-info mb-3">
                <h3 className="font-bold text-lg">{user.nameWithInitials}</h3>
                <p className="text-sm text-gray-600">{user.email}</p>
                <p className="text-sm text-gray-600">{user.phoneNumber}</p>
                <p className="text-xs text-gray-500 mt-2">
                  Uploaded: {new Date(user.imageUploadedAt).toLocaleString()}
                </p>
                <span className="inline-block px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded mt-1">
                  {user.userType}
                </span>
              </div>
              
              {/* Action Buttons */}
              <div className="actions flex gap-2">
                <button
                  onClick={() => handleApprove(user.userId)}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                >
                  ✅ Approve
                </button>
                <button
                  onClick={() => setSelectedUser(user)}
                  className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition"
                >
                  ❌ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Pagination */}
      <div className="pagination flex justify-center gap-2 mt-6">
        <button
          disabled={page === 1}
          onClick={() => setPage(p => p - 1)}
          className="px-4 py-2 border rounded disabled:opacity-50"
        >
          ← Previous
        </button>
        <span className="px-4 py-2">
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(p => p + 1)}
          className="px-4 py-2 border rounded disabled:opacity-50"
        >
          Next →
        </button>
      </div>
      
      {/* Rejection Modal */}
      {selectedUser && (
        <div className="modal-overlay fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="modal-content bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Reject Image - {selectedUser.nameWithInitials}</h3>
            
            <div className="mb-4">
              <img
                src={selectedUser.imageUrl}
                alt="Preview"
                className="w-full h-48 object-cover rounded mb-2"
              />
            </div>
            
            <label className="block mb-2 font-semibold">Rejection Reason:</label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full border rounded p-2 mb-4 min-h-[100px]"
              placeholder="e.g., Image quality is too low. Please upload a clear, well-lit photo showing your face clearly."
            />
            
            <div className="actions flex gap-2">
              <button
                onClick={() => {
                  setSelectedUser(null);
                  setRejectionReason('');
                }}
                className="flex-1 bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(selectedUser.userId)}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

---

#### **2. Admin API Service**

```typescript
// services/adminService.ts
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.lms.suraksha.lk';

interface GetUnverifiedUsersParams {
  page?: number;
  limit?: number;
  status?: 'PENDING' | 'VERIFIED' | 'REJECTED';
}

interface ApproveImageDto {
  note?: string;
}

interface RejectImageDto {
  rejectionReason: string;
  userEmail?: string;
  urlValidityDays?: number;
}

export const getUnverifiedUsers = async (params: GetUnverifiedUsersParams) => {
  const token = localStorage.getItem('adminToken'); // Or use your auth context
  
  const response = await axios.get(`${API_BASE}/admin/users/unverified`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    params
  });
  
  return response.data;
};

export const approveUserImage = async (userId: number, dto: ApproveImageDto) => {
  const token = localStorage.getItem('adminToken');
  
  const response = await axios.post(
    `${API_BASE}/admin/users/${userId}/approve-image`,
    dto,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data;
};

export const rejectUserImage = async (userId: number, dto: RejectImageDto) => {
  const token = localStorage.getItem('adminToken');
  
  const response = await axios.post(
    `${API_BASE}/admin/users/${userId}/reject-image`,
    dto,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data;
};
```

---

### **B. User Re-upload Page**

#### **1. Upload Page Component**

```tsx
// pages/profile/image/upload.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { reuploadProfileImage } from '@/services/profileService';

export default function ProfileImageReupload() {
  const router = useRouter();
  const { token } = router.query;
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (token) {
      validateToken(token as string);
    }
  }, [token]);

  const validateToken = (uploadToken: string) => {
    try {
      const decoded = JSON.parse(atob(uploadToken.replace(/-/g, '+').replace(/_/g, '/')));
      
      if (decoded.exp < Date.now()) {
        setError('This upload link has expired. Please contact support for a new link.');
        setTokenValid(false);
        return;
      }
      
      setTokenValid(true);
    } catch (err) {
      setError('Invalid upload link. Please check your email or contact support.');
      setTokenValid(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, etc.)');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Generate preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !token) return;

    setUploading(true);
    setError(null);

    try {
      // Step 1: Get signed upload URL from backend
      const signedUrlResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/upload/generate-signed-url`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: selectedFile.name,
            contentType: selectedFile.type,
            fileSize: selectedFile.size,
            uploadType: 'profile-image'
          })
        }
      );

      if (!signedUrlResponse.ok) {
        throw new Error('Failed to generate upload URL');
      }

      const { signedUrl, publicUrl } = await signedUrlResponse.json();

      // Step 2: Upload file directly to Google Cloud Storage
      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': selectedFile.type
        },
        body: selectedFile
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to cloud storage');
      }

      // Step 3: Submit the uploaded image URL with token
      await reuploadProfileImage({
        token: token as string,
        imageUrl: publicUrl
      });

      setSuccess(true);
      
      // Redirect to success page after 3 seconds
      setTimeout(() => {
        router.push('/profile?upload=success');
      }, 3000);

    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (tokenValid === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-red-600 mb-4">Invalid or Expired Link</h1>
          <p className="text-gray-700 mb-6">{error}</p>
          <a
            href="mailto:support@suraksha.lk"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Contact Support
          </a>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-green-600 mb-4">Upload Successful!</h1>
          <p className="text-gray-700 mb-6">
            Your profile image has been submitted for review. You'll receive an email notification once it's verified.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">
          📸 Re-upload Profile Image
        </h1>
        <p className="text-gray-600 mb-6 text-center">
          Please upload a new profile image following the guidelines below
        </p>

        {/* Guidelines */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
          <h3 className="font-bold text-blue-900 mb-2">📋 Image Guidelines:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✓ Clear, well-lit photo showing your face</li>
            <li>✓ Professional or neutral background</li>
            <li>✓ No filters, sunglasses, or face coverings</li>
            <li>✓ Maximum file size: 5MB</li>
            <li>✓ Formats: JPG, PNG</li>
          </ul>
        </div>

        {/* File Input */}
        <div className="mb-6">
          <label className="block text-gray-700 font-semibold mb-2">
            Select Image:
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={uploading}
            className="w-full border border-gray-300 rounded-lg p-2 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
          />
        </div>

        {/* Preview */}
        {preview && (
          <div className="mb-6">
            <label className="block text-gray-700 font-semibold mb-2">Preview:</label>
            <img
              src={preview}
              alt="Preview"
              className="w-full max-w-sm mx-auto h-64 object-cover rounded-lg shadow-md border-4 border-gray-200"
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <p className="text-red-800 font-semibold">❌ {error}</p>
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={!selectedFile || uploading}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-4 px-6 rounded-lg hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
        >
          {uploading ? '⏳ Uploading...' : '📤 Upload Image'}
        </button>

        <p className="text-xs text-gray-500 text-center mt-4">
          Your image will be reviewed by our team within 24-48 hours
        </p>
      </div>
    </div>
  );
}
```

---

#### **2. Profile Service**

```typescript
// services/profileService.ts
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.lms.suraksha.lk';

interface ReuploadImageDto {
  token: string;
  imageUrl: string;
}

export const reuploadProfileImage = async (dto: ReuploadImageDto) => {
  const response = await axios.post(
    `${API_BASE}/users/profile/image/reupload`,
    dto,
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data;
};
```

---

## 📧 Email Template Preview

### **Rejection Email**

```
Subject: Action Required: Profile Image Rejected

[Gradient Header - Blue to Indigo]
🔔 Profile Image Update Required

Dear [User Name],

We've reviewed your profile image submission and unfortunately it doesn't meet our guidelines at this time.

┌─────────────────────────────┐
│ Rejection Reason:           │
│ Image quality is too low.   │
│ Please upload a clear,      │
│ well-lit photo.             │
└─────────────────────────────┘

📋 Image Guidelines:
✓ Clear, well-lit photo showing your face
✓ Professional or neutral background
✓ No filters, sunglasses, or face coverings
✓ Minimum resolution: 400x400px

[UPLOAD NEW IMAGE BUTTON]
https://lms.suraksha.lk/profile/image/upload?token=xxx

⏰ This link expires on: Feb 8, 2025 at 2:25 PM

Need help? Contact us: support@suraksha.lk
```

### **Approval Email**

```
Subject: ✅ Profile Image Approved

[Gradient Header - Green]
✅ Your Profile Image Has Been Approved!

Dear [User Name],

Great news! Your profile image has been reviewed and approved by our team.

Your profile is now complete and visible to others on the platform.

[GO TO DASHBOARD BUTTON]
https://lms.suraksha.lk/dashboard

Thank you for being part of Suraksha LMS!
```

---

## 🔐 Security Considerations

### **Token Structure**
```typescript
interface UploadToken {
  userId: number;
  purpose: 'profile-image-reupload';
  exp: number; // Unix timestamp
}

// Encoding: Base64URL (URL-safe)
const token = Buffer.from(JSON.stringify(tokenData)).toString('base64url');
```

### **Validation Steps**
1. ✅ Decode base64url token
2. ✅ Parse JSON payload
3. ✅ Check expiration timestamp
4. ✅ Verify purpose field
5. ✅ Validate user exists
6. ✅ Verify file exists in cloud storage

### **Rate Limiting**
- **Admin endpoints**: 100 requests/minute per admin
- **Public re-upload**: 10 uploads/hour per token
- **Profile image updates**: 5 updates/15 minutes per user

---

## 🧪 Testing Checklist

### **Admin Dashboard**
- [ ] Load unverified users list with pagination
- [ ] Display masked email and phone for privacy
- [ ] View full-size image in new tab on click
- [ ] Approve image and verify email sent
- [ ] Reject image with custom reason
- [ ] Verify rejection email contains upload link
- [ ] Check pagination works correctly

### **User Re-upload Page**
- [ ] Parse token from URL query parameter
- [ ] Validate token expiration correctly
- [ ] Show error for expired tokens
- [ ] File type validation (images only)
- [ ] File size validation (max 5MB)
- [ ] Upload to cloud storage successfully
- [ ] Submit image URL with token
- [ ] Show success message after upload
- [ ] Redirect to dashboard after success

### **Email Testing**
- [ ] Rejection email received with correct reason
- [ ] Upload link clickable and formatted correctly
- [ ] Approval email received after approval
- [ ] Email displays correctly on mobile
- [ ] Plain text version works for email clients

---

## 🚀 Deployment Steps

### **1. Environment Variables**
```env
# .env.local (Frontend)
NEXT_PUBLIC_API_URL=https://api.lms.suraksha.lk
NEXT_PUBLIC_FRONTEND_URL=https://lms.suraksha.lk

# .env (Backend)
FRONTEND_URL=https://lms.suraksha.lk
GCS_BUCKET_NAME=suraksha-lms
AWS_SES_REGION=us-east-1
```

### **2. Backend Deployment**
```bash
# Build application
npm run build

# Run migrations (if needed)
npm run migration:run

# Deploy to Cloud Run
npm run deploy
```

### **3. Frontend Deployment**
```bash
# Build Next.js application
npm run build

# Deploy to Vercel/Cloud Run
vercel deploy --prod
```

---

## 📝 Additional Notes

### **Future Enhancements**
- Add batch approve/reject for multiple users
- Image quality analysis using AI (blur detection, face detection)
- Automated rejection for inappropriate content
- Admin activity logs and audit trail
- User notification preferences

### **Integration with Existing Features**
- **Institute Admin**: use `/institute-users/institute/:instituteId/users/unverified-with-images` — NOT the system admin `/admin/users/unverified-images` route
- **System Admin**: global verification at `/admin/users/unverified` (requires SUPERADMIN JWT)
- **Two-tier approval**: Institute Admin → System Admin hierarchy

### **Mobile Considerations**
- Upload page is fully responsive (Tailwind CSS)
- Email templates work on mobile email clients
- File upload supports camera capture on mobile devices
- Consider adding native mobile app integration

---

## 🆘 Support

For technical issues or questions:
- **Email**: developer@suraksha.lk
- **Documentation**: [FRONTEND_DOCUMENTATION_INDEX.md](./FRONTEND_DOCUMENTATION_INDEX.md)
- **Backend Guide**: [IMAGE_VERIFICATION_BACKEND_GUIDE.md](./IMAGE_VERIFICATION_BACKEND_GUIDE.md)

---

**Last Updated**: February 1, 2025  
**Version**: 1.0.0
