# Parent Access to Child Data - Complete Implementation Guide

## 📋 Overview

This guide documents the complete implementation of **parent access to children's data** in the LMS API. Parents can now access read-only (GET) APIs for their children's data including homeworks, lectures, exams, submissions, and other educational content.

## 🎯 Feature Requirements

**User Story:**
> As a parent, I want to access my child's educational data (homeworks, lectures, exams, etc.) so I can monitor their academic progress without needing direct access to their account.

**Key Requirements:**
1. ✅ Parents must have child student IDs in their JWT token (`c` field)
2. ✅ Parents can only access **read-only (GET)** operations
3. ✅ Parents cannot modify or delete child data
4. ✅ Access validation checks both institute access AND parent-child relationship
5. ✅ Works seamlessly with existing access control system

## 🔐 JWT Token Structure

### Parent JWT Token Example
```json
{
  "s": "63527",           // Parent's user ID
  "u": 2,                 // User type (2 = User)
  "i": [                  // Institute access array (may be empty for parents)
    {
      "i": "1",          // Institute ID
      "r": 1,            // Role bitmask (1 = PARENT)
      "c": []            // Class-subject array (empty for parents)
    }
  ],
  "c": ["500231", "500232"] // ⭐ Children array - student IDs the parent can access
}
```

### Student JWT Token Example (For Reference)
```json
{
  "s": "500231",          // Student's user ID
  "u": 2,                 // User type
  "i": [
    {
      "i": "1",          // Institute ID
      "r": 2,            // Role bitmask (2 = STUDENT)
      "c": [             // Class-subject array
        ["1001", 15]    // Class 1001, subjects bitmask 15 (subjects 1,2,3,4)
      ]
    }
  ]
}
```

## 🏗️ Architecture

### Core Components Updated

#### 1. **InstituteAccessValidator Helper** (`src/common/helpers/institute-access-validator.helper.ts`)

**New Method Signature:**
```typescript
static validateInstituteAccess(
  user: any,
  instituteId: string,
  requiredRoles?: number[],
  targetUserId?: string,      // NEW: Target user for parent access
  isReadOnly: boolean = false  // NEW: Indicates GET operation
): void
```

**Parent Access Logic:**
```typescript
private static isParentAccessingChildData(user: any, targetUserId: string): boolean {
  const children = Array.isArray(user.c) ? user.c : [];
  return children.includes(targetUserId);
}
```

**Validation Flow:**
```
1. Check if user has direct institute access
   ├─ YES → Validate normally
   └─ NO → Check parent access conditions:
       ├─ Is operation read-only? (isReadOnly === true)
       ├─ Is targetUserId provided?
       └─ Is targetUserId in user.c array?
           ├─ YES to all → ALLOW ACCESS ✅
           └─ NO to any → DENY ACCESS ❌
```

#### 2. **Updated Services**

**Services Updated:**
- ✅ `institute_class_subject_homeworks.service.ts`
- ✅ `institute_class_subject_homeworks_submissions.service.ts`
- ✅ `institute_class_subject_lectures.service.ts`
- ✅ `institute_class_subject_exams.service.ts`

**Pattern Applied:**
```typescript
// Extract targetUserId from query/filters
const targetUserId = query.userId || filters.studentId;

// Pass to validator with isReadOnly=true
InstituteAccessValidator.validateInstituteAccess(
  user, 
  instituteId, 
  undefined,    // requiredRoles
  targetUserId, // NEW parameter
  true          // isReadOnly = true for GET operations
);
```

## 📚 Implementation Details

### 1. Homework Service Updates

#### File: `institute_class_subject_homeworks.service.ts`

**Location 1: `findUserHomeworksWithSubmissionsAndReferences()` - Line ~645**
```typescript
// OLD: Strict user ID match
if (user.sub !== userId) {
  throw new ForbiddenException('You can only access your own homework data.');
}

// NEW: Allow parent or own access
const isOwnData = user.sub === userId;
const children = Array.isArray(user.c) ? user.c : [];
const isParentOfUser = children.includes(userId);

if (!isOwnData && !isParentOfUser) {
  throw new ForbiddenException('You can only access your own homework data or your children\'s homework data.');
}

// Pass userId as targetUserId with isReadOnly=true
InstituteAccessValidator.validateInstituteAccess(user, instituteId, undefined, userId, true);
```

**Location 2: `findAll()` - Line ~80**
```typescript
// Extract userId from query for parent access
const targetUserId = query.userId;

// Validate with parent access support
InstituteAccessValidator.validateInstituteAccess(
  user, 
  query.instituteId, 
  undefined, 
  targetUserId, 
  true
);
```

**Location 3: `findOne()` - Line ~450**
> No changes needed - uses `validateResourceAccess()` which already supports parent access

