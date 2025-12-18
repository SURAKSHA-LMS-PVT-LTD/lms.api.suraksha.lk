# Enhanced JWT Validation System - V2 Authentication

## Overview

The new V2 authentication system provides comprehensive JWT tokens that include complete user access information, eliminating the need for database queries during validation. This document explains how the enhanced validation system works with the new JWT structure.

## V2 JWT Token Structure

### Enhanced JWT Payload (`EnhancedJwtPayload`)

```typescript
interface EnhancedJwtPayload {
  s: string;                                    // Subject (User ID)
  ut: string;                                   // Compact User Type (SA, OM, U, UWP, UWS)  
  iat: number;                                  // Issued At timestamp
  ia?: number | EnhancedInstituteAccessEntry[]; // Institute Access (global flag or array)
  ca?: string[];                                // Child Access (student IDs for parents)
}
```

### User Type Mappings

| Full User Type | Compact Code |
|----------------|--------------|
| SUPERADMIN | SA |
| ORGANIZATION_MANAGER | OM |
| USER | U |
| USER_WITHOUT_PARENT | UWP |
| USER_WITHOUT_STUDENT | UWS |

### Institute Access Structure

#### Global Access
- **SUPERADMIN** and **ORGANIZATION_MANAGER** get: `ia: 3204989` (global flag)
- This grants access to all institutes without specific validation

#### Specific Institute Access
```typescript
interface EnhancedInstituteAccessEntry {
  instituteId: string;        // Institute ID
  roles: string[];           // Institute roles ['IA', 'TE', 'ST', 'AM']  
  classes?: {                // Class access (optional)
    id: string;              // Class ID
    subjects?: string[];     // Subject IDs (optional)
  }[];
}
```

### Institute Role Codes

| Institute User Type | Role Code |
|-------------------|-----------|
| INSTITUTE_ADMIN | IA |
| TEACHER | TE |
| STUDENT | ST |
| ATTENDANCE_MARKER | AM |

## New Validation Decorators

### 1. `@ValidateEnhancedAccess()` - Main Comprehensive Validator

```typescript
@ValidateEnhancedAccess({
  allowedGlobalUserTypes: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
  allowedInstituteRoles: ['IA', 'TE'],
  instituteIdParam: 'instituteId',
  classIdParam: 'classId',
  requireClassAccess: true
})
async getClassDetails(@Param('instituteId') instituteId: string) {
  // Only SUPERADMIN/ORG_MANAGER globally OR IA/TE with class access
}
```

**Configuration Options:**
- `allowedGlobalUserTypes`: Global roles with universal access
- `allowedInstituteRoles`: Institute-specific roles from JWT
- `instituteIdParam`: Parameter name for institute ID extraction
- `classIdParam`: Parameter name for class ID extraction  
- `subjectIdParam`: Parameter name for subject ID extraction
- `studentIdParam`: Parameter name for student ID extraction (parent access)
- `allowParentAccess`: Enable parent access through children
- `requireClassAccess`: Validate specific class access from JWT
- `requireSubjectAccess`: Validate specific subject access from JWT

### 2. `@ValidateInstituteAdmin()` - Institute Admin Specific

```typescript
@ValidateInstituteAdmin({
  instituteIdParam: 'instituteId',
  allowGlobalAccess: true
})
async manageInstitute(@Param('instituteId') instituteId: string) {
  // Only SUPERADMIN/ORG_MANAGER or IA for this specific institute
}
```

### 3. `@ValidateGlobalOrInstitute()` - Hybrid Access Pattern

```typescript
@ValidateGlobalOrInstitute({
  allowedGlobalUserTypes: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
  allowedInstituteRoles: ['IA', 'TE'],  
  instituteIdParam: 'instituteId'
})
async getInstituteData(@Param('instituteId') instituteId: string) {
  // SUPERADMIN/ORG_MANAGER: Universal access
  // IA/TE: Only their specific institute
}
```

## Quick Access Decorators

### Common Patterns Made Simple

```typescript
// Only global administrators
@RequireGlobalAdmin()
async systemSettings() { }

// Global admin OR institute admin for specific institute
@RequireInstituteAdmin('instituteId')
async manageInstitute(@Param('instituteId') instituteId: string) { }

// Global admin OR institute staff (admin/teacher) for specific institute  
@RequireInstituteStaff('instituteId')
async getInstituteReports(@Param('instituteId') instituteId: string) { }

// Global admin OR any institute member for specific institute
@RequireInstituteAccess('instituteId') 
async getInstituteInfo(@Param('instituteId') instituteId: string) { }

// Class-specific access with validation
@RequireClassAccess('instituteId', 'classId')
async getClassDetails(
  @Param('instituteId') instituteId: string,
  @Param('classId') classId: string
) { }

// Subject-specific access including parent access
@RequireSubjectAccess('instituteId', 'classId', 'subjectId')
async getSubjectDetails(
  @Param('instituteId') instituteId: string,
  @Param('classId') classId: string,  
  @Param('subjectId') subjectId: string
) { }

// Parent OR staff access for student data
@RequireParentOrStaffAccess('instituteId', 'studentId')
async getStudentProgress(
  @Param('instituteId') instituteId: string,
  @Param('studentId') studentId: string
) { }
```

## Validation Flow

### 1. JWT Token Extraction
```typescript
const user: EnhancedJwtPayload = request.user; // From JWT Guard
const userType = fromCompactUserType(user.ut); // Convert SA -> SUPERADMIN
```

### 2. Global Access Check
```typescript
if (allowedGlobalUserTypes.includes(userType)) {
  return true; // SUPERADMIN/ORG_MANAGER bypass all checks
}
```

