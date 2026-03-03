import { createParamDecorator, ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';

/**
 * Custom decorator to validate that the userId parameter matches the authenticated user's ID
 * 
 * Usage: @ValidateUserId('userId')
 * 
 * This decorator extracts the specified parameter from the request and compares it
 * with the authenticated user's ID from the JWT token. If they don't match,
 * it throws a ForbiddenException.
 * 
 * @param paramName - The name of the route parameter to validate (default: 'userId')
 * @returns Decorator function
 */
export const ValidateUserId = createParamDecorator(
  (paramName: string = 'userId', ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user; // From JWT authentication
    const params = request.params;
    
    // Check if user is authenticated
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    
    // Get the parameter value from route
    const paramValue = params[paramName];
    if (!paramValue) {
      throw new BadRequestException(`Parameter '${paramName}' is required`);
    }
    
    // Extract user ID from JWT token
    // The JWT strategy may store the user ID in 'id', 'userId', or 's' field
    const jwtUserId = user.id?.toString() || user.userId?.toString() || user.s?.toString();
    
    if (!jwtUserId) {
      throw new ForbiddenException('Invalid authentication token - user ID not found');
    }
    
    // Convert both to BigInt for accurate comparison
    let paramUserId: string;
    let tokenUserId: string;
    
    try {
      paramUserId = BigInt(paramValue).toString();
      tokenUserId = BigInt(jwtUserId).toString();
    } catch (error) {
      throw new BadRequestException(`Invalid user ID format: ${paramValue}`);
    }
    
    // Validate that the parameter matches the authenticated user ID
    if (paramUserId !== tokenUserId) {
      throw new ForbiddenException(
        `Access denied: You can only access your own data. Requested ID: ${paramValue}, Your ID: ${jwtUserId}`
      );
    }
    
    // Return the validated user ID
    return paramUserId;
  },
);

/**
 * Enhanced decorator that also supports admin override
 * Allows superadmins and institute admins to access other users' data
 * 
 * Usage: @ValidateUserIdWithAdminOverride('userId')
 */
export const ValidateUserIdWithAdminOverride = createParamDecorator(
  (paramName: string = 'userId', ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    const params = request.params;
    
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    
    const paramValue = params[paramName];
    if (!paramValue) {
      throw new BadRequestException(`Parameter '${paramName}' is required`);
    }
    
    const jwtUserId = user.id?.toString() || user.userId?.toString() || user.s?.toString();
    
    if (!jwtUserId) {
      throw new ForbiddenException('Invalid authentication token - user ID not found');
    }
    
    let paramUserId: string;
    let tokenUserId: string;
    
    try {
      paramUserId = BigInt(paramValue).toString();
      tokenUserId = BigInt(jwtUserId).toString();
    } catch (error) {
      throw new BadRequestException(`Invalid user ID format: ${paramValue}`);
    }
    
    // Check if user is accessing their own data
    const isOwnData = paramUserId === tokenUserId;
    
    // Check admin privileges (userType is DB value: 'SUPER_ADMIN', 'ORGANIZATION_MANAGER', 'USER', etc.)
    const isSuperAdmin = user.userType === 'SUPER_ADMIN';
    const isOrgManager = user.userType === 'ORGANIZATION_MANAGER';
    const isRegularUser = ['USER', 'USER_WITHOUT_PARENT', 'USER_WITHOUT_STUDENT'].includes(user.userType);
    
    // Allow access based on user type and ownership
    if (isOwnData) {
      // User accessing their own data - always allowed
      return paramUserId;
    } else if (isSuperAdmin) {
      // Superadmin can access any user's data
      return paramUserId;
    } else if (isOrgManager) {
      // Organization manager access will be validated in the service layer
      // for organization-specific permissions
      return paramUserId;
    } else if (isRegularUser) {
      // Regular users can only access their own data
      throw new ForbiddenException(
        `Access denied: Regular users can only access their own data. Requested ID: ${paramValue}, Your ID: ${jwtUserId}`
      );
    } else {
      // Unknown user type - deny access
      throw new ForbiddenException('Insufficient permissions to access user data');
    }
  },
);
