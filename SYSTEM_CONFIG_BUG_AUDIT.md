# 🔍 COMPREHENSIVE BUG AUDIT — System Config Commit & Related Issues

**Date:** 2026-03-03  
**Commit Audited:** `398de9e` — _feat: Add system config expansion migration and admin controller_  
**Scope:** Full system-wide audit of bugs, security issues, type mismatches, and broken logic  

---

## 📊 Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 CRITICAL — Broken access control / always-wrong logic | 13 | Needs immediate fix |
| 🟠 HIGH — Dead code paths / wrong JWT fields | 12 | Needs fix |
| 🟡 MEDIUM — Invalid SQL filters / data mismatches | 11 | Needs fix |
| 🔵 LOW — Misleading docs / code smell | 11 | Should fix |
| 🔒 SECURITY — Credentials/tokens leaked in Git | 3 | **Urgent** |
| **TOTAL** | **50** | |

---

## 🔒 SECURITY ISSUES (Fix Immediately)

### SEC-1: Production DB credentials committed to Git
**File:** `run-migration.js` (lines 11–16)  
**Severity:** 🔴 CRITICAL  
```javascript
host: '136.114.215.145',
user: 'root',
password: 'Skaveesha1355660@',
database: 'suraksha-lms-db',
```
**Impact:** Anyone with repo access has full root access to the production database.  
**Fix:** Remove from Git history, rotate password immediately, add `run-migration.js` to `.gitignore`.

### SEC-2: JWT token committed to Git
**File:** `token.txt`  
**Severity:** 🟠 HIGH  
Contains a SUPERADMIN JWT: `eyJhbGciOiJIUzI1NiIs...`  
**Impact:** Token has expired (exp: 1772530375), but confirms JWT_SECRET is still valid. If JWT_SECRET hasn't been rotated, future tokens can be forged.  
**Fix:** Delete `token.txt`, add to `.gitignore`.

### SEC-3: `.env` file tracked despite .gitignore
**File:** `.env`  
**Severity:** 🟠 HIGH  
The `.env` file exists in the repo and contains:
- `JWT_SECRET`, `BCRYPT_PEPPER`, SMS API keys, database credentials  
**Impact:** All secrets are exposed to anyone with repo access.  
**Fix:** `git rm --cached .env` then commit.

---

## 🔴 CRITICAL — `req.user.u` (number) compared to `UserType` enum (string)

The JWT strategy sets `req.user.u` to the **numeric compact type** from the JWT (0, 1, 2...).  
`UserType.SUPERADMIN` resolves to the **string** `'SUPER_ADMIN'`.  
All `user.u === UserType.SUPERADMIN` comparisons are **always false** (number !== string).

### BUG-1: Subject service — SUPERADMIN bypass broken
**File:** `src/modules/subject/subject.service.ts` (line 279)  
```typescript
if (user.u === UserType.SUPERADMIN) {  // 0 === 'SUPER_ADMIN' → ALWAYS FALSE
```
**Impact:** SUPERADMIN cannot bypass institute access checks for subjects.  
**Fix:** `if (user.u === 0 || user.userType === UserType.SUPERADMIN)`

### BUG-2: JwtRequestHelper.isSuperAdmin() always returns false
**File:** `src/common/interfaces/jwt-request.interface.ts` (line 104)  
```typescript
static isSuperAdmin(user: JwtPayload): boolean {
  return user.u === UserType.SUPERADMIN;  // number === string → ALWAYS FALSE
}
```
**Impact:** Any code using this helper will always deny SUPERADMIN. This is a **utility function** used across the system.  
**Fix:** `return user.u === 0 || user.userType === UserType.SUPERADMIN;`

### BUG-3: User service — admin detection all broken
**File:** `src/modules/user/user.service.ts` (lines 2165–2167)  
```typescript
const isSuperAdmin = currentUser?.u === UserType.SUPERADMIN;     // ALWAYS FALSE
const isOrgManager = currentUser?.u === UserType.ORGANIZATION_MANAGER; // ALWAYS FALSE
const isRegularUser = [UserType.USER, ...].includes(currentUser.u);   // ALWAYS FALSE
```
**Impact:** All user type detection fails — SUPERADMIN, ORG_MANAGER, and regular users all fall through.  
**Fix:** Use numeric checks: `currentUser?.u === 0`, `currentUser?.u === 1`, etc.

