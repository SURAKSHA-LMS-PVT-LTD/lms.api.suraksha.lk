import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for children access decorator
 */
export const CHILDREN_ACCESS_KEY = 'children_access_param';

/**
 * Decorator to validate that a route parameter value exists in the JWT payload's 'c' (children) array.
 * This eliminates the need for database queries to validate parent-student relationships.
 * 
 * The JWT v2 token's 'c' field contains an array of student user IDs that the parent can access.
 * This decorator works in conjunction with ChildrenAccessGuard to validate access.
 * 
 * @param paramName - The name of the route parameter that contains the student ID to validate
 * 
 * @example
 * ```typescript
 * @Get('child/:studentId')
 * @ChildrenAccess('studentId')
 * async getChildProfile(@Param('studentId') studentId: string) {
 *   // If execution reaches here, JWT validation confirmed studentId is in jwt.c array
 * }
 * ```
 * 
 * @example
 * ```typescript
 * @Get('student/:id/grades')
 * @ChildrenAccess('id')
 * async getStudentGrades(@Param('id') id: string) {
 *   // Validates that 'id' parameter exists in JWT's children array
 * }
 * ```
 */
export const ChildrenAccess = (paramName: string) => 
  SetMetadata(CHILDREN_ACCESS_KEY, paramName);
