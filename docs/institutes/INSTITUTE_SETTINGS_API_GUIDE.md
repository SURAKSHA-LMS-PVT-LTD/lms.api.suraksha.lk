# Institute Settings & Profile API — Complete Guide

> **Generated:** March 2026  
> **New Endpoints:** 3 (`GET settings`, `PATCH settings`, `GET profile`)  
> **New DTOs:** 3 (`InstituteSettingsResponseDto`, `InstituteProfileResponseDto`, `UpdateInstituteSettingsDto`)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [API Endpoints](#3-api-endpoints)
   - [3.1 GET settings](#31-get-institutesidsettings)
   - [3.2 PATCH settings](#32-patch-institutesidsettings)
   - [3.3 GET profile](#33-get-institutesidprofile)
   - [3.4 Image Management Endpoints](#34-image-management-endpoints)
4. [Role-Based Access](#4-role-based-access)
5. [Image & File Management](#5-image--file-management)
   - [5.1 How URLs Work](#51-how-urls-work)
   - [5.2 Logo Upload & Replace](#52-logo-upload--replace)
   - [5.3 Loading GIF Upload & Replace](#53-loading-gif-upload--replace)
   - [5.4 Gallery (imageUrls) — Add, Remove, Replace](#54-gallery-imageurls--add-remove-replace)
   - [5.5 Cover Image (imageUrl — Legacy)](#55-cover-image-imageurl--legacy)
   - [5.6 Clearing / Removing an Image](#56-clearing--removing-an-image)
   - [5.7 Delete from Storage vs DB](#57-delete-from-storage-vs-db)
6. [Response DTOs](#6-response-dtos)
7. [Frontend Integration Guide](#7-frontend-integration-guide)
   - [7.1 Settings Page Flow (Institute Admin)](#71-settings-page-flow-institute-admin)
   - [7.2 Gallery Manager Component](#72-gallery-manager-component)
   - [7.3 Logo / GIF Uploader Component](#73-logo--gif-uploader-component)
   - [7.4 Profile Card (All Members)](#74-profile-card-all-members)
   - [7.5 Error Handling](#75-error-handling)

---

## 1. Overview

Three endpoints were added to the `/institutes` controller to support institute management:

| Use Case | Endpoint | Who |
|----------|----------|-----|
| **Admin Settings Page** — Full editable view | `GET /institutes/:id/settings` | Institute Admin, Superadmin |
| **Admin Settings Save** — Update all fields | `PATCH /institutes/:id/settings` | Institute Admin, Superadmin |
| **Member Profile View** — Minimal beautiful card | `GET /institutes/:id/profile` | All institute roles (Teacher, Student, Parent, Attendance Marker) |

### Design Principles

- **Settings endpoint** returns ALL institute data with full storage URLs — for the admin to edit
- **Profile endpoint** returns ONLY identity + branding + social links — for a small card/header any member can see
- **Profile does NOT return:** gallery images (`imageUrls`), loading GIF, system contact info, timestamps, or admin-only fields
- **All image fields in DB** store relative paths (e.g., `institute-images/logo-abc.png`); GET endpoints resolve these to full URLs
- **All image fields in PATCH requests** require relative paths — never send full URLs back to the API
- **No dedicated upload endpoints** for institute images — use the shared `/upload/verify-and-publish` endpoint, then save the relative path via PATCH settings

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Institute Controller  (/institutes)                              │
│                                                                  │
│  Existing:                                                       │
│    POST /                     (SUPERADMIN)  — Create              │
│    GET  /                     (SUPERADMIN)  — List all            │
│    GET  /:id                  (SUPERADMIN)  — Get by ID           │
│    PATCH /:id                 (SUPERADMIN, Admin) — Update        │
│    DELETE /:id                (SUPERADMIN)  — Soft-delete         │
│    PATCH /:id/activate        (Admin)       — Activate            │
│    PATCH /:id/deactivate      (Admin)       — Deactivate          │
│    GET  /:id/classes          (Admin+)      — List classes         │
│                                                                  │
│  NEW:                                                            │
│    GET   /:id/settings        (Admin)  — Full settings view       │
│    PATCH /:id/settings        (Admin)  — Update settings          │
│    GET   /:id/profile         (Any)    — Minimal profile view     │
└─────────────────────────────────────────────────────────────────┘
```

### File Map

| File | Purpose |
|------|---------|
| `dto/institute-settings.dto.ts` | `InstituteSettingsResponseDto` + `InstituteProfileResponseDto` |
| `dto/update-institute-settings.dto.ts` | `UpdateInstituteSettingsDto` — validated input |
| `institute.service.ts` | `getSettings()`, `updateSettings()`, `getProfile()` methods |
| `institute.controller.ts` | 3 new endpoints wired up |

---

## 3. API Endpoints

### 3.1 GET `/institutes/:id/settings`

**Access:** SUPERADMIN, Institute Admin  
**Auth:** `JwtAuthGuard` + `FlexibleAccessGuard`  
**Purpose:** Fetch full institute settings for the admin settings page

**Response:** `InstituteSettingsResponseDto` — all image fields are full URLs

```json
{
  "id": "1",
  "name": "Cambridge International School",
  "shortName": "CIS",
  "code": "CIS001",
  "email": "admin@cambridge.edu",
  "phone": "+94771234567",
  "systemContactEmail": "system@cambridge.lk",
  "systemContactPhoneNumber": "+94771234568",
  "address": "123 Education Street",
  "city": "Colombo",
  "state": "Western",
  "country": "SRI_LANKA",
  "district": "COLOMBO",
  "province": "WESTERN",
  "pinCode": "10100",
  "type": "SCHOOL",
  "logoUrl": "https://storage.googleapis.com/bucket/institute-images/logo-uuid.png",
  "loadingGifUrl": "https://storage.googleapis.com/bucket/institute-images/loading-uuid.gif",
  "primaryColorCode": "#1976D2",
  "secondaryColorCode": "#FFC107",
  "imageUrls": [
    "https://storage.googleapis.com/bucket/institute-images/gallery1-uuid.jpg",
    "https://storage.googleapis.com/bucket/institute-images/gallery2-uuid.jpg"
  ],
  "imageUrl": "https://storage.googleapis.com/bucket/institute-images/cover-uuid.jpg",
  "vision": "To be a leading educational institution...",
  "mission": "To provide quality education...",
  "websiteUrl": "https://cambridge-school.edu",
  "facebookPageUrl": "https://facebook.com/cambridge-school",
  "youtubeChannelUrl": "https://youtube.com/c/cambridge-school",
  "isActive": true,
  "updatedAt": "2026-03-06T10:30:00.000Z"
}
```

> **Note:** `imageUrls` and all `*Url` image fields are resolved to full storage URLs on read. To update them, always send relative paths (see Section 5).

---

### 3.2 PATCH `/institutes/:id/settings`

**Access:** SUPERADMIN, Institute Admin  
**Auth:** `JwtAuthGuard` + `FlexibleAccessGuard`  
**Purpose:** Update any combination of settings fields. All fields are optional — only provided fields are updated (partial update).

**Request Body:** `UpdateInstituteSettingsDto`

```json
{
  "name": "Cambridge International School",
  "shortName": "CIS",
  "email": "admin@cambridge.edu",
  "phone": "+94771234567",
  "systemContactEmail": "system@cambridge.lk",
  "systemContactPhoneNumber": "+94771234568",
  "address": "123 Education Street",
  "city": "Colombo",
  "state": "Western",
  "country": "SRI_LANKA",
  "district": "COLOMBO",
  "province": "WESTERN",
  "pinCode": "10100",
  "type": "SCHOOL",
  "logoUrl": "institute-images/logo-uuid.png",
  "loadingGifUrl": "institute-images/loading-uuid.gif",
  "primaryColorCode": "#1976D2",
  "secondaryColorCode": "#FFC107",
  "imageUrls": [
    "institute-images/gallery1-uuid.jpg",
    "institute-images/gallery2-uuid.jpg"
  ],
  "imageUrl": "institute-images/cover-uuid.jpg",
  "vision": "To be a leading educational institution...",
  "mission": "To provide quality education...",
  "websiteUrl": "https://cambridge-school.edu",
  "facebookPageUrl": "https://facebook.com/cambridge-school",
  "youtubeChannelUrl": "https://youtube.com/c/cambridge-school"
}
```

**Critical Rules:**

| Field Type | Rule | Example |
|-----------|------|---------|
| Image fields (`logoUrl`, `loadingGifUrl`, `imageUrl`, `imageUrls`) | **Relative paths only** — as returned by `/upload/verify-and-publish` | `"institute-images/logo-abc.png"` |
| Link fields (`websiteUrl`, `facebookPageUrl`, `youtubeChannelUrl`) | **Full external URLs** | `"https://facebook.com/school"` |
| `imageUrls` array | **Full array replacement** — max 10 items | Send new complete array |
| `code`, `isDefault`, `isActive` | **NOT editable** via this endpoint | SUPERADMIN-only |
| `email` | Unique check — 409 if taken by another institute | — |
| Send `null` for a field | Clears/removes that field | `"logoUrl": null` |
| Omit a field entirely | That field is unchanged | — |

**Response:** Same as `GET /settings` — returns the full updated settings with all URLs resolved to full storage URLs.

---

### 3.3 GET `/institutes/:id/profile`

**Access:** Any institute role (Teacher, Student, Parent, Attendance Marker, Admin)  
**Auth:** `JwtAuthGuard` + `FlexibleAccessGuard` (read-only mode — parents included)  
**Purpose:** Lightweight institute identity card for all members

**Response:** `InstituteProfileResponseDto`

```json
{
  "id": "1",
  "name": "Cambridge International School",
  "shortName": "CIS",
  "logoUrl": "https://storage.googleapis.com/bucket/institute-images/logo-uuid.png",
  "primaryColorCode": "#1976D2",
  "secondaryColorCode": "#FFC107",
  "phone": "+94771234567",
  "email": "admin@cambridge.edu",
  "city": "Colombo",
  "type": "SCHOOL",
  "websiteUrl": "https://cambridge-school.edu",
  "facebookPageUrl": "https://facebook.com/cambridge-school",
  "youtubeChannelUrl": "https://youtube.com/c/cambridge-school",
  "vision": "To be a leading educational institution...",
  "mission": "To provide quality education..."
}
```

> **Note:** `code` is excluded from this response — it is an enrollment credential. `pinCode` is also excluded.

**What's excluded from profile (vs settings):**

| Field | Why excluded |
|-------|-------------|
| `code` | Enrollment credential — acts like a password for external class join |
| `pinCode` | Sensitive location data — not needed in card view |
| `systemContactEmail`, `systemContactPhoneNumber` | Internal admin data |
| `imageUrls` | Gallery — heavy payload, not needed in card view |
| `imageUrl` | Legacy field — not for general display |
| `loadingGifUrl` | Admin branding asset only |
| `address`, `state`, `country`, `district`, `province` | Not needed for card view |
| `isActive`, `updatedAt` | Admin meta |

---

### 3.4 Image Management Endpoints

Dedicated endpoints for managing institute images. Each returns the **full updated settings** (`InstituteSettingsResponseDto`) so the frontend can sync in one call.

**Access:** SUPERADMIN, Institute Admin on all image endpoints.

#### DELETE `/institutes/:id/logo`

Permanently deletes the logo file from storage and clears `logoUrl`.

```
DELETE /institutes/1/logo
Authorization: Bearer <token>

→ 200: InstituteSettingsResponseDto (logoUrl: null)
```

---

#### DELETE `/institutes/:id/loading-gif`

Permanently deletes the loading GIF from storage and clears `loadingGifUrl`.

```
DELETE /institutes/1/loading-gif
Authorization: Bearer <token>

→ 200: InstituteSettingsResponseDto (loadingGifUrl: null)
```

---

#### DELETE `/institutes/:id/cover-image`

Permanently deletes the cover/banner image from storage and clears `imageUrl`.

```
DELETE /institutes/1/cover-image
Authorization: Bearer <token>

→ 200: InstituteSettingsResponseDto (imageUrl: null)
```

---

#### POST `/institutes/:id/gallery`

Adds a **single image** to the gallery. Upload the file first via `/upload/verify-and-publish`, then send the relative path here.

**Request body:** `AddGalleryImageDto`

```json
{ "relativePath": "institute-images/gallery-abc123.jpg" }
```

**Responses:**

| Status | Meaning |
|--------|---------|
| `200` | Image added — returns updated settings |
| `400` | Gallery full (already 10 images) |
| `403` | No access |
| `404` | Institute not found |

---

#### DELETE `/institutes/:id/gallery/:imageIndex`

Removes a gallery image by its **0-based index** and permanently deletes the file from storage.

```
DELETE /institutes/1/gallery/2
Authorization: Bearer <token>

→ 200: InstituteSettingsResponseDto (imageUrls array without item at index 2)
```

> The response reflects indices recalculated — index 2 is gone, index 3 becomes 2, etc.

**Responses:**

| Status | Meaning |
|--------|---------|
| `200` | Image deleted — returns updated settings |
| `400` | Invalid index (out of range) |
| `403` | No access |
| `404` | Institute not found |

---

## 4. Role-Based Access

| Endpoint | SUPERADMIN | Institute Admin | Teacher | Student | Parent | Att. Marker |
|----------|:----------:|:---------------:|:-------:|:-------:|:------:|:-----------:|
| `GET /:id/settings` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `PATCH /:id/settings` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `DELETE /:id/logo` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `DELETE /:id/loading-gif` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `DELETE /:id/cover-image` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `POST /:id/gallery` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `DELETE /:id/gallery/:index` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /:id/profile` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Security Details

- **JWT required** on all endpoints
- **`InstituteAccessValidator.validateInstituteAccess(user, instituteId)`** validates the caller's JWT `user.i[]` contains the requested `instituteId` — institute admins can only touch their own institute
- Profile endpoint uses `isReadOnly=true` flag so parent-role users (read-only members) can also call it

---

## 5. Image & File Management

### 5.1 How URLs Work

The backend stores **relative paths** in the database and resolves them to full storage URLs on every GET response.

```
Database stores:      institute-images/logo-abc123.png
GET response returns: https://storage.googleapis.com/bucket/institute-images/logo-abc123.png
PATCH accepts:        institute-images/logo-abc123.png   ← always relative path
```

> ⚠️ **Never send the full URL back in a PATCH request.** The API accepts only relative paths for image fields. If you pass a full HTTPS URL, it will be stored as-is and may break URL resolution.

The `CloudStorageService.getFullUrl(relativePath)` method converts relative → full URL automatically on GET. The base URL is configured per environment (`GCS_PUBLIC_BASE_URL` / `AWS_S3_PUBLIC_BASE_URL`).

---

### 5.2 Logo Upload & Replace

The institute logo is stored in `logoUrl` (a single image field).

**Step-by-step flow:**

```
1. Admin selects new logo image in UI
2. Frontend: POST /upload/verify-and-publish  →  { relativePath: "institute-images/logo-uuid.png" }
3. Frontend: PATCH /institutes/:id/settings   →  { "logoUrl": "institute-images/logo-uuid.png" }
4. Backend stores relative path, returns full URL in response
5. Frontend displays: settings.logoUrl (full URL from response)
```

**Example:**

```typescript
// Step 1: Upload file to storage
const formData = new FormData();
formData.append('file', logoFile);
const { relativePath } = await api.post('/upload/verify-and-publish', formData);
// relativePath = "institute-images/logo-a3f8c2d1.png"

// Step 2: Save to settings
const updated = await api.patch(`/institutes/${instituteId}/settings`, {
  logoUrl: relativePath,    // ← relative path, NOT full URL
});

// Step 3: Display the resolved full URL
console.log(updated.logoUrl);
// "https://storage.googleapis.com/bucket/institute-images/logo-a3f8c2d1.png"
```

**To remove the logo** (display no logo):
```json
{ "logoUrl": null }
```

---

### 5.3 Loading GIF Upload & Replace

The loading GIF is displayed during app initialization or section loads. It is stored in `loadingGifUrl`.

same flow as logo:

```
1. Admin selects a GIF/animated image
2. POST /upload/verify-and-publish  →  { relativePath: "institute-images/loading-uuid.gif" }
3. PATCH /institutes/:id/settings   →  { "loadingGifUrl": "institute-images/loading-uuid.gif" }
4. GET settings returns full URL in loadingGifUrl
```

**Example:**

```typescript
const { relativePath } = await api.post('/upload/verify-and-publish', gifFormData);
// relativePath = "institute-images/loading-b7e4a1c9.gif"

await api.patch(`/institutes/${instituteId}/settings`, {
  loadingGifUrl: relativePath,
});
```

> This field is only returned in `GET /settings` (admin view). It is **not** exposed in `GET /profile`.

**To remove the loading GIF:**
```json
{ "loadingGifUrl": null }
```

---

### 5.4 Gallery (imageUrls) — Add, Remove, Replace

`imageUrls` is a JSON array of up to **10** image paths. The entire array is replaced with every PATCH — there are no individual add/remove endpoints.

#### ⚠️ Critical: URL round-trip problem

When you **GET** settings, `imageUrls` contains **full URLs**. When you **PATCH** settings, you must send **relative paths**.

**You can NOT simply send back what GET returned.** You must maintain the relative paths yourself.

**Strategy options:**

| Approach | When to use |
|----------|------------|
| Track relative paths in frontend state from upload response | Best — always have relative paths available |
| Derive relative path from full URL by stripping base URL | Fallback — fragile if base URL changes |
| Store relative paths alongside display URLs in local state | Recommended for settings page with gallery editor |

**Recommended: maintain a parallel `relativeImageUrls` array in component state:**

```typescript
// State structure for gallery manager
const [galleryItems, setGalleryItems] = useState<{
  displayUrl: string;     // Full URL for <img> display  
  relativePath: string;   // Relative path for PATCH API calls
}[]>([]);

// On page load (GET settings)
const settings = await api.get(`/institutes/${instituteId}/settings`);
// settings.imageUrls = ["https://storage.../gallery1.jpg", "https://storage.../gallery2.jpg"]
// But we need relative paths for PATCH!
// ⚠️ At this point we only have full URLs — use the upload-derived paths or derive from URL:
const BASE_URL = import.meta.env.VITE_STORAGE_BASE_URL; // e.g. "https://storage.googleapis.com/bucket"
setGalleryItems(
  (settings.imageUrls ?? []).map(fullUrl => ({
    displayUrl: fullUrl,
    relativePath: fullUrl.replace(BASE_URL + '/', ''),  // strip base prefix
  }))
);
```

---

#### Adding a Single Image to Gallery

```typescript
// 1. Upload the new image
const formData = new FormData();
formData.append('file', newImageFile);
const { relativePath } = await api.post('/upload/verify-and-publish', formData);
// relativePath = "institute-images/gallery-uuid.jpg"

// 2. Update gallery state — append to existing list
setGalleryItems(prev => [
  ...prev,
  { displayUrl: relativePath, relativePath }  // displayUrl will resolve after save
]);

// 3. Save — send ALL relative paths (new + existing)
const updated = await api.patch(`/institutes/${instituteId}/settings`, {
  imageUrls: galleryItems.map(item => item.relativePath),  // all existing + new
});

// 4. Refresh state from response (now has full URLs)
setGalleryItems(
  (updated.imageUrls ?? []).map(fullUrl => ({
    displayUrl: fullUrl,
    relativePath: fullUrl.replace(BASE_URL + '/', ''),
  }))
);
```

---

#### Removing a Single Image from Gallery

There is no `DELETE` endpoint for a single gallery image. Use PATCH with the filtered array:

```typescript
// Remove image at index from gallery
async function removeGalleryImage(indexToRemove: number) {
  const updatedItems = galleryItems.filter((_, i) => i !== indexToRemove);

  const updated = await api.patch(`/institutes/${instituteId}/settings`, {
    imageUrls: updatedItems.map(item => item.relativePath),
  });

  // Sync state with server response
  setGalleryItems(
    (updated.imageUrls ?? []).map(fullUrl => ({
      displayUrl: fullUrl,
      relativePath: fullUrl.replace(BASE_URL + '/', ''),
    }))
  );
}
```

---

#### Replacing Entire Gallery

```typescript
// Upload multiple images, then save all at once
const relativePaths: string[] = [];
for (const file of selectedFiles) {
  const fd = new FormData();
  fd.append('file', file);
  const { relativePath } = await api.post('/upload/verify-and-publish', fd);
  relativePaths.push(relativePath);
}

const updated = await api.patch(`/institutes/${instituteId}/settings`, {
  imageUrls: relativePaths,   // max 10 items
});
```

---

#### Clearing the Entire Gallery

```json
{ "imageUrls": [] }
```

or

```json
{ "imageUrls": null }
```

---

#### Gallery Limits

| Field | Constraint | Value |
|-------|-----------|------|
| Maximum images | `ArrayMaxSize(10)` | 10 |
| Item type | Relative path string | `institute-images/abc.jpg` |
| On gallery shrink | Removed files → permanently deleted from storage | — |
| Default when empty | Returns `[]` | — |

---

### 5.5 Cover Image (imageUrl — Legacy)

`imageUrl` is a single cover/banner image field (legacy — predates the gallery `imageUrls` array). It works identically to `logoUrl`.

```typescript
// Upload cover/banner image
const { relativePath } = await api.post('/upload/verify-and-publish', formData);

// Save
await api.patch(`/institutes/${instituteId}/settings`, {
  imageUrl: relativePath,
});
```

> `imageUrl` is returned in `GET /settings` (admin view) but **not** in `GET /profile`.
> For new implementations, prefer using `imageUrls[]` (the gallery array) for multiple images, or `logoUrl` for the primary identity image.

**To remove the cover image:**
```json
{ "imageUrl": null }
```

---

### 5.6 Clearing / Removing an Image

To **remove/unset** any single image field, send the field with `null`:

```json
{
  "logoUrl": null,
  "loadingGifUrl": null,
  "imageUrl": null
}
```

To clear the entire gallery:
```json
{ "imageUrls": [] }
```

> Omitting a field from the PATCH body leaves it unchanged. You must explicitly send `null` to clear it.

---

### 5.7 Permanent Storage Deletion

When you replace or clear an image field, the **old file is permanently deleted from cloud storage** (GCS/S3) automatically.

**What triggers deletion:**

| Action | What gets deleted from storage |
|--------|--------------------------------|
| Upload new logo → PATCH `logoUrl` | Old logo file |
| Upload new loading GIF → PATCH `loadingGifUrl` | Old GIF file |
| Upload new cover → PATCH `imageUrl` | Old cover file |
| Remove image from gallery array | Only the removed item's file |
| Clear gallery → `imageUrls: []` | All old gallery files |
| Set field to `null` | The file that was stored there |
| Replace with same path | Nothing (no deletion) |

**Implementation:** Deletion happens after the database update succeeds — it is fire-and-forget. If storage deletion fails for any reason (e.g. file already deleted, network error), the DB save is NOT rolled back and a warning is logged. The DB record will still be cleared correctly.

> ⚠️ Deletion is **irreversible**. Do not send a relative path to PATCH unless you have confirmed the new file has uploaded successfully via `/upload/verify-and-publish`.

---

### Summary: All Image Fields

| Field | Type | Who sees it | Max | How to update | Storage on replace/clear |
|-------|------|:-----------:|-----|--------------|-------------------------|
| `logoUrl` | Single image | GET settings ✅, GET profile ✅ | 1 | Upload → PATCH | Old file **permanently deleted** |
| `loadingGifUrl` | Single GIF | GET settings ✅, GET profile ❌ | 1 | Upload → PATCH | Old file **permanently deleted** |
| `imageUrl` | Single image (legacy) | GET settings ✅, GET profile ❌ | 1 | Upload → PATCH | Old file **permanently deleted** |
| `imageUrls` | Image array (gallery) | GET settings ✅, GET profile ❌ | 10 | Upload new + PATCH full array | Removed items **permanently deleted** |

---

## 6. Response DTOs

### InstituteSettingsResponseDto (Full — Admin Only)

| Field | Type | In Profile? | Note |
|-------|------|:-----------:|------|
| `id` | string | ✅ | Institute ID |
| `name` | string | ✅ | Full institute name |
| `shortName` | string? | ✅ | Abbreviation (max 20) |
| `code` | string | ❌ | Unique code — read-only; **excluded from profile** (enrollment credential) |
| `email` | string | ✅ | Contact email — unique checked |
| `phone` | string? | ✅ | Contact phone (max 15) |
| `systemContactEmail` | string? | ❌ | Internal admin email only |
| `systemContactPhoneNumber` | string? | ❌ | Internal admin phone only |
| `address` | string? | ❌ | Street address |
| `city` | string? | ✅ | City |
| `state` | string? | ❌ | State |
| `country` | string? | ❌ | Country (enum) |
| `district` | string? | ❌ | District (enum) |
| `province` | string? | ❌ | Province (enum) |
| `pinCode` | string? | ❌ | Postal code |
| `type` | string? | ✅ | InstituteType enum |
| `logoUrl` | string? | ✅ | Full storage URL |
| `loadingGifUrl` | string? | ❌ | Full storage URL — animation asset |
| `primaryColorCode` | string? | ✅ | Hex `#RRGGBB` |
| `secondaryColorCode` | string? | ✅ | Hex `#RRGGBB` |
| `imageUrls` | string[]? | ❌ | Gallery — full storage URLs |
| `imageUrl` | string? | ❌ | Legacy cover image — full storage URL |
| `vision` | string? | ✅ | Vision statement |
| `mission` | string? | ✅ | Mission statement |
| `websiteUrl` | string? | ✅ | Full external URL |
| `facebookPageUrl` | string? | ✅ | Full external URL |
| `youtubeChannelUrl` | string? | ✅ | Full external URL |
| `isActive` | boolean | ❌ | Active status |
| `updatedAt` | Date | ❌ | Last modified timestamp |

### InstituteProfileResponseDto (Minimal — All Members)

> **Note:** `code` and `pinCode` are intentionally excluded from this response. `code` is an enrollment credential (used for class join / external enrollment) and should not be exposed to every member. `pinCode` is not relevant to a profile card.

| Field | Type | Note |
|-------|------|------|
| `id` | string | Institute ID |
| `name` | string | Full name |
| `shortName` | string? | Abbreviation |
| ~~`code`~~ | — | Excluded — enrollment credential |
| `logoUrl` | string? | Full storage URL |
| `primaryColorCode` | string? | Hex `#RRGGBB` |
| `secondaryColorCode` | string? | Hex `#RRGGBB` |
| `phone` | string? | Contact phone |
| `email` | string | Contact email |
| `city` | string? | City |
| `type` | string? | InstituteType enum |
| `websiteUrl` | string? | Website |
| `facebookPageUrl` | string? | Facebook |
| `youtubeChannelUrl` | string? | YouTube |
| `vision` | string? | Vision |
| `mission` | string? | Mission |

### UpdateInstituteSettingsDto — Validation Reference

All fields optional. Only provided fields are updated.

| Field | Validation | Note |
|-------|-----------|------|
| `name` | max 100 chars | — |
| `shortName` | max 20 chars | — |
| `email` | IsEmail, max 60, unique | 409 if conflict |
| `phone` | max 15 chars | — |
| `systemContactEmail` | IsEmail, max 100 | — |
| `systemContactPhoneNumber` | max 20 chars | — |
| `address` | max 200 chars | — |
| `city` | max 50 chars | — |
| `state` | max 50 chars | — |
| `country` | Enum: Country | — |
| `district` | Enum: District | — |
| `province` | Enum: Province | — |
| `pinCode` | max 10 chars | — |
| `type` | Enum: InstituteType | — |
| `logoUrl` | max 255 chars | Relative path |
| `loadingGifUrl` | max 255 chars | Relative path |
| `imageUrl` | max 255 chars | Relative path (legacy) |
| `imageUrls` | IsArray, IsString[], ArrayMaxSize(10) | Relative paths |
| `primaryColorCode` | Matches `/^#[0-9A-Fa-f]{6}$/` | Hex only |
| `secondaryColorCode` | Matches `/^#[0-9A-Fa-f]{6}$/` | Hex only |
| `vision` | IsString | — |
| `mission` | IsString | — |
| `websiteUrl` | IsUrl, max 255 | Full URL |
| `facebookPageUrl` | IsUrl, max 255 | Full URL |
| `youtubeChannelUrl` | IsUrl, max 255 | Full URL |

---

## 7. Frontend Integration Guide

### 7.1 Settings Page Flow (Institute Admin)

```typescript
// ── On page load ──────────────────────────────────────────────────
const settings = await api.get(`/institutes/${instituteId}/settings`);

// Image fields are already full URLs — use directly for display
// Keep a separate map of relative paths for gallery editing:
const BASE_URL = import.meta.env.VITE_STORAGE_BASE_URL;
const toRelative = (fullUrl: string) => fullUrl.replace(BASE_URL + '/', '');

const form = {
  name: settings.name,
  phone: settings.phone,
  email: settings.email,
  primaryColorCode: settings.primaryColorCode,
  secondaryColorCode: settings.secondaryColorCode,
  vision: settings.vision,
  mission: settings.mission,
  websiteUrl: settings.websiteUrl,
  facebookPageUrl: settings.facebookPageUrl,
  youtubeChannelUrl: settings.youtubeChannelUrl,
  // For display only:
  logoDisplayUrl: settings.logoUrl,
  loadingGifDisplayUrl: settings.loadingGifUrl,
  coverDisplayUrl: settings.imageUrl,
  galleryItems: (settings.imageUrls ?? []).map(url => ({
    displayUrl: url,
    relativePath: toRelative(url),
  })),
};

// ── Save changes ───────────────────────────────────────────────────
async function saveSettings(changedFields: Partial<UpdateSettingsPayload>) {
  const updated = await api.patch(`/institutes/${instituteId}/settings`, changedFields);
  // updated contains full URLs — refresh form state from response
  return updated;
}

// ── Example: update name + phone only ─────────────────────────────
await saveSettings({ name: 'New School Name', phone: '+94771111111' });

// ── Example: save after uploading new logo ─────────────────────────
const { relativePath } = await uploadFile(logoFile);   // POST /upload/verify-and-publish
await saveSettings({ logoUrl: relativePath });

// ── Example: save gallery changes ──────────────────────────────────
await saveSettings({
  imageUrls: form.galleryItems.map(item => item.relativePath),
});
```

---

### 7.2 Gallery Manager Component

> **Use the dedicated endpoints** — no need to manage relative path arrays manually anymore.

```typescript
// Full gallery management using dedicated endpoints

function GalleryManager({ instituteId }) {
  const [items, setItems] = useState<{ displayUrl: string; index: number }[]>([]);
  const [loading, setLoading] = useState(false);

  // Load existing gallery on mount
  useEffect(() => {
    api.get(`/institutes/${instituteId}/settings`).then(settings => {
      setItems(
        (settings.imageUrls ?? []).map((url, i) => ({ displayUrl: url, index: i }))
      );
    });
  }, [instituteId]);

  // Add a single image
  async function addImage(file: File) {
    if (items.length >= 10) {
      alert('Gallery is full — maximum 10 images allowed');
      return;
    }
    setLoading(true);

    // 1. Upload to storage
    const fd = new FormData();
    fd.append('file', file);
    const { relativePath } = await api.post('/upload/verify-and-publish', fd);

    // 2. Add to gallery via dedicated endpoint
    const updated = await api.post(`/institutes/${instituteId}/gallery`, { relativePath });

    // 3. Sync from server response (source of truth)
    setItems((updated.imageUrls ?? []).map((url, i) => ({ displayUrl: url, index: i })));
    setLoading(false);
  }

  // Remove image by its current index
  async function removeImage(imageIndex: number) {
    setLoading(true);
    const updated = await api.delete(`/institutes/${instituteId}/gallery/${imageIndex}`);
    setItems((updated.imageUrls ?? []).map((url, i) => ({ displayUrl: url, index: i })));
    setLoading(false);
  }

  return (
    <div>
      <h3>Gallery ({items.length}/10)</h3>
      <div className="gallery-grid">
        {items.map((item) => (
          <div key={item.index} className="gallery-item">
            <img src={item.displayUrl} alt={`Gallery ${item.index + 1}`} />
            <button onClick={() => removeImage(item.index)} disabled={loading}>Remove</button>
          </div>
        ))}
      </div>
      {items.length < 10 && (
        <input
          type="file"
          accept="image/*"
          onChange={e => e.target.files?.[0] && addImage(e.target.files[0])}
          disabled={loading}
        />
      )}
    </div>
  );
}
```

---

### 7.3 Logo / GIF / Cover Image Uploader

> Use dedicated `DELETE` endpoints to remove images — no need to PATCH with `null`.

```typescript
function ImageFieldUploader({
  instituteId,
  field,            // 'logo' | 'loading-gif' | 'cover-image'
  settingsField,    // 'logoUrl' | 'loadingGifUrl' | 'imageUrl'
  currentDisplayUrl,
  label,
}) {
  const [preview, setPreview] = useState(currentDisplayUrl);
  const [uploading, setUploading] = useState(false);

  // Upload new image: upload to storage, then PATCH settings with relative path
  async function handleFileChange(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const { relativePath } = await api.post('/upload/verify-and-publish', fd);

    const updated = await api.patch(`/institutes/${instituteId}/settings`, {
      [settingsField]: relativePath,    // e.g. { logoUrl: 'institute-images/logo-uuid.png' }
    });
    setPreview(updated[settingsField]);   // full URL from response
    setUploading(false);
  }

  // Delete via dedicated endpoint — no need to PATCH null manually
  async function handleDelete() {
    setUploading(true);
    await api.delete(`/institutes/${instituteId}/${field}`);  // DELETE /:id/logo etc.
    setPreview(null);
    setUploading(false);
  }

  return (
    <div className="image-uploader">
      <label>{label}</label>
      {preview && <img src={preview} alt={label} className="preview" />}
      <input
        type="file"
        accept={field === 'loading-gif' ? 'image/gif,image/*' : 'image/*'}
        onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0])}
        disabled={uploading}
      />
      {preview && (
        <button onClick={handleDelete} disabled={uploading}>Delete</button>
      )}
      {uploading && <span>Uploading...</span>}
    </div>
  );
}

// Usage:
<ImageFieldUploader
  instituteId={id}
  field="logo"
  settingsField="logoUrl"
  currentDisplayUrl={settings.logoUrl}
  label="Institute Logo"
/>
<ImageFieldUploader
  instituteId={id}
  field="loading-gif"
  settingsField="loadingGifUrl"
  currentDisplayUrl={settings.loadingGifUrl}
  label="Loading GIF (animated)"
/>
<ImageFieldUploader
  instituteId={id}
  field="cover-image"
  settingsField="imageUrl"
  currentDisplayUrl={settings.imageUrl}
  label="Cover / Banner Image"
/>
```

---

### 7.4 Profile Card (All Members)

```typescript
// Call once on page load — lightweight, any role can access
const profile = await api.get(`/institutes/${instituteId}/profile`);

// React component
function InstituteProfileCard({ instituteId }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    api.get(`/institutes/${instituteId}/profile`).then(setProfile);
  }, [instituteId]);

  if (!profile) return <Skeleton />;

  return (
    <Card style={{ borderTop: `4px solid ${profile.primaryColorCode}` }}>
      <CardHeader>
        {profile.logoUrl && (
          <Avatar src={profile.logoUrl} alt={profile.name} />
        )}
        <div>
          <h3>{profile.name}</h3>
          <span>{profile.shortName}</span>  {/* code intentionally not shown */}
        </div>
      </CardHeader>
      <CardBody>
        <p>{profile.city} · {profile.type}</p>
        {profile.phone && <a href={`tel:${profile.phone}`}>{profile.phone}</a>}
        {profile.email && <a href={`mailto:${profile.email}`}>{profile.email}</a>}
        {profile.vision && <p className="vision">{profile.vision}</p>}
        {profile.mission && <p className="mission">{profile.mission}</p>}
      </CardBody>
      <CardFooter>
        {profile.websiteUrl && (
          <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer">Website</a>
        )}
        {profile.facebookPageUrl && (
          <a href={profile.facebookPageUrl} target="_blank" rel="noopener noreferrer">Facebook</a>
        )}
        {profile.youtubeChannelUrl && (
          <a href={profile.youtubeChannelUrl} target="_blank" rel="noopener noreferrer">YouTube</a>
        )}
      </CardFooter>
    </Card>
  );
}
```

---

### 7.5 Error Handling

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| `200` | Success | Display/update data |
| `400` | Validation failed (invalid format, max length, bad color hex, bad URL, etc.) | Show field-level errors from `message` array |
| `403` | No access to this institute | Redirect to dashboard |
| `404` | Institute not found | Show "not found" state |
| `409` | Email already taken by another institute | Show "email already in use" error on email field |

**Validation error example:**
```json
{
  "statusCode": 400,
  "message": [
    "primaryColorCode must match /^#[0-9A-Fa-f]{6}$/",
    "imageUrls must contain no more than 10 elements"
  ],
  "error": "Bad Request"
}
```

---

## Appendix: Existing Endpoints (Unchanged)

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| `POST` | `/institutes` | SUPERADMIN | Create institute |
| `GET` | `/institutes` | SUPERADMIN | List all (paginated) |
| `GET` | `/institutes/:id` | SUPERADMIN | Get full details |
| `GET` | `/institutes/code/:code` | SUPERADMIN | Get by code |
| `PATCH` | `/institutes/:id` | SUPERADMIN + Admin | General update |
| `DELETE` | `/institutes/:id` | SUPERADMIN | Soft delete |
| `PATCH` | `/institutes/:id/activate` | Admin | Activate |
| `PATCH` | `/institutes/:id/deactivate` | Admin | Deactivate |
| `GET` | `/institutes/:id/classes` | Admin + Teacher + Student | List classes |
| `PUT` | `/institutes/:id/classes/:cid/teacher/:tid` | Admin | Assign class teacher |
