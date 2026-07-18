# Google Drive Direct Upload — Complete Frontend Implementation Guide

> **Architecture**: Frontend uploads files DIRECTLY to Google Drive. Backend only handles OAuth, token dispensing, and file registration.  
> **Security**: Refresh tokens NEVER leave the backend. Frontend only receives short-lived access tokens (~1 hour), scoped to `drive.file`.

---

## Table of Contents

1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Environment Setup](#2-environment-setup)
3. [API Client Setup](#3-api-client-setup)
4. [Step 1: Check Connection Status](#4-step-1-check-connection-status)
5. [Step 2: Google Login / OAuth Connection](#5-step-2-google-login--oauth-connection)
6. [Step 3: Get Access Token for Upload](#6-step-3-get-access-token-for-upload)
7. [Step 4: Get Upload Folder](#7-step-4-get-upload-folder)
8. [Step 5: Upload File Directly to Google Drive](#8-step-5-upload-file-directly-to-google-drive)
9. [Step 6: Register Uploaded File](#9-step-6-register-uploaded-file)
10. [Step 7: List & Manage Files](#10-step-7-list--manage-files)
11. [Step 8: Download & Preview Files](#11-step-8-download--preview-files)
12. [Step 9: Disconnect Google Drive](#12-step-9-disconnect-google-drive)
13. [Complete React Hook: useDriveUpload](#13-complete-react-hook-usedriveupload)
14. [Complete Upload Component (React/Next.js)](#14-complete-upload-component-reactnextjs)
15. [Homework Submission Integration](#15-homework-submission-integration)
16. [Error Handling Reference](#16-error-handling-reference)
17. [API Endpoint Quick Reference](#17-api-endpoint-quick-reference)

---

## 1. System Overview & Architecture

```
┌─────────────────────────┐     ┌──────────────────────┐     ┌──────────────┐
│      FRONTEND           │     │       BACKEND         │     │ Google Drive  │
│  (React / Next.js)      │     │     (NestJS API)      │     │    API        │
│                         │     │                       │     │              │
│  1. Check status ───────┼────►│ GET /drive-access/    │     │              │
│                         │     │     status             │     │              │
│                         │     │                       │     │              │
│  2. Connect (one-time)──┼────►│ GET /drive-access/    │     │              │
│     redirect to Google  │     │     connect            │     │              │
│                         │     │        │               │     │              │
│  3. Google redirects ───┼─────┼────────┘               │     │              │
│     back to callback    │     │ Backend stores token   │     │              │
│                         │     │  (encrypted AES-256)   │     │              │
│                         │     │                       │     │              │
│  4. Get access token ──┼────►│ GET /drive-access/    │     │              │
│                         │◄───┼── token  (~1hr token)   │     │              │
│                         │     │                       │     │              │
│  5. Get folder ID ─────┼────►│ GET /drive-access/    │     │              │
│                         │◄───┼── folder                │     │              │
│                         │     │                       │     │              │
│  6. DIRECT upload ─────┼─────┼───────────────────────┼────►│ Upload file  │
│     (fetch to Drive API)│◄───┼───────────────────────┼─────│ Returns ID   │
│                         │     │                       │     │              │
│  7. Register file ─────┼────►│ POST /drive-access/   │     │              │
│     (send driveFileId)  │     │     files/register     │────►│ Verify file  │
│                         │◄───┼── file metadata         │◄───│              │
└─────────────────────────┘     └──────────────────────┘     └──────────────┘
```

### Key Points:
- **One-time Google login**: User connects once → refresh token stored encrypted in DB
- **No re-authentication**: Backend refreshes access tokens automatically using stored refresh token
- **Direct upload**: Files go Frontend → Google Drive (never through our backend)
- **drive.file scope**: Access token can ONLY access files created by our app (safe to send to frontend)
- **Backend verifies**: After upload, backend verifies the file actually exists on Google Drive

---

## 2. Environment Setup

### Frontend `.env`
```env
NEXT_PUBLIC_API_URL=https://api.suraksha.lk
# OR for development:
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Required Backend `.env` (for reference)
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://api.suraksha.lk/drive-access/callback
DRIVE_TOKEN_ENCRYPTION_KEY=your-32-char-encryption-key
FRONTEND_URL=https://lms.suraksha.lk
```

---

## 3. API Client Setup

Create a reusable API client that handles JWT auth for all requests:

```typescript
// src/lib/api.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Get the JWT token from wherever you store it (localStorage, cookie, etc.)
 */
function getAuthToken(): string | null {
  // Adjust based on your auth implementation
  return localStorage.getItem('access_token') || null;
}

/**
 * Base fetch wrapper with JWT auth
 */
export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAuthToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorBody.message || `API error: ${response.status}`,
      errorBody,
    );
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

---

## 4. Step 1: Check Connection Status

Before showing any upload UI, check if the user has connected their Google Drive:

### API Call

```typescript
// src/services/drive.service.ts

export interface DriveConnectionStatus {
  isConnected: boolean;
  googleEmail?: string;
  googleDisplayName?: string;
  googleProfilePicture?: string;
  grantedScopes?: string;
  lastUsedAt?: string;
  connectedAt?: string;
  needsReauthorization?: boolean;
}

export async function checkDriveConnection(): Promise<DriveConnectionStatus> {
  return apiFetch<DriveConnectionStatus>('/drive-access/status');
}
```

### React Component

```tsx
// src/components/DriveConnectionStatus.tsx
import { useEffect, useState } from 'react';
import { checkDriveConnection, DriveConnectionStatus } from '@/services/drive.service';

export function DriveConnectionStatus() {
  const [status, setStatus] = useState<DriveConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkDriveConnection()
      .then(setStatus)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Checking Google Drive connection...</div>;
  if (!status) return <div>Error checking connection</div>;

  if (!status.isConnected) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="font-medium">Google Drive not connected</p>
        <p className="text-sm text-gray-600 mt-1">
          Connect your Google Drive to upload homework and documents.
        </p>
        <ConnectDriveButton />
      </div>
    );
  }

  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
      {status.googleProfilePicture && (
        <img
          src={status.googleProfilePicture}
          alt="Google profile"
          className="w-10 h-10 rounded-full"
        />
      )}
      <div>
        <p className="font-medium text-green-800">Google Drive Connected</p>
        <p className="text-sm text-gray-600">{status.googleEmail}</p>
        {status.needsReauthorization && (
          <p className="text-sm text-orange-600 mt-1">
            ⚠️ Re-authorization may be needed. Please reconnect.
          </p>
        )}
      </div>
    </div>
  );
}
```

---

## 5. Step 2: Google Login / OAuth Connection (One-Time)

### How it Works:
1. Frontend calls `GET /drive-access/connect?returnUrl=/current-page`
2. Backend returns a Google OAuth consent URL
3. Frontend redirects user to that URL
4. User grants permission on Google's page (one-time consent)
5. Google redirects to backend callback (`GET /drive-access/callback`)
6. Backend stores encrypted refresh token
7. Backend redirects to frontend with `?drive_connected=true&google_email=...`

### API Call

```typescript
// src/services/drive.service.ts

export interface DriveAuthUrl {
  authUrl: string;
  state: string;
}

/**
 * Get the Google OAuth consent URL for connecting Drive.
 * @param returnUrl - The page to redirect back to after connection (e.g., '/homework/upload')
 */
export async function getDriveConnectUrl(returnUrl?: string): Promise<DriveAuthUrl> {
  const params = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
  return apiFetch<DriveAuthUrl>(`/drive-access/connect${params}`);
}
```

### Connect Button Component

```tsx
// src/components/ConnectDriveButton.tsx
import { useState } from 'react';
import { getDriveConnectUrl } from '@/services/drive.service';

interface Props {
  returnUrl?: string;  // Where to return after OAuth (default: current page)
  onError?: (error: Error) => void;
}

export function ConnectDriveButton({ returnUrl, onError }: Props) {
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    try {
      setLoading(true);
      
      // Use current page path as return URL if not specified
      const redirectTo = returnUrl || window.location.pathname;
      const { authUrl } = await getDriveConnectUrl(redirectTo);
      
      // Redirect user to Google consent page
      // After consent, Google redirects to backend callback,
      // which then redirects back to frontend with query params
      window.location.href = authUrl;
    } catch (error) {
      setLoading(false);
      onError?.(error as Error);
    }
  };

  return (
    <button
      onClick={handleConnect}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
    >
      {/* Google G logo */}
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
        <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      {loading ? 'Connecting...' : 'Connect Google Drive'}
    </button>
  );
}
```

### Handle OAuth Callback Redirect

After Google OAuth, the backend redirects back to your frontend with query parameters. Handle them:

```tsx
// src/hooks/useDriveCallback.ts
import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation'; // or react-router

/**
 * Call this hook on any page where Drive connection might redirect back.
 * It reads the URL query params and shows a notification.
 */
export function useDriveCallback(onSuccess?: (email: string) => void) {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const driveConnected = searchParams.get('drive_connected');
    if (!driveConnected) return;

    const success = driveConnected === 'true';
    const googleEmail = searchParams.get('google_email') || '';
    const error = searchParams.get('error') || '';

    if (success) {
      // Show success notification
      // (use your notification library: toast, antd message, etc.)
      console.log(`✅ Google Drive connected: ${googleEmail}`);
      onSuccess?.(googleEmail);
    } else {
      // Show error notification
      console.error(`❌ Google Drive connection failed: ${error}`);
    }

    // Clean up URL query params
    const url = new URL(window.location.href);
    url.searchParams.delete('drive_connected');
    url.searchParams.delete('google_email');
    url.searchParams.delete('error');
    router.replace(url.pathname + url.search, { scroll: false });
  }, [searchParams]);
}
```

Usage in a page:

```tsx
// src/app/homework/page.tsx
export default function HomeworkPage() {
  useDriveCallback((email) => {
    // Refresh connection status after successful connection
    toast.success(`Connected Google Drive: ${email}`);
    refetchStatus();
  });

  return <div>...</div>;
}
```

---

## 6. Step 3: Get Access Token for Upload

Once connected, get a short-lived access token from the backend to use for direct uploads:

### API Call

```typescript
// src/services/drive.service.ts

export interface DriveAccessToken {
  accessToken: string;    // Short-lived Google access token (~1 hour)
  expiresIn: number;      // Seconds until expiry
  expiresAt: string;      // ISO timestamp of expiry
  googleEmail: string;    // Connected account email
  clientId: string;       // Google OAuth client ID (for Google Picker if needed)
}

/**
 * Get a short-lived access token for direct Google Drive uploads.
 * The token is scoped to drive.file (can only access files created by our app).
 * 
 * Automatically calls the backend which refreshes the token using the stored
 * encrypted refresh token. Refresh token NEVER leaves the backend.
 */
export async function getDriveAccessToken(): Promise<DriveAccessToken> {
  return apiFetch<DriveAccessToken>('/drive-access/token');
}
```

### Token Caching (Important!)

Don't call `/drive-access/token` before every upload. Cache it and refresh only when expired:

```typescript
// src/lib/driveTokenCache.ts

import { getDriveAccessToken, DriveAccessToken } from '@/services/drive.service';

let cachedToken: DriveAccessToken | null = null;
let tokenPromise: Promise<DriveAccessToken> | null = null;

/**
 * Get a valid access token, using cache when possible.
 * Automatically refreshes when token is expired or about to expire.
 */
export async function getValidDriveToken(): Promise<DriveAccessToken> {
  // If we have a cached token that's still valid (with 5 min buffer)
  if (cachedToken) {
    const expiresAt = new Date(cachedToken.expiresAt).getTime();
    const now = Date.now();
    const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
    
    if (expiresAt - now > bufferMs) {
      return cachedToken;
    }
  }

  // Prevent multiple concurrent token requests
  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = getDriveAccessToken()
    .then((token) => {
      cachedToken = token;
      tokenPromise = null;
      return token;
    })
    .catch((err) => {
      tokenPromise = null;
      cachedToken = null;
      throw err;
    });

  return tokenPromise;
}

/**
 * Clear the cached token (call on disconnect or errors)
 */
export function clearDriveTokenCache() {
  cachedToken = null;
  tokenPromise = null;
}
```

---

## 7. Step 4: Get Upload Folder

Get or create an organized folder on the user's Google Drive:

### API Call

```typescript
// src/services/drive.service.ts

export type DriveUploadPurpose =
  | 'HOMEWORK_SUBMISSION'
  | 'HOMEWORK_REFERENCE'
  | 'HOMEWORK_CORRECTION'
  | 'EXAM_SUBMISSION'
  | 'PROFILE_DOCUMENT'
  | 'GENERAL';

export interface DriveFolder {
  folderId: string;    // Google Drive folder ID
  folderPath: string;  // Human-readable path, e.g., "Suraksha LMS / Homework Submissions"
}

/**
 * Get or create the organized upload folder on the user's Google Drive.
 * Creates folder structure if needed: "Suraksha LMS / {Purpose}"
 * 
 * @param purpose - The upload purpose to select the right folder
 * @returns folderId to use as `parents` parameter in Drive upload
 */
export async function getDriveFolder(purpose: DriveUploadPurpose): Promise<DriveFolder> {
  return apiFetch<DriveFolder>(`/drive-access/folder?purpose=${purpose}`);
}
```

---

## 8. Step 5: Upload File Directly to Google Drive

This is the core — upload the file DIRECTLY from frontend to Google Drive using the access token:

### Option A: Simple Upload (files < 5MB)

```typescript
// src/lib/driveUpload.ts

import { getValidDriveToken } from './driveTokenCache';
import { getDriveFolder, DriveUploadPurpose } from '@/services/drive.service';

export interface DriveUploadResult {
  driveFileId: string;
  fileName: string;
  mimeType: string;
}

/**
 * Upload a file directly to Google Drive (simple upload, < 5MB).
 * 
 * @param file - The File object from <input type="file"> or drag-and-drop
 * @param purpose - Upload purpose (determines folder)
 * @param onProgress - Optional progress callback (0-100)
 */
export async function uploadFileToDrive(
  file: File,
  purpose: DriveUploadPurpose,
  onProgress?: (percent: number) => void,
): Promise<DriveUploadResult> {
  // 1. Get access token from our backend
  const token = await getValidDriveToken();
  onProgress?.(5);

  // 2. Get the correct folder ID
  const folder = await getDriveFolder(purpose);
  onProgress?.(10);

  // 3. Build multipart request for Google Drive API
  //    See: https://developers.google.com/drive/api/v3/manage-uploads#multipart
  const metadata = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    parents: [folder.folderId],  // Upload into the organized folder
  };

  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  );
  formData.append('file', file);

  // 4. Upload directly to Google Drive
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
      },
      body: formData,
    },
  );

  onProgress?.(90);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error?.error?.message || `Google Drive upload failed: ${response.status}`,
    );
  }

  const result = await response.json();
  onProgress?.(100);

  return {
    driveFileId: result.id,
    fileName: result.name,
    mimeType: result.mimeType,
  };
}
```

### Option B: Resumable Upload (files > 5MB, with progress tracking)

```typescript
// src/lib/driveUploadResumable.ts

import { getValidDriveToken } from './driveTokenCache';
import { getDriveFolder, DriveUploadPurpose } from '@/services/drive.service';

/**
 * Upload a large file to Google Drive using resumable upload.
 * Supports real progress tracking and resume on failure.
 * 
 * @param file - The File object
 * @param purpose - Upload purpose (determines folder)
 * @param onProgress - Progress callback (0-100)
 * @param abortSignal - Optional AbortSignal for cancellation
 */
export async function uploadLargeFileToDrive(
  file: File,
  purpose: DriveUploadPurpose,
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal,
): Promise<{ driveFileId: string; fileName: string; mimeType: string }> {
  // 1. Get access token
  const token = await getValidDriveToken();
  onProgress?.(2);

  // 2. Get folder
  const folder = await getDriveFolder(purpose);
  onProgress?.(5);

  // 3. Initiate resumable upload session
  const metadata = {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    parents: [folder.folderId],
  };

  const initResponse = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': file.size.toString(),
      },
      body: JSON.stringify(metadata),
      signal: abortSignal,
    },
  );

  if (!initResponse.ok) {
    const error = await initResponse.json().catch(() => ({}));
    throw new Error(error?.error?.message || `Failed to initiate upload: ${initResponse.status}`);
  }

  const uploadUrl = initResponse.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('No upload URL returned by Google Drive');
  }

  // 4. Upload file content using XMLHttpRequest for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        // Map 5-95% to the upload progress
        const percent = 5 + Math.round((event.loaded / event.total) * 90);
        onProgress?.(percent);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const result = JSON.parse(xhr.responseText);
        onProgress?.(100);
        resolve({
          driveFileId: result.id,
          fileName: result.name,
          mimeType: result.mimeType,
        });
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    // Handle abort signal
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => xhr.abort());
    }

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}
```

### Which Upload Method to Use?

```typescript
// src/lib/driveUploadAuto.ts