### BUG-4: Structured lectures — SUPERADMIN forced to default filter
**File:** `src/modules/structured-lectures/structured-lectures.controller.ts` (lines 166, 228)  
```typescript
if (request.user.u !== UserType.SUPERADMIN && activeFilter === undefined) {
  // number !== string → ALWAYS TRUE, even for SUPERADMIN
  activeFilter = true;
}
```
**Impact:** SUPERADMIN users are always forced to `activeFilter = true`, cannot see inactive lectures.  
**Fix:** `if (request.user.u !== 0 && activeFilter === undefined)`

### BUG-5: Institute class controller — SUPERADMIN denied enrollment management
**File:** `src/modules/institute_mudules/institue_class/institue_class.controller.ts` (lines 341, 377, 409)  
```typescript
const userType = req.user?.u;  // number (e.g., 0)
if (userType !== UserType.SUPERADMIN && !isInstituteAdmin) {  // 0 !== 'SUPER_ADMIN' → TRUE
  throw new ForbiddenException('Access denied...');
}
```
**Impact:** SUPERADMIN is **always denied** access to enable/disable enrollment and enrollment settings.  
**Fix:** `if (userType !== 0 && !isInstituteAdmin)`

---

## 🔴 CRITICAL — `req.user.t` is timestamp, NOT user type

The JWT payload field `t` is the **issued-at timestamp** (e.g., `1772526775`), not the user type.  
The user type is field `u`. Using `t` as user type causes all role checks to fail.

### BUG-6: SMS controller — userType reads timestamp
**File:** `src/modules/sms/controllers/sms.controller.ts` (line 369)  
```typescript
const userType = req.user?.t || req.user?.role;  // t = 1772526775 (timestamp!)
```
Then at line 377:
```typescript
if (userType !== UserType.SUPERADMIN && userType !== 'SUPERADMIN') {
  // 1772526775 !== 'SUPER_ADMIN' → ALWAYS TRUE → everyone denied
}
```
**Impact:** **All users** (including SUPERADMIN) are denied access to `getInstitutePaymentSubmissions`.  
**Fix:** `const userType = req.user?.u;` then check `userType !== 0`

### BUG-7: SMS controller — isSuperAdmin check uses timestamp
**File:** `src/modules/sms/controllers/sms.controller.ts` (line 619)  
```typescript
const isSuperAdmin = req.user?.t === UserType.SUPERADMIN || req.user?.role === 'SUPER_ADMIN';
// timestamp === string → FALSE | undefined === string → FALSE
// isSuperAdmin is ALWAYS FALSE
```
**Impact:** SUPERADMIN is never detected in `createSenderMask`, always prompted for institute ID even though they should be exempt.  
**Fix:** `const isSuperAdmin = req.user?.u === 0;`

---

## 🟠 HIGH — `req.user.role` doesn't exist on JWT payload

### BUG-8: SMS controller references non-existent `role` field
**File:** `src/modules/sms/controllers/sms.controller.ts` (lines 369, 619)  
```typescript
req.user?.role  // ← This field does NOT exist on the JWT user object
```
The JWT strategy returns: `id`, `userId`, `sub`, `s`, `email`, `userType`, `u`, `firstName`, `lastName`, etc.  
There is no `role` property.  
**Impact:** Fallback value is always `undefined`.  
**Fix:** Remove `req.user?.role` references, use `req.user?.u` or `req.user?.userType`.

---

## 🟠 HIGH — `user.ia` used instead of `user.i`

### BUG-9: Push notification admin — institute access always undefined
**File:** `src/modules/push-notifications/controllers/push-notification-admin.controller.ts` (line 228)  
```typescript
const instituteAccess = user.ia;  // ← WRONG! Should be user.i
```
The Enhanced JWT payload uses `i` for institute access, not `ia`.  
**Impact:** Institute role detection always falls through to `return 'USER'`. All institute admins/teachers are treated as regular users.  
**Fix:** `const instituteAccess = user.i;`

---

## 🟠 HIGH — `user.userType` compared to InstituteUserType values

