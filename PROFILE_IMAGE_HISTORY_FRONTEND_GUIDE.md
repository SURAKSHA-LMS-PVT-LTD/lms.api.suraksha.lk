# Profile Image History & Status — Frontend Guide

This guide covers every profile-image API endpoint: what to call, when to call it, and exactly what to render from each response.

---

## Endpoint Overview

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `GET` | `/api/users/profile/image-status` | JWT | Quick status check for the logged-in user |
| `GET` | `/api/users/profile/image-history` | JWT | Full upload history + current approved image (logged-in user) |
| `POST` | `/api/users/:id/profile-image` | JWT | Submit a new profile image (GLOBAL or INSTITUTE scope) |
| `POST` | `/api/users/:userId/upload-id-document` | JWT | Submit an ID document URL |
| `GET` | `/api/users/:id/profile-image/institute/:instituteId/history` | JWT | Institute-scoped submission history for a user |
| `DELETE` | `/api/users/:id/profile-image/institute/:instituteId` | JWT | Cancel a pending institute image submission |
| `POST` | `/api/users/profile/image/reupload` | **None** | Re-upload after rejection using email token |

---

## 1 — `GET /api/users/profile/image-status`

Quick read — use this on page load to decide which avatar to show and whether to display a "pending review" banner.

### Request

```
GET /api/users/profile/image-status
Authorization: Bearer <jwt>
```

### Response — 200 OK

```json
{
  "success": true,
  "data": {
    "userId": "456",
    "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456.jpg",
    "pendingImageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-new.jpg",
    "pendingImageId": "88",
    "imageVerificationStatus": "PENDING"
  }
}
```

| Field | When non-null | Notes |
|---|---|---|
| `imageUrl` | User has an approved image | Authoritative current avatar — always use this for display |
| `pendingImageUrl` | `imageVerificationStatus === "PENDING"` | Preview of what was submitted for review |
| `pendingImageId` | Same as above | ID of the `user_images` row |
| `imageVerificationStatus` | Always | `"PENDING"` / `"VERIFIED"` / `"REJECTED"` / `null` |

### Logic

```ts
async function loadProfileImageBanner(api) {
  const { data } = (await api.get('/api/users/profile/image-status')).data;

  if (data.imageVerificationStatus === 'PENDING') {
    showBanner('Your new photo is under review', 'info');
    showAvatar(data.imageUrl ?? data.pendingImageUrl);   // show old approved or the pending one
  } else if (data.imageVerificationStatus === 'REJECTED') {
    showBanner('Your photo was rejected. Tap here to re-upload.', 'error');
    showAvatar(data.imageUrl);   // still show last approved image
  } else {
    showAvatar(data.imageUrl);   // VERIFIED or null
  }
}
```

---

## 2 — `GET /api/users/profile/image-history`

Full historical list of every image submission for the logged-in user, plus a top-level `currentImageUrl` / `currentStatus` that always reflects the authoritative state on the `users` table.

### Request

```
GET /api/users/profile/image-history
Authorization: Bearer <jwt>
```

### Response — 200 OK

```json
{
  "success": true,
  "currentImageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456.jpg",
  "currentStatus": "VERIFIED",
  "data": [
    {
      "imageId": "92",
      "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-v3.jpg",
      "scope": "GLOBAL",
      "instituteId": null,
      "status": "PENDING",
      "rejectionReason": null,
      "verifiedAt": null,
      "verifiedBy": null,
      "uploadedAt": "2026-03-14T08:30:00.000Z"
    },
    {
      "imageId": "85",
      "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-v2.jpg",
      "scope": "GLOBAL",
      "instituteId": null,
      "status": "VERIFIED",
      "rejectionReason": null,
      "verifiedAt": "2026-02-10T11:15:00.000Z",
      "verifiedBy": "1",
      "uploadedAt": "2026-02-08T09:00:00.000Z"
    },
    {
      "imageId": "70",
      "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-v1.jpg",
      "scope": "GLOBAL",
      "instituteId": null,
      "status": "REJECTED",
      "rejectionReason": "Image is blurry",
      "verifiedAt": "2026-01-05T14:00:00.000Z",
      "verifiedBy": "1",
      "uploadedAt": "2026-01-03T10:00:00.000Z"
    }
  ]
}
```

