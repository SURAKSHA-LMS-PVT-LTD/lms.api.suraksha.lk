# Institute Houses — Frontend Implementation Guide

## Overview

Institute Houses are sub-groups within an institute (e.g. Red House, Blue House in a school).

**Who can do what:**

| Action | Role |
|---|---|
| Create / Update / Delete house | Institute Admin |
| Upload house image | Institute Admin |
| Assign / Remove members | Institute Admin |
| Bulk-assign members | Institute Admin |
| List houses | Institute Admin, Teacher, Student |
| Get single house details | Institute Admin |
| View house members | Institute Admin |
| Self-enroll into a house | Any active member |

**Base URL:** All endpoints are prefixed with `/institutes/:instituteId/houses`

**Auth:** All endpoints require `Authorization: Bearer <jwt_token>` header.

---

## 1. House CRUD

### 1.1 Create House

```
POST /institutes/:instituteId/houses
```

**Request body:**

```json
{
  "name": "Red House",
  "color": "#E53935",
  "description": "The champions house.",
  "imageUrl": "house-images/42/1743000000000_red_house.jpg"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | ✅ | Max 100 chars |
| `color` | string | ❌ | Hex code or name, max 30 chars |
| `description` | string | ❌ | Free text |
| `imageUrl` | string | ❌ | Path from signed-upload — see [Image Upload](#5-house-image-upload) |

**Success response `201`:**

```json
{
  "id": "1",
  "instituteId": "42",
  "name": "Red House",
  "color": "#E53935",
  "description": "The champions house.",
  "imageUrl": "https://cdn.example.com/house-images/42/1743000000000_red_house.jpg",
  "isActive": true,
  "createdBy": "99",
  "createdAt": "2026-03-29T10:00:00.000Z",
  "updatedAt": "2026-03-29T10:00:00.000Z"
}
```

**Error responses:**

| Code | Reason |
|---|---|
| `409` | House with this name already exists in the institute |
| `403` | Caller is not an active INSTITUTE_ADMIN |
| `404` | Institute not found |

---

### 1.2 List Houses

```
GET /institutes/:instituteId/houses
```

No request body or query params required.

**Success response `200`:** Array of house objects, each with an extra `memberCount` field.

```json
[
  {
    "id": "1",
    "instituteId": "42",
    "name": "Red House",
    "color": "#E53935",
    "description": "The champions house.",
    "imageUrl": "https://cdn.example.com/...",
    "isActive": true,
    "createdBy": "99",
    "createdAt": "2026-03-29T10:00:00.000Z",
    "updatedAt": "2026-03-29T10:00:00.000Z",
    "memberCount": 25
  },
  {
    "id": "2",
    "instituteId": "42",
    "name": "Blue House",
    "color": "#1E88E5",
    "imageUrl": null,
    "isActive": true,
    "memberCount": 30
  }
]
```

> Results are sorted alphabetically by name. Only **active** houses are returned.

---

### 1.3 Get Single House

```
GET /institutes/:instituteId/houses/:houseId
```

**Success response `200`:** Same shape as create response, plus `memberCount`.

---

### 1.4 Update House

```
PATCH /institutes/:instituteId/houses/:houseId
```

Send only the fields you want to change.

```json
{
  "name": "Red Warriors",
  "color": "#B71C1C",
  "description": "Updated description",
  "isActive": true
}
```

| Field | Type | Notes |
|---|---|---|
| `name` | string | Optional, max 100 chars |
| `color` | string | Optional, max 30 chars |
| `description` | string | Optional |
| `isActive` | boolean | Optional — use `false` to deactivate without deleting |

**Success response `200`:** Updated house object.

---

### 1.5 Delete House (Soft Delete)

```
DELETE /institutes/:instituteId/houses/:houseId
```

This **soft-deletes** the house — sets `isActive = false`. It also:
- Removes all members from the house (sets `isActive = false` on membership rows)
- Clears the `house_id` on all `institute_user` records pointing to this house

```json
{
  "success": true,
  "message": "House \"Red House\" deleted successfully."
}
```

---

## 2. House Image Upload

Uploading a house image follows the **two-step signed-URL upload** pattern used across the platform:

### Step 1 — Get a signed upload URL

```
POST /upload/generate-signed-url
```

```json
{
  "folder": "house-images",
  "fileName": "red_house.jpg",
  "contentType": "image/jpeg"
}
```

Response:

```json
{
  "signedUrl": "https://storage.googleapis.com/bucket/house-images/42/17430000_red_house.jpg?X-Goog-Signature=...",
  "filePath": "house-images/42/17430000_red_house.jpg"
}
```

### Step 2 — Upload file directly to the signed URL

```
PUT <signedUrl>
Content-Type: image/jpeg
Body: <binary file data>
```

### Step 3a — Set image at CREATION time

Include `imageUrl` in [Create House](#11-create-house) body:

```json
{
  "name": "Red House",
  "imageUrl": "house-images/42/17430000_red_house.jpg"
}
```

### Step 3b — Update image on an EXISTING house

```
PUT /institutes/:instituteId/houses/:houseId/image
```

```json
{
  "imageUrl": "house-images/42/17430000001_new_photo.jpg"
}
```

**Success response `200`:** Updated house object with the new full image URL.

---

## 3. Member Management

### 3.1 Assign a Single User

```
POST /institutes/:instituteId/houses/:houseId/members
```

```json
{
  "userId": "123"
}
```

The user must be an **active member** of the institute. Operation is **idempotent** — calling it twice is safe.

**Success response `201`:**

```json
{
  "success": true,
  "message": "User 123 assigned to house \"Red House\"."
}
```

**Error responses:**

| Code | Reason |
|---|---|
| `400` | User is not an active member of this institute |
| `404` | House not found |
| `403` | Caller is not an institute admin |

---

### 3.2 Bulk-Assign Multiple Users

```
POST /institutes/:instituteId/houses/:houseId/members/bulk
```

```json
{
  "userIds": ["101", "102", "103", "104"]
}
```

**Success response `200`:** Partial success is possible — check each result entry.

```json
{
  "success": true,
  "results": [
    { "userId": "101", "status": "assigned" },
    { "userId": "102", "status": "assigned" },
    { "userId": "103", "status": "User 103 is not an active member of this institute." },
    { "userId": "104", "status": "assigned" }
  ]
}
```

> Tip: Show a summary toast: "3 of 4 users assigned successfully."

---

### 3.3 Self-Enroll (User enrolls themselves)

```
POST /institutes/:instituteId/houses/:houseId/enroll
```

No body required. The JWT identifies the user.

**Success response `200`:**

```json
{
  "success": true,
  "message": "Enrolled in house \"Red House\"."
}
```

---

### 3.4 Remove a User from a House

```
DELETE /institutes/:instituteId/houses/:houseId/members/:userId
```

**Success response `200`:**

```json
{
  "success": true,
  "message": "User 123 removed from house."
}
```

---

### 3.5 Get House Members

```
GET /institutes/:instituteId/houses/:houseId/members
```

**Query params (all optional):**

| Param | Type | Default | Description |
|---|---|---|---|
| `isActive` | boolean | `true` | Filter by active status |
| `enrollmentMethod` | string | — | `manual` \| `auto` \| `self` |

**Example:**
```
GET /institutes/42/houses/1/members?isActive=true&enrollmentMethod=auto
```

**Success response `200`:**

```json
[
  {
    "id": "10",
    "houseId": "1",
    "userId": "123",
    "firstName": "Kasun",
    "lastName": "Perera",
    "nameWithInitials": "K.B. Perera",
    "email": "kasun@example.com",
    "phoneNumber": "+94771234567",
    "instituteUserType": "STUDENT",
    "enrollmentMethod": "auto",
    "isActive": true,
    "createdAt": "2026-03-29T10:00:00.000Z"
  }
]
```

**`enrollmentMethod` values:**

| Value | Meaning |
|---|---|
| `manual` | Admin assigned the user |
| `auto` | Auto-enrolled at user creation (`houseId` provided in create-user API) |
| `self` | User self-enrolled |

---

## 4. Auto-Enroll at User Creation

When creating an institute user via `POST /institutes/:instituteId/users`, pass the optional `houseId` field. The user will be **automatically enrolled** in the house within the same database transaction.

**Full example:**

```json
{
  "firstName": "Kasun",
  "lastName": "Perera",
  "email": "kasun@example.com",
  "instituteUserType": "STUDENT",
  "houseId": "1",
  "classEnrollments": [
    { "classId": "201" }
  ]
}
```

**Response** includes house enrollment result:

```json
{
  "success": true,
  "message": "STUDENT created and enrolled in Royal College",
  "userId": "500",
  "firstName": "Kasun",
  "lastName": "Perera",
  "instituteUserType": "STUDENT",
  "houseId": "1",
  "houseEnrolled": true,
  ...
}
```

> If the `houseId` is invalid or inactive, the **entire user creation will fail** (transaction rollback). Validate the house exists before submitting.

**Recommended UX:** In the "Create User" form, show a dropdown of available houses (fetched from `GET /institutes/:instituteId/houses`). The selection is optional — leave empty to skip house enrollment.

---

## 5. Frontend UI Recommendations

### House Management Page (Admin)

```
/institutes/:instituteId/settings/houses
```

**List view:**
- Show house cards with name, colour badge, image, and member count
- "Create House" button → modal/drawer with name, colour picker, description, image upload
- Each card: Edit (pencil icon), Delete (trash icon with confirmation dialog)

**House detail page:**
```
/institutes/:instituteId/houses/:houseId
```
- House header: image, name, colour, description
- Members table with search/filter
- "Assign Member" button → user search + assign
- "Bulk Assign" button → multi-select user list + submit
- Per-row "Remove" button

---

### House Selector in Create User Form

```tsx
// Pseudo-code
const [houses, setHouses] = useState([]);

