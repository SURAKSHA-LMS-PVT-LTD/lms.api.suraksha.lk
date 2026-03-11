# Profile Image Verification – System Admin Guide

Complete guide for System Admins managing user profile image verification,
including the new image-change-history and 3-change-limit features.

---

## Table of Contents

1. [Admin Workflow Overview](#1-admin-workflow-overview)
2. [Dashboard – Pending Images Queue](#2-dashboard--pending-images-queue)
3. [Approving an Image](#3-approving-an-image)
4. [Rejecting an Image](#4-rejecting-an-image)
5. [Viewing a User's Image History](#5-viewing-a-users-image-history)
6. [Admin-Initiated Image Upload](#6-admin-initiated-image-upload)
7. [Resetting a User's Change Limit](#7-resetting-a-users-change-limit)
8. [API Reference – All Admin Endpoints](#8-api-reference--all-admin-endpoints)
9. [Complete Frontend Implementation (React)](#9-complete-frontend-implementation-react)
10. [Image Guidelines for Review](#10-image-guidelines-for-review)
11. [Audit & Reporting](#11-audit--reporting)
12. [Backend Implementation Guide](#12-backend-implementation-guide)

---

## 1. Admin Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       SYSTEM ADMIN DASHBOARD                            │
│                                                                         │
│  PENDING QUEUE                                                          │
│  ┌───────────────────────────────────────────┐                          │
│  │ User 42 – John S.    [View] [✓] [✗]      │  ← New upload            │
│  │ User 87 – Nimal P.   [View] [✓] [✗]      │  ← Image change #2      │
│  │ User 15 – Kamal R.   [View] [✓] [✗]      │  ← Re-upload (rejected) │
│  └───────────────────────────────────────────┘                          │
│                                                                         │
│  On APPROVE:                                                            │
│    ✅ Image written to user profile (now visible)                       │
│    ✅ History record updated to VERIFIED                                │
│    ✅ ID card auto-generated (if applicable)                            │
│    ✅ User notified via email                                           │
│                                                                         │
│  On REJECT:                                                             │
│    ❌ Image deleted from cloud storage                                  │
│    ❌ History record updated to REJECTED with reason                    │
│    ❌ Change slot returned to user (rejection = free retry)             │
│    📧 User emailed with rejection reason + 7-day re-upload link        │
│                                                                         │
│  ADMIN UPLOAD:                                                          │
│    📤 Admin can upload image directly for a user                        │
│    📤 Auto-approved (no verification needed)                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Dashboard – Pending Images Queue

### List Unverified Users

```
GET /admin/users/unverified
Authorization: Bearer <admin-jwt>
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Items per page (1–100) |
| `status` | string | `PENDING` | Filter: `PENDING`, `VERIFIED`, `REJECTED`, or `ALL` |

**Response `200`:**
```json
{
  "users": [
    {
      "userId": "42",
      "nameWithInitials": "K.A.D.S. Perera",
      "email": "K***@school.lk",
      "phoneNumber": "077****789",
      "imageUrl": "https://storage.googleapis.com/.../pending-photo.jpg",
      "imageVerificationStatus": "PENDING",
      "imageUploadedAt": "2026-03-11T05:00:00.000Z",
      "userType": "STUDENT",
      "changeNumber": 2,
      "imageChangesUsed": 2,
      "previousVerifiedImage": "https://storage.googleapis.com/.../old-verified-photo.jpg"
    }
  ],
  "total": 45,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

**New fields in the response (to be added):**

| Field | Description |
|-------|-------------|
| `changeNumber` | Which change this is (0=initial, 1–3=changes) |
| `imageChangesUsed` | Total changes the user has made |
| `previousVerifiedImage` | The user's current visible image (for comparison) |

> **Privacy:** Email and phone are masked. Full details visible only through user detail view.

---

## 3. Approving an Image

```
POST /admin/users/:userId/approve-image
Authorization: Bearer <admin-jwt>
```

**Request body:**
```json
{
  "userId": "42",
  "note": "Image meets all guidelines"
}
```

**What happens on approval:**

| Step | Action |
|------|--------|
| 1 | User's `imageVerificationStatus` → `VERIFIED` |
| 2 | `imageVerifiedBy` → admin's user ID |
| 3 | `imageVerifiedAt` → current timestamp |
| 4 | `imageRejectionReason` → cleared |
| 5 | `user_image_history` record → `status=VERIFIED`, `is_current=true` |
| 6 | All previous history records → `is_current=false` |
| 7 | ID card auto-generated (if user is student and doesn't have one) |
| 8 | Email notification sent to user |

**Response `200`:**
```json
{
  "success": true,
  "userId": "42",
  "status": "VERIFIED",
  "approvedBy": "1",
  "approvedAt": "2026-03-11T06:00:00.000Z",
  "cardGenerated": true,
  "cardId": "CARD-2026-0042317"
}
```

---

## 4. Rejecting an Image

```
POST /admin/users/:userId/reject-image
Authorization: Bearer <admin-jwt>
```

**Request body:**
```json
{
  "userId": "42",
  "rejectionReason": "Image is blurry and does not show full face",
  "urlValidityDays": 7,
  "userEmail": "student@school.lk"
}
```

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `userId` | Yes | – | User being rejected |
| `rejectionReason` | Yes | – | Shown to user in email |
| `urlValidityDays` | No | `7` | Re-upload link validity (1–30 days) |
| `userEmail` | No | User's email | Override email address |

**What happens on rejection:**

| Step | Action |
|------|--------|
| 1 | Image file **deleted** from cloud storage |
| 2 | User's `imageVerificationStatus` → `REJECTED` |
| 3 | `imageRejectionReason` → stored |
| 4 | `user_image_history` record → `status=REJECTED`, `image_url=null` |
| 5 | `user.imageChangeCount` **decremented** (rejection = free retry) |
| 6 | Previous verified image **restored** as current display image |
| 7 | HMAC-SHA256 signed re-upload token generated (7-day expiry) |
| 8 | Rejection email sent with reason + re-upload link + guidelines |

**Response `200`:**
```json
{
  "success": true,
  "userId": "42",
  "rejectionReason": "Image is blurry and does not show full face",
  "uploadToken": "eyJ1c2VySWQiOiI0MiIsInB1cnBvc2UiOiJwcm9maWxlLWltYWdlLXJldXBsb2FkIiwiZXhwIjoxNzQyMjkwODAwMDAwfQ==.abc123signature",
  "expiresAt": "2026-03-18T06:00:00.000Z",
  "emailSent": true,
  "previousImageRestored": true
}
```

---

## 5. Viewing a User's Image History

```
GET /admin/users/:userId/image-history
Authorization: Bearer <admin-jwt>
```

**Response `200`:**
```json
{
  "userId": "42",
  "userName": "K.A.D.S. Perera",
  "imageChangesUsed": 2,
  "maxImageChanges": 3,
  "imageChangesRemaining": 1,
  "history": [
    {
      "id": "3",
      "imageUrl": "https://storage.googleapis.com/.../photo-v3.jpg",
      "status": "PENDING",
      "changeNumber": 2,
      "uploadedAt": "2026-03-10T08:00:00.000Z",
      "verifiedBy": null,
      "verifiedByName": null,
      "verifiedAt": null,
      "rejectionReason": null,
      "isCurrent": false
    },
    {
      "id": "2",
      "imageUrl": "https://storage.googleapis.com/.../photo-v2.jpg",
      "status": "VERIFIED",
      "changeNumber": 1,
      "uploadedAt": "2026-02-15T10:30:00.000Z",
      "verifiedBy": "1",
      "verifiedByName": "Admin User",
      "verifiedAt": "2026-02-15T11:00:00.000Z",
      "rejectionReason": null,
      "isCurrent": true
    },
    {
      "id": "1",
      "imageUrl": null,
      "status": "REJECTED",
      "changeNumber": 1,
      "uploadedAt": "2026-02-10T09:00:00.000Z",
      "verifiedBy": "1",
      "verifiedByName": "Admin User",
      "verifiedAt": "2026-02-10T09:30:00.000Z",
      "rejectionReason": "Photo was too dark",
      "isCurrent": false
    },
    {
      "id": "0",
      "imageUrl": "https://storage.googleapis.com/.../initial-photo.jpg",
      "status": "VERIFIED",
      "changeNumber": 0,
      "uploadedAt": "2026-01-05T08:00:00.000Z",
      "verifiedBy": "1",
      "verifiedByName": "Admin User",
      "verifiedAt": "2026-01-05T08:10:00.000Z",
      "rejectionReason": null,
      "isCurrent": false
    }
  ]
}
```

**Reading the history:**
- `changeNumber: 0` → Initial upload (doesn't count as a change)
- `changeNumber: 1` (REJECTED then VERIFIED) → User tried once, got rejected, re-uploaded, got approved. Only 1 change slot consumed.
- `changeNumber: 2` (PENDING) → Current pending upload

---

## 6. Admin-Initiated Image Upload

Admins can upload an image on behalf of a user. This bypasses verification (auto-approved).

### Option A: By Student ID

**Step 1 – Generate Upload URL:**
```
POST /admin/users/student/profile-image/generate-url
Authorization: Bearer <admin-jwt>
```
```json
{
  "studentId": "STU-2026-00123",
  "fileName": "student-photo.jpg",
  "contentType": "image/jpeg",
  "fileSize": 204800
}
```

**Step 2 – Upload to cloud storage** (same signed URL flow)

**Step 3 – Assign to student:**
```
POST /admin/users/student/profile-image/assign
Authorization: Bearer <admin-jwt>
```
```json
{
  "studentId": "STU-2026-00123",
  "relativePath": "profile-images/user-42/1709530000_student-photo.jpg"
}
```

### Option B: By User ID

```
POST /admin/users/profile-image/generate-url
POST /admin/users/profile-image/assign
```
Same flow, using `userId` instead of `studentId`.

### Option C: Quick Single-Step

```
POST /admin/users/:userId/profile-image
Authorization: Bearer <admin-jwt>
```
```json
{
  "imageUrl": "https://storage.googleapis.com/.../admin-uploaded-photo.jpg"
}
```

**Admin uploads are:**
- Auto-verified (status = `VERIFIED` immediately)
- Recorded in `user_image_history` with `verifiedBy = adminId`
- Do **not** count against the user's 3-change limit

---

## 7. Resetting a User's Change Limit

In special cases, admins may need to reset a user's image change counter.

```
POST /admin/users/:userId/reset-image-change-count
Authorization: Bearer <admin-jwt>
```

**Request body:**
```json
{
  "reason": "User had valid reason for additional changes - name change after marriage",
  "newLimit": 0
}
```

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| `reason` | Yes | – | Audit trail reason |
| `newLimit` | No | `0` | Reset counter to this value (0–3) |

**Response `200`:**
```json
{
  "success": true,
  "userId": "42",
  "previousChangeCount": 3,
  "newChangeCount": 0,
  "resetBy": "1",
  "resetAt": "2026-03-11T06:00:00.000Z",
  "reason": "User had valid reason for additional changes - name change after marriage"
}
```

> This action is logged in the audit trail and cannot be undone.

---

## 8. API Reference – All Admin Endpoints

### Existing Endpoints (Already Implemented)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/users/unverified` | Paginated queue of images to review |
| `POST` | `/admin/users/:userId/approve-image` | Approve a pending image |
| `POST` | `/admin/users/:userId/reject-image` | Reject with reason + re-upload link |
| `POST` | `/admin/users/student/profile-image/generate-url` | Generate upload URL by student ID |
| `POST` | `/admin/users/student/profile-image/assign` | Assign uploaded image by student ID |
| `POST` | `/admin/users/profile-image/generate-url` | Generate upload URL by user ID |
| `POST` | `/admin/users/profile-image/assign` | Assign uploaded image by user ID |
| `POST` | `/admin/users/:userId/profile-image` | Quick admin image upload |

### New Endpoints (To Be Implemented)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/users/:userId/image-history` | View user's complete image change history |
| `POST` | `/admin/users/:userId/reset-image-change-count` | Reset a user's change counter |

### Endpoint Updates (Modifications Needed)

| Endpoint | Changes Needed |
|----------|---------------|
| `GET /admin/users/unverified` | Add `changeNumber`, `imageChangesUsed`, `previousVerifiedImage` to response |
| `POST /admin/users/:userId/approve-image` | Write to `user_image_history`, set `is_current` flags |
| `POST /admin/users/:userId/reject-image` | Write to `user_image_history`, decrement change count, restore previous image |
| `POST /admin/users/:userId/profile-image` (admin upload) | Create history record, auto-verify, don't count against limit |

---

## 9. Complete Frontend Implementation (React)

### Admin Dashboard – Pending Queue

```tsx
import { useState, useEffect, useCallback } from 'react';

interface PendingUser {
  userId: string;
  nameWithInitials: string;
  email: string;
  phoneNumber: string;
  imageUrl: string;
  imageVerificationStatus: string;
  imageUploadedAt: string;
  userType: string;
  changeNumber: number;
  imageChangesUsed: number;
  previousVerifiedImage: string | null;
}

interface PendingResponse {
  users: PendingUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function AdminImageQueue({ adminJwt }: { adminJwt: string }) {
  const [data, setData] = useState<PendingResponse | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [selectedUser, setSelectedUser] = useState<PendingUser | null>(null);

  const headers = { Authorization: `Bearer ${adminJwt}` };

  const fetchQueue = useCallback(async () => {
    const res = await fetch(
      `${BASE}/admin/users/unverified?page=${page}&limit=20&status=${statusFilter}`,
      { headers },
    );
    setData(await res.json());
  }, [page, statusFilter]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const approveImage = async (userId: string) => {
    if (!confirm('Approve this image?')) return;
    await fetch(`${BASE}/admin/users/${userId}/approve-image`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    fetchQueue(); // Refresh list
  };

  const rejectImage = async (userId: string) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    await fetch(`${BASE}/admin/users/${userId}/reject-image`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, rejectionReason: reason }),
    });
    fetchQueue();
  };

  if (!data) return <p>Loading...</p>;

  return (
    <div>
      <h2>Image Verification Queue ({data.total} total)</h2>

      {/* Status filter */}
      <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
        <option value="PENDING">Pending</option>
        <option value="VERIFIED">Verified</option>
        <option value="REJECTED">Rejected</option>
        <option value="ALL">All</option>
      </select>

      {/* Queue table */}
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Type</th>
            <th>New Image</th>
            <th>Current Image</th>
            <th>Change #</th>
            <th>Uploaded</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.users.map((user) => (
            <tr key={user.userId}>
              <td>
                <strong>{user.nameWithInitials}</strong>
                <br />
                <small>{user.email} | {user.phoneNumber}</small>
              </td>
              <td>{user.userType}</td>
              <td>
                <img
                  src={user.imageUrl}
                  alt="Pending"
                  width={80}
                  height={80}
                  style={{ objectFit: 'cover', border: '2px solid orange' }}
                />
              </td>
              <td>
                {user.previousVerifiedImage ? (
                  <img
                    src={user.previousVerifiedImage}
                    alt="Current"
                    width={80}
                    height={80}
                    style={{ objectFit: 'cover', border: '2px solid green' }}
                  />
                ) : (
                  <span>No previous image</span>
                )}
              </td>
              <td>
                {user.changeNumber === 0 ? 'Initial' : `Change ${user.changeNumber}/3`}
                <br />
                <small>({user.imageChangesUsed} used)</small>
              </td>
              <td>{new Date(user.imageUploadedAt).toLocaleString()}</td>
              <td>
                <button onClick={() => setSelectedUser(user)}>View History</button>
                <button className="btn-approve" onClick={() => approveImage(user.userId)}>
                  ✓ Approve
                </button>
                <button className="btn-reject" onClick={() => rejectImage(user.userId)}>
                  ✗ Reject
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div>
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
        <span> Page {data.page} of {data.totalPages} </span>
        <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
      </div>

      {/* History modal */}
      {selectedUser && (
        <ImageHistoryModal
          userId={selectedUser.userId}
          userName={selectedUser.nameWithInitials}
          adminJwt={adminJwt}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}
```

### Image History Modal

```tsx
interface HistoryEntry {
  id: string;
  imageUrl: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  changeNumber: number;
  uploadedAt: string;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  isCurrent: boolean;
}

interface HistoryResponse {
  userId: string;
  userName: string;
  imageChangesUsed: number;
  maxImageChanges: number;
  imageChangesRemaining: number;
  history: HistoryEntry[];
}

function ImageHistoryModal({
  userId, userName, adminJwt, onClose,
}: {
  userId: string; userName: string; adminJwt: string; onClose: () => void;
}) {
  const [data, setData] = useState<HistoryResponse | null>(null);

  useEffect(() => {
    fetch(`${BASE}/admin/users/${userId}/image-history`, {
      headers: { Authorization: `Bearer ${adminJwt}` },
    })
      .then(r => r.json())
      .then(setData);
  }, [userId]);

  if (!data) return <div className="modal"><p>Loading...</p></div>;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Image History – {userName}</h3>
        <p>
          Changes: <strong>{data.imageChangesUsed} / {data.maxImageChanges}</strong>
          {' '}({data.imageChangesRemaining} remaining)
        </p>

        <div className="timeline">
          {data.history.map((entry) => (
            <div key={entry.id} className={`timeline-item ${entry.status.toLowerCase()}`}>
              <div className="timeline-badge">
                {entry.status === 'VERIFIED' && '✓'}
                {entry.status === 'REJECTED' && '✗'}
                {entry.status === 'PENDING' && '⏳'}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <strong>
                    {entry.changeNumber === 0 ? 'Initial Upload' : `Change #${entry.changeNumber}`}
                  </strong>
                  <span className={`badge badge-${entry.status.toLowerCase()}`}>
                    {entry.status}
                    {entry.isCurrent && ' (Current)'}
                  </span>
                </div>

                {entry.imageUrl ? (
                  <img src={entry.imageUrl} alt="Profile" width={120} height={120} />
                ) : (
                  <div className="deleted-placeholder">Image deleted</div>
                )}

                <div className="timeline-meta">
                  <small>Uploaded: {new Date(entry.uploadedAt).toLocaleString()}</small>
                  {entry.verifiedAt && (
                    <small>
                      {entry.status === 'VERIFIED' ? 'Approved' : 'Rejected'}
                      {' '}by {entry.verifiedByName} on {new Date(entry.verifiedAt).toLocaleString()}
                    </small>
                  )}
                  {entry.rejectionReason && (
                    <div className="rejection-reason">
                      Reason: {entry.rejectionReason}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
          {data.imageChangesRemaining === 0 && (
            <button
              className="btn-warning"
              onClick={async () => {
                const reason = prompt('Reason for resetting change limit:');
                if (!reason) return;
                await fetch(`${BASE}/admin/users/${userId}/reset-image-change-count`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${adminJwt}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ reason }),
                });
                alert('Change limit reset successfully');
              }}
            >
              Reset Change Limit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 10. Image Guidelines for Review

When reviewing images, admins should check for:

### Accept If:
- Clear, well-lit photo of the person's face
- Face takes up at least 60% of the frame
- Neutral background (white, light grey, or solid color)
- No sunglasses, hats, or face coverings (religious exceptions allowed)
- Photo is recent (within last 6 months)
- File is not blurry, pixelated, or distorted
- Appropriate attire

### Reject If:
- Group photo (multiple people visible)
- Photo is a screenshot of another photo
- Face obscured or partially hidden
- Image quality too low (under 200×200 pixels)
- Inappropriate or offensive content
- Obviously fake or AI-generated
- Landscape or object photo (not a person)

### Recommended Rejection Reasons:

| Reason | Template |
|--------|----------|
| Blurry | "Image is too blurry. Please upload a clear, focused photo." |
| Dark | "Image is too dark. Please upload a well-lit photo taken in natural lighting." |
| Group | "Multiple people visible. Please upload a photo with only yourself." |
| No face | "Face is not clearly visible. Please upload a front-facing photo." |
| Low quality | "Image resolution is too low. Please upload a higher quality photo (minimum 200×200 pixels)." |
| Inappropriate | "Image does not meet our photo guidelines. Please upload an appropriate passport-style photo." |
| Screenshot | "This appears to be a screenshot. Please upload the original photo file." |

---

## 11. Audit & Reporting

### Image Verification Stats

```
GET /admin/reports/image-verification-stats
Authorization: Bearer <admin-jwt>
```

**Response `200`:**
```json
{
  "totalUsers": 5420,
  "withImages": 4200,
  "pendingReview": 45,
  "verified": 3800,
  "rejected": 355,
  "noImage": 1220,
  "averageReviewTime": "2.4 hours",
  "todayProcessed": 12,
  "thisWeekProcessed": 87
}
```

### Audit Query Examples (SQL)

**Users pending review for more than 24 hours:**
```sql
SELECT u.id, u.name_with_initials, u.image_verification_status, u.updated_at
FROM users u
WHERE u.image_verification_status = 'PENDING'
  AND u.image_url IS NOT NULL
  AND u.updated_at < NOW() - INTERVAL 24 HOUR
ORDER BY u.updated_at ASC;
```

**Image change history for a specific user:**
```sql
SELECT h.*, admin.name_with_initials AS verified_by_name
FROM user_image_history h
LEFT JOIN users admin ON admin.id = h.verified_by
WHERE h.user_id = 42
ORDER BY h.uploaded_at DESC;
```

**Users who have exhausted their change limit:**
```sql
SELECT u.id, u.name_with_initials, u.image_change_count
FROM users u
WHERE u.image_change_count >= 3
ORDER BY u.name_with_initials;
```

**Change limit resets (audit trail):**
```sql
SELECT h.*
FROM user_image_history h
WHERE h.user_id = 42
ORDER BY h.uploaded_at DESC;
-- Cross-reference with user.image_change_count to detect resets
```

---

## 12. Backend Implementation Guide

### Summary of Changes Required

This section outlines every backend modification needed to support the complete image verification flow with history and limits.

---

### 12.1 New Entity: `UserImageHistory`

**File to create:** `src/modules/user/entities/user-image-history.entity.ts`

```typescript
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';
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

  @Column({ type: 'enum', enum: ImageVerificationStatus, default: ImageVerificationStatus.PENDING })
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

---

### 12.2 User Entity Update

**Add to `user.entity.ts`:**
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

### 12.3 New DTOs

**File:** `src/modules/user/dto/image-history.dto.ts`

```typescript
import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResetImageChangeCountDto {
  @ApiProperty({ description: 'Reason for resetting the change limit' })
  @IsString()
  reason: string;

  @ApiPropertyOptional({ description: 'New counter value', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(3)
  newLimit?: number;
}

export class ImageHistoryEntryDto {
  id: string;
  imageUrl: string | null;
  status: string;
  changeNumber: number;
  uploadedAt: string;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  isCurrent: boolean;
}

export class UserImageHistoryResponseDto {
  userId: string;
  userName: string;
  imageChangesUsed: number;
  maxImageChanges: number;
  imageChangesRemaining: number;
  history: ImageHistoryEntryDto[];
}

export class ImageStatusResponseDto {
  currentVerifiedImage: string | null;
  pendingImage: {
    imageUrl: string;
    status: string;
    uploadedAt: string;
  } | null;
  imageChangesUsed: number;
  imageChangesRemaining: number;
  maxImageChanges: number;
}
```

---

### 12.4 Migration File

**File:** `src/migrations/1741686000000-AddImageChangeHistoryAndLimit.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImageChangeHistoryAndLimit1741686000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`user_image_history\` (
        \`id\` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`user_id\` BIGINT UNSIGNED NOT NULL,
        \`image_url\` VARCHAR(255) NULL,
        \`status\` ENUM('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING',
        \`change_number\` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        \`uploaded_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`verified_by\` BIGINT UNSIGNED NULL,
        \`verified_at\` TIMESTAMP NULL,
        \`rejection_reason\` TEXT NULL,
        \`is_current\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_uih_user\` (\`user_id\`),
        INDEX \`idx_uih_user_current\` (\`user_id\`, \`is_current\`),
        INDEX \`idx_uih_status\` (\`status\`),
        CONSTRAINT \`fk_uih_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      ALTER TABLE \`users\`
      ADD COLUMN \`image_change_count\` SMALLINT UNSIGNED NOT NULL DEFAULT 0
    `);

    // Backfill existing images into history
    await queryRunner.query(`
      INSERT INTO \`user_image_history\`
        (\`user_id\`, \`image_url\`, \`status\`, \`change_number\`, \`uploaded_at\`,
         \`verified_by\`, \`verified_at\`, \`rejection_reason\`, \`is_current\`)
      SELECT
        \`id\`, \`image_url\`,
        COALESCE(\`image_verification_status\`, 'PENDING'),
        0,
        COALESCE(\`updated_at\`, NOW()),
        \`image_verified_by\`, \`image_verified_at\`, \`image_rejection_reason\`,
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

---

### 12.5 Service Method Changes

#### `user.service.ts` – `updateImageUrl()` Changes

**Current logic:**
```typescript
async updateImageUrl(userId: string, imageUrl: string) {
  // Sets imageUrl, sets status = PENDING, clears verification fields
}
```

**New logic to add:**
```typescript
const MAX_IMAGE_CHANGES = 3;

async updateImageUrl(userId: string, imageUrl: string) {
  const user = await this.findOne(userId);

  // 1. Check for existing pending image
  const pendingHistory = await this.imageHistoryRepo.findOne({
    where: { userId, status: ImageVerificationStatus.PENDING },
  });
  if (pendingHistory) {
    throw new BadRequestException('You already have an image pending verification.');
  }

  // 2. Check change limit (skip for initial upload when imageUrl is null)
  const isInitialUpload = !user.imageUrl && user.imageChangeCount === 0;
  if (!isInitialUpload && user.imageChangeCount >= MAX_IMAGE_CHANGES) {
    throw new BadRequestException(
      `You have reached the maximum number of profile image changes (${MAX_IMAGE_CHANGES}).`
    );
  }

  // 3. Determine change number
  const changeNumber = isInitialUpload ? 0 : user.imageChangeCount + 1;

  // 4. Create history record
  await this.imageHistoryRepo.save({
    userId,
    imageUrl,
    status: ImageVerificationStatus.PENDING,
    changeNumber,
    uploadedAt: new Date(),
    isCurrent: false,
  });

  // 5. Increment change count (only for changes, not initial)
  if (!isInitialUpload) {
    await this.userRepo.update(userId, { imageChangeCount: changeNumber });
  }

  // 6. Existing logic: update user.imageUrl, set status PENDING
  await this.userRepo.update(userId, {
    imageUrl,
    imageVerificationStatus: ImageVerificationStatus.PENDING,
    imageVerifiedBy: null,
    imageVerifiedAt: null,
    imageRejectionReason: null,
  });
}
```

#### `system-admin-user.service.ts` – `approveUserImage()` Changes

**Add after existing approval logic:**
```typescript
// Update history record
await this.imageHistoryRepo.update(
  { userId, status: ImageVerificationStatus.PENDING },
  {
    status: ImageVerificationStatus.VERIFIED,
    verifiedBy: adminId,
    verifiedAt: new Date(),
  },
);

// Set is_current = false on all previous records
await this.imageHistoryRepo.update({ userId }, { isCurrent: false });

// Set is_current = true on the newly approved record
await this.imageHistoryRepo.update(
  { userId, status: ImageVerificationStatus.VERIFIED, verifiedAt: new Date() },
  { isCurrent: true },
);
```

#### `system-admin-user.service.ts` – `rejectUserImage()` Changes

**Add to existing rejection logic:**
```typescript
// Update history record
await this.imageHistoryRepo.update(
  { userId, status: ImageVerificationStatus.PENDING },
  {
    status: ImageVerificationStatus.REJECTED,
    imageUrl: null,   // File deleted
    verifiedBy: adminId,
    verifiedAt: new Date(),
    rejectionReason: dto.rejectionReason,
  },
);

// Decrement change count (rejection = free retry)
if (user.imageChangeCount > 0) {
  await this.userRepo.decrement({ id: userId }, 'imageChangeCount', 1);
}

// Restore previous verified image
const previousVerified = await this.imageHistoryRepo.findOne({
  where: { userId, status: ImageVerificationStatus.VERIFIED, isCurrent: true },
  order: { verifiedAt: 'DESC' },
});

if (previousVerified) {
  await this.userRepo.update(userId, {
    imageUrl: previousVerified.imageUrl,
    imageVerificationStatus: ImageVerificationStatus.VERIFIED,
  });
} else {
  await this.userRepo.update(userId, {
    imageUrl: null,
    imageVerificationStatus: null,
  });
}
```

---

### 12.6 New Service Methods

#### `getImageHistory(userId)` (for both admin and user)

```typescript
async getImageHistory(userId: string, isAdmin: boolean = false) {
  const user = await this.findOne(userId);
  const history = await this.imageHistoryRepo.find({
    where: { userId },
    order: { uploadedAt: 'DESC' },
  });

  // Resolve admin names if admin view
  const enrichedHistory = await Promise.all(
    history.map(async (h) => {
      let verifiedByName = null;
      if (isAdmin && h.verifiedBy) {
        const admin = await this.findOne(h.verifiedBy);
        verifiedByName = admin?.nameWithInitials || null;
      }
      return {
        id: h.id,
        imageUrl: h.imageUrl ? this.cloudStorageService.getPublicUrl(h.imageUrl) : null,
        status: h.status,
        changeNumber: h.changeNumber,
        uploadedAt: h.uploadedAt.toISOString(),
        verifiedBy: isAdmin ? h.verifiedBy : undefined,
        verifiedByName: isAdmin ? verifiedByName : undefined,
        verifiedAt: h.verifiedAt?.toISOString() || null,
        rejectionReason: h.rejectionReason,
        isCurrent: h.isCurrent,
      };
    }),
  );

  return {
    userId,
    userName: user.nameWithInitials,
    imageChangesUsed: user.imageChangeCount,
    maxImageChanges: 3,
    imageChangesRemaining: Math.max(0, 3 - user.imageChangeCount),
    history: enrichedHistory,
  };
}
```

#### `getImageStatus(userId)` (user only)

```typescript
async getImageStatus(userId: string) {
  const user = await this.findOne(userId);

  // Get current verified image
  const currentVerified = await this.imageHistoryRepo.findOne({
    where: { userId, isCurrent: true, status: ImageVerificationStatus.VERIFIED },
  });

  // Get pending image
  const pending = await this.imageHistoryRepo.findOne({
    where: { userId, status: ImageVerificationStatus.PENDING },
  });

  return {
    currentVerifiedImage: currentVerified?.imageUrl
      ? this.cloudStorageService.getPublicUrl(currentVerified.imageUrl)
      : null,
    pendingImage: pending
      ? {
          imageUrl: this.cloudStorageService.getPublicUrl(pending.imageUrl),
          status: pending.status,
          uploadedAt: pending.uploadedAt.toISOString(),
        }
      : null,
    imageChangesUsed: user.imageChangeCount,
    imageChangesRemaining: Math.max(0, 3 - user.imageChangeCount),
    maxImageChanges: 3,
  };
}
```

#### `resetImageChangeCount(userId, dto, adminId)` (admin only)

```typescript
async resetImageChangeCount(userId: string, dto: ResetImageChangeCountDto, adminId: string) {
  const user = await this.findOne(userId);
  const previousCount = user.imageChangeCount;
  const newCount = dto.newLimit ?? 0;

  await this.userRepo.update(userId, { imageChangeCount: newCount });

  // Log the reset (could also create an audit entry)
  this.logger.log(
    `Admin ${adminId} reset image change count for user ${userId}: ${previousCount} → ${newCount}. Reason: ${dto.reason}`,
  );

  return {
    success: true,
    userId,
    previousChangeCount: previousCount,
    newChangeCount: newCount,
    resetBy: adminId,
    resetAt: new Date().toISOString(),
    reason: dto.reason,
  };
}
```

---

### 12.7 New Controller Endpoints

#### User Controller (`user-profile-image.controller.ts`)

```typescript
@Get('profile/image-status')
@UseGuards(JwtAuthGuard)
async getImageStatus(@Request() req: JwtRequest) {
  return this.userService.getImageStatus(req.user.userId);
}

@Get('profile/image-history')
@UseGuards(JwtAuthGuard)
async getImageHistory(@Request() req: JwtRequest) {
  return this.userService.getImageHistory(req.user.userId, false);
}
```

#### Admin Controller (`system-admin-user.controller.ts`)

```typescript
@Get(':userId/image-history')
@UseGuards(JwtAuthGuard, SystemAdminGuard)
async getImageHistory(@Param('userId') userId: string) {
  return this.systemAdminService.getImageHistory(userId, true);
}

@Post(':userId/reset-image-change-count')
@UseGuards(JwtAuthGuard, SystemAdminGuard)
async resetImageChangeCount(
  @Param('userId') userId: string,
  @Body() dto: ResetImageChangeCountDto,
  @Request() req: JwtRequest,
) {
  return this.systemAdminService.resetImageChangeCount(userId, dto, req.user.userId);
}
```

---

### 12.8 Module Registration

**Add to `user.module.ts`:**
```typescript
import { UserImageHistory } from './entities/user-image-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserImageHistory, /* ...other entities */]),
    // ...
  ],
})
```

---

### 12.9 Complete Flow Diagram

```
USER SELF-SERVICE FLOW
══════════════════════

First Upload:
  User uploads → imageChangeCount stays 0 → history(changeNumber=0, PENDING)
    → Admin approves → history(VERIFIED, isCurrent=true) → image visible

Change 1:
  User uploads → imageChangeCount = 1 → history(changeNumber=1, PENDING)
    → Previous image stays visible
    → Admin approves → history(VERIFIED, isCurrent=true) → new image visible
    OR
    → Admin rejects → imageChangeCount back to 0 → previous image restored
      → User re-uploads (same change slot) → history(changeNumber=1, PENDING)

Change 2:
  Same as Change 1, imageChangeCount = 2

Change 3:
  Same as Change 1, imageChangeCount = 3
  After this, no more changes allowed (unless admin resets)

ADMIN OVERRIDE:
  Admin uploads directly → auto-verified → does NOT affect imageChangeCount
  Admin resets count → user gets more change slots
```
