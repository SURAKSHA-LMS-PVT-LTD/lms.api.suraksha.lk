import { 
  Injectable, 
  CanActivate, 
  ExecutionContext, 
  ForbiddenException, 
  Logger,
  UnauthorizedException
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CHILDREN_ACCESS_KEY } from '../decorators/children-access.decorator';
import { EnhancedJwtPayload } from '../interfaces/enhanced-jwt-payload.interface';
import { USER_TYPE_COMPACT } from '../interfaces/enhanced-jwt-payload.interface';

/**
 * Guard that validates parent access to students using JWT v2 token's 'c' (children) array.
 * 
 * This guard eliminates database queries for parent-student relationship validation by:
 * 1. Extracting the JWT v2 payload from request.user
 * 2. Getting the 'c' (children) array which contains accessible student IDs
 * 3. Extracting the student ID from the specified route parameter
 * 4. Validating that the student ID exists in the children array
 * 
 * JWT v2 Payload Structure:
 * {
 *   s: "4",              // subject/userId (parent user ID)
 *   u: 3,                // user type (3 = USER_WITHOUT_PARENT)
 *   t: 1734068000,       // timestamp
 *   i: 999999,           // institute access (999999 = global)
 *   c: ["8", "12", "15"] // children - student user IDs parent can access
 * }
 * 
 * Performance Benefits:
 * - Zero database queries for access validation
 * - Validation happens in-memory using JWT data
 * - Eliminates TOCTOU (time-of-check-time-of-use) issues
 * 
 * Security Model:
 * - JWT 'c' array is populated during login based on database relationships
 * - Cannot be manipulated due to JWT signature verification
 * - Access rights are snapshot at login time
 * 
 * @example
 * ```typescript
 * @Controller('parent')
 * @UseGuards(JwtAuthGuard, ChildrenAccessGuard)
 * export class ParentController {
 *   
 *   @Get('child/:studentId')
 *   @ChildrenAccess('studentId')
 *   async getChildProfile(@Param('studentId') studentId: string) {
 *     // Access validated - studentId is in JWT's c array
 *   }
 * }
 * ```
 */
@Injectable()
export class ChildrenAccessGuard implements CanActivate {
  private readonly logger = new Logger(ChildrenAccessGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();
    
    // Get the parameter name that contains the student ID
    const paramName = this.reflector.get<string>(CHILDREN_ACCESS_KEY, handler);
    
    // If no decorator metadata, allow access (not a children-access-protected endpoint)
    if (!paramName) {
      return true;
    }

    // Ensure user is authenticated (should be set by JwtAuthGuard)
    if (!request.user) {
      this.logger.error('❌ No authenticated user found in request');
      throw new UnauthorizedException('Authentication required');
    }

    // Extract JWT v2 payload
    const jwtPayload: EnhancedJwtPayload = request.user;
    
    // Log user type for debugging
    const userTypeName = this.getUserTypeName(jwtPayload.u);

    // Get children array from JWT (defaults to empty array if not present)
    const childrenIds = jwtPayload.c || [];
    
    if (childrenIds.length === 0) {
      this.logger.warn(`⚠️ User ${jwtPayload.s} has no children in JWT token`);
      throw new ForbiddenException('You do not have access to any students');
    }

    // Extract student ID from route parameters
    const studentId = request.params[paramName];
    
    if (!studentId) {
      this.logger.error(`❌ Parameter '${paramName}' not found in request params`);
      throw new ForbiddenException(`Student ID parameter '${paramName}' is required`);
    }


    // Validate that student ID exists in children array
    if (!childrenIds.includes(studentId)) {
      this.logger.error(
        `❌ Access denied: Student ${studentId} not in user's children array [${childrenIds.join(', ')}]`
      );
      throw new ForbiddenException(
        `You do not have access to student with ID ${studentId}`
      );
    }

    
    // Attach children array to request for potential use in handlers
    request.accessibleChildrenIds = childrenIds;
    
    return true;
  }

  /**
   * Helper method to convert numeric user type to readable name
   */
  private getUserTypeName(userType: number): string {
    const typeMap: Record<number, string> = {
      [USER_TYPE_COMPACT.SUPERADMIN]: 'SUPERADMIN',
      [USER_TYPE_COMPACT.ORGANIZATION_MANAGER]: 'ORGANIZATION_MANAGER',
      [USER_TYPE_COMPACT.USER]: 'USER',
      [USER_TYPE_COMPACT.USER_WITHOUT_PARENT]: 'USER_WITHOUT_PARENT (Parent)',
      [USER_TYPE_COMPACT.USER_WITHOUT_STUDENT]: 'USER_WITHOUT_STUDENT',
    };
    return typeMap[userType] || `UNKNOWN (${userType})`;
  }
}
