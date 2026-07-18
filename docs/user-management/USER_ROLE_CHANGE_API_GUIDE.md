# User Role / Type Change API Guide (Super Admin)

## Overview

There is no single dedicated "change role" endpoint. User type changes are handled through the following APIs:

---

## 1. `PATCH /users/upgrade-type` — Self-Service Upgrade

| Field       | Value |
|-------------|-------|
| **Method**  | `PATCH` |
| **Route**   | `/users/upgrade-type` |
| **Auth**    | Any authenticated user |
| **File**    | `src/modules/user/user.controller.ts` |

### Description
Allows a user to upgrade their own type:
- `USER_WITHOUT_PARENT` → `USER` (creates missing parent record)
- `USER_WITHOUT_STUDENT` → `USER` (creates missing student record)

### Request Body (`UpgradeUserTypeDto`)
```json
{
  "studentData": { ... },   // Required if upgrading from USER_WITHOUT_PARENT
  "parentData": { ... }     // Required if upgrading from USER_WITHOUT_STUDENT
}
```

---

## 2. `PATCH /users/:id` — Admin Update User (includes userType)

| Field       | Value |
|-------------|-------|
| **Method**  | `PATCH` |
| **Route**   | `/users/:id` |
| **Auth**    | `SUPERADMIN` (any user), `INSTITUTE_ADMIN` (within their institute) |
| **File**    | `src/modules/user/user.controller.ts` |

### Description
General user update endpoint. SUPERADMIN can change a user's `userType` as part of the update payload.

### Request Body (partial example)
```json
{
  "userType": "USER"
}
```

### Allowed `userType` Values
| Value | Description |
|-------|-------------|
| `USER` | Full flexibility — any institute role + parent |
| `USER_WITHOUT_PARENT` | Can be student but NOT parent |
| `USER_WITHOUT_STUDENT` | Can be parent but NOT student |
| `ORGANIZATION_MANAGER` | Org-level management |
| `SUPER_ADMIN` | System-wide super admin |

---

## 3. `PATCH /admin/users/first-login/:userId` — Admin First-Login Override

| Field       | Value |
|-------------|-------|
| **Method**  | `PATCH` |
| **Route**   | `/admin/users/first-login/:userId` (check controller prefix) |
| **Auth**    | `SUPERADMIN` |
| **File**    | `src/modules/user/controllers/system-admin-user.controller.ts` |

### Description
Allows a SUPERADMIN to complete or override a user's first-login flow. Includes the ability to set `userType` to one of the allowed types during profile setup.

### Allowed `userType` in this flow
- `USER`
- `USER_WITHOUT_PARENT`
- `USER_WITHOUT_STUDENT`

---

## UserType Capabilities Reference

| UserType | Any Institute Role | Can Be Parent | Can Be Student | Can Be Parent Role |
|----------|--------------------|---------------|----------------|--------------------|
| `SUPER_ADMIN` | ✅ | ❌ | ❌ | ❌ |
| `ORGANIZATION_MANAGER` | ✅ | ❌ | ❌ | ❌ |
| `USER` | ✅ | ✅ | ✅ | ✅ |
| `USER_WITHOUT_PARENT` | ✅ | ❌ | ✅ | ❌ |
| `USER_WITHOUT_STUDENT` | ❌ | ✅ | ❌ | ✅ |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/user/user.controller.ts` | Main user controller (upgrade-type, update by id) |
| `src/modules/user/user.service.ts` | `upgradeUserType()` business logic |
| `src/modules/user/controllers/system-admin-user.controller.ts` | System admin controller |
| `src/auth/services/first-login.service.ts` | First-login flow with userType assignment |
| `src/modules/user/enums/user-type.enum.ts` | UserType enum and capabilities |
| `src/modules/user/dto/upgrade-user-type.dto.ts` | DTO for upgrade-type endpoint |
