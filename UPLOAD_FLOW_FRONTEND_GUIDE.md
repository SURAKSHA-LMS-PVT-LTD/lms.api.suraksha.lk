# Upload Flow Frontend Implementation Guide

Two upload flows exist in the app:

1. **Public file upload** — for profile images, institute images, homework, etc.
2. **Payment slip upload** — private upload via AWS S3 presigned POST

Both were broken. This guide shows the **correct** implementation for each.

---

## Issue 1 — Profile Image Upload (400: Image file not found)

### What was happening

```
GET  /upload/get-signed-url?folder=profile-images&fileName=...   ✅
PUT  <signedUrl>  (upload file directly to S3)                   ✅
POST /upload/verify-and-publish  { relativePath }                ✅
POST /users/2/profile-image  { imageUrl: "https://storage.suraksha.lk/profile-images/Screenshot 2025..." }  ❌ 400
```

The `publicUrl` returned by `verify-and-publish` contained **literal spaces** (e.g. `Screenshot 2025-03-29.png`).  
The backend then tried to look up the S3 object using the URL-encoded path (`Screenshot%202025-03-29.png`) which didn't match the actual S3 key (`Screenshot 2025-03-29.png`) → **file not found → 400**.

### Backend fix applied

- `stripBaseUrl()` now calls `decodeURIComponent()` on the extracted path so it matches the actual S3 key.
- `getFullUrl()` now encodes each path segment with `encodeURIComponent()` so all returned URLs are always RFC-valid.

### What the frontend must do

**Step 1 — Get signed upload URL**
```ts
const params = new URLSearchParams({
  folder: 'profile-images',
  fileName: file.name,           // original filename, spaces are fine
  contentType: file.type,
  fileSize: String(file.size),
});

const res = await fetch(`/upload/get-signed-url?${params}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const { uploadUrl, relativePath } = await res.json();
```

**Step 2 — Upload to S3 (PUT)**
```ts
// For GCS-signed URLs use PUT; for S3 GET-signed URLs also PUT
// The signed-url flow uses PUT (not multipart POST)
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': file.type },
  body: file,
});
```

> ⚠️ Do NOT set any other headers. Do NOT use FormData here.

**Step 3 — Verify and publish**
```ts
const verifyRes = await fetch('/upload/verify-and-publish', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ relativePath }),   // ← use relativePath, NOT the uploadUrl
});
const { publicUrl } = await verifyRes.json();
```

**Step 4 — Save to profile**
```ts
await fetch(`/users/${userId}/profile-image`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ imageUrl: publicUrl }),
});
```

**Important**: Use the `publicUrl` from Step 3 — do NOT send the raw S3 URL or the `uploadUrl`. The backend verifies the file using `relativePath` extracted from `publicUrl`.

---

## Issue 2 — Payment Slip Upload (403 from S3)

### What was happening

```
POST /user-card/orders/5/payment-slip/upload-url  → returns { uploadUrl, fields, ... }

Frontend was doing:
PUT <uploadUrl> with file body   ❌ 403 Forbidden
```

S3 payment-slip uploads use **presigned POST** (multipart form), not PUT.  
The backend signs a policy that requires a specific `FormData` structure — a plain PUT is rejected.

### Correct implementation

```ts
// 1. Get the presigned POST data
const res = await fetch(`/user-card/orders/${orderId}/payment-slip/upload-url`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    fileName: file.name,
    contentType: file.type,     // must match the field sent to the server
  }),
});

const uploadData = await res.json();
// uploadData shape:
// {
//   uploadUrl: "https://suraksha-lms-main-bucket.s3.us-east-1.amazonaws.com/",
//   relativePath: "payment-slips/private/...",
//   expiresAt: "...",
//   maxFileSize: 10485760,
//   contentType: "image/jpeg",
//   fields: {                          ← only present for S3 presigned POST
//     "key": "payment-slips/private/...",
//     "Content-Type": "image/jpeg",
//     "x-amz-server-side-encryption": "AES256",
//     "Policy": "...",
//     "X-Amz-Signature": "...",
//     "X-Amz-Algorithm": "...",
//     "X-Amz-Credential": "...",
//     "X-Amz-Date": "..."
//   }
// }

// 2. Upload using the correct method
await uploadViaCloudStorage(file, uploadData);

// 3. Confirm the upload with the backend
await fetch(`/user-card/orders/${orderId}/payment-slip`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ relativePath: uploadData.relativePath }),
});
```

### `uploadViaCloudStorage` function

**This is the critical function that was wrong.** Replace it entirely:

```ts
async function uploadViaCloudStorage(
  file: File,
  uploadData: {
    uploadUrl: string;
    contentType: string;
    fields?: Record<string, string>;
  }
): Promise<void> {
  if (uploadData.fields) {
    // ─── AWS S3 Presigned POST ───────────────────────────────────────────────
    // Must use multipart/form-data. All fields from the server come FIRST,
    // then the file (named "file") comes LAST. Order matters for S3.
    const formData = new FormData();

    for (const [key, value] of Object.entries(uploadData.fields)) {
      formData.append(key, value);
    }
    formData.append('file', file);    // MUST be last

    const response = await fetch(uploadData.uploadUrl, {
      method: 'POST',               // POST, not PUT
      body: formData,
      // ⚠️ DO NOT set Content-Type header manually.
      // The browser must set it automatically with the correct multipart boundary.
    });

    // S3 returns 204 No Content on success (not 200)
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to upload file to storage: ${response.status} ${text}`);
    }
  } else {
    // ─── GCS / Other Presigned PUT ───────────────────────────────────────────
    const response = await fetch(uploadData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': uploadData.contentType },
      body: file,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload file to storage: ${response.status}`);
    }
  }
}
```

### Key rules for S3 presigned POST

| Rule | Detail |
|---|---|
| Method | `POST` (not `PUT`) |
| Body | `FormData` (not raw file) |
| Field order | All `fields` from server first, then `file` field last |
| File field name | Must be `"file"` |
| `Content-Type` header | **DO NOT set** — browser sets it automatically with boundary |
| Success status | `204 No Content` (not `200`) — use `response.ok` not `response.status === 200` |

---

## Detection pattern

The backend may switch between GCS (PUT) and S3 (POST) depending on environment.  
Always detect at runtime using the `fields` property:

```ts
if (uploadData.fields) {
  // S3 presigned POST → use FormData + POST
} else {
  // GCS presigned URL → use raw body + PUT
}
```

---

## Summary

| Endpoint | Issue | Fix |
|---|---|---|
| `POST /users/:id/profile-image` | 400 "file not found" — spaces in filename caused S3 key mismatch | Backend fixed. No frontend change needed for the 400. |
| Payment slip upload | 403 from S3 — frontend used PUT instead of multipart POST | Use `uploadViaCloudStorage` from this guide. |