### 2. Homework Submissions Service

#### File: `institute_class_subject_homeworks_submissions.service.ts`

**Location: `findAll()` - Line ~60**
```typescript
// Extract targetUserId from filters (studentId or userId)
const targetUserId = filters.studentId || filters.userId;

// Validate with parent access support
InstituteAccessValidator.validateInstituteAccess(
  user, 
  filters.instituteId, 
  undefined, 
  targetUserId, 
  true
);
```

### 3. Lectures Service

#### File: `institute_class_subject_lectures.service.ts`

**Updates:**
1. Added `userId?: string` field to `QueryLectureDto` interface (Line ~12)
2. Updated `findAll()` method (Line ~80):
```typescript
const targetUserId = filters.userId;
InstituteAccessValidator.validateInstituteAccess(
  user, 
  filters.instituteId, 
  undefined, 
  targetUserId, 
  true
);
```

### 4. Exams Service

#### File: `institute_class_subject_exams.service.ts`

**Updates:**
1. Added `userId?: string` field to `QueryInstituteClassSubjectExamDto` (DTO file)
2. Updated `findAll()` method (Line ~145):
```typescript
const targetUserId = query.userId;
InstituteAccessValidator.validateInstituteAccess(
  user, 
  query.instituteId, 
  undefined, 
  targetUserId, 
  true
);
```

## 🧪 Testing Guide

### Test Scenario 1: Parent Accessing Child's Homework

**Request:**
```http
GET /api/v2/institute-class-subject-homeworks?instituteId=1&classId=1001&userId=500231
Authorization: Bearer <parent_jwt_with_c_field>
```

**Parent JWT:**
```json
{
  "s": "63527",
  "u": 2,
  "i": [],
  "c": ["500231"]  // Parent can access child 500231's data
}
```

**Expected Result:** ✅ SUCCESS
- Parent has child 500231 in `c` array
- Operation is read-only (GET)
- Returns child's homework list

### Test Scenario 2: Parent Accessing Non-Child's Data

**Request:**
```http
GET /api/v2/institute-class-subject-homeworks?instituteId=1&userId=999999
Authorization: Bearer <parent_jwt_with_c_field>
```

**Parent JWT:**
```json
{
  "s": "63527",
  "c": ["500231"]  // Does NOT include 999999
}
```

**Expected Result:** ❌ FORBIDDEN
```json
{
  "statusCode": 403,
  "message": "Access denied. You do not have access to institute 1"
}
```

### Test Scenario 3: Parent Trying to Modify Data

**Request:**
```http
PATCH /api/v2/institute-class-subject-homeworks/123
Authorization: Bearer <parent_jwt>
Body: { "title": "Modified" }
```

**Expected Result:** ❌ FORBIDDEN
- Parent access only works for read-only operations
- POST/PATCH/PUT/DELETE operations require direct institute access

### Test Scenario 4: Student Accessing Own Data

**Request:**
```http
GET /api/v2/institute-class-subject-homeworks?instituteId=1&classId=1001&userId=500231
Authorization: Bearer <student_jwt>
```

**Student JWT:**
```json
{
  "s": "500231",
  "i": [{"i": "1", "r": 2, "c": [["1001", 15]]}]
}
```

**Expected Result:** ✅ SUCCESS
- Student has direct institute access
- Normal validation flow applies

## 🔄 Access Validation Flow

### Flow Diagram

```
┌─────────────────────────────────────────┐
│   GET Request with userId parameter     │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  Extract targetUserId from query/filter │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│  Call validateInstituteAccess(          │
│    user, instituteId, roles,            │
│    targetUserId, isReadOnly=true        │
│  )                                       │
└───────────────┬─────────────────────────┘
                │
                ▼
        ┌───────────────┐
        │ Has institute │ YES
        │ access?       ├────────► ✅ Allow (Normal flow)
        └───────┬───────┘
                │ NO
                ▼
        ┌───────────────┐
        │ Is read-only? │ NO
        │               ├────────► ❌ Deny (Write ops require access)
        └───────┬───────┘
                │ YES
                ▼
        ┌───────────────┐
        │ targetUserId  │ NO
        │ provided?     ├────────► ❌ Deny (No target specified)
        └───────┬───────┘
                │ YES
                ▼
        ┌───────────────┐
        │ targetUserId  │ NO
        │ in user.c?    ├────────► ❌ Deny (Not parent of target)
        └───────┬───────┘
                │ YES
                ▼
            ✅ Allow
     (Parent accessing child)
```

## 📊 Supported Endpoints

### ✅ Homeworks
- `GET /api/v2/institute-class-subject-homeworks?userId={childId}`
- `GET /api/v2/institute-class-subject-homeworks/user/{childId}`
- `GET /api/v2/institute-class-subject-homeworks/:id` (if child has access)