### Top-level fields

| Field | Description |
|---|---|
| `currentImageUrl` | The URL currently stored in `users.imageUrl` — the **approved** active photo. `null` if never approved. |
| `currentStatus` | The status stored in `users.imageVerificationStatus` — authoritative current state. |
| `data` | All past submissions ordered newest-first. |

### `data[]` item fields

| Field | Description |
|---|---|
| `imageId` | Row ID in `user_images` table. `null` for legacy records. |
| `imageUrl` | Full URL of that specific submission. |
| `scope` | `"GLOBAL"` or `"INSTITUTE"` |
| `instituteId` | Set when `scope === "INSTITUTE"`, otherwise `null`. |
| `status` | `"PENDING"` / `"VERIFIED"` / `"REJECTED"` |
| `rejectionReason` | Admin note when status is `"REJECTED"`, otherwise `null`. |
| `verifiedAt` | ISO timestamp when approved/rejected, otherwise `null`. |
| `verifiedBy` | Admin user ID who acted, otherwise `null`. |
| `uploadedAt` | ISO timestamp when the user submitted this image. `null` for legacy records. |

### Status badge colours

| Status | Colour | Label |
|---|---|---|
| `PENDING` | Amber / Orange | Under Review |
| `VERIFIED` | Green | Approved |
| `REJECTED` | Red | Rejected |

### React example — history list

```tsx
import { useEffect, useState } from 'react';
import api from '../services/api';

interface ImageHistoryItem {
  imageId: string | null;
  imageUrl: string;
  scope: string;
  instituteId: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  rejectionReason: string | null;
  verifiedAt: string | null;
  uploadedAt: string | null;
}

interface ProfileImageHistoryResponse {
  success: boolean;
  currentImageUrl: string | null;
  currentStatus: string | null;
  data: ImageHistoryItem[];
}

export default function ProfileImageHistoryPage() {
  const [current, setCurrent] = useState<{ url: string | null; status: string | null }>({
    url: null, status: null,
  });
  const [history, setHistory] = useState<ImageHistoryItem[]>([]);

  useEffect(() => {
    api.get<ProfileImageHistoryResponse>('/api/users/profile/image-history').then(res => {
      setCurrent({ url: res.data.currentImageUrl, status: res.data.currentStatus });
      setHistory(res.data.data);
    });
  }, []);

  return (
    <div>
      {/* Current approved photo */}
      <section>
        <h2>Current Photo</h2>
        {current.url
          ? <img src={current.url} alt="Current profile" />
          : <p>No approved photo yet.</p>}
        {current.status && <StatusBadge status={current.status} />}
      </section>

      {/* Submission history */}
      <section>
        <h2>Submission History</h2>
        {history.length === 0
          ? <p>No submissions found.</p>
          : history.map((item, i) => (
            <div key={item.imageId ?? i} className="history-row">
              <img src={item.imageUrl} alt={`Submission ${i + 1}`} />
              <StatusBadge status={item.status} />
              {item.status === 'REJECTED' && item.rejectionReason && (
                <p className="rejection-reason">Reason: {item.rejectionReason}</p>
              )}
              <p className="date">
                {item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString('en-LK') : 'Legacy'}
              </p>
              {item.scope === 'INSTITUTE' && (
                <span className="badge-institute">Institute #{item.instituteId}</span>
              )}
            </div>
          ))}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PENDING:  { label: 'Under Review', className: 'badge-amber'  },
    VERIFIED: { label: 'Approved',     className: 'badge-green'  },
    REJECTED: { label: 'Rejected',     className: 'badge-red'    },
  };
  const s = map[status] ?? { label: status, className: 'badge-grey' };
  return <span className={`badge ${s.className}`}>{s.label}</span>;
}
```

