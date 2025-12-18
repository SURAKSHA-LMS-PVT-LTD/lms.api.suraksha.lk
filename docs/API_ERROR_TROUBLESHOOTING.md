# API Error Troubleshooting Guide

## Common 400 Bad Request Errors

### `/institute-users/institute/:id/assign-student-by-rfid` Endpoint

#### Error Response
```json
{
    "success": false,
    "statusCode": 400,
    "timestamp": "2025-10-18T21:05:04.744Z",
    "path": "/institute-users/institute/1/assign-student-by-rfid",
    "method": "POST",
    "message": "Bad Request",
    "error": "HttpException",
    "requestId": "err_1760821504744_va3upna6f",
    "details": {
        "message": "Bad Request",
        "statusCode": 400
    }
}
```

#### Common Causes

1. **Missing Required Fields**
   - `rfid` is required
   - `instituteUserType` is required

2. **Invalid Field Values**
   - `instituteUserType` must be one of: `STUDENT`, `TEACHER`, `INSTITUTE_ADMIN`, `ATTENDANCE_MARKER`
   - `rfid` must be a non-empty string

3. **Invalid Optional Fields**
   - `userIdByInstitute` must match pattern: `/^[A-Za-z0-9\-_\/\.]{1,50}$/`

#### Correct Request Format

**Endpoint:** `POST /institute-users/institute/:instituteId/assign-student-by-rfid`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**URL Parameters:**
- `instituteId` (required): The institute ID (numeric string)

**Request Body:**
```json
{
  "rfid": "RFID123456789",
  "instituteUserType": "STUDENT",
  "userIdByInstitute": "STU2024001"
}
```

**Required Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rfid` | string | ✅ Yes | RFID tag identifier registered in the system |
| `instituteUserType` | enum | ✅ Yes | Role in institute: STUDENT, TEACHER, INSTITUTE_ADMIN, or ATTENDANCE_MARKER |
| `userIdByInstitute` | string | ❌ No | Institute-specific ID (admission number, roll number, etc.) |

#### Valid `instituteUserType` Values

```typescript
enum InstituteUserType {
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
  INSTITUTE_ADMIN = 'INSTITUTE_ADMIN',
  ATTENDANCE_MARKER = 'ATTENDANCE_MARKER'
}
```

#### Example Requests

**Minimal Request (Required fields only):**
```bash
curl -X POST https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rfid": "RFID123456789",
    "instituteUserType": "STUDENT"
  }'
```

**Full Request (With optional fields):**
```bash
curl -X POST https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rfid": "RFID123456789",
    "instituteUserType": "STUDENT",
    "userIdByInstitute": "STU2024001"
  }'
```

#### Success Response

```json
{
  "success": true,
  "message": "Student John Doe successfully assigned to institute with ID: STU2024001",
  "userId": "123",
  "instituteId": "1",
  "userIdByInstitute": "STU2024001"
}
```

#### Possible Error Responses

1. **Student Not Found**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Student with RFID RFID123456789 not found"
}
```

2. **Already Assigned**
```json
{
  "success": false,
  "statusCode": 409,
  "message": "User is already assigned to this institute as STUDENT"
}
```

3. **Invalid Role**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid institute user type. Must be one of: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER"
}
```

4. **Missing Required Field (Development Mode)**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    "rfid is required",
    "Institute user type is required. Must be one of: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER"
  ]
}
```

5. **Missing Required Field (Production Mode)**
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Bad Request"
}
```

---

## Debugging in Production

### Enable Detailed Validation Errors Temporarily

**⚠️ WARNING: Only do this temporarily for debugging!**

In `.env`, change:
```env
NODE_ENV=development
```

Then restart the server. You'll see detailed validation errors like:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    "rfid should not be empty",
    "rfid must be a string",
    "Institute user type is required. Must be one of: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER"
  ]
}
```

**Don't forget to change it back to production:**
```env
NODE_ENV=production
```

---

## Testing the Endpoint

### Step 1: Get a Valid JWT Token

```bash
curl -X POST https://api.suraksha.lk/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+94771234567",
    "password": "your_password"
  }'
```

Save the `accessToken` from the response.

### Step 2: Test the Endpoint

```bash
curl -X POST https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rfid": "RFID123456789",
    "instituteUserType": "STUDENT",
    "userIdByInstitute": "STU2024001"
  }' | json_pp
```

### Step 3: Verify with Postman

1. **Method:** POST
2. **URL:** `https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid`
3. **Headers:**
   - `Authorization`: `Bearer YOUR_ACCESS_TOKEN`
   - `Content-Type`: `application/json`
4. **Body (raw JSON):**
```json
{
  "rfid": "RFID123456789",
  "instituteUserType": "STUDENT",
  "userIdByInstitute": "STU2024001"
}
```

---

## Common Mistakes

### 1. Forgetting Required Fields

❌ **Wrong:**
```json
{
  "rfid": "RFID123456789"
}
```

✅ **Correct:**
```json
{
  "rfid": "RFID123456789",
  "instituteUserType": "STUDENT"
}
```

### 2. Wrong Enum Value

❌ **Wrong:**
```json
{
  "rfid": "RFID123456789",
  "instituteUserType": "student"  // lowercase not allowed
}
```

✅ **Correct:**
```json
{
  "rfid": "RFID123456789",
  "instituteUserType": "STUDENT"  // UPPERCASE
}
```

### 3. Invalid Institute User ID Format

❌ **Wrong:**
```json
{
  "rfid": "RFID123456789",
  "instituteUserType": "STUDENT",
  "userIdByInstitute": "STU@2024#001"  // @ and # not allowed
}
```

✅ **Correct:**
```json
{
  "rfid": "RFID123456789",
  "instituteUserType": "STUDENT",
  "userIdByInstitute": "STU-2024/001"  // Letters, numbers, -, _, /, . allowed
}
```

### 4. Missing Authorization Header

❌ **Wrong:**
```bash
curl -X POST https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid \
  -H "Content-Type: application/json" \
  -d '{"rfid": "RFID123456789", "instituteUserType": "STUDENT"}'
```

✅ **Correct:**
```bash
curl -X POST https://api.suraksha.lk/institute-users/institute/1/assign-student-by-rfid \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rfid": "RFID123456789", "instituteUserType": "STUDENT"}'
```

---

## Quick Checklist

Before making a request, verify:

- [ ] JWT token is valid and not expired
- [ ] `Authorization: Bearer TOKEN` header is present
- [ ] `Content-Type: application/json` header is present
- [ ] Request body is valid JSON
- [ ] `rfid` field is present and not empty
- [ ] `instituteUserType` field is present and is one of: `STUDENT`, `TEACHER`, `INSTITUTE_ADMIN`, `ATTENDANCE_MARKER`
- [ ] `instituteId` in URL is a valid number
- [ ] User with the given RFID exists in the system
- [ ] User is not already assigned to the institute with the same role

---

## Getting Help

If you're still getting 400 errors:

1. **Check the server logs** for detailed error messages
2. **Temporarily enable development mode** to see validation details
3. **Use API documentation** at `https://api.suraksha.lk/api-docs`
4. **Test with minimal request** (only required fields)
5. **Verify JWT token** is not expired

---

**Last Updated:** October 19, 2025