useEffect(() => {
  fetch(`/institutes/${instituteId}/houses`, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.json())
    .then(setHouses);
}, [instituteId]);

// In the form
<Select
  label="Assign to House (optional)"
  options={houses.map(h => ({ value: h.id, label: h.name, color: h.color }))}
  onChange={val => setFieldValue('houseId', val)}
  clearable
/>
```

---

### House Colour Chips

Use `house.color` as a background for badge chips. Fall back to a neutral grey if `color` is null.

```tsx
<span
  style={{
    background: house.color ?? '#9E9E9E',
    color: '#fff',
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
  }}
>
  {house.name}
</span>
```

---

## 6. Error Handling Reference

| HTTP Status | Meaning | Suggested UI Action |
|---|---|---|
| `201` | Created | Show success toast |
| `200` | OK | Refresh data |
| `400` | Bad request / validation | Show field-level error from `message` |
| `403` | Forbidden | Show "You don't have permission" |
| `404` | House / Institute not found | Redirect to list |
| `409` | Duplicate house name | Highlight name field: "A house with this name already exists" |
| `401` | Unauthorized (JWT expired) | Redirect to login |

---

## 7. TypeScript Types

```ts
export interface InstituteHouse {
  id: string;
  instituteId: string;
  name: string;
  color?: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  memberCount?: number;
}

export type HouseEnrollmentMethod = 'manual' | 'auto' | 'self';

export interface HouseMember {
  id: string;
  houseId: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  nameWithInitials?: string;
  email?: string;
  phoneNumber?: string;
  instituteUserType?: string;
  enrollmentMethod: HouseEnrollmentMethod;
  isActive: boolean;
  createdAt: string;
}

export interface HouseActionResponse {
  success: boolean;
  message: string;
}

// Create / Update DTOs
export interface CreateInstituteHousePayload {
  name: string;
  color?: string;
  description?: string;
  imageUrl?: string;
}

export interface UpdateInstituteHousePayload {
  name?: string;
  color?: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateInstituteHouseImagePayload {
  imageUrl: string;
}

export interface AssignUserToHousePayload {
  userId: string;
}

export interface BulkAssignUsersToHousePayload {
  userIds: string[];
}
```
