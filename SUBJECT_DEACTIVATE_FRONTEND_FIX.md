# Subject Deactivation — Frontend Fix Guide

## Error

```
PATCH /subjects/12/deactivate → 400 Bad Request
"instituteId is required"
```

## Root Cause

The backend endpoint requires `instituteId` as a **query parameter**, but the frontend is calling it without one.

**Current frontend call** (broken):
```
PATCH https://lmsapi.suraksha.lk/subjects/12/deactivate
```

**Expected call**:
```
PATCH https://lmsapi.suraksha.lk/subjects/12/deactivate?instituteId=123
```

---

## Backend Endpoint Spec

```
PATCH /subjects/:id/deactivate?instituteId=<instituteId>
```

| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| `id` | Path | string (BigInt) | ✅ | Subject ID |
| `instituteId` | Query | string | ✅ | Institute ID (used for access control guard) |

**Auth**: JWT + Role (SUPERADMIN or Institute Admin of the given institute)

### Success Response

```json
{
  "id": "12",
  "name": "Mathematics",
  "instituteId": "123",
  "classId": "456",
  "isActive": false
}
```

### Error Response (missing instituteId)

```json
{
  "statusCode": 400,
  "message": "instituteId is required",
  "error": "Bad Request"
}
```

---

## Frontend Fix

### File: `subjects.api.ts` (line ~214)

**Before** (broken):
```typescript
// Missing instituteId query parameter
export const deactivate = async (subjectId: number | string) => {
  return apiClient.patch(`/subjects/${subjectId}/deactivate`);
};
```

**After** (fixed):
```typescript
export const deactivate = async (subjectId: number | string, instituteId: number | string) => {
  return apiClient.patch(`/subjects/${subjectId}/deactivate?instituteId=${instituteId}`);
};
```

### File: `InstituteSubjects.tsx` (line ~332)

**Before** (broken):
```typescript
const confirmDeactivateSubject = async () => {
  try {
    await deactivate(selectedSubject.id);
    // ...
  } catch (error) {
    console.error('Error deactivating subject:', error);
  }
};
```

**After** (fixed):
```typescript
const confirmDeactivateSubject = async () => {
  try {
    // Pass the current institute's ID from context/props/state
    await deactivate(selectedSubject.id, instituteId);
    // ...
  } catch (error) {
    console.error('Error deactivating subject:', error);
  }
};
```

> **Note**: `instituteId` should come from the component's context, route params, or the selected subject's `instituteId` property (e.g., `selectedSubject.instituteId`).

---

## Why `instituteId` Is Required

The backend uses `FlexibleAccessGuard` with `@RequireAnyOfRoles({ instituteAdmin: true })`. The guard reads `instituteId` from the query string to verify that the authenticated user has institute admin access to **that specific institute**. Without it, the guard cannot perform the authorization check.

The actual deactivation logic derives the institute from the subject entity itself (secure — prevents spoofing), but the guard still needs the query param for the initial access check.

---

## Other Subject Endpoints That Also Require `instituteId` as Query Param

Check these endpoints in your frontend to ensure `instituteId` is passed consistently:

| Method | Endpoint | `instituteId` Location |
|--------|----------|----------------------|
| `GET` | `/subjects` | Query param |
| `GET` | `/subjects/:id` | Query param |
| `POST` | `/subjects` | Request body |
| `PATCH` | `/subjects/:id` | Query param |
| `PATCH` | `/subjects/:id/deactivate` | Query param ✅ **fix this** |
| `PATCH` | `/subjects/:id/activate` | Query param (verify) |
| `DELETE` | `/subjects/:id` | Query param (verify) |