---

## 3 — `POST /api/users/:id/profile-image`

Submit a new profile image. Only call this **after** the file has been uploaded to cloud storage via `/upload/generate-signed-url`.

### Request

```
POST /api/users/456/profile-image
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-new.png",
  "scope": "GLOBAL"
}
```

For an institute-scoped image (visible only within that institute):

```json
{
  "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-inst42.png",
  "scope": "INSTITUTE",
  "instituteId": "42"
}
```

### Body fields

| Field | Required | Description |
|---|---|---|
| `imageUrl` | ✅ | Full public URL from the signed-URL upload |
| `scope` | Optional | `"GLOBAL"` (default) or `"INSTITUTE"` |
| `instituteId` | Required when `scope === "INSTITUTE"` | The institute this image is tied to |

### Response — 200 OK

```json
{
  "success": true,
  "message": "Profile image updated successfully",
  "data": {
    "userId": "456",
    "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-new.png"
  }
}
```

> After a successful POST, a `user_images` row is inserted with `status: "PENDING"`. For **GLOBAL** scope, `users.imageVerificationStatus` is set to `"PENDING"`. For **INSTITUTE** scope, the `institute_user` row is **not changed at all** — `currentInstituteImageUrl` and `currentInstituteImageStatus` continue to show the last approved image until an admin approves the new submission.

### Rate limit
Maximum **5 submissions per 15 minutes** per user. A `429 Too Many Requests` response is returned if exceeded.

---

## 4 — `GET /api/users/:id/profile-image/institute/:instituteId/history`

Institute-scoped submission history. Only shows images submitted with `scope: "INSTITUTE"` for the given institute. Also returns the currently active institute image from the `institute_user` row.

### Request

```
GET /api/users/456/profile-image/institute/42/history
Authorization: Bearer <jwt>
```

### Response — 200 OK

```json
{
  "success": true,
  "currentInstituteImageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-inst42.jpg",
  "currentInstituteImageStatus": "VERIFIED",
  "data": [
    {
      "imageId": "95",
      "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-inst42-v2.jpg",
      "status": "PENDING",
      "rejectionReason": null,
      "verifiedBy": null,
      "verifiedAt": null,
      "submittedAt": "2026-03-14T09:00:00.000Z"
    },
    {
      "imageId": "78",
      "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-inst42-v1.jpg",
      "status": "VERIFIED",
      "rejectionReason": null,
      "verifiedBy": "2",
      "verifiedAt": "2026-02-20T10:30:00.000Z",
      "submittedAt": "2026-02-18T08:00:00.000Z"
    }
  ]
}
```

| Top-level field | Description |
|---|---|
| `currentInstituteImageUrl` | The **approved** institute image from `institute_user.instituteUserImageUrl`. Only changes when an admin approves. `null` if never approved for this institute. |
| `currentInstituteImageStatus` | The status tied to the approved image from `institute_user.imageVerificationStatus`. This is **not** updated by pending submissions — it only changes on approval. |

> **Note:** `data[].submittedAt` (not `uploadedAt`) is used here for consistency with the admin-facing history API.

> **Important:** `currentInstituteImageUrl` / `currentInstituteImageStatus` always reflect the **last approved** image only. A pending submission does **not** change these fields. To check whether there is a pending submission, look at `data[0].status`. All PENDING / REJECTED state is tracked solely in the `data[]` array (the `user_images` table).

### Displaying the institute image correctly

Because the approved image and any in-flight submission are separate, the frontend needs to combine both:

```tsx
useEffect(() => {
  api.get(`/api/users/${userId}/profile-image/institute/${instituteId}/history`)
    .then(res => {
      const { currentInstituteImageUrl, currentInstituteImageStatus, data } = res.data;

      // Always show the approved image
      setApprovedImage({ url: currentInstituteImageUrl, status: currentInstituteImageStatus });

      // Check if the user has a pending submission on top of the approved image
      const latestRecord = data[0];
      if (latestRecord?.status === 'PENDING') {
        setPendingSubmission(latestRecord);  // show "Under review" banner
      } else if (latestRecord?.status === 'REJECTED') {
        setRejectedRecord(latestRecord);    // show rejection reason + re-upload prompt
      }

      setInstituteHistory(data);
    });
}, [userId, instituteId]);
```