import { uploadFileToDrive } from './driveUpload';
import { uploadLargeFileToDrive } from './driveUploadResumable';
import { DriveUploadPurpose } from '@/services/drive.service';

const SIMPLE_UPLOAD_LIMIT = 5 * 1024 * 1024; // 5MB

/**
 * Automatically chooses the best upload method based on file size.
 */
export async function smartUploadToDrive(
  file: File,
  purpose: DriveUploadPurpose,
  onProgress?: (percent: number) => void,
  abortSignal?: AbortSignal,
) {
  if (file.size <= SIMPLE_UPLOAD_LIMIT) {
    return uploadFileToDrive(file, purpose, onProgress);
  } else {
    return uploadLargeFileToDrive(file, purpose, onProgress, abortSignal);
  }
}
```

---

## 9. Step 6: Register Uploaded File

After uploading to Google Drive, register the file with our backend:

### API Call

```typescript
// src/services/drive.service.ts

export interface RegisterFileRequest {
  driveFileId: string;        // Google Drive file ID returned after upload
  purpose: DriveUploadPurpose;
  referenceType?: string;     // e.g., 'homework_submission', 'homework_reference'
  referenceId?: string;       // e.g., homework ID
  shareWithEmails?: string;   // Comma-separated emails to share with
}

export interface DriveFileResponse {
  id: string;               // Internal file record ID
  driveFileId: string;       // Google Drive file ID
  fileName: string;
  mimeType: string;
  fileSize?: number;
  purpose: string;
  referenceType?: string;
  referenceId?: string;
  viewUrl: string;           // Google Drive view URL
  downloadUrl: string;       // Direct download URL
  embedUrl?: string;         // For iframe embedding
  createdAt: string;
}

