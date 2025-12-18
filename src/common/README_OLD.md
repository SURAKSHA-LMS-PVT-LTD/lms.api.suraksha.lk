# Validation System Documentation

## Overview
This document describes the new streamlined validation system for the LMS project, featuring enhanced decorators and access service integration with the new JWT token architecture.

## Architecture

### Core Components

1. **Validation Decorators** (`src/common/decorators/validation.decorators.ts`)
   - `@ValidateRole(UserType.TEACHER, UserType.INSTITUTE_ADMIN)`
   - `@ValidateInstituteAccess('instituteId')`
   - `@ValidateClassAccess('instituteId', 'classId')`
   - `@ValidateSubjectAccess('instituteId', 'classId', 'subjectId')`

2. **AccessService** (`src/common/services/access.service.ts`)
   - `validateRole(user, allowedRoles): boolean`
   - `validateInstituteAccess(user, instituteId): boolean`
   - `validateClassAccess(user, instituteId, classId): boolean`
   - `validateSubjectAccess(user, instituteId, classId, subjectId): boolean`

3. **EnhancedRolesGuard** (`src/common/guards/enhanced-roles.guard.ts`)
   - Integrates with AccessService for validation
   - Handles all decorator metadata processing
   - Provides comprehensive logging

### Guards Remaining
- `JwtAuthGuard` - Authentication only
- `EnhancedRolesGuard` - Authorization with validation decorators

## Usage Examples

### Basic Controller Setup
```typescript
@Controller('example')
@UseGuards(JwtAuthGuard, EnhancedRolesGuard)
export class ExampleController {
  constructor(private readonly accessService: AccessService) {}
}
```

### Decorator Usage

#### Role Validation
```typescript
@Get('admin-only')
@ValidateRole(UserType.INSTITUTE_ADMIN, UserType.SUPERADMIN)
async adminOnlyEndpoint() {
  return { message: 'Admin only access' };
}
```

#### Institute Access Validation
```typescript
@Get('institute/:instituteId/info')
@ValidateRole(UserType.TEACHER, UserType.INSTITUTE_ADMIN)
@ValidateInstituteAccess('instituteId')
async getInstituteInfo(@Param('instituteId') instituteId: string) {
  return { message: `Institute ${instituteId} information` };
}
```

#### Class Access Validation
```typescript
@Get('institute/:instituteId/class/:classId/students')
@ValidateRole(UserType.TEACHER, UserType.INSTITUTE_ADMIN)
@ValidateClassAccess('instituteId', 'classId')
async getClassStudents(
  @Param('instituteId') instituteId: string,
  @Param('classId') classId: string
) {
  return { message: `Students in class ${classId}` };
}
```

#### Subject Access Validation
```typescript
@Get('institute/:instituteId/class/:classId/subject/:subjectId/assignments')
@ValidateRole(UserType.TEACHER, UserType.INSTITUTE_ADMIN)
@ValidateSubjectAccess('instituteId', 'classId', 'subjectId')
async getSubjectAssignments(
  @Param('instituteId') instituteId: string,
  @Param('classId') classId: string,
  @Param('subjectId') subjectId: string
) {
  return { message: `Assignments for subject ${subjectId}` };
}
```

### Manual Validation with AccessService

```typescript
@Post('manual-validation')
@ValidateRole(UserType.TEACHER)
async manualValidation(@Request() req: any, @Body() body: any) {
  const user = req.user;
  
  // Manual validation examples
  if (this.accessService.validateInstituteAccess(user, body.instituteId) !== true) {
    throw new ForbiddenException('Access denied to institute');
  }
  
  if (this.accessService.validateClassAccess(user, body.instituteId, body.classId) !== true) {
    throw new ForbiddenException('Access denied to class');
  }
  
  if (this.accessService.validateSubjectAccess(user, body.instituteId, body.classId, body.subjectId) !== true) {
    throw new ForbiddenException('Access denied to subject');
  }
  
  return { message: 'All validations passed' };
}
```

## JWT Token Architecture Support

The system supports the new hierarchical JWT token structure:

### Admin Access (aa)
```typescript
{
  "aa": {
    "instituteId1": true,
    "instituteId2": true
  }
}
```

### Hierarchical Access (ha)
```typescript
{
  "ha": {
    "instituteId1": {
      "classId1": ["subjectId1", "subjectId2"],
      "classId2": ["subjectId3", "subjectId4"]
    }
  }
}
```

## Key Features

### ✅ Benefits
- **Simplified Architecture**: Only 2 guards instead of 15+
- **Enhanced Performance**: Optimized token validation
- **Type Safety**: Full TypeScript support
- **Consistent API**: Standardized validation patterns
- **Comprehensive Logging**: Detailed access logging
- **Flexible Usage**: Both decorators and manual validation

### ✅ Validation Features
- Role-based access control
- Institute-level access validation
- Class-level access validation
- Subject-level access validation
- Hierarchical permission checking
- Admin access override support
- Legacy token format compatibility

### ✅ Error Handling
- Clear error messages
- Proper HTTP status codes
- Comprehensive logging
- Graceful fallbacks

## Migration Notes

### From Old System
1. Replace multiple guard decorators with single `@UseGuards(JwtAuthGuard, EnhancedRolesGuard)`
2. Use new validation decorators instead of old access control decorators
3. Import AccessService for manual validation
4. Update JWT payload interface to support new token structure

### Best Practices
1. Always use `@UseGuards(JwtAuthGuard, EnhancedRolesGuard)` on controllers
2. Parameter names in decorators must match route parameter names
3. Use `!== true` pattern when checking AccessService results
4. Combine multiple decorators for complex validation scenarios
5. Use AccessService methods for conditional validation logic

## Files Structure
```
src/common/
├── decorators/
│   └── validation.decorators.ts     # Validation decorators
├── services/
│   └── access.service.ts            # Access validation service
├── guards/
│   └── enhanced-roles.guard.ts      # Main authorization guard
├── examples/
│   └── validation-usage.example.ts  # Usage examples
└── index.ts                         # Exports
```

## Example Implementation
See `src/common/examples/validation-usage.example.ts` for comprehensive usage examples.

---

**Note**: This system replaces all previous guard implementations and provides a unified, streamlined approach to access control in the LMS application.