The `userType` column in the `users` table only stores: `'SUPER_ADMIN'`, `'ORGANIZATION_MANAGER'`, `'USER'`, `'USER_WITHOUT_PARENT'`, `'USER_WITHOUT_STUDENT'`.

Values like `'STUDENT'`, `'TEACHER'`, `'PARENT'`, `'INSTITUTE_ADMIN'`, `'ATTENDANCE_MARKER'` are **InstituteUserType** values from the `institute_users` table — never stored in `users.user_type`.

### BUG-10: validate-user-id decorator — Institute admin check always false
**File:** `src/common/decorators/validate-user-id.decorator.ts` (line 105)  
```typescript
const isInstituteAdmin = user.userType === 'INSTITUTE_ADMIN';  // NEVER matches
const isRegularUser = ['STUDENT', 'TEACHER', 'PARENT', 'ATTENDANCE_MARKER'].includes(user.userType);  // NEVER matches
```
**Impact:** Users with type `USER`, `USER_WITHOUT_PARENT`, or `USER_WITHOUT_STUDENT` fall through to "Unknown user type" and get denied access.  
**Fix:** Check against actual `UserType` values: `'USER'`, `'USER_WITHOUT_PARENT'`, `'USER_WITHOUT_STUDENT'`.

### BUG-11: First login service — Student/Parent detection dead code
**File:** `src/auth/services/first-login.service.ts` (lines 482, 497, 841, 854, 879, 891)  
```typescript
if (userType === 'STUDENT') { ... }        // userType is 'USER', never 'STUDENT'
else if (userType === 'PARENT') { ... }    // userType is 'USER', never 'PARENT'
```
**Impact:** Student-specific and parent-specific data is never loaded during first login profile completion. All users fall through to the generic handler.  
**Fix:** Determine student/parent status from `institute_users` table or `institute_class_students` enrollment, not from `user.userType`.

---

## 🟠 HIGH — `Object.keys()` on array returns indices

### BUG-12: Institute class controller — institute ID extraction broken
**File:** `src/modules/institute_mudules/institue_class/institue_class.controller.ts` (lines 1085–1086)  
```typescript
const userInstituteIds = req.user?.i ? Object.keys(req.user.i) : [];
// req.user.i is an ARRAY like [{i: "1", r: 8, c: [...]}, {i: "2", r: 4}]
// Object.keys(array) returns ["0", "1"] (indices), NOT institute IDs!

const adminInstituteIds = Object.keys(req.user.i).filter(id => req.user.i[id] === 1);
// req.user.i[0] is an object, not 1 → ALWAYS EMPTY
```
**Impact:** Institute ID extraction returns array indices instead of actual IDs. Admin role detection always returns empty.  
**Fix:**
```typescript
const userInstituteIds = req.user?.i?.map(entry => entry.i) || [];
const adminInstituteIds = req.user?.i?.filter(entry => (entry.r & 8) === 8).map(entry => entry.i) || [];
```

---

## 🟡 MEDIUM — Invalid SQL `InstituteUserType` strings

The `institute_user_type` column stores: `'INSTITUTE_ADMIN'`, `'TEACHER'`, `'STUDENT'`, `'ATTENDANCE_MARKER'`, `'PARENT'`.  
Values `'ADMIN'` and `'SUPER_ADMIN'` do **not** exist in this enum.

### BUG-13: SMS service — admin queries miss actual admins
**File:** `src/modules/sms/services/sms.service.ts` (lines 1901, 2092, 2291)  
```sql
iu.institute_user_type IN ('ADMIN', 'SUPER_ADMIN', 'INSTITUTE_ADMIN')
-- 'ADMIN' and 'SUPER_ADMIN' never match anything
-- Only 'INSTITUTE_ADMIN' works
```
**Impact:** SMS recipient queries may miss some admin users.  
**Fix:** Use `('INSTITUTE_ADMIN')` only, or add the correct `InstituteUserType` values.

### BUG-14: SMS enhanced service — invalid role strings
**File:** `src/modules/sms/services/sms-enhanced.service.ts` (lines 709, 711)  
```typescript
return ['INSTITUTE_ADMIN', 'ADMIN'];  // 'ADMIN' is not a valid InstituteUserType
```
**Fix:** Remove `'ADMIN'` from role arrays.