### 3. Institute Access Validation
```typescript
// Check global institute access flag
if (user.ia === GLOBAL_INSTITUTE_ACCESS_FLAG) {
  return true;
}

// Check specific institute access
if (Array.isArray(user.ia)) {
  const instituteAccess = user.ia.find(entry => entry.instituteId === instituteId);
  const hasRole = instituteAccess.roles.includes('IA'); // Example: Institute Admin
}
```

### 4. Class/Subject Access Validation
```typescript
// Validate class access from JWT
const classAccess = instituteAccess.classes?.find(cls => cls.id === classId);

// Validate subject access from JWT  
const hasSubjectAccess = classAccess?.subjects?.includes(subjectId);
```

### 5. Parent Access Validation
```typescript
// Check if user is parent of specific student
if (user.ca?.includes(studentId)) {
  return true; // Parent access granted
}
```

## Implementation Benefits

### 🚀 Performance Improvements
- **Zero Database Queries**: All access information embedded in JWT
- **Instant Validation**: No cache lookups or database hits during request validation
- **Reduced Latency**: Sub-millisecond authorization checks

### 🔒 Enhanced Security  
- **Comprehensive Access Control**: Class and subject-level permissions in JWT
- **Parent Access Tracking**: Child relationships embedded for secure parent access
- **Role-Based Validation**: Institute-specific roles with granular permissions

### 🎯 Developer Experience
- **Simple Decorators**: One-line access control with clear intent
- **Type Safety**: Full TypeScript support with enhanced interfaces
- **Flexible Configuration**: Granular control over validation requirements

## Migration from Old System

### Before (Cache-Based Validation)
```typescript
@ValidateHybridAccess({
  allowedGlobalUserTypes: [UserType.SUPERADMIN],
  allowedInstituteUserTypes: [InstituteUserType.INSTITUTE_ADMIN],
  instituteIdParam: 'instituteId'
})
async oldValidation() {
  // Required database/cache lookup for validation
}
```

### After (Enhanced JWT Validation)
```typescript
@RequireInstituteAdmin('instituteId') 
async newValidation() {
  // All validation data already in JWT - no database calls
}
```

## Usage Guidelines

### 1. **Choose the Right Decorator**
- `@RequireGlobalAdmin()`: System-wide operations
- `@RequireInstituteAdmin()`: Institute management operations
- `@RequireInstituteStaff()`: Institute teaching/admin operations
- `@RequireInstituteAccess()`: General institute member operations
- `@RequireClassAccess()`: Class-specific operations  
- `@RequireSubjectAccess()`: Subject-specific operations
- `@RequireParentOrStaffAccess()`: Student data access

### 2. **Parameter Naming Convention**
- Use `instituteId` for institute parameters
- Use `classId` for class parameters
- Use `subjectId` for subject parameters
- Use `studentId` for student parameters

### 3. **Error Handling**
- All decorators throw `ForbiddenException` on validation failure
- Custom error messages can be configured per decorator
- Detailed logging for debugging access issues

### 4. **Guard Application Order**
```typescript
@UseGuards(JwtAuthGuard, EnhancedValidationGuard)
@RequireInstituteAdmin('instituteId')
async secureEndpoint() {
  // 1. JwtAuthGuard extracts and validates JWT
  // 2. EnhancedValidationGuard performs access control
}
```

## V2 Auth API Endpoint

### Login V2
```http
POST /v2/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

### Response
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "payload": {
    "s": "12345",
    "ut": "SA",  
    "iat": 1696935600,
    "ia": 3204989
  },
  "user": {
    "id": "12345",
    "email": "admin@example.com", 
    "firstName": "Admin",
    "lastName": "User",
    "userType": "SUPERADMIN"
  }
}
```

## Examples by User Type

### SUPERADMIN (SA)
```json
{
  "s": "1",
  "ut": "SA", 
  "iat": 1696935600,
  "ia": 3204989  // Global access flag
}
```
- **Access**: All institutes, all classes, all subjects
- **Validation**: Bypasses all institute-specific checks

### Institute Admin (IA)  
```json
{
  "s": "2",
  "ut": "U",
  "iat": 1696935600, 
  "ia": [
    {
      "instituteId": "100",
      "roles": ["IA"],
      "classes": [
        {"id": "10", "subjects": ["1", "2", "3"]},
        {"id": "11", "subjects": ["1", "4"]}
      ]
    }
  ]
}
```
- **Access**: Only institute 100, all classes in that institute
- **Validation**: Institute-specific access control

### Teacher (TE)
```json
{
  "s": "3", 
  "ut": "U",
  "iat": 1696935600,
  "ia": [
    {
      "instituteId": "100",
      "roles": ["TE"], 
      "classes": [
        {"id": "10", "subjects": ["1", "2"]},
        {"id": "11", "subjects": ["1"]}
      ]
    }
  ]
}
```
- **Access**: Only specific classes and subjects they teach
- **Validation**: Class and subject-level verification

### Student (ST)  
```json
{
  "s": "4",
  "ut": "U", 
  "iat": 1696935600,
  "ia": [
    {
      "instituteId": "100",
      "roles": ["ST"],
      "classes": [
        {"id": "10", "subjects": ["1", "2", "3", "4"]}
      ]
    }
  ]
}
```
- **Access**: Only their enrolled classes and subjects
- **Validation**: Student enrollment verification

### Parent (UWS - User Without Student)
```json
{
  "s": "5",
  "ut": "UWS",
  "iat": 1696935600,
  "ca": ["4", "8"] // Children user IDs
}
```  
- **Access**: Only data related to their children (students 4 and 8)
- **Validation**: Parent-child relationship verification

This enhanced system provides zero-database-lookup authentication with comprehensive access control embedded directly in JWT tokens, resulting in significantly improved performance and security.