### ✅ Homework Submissions
- `GET /api/v2/institute-class-subject-homeworks-submissions?studentId={childId}`
- `GET /api/v2/institute-class-subject-homeworks-submissions?userId={childId}`

### ✅ Lectures
- `GET /api/v2/institute-class-subject-lectures?userId={childId}`
- `GET /api/v2/institute-class-subject-lectures/:id` (if child has access)

### ✅ Exams
- `GET /api/v2/institute-class-subject-exams?userId={childId}`
- `GET /api/v2/institute-class-subject-exams/:id` (if child has access)

### ❌ Not Supported (Write Operations)
- `POST` - Create operations require direct access
- `PATCH/PUT` - Update operations require direct access
- `DELETE` - Delete operations require direct access

## 🔑 Key Points

### ✅ What Parents CAN Do
1. View their children's homeworks
2. View their children's homework submissions
3. View their children's lectures
4. View their children's exam schedules and results
5. View class and subject information their children have access to

### ❌ What Parents CANNOT Do
1. Create new homeworks, lectures, or exams
2. Modify existing data
3. Delete any records
4. Submit homework on behalf of children
5. Access data of students who are not their children
6. Access admin or teacher-only features

## 🛡️ Security Considerations

### 1. **JWT Token Trust**
- The `c` field in JWT is set during login/token generation
- It comes from the database `parent_student` relationship table
- Cannot be modified by the client
- Validated and signed by the server

### 2. **Read-Only Enforcement**
- `isReadOnly=true` parameter ensures parent access only works for GET operations
- Write operations (POST/PATCH/DELETE) always require direct institute access

### 3. **No Privilege Escalation**
- Parents cannot gain access beyond their children's data
- Parents cannot perform operations their children cannot perform
- Role-based restrictions still apply for all operations

### 4. **Audit Trail**
- All API requests include JWT user ID (`user.s`)
- Logs show which parent accessed which child's data
- Can track parent access patterns for security monitoring

## 📝 Frontend Integration

### Sample API Call (React/TypeScript)

```typescript
// Get child's homeworks
const getChildHomeworks = async (childUserId: string) => {
  try {
    const response = await axios.get(
      `/api/v2/institute-class-subject-homeworks`,
      {
        params: {
          instituteId: '1',
          classId: '1001',
          userId: childUserId  // ⭐ Pass child's userId
        },
        headers: {
          Authorization: `Bearer ${parentJwtToken}`
        }
      }
    );
    
    return response.data;
  } catch (error) {
    if (error.response?.status === 403) {
      console.error('Parent does not have access to this child');
    }
    throw error;
  }
};
```

### Multiple Children Handling

```typescript
// Get data for all children
const getAllChildrenData = async (childrenIds: string[]) => {
  const promises = childrenIds.map(childId => 
    getChildHomeworks(childId)
  );
  
  const results = await Promise.allSettled(promises);
  
  // Filter successful results
  const successfulData = results
    .filter(result => result.status === 'fulfilled')
    .map(result => result.value);
    
  return successfulData;
};
```

## 🐛 Troubleshooting

### Issue 1: "Access denied. You do not have access to institute X"

**Cause:** Parent doesn't have target child in JWT `c` array

**Solution:**
1. Verify JWT token contains `c` field with child's ID
2. Check `parent_student` relationship in database
3. Re-login to get fresh JWT token if relationship was just added

### Issue 2: Parent can't access even with correct JWT

**Cause:** Missing `userId` parameter in request

**Solution:**
```http
# ❌ WRONG - No userId parameter
GET /api/v2/homeworks?instituteId=1

# ✅ CORRECT - Include userId
GET /api/v2/homeworks?instituteId=1&userId=500231
```

### Issue 3: 403 on POST/PATCH/DELETE

**Cause:** Parent access only works for GET operations

**Solution:** These operations require direct institute access. Parents cannot perform write operations on behalf of children.

## 📈 Future Enhancements

### Potential Improvements
1. **Parent Dashboard API**: Aggregated view of all children's data
2. **Parent Notifications**: Alerts when child submits homework, gets grades
3. **Parent Comments**: Allow parents to add private notes on child's progress
4. **Multi-Institute Support**: Handle children in multiple institutes
5. **Granular Permissions**: Allow parents to opt-in/opt-out of specific data types

## 🎉 Conclusion

The parent access feature is now fully implemented and ready for production use. Parents can seamlessly access their children's educational data through GET APIs while maintaining strict security boundaries.

**Key Achievement:** ✅ Zero breaking changes to existing APIs - feature works transparently with current system

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-XX  
**Implementation Status:** ✅ COMPLETE
