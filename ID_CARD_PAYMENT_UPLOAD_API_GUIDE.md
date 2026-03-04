# ID Card Payment Upload API Guide

This document covers all APIs for submitting payment proof for an ID card order.  
Two upload methods are supported:

| Method | Storage | Flow Summary |
|---|---|---|
| **Cloud Storage** | S3 or GCS (server-managed) | Get signed URL → upload directly from browser → confirm |
| **Google Drive** | User's own Google Drive | Get Drive token → upload from browser → register here |

---

## Table of Contents

1. [Cloud Storage Flow](#1-cloud-storage-flow-s3--gcs)  
2. [Google Drive Flow](#2-google-drive-flow)  
3. [Submit Payment (Cloud Storage)](#3-submit-payment-cloud-storage)  
4. [Submit Payment (Google Drive)](#4-submit-payment-google-drive)  
5. [View Payment Slip](#5-view-payment-slip-cloud-storage)  
6. [Admin: Verify / Reject Payment](#6-admin-verify--reject-payment)  
7. [Response Shape](#7-payment-response-shape)  
8. [Error Reference](#8-error-reference)

---

## 1. Cloud Storage Flow (S3 / GCS)

```
Step 1:  POST /user-card/orders/:orderId/payment-slip/upload-url
         → backend returns a time-limited (15 min) signed upload URL

Step 2:  Browser/app PUTs or POSTs the file directly to that URL
         (no auth header needed; the URL itself carries credentials)

Step 3:  POST /user-card/orders/:orderId/payment-slip/verify
         → optional: confirm the file was received

Step 4:  POST /user-card/orders/:orderId/payment
         → create CloudPayment record with submissionUrl = relativePath
```

### Step 1 – Generate Signed Upload URL

```
POST /user-card/orders/:orderId/payment-slip/upload-url
Authorization: Bearer <jwt>
```

**Request body:**
```json
{
  "fileName": "receipt-march.pdf",
  "contentType": "application/pdf"
}
```

| Field | Required | Allowed values |
|---|---|---|
| `fileName` | ✓ | Any filename with valid extension |
| `contentType` | ✓ | `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `application/pdf` |

**Response `201`:**
```json
{
  "uploadUrl": "https://storage.googleapis.com/bucket/payment-slips/...?X-Goog-Signature=...",
  "relativePath": "payment-slips/private/<userId>/<orderId>/receipt-march.pdf",
  "expiresAt": "2025-03-04T06:00:00.000Z",
  "maxFileSize": 10485760,
  "contentType": "application/pdf",
  "instructions": "Use PUT request to upload file to the uploadUrl with Content-Type header"
}
```

### Step 2 – Upload via browser (no backend involvement)

**For GCS (PUT):**
```javascript
await fetch(uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': contentType },
  body: file,
});
```

**For AWS S3 (POST multipart — fields included in response):**
```javascript
// If the response includes a `fields` object, use a FormData POST
const formData = new FormData();
Object.entries(fields).forEach(([k, v]) => formData.append(k, v));
formData.append('file', file);
await fetch(uploadUrl, { method: 'POST', body: formData });
```

> **Tip:** Check whether the response contains a `fields` property to determine which method to use.

### Step 3 – Verify Upload (optional)

```
POST /user-card/orders/:orderId/payment-slip/verify
Authorization: Bearer <jwt>
```

```json
{ "relativePath": "payment-slips/private/<userId>/<orderId>/receipt-march.pdf" }
```

**Response `200`:**
```json
{
  "success": true,
  "metadata": {
    "size": 204800,
    "contentType": "application/pdf",
    "uploaded": "2025-03-04T05:45:12.000Z"
  }
}
```

### Step 4 – Get Signed View URL

```
GET /user-card/orders/:orderId/payment-slip/view-url?relativePath=<path>
Authorization: Bearer <jwt>
```

**Response `200`:**
```json
{
  "viewUrl": "https://storage.googleapis.com/bucket/...?X-Goog-Signature=...",
  "expiresAt": "2025-03-04T07:00:00.000Z"
}
```

---

## 2. Google Drive Flow

```
Step 1:  GET /drive-access/token
         → backend returns a short-lived Google OAuth access token

Step 2:  GET /drive-access/folder?purpose=ID_CARD_PAYMENT
         → backend creates / returns the organised Drive folder

Step 3:  Browser uploads file directly to Drive using the access token
         (Google returns { id, webViewLink })

Step 4:  POST /user-card/orders/:orderId/payment/drive
         → register the Drive file and create the payment record
```

### Step 1 – Get Drive Access Token

```
GET /drive-access/token
Authorization: Bearer <jwt>
```

**Response `200`:**
```json
{
  "accessToken": "ya29.a0AfH6SM...",
  "expiresAt": "2025-03-04T06:05:00.000Z"
}
```

### Step 2 – Get / Create Upload Folder

```
GET /drive-access/folder?purpose=ID_CARD_PAYMENT
Authorization: Bearer <jwt>
```

**Response `200`:**
```json
{
  "folderId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "folderPath": "Suraksha LMS/ID Card Payment Receipts"
}
```

### Step 3 – Upload Directly to Drive (browser)

```javascript
// Multipart upload – creates file and sets metadata in one request
const metadata = {
  name: 'payment-receipt-march.pdf',
  parents: [folderId],
};

const form = new FormData();
form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
form.append('file', file);

const res = await fetch(
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  },
);
const { id: driveFileId, webViewLink: driveWebViewLink } = await res.json();
```

---

## 3. Submit Payment (Cloud Storage)

After uploading the file to cloud storage, create the payment record.

```
POST /user-card/orders/:orderId/payment
Authorization: Bearer <jwt>
```

**Request body:**
```json
{
  "submissionUrl": "payment-slips/private/<userId>/<orderId>/receipt-march.pdf",
  "paymentType": "BANK_TRANSFER",
  "paymentAmount": 500.00,
  "paymentReference": "TXN-2025-001234",
  "notes": "March payment"
}
```

| Field | Required | Notes |
|---|---|---|
| `submissionUrl` | ✓ | `relativePath` value returned by Step 1 |
| `paymentType` | ✓ | See `CardPaymentType` enum |
| `paymentAmount` | ✓ | Decimal ≥ 0 |
| `paymentReference` | – | Bank/transaction reference number |
| `notes` | – | Free-text note |

**Response `201`:** See [Payment Response Shape](#7-payment-response-shape).

---

## 4. Submit Payment (Google Drive)

After uploading to Drive and receiving `driveFileId` + `driveWebViewLink`, register the payment.

```
POST /user-card/orders/:orderId/payment/drive
Authorization: Bearer <jwt>
```

**Request body:**
```json
{
  "driveFileId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "driveWebViewLink": "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/view",
  "driveFileName": "payment-receipt-march.pdf",
  "paymentType": "BANK_TRANSFER",
  "paymentAmount": 500.00,
  "paymentReference": "TXN-2025-001234",
  "notes": "March payment"
}
```

| Field | Required | Notes |
|---|---|---|
| `driveFileId` | ✓ | Google Drive file ID from Drive API |
| `driveWebViewLink` | ✓ | Google Drive view URL |
| `driveFileName` | – | Original file name |
| `paymentType` | ✓ | See `CardPaymentType` enum |
| `paymentAmount` | ✓ | Decimal ≥ 0 |
| `paymentReference` | – | Bank/transaction reference |
| `notes` | – | Free-text note |

**Response `201`:** See [Payment Response Shape](#7-payment-response-shape).

---

## 5. View Payment Slip (Cloud Storage)

Generates a time-limited signed URL to view/download the stored file.

```
GET /user-card/orders/:orderId/payment-slip/view-url?relativePath=<path>
Authorization: Bearer <jwt>
```

**For Google Drive payments** the `driveWebViewLink` returned in the payment record can be used directly — no extra API call needed.

---

## 6. Admin: Verify / Reject Payment

```
PATCH /admin-card/payments/:paymentId/verify   (admin role required)
Authorization: Bearer <jwt>
```

**Request body:**
```json
{
  "paymentStatus": "VERIFIED",
  "notes": "Bank transfer confirmed"
}
```

or to reject:

```json
{
  "paymentStatus": "REJECTED",
  "rejectionReason": "Amount does not match order total"
}
```

**Response `200`:** Updated [Payment Response Shape](#7-payment-response-shape).

---

## 7. Payment Response Shape

All payment endpoints return the same object:

```json
{
  "id": "12",
  "orderId": "7",
  "submissionUrl": "payment-slips/private/.../receipt.pdf",
  "uploadMethod": "CLOUD_STORAGE",
  "driveFileId": null,
  "driveWebViewLink": null,
  "driveFileName": null,
  "paymentType": "BANK_TRANSFER",
  "paymentAmount": 500,
  "paymentReference": "TXN-2025-001234",
  "paymentStatus": "PENDING",
  "verifiedBy": null,
  "verifiedAt": null,
  "rejectionReason": null,
  "notes": "March payment",
  "createdAt": "2025-03-04T05:45:00.000Z",
  "updatedAt": "2025-03-04T05:45:00.000Z"
}
```

**`uploadMethod` values:**

| Value | Meaning |
|---|---|
| `CLOUD_STORAGE` | File stored in S3/GCS; use `submissionUrl` + view-url endpoint |
| `GOOGLE_DRIVE` | File stored in user's Drive; `driveWebViewLink` is directly usable |

**`paymentStatus` values:**

| Value | Meaning |
|---|---|
| `PENDING` | Submitted, awaiting admin review |
| `VERIFIED` | Admin approved |
| `REJECTED` | Admin rejected; see `rejectionReason` |

---

## 8. Error Reference

| HTTP | Code | Reason |
|---|---|---|
| 400 | BadRequest | Invalid content type / extension mismatch / payment already submitted |
| 400 | BadRequest | Order is not in `PENDING_PAYMENT` status |
| 401 | Unauthorized | JWT missing or expired |
| 404 | NotFound | Order not found or does not belong to user |

---

## Complete Frontend Example (Google Drive)

```typescript
const BASE = 'https://your-api.com';
const token = 'Bearer <jwt>';

async function payViaGoogleDrive(orderId: string, file: File) {
  // 1. Get Drive access token
  const { accessToken } = await fetch(`${BASE}/drive-access/token`, {
    headers: { Authorization: token },
  }).then(r => r.json());

  // 2. Get / create upload folder
  const { folderId } = await fetch(
    `${BASE}/drive-access/folder?purpose=ID_CARD_PAYMENT`,
    { headers: { Authorization: token } },
  ).then(r => r.json());

  // 3. Upload to Drive
  const meta = { name: file.name, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', file);

  const driveRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form },
  ).then(r => r.json());

  // 4. Register payment
  const payment = await fetch(`${BASE}/user-card/orders/${orderId}/payment/drive`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      driveFileId: driveRes.id,
      driveWebViewLink: driveRes.webViewLink,
      driveFileName: file.name,
      paymentType: 'BANK_TRANSFER',
      paymentAmount: 500,
      paymentReference: 'TXN-2025-001234',
    }),
  }).then(r => r.json());

  return payment;
}
```

## Complete Frontend Example (Cloud Storage)

```typescript
async function payViaCloudStorage(orderId: string, file: File) {
  // 1. Get signed upload URL
  const uploadData = await fetch(
    `${BASE}/user-card/orders/${orderId}/payment-slip/upload-url`,
    {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentType: file.type }),
    },
  ).then(r => r.json());

  // 2. Upload file directly
  if (uploadData.fields) {
    // AWS S3 presigned POST
    const form = new FormData();
    Object.entries(uploadData.fields).forEach(([k, v]) => form.append(k, v as string));
    form.append('file', file);
    await fetch(uploadData.uploadUrl, { method: 'POST', body: form });
  } else {
    // GCS signed PUT
    await fetch(uploadData.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
  }

  // 3. Submit payment record
  const payment = await fetch(`${BASE}/user-card/orders/${orderId}/payment`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      submissionUrl: uploadData.relativePath,
      paymentType: 'BANK_TRANSFER',
      paymentAmount: 500,
      paymentReference: 'TXN-2025-001234',
    }),
  }).then(r => r.json());

  return payment;
}
```
