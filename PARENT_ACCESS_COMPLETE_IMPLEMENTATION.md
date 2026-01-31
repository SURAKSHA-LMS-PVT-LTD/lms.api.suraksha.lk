# Parent Access to Children's Data - Complete Implementation Guide

## 🎯 Overview

Parents can now access their children's educational data through the API using JWT authentication. The system automatically validates parent-child relationships using the JWT token's `c` (children) array field.

## 🔐 Authentication & Authorization

### JWT Token Structure for Parents

When a parent logs in, their JWT token includes a `c` field containing their children's user IDs:

```json
{
  "s": "2",              // Parent's user ID
  "u": 0,                // User type
  "c": ["500341", "500362"]  // Children's user IDs
}
```

### FlexibleAccessGuard Enhancement

The `FlexibleAccessGuard` has been enhanced to automatically validate parent access when `parent: {}` is included in the `@RequireAnyOfRoles()` decorator.

**How it works:**
1. Guard extracts target `userId`/`studentId`/`studentUserId` from URL parameters
2. Checks if the target ID exists in JWT's `c` (children) array
3. Grants access if match is found, denies otherwise

**No manual validation code needed in controllers** - the guard handles everything!

## 📋 Endpoints Supporting Parent Access

### Core Educational Data

#### 1. **Get Parent Institutes**
Access a child's enrolled institutes.

```http
GET /users/:id/parent-institutes
```

**Access Control:** `parent: {}` - Automatic validation via FlexibleAccessGuard

---

#### 2. **Get Student Classes**
Access a child's enrolled classes.

```http
GET /students/:studentUserId/classes
```

**Access Control:** `parent: {}` - Automatic validation via FlexibleAccessGuard

---

#### 3. **Get Student Enrolled Classes**
Get detailed enrollment information for a child's classes.

```http
GET /students/:studentUserId/classes/enrolled
```

**Access Control:** `parent: {}` - Automatic validation via FlexibleAccessGuard

---

#### 4. **Get Class Subjects for Student**
Access subjects enrolled by a child.

```http
GET /institute-class-subject-students/student/:studentId
```

**Access Control:** `parent: {}` - Automatic validation via FlexibleAccessGuard

---

#### 5. **Get User Homeworks**
Access homework assignments for a child.

```http
GET /institute-class-subject-homeworks/user/:userId
```

**Access Control:** `parent: {}` - Automatic validation via FlexibleAccessGuard

**Query Parameters (Required):**
- `instituteId` - Institute ID
- `classId` - Class ID
- `subjectId` - Subject ID

---

### Attendance Management

#### 6. **Get Student Attendance Records**
Access a child's attendance history.

```http
GET /api/attendance/student/:studentId
```

**Access Control:** `parent: true` - Automatic validation via FlexibleAccessGuard

**Query Parameters:**
- `startDate` - Start date (YYYY-MM-DD)
- `endDate` - End date (YYYY-MM-DD)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 10)

---

#### 7. **Get Institute Attendance**
View all attendance records for an institute (filtered by child).

```http
GET /api/attendance/institute/:instituteId?studentId=:childId
```

**Access Control:** `parent: { requireStudent: true }` - Must include studentId in query

---

#### 8. **Get Class Attendance**
View class attendance records (filtered by child).

```http
GET /api/attendance/institute/:instituteId/class/:classId?studentId=:childId
```

**Access Control:** `parent: { requireStudent: true }` - Must include studentId in query

---

#### 9. **Get Subject Attendance**
View subject-specific attendance (filtered by child).

```http
GET /api/attendance/institute/:instituteId/class/:classId/subject/:subjectId?studentId=:childId
```

**Access Control:** `parent: { requireStudent: true }` - Must include studentId in query

---

### Payment Management

#### 10. **Submit Payment for Child**
Submit a payment on behalf of a child.

```http
POST /institute-payment-submissions/institute/:instituteId/payment/:paymentId/submit
```

**Access Control:** `parent: {}` - Automatic validation via FlexibleAccessGuard

---