---

## 🟡 MEDIUM — System Config Admin Controller Issues

### BUG-15: User ID extraction from JWT is inconsistent
**File:** `src/common/controllers/system-config-admin.controller.ts` (lines 213, 240, 264, 283)  
```typescript
const userId = req.user?.userId || req.user?.sub || 'ADMIN';
```
The JWT strategy returns the user ID as `req.user.s` (compact format), `req.user.id`, and `req.user.userId`.  
This works but doesn't check `req.user.s`, which is the canonical enhanced JWT field.  
**Fix:** `const userId = req.user?.s || req.user?.userId || req.user?.sub || 'ADMIN';`

### BUG-16: Cache stats endpoint returns no actual stats
**File:** `src/common/controllers/system-config-admin.controller.ts` (lines 106–115)  
```typescript
async cacheStats() {
  return {
    success: true,
    data: {
      message: 'Cache stats retrieved',
      hint: 'Use POST /cache/refresh to reload',
    },
  };
}
```
**Impact:** Endpoint suggests it returns cache stats but returns only a static message. No actual cache size, hit rate, or entry count.  
**Fix:** Return `this.configService.getCacheSize()` or similar with actual data.

### BUG-17: `getGroup()` uses `getAll()` instead of `getGroup()` service method
**File:** `src/common/controllers/system-config-admin.controller.ts` (line 146)  
```typescript
const entries = await this.configService.getAll({ group: group.toUpperCase() });
```
The service has a dedicated `getGroup()` method that returns a key-value map. The controller uses `getAll()` which returns full entities — this actually works better for the admin panel, but the method naming is misleading. Not a bug, but inconsistent.

---

## 🟡 MEDIUM — Data Quality Issues

### BUG-18: BookHire attendance — brute-force case matching
**File:** `src/modules/private-transportation/services/bookhire-attendance.service.ts` (lines 1110–1126)  
```typescript
// Mixed case checks like:
userType === 'user_without_Parent'  // mixed case
```
Contains massive arrays with every case variant: `'STUDENT'`, `'student'`, `'Student'`, etc.  
**Impact:** Indicates no normalization at the data layer. Fragile code that breaks with new casing.  
**Fix:** Normalize `userType.toUpperCase()` once, then compare.

### BUG-19: Attendance service — fallback to InstituteUserType string
**File:** `src/modules/attendance/attendance.service.ts` (line 1661)  
```typescript
userType: studentData.user.userType || 'STUDENT'
```
Fallback `'STUDENT'` is an `InstituteUserType`, not a `UserType`. If this is consumed by code expecting `UserType`, it will mismatch.

---

## 🔵 LOW — Swagger API Doc Errors

### BUG-20: Auth V2 controller — wrong example types
**File:** `src/auth/controllers/auth.v2.controller.ts` (lines 34, 42)  
```typescript
payload: { u: 'STUDENT', ... }   // u is a NUMBER (0-4), not a string
user: { userType: 'STUDENT' }     // userType is never 'STUDENT'
```
**Fix:** Use `u: 2` (for USER) and `userType: 'USER'`.

### BUG-21: User controller — 'STUDENT' as UserType example
**File:** `src/modules/user/user.controller.ts` (lines 770, 869, 968, 1067)  
API docs show `userType: 'STUDENT'` but `'STUDENT'` is not a valid `UserType`.  
**Fix:** Use valid `UserType` values like `'USER'`, `'SUPER_ADMIN'`, etc.

---

## 🔵 LOW — `COMPACT_TO_USER_TYPE` returns enum keys, not values

### BUG-22: Indirection causes confusion
**File:** `src/auth/interfaces/enhanced-jwt-payload.interface.ts` (line 78)  
```typescript
export const COMPACT_TO_USER_TYPE = {
  0: 'SUPERADMIN',            // Enum KEY (UserType.SUPERADMIN)
  1: 'ORGANIZATION_MANAGER',  // OK — key matches value
  2: 'USER',                  // OK
  3: 'USER_WITHOUT_PARENT',   // OK
  4: 'USER_WITHOUT_STUDENT',  // OK
} as const;
```
For entry `0`: `COMPACT_TO_USER_TYPE[0]` → `'SUPERADMIN'` (the enum key), while the actual enum value is `'SUPER_ADMIN'`.  
The `flexible-access.guard.ts` correctly handles this with `UserType[userTypeKey]`, but this two-step indirection is error-prone and has already caused bugs elsewhere.  
**Fix:** Map directly to enum values: `0: 'SUPER_ADMIN'`