/**
 * Register a file that was uploaded directly to Google Drive.
 * Backend VERIFIES the file exists on Drive and stores metadata.
 */
export async function registerDriveFile(data: RegisterFileRequest): Promise<DriveFileResponse> {
  return apiFetch<DriveFileResponse>('/drive-access/files/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
```

### Complete Upload + Register Flow

```typescript
// src/lib/driveUploadComplete.ts

import { smartUploadToDrive } from './driveUploadAuto';
import { registerDriveFile, DriveUploadPurpose, DriveFileResponse } from '@/services/drive.service';

export interface UploadAndRegisterOptions {
  file: File;
  purpose: DriveUploadPurpose;
  referenceType?: string;
  referenceId?: string;
  shareWithEmails?: string[];
  onProgress?: (percent: number) => void;
  abortSignal?: AbortSignal;
}

/**
 * Complete flow: Upload to Google Drive → Register with backend.
 * This is the main function you should call for any file upload.
 */
export async function uploadAndRegisterFile(
  options: UploadAndRegisterOptions,
): Promise<DriveFileResponse> {
  const { file, purpose, referenceType, referenceId, shareWithEmails, onProgress, abortSignal } = options;

  // Step 1: Upload to Google Drive (0-80% progress)
  const uploadResult = await smartUploadToDrive(
    file,
    purpose,
    (percent) => onProgress?.(Math.round(percent * 0.8)),  // Scale to 0-80%
    abortSignal,
  );

  onProgress?.(85);

  // Step 2: Register with our backend (80-100% progress)
  const registered = await registerDriveFile({
    driveFileId: uploadResult.driveFileId,
    purpose,
    referenceType,
    referenceId,
    shareWithEmails: shareWithEmails?.join(','),
  });

  onProgress?.(100);

  return registered;
}
```

---

## 10. Step 7: List & Manage Files

### API Calls

```typescript
// src/services/drive.service.ts

export interface DriveFileListResponse {
  data: DriveFileResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * List registered files with optional filtering.
 */
export async function listDriveFiles(params?: {
  purpose?: DriveUploadPurpose;
  referenceType?: string;
  referenceId?: string;
  page?: number;
  limit?: number;
}): Promise<DriveFileListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.purpose) searchParams.set('purpose', params.purpose);
  if (params?.referenceType) searchParams.set('referenceType', params.referenceType);
  if (params?.referenceId) searchParams.set('referenceId', params.referenceId);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const query = searchParams.toString();
  return apiFetch<DriveFileListResponse>(`/drive-access/files${query ? `?${query}` : ''}`);
}

/**
 * Get a single file's details.
 */
export async function getDriveFile(fileId: string): Promise<DriveFileResponse> {
  return apiFetch<DriveFileResponse>(`/drive-access/files/${fileId}`);
}

/**
 * Delete a file from Google Drive and our system.
 */
export async function deleteDriveFile(fileId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/drive-access/files/${fileId}`, {
    method: 'DELETE',
  });
}
```

### File List Component

```tsx
// src/components/DriveFileList.tsx
import { useEffect, useState } from 'react';
import {
  listDriveFiles,
  deleteDriveFile,
  DriveFileResponse,
  DriveUploadPurpose,
} from '@/services/drive.service';

interface Props {
  purpose?: DriveUploadPurpose;
  referenceType?: string;
  referenceId?: string;
}

export function DriveFileList({ purpose, referenceType, referenceId }: Props) {
  const [files, setFiles] = useState<DriveFileResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const result = await listDriveFiles({ purpose, referenceType, referenceId, page, limit: 10 });
      setFiles(result.data);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [purpose, referenceType, referenceId, page]);

  const handleDelete = async (fileId: string) => {
    if (!confirm('Delete this file from Google Drive?')) return;
    try {
      await deleteDriveFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) return <div>Loading files...</div>;

  return (
    <div>
      {files.length === 0 ? (
        <p className="text-gray-500 text-sm">No files uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div key={file.id} className="flex items-center justify-between p-3 bg-white border rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{file.fileName}</p>
                <p className="text-sm text-gray-500">
                  {formatFileSize(file.fileSize)} · {file.purpose}
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <a
                  href={file.viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  View
                </a>
                <button
                  onClick={() => handleDelete(file.id)}
                  className="text-red-600 hover:underline text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
```

---

## 11. Step 8: Download & Preview Files

### Download through Backend Proxy

For privacy or embedding, use the backend download proxy:

```typescript
// src/services/drive.service.ts

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * Get the backend proxy download URL for a file.
 * Use this when direct Drive URLs don't work (embedding, private files).
 */
export function getProxyDownloadUrl(fileId: string): string {
  const token = localStorage.getItem('access_token');
  return `${API_URL}/drive-access/files/${fileId}/download?token=${token}`;
}
```

### File Preview Component

```tsx
// src/components/DriveFilePreview.tsx

interface Props {
  file: {
    driveFileId: string;
    fileName: string;
    mimeType: string;
    viewUrl: string;
    embedUrl?: string;
  };
}

export function DriveFilePreview({ file }: Props) {
  const isImage = file.mimeType.startsWith('image/');
  const isPDF = file.mimeType === 'application/pdf';
  const isVideo = file.mimeType.startsWith('video/');
  const isGoogleDoc = file.mimeType.includes('google-apps');

  // For images, use Google Drive embed
  if (isImage) {
    return (
      <img
        src={`https://drive.google.com/thumbnail?id=${file.driveFileId}&sz=w600`}
        alt={file.fileName}
        className="max-w-full rounded-lg"
      />
    );
  }

  // For PDFs and Google Docs, use Google's preview iframe
  if (isPDF || isGoogleDoc) {
    return (
      <iframe
        src={file.embedUrl || `https://drive.google.com/file/d/${file.driveFileId}/preview`}
        className="w-full h-96 border rounded-lg"
        allow="autoplay"
        title={file.fileName}
      />
    );
  }

  // For other files, show a download link
  return (
    <div className="p-4 bg-gray-50 border rounded-lg text-center">
      <p className="font-medium">{file.fileName}</p>
      <a
        href={file.viewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
      >
        Open in Google Drive
      </a>
    </div>
  );
}
```

---

## 12. Step 9: Disconnect Google Drive

```typescript
// src/services/drive.service.ts

