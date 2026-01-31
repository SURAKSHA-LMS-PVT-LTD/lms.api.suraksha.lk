# Parent Access Endpoints - Quick Reference

## 🎯 All Parent-Accessible Endpoints

Parents can access their children's data through these 17+ endpoints. All validation is automatic via the `FlexibleAccessGuard`.

---

## 📚 Educational Data (5 endpoints)

| Endpoint | Purpose | Access Pattern |
|----------|---------|----------------|
| `GET /users/:id/parent-institutes` | Child's institutes | `parent: {}` |
| `GET /students/:studentUserId/classes` | Child's classes | `parent: {}` |
| `GET /students/:studentUserId/classes/enrolled` | Child's enrolled classes | `parent: {}` |
| `GET /institute-class-subject-students/student/:studentId` | Child's subjects | `parent: {}` |
| `GET /institute-class-subject-homeworks/user/:userId` | Child's homeworks | `parent: {}` |

---

## 📅 Attendance (4 endpoints)

| Endpoint | Purpose | Access Pattern |
|----------|---------|----------------|
| `GET /api/attendance/student/:studentId` | Child's attendance history | `parent: true` |
| `GET /api/attendance/institute/:instituteId?studentId=:childId` | Institute attendance (filtered) | `parent: { requireStudent: true }` |
| `GET /api/attendance/institute/:instituteId/class/:classId?studentId=:childId` | Class attendance (filtered) | `parent: { requireStudent: true }` |
| `GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId?studentId=:childId` | Subject attendance (filtered) | `parent: { requireStudent: true }` |

---

## 💰 Payments (4 endpoints)

| Endpoint | Purpose | Access Pattern |
|----------|---------|----------------|
| `POST /institute-payment-submissions/institute/:instituteId/payment/:paymentId/submit` | Submit payment for child | `parent: {}` |
| `GET /institute-payment-submissions/institute/:instituteId/my-submissions` | View payment submissions | `parent: {}` |
| `GET /institute-payment-submissions/institute/:instituteId/student/:studentId/submissions` | Child's payment submissions | `parent: { requireStudent: true }` |
| `GET /institute-payment-submissions/institute/:instituteId/submission/:submissionId` | Payment submission details | `anyInstituteRole: true` |

---

## 🔔 Notifications (4+ endpoints)

| Endpoint | Purpose | Access Pattern |
|----------|---------|----------------|
| `GET /push-notifications/institute/:instituteId` | Institute notifications | `anyInstituteRole: true` |
| `GET /push-notifications/system` | System notifications | `anyInstituteRole: true` |
| `GET /push-notifications/institute/:instituteId/unread-count` | Unread count | `anyInstituteRole: true` |
| `POST /push-notifications/:id/read` | Mark as read | `anyInstituteRole: true` |
| `POST /push-notifications/mark-read` | Mark multiple as read | `anyInstituteRole: true` |
| `POST /push-notifications/institute/:instituteId/mark-all-read` | Mark all as read | `anyInstituteRole: true` |
| `GET /push-notifications/:id` | Notification details | `anyInstituteRole: true` |

---

## 🔐 Access Control Patterns

### ✅ Pattern 1: Simple Automatic Validation
```typescript
@RequireAnyOfRoles({ parent: {} })
```
- FlexibleAccessGuard extracts `userId/studentId` from params
- Validates against JWT's `c` (children) array
- No manual validation needed!

### ✅ Pattern 2: Filtered with Student ID Required
```typescript
@RequireAnyOfRoles({ parent: { requireStudent: true } })
```
- Requires `studentId` in query/params
- Guard validates it's in JWT `c` array
- Used for filtered queries (attendance, payments)

### ✅ Pattern 3: Any Institute Role
```typescript
@RequireAnyOfRoles({ anyInstituteRole: true })
```
- Includes all institute members
- Parents automatically included
- Used for notifications, general data

---

## 🧪 Testing Example

```bash
# 1. Login as parent
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"parent@example.com","password":"password"}'

# Response includes JWT with c: ["500341", "500362"]

# 2. Access child's institutes
curl -X GET http://localhost:8080/users/500362/parent-institutes \
  -H "Authorization: Bearer <TOKEN>"

# 3. Access child's classes
curl -X GET http://localhost:8080/students/500362/classes \
  -H "Authorization: Bearer <TOKEN>"

# 4. Access child's attendance
curl -X GET "http://localhost:8080/api/attendance/student/500362?startDate=2026-01-01&endDate=2026-01-31" \
  -H "Authorization: Bearer <TOKEN>"

# 5. Access child's homeworks
curl -X GET "http://localhost:8080/institute-class-subject-homeworks/user/500362?instituteId=109&classId=202&subjectId=5" \
  -H "Authorization: Bearer <TOKEN>"
```

---

## ✨ Key Features

1. **Zero Code Duplication** - All validation in FlexibleAccessGuard
2. **Automatic Validation** - JWT `c` array checked automatically
3. **Secure** - Cannot manipulate JWT on client side
4. **Easy to Extend** - Just add `parent: {}` to new endpoints
5. **Consistent** - Same pattern across all endpoints

---

## 🚀 Adding Parent Access to New Endpoints

```typescript
// Just add parent: {} to the decorator!
@Get('new-endpoint/:studentId')
@UseGuards(FlexibleAccessGuard)
@RequireAnyOfRoles({
  student: {},           // Student can access own data
  parent: {},            // ✨ Parent can access children's data - AUTOMATIC!
  teacher: {},           // Teacher can access
  instituteAdmin: true   // Admin can access
})
async newEndpoint(@Param('studentId') studentId: string) {
  // No manual validation needed - guard handles it!
  return this.service.getData(studentId);
}
```

That's it! The FlexibleAccessGuard automatically:
1. Extracts `studentId` from params
2. Checks if it's in JWT's `c` array
3. Grants or denies access

---

**Total Endpoints:** 17+  
**Implementation Date:** January 31, 2026  
**Status:** ✅ Production Ready
