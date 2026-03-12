# Frontend Implementation Guide — `nameWithInitials` Field (Complete Reference)

> **Purpose:** All user-facing API responses now include a `nameWithInitials` field alongside the existing `firstName`, `lastName`, and `name`/`fullName` fields. This guide explains what the field is, where it appears in each API response, and how to display it correctly in the frontend.

---

## Table of Contents

1. [What Is `nameWithInitials`?](#1-what-is-nameinitials)
2. [Recommended Display Priority](#2-recommended-display-priority)
3. [Quick Reference — Where It Appears](#3-quick-reference--where-it-appears)
4. [API Endpoint Breakdown](#4-api-endpoint-breakdown)
5. [Submitting `nameWithInitials` on User Creation / Update](#5-submitting-nameinitials-on-user-creation--update)
6. [Auto-Generation Algorithm](#6-auto-generation-algorithm)
7. [React / TypeScript Usage Examples](#7-react--typescript-usage-examples)
8. [Validation Rules](#8-validation-rules)
9. [Backward Compatibility Notes](#9-backward-compatibility-notes)

---

## 1. What Is `nameWithInitials`?

`nameWithInitials` is a Sri Lanka-style formatted name where all words of the first name are reduced to uppercase initials followed by a dot, and only the last name (surname) is written in full.

**Examples:**

| Full Name | `nameWithInitials` |
|---|---|
| Amitha Bandara Perera | `A.B. Perera` |
| John Doe | `J. Doe` |
| Kamal Ayasha Fernando | `K.A. Fernando` |
| Mary Smith | `M. Smith` |

This field is stored in the database column `name_with_initials` (varchar 100, nullable).  
It is optional — if the user has not yet set or generated it, the value will be `null` or `undefined`.

---

## 2. Recommended Display Priority

Use this pattern everywhere you display a user name:

```typescript
// TypeScript helper
function displayName(user: {
  nameWithInitials?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (user.nameWithInitials) return user.nameWithInitials;
  if (user.name) return user.name;
  const full = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return full || 'Unknown';
}
```

**Priority order:**
1. `nameWithInitials` — if it exists, use it ✅ (preferred, standardized)
2. `name` — computed full name fallback
3. `firstName + ' ' + lastName` — raw field fallback
4. `'Unknown'` — absolute fallback

---

## 3. Quick Reference — Where It Appears

| API Area | Field Name | Type | Notes |
|---|---|---|---|
| Auth — Login | `user.nameWithInitials` | `string \| null` | In login response body |
| Auth — Get Me | `nameWithInitials` | `string \| null` | In profile response |
| Auth — Parent Me (children) | `children[].studentName` | `string` | Now prefers nameWithInitials |
| User — Get By ID/Phone/RFID/Email | `nameWithInitials` | `string \| undefined` | All 4 basic info endpoints |
| User — Public / Dropdown | `nameWithInitials` | `string \| undefined` | Public profile + dropdown lists |
| Institute User — Profile | `nameWithInitials` | `string \| undefined` | Institute user profile fetch |
| Institute User — Assign (simple) | `user.nameWithInitials` | `string \| undefined` | Assignment success response |
| Institute User — Enhanced Assign | `user.nameWithInitials` | `string \| undefined` | Enhanced assignment response |
| Institute User — Admin Data | `nameWithInitials` | `string \| undefined` | Admin user list |
| Institute User — Secure Response | `nameWithInitials` | `string \| undefined` | Institute user secure DTO |
| Institute Class Subject — Teacher | `teacher.nameWithInitials` | `string \| undefined` | Teacher in subject details |
| Institute Class Subject Teacher DTO | `nameWithInitials` | `string \| undefined` | `TeacherBasicInfoDto` |
| Institute Class Students — Assignments | `studentName` | `string` | Now prefers nameWithInitials |
| Institute Class Students — Bulk Verify | `studentName` | `string` | Now prefers nameWithInitials |
| Institute Class Students — Bulk Reject | `studentName` | `string` | Now prefers nameWithInitials |
| Attendance — Card ID Lookup | `nameWithInitials` | `string \| undefined` | `InstituteCardUserResponseDto` |
| Attendance — Mark by Card | `studentInfo.nameWithInitials` | `string \| undefined` | Card attendance response |
| Attendance — Image Check | `nameWithInitials` | `string \| undefined` | Image verification response |
| Parent — Children List | `nameWithInitials` + `name` | `string \| undefined` | `ChildInfoDto` |
| Parent — Child Profile | `nameWithInitials` | `string \| undefined` | Single child profile |
| Parent — Child Subjects | `teacher.teacherName` | `string` | Now prefers nameWithInitials |
| Organization — Members (institute) | `nameWithInitials` | `string \| undefined` | Member list per institute |
| Organization — Students (institute) | `nameWithInitials` | `string \| undefined` | Student list per institute |
| Organization — Verified Members | `nameWithInitials` | `string \| undefined` | Verified member list |
| Organization — Unverified Members | `nameWithInitials` | `string \| undefined` | Unverified member list |
| Organization — Assign Response | `nameWithInitials` | `string \| undefined` | Org assignment success |
| Payment — Pending Submissions | `submitterName` | `string` | Now prefers nameWithInitials |
| Payment — Verify Response | `verifierName` | `string` | Now prefers nameWithInitials |
| Payment — Secure Submissions | `submitterName` | `string` | Now prefers nameWithInitials |
| Payment — Payment Record | `creatorName`, `submitterName`, `verifierName` | `string` | Now prefer nameWithInitials |
| Advertisement — Delivery (internal) | `studentName` | `string` | Notification delivery data |

---

## 4. API Endpoint Breakdown

### 4.1 Authentication Endpoints

#### `POST /auth/login` — Login
```json
{
  "user": {
    "id": "123",
    "firstName": "Amitha",
    "lastName": "Perera",
    "nameWithInitials": "A. Perera",
    "email": "amitha@example.com"
  }
}
```

#### `GET /auth/me` — Get Current User
Returns full `UserResponseDto` including `nameWithInitials`.

#### `GET /auth/parent/me` — Parent Profile (includes children)
```json
{
  "children": [
    {
      "studentId": "abc123",
      "studentName": "A. Perera",
      "relationship": "father",
      "addedDate": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```
`studentName` now uses `nameWithInitials` if available.

---

### 4.2 User Endpoints

#### `GET /user/basic-info/:userId`
#### `GET /user/basic-info/by-phone/:phone`
#### `GET /user/basic-info/by-rfid/:rfid`
#### `GET /user/basic-info/by-email/:email`
```json
{
  "id": "123",
  "firstName": "Amitha",
  "lastName": "Perera",
  "nameWithInitials": "A. Perera",
  "email": "amitha@example.com",
  "phoneNumber": "+94771234567",
  "userType": "STUDENT"
}
```

#### `GET /user/public/:userId` — Public Profile
```json
{
  "id": "123",
  "firstName": "Amitha",
  "lastName": "Perera",
  "nameWithInitials": "A. Perera",
  "imageUrl": "https://storage.googleapis.com/..."
}
```

#### `GET /user/dropdown` — Users for Dropdown
```json
[
  {
    "id": "123",
    "firstName": "Amitha",
    "lastName": "Perera",
    "nameWithInitials": "A. Perera",
    "email": "amitha@example.com"
  }
]
```

---

### 4.3 Institute User Endpoints

#### `GET /institute-user/profile/:userId` — User Profile
```json
{
  "userId": "123",
  "firstName": "Amitha",
  "lastName": "Perera",
  "nameWithInitials": "A. Perera",
  "email": "amitha@example.com"
}
```

#### `POST /institute-user/assign` — Simple Assign User to Institute
```json
{
  "success": true,
  "message": "User successfully assigned to institute with status: ACTIVE",
  "user": {
    "id": "123",
    "name": "Amitha Perera",
    "nameWithInitials": "A. Perera"
  }
}
```

#### `POST /institute-user/enhanced-assign` — Enhanced Assign
```json
{
  "success": true,
  "message": "User successfully assigned to institute as STUDENT",
  "user": {
    "userId": "123",
    "userName": "Amitha Perera",
    "nameWithInitials": "A. Perera",
    "userType": "STUDENT",
    "identifier": "phone: +94771234567"
  },
  "assignment": {
    "instituteId": "1",
    "instituteUserId": "STU-2024-001",
    "instituteUserType": "STUDENT",
    "status": "ACTIVE"
  }
}
```

#### `GET /institute-user/admin/users` — Admin User List
Each item includes:
```json
{
  "userId": "123",
  "firstName": "Amitha",
  "lastName": "Perera",
  "nameWithInitials": "A. Perera",
  "email": "amitha@example.com"
}
```

---

### 4.4 Institute Class Subject Endpoints

#### `GET /institute-class-subject/:instituteId/:classId/:subjectId` — Subject Details
```json
{
  "subjectId": "1",
  "subjectName": "Mathematics",
  "teacher": {
    "userId": "456",
    "firstName": "Kamal",
    "lastName": "Fernando",
    "nameWithInitials": "K. Fernando",
    "email": "kamal@school.lk"
  }
}
```

---

### 4.5 Attendance Endpoints

#### `POST /attendance/get-institute-user-by-card` — Look Up User by Card ID
```json
{
  "success": true,
  "data": {
    "userId": "123",
    "userName": "Amitha Perera",
    "nameWithInitials": "A. Perera",
    "userIdByInstitute": "STU-2024-001",
    "instituteCardId": "CARD-2024-001",
    "imageUrl": "https://storage.googleapis.com/...",
    "imageVerificationStatus": "verified",
    "isInstituteImage": true,
    "userType": "STUDENT",
    "status": "ACTIVE"
  }
}
```

#### `POST /attendance/mark-by-card` — Mark Attendance by Card
The `studentInfo` object inside the response includes `nameWithInitials`.

#### `POST /attendance/check-image` — Image Check
Response includes `nameWithInitials`.

---

### 4.6 Parent Access Endpoints

#### `GET /parent/children` — Get Children
```json
{
  "children": [
    {
      "studentId": "abc",
      "name": "Amitha Perera",
      "nameWithInitials": "A. Perera",
      "grade": "10",
      "imageUrl": "https://..."
    }
  ]
}
```

#### `GET /parent/child/:studentId/profile` — Child Profile
Response includes `nameWithInitials`.

#### `GET /parent/child/:studentId/subjects` — Child's Enrolled Subjects
```json
{
  "subjects": [
    {
      "subjectId": "1",
      "subjectName": "Mathematics",
      "teacher": {
        "teacherId": "456",
        "teacherName": "K. Fernando",
        "teacherEmail": "kamal@school.lk"
      }
    }
  ]
}
```
`teacherName` now uses `nameWithInitials` if available.

---

### 4.7 Organization Endpoints

#### `GET /organization/members/:instituteId`
#### `GET /organization/students/:instituteId`
#### `GET /organization/unverified-members`
Each member/student object includes:
```json
{
  "userId": "123",
  "firstName": "Amitha",
  "lastName": "Perera",
  "nameWithInitials": "A. Perera",
  "email": "amitha@example.com"
}
```

---

### 4.8 Payment Endpoints

#### `GET /payment/submissions/pending` — Pending Payment Submissions
```json
{
  "submissions": [
    {
      "submissionId": "456",
      "submittedBy": "123",
      "submitterName": "A. Perera",
      "paymentAmount": 5000,
      "status": "PENDING"
    }
  ]
}
```
`submitterName` now prefers `nameWithInitials`.

#### `POST /payment/verify/:id` — Verify / Reject a Payment
```json
{
  "id": "456",
  "status": "VERIFIED",
  "verifierName": "K. Fernando",
  "verificationDate": "2025-01-19T10:30:00Z"
}
```
`verifierName` now prefers `nameWithInitials`.

#### Payment Record Objects (in list responses)
`creatorName`, `submitterName`, `verifierName` all now prefer `nameWithInitials || fullName`.

---

## 5. Submitting `nameWithInitials` on User Creation / Update

### On User Registration

Include `nameWithInitials` in the request body:

```typescript
// POST /auth/register   or   POST /user/create
{
  "firstName": "Amitha",
  "lastName": "Perera",
  "nameWithInitials": "A. Perera",     // ← include this
  "email": "amitha@example.com",
  "phoneNumber": "+94771234567",
  "password": "SecurePass123!"
}
```

If omitted, the backend will auto-generate `nameWithInitials` from `firstName + lastName`.

### On Profile Update

```typescript
// PATCH /user/profile   or   PUT /user/:id
{
  "nameWithInitials": "A.B. Perera"   // ← user can customize this
}
```

The field is optional on update — omit it to leave the existing value unchanged.

---

## 6. Auto-Generation Algorithm

The backend uses this algorithm when `nameWithInitials` is not provided:

```typescript
function generateNameWithInitials(firstName: string, lastName: string): string {
  const firstParts = firstName.trim().split(/\s+/);
  const initials = firstParts
    .map(part => part.charAt(0).toUpperCase() + '.')
    .join('');
  return `${initials} ${lastName.trim()}`;
}

// Examples:
generateNameWithInitials('Amitha', 'Perera')          // "A. Perera"
generateNameWithInitials('Amitha Bandara', 'Perera')  // "A.B. Perera"
generateNameWithInitials('Kamal Ayasha', 'Fernando')  // "K.A. Fernando"
```

Use this in registration forms to **show a live preview** as the user types their name.

---

## 7. React / TypeScript Usage Examples

### 7.1 Display Name Helper Utility

```typescript
// src/utils/nameUtils.ts

export interface UserNameFields {
  nameWithInitials?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Returns the best available display name for a user.
 * Priority: nameWithInitials → name → firstName + lastName → 'Unknown'
 */
export function displayName(user: UserNameFields): string {
  if (user.nameWithInitials) return user.nameWithInitials;
  if (user.name) return user.name;
  const full = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return full || 'Unknown';
}

/**
 * Auto-generate nameWithInitials from firstName and lastName.
 * Useful for live preview in registration forms.
 */
export function generateNameWithInitials(
  firstName: string,
  lastName: string
): string {
  if (!firstName.trim() || !lastName.trim()) return '';
  const initials = firstName
    .trim()
    .split(/\s+/)
    .map(p => p.charAt(0).toUpperCase() + '.')
    .join('');
  return `${initials} ${lastName.trim()}`;
}
```

### 7.2 Name Display Component

```tsx
// src/components/UserNameDisplay.tsx
import React from 'react';
import { displayName, UserNameFields } from '../utils/nameUtils';

interface Props {
  user: UserNameFields;
  showFullNameTooltip?: boolean;
}

export const UserNameDisplay: React.FC<Props> = ({
  user,
  showFullNameTooltip = false,
}) => {
  const preferred = displayName(user);
  const full = `${user.firstName || ''} ${user.lastName || ''}`.trim();

  return (
    <span title={showFullNameTooltip && full ? full : undefined}>
      {preferred}
    </span>
  );
};
```

### 7.3 Registration Form with Live Preview

```tsx
// src/components/RegistrationForm.tsx
import React, { useState } from 'react';
import { generateNameWithInitials } from '../utils/nameUtils';

export const RegistrationForm: React.FC = () => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nameWithInitials, setNameWithInitials] = useState('');

  const handleFirstNameChange = (value: string) => {
    setFirstName(value);
    setNameWithInitials(generateNameWithInitials(value, lastName));
  };

  const handleLastNameChange = (value: string) => {
    setLastName(value);
    setNameWithInitials(generateNameWithInitials(firstName, value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Include nameWithInitials in the payload
    const payload = { firstName, lastName, nameWithInitials };
    // POST payload to API...
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder="First Name (e.g. Amitha Bandara)"
        value={firstName}
        onChange={e => handleFirstNameChange(e.target.value)}
      />
      <input
        placeholder="Last Name (e.g. Perera)"
        value={lastName}
        onChange={e => handleLastNameChange(e.target.value)}
      />
      <input
        placeholder="Name with Initials (e.g. A.B. Perera)"
        value={nameWithInitials}
        onChange={e => setNameWithInitials(e.target.value)} // allow manual override
        maxLength={100}
      />
      {nameWithInitials && (
        <p>Display name preview: <strong>{nameWithInitials}</strong></p>
      )}
      <button type="submit">Register</button>
    </form>
  );
};
```

### 7.4 Attendance Card Scan Result Display

```tsx
// After calling POST /attendance/get-institute-user-by-card
interface CardScanResult {
  userId: string;
  userName: string;
  nameWithInitials?: string;
  userIdByInstitute: string;
  instituteCardId: string;
  imageUrl: string | null;
  userType: string;
  status: string;
}

const AttendanceScanDisplay: React.FC<{ result: CardScanResult }> = ({ result }) => (
  <div className="scan-result">
    {result.imageUrl && (
      <img src={result.imageUrl} alt="User avatar" className="avatar" />
    )}
    <h3>{result.nameWithInitials || result.userName}</h3>
    <p>Institute ID: {result.userIdByInstitute}</p>
    <p>Card ID: {result.instituteCardId}</p>
    <p>Type: {result.userType} | Status: {result.status}</p>
  </div>
);
```

### 7.5 Student / Teacher Table

```tsx
interface PersonRow {
  id: string;
  firstName: string;
  lastName: string;
  nameWithInitials?: string;
  email?: string;
}

const PersonTable: React.FC<{ people: PersonRow[]; caption: string }> = ({
  people,
  caption,
}) => (
  <table>
    <caption>{caption}</caption>
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
      </tr>
    </thead>
    <tbody>
      {people.map(p => (
        <tr key={p.id}>
          <td title={`${p.firstName} ${p.lastName}`}>
            {p.nameWithInitials || `${p.firstName} ${p.lastName}`}
          </td>
          <td>{p.email || '—'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
```

### 7.6 Payment Records Display

```tsx
interface PaymentRecord {
  id: string;
  creatorName: string;    // Already prefers nameWithInitials server-side
  submitterName?: string; // Already prefers nameWithInitials server-side
  verifierName?: string;  // Already prefers nameWithInitials server-side
  amount: number;
  status: string;
}

// These string fields already contain initials format when available.
// No extra frontend logic needed — just render them directly.
const PaymentRow: React.FC<{ payment: PaymentRecord }> = ({ payment }) => (
  <tr>
    <td>{payment.id}</td>
    <td>{payment.creatorName}</td>
    <td>{payment.submitterName || '—'}</td>
    <td>{payment.verifierName || 'Not verified'}</td>
    <td>LKR {payment.amount.toLocaleString()}</td>
    <td>{payment.status}</td>
  </tr>
);
```

### 7.7 Children List (Parent View)

```tsx
interface ChildInfo {
  studentId: string;
  name: string;                // Full name (always present)
  nameWithInitials?: string;   // Short form (use when available)
  grade?: string;
  imageUrl?: string;
}

const ChildCard: React.FC<{ child: ChildInfo }> = ({ child }) => (
  <div className="child-card">
    {child.imageUrl && <img src={child.imageUrl} alt={child.name} />}
    <h4>{child.nameWithInitials || child.name}</h4>
    {child.grade && <p>Grade: {child.grade}</p>}
  </div>
);
```

---

## 8. Validation Rules

| Rule | Value |
|---|---|
| Field type | `string` |
| Max length | `100` characters |
| Required | No (optional / nullable) |
| Format | Initials (each ending with `.`) then full surname |
| Example | `A.B. Perera`, `K. Fernando`, `M.S.D. Silva` |
| Database column | `name_with_initials` (varchar 100, nullable) |

**Frontend validation (optional):**

```typescript
function isValidNameWithInitials(value: string): boolean {
  if (!value || !value.trim()) return true; // optional field
  // Pattern: one or more "X." groups, then space, then surname word(s)
  return /^([A-Z]\.\s*)+[A-Za-z]+(\s[A-Za-z]+)*$/.test(value.trim());
}

// Valid:   "A. Perera", "A.B. Perera", "K.A. Fernando", "M.S.D. Silva"
// Invalid: "Amitha Perera", "a. perera", "A Perera"
```

---

## 9. Backward Compatibility Notes

All backend changes are **additive** — no existing fields have been removed or renamed.

| Existing Field | Still Present? | Notes |
|---|---|---|
| `firstName` | ✅ Yes | Unchanged everywhere |
| `lastName` | ✅ Yes | Unchanged everywhere |
| `name` | ✅ Yes | Still `firstName + ' ' + lastName` |
| `nameWithInitials` | ✅ NEW in many endpoints | Added alongside existing fields |

### Payment Name Fields — Minor Behavior Change

> ⚠️ `creatorName`, `submitterName`, `verifierName` in payment responses now return `nameWithInitials` when available (e.g. `"A. Perera"` instead of `"Amitha Perera"`).  
> These are still `string` type — no structural change — but the value may be in short-form initials format.  
> If your UI assumed the full name, the display will now be more compact.

All other name fields remain fully backward compatible.

---

## Summary Checklist for Frontend

- [ ] Add `nameWithInitials` to all user-related TypeScript interfaces/types
- [ ] Use `nameWithInitials` as the primary display name in all user name renders
- [ ] Fall back to `name` or `firstName + lastName` if `nameWithInitials` is null/undefined
- [ ] Include `nameWithInitials` in user create/update API request payloads
- [ ] Add live preview generation in registration forms using the algorithm in §6
- [ ] `teacher.nameWithInitials` is now available in class subject API responses
- [ ] Parent children endpoint now returns `nameWithInitials` on each child
- [ ] Attendance card scan result (`InstituteCardUserResponseDto`) now includes `nameWithInitials`
- [ ] Payment `creatorName`/`submitterName`/`verifierName` now return initials format — adjust layout width if needed
- [ ] Organization member/student lists now include `nameWithInitials`