#### 11. **Get My Submissions**
View payment submissions (includes parent's submissions for children).

```http
GET /institute-payment-submissions/institute/:instituteId/my-submissions
```

**Access Control:** `parent: {}` - Automatic validation via FlexibleAccessGuard

---

#### 12. **Get Student Payment Submissions**
View a specific child's payment submissions.

```http
GET /institute-payment-submissions/institute/:instituteId/student/:studentId/submissions
```

**Access Control:** `parent: { requireStudent: true }` - Validates child relationship

---

#### 13. **Get Submission Details**
View detailed payment submission information.

```http
GET /institute-payment-submissions/institute/:instituteId/submission/:submissionId
```

**Access Control:** `anyInstituteRole: true` - Includes parents

---

### Notifications

#### 14. **Get Institute Notifications**
View notifications for a child's institute.

```http
GET /push-notifications/institute/:instituteId
```

**Access Control:** `anyInstituteRole: true` - Includes parents

---

#### 15. **Get System Notifications**
View global/system-wide notifications.

```http
GET /push-notifications/system
```

**Access Control:** `anyInstituteRole: true` - Includes parents

---

#### 16. **Get Unread Notification Count**
Check unread notification count.

```http
GET /push-notifications/institute/:instituteId/unread-count
```

**Access Control:** `anyInstituteRole: true` - Includes parents

---

#### 17. **Mark Notifications as Read**
Mark notifications as read.

```http
POST /push-notifications/:id/read
POST /push-notifications/mark-read
POST /push-notifications/institute/:instituteId/mark-all-read
```

**Access Control:** `anyInstituteRole: true` - Includes parents

---

## 📊 Summary Statistics

**Total Parent-Accessible Endpoints:** 17+

**Categories:**
- 🎓 Educational Data: 5 endpoints
- 📅 Attendance: 4 endpoints  
- 💰 Payments: 4 endpoints
- 🔔 Notifications: 4+ endpoints

---

## 🔐 Access Control Patterns

### Pattern 1: Simple Parent Access
```typescript
@RequireAnyOfRoles({ student: {}, parent: {}, anyInstituteRole: true })
```
- Validates child ID is in JWT `c` array
- Works for: institutes, classes, subjects, homeworks

### Pattern 2: Filtered Access
```typescript
@RequireAnyOfRoles({ parent: { requireStudent: true } })
```
- Requires `studentId` in query/params
- FlexibleAccessGuard validates relationship
- Works for: attendance queries, payment submissions

### Pattern 3: Institute Role Access
```typescript
@RequireAnyOfRoles({ anyInstituteRole: true })
```
- Includes all institute members (students, teachers, parents)
- Works for: notifications, general institute data

---

## 🛠️ Implementation Details

### FlexibleAccessGuard Parent Validation Logic

Located in: `src/auth/guards/flexible-access.guard.ts`

```typescript
// CHECK 5: Parent Access
if (config.parent) {
  // Extract children IDs from JWT
  const childrenIds = user.c ? user.c.map(childId => String(childId)) : [];
  
  // Extract target userId from various parameter sources
  const targetUserId = params.id || params.userId || 
                      params.studentUserId || params.studentId || 
                      body.userId || body.studentId || 
                      query.userId || query.studentId;
  
  // Validate: target must be in parent's children array
  if (childrenIds.length > 0 && targetUserId) {
    const targetUserIdStr = String(targetUserId);
    hasParentAccess = childrenIds.includes(targetUserIdStr);
  }
  
  if (hasParentAccess) {
    return true; // ✅ Parent access granted
  }
}
```

### Controller Implementation Pattern

**Simple and clean - no manual validation needed:**

```typescript
@Get('student/:studentId')
@UseGuards(FlexibleAccessGuard)
@RequireAnyOfRoles({
  student: {},      // Student can access own data
  parent: {},       // Parent can access children's data (auto-validated)
  anyInstituteRole: true  // Teachers/admins can access
})
async getClassSubjectsForStudent(
  @Param('studentId', ParseBigIntPipe) studentId: string
): Promise<InstituteClassSubjectStudentResponseDto[]> {
  return await this.studentsService.getClassSubjectsForStudent(studentId);
}
```

**That's it!** The `FlexibleAccessGuard` automatically:
1. Checks if user is a parent with children
2. Validates target `studentId` is in JWT's `c` array
3. Grants or denies access accordingly

---

## 🧪 Testing Guide

### Test Credentials

**Parent Account:**
- Email: `kapilakarunarathna056@gmail.com`
- Password: `Password123@`
- User ID: `2`
- Children IDs: `["500341", "500362"]`

### Testing Steps

1. **Login as Parent:**
```bash
# Login
$loginResponse = Invoke-RestMethod -Uri "http://localhost:8080/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"kapilakarunarathna056@gmail.com","password":"Password123@"}'

$token = $loginResponse.accessToken
```

2. **Access Child's Institutes:**
```bash
Invoke-RestMethod -Uri "http://localhost:8080/users/500362/parent-institutes" `
  -Method GET `
  -Headers @{ Authorization = "Bearer $token" }
```

3. **Access Child's Classes:**
```bash
Invoke-RestMethod -Uri "http://localhost:8080/students/500362/classes" `
  -Method GET `
  -Headers @{ Authorization = "Bearer $token" }
```

4. **Access Child's Subjects:**
```bash
Invoke-RestMethod -Uri "http://localhost:8080/institute-class-subject-students/student/500362" `
  -Method GET `
  -Headers @{ Authorization = "Bearer $token" }
```

5. **Access Child's Homeworks:**
```bash
Invoke-RestMethod -Uri "http://localhost:8080/institute-class-subject-homeworks/user/500362?instituteId=109&classId=202&subjectId=5" `
  -Method GET `
  -Headers @{ Authorization = "Bearer $token" }
```

### Expected Results

✅ **Success (200 OK):**
- Parent accessing child 500362 or 500341's data
- Returns requested data

❌ **Access Denied (403 Forbidden):**
- Parent attempting to access non-child user's data
- Error: "Access denied. Required one of: Parent access (child ID: XXXXX)"

---

## 🎨 Frontend Integration

### React/TypeScript Example

```typescript
interface ParentAccessProps {
  childId: string;
  token: string;
}

// Fetch child's institutes
async function getChildInstitutes({ childId, token }: ParentAccessProps) {
  const response = await fetch(
    `${API_BASE_URL}/users/${childId}/parent-institutes?page=1&limit=10`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Access denied or child not found');
  }
  
  return response.json();
}

// Fetch child's classes
async function getChildClasses({ childId, token }: ParentAccessProps) {
  const response = await fetch(
    `${API_BASE_URL}/students/${childId}/classes?page=1&limit=10`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  
  return response.json();
}

// Fetch child's homeworks
async function getChildHomeworks(
  childId: string, 
  instituteId: string,
  classId: string,
  subjectId: string,
  token: string
) {
  const url = new URL(`${API_BASE_URL}/institute-class-subject-homeworks/user/${childId}`);
  url.searchParams.append('instituteId', instituteId);
  url.searchParams.append('classId', classId);
  url.searchParams.append('subjectId', subjectId);
  url.searchParams.append('page', '1');
  url.searchParams.append('limit', '20');
  
  const response = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  return response.json();
}
```

### Flutter/Dart Example

```dart
class ParentAPIService {
  final String baseUrl;
  final String token;
  
  ParentAPIService(this.baseUrl, this.token);
  
  // Get child's institutes
  Future<Map<String, dynamic>> getChildInstitutes(String childId) async {
    final response = await http.get(
      Uri.parse('$baseUrl/users/$childId/parent-institutes?page=1&limit=10'),
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json',
      },
    );
    
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else if (response.statusCode == 403) {
      throw Exception('Access denied: This is not your child');
    } else {
      throw Exception('Failed to load institutes');
    }
  }
  
  // Get child's classes
  Future<List<dynamic>> getChildClasses(String childId) async {
    final response = await http.get(
      Uri.parse('$baseUrl/students/$childId/classes'),
      headers: {'Authorization': 'Bearer $token'},
    );
    
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to load classes');
    }
  }
}
```

---

## 🔒 Security Features

### 1. **Automatic Parent-Child Validation**
- JWT's `c` array contains authoritative list of children
- Cannot be manipulated by client
- Validated on every request by FlexibleAccessGuard

### 2. **No Data Leakage**
- Parents can ONLY access children in their JWT `c` array
- Attempting to access other users returns 403 Forbidden
- Clear error messages without exposing sensitive data

### 3. **Token-Based Security**
- All requests require valid JWT token
- Token expiration enforced
- Re-login required if token expires

### 4. **Consistent Authorization**
- Same guard logic across all parent-accessible endpoints
- No duplicate validation code
- Single source of truth for access control

---

## 📊 Database Relationships

### Parent-Child Relationship

Stored in `students` table:
- `father_id` → User ID of father
- `mother_id` → User ID of mother  
- `guardian_id` → User ID of guardian

### JWT Generation

When parent logs in, system queries `students` table:
```sql
SELECT user_id FROM students 
WHERE father_id = :parentUserId 
   OR mother_id = :parentUserId 
   OR guardian_id = :parentUserId
```

Results populate JWT's `c` array field.

---

## 🚀 Future Enhancements

### Potential Additions

1. **Lecture Access**
   - Add `parent: {}` to lecture endpoints
   - Parents view child's lecture materials

2. **Exam Results**
   - Add `parent: {}` to exam result endpoints
   - Parents track child's academic progress

3. **Attendance Records**
   - Add `parent: {}` to attendance endpoints
   - Parents monitor child's attendance

4. **Fee Payments**
   - Add `parent: {}` to payment endpoints
   - Parents manage child's fee payments

5. **Notifications**
   - Push notifications for child's activities
   - Homework deadlines, exam schedules

### Implementation Pattern

For any new endpoint requiring parent access:

```typescript
@Get('some-child-resource/:studentId')
@UseGuards(FlexibleAccessGuard)
@RequireAnyOfRoles({
  student: {},           // Student can access own data
  parent: {},            // Parent can access children's data ✨
  teacher: {},           // Teacher can access student data
  instituteAdmin: true   // Admin can access all data
})
async getSomeResource(@Param('studentId') studentId: string) {
  // No manual validation needed - guard handles it!
  return this.service.getResource(studentId);
}
```

That's it! The `FlexibleAccessGuard` does all the work.

---

## 📝 Summary

**What Changed:**
1. ✅ Enhanced `FlexibleAccessGuard` with automatic parent-child validation
2. ✅ Added `parent: {}` to 5 key endpoints
3. ✅ Zero code duplication - guard handles everything
4. ✅ Consistent security across all endpoints

**Benefits:**
- 🔐 Secure parent access to children's data
- 🎯 Simple implementation - just add `parent: {}` to decorator
- 🧹 No duplicate validation code in controllers
- ⚡ Automatic validation via JWT token
- 🔄 Easy to extend to new endpoints

**Testing:**
- ✅ Tested with real parent account (userId: 2)
- ✅ Validated access to children (500341, 500362)
- ✅ Confirmed 403 errors for non-children
- ✅ All endpoints working correctly

---

## 🆘 Troubleshooting

### Issue: 403 Forbidden when parent accesses child data

**Possible Causes:**
1. JWT token doesn't include child ID in `c` array
2. Token expired - need to re-login
3. Incorrect child ID in request

**Solution:**
```bash
# Check JWT payload
$token = "YOUR_TOKEN_HERE"
$payload = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($token.Split('.')[1]))
Write-Host $payload

# Re-login to get fresh token
$loginResponse = Invoke-RestMethod -Uri "http://localhost:8080/auth/login" ...
```

### Issue: Empty `c` array in JWT

**Cause:** No parent-child relationship in database

**Solution:** Update `students` table to set `father_id`, `mother_id`, or `guardian_id` to parent's user ID.

---

## 📚 Related Documentation

- [MOBILE_AUTHENTICATION_GUIDE.md](./MOBILE_AUTHENTICATION_GUIDE.md) - Multi-identifier login
- [AUTH_COMPLETE_IMPLEMENTATION_GUIDE.md](./AUTH_COMPLETE_IMPLEMENTATION_GUIDE.md) - JWT structure
- [ENHANCED_USER_MANAGEMENT_GUIDE.md](./ENHANCED_USER_MANAGEMENT_GUIDE.md) - User types

---

**Implementation Date:** January 31, 2026  
**Status:** ✅ Completed and Tested  
**Version:** 1.0.0
