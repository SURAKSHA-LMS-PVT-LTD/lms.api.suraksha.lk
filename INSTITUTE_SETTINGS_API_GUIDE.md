# Institute Settings & Profile API — Complete Guide

> **Generated:** March 2026  
> **New Endpoints:** 3 (`GET settings`, `PATCH settings`, `GET profile`)  
> **New DTOs:** 3 (`InstituteSettingsResponseDto`, `InstituteProfileResponseDto`, `UpdateInstituteSettingsDto`)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [API Endpoints](#3-api-endpoints)
4. [Role-Based Access](#4-role-based-access)
5. [S3 Image/Upload Flow](#5-s3-imageupload-flow)
6. [Response DTOs](#6-response-dtos)
7. [Frontend Integration Guide](#7-frontend-integration-guide)

---

## 1. Overview

Three new endpoints were added to the existing `/institutes` controller to support:

| Use Case | Endpoint | Who |
|----------|----------|-----|
| **Admin Settings Page** — Full editable view | `GET /institutes/:id/settings` | Institute Admin, Superadmin |
| **Admin Settings Save** — Update all fields | `PATCH /institutes/:id/settings` | Institute Admin, Superadmin |
| **Member Profile View** — Minimal beautiful card | `GET /institutes/:id/profile` | All institute roles (Teacher, Student, Parent, Attendance Marker) |

### Design Principles

- **Settings endpoint** returns ALL institute data (contact, branding, social media, gallery, etc.) with full S3 URLs — for the admin to edit
- **Profile endpoint** returns ONLY identity + branding + social links — for a small, beautiful card/header that any member can see
- **Profile does NOT return:** gallery images (`imageUrls`), loading GIF, system contact info, timestamps, admin-only fields
- **All image fields** use S3 relative paths for storage and return full S3 URLs in responses

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
**Purpose:** Fetch full institute settings for the admin settings page

**Response:** `InstituteSettingsResponseDto`

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
    "https://storage.googleapis.com/bucket/institute-images/img1.jpg",
    "https://storage.googleapis.com/bucket/institute-images/img2.jpg"
  ],
  "imageUrl": "https://storage.googleapis.com/bucket/institute-images/main.jpg",
  "vision": "To be a leading educational institution...",
  "mission": "To provide quality education...",
  "websiteUrl": "https://cambridge-school.edu",
  "facebookPageUrl": "https://facebook.com/cambridge-school",
  "youtubeChannelUrl": "https://youtube.com/c/cambridge-school",
  "isActive": true,
  "updatedAt": "2026-03-06T10:30:00.000Z"
}
```

### 3.2 PATCH `/institutes/:id/settings`

**Access:** SUPERADMIN, Institute Admin  
**Purpose:** Update institute settings from the admin page

**Request Body:** `UpdateInstituteSettingsDto` — all fields optional

```json
{
  "name": "Cambridge International School - Updated",
  "phone": "+94771111111",
  "logoUrl": "institute-images/new-logo-uuid.png",
  "primaryColorCode": "#2196F3",
  "facebookPageUrl": "https://facebook.com/cambridge-new",
  "vision": "Updated vision statement...",
  "imageUrls": [
    "institute-images/gallery1-uuid.jpg",
    "institute-images/gallery2-uuid.png"
  ]
}
```

**Important:**
- `logoUrl`, `loadingGifUrl`, `imageUrl`, `imageUrls` accept **S3 relative paths** (as returned by `/upload/verify-and-publish`)
- `websiteUrl`, `facebookPageUrl`, `youtubeChannelUrl` accept **full external URLs**
- `code`, `isDefault`, `isActive` are **NOT editable** via this endpoint (SUPERADMIN-only operations)
- Email uniqueness is validated — returns `409 Conflict` if taken

**Response:** Same as `GET /settings` — returns the full updated settings with resolved S3 URLs.

### 3.3 GET `/institutes/:id/profile`

**Access:** Any institute role (Teacher, Student, Parent, Attendance Marker, Admin)  
**Purpose:** Lightweight institute identity card for all members

**Response:** `InstituteProfileResponseDto`

```json
{
  "id": "1",
  "name": "Cambridge International School",
  "shortName": "CIS",
  "code": "CIS001",
  "logoUrl": "https://storage.googleapis.com/bucket/institute-images/logo.png",
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

**What's excluded from profile (vs settings):**
- `systemContactEmail`, `systemContactPhoneNumber` — internal admin data
- `imageUrls` — gallery array (heavy payload)
- `loadingGifUrl` — admin branding only
- `imageUrl` — legacy field
- `address`, `state`, `country`, `district`, `province`, `pinCode` — not needed for card view
- `isActive`, `updatedAt` — admin meta

---

## 4. Role-Based Access

| Endpoint | SUPERADMIN | Institute Admin | Teacher | Student | Parent | Att. Marker |
|----------|:----------:|:---------------:|:-------:|:-------:|:------:|:-----------:|
| `GET /:id/settings` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `PATCH /:id/settings` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /:id/profile` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Security

- **JWT required** on all endpoints
- **InstituteAccessValidator** validates the caller's JWT `user.i[]` contains the requested `instituteId`
- Institute admins can only access settings for **their own** institute
- Profile uses `isReadOnly=true` so parents can also access

---

## 5. S3 Image/Upload Flow

### Upload Flow (Frontend → Backend)

```
1. Frontend uploads file to /upload/verify-and-publish
2. Backend returns S3 relative path: "institute-images/logo-abc123.png"
3. Frontend sends relative path in PATCH /institutes/:id/settings:
   { "logoUrl": "institute-images/logo-abc123.png" }
4. Backend stores the relative path in DB
5. GET endpoints return full S3 URL: "https://storage.googleapis.com/bucket/institute-images/logo-abc123.png"
```

### Editable Image Fields

| Field | Description | Max Size | Format |
|-------|-------------|----------|--------|
| `logoUrl` | Institute logo | — | S3 relative path |
| `loadingGifUrl` | Custom loading animation | — | S3 relative path |
| `imageUrl` | Single main image (legacy) | — | S3 relative path |
| `imageUrls` | Gallery images array | 10 items | Array of S3 relative paths |

### Editable URL Fields (external)

| Field | Description | Validation |
|-------|-------------|------------|
| `websiteUrl` | Institute website | Must be valid URL |
| `facebookPageUrl` | Facebook page | Must be valid URL |
| `youtubeChannelUrl` | YouTube channel | Must be valid URL |

---

## 6. Response DTOs

### InstituteSettingsResponseDto (Full — Admin Only)

| Field | Type | In Profile? | Description |
|-------|------|:-----------:|-------------|
| `id` | string | ✅ | Institute ID |
| `name` | string | ✅ | Full name |
| `shortName` | string? | ✅ | Abbreviation |
| `code` | string | ✅ | Unique code |
| `email` | string | ✅ | Contact email |
| `phone` | string? | ✅ | Contact phone |
| `systemContactEmail` | string? | ❌ | Internal admin email |
| `systemContactPhoneNumber` | string? | ❌ | Internal admin phone |
| `address` | string? | ❌ | Street address |
| `city` | string? | ✅ | City |
| `state` | string? | ❌ | State |
| `country` | string? | ❌ | Country |
| `district` | string? | ❌ | District |
| `province` | string? | ❌ | Province |
| `pinCode` | string? | ❌ | Postal code |
| `type` | string? | ✅ | SCHOOL/COLLEGE/etc |
| `logoUrl` | string? | ✅ | Full S3 URL |
| `loadingGifUrl` | string? | ❌ | Full S3 URL |
| `primaryColorCode` | string? | ✅ | Hex color |
| `secondaryColorCode` | string? | ✅ | Hex color |
| `imageUrls` | string[]? | ❌ | Full S3 URLs |
| `imageUrl` | string? | ❌ | Full S3 URL (legacy) |
| `vision` | string? | ✅ | Vision statement |
| `mission` | string? | ✅ | Mission statement |
| `websiteUrl` | string? | ✅ | Website |
| `facebookPageUrl` | string? | ✅ | Facebook |
| `youtubeChannelUrl` | string? | ✅ | YouTube |
| `isActive` | boolean | ❌ | Active status |
| `updatedAt` | Date | ❌ | Last modified |

### UpdateInstituteSettingsDto (Input Validation)

All fields optional. Key validations:

| Field | Validation |
|-------|-----------|
| `name` | max 100 chars |
| `email` | valid email, max 60, unique checked |
| `phone` | max 15 chars |
| `primaryColorCode` | Regex `/^#[0-9A-Fa-f]{6}$/` |
| `secondaryColorCode` | Regex `/^#[0-9A-Fa-f]{6}$/` |
| `imageUrls` | Array of strings, max 10 items |
| `websiteUrl` | Valid URL, max 255 |
| `facebookPageUrl` | Valid URL, max 255 |
| `youtubeChannelUrl` | Valid URL, max 255 |
| `country` | Enum: Country |
| `district` | Enum: District |
| `province` | Enum: Province |
| `type` | Enum: InstituteType |

---

## 7. Frontend Integration Guide

### Settings Page (Institute Admin)

```typescript
// Load settings for editing
const settings = await api.get(`/institutes/${instituteId}/settings`);
// settings.logoUrl is already a full S3 URL for display

// Upload new logo
const { relativePath } = await api.post('/upload/verify-and-publish', logoFile);
// relativePath = "institute-images/logo-abc123.png"

// Save settings
const updated = await api.patch(`/institutes/${instituteId}/settings`, {
  name: 'Updated School Name',
  logoUrl: relativePath,         // S3 relative path
  primaryColorCode: '#2196F3',
  facebookPageUrl: 'https://facebook.com/school',  // full URL
  vision: 'New vision...',
  imageUrls: [                   // S3 relative paths
    'institute-images/gallery1.jpg',
    'institute-images/gallery2.jpg'
  ]
});
// updated.logoUrl is now the full S3 URL
```

### Profile Card (Teacher / Student / Parent)

```typescript
// Load minimal profile for display
const profile = await api.get(`/institutes/${instituteId}/profile`);

// Use in a card component:
// profile.name         → "Cambridge International School"
// profile.logoUrl      → full S3 URL for <img>
// profile.primaryColorCode → "#1976D2" for theming
// profile.phone        → "+94771234567"
// profile.email        → "admin@cambridge.edu"
// profile.websiteUrl   → clickable link
// profile.facebookPageUrl → social icon link
// profile.youtubeChannelUrl → social icon link
// profile.city         → "Colombo"
// profile.vision       → display text
// profile.mission      → display text
```

### Example: React Profile Card

```tsx
function InstituteProfileCard({ instituteId }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    api.get(`/institutes/${instituteId}/profile`).then(setProfile);
  }, [instituteId]);

  if (!profile) return <Skeleton />;

  return (
    <Card style={{ borderTop: `4px solid ${profile.primaryColorCode}` }}>
      <CardHeader>
        {profile.logoUrl && <Avatar src={profile.logoUrl} />}
        <div>
          <h3>{profile.name}</h3>
          <span>{profile.shortName} • {profile.code}</span>
        </div>
      </CardHeader>
      <CardBody>
        <p>{profile.city} • {profile.type}</p>
        {profile.phone && <a href={`tel:${profile.phone}`}>{profile.phone}</a>}
        {profile.email && <a href={`mailto:${profile.email}`}>{profile.email}</a>}
      </CardBody>
      <CardFooter>
        {profile.websiteUrl && <IconLink icon="web" href={profile.websiteUrl} />}
        {profile.facebookPageUrl && <IconLink icon="facebook" href={profile.facebookPageUrl} />}
        {profile.youtubeChannelUrl && <IconLink icon="youtube" href={profile.youtubeChannelUrl} />}
      </CardFooter>
    </Card>
  );
}
```

### Error Handling

| Status | Meaning | Action |
|--------|---------|--------|
| `200` | Success | Display/update data |
| `400` | Invalid input (validation) | Show field-level errors |
| `403` | No access to this institute | Redirect to dashboard |
| `404` | Institute not found | Show "not found" state |
| `409` | Email conflict (settings save) | Show "email taken" error on email field |

---

## Appendix: Existing Endpoints (Unchanged)

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| `POST /institutes` | SUPERADMIN | Create institute |
| `GET /institutes` | SUPERADMIN | List all (paginated) |
| `GET /institutes/:id` | SUPERADMIN | Get full details |
| `GET /institutes/code/:code` | SUPERADMIN | Get by code |
| `PATCH /institutes/:id` | SUPERADMIN + Admin | General update |
| `DELETE /institutes/:id` | SUPERADMIN | Soft delete |
| `PATCH /institutes/:id/activate` | Admin | Activate |
| `PATCH /institutes/:id/deactivate` | Admin | Deactivate |
| `GET /institutes/:id/classes` | Admin + Teacher + Student | List classes |
| `PUT /institutes/:id/classes/:cid/teacher/:tid` | Admin | Assign class teacher |
