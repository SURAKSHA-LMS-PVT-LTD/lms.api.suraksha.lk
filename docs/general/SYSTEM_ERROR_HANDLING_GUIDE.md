# System-Wide Error Handling — Frontend Implementation Guide

Every API endpoint in this system returns errors in the **same structured shape** regardless of which route
caused the error. This guide covers every possible error type, what each field means, and exactly how
to handle it in the frontend so users always see a clear, human-readable message.

---

## Universal Error Response Shape

```json
{
  "success": false,
  "statusCode": 400,
  "timestamp": "2026-03-11T08:30:00.000Z",
  "path": "/api/attendance/mark",
  "method": "POST",
  "message": "Start date must be a valid ISO 8601 date string (and 1 more issue)",
  "error": "ValidationError",
  "requestId": "req_1773167154040_ofHB4mbZ",
  "details": {
    "actionHint": "Please check the highlighted fields and correct the errors before submitting again.",
    "fields": [
      "startDate must be a valid ISO 8601 date string",
      "page must be a number"
    ]
  }
}
```

### Fields you can always rely on

| Field | Type | Always present | Purpose |
|---|---|---|---|
| `success` | `false` | ✅ | Always `false` on error |
| `statusCode` | number | ✅ | HTTP status code |
| `timestamp` | string | ✅ | Sri Lanka ISO datetime |
| `path` | string | ✅ | Route that caused the error |
| `message` | string | ✅ | **Primary user-facing message** — always a readable string |
| `error` | string | ✅ | Error category (see table below) |
| `requestId` | string | ✅ | Unique ID — show to user when asking them to report a bug |
| `details` | object | ❌ optional | Structured extra info — use when present |
| `details.actionHint` | string | ❌ optional | **Secondary user-facing guidance** — always show if present |
| `stack` | string | ❌ dev only | Stack trace — never shown in production |

> **Rule**: Always show `details.actionHint` if it exists. Otherwise show `message`.

---

## Universal Error Handler (copy-paste)

```typescript
interface ApiError {
  success: false;
  statusCode: number;
  message: string;
  error: string;
  requestId: string;
  timestamp: string;
  details?: {
    actionHint?: string;
    field?: string;
    fields?: string[];
    [key: string]: any;
  };
}

function handleApiError(err: ApiError, options?: {
  onField?: (field: string, message: string) => void;  // highlight a specific field
  onToast?: (message: string, severity: 'error' | 'warning') => void;
  onServerError?: (requestId: string) => void;
}): void {
  const userMessage = err.details?.actionHint ?? err.message;

  // 1. Field-level validation errors — highlight individual fields
  if (err.details?.fields?.length) {
    err.details.fields.forEach(fieldMsg => {
      // Field messages look like "startDate must be a valid ISO 8601 date string"
      // Extract the field name as the first word
      const fieldName = fieldMsg.split(' ')[0];
      options?.onField?.(fieldName, fieldMsg);
    });
    options?.onToast?.(userMessage, 'error');
    return;
  }

  // 2. Single field error
  if (err.details?.field) {
    options?.onField?.(err.details.field, userMessage);
    return;
  }

  // 3. Server error (500+) — generic message + requestId
  if (err.statusCode >= 500) {
    options?.onToast?.(
      `Something went wrong. Please try again. (Ref: ${err.requestId})`,
      'error'
    );
    options?.onServerError?.(err.requestId);
    return;
  }

  // 4. Anything else — show as toast
  options?.onToast?.(userMessage, 'error');
}
```

### React / React Hook Form example

```tsx
import { useForm } from 'react-hook-form';

const { setError, formState: { errors } } = useForm();

async function submit(data) {
  try {
    await api.post('/endpoint', data);
  } catch (e: any) {
    const err: ApiError = e.response?.data;
    if (!err) return;

    handleApiError(err, {
      onField: (field, msg) => setError(field as any, { message: msg }),
      onToast: (msg) => toast.error(msg),
    });
  }
}
```

---

## Error Categories — `error` field values

| `error` value | HTTP Code | Meaning | User-facing action |
|---|---|---|---|
| `ValidationError` | 400 | DTO field failed class-validator | Highlight the specific fields |
| `HttpException` | 400–422 | Manual validation in a pipe or service | Show `details.actionHint` or `message` |
| `RateLimitExceeded` | 429 | Too many requests in short time | Show "Please wait before trying again" |
| `Forbidden` | 403 | No permission for this action | Show the message — it is already safe |
| `EntityNotFoundError` | 404 | TypeORM + DB record not found | Show "Not found" |
| `DuplicateEntryError` | 409 | DB duplicate key | Show "This record already exists" |
| `ForeignKeyConstraintError` | 400 or 409 | DB FK violation | Show message |
| `DataTooLongError` | 400 | DB field overflow | Show message |
| `DatabaseError` | 500 | Unexpected DB error | Show generic + requestId |
| `UnknownError` | 500 | Unhandled exception | Show generic + requestId |

---

## Status Code Reference

### 400 — Bad Request

Multiple causes. Always check `error` field to distinguish:

**ValidationError** (from `class-validator`):
```json
{
  "message": "StartDate must be a valid ISO 8601 date string (and 1 more issue)",
  "error": "ValidationError",
  "details": {
    "actionHint": "Please check the highlighted fields and correct the errors before submitting again.",
    "fields": [
      "startDate must be a valid ISO 8601 date string",
      "page must be a number conforming to the specified constraints"
    ]
  }
}
```
→ Iterate `details.fields` and highlight each named field.

