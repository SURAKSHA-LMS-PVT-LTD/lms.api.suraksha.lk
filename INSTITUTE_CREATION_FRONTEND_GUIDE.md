# Institute Creation – Complete Frontend Guide

**Eligibility, File Uploads, Institute Setup & Auto-Admin Assignment**

Every endpoint, validation rule, and TypeScript sample you need to build the institute creation flow end-to-end.

---

## Table of Contents

1. [User Type Eligibility](#1-user-type-eligibility)
2. [Pre-Check – Can This User Create an Institute?](#2-pre-check--can-this-user-create-an-institute)
3. [File Upload Flow (GCS / AWS S3)](#3-file-upload-flow-gcs--aws-s3)
   - [3.1 Step 1 – Generate Signed URL](#31-step-1--generate-signed-url)
   - [3.2 Step 2 – Upload File Directly to Cloud Storage](#32-step-2--upload-file-directly-to-cloud-storage)
   - [3.3 Step 3 – Verify & Publish](#33-step-3--verify--publish)
4. [File Rules for Institute Images](#4-file-rules-for-institute-images)
5. [Create the Institute](#5-create-the-institute)
6. [Assign Creator as Institute Admin (Auto-Admin)](#6-assign-creator-as-institute-admin-auto-admin)
7. [Generate an Institute-Scoped JWT](#7-generate-an-institute-scoped-jwt)
8. [Complete TypeScript/React Flow](#8-complete-typescriptreact-flow)
9. [API Reference – All Endpoints Used](#9-api-reference--all-endpoints-used)
10. [Error Reference](#10-error-reference)
11. [UI Decision Tree](#11-ui-decision-tree)

---

## 1. User Type Eligibility

The system has **five global user types**. Institute creation is permitted for all types **except `USER_WITHOUT_PARENT`**.

| Global User Type | Value | Can Create Institute? | Notes |
|---|---|---|---|
| `SUPER_ADMIN` | `SUPER_ADMIN` | ✅ Yes | Full system access |
| `ORGANIZATION_MANAGER` | `ORGANIZATION_MANAGER` | ✅ Yes | Manages multiple institutes |
| `USER` | `USER` | ✅ Yes | Full flexibility; can also be student/parent |
| `USER_WITHOUT_STUDENT` | `USER_WITHOUT_STUDENT` | ✅ Yes | Parent-type user; can create institutes |
| `USER_WITHOUT_PARENT` | `USER_WITHOUT_PARENT` | ❌ **No** | Cannot be assigned as parent; blocked from institute creation |

> **Rule**: `if (user.userType !== 'USER_WITHOUT_PARENT')` → show institute creation option.

When a user creates an institute, the backend (or your frontend flow) **automatically assigns them as `INSTITUTE_ADMIN`** for that institute.

---

## 2. Pre-Check – Can This User Create an Institute?

Before showing the "Create Institute" button, decode the JWT and check `userType`.

### JWT Payload Structure

The global (login) JWT contains:

```typescript
interface GlobalJwtPayload {
  s: string;         // userId (subject)
  e: string;         // email
  fn: string;        // firstName
  ln: string;        // lastName
  ut: string;        // userType: 'SUPER_ADMIN' | 'ORGANIZATION_MANAGER' | 'USER' | 'USER_WITHOUT_PARENT' | 'USER_WITHOUT_STUDENT'
  iat: number;
  exp: number;
}
```

### Eligibility Check

```typescript
import { jwtDecode } from 'jwt-decode';

const BLOCKED_USER_TYPES = ['USER_WITHOUT_PARENT'];

function canCreateInstitute(jwt: string): boolean {
  try {
    const payload = jwtDecode<GlobalJwtPayload>(jwt);
    return !BLOCKED_USER_TYPES.includes(payload.ut);
  } catch {
    return false;
  }
}

// Usage
const jwt = localStorage.getItem('access_token');
const eligible = canCreateInstitute(jwt);

// In React
{eligible && <button onClick={openCreateInstituteModal}>Create Institute</button>}
{!eligible && (
  <p className="text-muted">
    Your account type does not support creating institutes.
    Please contact support to upgrade.
  </p>
)}
```

---

## 3. File Upload Flow (GCS / AWS S3)

Institute creation supports **optional** logo, loading GIF, cover image, and gallery images. All files must be uploaded using the **3-step signed URL flow** before submitting the institute form.

```
┌──────────────────────────────────────────────────────────┐
│  STEP 1: GET /upload/get-signed-url?...                   │
│          → receives uploadUrl + relativePath              │
│                          ↓                               │
│  STEP 2: PUT (GCS) or POST multipart (AWS)               │
│          to uploadUrl with Content-Type header            │
│          → file uploaded directly (bypasses your server)  │
│                          ↓                               │
│  STEP 3: POST /upload/verify-and-publish                 │
│          { relativePath }                                 │
│          → file made PUBLIC, returns permanent publicUrl  │
│          → use publicUrl / relativePath in institute form │
└──────────────────────────────────────────────────────────┘
```

> **Critical**: Files are **private** until Step 3 is complete. Always call `verify-and-publish` before submitting the institute form.

---

### 3.1 Step 1 – Generate Signed URL

Two equivalent endpoints — use either:

#### Option A: GET (query params — simplest)

```
GET /upload/get-signed-url?folder=institute-images&fileName=logo.png&contentType=image/png&fileSize=2097152
Authorization: Bearer <jwt>
```

#### Option B: POST (JSON body)

```
POST /upload/generate-signed-url
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "folder": "institute-images",
  "fileName": "logo.png",
  "contentType": "image/png",
  "fileSize": 2097152
}
```

**Response `200`:**

```json
{
  "success": true,
  "message": "Signed URL generated successfully (10 min expiry)",
  "uploadUrl": "https://storage.googleapis.com/suraksha-lms/institute-images/logo-uuid.png?X-Goog-Signature=...",
  "publicUrl": "https://storage.googleapis.com/suraksha-lms/institute-images/logo-uuid.png",
  "relativePath": "institute-images/logo-uuid.png",
  "expiresAt": "2026-03-11T06:10:00.000Z",
  "instructions": {
    "step1": "Upload file using: PUT https://storage.googleapis.com/...",
    "step2": "Add header: Content-Type: image/png",
    "step3": "Call POST /upload/verify-and-publish with relativePath: institute-images/logo-uuid.png",
    "important": "File will be PRIVATE until you call /verify-and-publish"
  }
}
```

> When `STORAGE_PROVIDER=aws`, the response also includes a `fields` object (for multipart POST form upload) and `instructions.step1` uses `POST` instead of `PUT`.

---

### 3.2 Step 2 – Upload File Directly to Cloud Storage

#### GCS (default) — `PUT` request

```typescript
async function uploadToGCS(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
      // Required header enforced by GCS signed URL:
      'x-goog-content-length-range': `0,${10 * 1024 * 1024}`, // 0–10MB
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`GCS upload failed: ${response.status} ${response.statusText}`);
  }
}
```

#### AWS S3 — `POST` multipart (when `fields` is present in Step 1 response)

```typescript
async function uploadToS3(uploadUrl: string, fields: Record<string, string>, file: File): Promise<void> {
  const formData = new FormData();

  // IMPORTANT: All fields from the signed URL response MUST be added before the file
  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, value);
  });

  // File must be the LAST field
  formData.append('file', file);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData,  // ⚠️ Do NOT set Content-Type manually — browser sets it with boundary
  });

  if (!response.ok) {
    throw new Error(`S3 upload failed: ${response.status} ${response.statusText}`);
  }
}
```

#### Auto-detect provider

```typescript
async function uploadFile(
  uploadUrl: string,
  file: File,
  fields?: Record<string, string>
): Promise<void> {
  if (fields) {
    // AWS S3 multipart POST
    await uploadToS3(uploadUrl, fields, file);
  } else {
    // GCS PUT
    await uploadToGCS(uploadUrl, file);
  }
}
```

---

### 3.3 Step 3 – Verify & Publish

After a successful upload, call `verify-and-publish` to make the file permanently publicly accessible:

```
POST /upload/verify-and-publish
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "relativePath": "institute-images/logo-uuid.png"
}
```

**Response `200`:**

```json
{
  "success": true,
  "message": "File verified and made public successfully",
  "publicUrl": "https://storage.googleapis.com/suraksha-lms/institute-images/logo-uuid.png",
  "relativePath": "institute-images/logo-uuid.png",
  "instructions": {
    "nextStep": "Use publicUrl in your API calls (user creation, profile update, etc.)",
    "note": "This URL is now publicly accessible and has no expiration"
  }
}
```

> Use **`relativePath`** (not `publicUrl`) when submitting to the institute creation endpoint. The backend stores relative paths and transforms them to full URLs on response.

---

## 4. File Rules for Institute Images

| Property | Value |
|---|---|
| **Folder** | `institute-images` |
| **Max file size** | **10 MB** (10 × 1024 × 1024 bytes) |
| **Allowed extensions** | `.jpg`, `.jpeg`, `.png`, `.webp`, `.svg` |
| **Double extensions** | ❌ Blocked (e.g., `logo.png.jpg` rejected) |
| **URL expiry** | 10 minutes (must complete upload within expiry) |
| **Gallery images max** | 10 images (`imageUrls` field, `ArrayMaxSize(10)`) |

### File Validation (Frontend pre-check)

```typescript
const ALLOWED_INSTITUTE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
const MAX_INSTITUTE_SIZE = 10 * 1024 * 1024; // 10 MB

function validateInstituteImage(file: File): string | null {
  if (!ALLOWED_INSTITUTE_TYPES.includes(file.type)) {
    return `Invalid file type. Allowed: JPEG, PNG, WebP, SVG`;
  }
  if (file.size > MAX_INSTITUTE_SIZE) {
    return `File too large. Maximum size: 10 MB (file is ${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  }
  return null; // valid
}
```

---

## 5. Create the Institute

### Endpoint

```
POST /institutes
Authorization: Bearer <jwt>
Content-Type: application/json
```

> **Access**: `SUPER_ADMIN` only for direct creation. For other eligible user types, a `SUPER_ADMIN` or system process handles the creation and then assigns the requesting user as admin (see [Section 6](#6-assign-creator-as-institute-admin-auto-admin)).

### Request Body

```typescript
interface CreateInstituteDto {
  // ─── Required ───────────────────────────────────────────
  name: string;              // max 255 chars
  code: string;              // 3–50 chars, uppercase letters/numbers/hyphens/underscores only
  email: string;             // valid email, max 255 chars

  // ─── Optional: Contact & Location ───────────────────────
  shortName?: string;        // max 50 chars
  phone?: string;            // max 20 chars
  address?: string;
  city?: string;             // max 100 chars
  state?: string;            // max 100 chars
  country?: Country;         // default: SRI_LANKA
  district?: District;
  province?: Province;
  pinCode?: string;          // max 20 chars

  // ─── Optional: Branding (from verify-and-publish) ───────
  logoUrl?: string;          // relative path, max 255 chars
  loadingGifUrl?: string;    // relative path, max 255 chars
  imageUrl?: string;         // single cover image relative path
  imageUrls?: string[];      // gallery images, max 10 items

  // ─── Optional: Theme Colors ─────────────────────────────
  primaryColorCode?: string;    // hex: '#1976D2'
  secondaryColorCode?: string;  // hex: '#FFC107'
}
```

### Code field validation

```typescript
// code must match: /^[A-Z0-9_-]+$/
// Examples:
// ✅ 'CIS001', 'SCHOOL_A', 'EDU-CENTER-1'
// ❌ 'cis001' (lowercase), 'CIS 001' (space), 'CIS.001' (dot)
```

### Request Example (full)

```json
{
  "name": "Cambridge International School",
  "shortName": "CIS",
  "code": "CIS001",
  "email": "admin@cambridge-school.edu",
  "phone": "+94112345678",
  "address": "123 Education Street",
  "city": "Colombo",
  "state": "Western Province",
  "country": "SRI_LANKA",
  "district": "COLOMBO",
  "province": "WESTERN",
  "pinCode": "00100",
  "logoUrl": "institute-images/logo-uuid.png",
  "loadingGifUrl": "institute-images/loading-uuid.gif",
  "imageUrl": "institute-images/cover-uuid.jpg",
  "imageUrls": [
    "institute-images/gallery1-uuid.jpg",
    "institute-images/gallery2-uuid.jpg"
  ],
  "primaryColorCode": "#1976D2",
  "secondaryColorCode": "#FFC107"
}
```

### Response `201`

```json
{
  "id": "12",
  "name": "Cambridge International School",
  "shortName": "CIS",
  "code": "CIS001",
  "email": "admin@cambridge-school.edu",
  "phone": "+94112345678",
  "city": "Colombo",
  "isActive": true,
  "logoUrl": "https://storage.googleapis.com/suraksha-lms/institute-images/logo-uuid.png",
  "loadingGifUrl": "https://storage.googleapis.com/suraksha-lms/institute-images/loading-uuid.gif",
  "imageUrl": "https://storage.googleapis.com/suraksha-lms/institute-images/cover-uuid.jpg",
  "imageUrls": [
    "https://storage.googleapis.com/suraksha-lms/institute-images/gallery1-uuid.jpg"
  ],
  "primaryColorCode": "#1976D2",
  "secondaryColorCode": "#FFC107",
  "createdAt": "2026-03-11T06:00:00.000Z",
  "updatedAt": "2026-03-11T06:00:00.000Z"
}
```

> Note: The API response transforms `relativePath` → full `publicUrl` automatically. Store and pass `relativePath` to the API; display the full URL returned in responses.

---

## 6. Assign Creator as Institute Admin (Auto-Admin)

After the institute is created, assign the creator (or any eligible user) as `INSTITUTE_ADMIN` using the secure phone-based assignment endpoint.

> **Pattern**: The system uses phone number, email, or user ID as the lookup key to assign users to institutes. The phone-based method is the primary recommended approach.

### Assign by Phone Number

```
POST /institute-users/institute/:instituteId/assign-user-by-phone
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "phoneNumber": "+94771234567",
  "instituteUserType": "INSTITUTE_ADMIN",
  "userIdByInstitute": "ADMIN001"
}
```

| Field | Required | Description |
|---|---|---|
| `phoneNumber` | ✅ | International format, must match registered user |
| `instituteUserType` | ✅ | `INSTITUTE_ADMIN` \| `TEACHER` \| `STUDENT` \| `ATTENDANCE_MARKER` |
| `userIdByInstitute` | Optional | Institute-specific ID (e.g., employee number) |

**Response `200` (success):**

```json
{
  "success": true,
  "message": "User successfully assigned to institute as INSTITUTE_ADMIN",
  "user": {
    "id": "42",
    "name": "Kamal Perera",
    "instituteUserType": "INSTITUTE_ADMIN"
  }
}
```

### Assign by Email

```
POST /institute-users/institute/:instituteId/assign-user-by-email
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "email": "admin@example.com",
  "instituteUserType": "INSTITUTE_ADMIN"
}
```

### Assign by User ID

```
POST /institute-users/institute/:instituteId/assign-user-by-id
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "userId": "42",
  "instituteUserType": "INSTITUTE_ADMIN"
}
```

### User Type Restrictions for Role Assignment

| Global User Type | Can be assigned as `INSTITUTE_ADMIN`? | Can be assigned as `STUDENT`? | Notes |
|---|---|---|---|
| `USER` | ✅ | ✅ | Full flexibility |
| `USER_WITHOUT_PARENT` | ✅ | ✅ | Can be admin/student but not parent |
| `USER_WITHOUT_STUDENT` | ✅ | ❌ | Cannot be student |
| `SUPER_ADMIN` | ✅ | ✅ | Always has access |
| `ORGANIZATION_MANAGER` | ✅ | N/A | Org-level access |

---

## 7. Generate an Institute-Scoped JWT

After the user is assigned as `INSTITUTE_ADMIN`, they must select the institute and receive an **institute-scoped JWT** to perform admin operations on it.

### Step 1 – List User's Institutes

```
GET /auth/institutes
Authorization: Bearer <global-jwt>
```

**Response:**

```json
{
  "institutes": [
    {
      "id": "12",
      "name": "Cambridge International School",
      "code": "CIS001",
      "logoUrl": "https://storage.googleapis.com/...",
      "userRole": "INSTITUTE_ADMIN"
    }
  ]
}
```

### Step 2 – Select Institute (Get Institute Token)

```
POST /auth/institutes/:instituteId/select
Authorization: Bearer <global-jwt>
```

**Response `200`:**

```json
{
  "access_token": "<institute-scoped-jwt>",
  "institute": {
    "id": "12",
    "name": "Cambridge International School",
    "code": "CIS001"
  },
  "role": "INSTITUTE_ADMIN"
}
```

The institute-scoped JWT payload:

```typescript
interface InstituteJwtPayload {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  instituteId: string;
  userType: string;      // global user type
  classIds: string[];    // for students/teachers
  iat: number;
  exp: number;
}
```

> Store the institute token separately from the global token. Use the **institute token** for all `/institutes/:id/*` and `/institute-users/*` operations.

---

## 8. Complete TypeScript/React Flow

### Type Definitions

```typescript
const BASE = 'https://your-api.com';

// Enums
type UserType =
  | 'SUPER_ADMIN'
  | 'ORGANIZATION_MANAGER'
  | 'USER'
  | 'USER_WITHOUT_PARENT'
  | 'USER_WITHOUT_STUDENT';

type InstituteUserType = 'INSTITUTE_ADMIN' | 'TEACHER' | 'STUDENT' | 'ATTENDANCE_MARKER' | 'PARENT';

// JWT payload (global token)
interface GlobalJwt {
  s: string;   // userId
  e: string;   // email
  fn: string;  // firstName
  ln: string;  // lastName
  ut: UserType;
  iat: number;
  exp: number;
}

interface SignedUrlResponse {
  success: boolean;
  uploadUrl: string;
  publicUrl: string;
  relativePath: string;
  expiresAt: string;
  fields?: Record<string, string>; // present for AWS S3
}

interface VerifyPublishResponse {
  success: boolean;
  publicUrl: string;
  relativePath: string;
}

interface CreateInstitutePayload {
  name: string;
  code: string;
  email: string;
  shortName?: string;
  phone?: string;
  city?: string;
  logoUrl?: string;
  loadingGifUrl?: string;
  imageUrl?: string;
  imageUrls?: string[];
  primaryColorCode?: string;
  secondaryColorCode?: string;
  [key: string]: any;
}
```

---

### Core Upload Utility

```typescript
async function uploadInstituteFile(jwt: string, file: File): Promise<string> {
  // 1. Validate before sending
  const error = validateInstituteImage(file);
  if (error) throw new Error(error);

  // 2. Generate signed URL
  const params = new URLSearchParams({
    folder: 'institute-images',
    fileName: file.name,
    contentType: file.type,
    fileSize: String(file.size),
  });

  const urlRes = await fetch(`${BASE}/upload/get-signed-url?${params}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });

  if (!urlRes.ok) {
    const err = await urlRes.json();
    throw new Error(err.message || 'Failed to generate upload URL');
  }

  const { uploadUrl, relativePath, fields }: SignedUrlResponse = await urlRes.json();

  // 3. Upload to cloud storage
  if (fields) {
    // AWS S3 multipart POST
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    form.append('file', file);
    const upRes = await fetch(uploadUrl, { method: 'POST', body: form });
    if (!upRes.ok) throw new Error(`S3 upload failed: ${upRes.status}`);
  } else {
    // GCS PUT
    const upRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!upRes.ok) throw new Error(`GCS upload failed: ${upRes.status}`);
  }

  // 4. Verify and publish
  const pubRes = await fetch(`${BASE}/upload/verify-and-publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ relativePath }),
  });

  if (!pubRes.ok) {
    const err = await pubRes.json();
    throw new Error(err.message || 'Failed to verify upload');
  }

  const { relativePath: finalPath }: VerifyPublishResponse = await pubRes.json();
  return finalPath; // Return relativePath for the API body
}
```

---

### Create Institute Service

```typescript
async function createInstitute(
  jwt: string,
  formData: {
    name: string;
    code: string;
    email: string;
    shortName?: string;
    phone?: string;
    city?: string;
    state?: string;
    primaryColorCode?: string;
    secondaryColorCode?: string;
    logoFile?: File;
    loadingGifFile?: File;
    coverImageFile?: File;
    galleryFiles?: File[];
  }
): Promise<{ instituteId: string; instituteName: string }> {
  const {
    logoFile,
    loadingGifFile,
    coverImageFile,
    galleryFiles = [],
    ...textFields
  } = formData;

  // Upload all files in parallel
  const [logoUrl, loadingGifUrl, imageUrl, ...galleryUrls] = await Promise.all([
    logoFile ? uploadInstituteFile(jwt, logoFile) : Promise.resolve(undefined),
    loadingGifFile ? uploadInstituteFile(jwt, loadingGifFile) : Promise.resolve(undefined),
    coverImageFile ? uploadInstituteFile(jwt, coverImageFile) : Promise.resolve(undefined),
    ...galleryFiles.map((f) => uploadInstituteFile(jwt, f)),
  ]);

  const payload: CreateInstitutePayload = {
    ...textFields,
    ...(logoUrl && { logoUrl }),
    ...(loadingGifUrl && { loadingGifUrl }),
    ...(imageUrl && { imageUrl }),
    ...(galleryUrls.length > 0 && { imageUrls: galleryUrls }),
  };

  const res = await fetch(`${BASE}/institutes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create institute');
  }

  const institute = await res.json();
  return { instituteId: institute.id, instituteName: institute.name };
}
```

---

### Auto-Assign Creator as Institute Admin

```typescript
async function assignCurrentUserAsAdmin(
  jwt: string,
  instituteId: string,
  creatorPhone: string
): Promise<void> {
  const res = await fetch(
    `${BASE}/institute-users/institute/${instituteId}/assign-user-by-phone`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber: creatorPhone,
        instituteUserType: 'INSTITUTE_ADMIN',
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to assign institute admin');
  }
}
```

---

### Complete Orchestration

```typescript
async function fullInstituteCreationFlow(
  jwt: string,
  creatorPhone: string,
  formData: Parameters<typeof createInstitute>[1]
) {
  // Step 0: Eligibility check
  if (!canCreateInstitute(jwt)) {
    throw new Error('Your account type cannot create institutes.');
  }

  // Step 1: Create institute (with file uploads inside)
  const { instituteId, instituteName } = await createInstitute(jwt, formData);

  // Step 2: Auto-assign creator as institute admin
  await assignCurrentUserAsAdmin(jwt, instituteId, creatorPhone);

  // Step 3: Select institute to get institute-scoped token
  const selectRes = await fetch(`${BASE}/auth/institutes/${instituteId}/select`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
  });

  const { access_token: instituteToken } = await selectRes.json();

  // Save institute token for subsequent admin operations
  sessionStorage.setItem(`institute_token_${instituteId}`, instituteToken);

  return { instituteId, instituteName, instituteToken };
}
```

---

### React Component Example

```tsx
import React, { useState } from 'react';
import { jwtDecode } from 'jwt-decode';

interface InstituteFormData {
  name: string;
  code: string;
  email: string;
  shortName: string;
  phone: string;
  city: string;
  primaryColorCode: string;
  secondaryColorCode: string;
  logoFile: File | null;
  loadingGifFile: File | null;
  coverImageFile: File | null;
  galleryFiles: File[];
}

export function CreateInstituteModal({ jwt, userPhone }: { jwt: string; userPhone: string }) {
  const [form, setForm] = useState<InstituteFormData>({
    name: '', code: '', email: '', shortName: '',
    phone: '', city: '', primaryColorCode: '#1976D2',
    secondaryColorCode: '#FFC107', logoFile: null,
    loadingGifFile: null, coverImageFile: null, galleryFiles: []
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  // Check eligibility
  const payload = jwtDecode<{ ut: string }>(jwt);
  if (payload.ut === 'USER_WITHOUT_PARENT') {
    return (
      <div className="alert alert-warning">
        Your account type cannot create institutes. Please contact support.
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      setUploadProgress('Uploading images...');
      const { instituteId, instituteName } = await fullInstituteCreationFlow(jwt, userPhone, {
        name: form.name,
        code: form.code.toUpperCase(),
        email: form.email,
        shortName: form.shortName || undefined,
        phone: form.phone || undefined,
        city: form.city || undefined,
        primaryColorCode: form.primaryColorCode || undefined,
        secondaryColorCode: form.secondaryColorCode || undefined,
        logoFile: form.logoFile || undefined,
        loadingGifFile: form.loadingGifFile || undefined,
        coverImageFile: form.coverImageFile || undefined,
        galleryFiles: form.galleryFiles,
      });

      setUploadProgress('');
      alert(`✅ Institute "${instituteName}" created successfully! You are now the admin.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-danger">{error}</div>}
      {uploadProgress && <div className="alert alert-info">{uploadProgress}</div>}

      {/* Required fields */}
      <input
        required
        placeholder="Institute Name *"
        value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
      />
      <input
        required
        placeholder="Code (e.g. CIS001) *"
        value={form.code}
        onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
        pattern="[A-Z0-9_-]+"
        title="Uppercase letters, numbers, hyphens, underscores only"
      />
      <input
        required
        type="email"
        placeholder="Institute Email *"
        value={form.email}
        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
      />

      {/* Optional fields */}
      <input
        placeholder="Short Name"
        value={form.shortName}
        onChange={e => setForm(f => ({ ...f, shortName: e.target.value }))}
      />
      <input
        placeholder="Phone"
        value={form.phone}
        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
      />
      <input
        placeholder="City"
        value={form.city}
        onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
      />

      {/* Color pickers */}
      <label>
        Primary Color:
        <input type="color" value={form.primaryColorCode}
          onChange={e => setForm(f => ({ ...f, primaryColorCode: e.target.value }))} />
      </label>
      <label>
        Secondary Color:
        <input type="color" value={form.secondaryColorCode}
          onChange={e => setForm(f => ({ ...f, secondaryColorCode: e.target.value }))} />
      </label>

      {/* File uploads */}
      <label>
        Logo (max 10 MB – JPG/PNG/WebP/SVG):
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/svg+xml"
          onChange={e => setForm(f => ({ ...f, logoFile: e.target.files?.[0] || null }))}
        />
        {form.logoFile && (() => {
          const err = validateInstituteImage(form.logoFile!);
          return err ? <span className="text-danger">{err}</span> : null;
        })()}
      </label>

      <label>
        Loading GIF (max 10 MB):
        <input
          type="file"
          accept="image/gif"
          onChange={e => setForm(f => ({ ...f, loadingGifFile: e.target.files?.[0] || null }))}
        />
      </label>

      <label>
        Cover Image (max 10 MB):
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={e => setForm(f => ({ ...f, coverImageFile: e.target.files?.[0] || null }))}
        />
      </label>

      <label>
        Gallery Images (max 10 images, 10 MB each):
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={e => {
            const files = Array.from(e.target.files || []).slice(0, 10);
            setForm(f => ({ ...f, galleryFiles: files }));
          }}
        />
        <small>{form.galleryFiles.length}/10 selected</small>
      </label>

      <button type="submit" disabled={loading}>
        {loading ? 'Creating Institute...' : 'Create Institute'}
      </button>
    </form>
  );
}
```

---

## 9. API Reference – All Endpoints Used

| Step | Method | Endpoint | Auth | Description |
|---|---|---|---|---|
| 1 | `GET` | `/upload/get-signed-url` | JWT | Generate signed URL (query params) |
| 1b | `POST` | `/upload/generate-signed-url` | JWT | Generate signed URL (JSON body) |
| 2 | `PUT/POST` | `<uploadUrl>` (GCS/S3 direct) | Signed URL | Upload file to cloud storage |
| 3 | `POST` | `/upload/verify-and-publish` | JWT | Publish file, get permanent URL |
| 4 | `POST` | `/institutes` | JWT (SUPERADMIN) | Create institute |
| 5a | `POST` | `/institute-users/institute/:id/assign-user-by-phone` | JWT | Assign user as admin by phone |
| 5b | `POST` | `/institute-users/institute/:id/assign-user-by-email` | JWT | Assign user as admin by email |
| 5c | `POST` | `/institute-users/institute/:id/assign-user-by-id` | JWT | Assign user as admin by user ID |
| 6 | `GET` | `/auth/institutes` | JWT | List user's institutes |
| 7 | `POST` | `/auth/institutes/:id/select` | JWT | Get institute-scoped token |

### Upload Folder Reference

| Folder | Max Size | Allowed Types | Use Case |
|---|---|---|---|
| `institute-images` | **10 MB** | JPG, PNG, WebP, SVG | Logo, cover, gallery |
| `profile-images` | 5 MB | JPG, PNG, WebP | User profile pictures |
| `institute-user-images` | 5 MB | JPG, PNG, WebP | Institute-specific user photos |
| `id-documents` | 10 MB | JPG, PNG, PDF | Identity documents |

---

## 10. Error Reference

| HTTP | Error | When |
|---|---|---|
| 400 | `Invalid folder. Must be one of: ...` | Invalid `folder` param in upload request |
| 400 | `Invalid file extension. Allowed extensions for institute-images: .jpg, .jpeg, .png, .webp, .svg` | Wrong file type |
| 400 | `File exceeds maximum size for institute-images (10MB)` | File > 10 MB |
| 400 | `Missing required parameters: folder, fileName, contentType, fileSize` | Missing upload params |
| 400 | `Institute with this code already exists` | Duplicate `code` field |
| 400 | `Institute with this email already exists` | Duplicate `email` field |
| 400 | `Code must contain only uppercase letters, numbers, hyphens, and underscores` | Invalid code format |
| 400 | `User is already assigned to this institute` | Duplicate admin assignment |
| 400 | `User not found` | Phone/email/ID not registered |
| 400 | `USER_WITHOUT_STUDENT users cannot be assigned as STUDENT` | Type restriction violation |
| 401 | `Unauthorized` | JWT missing or expired |
| 403 | `Forbidden – requires SUPERADMIN role` | Non-SUPERADMIN attempting institute creation |
| 403 | `Access denied to this institute` | User not in institute during token selection |
| 404 | `Institute with ID X not found` | Invalid instituteId |
| 404 | `User with ID X not found` | Invalid userId |
| 409 | `Conflict – code or email already exists` | Duplicate check on create |
| 429 | `ThrottlerException: Too Many Requests` | Rate limit exceeded |

---

## 11. UI Decision Tree

```
User opens "Create Institute" screen
              │
              ▼
  Decode JWT → check ut (userType)
              │
    ┌─────────┴─────────┐
    │                   │
ut = 'USER_WITHOUT_PARENT'    Any other type
    │                   │
    ▼                   ▼
Show blocked message  Show create form
"Account type does    with image uploads
not support this"
                       │
                       ▼
               User fills form + selects images
                       │
              ┌────────┴─────────┐
              │                  │
          Has files           No files
              │                  │
              ▼                  │
    For each file:               │
    1. GET /upload/get-signed-url│
    2. PUT/POST to uploadUrl     │
    3. POST /verify-and-publish  │
    4. Collect relativePath ─────┘
              │
              ▼
    POST /institutes
    { name, code, email, logoUrl, ... }
              │
        ┌─────┴──────┐
        │            │
      201 OK      4xx Error
        │            │
        ▼            ▼
  POST /institute-users/   Show error to user
  institute/:id/            (code conflict,
  assign-user-by-phone      email conflict,
  { instituteUserType:      file not found, etc.)
    'INSTITUTE_ADMIN' }
        │
        ▼
  POST /auth/institutes/:id/select
  → institute-scoped JWT
        │
        ▼
  Redirect to institute
  admin dashboard
```

---

## Key Reminders

1. **`code` field** must be `UPPERCASE_WITH_NUMBERS_AND-HYPHENS` — validate client-side before submit.
2. **Always call `verify-and-publish`** after each file upload. Without this, the file stays private and the URL will not be accessible.
3. **Pass `relativePath`** (not the full `publicUrl`) to `logoUrl`, `imageUrl`, etc. in the create/update institute body. The API stores and returns them appropriately.
4. **Upload files in parallel** using `Promise.all` to speed up the form submission.
5. **Signed URLs expire in 10 minutes** — do not pre-generate them before the user is ready to upload.
6. **Gallery max 10 images** (`ArrayMaxSize(10)`) — enforce this client-side.
7. **Institute creation is `SUPERADMIN`-only** endpoint currently. For non-SUPERADMIN users, a request/approval workflow should be implemented at the application layer, with a SUPERADMIN completing the `POST /institutes` call.