export interface DriveDisconnectResult {
  success: boolean;
  message: string;
}

/**
 * Disconnect Google Drive. Revokes tokens at Google and removes stored data.
 */
export async function disconnectDrive(): Promise<DriveDisconnectResult> {
  return apiFetch<DriveDisconnectResult>('/drive-access/disconnect', {
    method: 'POST',
  });
}
```

```tsx
// src/components/DisconnectDriveButton.tsx

export function DisconnectDriveButton({ onDisconnected }: { onDisconnected?: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Google Drive? You will need to reconnect to upload files.')) return;
    
    setLoading(true);
    try {
      await disconnectDrive();
      clearDriveTokenCache();  // Clear cached access token
      onDisconnected?.();
    } catch (error) {
      console.error('Disconnect failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDisconnect}
      disabled={loading}
      className="text-red-600 hover:underline text-sm"
    >
      {loading ? 'Disconnecting...' : 'Disconnect Google Drive'}
    </button>
  );
}
```

---

## 13. Complete React Hook: `useDriveUpload`

A single hook that manages the entire upload lifecycle:

```typescript
// src/hooks/useDriveUpload.ts
import { useState, useCallback, useRef } from 'react';
import { uploadAndRegisterFile, UploadAndRegisterOptions } from '@/lib/driveUploadComplete';
import { checkDriveConnection, DriveConnectionStatus, DriveFileResponse, DriveUploadPurpose } from '@/services/drive.service';
import { clearDriveTokenCache } from '@/lib/driveTokenCache';

export type UploadStatus = 'idle' | 'checking' | 'uploading' | 'registering' | 'success' | 'error';

export interface DriveUploadState {
  status: UploadStatus;
  progress: number;            // 0-100
  error: string | null;
  uploadedFile: DriveFileResponse | null;
  connectionStatus: DriveConnectionStatus | null;
}

export function useDriveUpload() {
  const [state, setState] = useState<DriveUploadState>({
    status: 'idle',
    progress: 0,
    error: null,
    uploadedFile: null,
    connectionStatus: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Check if user has connected Google Drive
   */
  const checkConnection = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'checking', error: null }));
    try {
      const status = await checkDriveConnection();
      setState(prev => ({ ...prev, connectionStatus: status, status: 'idle' }));
      return status;
    } catch (err: any) {
      setState(prev => ({ ...prev, status: 'error', error: err.message }));
      return null;
    }
  }, []);

  /**
   * Upload a file to Google Drive and register it.
   * Full flow: check connection → get token → upload → register
   */
  const upload = useCallback(async (
    file: File,
    options: {
      purpose: DriveUploadPurpose;
      referenceType?: string;
      referenceId?: string;
      shareWithEmails?: string[];
    },
  ): Promise<DriveFileResponse | null> => {
    // Reset state
    setState(prev => ({
      ...prev,
      status: 'uploading',
      progress: 0,
      error: null,
      uploadedFile: null,
    }));

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const result = await uploadAndRegisterFile({
        file,
        ...options,
        onProgress: (percent) => {
          setState(prev => ({
            ...prev,
            progress: percent,
            status: percent < 85 ? 'uploading' : 'registering',
          }));
        },
        abortSignal: abortControllerRef.current.signal,
      });

      setState(prev => ({
        ...prev,
        status: 'success',
        progress: 100,
        uploadedFile: result,
      }));

      return result;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'Upload cancelled') {
        setState(prev => ({ ...prev, status: 'idle', progress: 0, error: null }));
        return null;
      }

      const errorMessage = err.message || 'Upload failed';
      
      // If unauthorized, clear token cache
      if (err.status === 401) {
        clearDriveTokenCache();
      }

      setState(prev => ({ ...prev, status: 'error', error: errorMessage }));
      return null;
    }
  }, []);

  /**
   * Cancel an in-progress upload
   */
  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(prev => ({ ...prev, status: 'idle', progress: 0, error: null }));
  }, []);

  /**
   * Reset state back to idle
   */
  const reset = useCallback(() => {
    setState({
      status: 'idle',
      progress: 0,
      error: null,
      uploadedFile: null,
      connectionStatus: null,
    });
  }, []);

  return {
    ...state,
    checkConnection,
    upload,
    cancel,
    reset,
  };
}
```

---

## 14. Complete Upload Component (React/Next.js)

A production-ready upload component with drag-and-drop, progress, and error handling:

```tsx
// src/components/DriveFileUploader.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDriveUpload } from '@/hooks/useDriveUpload';
import { useDriveCallback } from '@/hooks/useDriveCallback';
import { ConnectDriveButton } from './ConnectDriveButton';
import { DriveUploadPurpose, DriveFileResponse } from '@/services/drive.service';