### React example — institute image section UI

```tsx
function InstituteImageSection({ approvedImage, pendingSubmission, rejectedRecord }) {
  return (
    <div>
      {/* Always show last approved image */}
      <div>
        <h3>Current Institute Photo</h3>
        {approvedImage.url
          ? <img src={approvedImage.url} alt="Approved institute photo" />
          : <p>No approved photo yet for this institute.</p>}
      </div>

      {/* Pending banner — shown alongside the approved image */}
      {pendingSubmission && (
        <div className="banner-amber">
          A new photo is under review by the institute admin.
          {/* Optionally show a preview of the pending image */}
          <img src={pendingSubmission.imageUrl} alt="Pending submission preview" />
          <button onClick={cancelPending}>Cancel submission</button>
        </div>
      )}

      {/* Rejection banner */}
      {!pendingSubmission && rejectedRecord && (
        <div className="banner-red">
          Your last submission was rejected.
          {rejectedRecord.rejectionReason && <p>Reason: {rejectedRecord.rejectionReason}</p>}
          <button onClick={openUploadDialog}>Re-upload photo</button>
        </div>
      )}
    </div>
  );
}
```

---

## 5 — `DELETE /api/users/:id/profile-image/institute/:instituteId`

Cancel a **PENDING** institute image submission. Only works while status is `PENDING` — approved or rejected submissions cannot be deleted.

### Request

```
DELETE /api/users/456/profile-image/institute/42
Authorization: Bearer <jwt>
```

### Response — 200 OK

```json
{
  "success": true,
  "message": "Pending institute image deleted successfully"
}
```

### Error — 400 if not pending

```json
{
  "statusCode": 400,
  "message": "No pending institute image found. Only PENDING images can be deleted."
}
```

### When to show the delete button

```tsx
// Show cancel button only when the most recent submission is still PENDING
const latestRecord = instituteHistory[0];
const canCancel = latestRecord?.status === 'PENDING';
```

---

## 6 — `POST /api/users/:userId/upload-id-document`

Submit an ID document URL. Same signed-URL flow as profile images.

### Request

```
POST /api/users/456/upload-id-document
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "idUrl": "https://storage.googleapis.com/suraksha-lms/id-documents/user-456-id.pdf"
}
```

### Response — 200 OK

```json
{
  "success": true,
  "message": "ID document updated successfully",
  "data": {
    "userId": "456",
    "idUrl": "https://storage.googleapis.com/suraksha-lms/id-documents/user-456-id.pdf"
  }
}
```

---

## 7 — `POST /api/users/profile/image/reupload` (Public — no JWT)

Allows a user to re-upload their photo using the one-time token from the rejection notification email. **No `Authorization` header required.**

### Request

```
POST /api/users/profile/image/reupload
Content-Type: application/json

{
  "token": "<base64url-token-from-email>",
  "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-retry.png"
}
```

### Response — 200 OK

```json
{
  "success": true,
  "message": "Profile image uploaded successfully. It will be reviewed by our team.",
  "data": {
    "userId": "456",
    "imageUrl": "https://storage.googleapis.com/suraksha-lms/profile-images/user-456-retry.png",
    "status": "PENDING"
  }
}
```

### Error responses

| Status | Meaning |
|---|---|
| `400` | Token is missing, malformed, or expired |
| `400` | Image file not found in cloud storage |
| `400` | User not found |

> The token expires after a fixed time set by the backend. If a user clicks the email link after it has expired, show a message directing them to contact support or re-authenticate.

### React example — public re-upload page