---

## 🔵 LOW — Redundant double-checks

### BUG-23: Enhanced access guard — redundant comparisons
**File:** `src/common/guards/enhanced-access.guard.ts` (line 280)  
```typescript
userType === UserType.SUPERADMIN || userType === 'SUPER_ADMIN'
```
`UserType.SUPERADMIN` **IS** `'SUPER_ADMIN'`. Both checks are identical. Not a bug, but confusing.

---

## ✅ CORRECTLY IMPLEMENTED (No Issues)

| Component | Status |
|-----------|--------|
| `SystemConfigEntity` — column mappings, types, indexes | ✅ Correct |
| `SystemConfigService` — CRUD, caching, cache warmup | ✅ Correct |
| `SystemConfigAdminController` — routes, validation, guards | ✅ Correct (minor issues noted) |
| `SystemConfigAdminController` — value type validation | ✅ Correct |
| `CreateSystemConfigDto` / `UpdateSystemConfigDto` — validation | ✅ Correct |
| `SystemAdminGuard` — multi-format JWT support | ✅ Correct (after fix) |
| Migration SQL — ON DUPLICATE KEY UPDATE | ✅ Correct, idempotent |
| `CommonModule` — controller registration | ✅ Correct |
| `SystemConfigService` — cache TTL, cleanup | ✅ Correct |
| `JwtAuthGuard` — public route handling | ✅ Correct |

---

## 🛠️ Recommended Fix Priority

### Phase 1 — Immediate (Security)
1. **Rotate DB password** — the root password is committed to Git history
2. **Delete `token.txt`** and `check-admin.js`, `check-users.js` from repo
3. **Add to `.gitignore`:** `token.txt`, `run-migration.js`, `check-*.js`, `*.sql` migration scripts with credentials
4. **Run `git rm --cached .env`** — the .env was tracked before .gitignore was added

### Phase 2 — Critical Fixes (Access Control)
5. Fix all `req.user.u === UserType.SUPERADMIN` → use numeric comparison `=== 0`
6. Fix `req.user.t` → `req.user.u` in SMS controller
7. Fix `user.ia` → `user.i` in push notification admin controller
8. Fix `Object.keys(req.user.i)` → proper array mapping

### Phase 3 — High Priority (Functionality)
9. Fix `validate-user-id.decorator.ts` — use actual `UserType` values
10. Fix `first-login.service.ts` — determine student/parent from enrollment, not `userType`
11. Fix SMS service SQL queries — remove invalid `'ADMIN'`, `'SUPER_ADMIN'` from `institute_user_type` filters

### Phase 4 — Medium/Low (Cleanup)
12. Fix Swagger API doc examples
13. Fix `COMPACT_TO_USER_TYPE` to map to enum values directly
14. Normalize case handling in BookHire attendance service
15. Add actual cache statistics to the `/cache/stats` endpoint

---

## 📝 Root Cause Analysis

The fundamental issue is a **type system mismatch** between three layers:

1. **Database:** `users.user_type` stores `'SUPER_ADMIN'` (snake_case with underscore)
2. **TypeScript Enum:** `UserType.SUPERADMIN` = `'SUPER_ADMIN'` (enum key ≠ enum value)
3. **JWT Token:** `u` field stores numeric `0` (compact representation)

Code written at different times uses different formats:
- Some checks use the **enum** (`UserType.SUPERADMIN`)
- Some use the **numeric JWT value** (`user.u === 0`)
- Some use **hardcoded strings** (`'SUPERADMIN'`, `'SUPER_ADMIN'`)
- Some confuse **JWT fields** (`t` = timestamp, not type)

**Recommended system-wide fix:** Create a single `isAdmin(user)` / `isSuperAdmin(user)` helper that checks all formats, and enforce its use via ESLint rule.