interface Props {
  purpose: DriveUploadPurpose;
  referenceType?: string;
  referenceId?: string;
  shareWithEmails?: string[];
  maxFileSizeMB?: number;
  acceptedTypes?: string;           // e.g., '.pdf,.doc,.docx,.jpg,.png'
  multiple?: boolean;
  onUploadComplete?: (file: DriveFileResponse) => void;
  onError?: (error: string) => void;
}

export function DriveFileUploader({
  purpose,
  referenceType,
  referenceId,
  shareWithEmails,
  maxFileSizeMB = 25,
  acceptedTypes,
  multiple = false,
  onUploadComplete,
  onError,
}: Props) {
  const {
    status,
    progress,
    error,
    uploadedFile,
    connectionStatus,
    checkConnection,
    upload,
    cancel,
    reset,
  } = useDriveUpload();

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  // Handle OAuth callback if redirected back
  useDriveCallback(() => {
    checkConnection();
  });

  // Notify parent on upload complete
  useEffect(() => {
    if (status === 'success' && uploadedFile) {
      onUploadComplete?.(uploadedFile);
    }
  }, [status, uploadedFile]);

  // Notify parent on error
  useEffect(() => {
    if (error) onError?.(error);
  }, [error]);

  const validateFile = (file: File): string | null => {
    const maxBytes = maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      return `File too large. Maximum: ${maxFileSizeMB}MB`;
    }
    if (acceptedTypes) {
      const extensions = acceptedTypes.split(',').map(t => t.trim().toLowerCase());
      const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!extensions.includes(fileExt)) {
        return `File type not accepted. Allowed: ${acceptedTypes}`;
      }
    }
    return null;
  };

  const handleFileSelect = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // Validate first file (or loop for multiple)
    const file = fileArray[0];
    const validationError = validateFile(file);
    if (validationError) {
      onError?.(validationError);
      return;
    }

    await upload(file, { purpose, referenceType, referenceId, shareWithEmails });
  };

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [status, connectionStatus]);

  // === RENDER ===

  // Not connected — show connect button
  if (connectionStatus && !connectionStatus.isConnected) {
    return (
      <div className="p-6 border-2 border-dashed border-gray-300 rounded-lg text-center">
        <div className="mb-4">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <p className="text-gray-600 mb-3">Connect Google Drive to upload files</p>
        <ConnectDriveButton
          returnUrl={window.location.pathname}
          onError={(err) => onError?.(err.message)}
        />
      </div>
    );
  }

  // Upload success
  if (status === 'success' && uploadedFile) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="font-medium text-green-800">File uploaded successfully</p>
        </div>
        <p className="text-sm text-gray-600">{uploadedFile.fileName}</p>
        <div className="flex gap-3 mt-3">
          <a
            href={uploadedFile.viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View in Drive
          </a>
          <button
            onClick={reset}
            className="text-sm text-gray-600 hover:underline"
          >
            Upload Another
          </button>
        </div>
      </div>
    );
  }

  // Uploading / registering
  if (status === 'uploading' || status === 'registering') {
    return (
      <div className="p-6 border-2 border-blue-200 bg-blue-50 rounded-lg">
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-blue-800 font-medium">
              {status === 'uploading' ? 'Uploading to Google Drive...' : 'Registering file...'}
            </span>
            <span className="text-blue-600">{progress}%</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <button
          onClick={cancel}
          className="text-sm text-red-600 hover:underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800 font-medium">Upload failed</p>
        <p className="text-sm text-red-600 mt-1">{error}</p>
        <button
          onClick={reset}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Default: drop zone / file picker
  return (
    <div
      className={`
        p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
        ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
      `}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={acceptedTypes}
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files) handleFileSelect(e.target.files);
          e.target.value = ''; // Reset for re-selecting same file
        }}
      />

      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>

      <p className="mt-2 text-gray-600">
        <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
      </p>
      <p className="text-sm text-gray-500 mt-1">
        {acceptedTypes || 'Any file type'} · Max {maxFileSizeMB}MB
      </p>

      {connectionStatus?.googleEmail && (
        <p className="text-xs text-gray-400 mt-2">
          Uploading to: {connectionStatus.googleEmail}
        </p>
      )}
    </div>
  );
}
```

---

## 15. Homework Submission Integration

### Example: How to use in Homework Submission page

```tsx
// src/app/homework/[id]/submit/page.tsx
'use client';

