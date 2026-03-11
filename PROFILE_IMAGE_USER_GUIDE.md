# Profile Image Upload & Verification – User Guide

Complete frontend implementation guide for the profile-image lifecycle:
upload → admin verification → display → change (max 3 lifetime changes).

---

## Table of Contents

1. [How It Works – Overview](#1-how-it-works--overview)
2. [Key Rules](#2-key-rules)
3. [First-Time Image Upload](#3-first-time-image-upload)
4. [Image Verification Status](#4-image-verification-status)
5. [Changing Your Profile Image (Max 3 Times)](#5-changing-your-profile-image-max-3-times)
6. [Viewing Image History / Previous Images](#6-viewing-image-history--previous-images)
7. [Re-Upload After Rejection](#7-re-upload-after-rejection)
8. [How the Image Appears in Your Profile](#8-how-the-image-appears-in-your-profile)
9. [API Reference – All Endpoints](#9-api-reference--all-endpoints)
10. [Complete Frontend Flow (TypeScript)](#10-complete-frontend-flow-typescript)
11. [Error Reference](#11-error-reference)
12. [New Entities & Migrations Required](#12-new-entities--migrations-required)

---

## 1. How It Works – Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│   USER UPLOADS IMAGE                                                │
│     1. Get signed upload URL                                        │
│     2. Upload file to cloud storage                                 │
│     3. Submit image URL to backend                                  │
│                           ↓                                         │
│   STATUS = PENDING  (image stored but NOT shown on profile)         │
│                           ↓                                         │
│   SYSTEM ADMIN REVIEWS                                              │
│     ├─ APPROVE  → imageUrl written to user table                    │
│     │             image now visible on profile                      │
│     │             ID card generated (if applicable)                 │
│     │                                                               │
│     └─ REJECT   → image deleted from storage                       │
│                   rejection email with re-upload link sent          │
│                   user can re-upload (same change slot)             │
│                                                                     │
│   IMAGE CHANGE  (authenticated user, max 3 lifetime changes)        │
│     1. New image uploaded → PENDING                                 │
│     2. Previous VERIFIED image stays visible until new one approved │
│     3. On approval → new image replaces old on profile              │
│     4. Old image kept in history log                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Key Rules

| Rule | Detail |
|------|--------|
| **Lifetime change limit** | Each user can change their profile image **3 times** total (first upload is free, changes 1–3 after that) |
| **Rate limit** | Max 5 image submissions per 15 minutes |
| **Re-upload rate limit** | Max 10 re-uploads per hour (public endpoint) |
| **Pending = hidden** | An image with status `PENDING` is **never** shown on the user's public profile |
| **Previous image survives** | When changing an image, the last `VERIFIED` image continues to display until the new one is approved |
| **Rejection = free retry** | A rejected upload does **not** consume a change slot |
| **File size** | Max 5 MB |
| **Allowed types** | `image/jpeg`, `image/png`, `image/webp` |
| **History visible** | Users can view all their previous images (with status and timestamps) |

---

## 3. First-Time Image Upload

This is the flow when a user uploads a profile image for the very first time (e.g., during first login or profile completion).

### Step 1 – Get Signed Upload URL

```
POST /upload/generate-signed-url
Authorization: Bearer <jwt>
```

```json
{
  "folder": "profile-images",
  "fileName": "my-photo.jpg",
  "contentType": "image/jpeg",
  "fileSize": 204800
}
```

**Response `201`:**
```json
{
  "uploadUrl": "https://storage.googleapis.com/bucket/profile-images/...?X-Goog-Signature=...",
  "relativePath": "profile-images/user-42/1709530000_my-photo.jpg",
  "expiresAt": "2026-03-11T06:10:00.000Z",
  "maxFileSize": 5242880,
  "contentType": "image/jpeg"
}
```

### Step 2 – Upload File Directly to Cloud Storage

```javascript
// GCS signed PUT
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'image/jpeg' },
  body: file,   // File or Blob
});
```

### Step 3 – Submit Image URL to Backend

```
POST /users/:userId/profile-image
Authorization: Bearer <jwt>
```

```json
{
  "imageUrl": "https://storage.googleapis.com/bucket/profile-images/user-42/1709530000_my-photo.jpg"
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Profile image updated successfully",
  "data": {
    "userId": "42",
    "imageUrl": "https://storage.googleapis.com/bucket/profile-images/user-42/1709530000_my-photo.jpg"
  }
}
```

> After this call the image status is automatically `PENDING`. It will **not** appear on the profile until an admin verifies it.

---

## 4. Image Verification Status

| Status | Meaning | Image Visible on Profile? |
|--------|---------|--------------------------|
| `PENDING` | Uploaded, awaiting admin review | **No** – placeholder/previous image shown |
| `VERIFIED` | Admin approved | **Yes** – written to `users.image_url` |
| `REJECTED` | Admin rejected; reason provided | **No** – previous verified image shown (or placeholder) |

### Checking Your Image Status

```
GET /users/profile/image-status
Authorization: Bearer <jwt>
```

**Response `200`:**
```json
{
  "currentVerifiedImage": "https://storage.googleapis.com/.../verified-photo.jpg",
  "pendingImage": {
    "imageUrl": "https://storage.googleapis.com/.../new-upload.jpg",
    "status": "PENDING",
    "uploadedAt": "2026-03-11T05:00:00.000Z"
  },
  "imageChangesUsed": 1,
  "imageChangesRemaining": 2,
  "maxImageChanges": 3
}
```

| Field | Description |
|-------|-------------|
| `currentVerifiedImage` | The image currently shown on profile (last VERIFIED) |
| `pendingImage` | If not `null`, a new image is awaiting review |
| `imageChangesUsed` | How many of the 3 allowed changes have been used |
| `imageChangesRemaining` | Remaining change slots |
| `maxImageChanges` | Always `3` |

---

## 5. Changing Your Profile Image (Max 3 Times)

After the initial upload, users are allowed **3 additional image changes** in their lifetime.

### Pre-Check: Can I Change?

Before showing the "Change Image" button, query the status endpoint:

```javascript
const status = await fetch(`${BASE}/users/profile/image-status`, {
  headers: { Authorization: `Bearer ${jwt}` },
}).then(r => r.json());

const canChange = status.imageChangesRemaining > 0 && !status.pendingImage;
```

**Disable the button when:**
- `imageChangesRemaining === 0` → Show "You have used all 3 image changes"
- `pendingImage !== null` → Show "Your new image is being reviewed"

### Submit a Change

Same endpoints as [first-time upload](#3-first-time-image-upload):

1. `POST /upload/generate-signed-url` → get upload URL
2. `PUT` file to cloud storage
3. `POST /users/:userId/profile-image` → submit

The backend will:
- Verify the user has remaining change slots
- Move the current verified image to the history log
- Store the new image with status `PENDING`
- Increment the change counter
- Continue displaying the previous verified image until the new one is approved

**Response `200`:**
```json
{
  "success": true,
  "message": "Profile image updated successfully. Previous image will remain visible until the new one is verified.",
  "data": {
    "userId": "42",
    "imageUrl": "https://storage.googleapis.com/bucket/profile-images/...",
    "previousImagePreserved": true,
    "changesRemaining": 1
  }
}
```

**Error `400` – No changes remaining:**
```json
{
  "statusCode": 400,
  "message": "You have reached the maximum number of profile image changes (3). Contact support if you need assistance.",
  "error": "BadRequest"
}
```

**Error `400` – Pending image exists:**
```json
{
  "statusCode": 400,
  "message": "You already have an image pending verification. Please wait for admin review before uploading a new image.",
  "error": "BadRequest"
}
```

---

## 6. Viewing Image History / Previous Images

Users can view a log of all their previous profile images.

```
GET /users/profile/image-history
Authorization: Bearer <jwt>
```

**Response `200`:**
```json
{
  "history": [
    {
      "id": "3",
      "imageUrl": "https://storage.googleapis.com/.../photo-v3.jpg",
      "status": "PENDING",
      "changeNumber": 3,
      "uploadedAt": "2026-03-10T08:00:00.000Z",
      "verifiedAt": null,
      "rejectionReason": null,
      "isCurrent": false
    },
    {
      "id": "2",
      "imageUrl": "https://storage.googleapis.com/.../photo-v2.jpg",
      "status": "VERIFIED",
      "changeNumber": 2,
      "uploadedAt": "2026-02-15T10:30:00.000Z",
      "verifiedAt": "2026-02-15T11:00:00.000Z",
      "rejectionReason": null,
      "isCurrent": true
    },
    {
      "id": "1",
      "imageUrl": "https://storage.googleapis.com/.../photo-v1.jpg",
      "status": "VERIFIED",
      "changeNumber": 1,
      "uploadedAt": "2026-01-05T09:00:00.000Z",
      "verifiedAt": "2026-01-05T09:15:00.000Z",
      "rejectionReason": null,
      "isCurrent": false
    },
    {
      "id": "0",
      "imageUrl": "https://storage.googleapis.com/.../initial-photo.jpg",
      "status": "VERIFIED",
      "changeNumber": 0,
      "uploadedAt": "2025-12-01T08:00:00.000Z",
      "verifiedAt": "2025-12-01T08:10:00.000Z",
      "rejectionReason": null,
      "isCurrent": false
    }
  ],
  "totalChanges": 3,
  "maxChanges": 3
}
```

| Field | Description |
|-------|-------------|
| `changeNumber` | `0` = initial upload, `1–3` = changes |
| `isCurrent` | `true` for the image currently displayed on the profile |
| `status` | PENDING / VERIFIED / REJECTED |

> **Note:** Rejected images will have `imageUrl` set to `null` (image deleted from storage) but the log entry is preserved with the rejection reason.

---

## 7. Re-Upload After Rejection

When an admin rejects your image, you receive an email with:
- The rejection reason
- A special re-upload link valid for **7 days**

### From the Email Link

The link opens a page like:
```
https://app.suraksha.lk/profile/image/reupload?token=<base64url-token>
```

### Re-Upload Flow (Public – No Login Required)

**Step 1 – Decode token to show user info:**
```javascript
// Token is base64url encoded JSON
const payload = JSON.parse(atob(token));
// payload = { userId, purpose: "profile-image-reupload", exp: 1741824000000 }
```

**Step 2 – Get signed upload URL using token:**
```
POST /users/profile/image/reupload/generate-url
```
```json
{
  "token": "<base64url-token>",
  "fileName": "new-photo.jpg",
  "contentType": "image/jpeg",
  "fileSize": 204800
}
```

**Step 3 – Upload to cloud storage** (same as normal flow)

**Step 4 – Submit re-upload:**
```
POST /users/profile/image/reupload
```
```json
{
  "token": "<base64url-token>",
  "imageUrl": "https://storage.googleapis.com/bucket/profile-images/user-42/..."
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Profile image uploaded successfully. It will be reviewed by our team.",
  "data": {
    "userId": "42",
    "imageUrl": "https://storage.googleapis.com/...",
    "status": "PENDING"
  }
}
```

> A re-upload after rejection does **not** count as a change. The same change slot is reused.

---

## 8. How the Image Appears in Your Profile

### Display Logic for Frontend

```typescript
function getDisplayImage(user: UserProfile): string | null {
  // Rule 1: Only show VERIFIED images on profile
  if (user.imageVerificationStatus === 'VERIFIED' && user.imageUrl) {
    return user.imageUrl;
  }

  // Rule 2: If pending/rejected, check history for last verified
  if (user.lastVerifiedImageUrl) {
    return user.lastVerifiedImageUrl;
  }

  // Rule 3: No verified image exists → show placeholder
  return null;
}

function getImageBadge(user: UserProfile): string | null {
  switch (user.imageVerificationStatus) {
    case 'PENDING':
      return '⏳ New image under review';
    case 'REJECTED':
      return '❌ Image rejected – check email for details';
    case 'VERIFIED':
      return null; // No badge needed
    default:
      return null;
  }
}
```

### Profile Card Display Rules

| Scenario | Profile Image Shown | Badge/Status |
|----------|-------------------|--------------|
| No image uploaded | Placeholder avatar | "Upload your photo" |
| First upload, PENDING | Placeholder avatar | "Under review" |
| First upload, VERIFIED | Verified image | None |
| First upload, REJECTED | Placeholder avatar | "Rejected – re-upload" |
| Change submitted, PENDING | Previous verified image | "New image under review" |
| Change submitted, VERIFIED | New verified image | None |
| Change submitted, REJECTED | Previous verified image | "New image rejected" |

---

## 9. API Reference – All Endpoints

### Existing Endpoints (Already Implemented)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/upload/generate-signed-url` | JWT | Get signed upload URL |
| `POST` | `/users/:userId/profile-image` | JWT | Submit profile image |
| `POST` | `/users/profile/image/reupload` | Token | Re-upload after rejection (public) |

### New Endpoints (To Be Implemented)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users/profile/image-status` | JWT | Get current image status + change count |
| `GET` | `/users/profile/image-history` | JWT | Get all previous images with statuses |
| `POST` | `/users/profile/image/reupload/generate-url` | Token | Get upload URL for re-upload flow |

---

## 10. Complete Frontend Flow (TypeScript)

### Upload / Change Profile Image

```typescript
const BASE = 'https://your-api.com';

interface ImageStatus {
  currentVerifiedImage: string | null;
  pendingImage: { imageUrl: string; status: string; uploadedAt: string } | null;
  imageChangesUsed: number;
  imageChangesRemaining: number;
  maxImageChanges: number;
}

interface ImageHistoryEntry {
  id: string;
  imageUrl: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  changeNumber: number;
  uploadedAt: string;
  verifiedAt: string | null;
  rejectionReason: string | null;
  isCurrent: boolean;
}

// ─── CHECK STATUS ───────────────────────────
async function getImageStatus(jwt: string): Promise<ImageStatus> {
  const res = await fetch(`${BASE}/users/profile/image-status`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return res.json();
}

// ─── GET HISTORY ────────────────────────────
async function getImageHistory(jwt: string): Promise<{ history: ImageHistoryEntry[]; totalChanges: number; maxChanges: number }> {
  const res = await fetch(`${BASE}/users/profile/image-history`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return res.json();
}

// ─── UPLOAD NEW IMAGE ───────────────────────
async function uploadProfileImage(jwt: string, userId: string, file: File) {
  // 1. Check if user CAN change
  const status = await getImageStatus(jwt);
  if (status.pendingImage) {
    throw new Error('You already have an image pending review.');
  }
  if (status.imageChangesUsed > 0 && status.imageChangesRemaining <= 0) {
    throw new Error('You have used all 3 allowed image changes.');
  }

  // 2. Get signed upload URL
  const uploadData = await fetch(`${BASE}/upload/generate-signed-url`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      folder: 'profile-images',
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    }),
  }).then(r => r.json());

  // 3. Upload to cloud storage
  await fetch(uploadData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  // 4. Submit to backend
  const result = await fetch(`${BASE}/users/${userId}/profile-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageUrl: `https://storage.googleapis.com/${uploadData.relativePath}`,
    }),
  }).then(r => r.json());

  return result;
}

// ─── RE-UPLOAD AFTER REJECTION ──────────────
async function reuploadImage(token: string, file: File) {
  // 1. Get upload URL using token
  const uploadData = await fetch(`${BASE}/users/profile/image/reupload/generate-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    }),
  }).then(r => r.json());

  // 2. Upload to cloud storage
  await fetch(uploadData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  // 3. Submit re-upload
  const result = await fetch(`${BASE}/users/profile/image/reupload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      imageUrl: `https://storage.googleapis.com/${uploadData.relativePath}`,
    }),
  }).then(r => r.json());

  return result;
}
```

### React Component Example – Image Status Banner

```tsx
function ProfileImageBanner({ jwt }: { jwt: string }) {
  const [status, setStatus] = useState<ImageStatus | null>(null);

  useEffect(() => {
    getImageStatus(jwt).then(setStatus);
  }, [jwt]);

  if (!status) return null;

  return (
    <div>
      {/* Pending notification */}
      {status.pendingImage && (
        <div className="banner warning">
          ⏳ Your new profile image is under review.
        </div>
      )}

      {/* Change counter */}
      <p>
        Image changes: {status.imageChangesUsed} / {status.maxImageChanges} used
      </p>

      {/* Change button */}
      {status.imageChangesRemaining > 0 && !status.pendingImage && (
        <button>Change Profile Image</button>
      )}

      {status.imageChangesRemaining === 0 && (
        <p className="text-muted">
          You have used all {status.maxImageChanges} allowed image changes.
        </p>
      )}
    </div>
  );
}
```

### React Component Example – Image History

```tsx
function ImageHistory({ jwt }: { jwt: string }) {
  const [data, setData] = useState<{
    history: ImageHistoryEntry[];
    totalChanges: number;
    maxChanges: number;
  } | null>(null);

  useEffect(() => {
    getImageHistory(jwt).then(setData);
  }, [jwt]);

  if (!data) return <p>Loading...</p>;

  return (
    <div>
      <h3>Image History ({data.totalChanges}/{data.maxChanges} changes used)</h3>
      <table>
        <thead>
          <tr>
            <th>Image</th>
            <th>Status</th>
            <th>Change #</th>
            <th>Uploaded</th>
            <th>Verified</th>
          </tr>
        </thead>
        <tbody>
          {data.history.map((entry) => (
            <tr key={entry.id} className={entry.isCurrent ? 'current' : ''}>
              <td>
                {entry.imageUrl ? (
                  <img src={entry.imageUrl} alt="Profile" width={48} height={48} />
                ) : (
                  <span>Deleted</span>
                )}
              </td>
              <td>
                {entry.status}
                {entry.isCurrent && ' (Current)'}
                {entry.rejectionReason && (
                  <div className="text-danger">Reason: {entry.rejectionReason}</div>
                )}
              </td>
              <td>{entry.changeNumber === 0 ? 'Initial' : `Change ${entry.changeNumber}`}</td>
              <td>{new Date(entry.uploadedAt).toLocaleDateString()}</td>
              <td>{entry.verifiedAt ? new Date(entry.verifiedAt).toLocaleDateString() : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 11. Error Reference

| HTTP | Error | When |
|------|-------|------|
| 400 | `Image file not found in storage` | File not uploaded to cloud before submitting URL |
| 400 | `You have reached the maximum number of profile image changes (3)` | All 3 change slots used |
| 400 | `You already have an image pending verification` | Cannot upload while another image is PENDING |
| 400 | `Upload token has expired` | Re-upload link older than 7 days |
| 400 | `Invalid or malformed upload token` | Corrupted or tampered token |
| 400 | `Invalid content type` | File type not in allowed list |
| 400 | `File size exceeds maximum (5MB)` | File too large |
| 401 | `Unauthorized` | JWT missing or expired |
| 404 | `User not found` | Invalid user ID |
| 429 | `Too Many Requests` | Rate limit exceeded (5/15min or 10/hr) |

---

## 12. New Entities & Migrations Required

The following **new** database structures are needed to support the image change history and limit features.

### New Table: `user_image_history`

```sql
CREATE TABLE `user_image_history` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `image_url` VARCHAR(255) NULL COMMENT 'Relative path in cloud storage (null if deleted after rejection)',
  `status` ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `change_number` SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0=initial upload, 1-3=changes',
  `uploaded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `verified_by` BIGINT UNSIGNED NULL COMMENT 'Admin user ID',
  `verified_at` TIMESTAMP NULL,
  `rejection_reason` TEXT NULL,
  `is_current` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'True for the image currently displayed on profile',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX `idx_user_image_history_user` (`user_id`),
  INDEX `idx_user_image_history_current` (`user_id`, `is_current`),
  INDEX `idx_user_image_history_status` (`status`),
  CONSTRAINT `fk_user_image_history_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### New Column on `users` Table

```sql
ALTER TABLE `users`
  ADD COLUMN `image_change_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Number of times user changed profile image (max 3, initial upload = 0)';
```

### TypeORM Entity: `UserImageHistory`

```typescript
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { ImageVerificationStatus } from '../../institute_mudules/institue_user/enums/image-verification-status.enum';

@Entity('user_image_history')
@Index('idx_user_image_history_user', ['userId'])
@Index('idx_user_image_history_current', ['userId', 'isCurrent'])
export class UserImageHistory {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @Column({ name: 'image_url', type: 'varchar', length: 255, nullable: true })
  imageUrl?: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ImageVerificationStatus,
    default: ImageVerificationStatus.PENDING,
  })
  status: ImageVerificationStatus;

  @Column({ name: 'change_number', type: 'smallint', unsigned: true, default: 0 })
  changeNumber: number;

  @Column({ name: 'uploaded_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  uploadedAt: Date;

  @Column({ name: 'verified_by', type: 'bigint', unsigned: true, nullable: true })
  verifiedBy?: string;

  @Column({ name: 'verified_at', type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ name: 'is_current', type: 'boolean', default: false })
  isCurrent: boolean;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
```

### Migration File

```typescript
// src/migrations/XXXXXXXXX-AddImageChangeHistoryAndLimit.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImageChangeHistoryAndLimit1741686000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create image history table
    await queryRunner.query(`
      CREATE TABLE \`user_image_history\` (
        \`id\` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` BIGINT UNSIGNED NOT NULL,
        \`image_url\` VARCHAR(255) NULL,
        \`status\` ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
        \`change_number\` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        \`uploaded_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`verified_by\` BIGINT UNSIGNED NULL,
        \`verified_at\` TIMESTAMP NULL,
        \`rejection_reason\` TEXT NULL,
        \`is_current\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_user_image_history_user\` (\`user_id\`),
        INDEX \`idx_user_image_history_current\` (\`user_id\`, \`is_current\`),
        INDEX \`idx_user_image_history_status\` (\`status\`),
        CONSTRAINT \`fk_user_image_history_user\`
          FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 2. Add change counter to users table
    await queryRunner.query(`
      ALTER TABLE \`users\`
      ADD COLUMN \`image_change_count\` SMALLINT UNSIGNED NOT NULL DEFAULT 0
        COMMENT 'Number of times user changed profile image (max 3)'
    `);

    // 3. Backfill: Create history records for users who already have images
    await queryRunner.query(`
      INSERT INTO \`user_image_history\` (\`user_id\`, \`image_url\`, \`status\`, \`change_number\`, \`uploaded_at\`, \`verified_by\`, \`verified_at\`, \`rejection_reason\`, \`is_current\`)
      SELECT
        \`id\`,
        \`image_url\`,
        COALESCE(\`image_verification_status\`, 'PENDING'),
        0,
        COALESCE(\`updated_at\`, NOW()),
        \`image_verified_by\`,
        \`image_verified_at\`,
        \`image_rejection_reason\`,
        CASE WHEN \`image_verification_status\` = 'VERIFIED' THEN TRUE ELSE FALSE END
      FROM \`users\`
      WHERE \`image_url\` IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`image_change_count\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`user_image_history\``);
  }
}
```

### Updated User Entity Fields

Add to `user.entity.ts`:
```typescript
@Column({
  name: 'image_change_count',
  type: 'smallint',
  unsigned: true,
  default: 0,
  comment: 'Number of times user changed profile image (max 3)',
})
imageChangeCount: number;
```

---

### Service Logic Summary (Backend Changes Needed)

#### On `POST /users/:userId/profile-image` (user submits image):
1. Check `user.imageChangeCount < 3` (skip check if `imageUrl` is currently null → initial upload)
2. Check no existing PENDING entry in `user_image_history` for this user
3. If user already has a verified image → increment `imageChangeCount`
4. Create `user_image_history` record: `{ userId, imageUrl: relativePath, status: PENDING, changeNumber: imageChangeCount }`
5. Update `user.imageUrl` to new path, `user.imageVerificationStatus = PENDING`

#### On admin APPROVE:
1. Update `user_image_history` record: `status = VERIFIED, verifiedBy, verifiedAt`
2. Set `is_current = false` on all previous history records for this user
3. Set `is_current = true` on the approved record
4. Update `user.imageUrl`, `user.imageVerificationStatus = VERIFIED` (existing logic)

#### On admin REJECT:
1. Update `user_image_history` record: `status = REJECTED, rejectionReason, verifiedBy, verifiedAt`
2. Set `imageUrl = null` on the history record (file deleted)
3. Decrement `user.imageChangeCount` (rejection doesn't consume a slot)
4. Restore previous verified image to `user.imageUrl` (or null if none)
5. Existing logic: delete file, send rejection email with re-upload link

#### On re-upload (after rejection):
1. Create new `user_image_history` record with same `changeNumber` as the rejected one
2. Same flow as normal upload, but `imageChangeCount` NOT incremented (reusing slot)