```tsx
// Route: /profile/image/reupload?token=XXX
import { useSearchParams } from 'react-router-dom';

export default function ReuploadPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');

  async function handleSubmit() {
    if (!file || !token) return;
    setStatus('uploading');
    try {
      // Step 1: get signed URL
      const { uploadUrl, publicUrl } = (
        await api.post('/api/upload/generate-signed-url', { fileName: file.name, contentType: file.type })
      ).data;

      // Step 2: upload to cloud storage
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });

      // Step 3: confirm to backend (no Auth header needed)
      await api.post('/api/users/profile/image/reupload', { token, imageUrl: publicUrl });
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'done') return <p>Photo submitted! Our team will review it shortly.</p>;

  return (
    <div>
      <h1>Re-upload Profile Photo</h1>
      <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
      <button onClick={handleSubmit} disabled={!file || status === 'uploading'}>
        {status === 'uploading' ? 'Uploading…' : 'Submit'}
      </button>
      {status === 'error' && <p className="error">Upload failed. Please try again or contact support.</p>}
    </div>
  );
}
```

---

## Institute image state rule (critical)

The `institute_user` row (`currentInstituteImageUrl` / `currentInstituteImageStatus`) is **only ever written on approval**. It is never touched by submissions, rejections, or cancellations.

| Event | `currentInstituteImageUrl` | `currentInstituteImageStatus` | Where state is tracked |
|---|---|---|---|
| User submits new image | unchanged | unchanged | `data[]` in user_images |
| Admin **approves** | ← set to new URL | ← `VERIFIED` | Both |
| Admin **rejects** | unchanged | unchanged | `data[]` in user_images |
| User **cancels** pending | unchanged | unchanged | `data[]` removed |

This means:
- The approved image is **always safe to display** from `currentInstituteImageUrl`
- Whether a submission is in-flight is determined by `data[0].status === "PENDING"`
- Rejection reason is in `data[0].rejectionReason` when `data[0].status === "REJECTED"`

---

## Full profile image upload flow (step by step)

This applies to both GLOBAL and INSTITUTE scope submissions.

```
1. User selects a photo
         │
         ▼
2. POST /api/upload/generate-signed-url
   { fileName, contentType }
   ◄── { uploadUrl, publicUrl }
         │
         ▼
3. PUT <uploadUrl>   (direct to cloud storage, no auth header)
   body = raw file bytes
         │
         ▼
4. POST /api/users/:id/profile-image
   { imageUrl: publicUrl, scope: "GLOBAL" }
   ◄── 200 { success: true }
         │
         ▼
5. Poll or re-fetch GET /api/users/profile/image-status
   Show "Under Review" badge until status changes
```

---

## Decision tree — which image to display

### Global profile image

```
Has currentImageUrl?
  ├─ YES → show currentImageUrl as the profile avatar
  └─ NO  → show placeholder / "Upload a photo" prompt

currentStatus?
  ├─ "PENDING"  → show "Under review" amber banner
  │               show pendingImageUrl (from image-status) as preview
  ├─ "REJECTED" → show "Rejected" red banner + rejectionReason from data[0]
  │               show re-upload button or link
  └─ "VERIFIED" → no banner needed
```

### Institute profile image

```
Has currentInstituteImageUrl?
  ├─ YES → show it as the institute avatar (this is always the approved image)
  └─ NO  → show placeholder

data[0].status?  (most recent submission in user_images)
  ├─ "PENDING"  → show amber "Under review" banner alongside the approved image
  │               optionally show data[0].imageUrl as preview of what was submitted
  │               show Cancel button
  ├─ "REJECTED" → show red banner + data[0].rejectionReason
  │               show Re-upload button
  └─ "VERIFIED" (or no data) → no banner
```

---

## Error reference

| Status | Message | Action |
|---|---|---|
| `400` | User not found | Check user ID in request |
| `400` | Image file not found in storage | Ensure the signed-URL upload completed before calling submit |
| `400` | No pending institute image found | Don't show delete button — refresh history |
| `401` | Unauthorized | JWT expired or missing — redirect to login |
| `429` | Too many requests | Show a cooldown message (5 uploads per 15 min) |

---

*Last updated: March 2026*
