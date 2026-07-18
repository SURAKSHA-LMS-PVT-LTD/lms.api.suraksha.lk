# Enrollment Key Update API Guide

## Overview

This guide documents the new API endpoint for updating the enrollment key of a class subject. Institute Admins and Teachers (assigned to the subject) can update the enrollment key directly via a dedicated `PATCH` endpoint.

---

## Endpoint

```
PATCH /institutes/:instituteId/classes/:classId/subjects/:subjectId/enrollment-key
```

### URL Parameters

| Parameter     | Type   | Required | Description                        |
|---------------|--------|----------|------------------------------------|
| `instituteId` | BigInt | Yes      | ID of the institute                |
| `classId`     | BigInt | Yes      | ID of the class                    |
| `subjectId`   | BigInt | Yes      | ID of the subject in the class     |

---

## Authorization

| Role           | Access | Notes                                                        |
|----------------|--------|--------------------------------------------------------------|
| `SUPERADMIN`   | ✅ Yes  | Full access                                                  |
| `InstituteAdmin` | ✅ Yes | Must belong to the institute                                 |
| `Teacher`      | ✅ Yes | Must be assigned to the class **and** subject (`requireClass: true, requireSubject: true`) |
| `Student`      | ❌ No  | Not permitted                                                |
| `Parent`       | ❌ No  | Not permitted                                                |

> **Authentication:** Bearer JWT token required (`Authorization: Bearer <token>`)

---

## Request Body

**DTO:** `UpdateEnrollmentKeyDto`

```json
{
  "enrollmentEnabled": true,
  "enrollmentKey": "ABC123"
}
```

### Fields

| Field             | Type    | Required | Description                                                                             |
|-------------------|---------|----------|-----------------------------------------------------------------------------------------|
| `enrollmentEnabled` | boolean | **Yes**  | Set `true` to enable self-enrollment, `false` to disable                               |
| `enrollmentKey`   | string  | No       | Key students must provide to enroll. Omit or set `null` for **open** (keyless) enrollment. Automatically cleared when `enrollmentEnabled` is `false`. |

---

## Enrollment Behavior

| `enrollmentEnabled` | `enrollmentKey`  | Result                              |
|---------------------|------------------|-------------------------------------|
| `true`              | `"ABC123"`       | Key-protected enrollment            |
| `true`              | omitted / `null` | Open enrollment (no key required)   |
| `false`             | any / omitted    | Enrollment disabled, key cleared    |

---

## Response

**HTTP 200 OK**

```json
{
  "subjectId": "42",
  "enrollmentEnabled": true,
  "enrollmentKey": "ABC123"
}
```

When enrollment is disabled:

```json
{
  "subjectId": "42",
  "enrollmentEnabled": false,
  "enrollmentKey": null
}
```

### Response Fields

| Field               | Type    | Description                                                      |
|---------------------|---------|------------------------------------------------------------------|
| `subjectId`         | string  | The ID of the subject                                            |
| `enrollmentEnabled` | boolean | Whether enrollment is currently enabled                          |
| `enrollmentKey`     | string \| null | The enrollment key, or `null` if open/disabled          |

---

## Error Responses

| HTTP Status | Description                                                                 |
|-------------|-----------------------------------------------------------------------------|
| `400`       | Validation error — `enrollmentEnabled` missing or invalid field types       |
| `403`       | Access denied — user is not an Institute Admin or assigned Teacher          |
| `404`       | Subject assignment not found for the given institute/class/subject IDs      |
| `401`       | Unauthorized — missing or invalid JWT token                                 |

---

## Example Requests

### Enable enrollment with a key

```http
PATCH /institutes/1/classes/5/subjects/42/enrollment-key
Authorization: Bearer <token>
Content-Type: application/json

{
  "enrollmentEnabled": true,
  "enrollmentKey": "MATH2026"
}
```

### Enable open enrollment (no key)

```http
PATCH /institutes/1/classes/5/subjects/42/enrollment-key
Authorization: Bearer <token>
Content-Type: application/json

{
  "enrollmentEnabled": true
}
```

### Disable enrollment

```http
PATCH /institutes/1/classes/5/subjects/42/enrollment-key
Authorization: Bearer <token>
Content-Type: application/json

{
  "enrollmentEnabled": false
}
```

---

## Related Endpoints

| Method  | Endpoint                                                      | Description                                 |
|---------|---------------------------------------------------------------|---------------------------------------------|
| `GET`   | `/institutes/:instituteId/classes/:classId/subjects/:subjectId/enrollment-key` | Get current enrollment key and status |
| `PATCH` | `/institutes/:instituteId/classes/:classId/subjects/:subjectId` | General subject update (isActive, teacherId, etc.) |
| `POST`  | `/institutes/:instituteId/classes/:classId/subjects/self-enroll-teacher` | Teacher self-enrollment using the key |

---

## Files Modified

| File | Change |
|------|--------|
| `src/modules/institute_class_modules/institute_class_subject/dto/update-institute_class_subject.dto.ts` | Added `UpdateEnrollmentKeyDto` class |
| `src/modules/institute_class_modules/institute_class_subject/institute_class_subject.controller.ts` | Added `PATCH :subjectId/enrollment-key` endpoint |
| `src/modules/institute_class_modules/institute_class_subject/institute_class_subject.service.ts` | Added `updateEnrollmentKey()` service method |