**HttpException** (business validation — pipe or service):
```json
{
  "message": "Start time is in the past",
  "error": "HttpException",
  "details": {
    "actionHint": "The start time you selected (Mar 10 at 06:25 AM UTC) has already passed...",
    "field": "startTime",
    "submittedStartTime": "2026-03-10T06:25:00.000Z",
    "serverTime": "2026-03-10T23:55:00.000Z"
  }
}
```
→ Use `details.field` to highlight the field. Use `details.actionHint` as the error text.

---

### 401 — Unauthorized

```json
{
  "message": "Invalid credentials",
  "error": "HttpException",
  "statusCode": 401
}
```

Common messages:
- `"Invalid credentials"` → Show login error
- `"User ID not found in token"` → Token is corrupt — force logout
- `"Authorization header is required"` → Intercept in axios/fetch and redirect to login
- `"Invalid token"` → Token expired or tampered — force logout and redirect

**Recommended**: Add a global HTTP interceptor that catches 401 responses and:
1. Tries to refresh the session via `POST /auth/refresh`
2. If refresh fails → clears tokens → redirects to `/login`

---

### 403 — Forbidden

```json
{
  "success": false,
  "statusCode": 403,
  "message": "You do not have permission to perform this action.",
  "error": "Forbidden"
}
```

In production the message is always one of these safe strings:
- `"You do not have permission to perform this action."`
- `"This device is not authorised to mark attendance. Please contact your administrator."`
- `"This attendance status is not permitted on your device."`
- `"You are not authorised to access this institute's data."`
- `"Your session or access has expired. Please log in again."`

→ Show the `message` directly as a toast. No need to map it further.

> **Note**: Origin/CORS blocks at the network level return an empty 403 body from the browser
> (not from this API). Those will never reach your API response handler.

---

### 404 — Not Found

```json
{
  "message": "The requested resource was not found",
  "error": "EntityNotFoundError",
  "statusCode": 404
}
```

Also `HttpException` with 404 status from service code, e.g.:
```json
{ "message": "Institute lecture not found", "error": "HttpException" }
```

→ Show the `message` directly.

---

### 409 — Conflict

```json
{
  "message": "Duplicate entry: A record with this information already exists",
  "error": "DuplicateEntryError",
  "details": "Field: users.email_UNIQUE"
}
```

→ Show the `message`. Optionally inspect `details` to highlight the duplicate field.

Common duplicate fields:
| `details` contains | User message |
|---|---|
| `email` | "An account with this email already exists" |
| `phoneNumber` | "An account with this phone number already exists" |
| `cardId` | "This card ID is already registered" |
| `instituteName` | "An institute with this name already exists" |

---

### 429 — Rate Limited

```json
{
  "message": "Too many requests. Please try again later.",
  "error": "RateLimitExceeded",
  "details": { "retryAfter": "60 seconds", "hint": "Please wait before making more requests" }
}
```

→ Show a countdown or the hint. Do NOT retry automatically — the user must wait.

Limits by endpoint category:
| Endpoint group | Limit |
|---|---|
| Attendance marking | 30 / minute |
| Auth / login | Configured per throttler |
| General API | Configured per throttler |

---

### 500 — Server Error

```json
{
  "message": "Internal server error occurred",
  "error": "UnknownError",
  "statusCode": 500,
  "requestId": "req_1773167154040_ofHB4mbZ"
}
```

→ Show: `"Something went wrong. Please try again. If the problem persists, mention reference: req_1773167154040_ofHB4mbZ"`

**Always show the `requestId` to the user** — it allows the support team to find the exact log entry.

---

## Global Axios Interceptor (recommended setup)

```typescript
import axios from 'axios';

const api = axios.create({ baseURL: '/api', withCredentials: true });

// Request: attach token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response: normalise errors
api.interceptors.response.use(
  res => res,
  async error => {
    const err: ApiError = error.response?.data;

    if (!err) {
      // Network error (no response) — likely CORS or offline
      throw { message: 'Unable to connect to server. Please check your internet connection.', statusCode: 0 };
    }

    // 401 — try token refresh
    if (err.statusCode === 401 && !error.config._retried) {
      error.config._retried = true;
      try {
        await api.post('/auth/refresh');
        return api(error.config);   // retry original request
      } catch {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return Promise.reject(err);
      }
    }

    // 429 — surface rate limit to UI
    if (err.statusCode === 429) {
      showToast('error', 'Too many requests. Please wait a moment and try again.');
    }

    // Throw normalised error for per-call catch blocks
    return Promise.reject(err);
  }
);
```

---

## Quick Cheat-Sheet

```typescript
// Minimal one-liner for any catch block:
catch (e: any) {
  const err: ApiError = e.response?.data ?? e;
  const msg = err?.details?.actionHint ?? err?.message ?? 'An unexpected error occurred';
  const reqId = err?.requestId;

  if (err?.statusCode >= 500) {
    toast.error(`Something went wrong. Reference: ${reqId}`);
  } else {
    toast.error(msg);
  }
}
```

---

## Environment Notes

The server runs in **Sri Lanka time (UTC+5:30)** but all timestamps in the API are **UTC ISO strings**
(they end in `Z`). Convert for display:

```typescript
// Display a UTC ISO timestamp in the user's local time
const local = new Date(record.markedAt).toLocaleString();

// Display an attendance date (YYYY-MM-DD) as-is — it IS the Sri Lanka date
const dateLabel = record.date; // e.g. "2026-03-11" — already Sri Lanka date
```

When sending dates/times to the API, always send **UTC ISO strings**:
```typescript
// ✅ Correct
const startTimeUTC = new Date(pickerValue).toISOString(); // "2026-03-11T06:25:00.000Z"

// ❌ Wrong — treated as UTC by the server, will be 5h30m off
const startTimeLocal = "2026-03-11T11:55:00";  // no "Z"
```
