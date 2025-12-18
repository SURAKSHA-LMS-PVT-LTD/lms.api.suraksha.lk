# JWT Validation Decorators - Latest Patterns

This document describes the latest JWT validation decorators and patterns for protecting API endpoints with role-based access control and resource-specific validations.

## 🚀 Quick Start

### Required Setup

```typescript
// 1. Import guards and decorators
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EnhancedRolesGuard } from '../guards/enhanced-roles.guard';
import { ValidateRole, ValidateInstituteAccess } from '../decorators/validation.decorators';

// 2. Apply guards to your controller
@Controller('api')
@UseGuards(JwtAuthGuard, EnhancedRolesGuard)
export class ApiController {
  
  @ValidateRole(UserType.TEACHER, UserType.INSTITUTE_ADMIN)
  @ValidateInstituteAccess('instituteId')
  @Get('institutes/:instituteId/data')
  getData(@Param('instituteId') instituteId: string) {
    return { message: 'Access granted' };
  }
}
```

## Available Decorators

### 1. `@ValidateRole(...roles)`
Validates that the authenticated user has one of the specified roles.

```typescript
import { ValidateRole } from '../common/decorators';
import { UserType } from '../modules/user/enums/user-type.enum';

@ValidateRole(UserType.STUDENT, UserType.INSTITUTE_ADMIN, UserType.TEACHER)
@Get('students')
getStudents() {
  return { message: 'Students data' };
}
```

### 2. `@ValidateClassAccess(paramName)`
Validates that the authenticated user has access to the specified class. The class ID is extracted from route parameters, query parameters, or request body.

```typescript
@ValidateClassAccess('classId')
@Get('class/:classId/students')
getClassStudents(@Param('classId') classId: string) {
  return { message: `Students in class ${classId}` };
}
```

### 3. `@ValidateSubjectAccess(paramName)`
Validates that the authenticated user has access to the specified subject.

```typescript
@ValidateSubjectAccess('subjectId')
@Get('subject/:subjectId/assignments')
getSubjectAssignments(@Param('subjectId') subjectId: string) {
  return { message: `Assignments for subject ${subjectId}` };
}
```

### 4. `@ValidateInstituteAccess(paramName)`
Validates that the authenticated user has access to the specified institute.

**Note**: Parents don't have direct institute access. They access resources through their students.

```typescript
@ValidateInstituteAccess('instituteId')
@Get('institute/:instituteId/overview')
getInstituteOverview(@Param('instituteId') instituteId: string) {
  return { message: `Overview for institute ${instituteId}` };
}
```

### 5. `@Validate(callback)`
Executes a callback function when all validations pass successfully. Useful for logging or analytics.

```typescript
@Validate(() => console.log('validations success log token {}'))
@Get('students')
getStudents() {
  return { message: 'Students data' };
}
```

## Required Guard

To use these decorators, you must apply the `EnhancedRolesGuard` to your controller or route:

```typescript
import { UseGuards } from '@nestjs/common';
import { EnhancedRolesGuard } from '../common/guards';

@Controller('example')
@UseGuards(EnhancedRolesGuard)
export class ExampleController {
  // Your routes with validation decorators
}
```

## Complete Example

```typescript
import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { UserType } from '../modules/user/enums/user-type.enum';
import { 
  ValidateRole, 
  ValidateClassAccess, 
  ValidateSubjectAccess, 
  ValidateInstituteAccess,
  Validate 
} from '../common/decorators';
import { EnhancedRolesGuard } from '../common/guards';

@Controller('api')
@UseGuards(EnhancedRolesGuard)
export class ApiController {

  @Post('institute/:instituteId/class/:classId/subject/:subjectId/assignment')
  @ValidateRole(UserType.TEACHER, UserType.INSTITUTE_ADMIN)
  @ValidateInstituteAccess('instituteId')
  @ValidateClassAccess('classId')
  @ValidateSubjectAccess('subjectId')
  @Validate(() => console.log('validations success log token {}'))
  createAssignment(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string
  ) {
    return { 
      message: `Assignment created for subject ${subjectId} in class ${classId} at institute ${instituteId}` 
    };
  }
}
```

## Access Control Rules

### Role-Based Access
- **INSTITUTE_ADMIN**: Has access to all resources within their institutes
- **ATTENDANCE_MARKER**: Has access to all resources within their institutes
- **TEACHER**: Has access to their assigned classes and subjects
- **STUDENT**: Has access to their enrolled classes and subjects
- **PARENT**: Has access to their students' data (no direct institute access)

### JWT Token Support
The guard supports both compact and legacy JWT token formats:
- **Compact format**: Uses short property names (i, c, sb, sd) for better performance
- **Legacy format**: Uses full property names for backward compatibility

### Parameter Extraction
The guard extracts parameters in the following order:
1. Route parameters (`@Param`)
2. Query parameters (`@Query`) 
3. Request body properties

## Error Handling

The guard throws `ForbiddenException` with descriptive messages:
- `"User not authenticated"` - No JWT token provided
- `"Insufficient role permissions"` - User role not in allowed roles
- `"Insufficient institute access"` - User doesn't have access to the institute
- `"Insufficient class access"` - User doesn't have access to the class
- `"Insufficient subject access"` - User doesn't have access to the subject

## Important Notes

1. **Parent Access**: Parents don't have institutes in their JWT tokens. They access resources through their student IDs.

2. **Multiple Decorators**: You can combine multiple validation decorators on the same route.

3. **Success Callback**: The `@Validate` decorator callback is optional and should not throw errors as it won't block the request.

4. **Parameter Names**: Make sure the parameter names in decorators match exactly with your route parameter, query parameter, or body property names.