import { useState } from 'react';
import { DriveFileUploader } from '@/components/DriveFileUploader';
import { DriveFileResponse } from '@/services/drive.service';
import { submitHomework } from '@/services/homework.service';

export default function SubmitHomeworkPage({ params }: { params: { id: string } }) {
  const homeworkId = params.id;
  const [uploadedFiles, setUploadedFiles] = useState<DriveFileResponse[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleUploadComplete = (file: DriveFileResponse) => {
    setUploadedFiles(prev => [...prev, file]);
  };

  const handleSubmit = async () => {
    if (uploadedFiles.length === 0) {
      alert('Please upload at least one file');
      return;
    }

    setSubmitting(true);
    try {
      await submitHomework({
        homeworkId,
        driveFileIds: uploadedFiles.map(f => f.driveFileId),
        fileRecordIds: uploadedFiles.map(f => f.id),
      });
      alert('Homework submitted successfully!');
    } catch (error) {
      console.error('Submission failed:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Submit Homework</h1>

      {/* File uploader */}
      <div className="mb-6">
        <h2 className="font-medium mb-2">Upload Files</h2>
        <DriveFileUploader
          purpose="HOMEWORK_SUBMISSION"
          referenceType="homework_submission"
          referenceId={homeworkId}
          shareWithEmails={['teacher@school.lk']}  // Share with teacher
          maxFileSizeMB={25}
          acceptedTypes=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
          onUploadComplete={handleUploadComplete}
          onError={(err) => console.error(err)}
        />
      </div>

      {/* Uploaded files list */}
      {uploadedFiles.length > 0 && (
        <div className="mb-6">
          <h3 className="font-medium mb-2">Uploaded Files ({uploadedFiles.length})</h3>
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-3 bg-white border rounded">
                <div>
                  <p className="font-medium">{file.fileName}</p>
                  <a
                    href={file.viewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600"
                  >
                    View in Drive
                  </a>
                </div>
                <button
                  onClick={() => removeFile(file.id)}
                  className="text-red-500 text-sm"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={submitting || uploadedFiles.length === 0}
        className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : `Submit Homework (${uploadedFiles.length} files)`}
      </button>
    </div>
  );
}
```

---

## 16. Error Handling Reference

### Common Errors & Handling

| Error | HTTP Status | Cause | How to Handle |
|-------|------------|-------|---------------|
| `Drive not connected` | 401 | No refresh token for user | Show "Connect Google Drive" button |
| `Token refresh failed` | 401 | Google revoked access | Prompt user to reconnect |
| `File not found on Drive` | 400 | Invalid driveFileId in register | Show error, don't retry |
| `File too large` | 400 | Exceeds 25MB limit | Validate on frontend first |
| `Quota exceeded` | 429 | Google API rate limit | Retry with exponential backoff |
| `Invalid scope` | 403 | Token can't access file | File not created by our app |

### Error Handler Utility

```typescript
// src/lib/driveErrorHandler.ts
import { ApiError } from '@/lib/api';
import { clearDriveTokenCache } from '@/lib/driveTokenCache';

export type DriveErrorAction = 'reconnect' | 'retry' | 'show-error' | 'ignore';

export function handleDriveError(error: unknown): {
  action: DriveErrorAction;
  message: string;
} {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        clearDriveTokenCache();
        return {
          action: 'reconnect',
          message: 'Google Drive access expired. Please reconnect.',
        };
      case 429:
        return {
          action: 'retry',
          message: 'Too many requests. Please wait a moment.',
        };
      case 400:
        return {
          action: 'show-error',
          message: error.message || 'Invalid request.',
        };
      default:
        return {
          action: 'show-error',
          message: error.message || 'An error occurred.',
        };
    }
  }

  // Google Drive direct API errors
  if (error instanceof Error) {
    if (error.message.includes('401') || error.message.includes('invalid_token')) {
      clearDriveTokenCache();
      return {
        action: 'reconnect',
        message: 'Google Drive token expired. Please reconnect.',
      };
    }
    if (error.message.includes('403') || error.message.includes('insufficient')) {
      return {
        action: 'reconnect',
        message: 'Insufficient permissions. Please reconnect Google Drive with full access.',
      };
    }
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return {
        action: 'retry',
        message: 'Network error. Please check your internet connection.',
      };
    }
  }

  return {
    action: 'show-error',
    message: 'An unexpected error occurred.',
  };
}
```

---

## 17. API Endpoint Quick Reference

### All Endpoints

| Method | Endpoint | Auth | Description | Request | Response |
|--------|----------|------|-------------|---------|----------|
| `GET` | `/drive-access/status` | JWT | Check connection | - | `DriveConnectionStatus` |
| `GET` | `/drive-access/connect` | JWT | Get OAuth URL | `?returnUrl=/path` | `{ authUrl, state }` |
| `GET` | `/drive-access/callback` | None | OAuth callback (Google calls this) | `?code=...&state=...` | 302 Redirect |
| `POST` | `/drive-access/disconnect` | JWT | Disconnect Drive | - | `{ success, message }` |
| `GET` | `/drive-access/token` | JWT | Get access token | - | `DriveAccessToken` |
| `GET` | `/drive-access/folder` | JWT | Get upload folder | `?purpose=HOMEWORK_SUBMISSION` | `{ folderId, folderPath }` |
| `POST` | `/drive-access/folder` | JWT | Create custom folder | `{ folderName, parentFolderId? }` | `{ folderId, folderName, webViewLink }` |
| `POST` | `/drive-access/files/register` | JWT | Register uploaded file | `RegisterDriveFileDto` | `DriveFileResponse` |
| `GET` | `/drive-access/files` | JWT | List files | `?purpose=...&page=1&limit=20` | `DriveFileListResponse` |
| `GET` | `/drive-access/files/:id` | JWT | Get file details | - | `DriveFileResponse` |
| `GET` | `/drive-access/files/:id/download` | JWT | Download file (proxy) | - | Binary file content |
| `DELETE` | `/drive-access/files/:id` | JWT | Delete file | - | `{ success, message }` |

### Response Types

```typescript
// DriveConnectionStatus
{
  isConnected: boolean;
  googleEmail?: string;
  googleDisplayName?: string;
  googleProfilePicture?: string;
  grantedScopes?: string;
  lastUsedAt?: string;
  connectedAt?: string;
  needsReauthorization?: boolean;
}

// DriveAccessToken
{
  accessToken: string;    // Short-lived (~1hr), scoped to drive.file
  expiresIn: number;      // Seconds until expiry (e.g., 3599)
  expiresAt: string;      // ISO timestamp
  googleEmail: string;
  clientId: string;       // Your Google OAuth Client ID
}

// RegisterDriveFileDto (POST body)
{
  driveFileId: string;     // Required — from Google Drive upload response
  purpose: string;         // Required — enum: HOMEWORK_SUBMISSION, HOMEWORK_REFERENCE, etc.
  referenceType?: string;  // Optional — e.g., 'homework_submission'
  referenceId?: string;    // Optional — e.g., homework ID
  shareWithEmails?: string; // Optional — comma-separated emails
}

// DriveFileResponse
{
  id: string;
  driveFileId: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  purpose: string;
  referenceType?: string;
  referenceId?: string;
  viewUrl: string;
  downloadUrl: string;
  embedUrl?: string;
  createdAt: string;
}

// DriveFileListResponse
{
  data: DriveFileResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

---

## Complete Flow Summary

```
USER FIRST TIME:
1. Open homework page → GET /drive-access/status → { isConnected: false }
2. Click "Connect Google Drive" → GET /drive-access/connect → { authUrl: '...' }
3. Redirect to Google → User grants access → Google redirects to backend callback
4. Backend stores encrypted refresh token → Redirects to frontend with ?drive_connected=true
5. Frontend shows "Connected: john@gmail.com" ✅

EVERY UPLOAD AFTER THAT:
1. GET /drive-access/token → { accessToken: 'ya29...', expiresIn: 3599 }
2. GET /drive-access/folder?purpose=HOMEWORK_SUBMISSION → { folderId: '1abc...' }
3. fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
     headers: { Authorization: 'Bearer ya29...' },
     body: formData  // metadata + file
   }) → { id: '1xyz...' }  // Google returns file ID
4. POST /drive-access/files/register → { driveFileId: '1xyz...', purpose: 'HOMEWORK_SUBMISSION' }
   Backend verifies file on Drive → stores metadata → returns DriveFileResponse ✅

NO RE-AUTHENTICATION NEEDED — backend auto-refreshes tokens using stored refresh token.
```
