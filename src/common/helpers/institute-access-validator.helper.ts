import { ForbiddenException } from '@nestjs/common';

/**
 * Helper class for validating institute access from JWT tokens
 * Prevents duplicate code and unnecessary database queries
 */
export class InstituteAccessValidator {
  /**
   * Validates if user has access to a specific institute
   * @param user - JWT payload with institute access
   * @param instituteId - Institute ID to check access for
   * @param requiredRoles - Optional array of required role bitmasks (e.g., [4, 8] for Teacher or Admin)
   * @throws ForbiddenException if user doesn't have access
   */
  static validateInstituteAccess(
    user: any,
    instituteId: string,
    requiredRoles?: number[]
  ): void {
    const userInstituteAccess = Array.isArray(user.i) ? user.i : [];
    
    // Check if user has access to this institute
    const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === instituteId);
    
    if (!instituteEntry) {
      throw new ForbiddenException(
        `Access denied. You do not have access to institute ${instituteId}`
      );
    }
    
    // If specific roles are required, check if user has any of them
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some(role => instituteEntry.r === role);
      
      if (!hasRequiredRole) {
        const roleNames = this.getRoleNames(requiredRoles);
        throw new ForbiddenException(
          `Access denied. You need one of these roles in institute ${instituteId}: ${roleNames.join(', ')}`
        );
      }
    }
  }

  /**
   * Gets role names from bitmask values
   * @param roleBitmasks - Array of role bitmasks
   * @returns Array of role names
   */
  private static getRoleNames(roleBitmasks: number[]): string[] {
    const roleMap: { [key: number]: string } = {
      1: 'Parent',
      2: 'Student',
      4: 'Teacher',
      8: 'Institute Admin'
    };
    
    return roleBitmasks.map(mask => roleMap[mask] || 'Unknown').filter(Boolean);
  }

  /**
   * Validates institute access from resource entity
   * Use this when you already fetched the resource and want to validate access
   * @param user - JWT payload with institute access
   * @param resource - Entity with instituteId field
   * @param requiredRoles - Optional array of required role bitmasks
   */
  static validateResourceAccess(
    user: any,
    resource: { instituteId: string },
    requiredRoles?: number[]
  ): void {
    this.validateInstituteAccess(user, resource.instituteId, requiredRoles);
  }
}

/**
 * Role bitmask constants for easy reference
 */
export const ROLE_BITMASKS = {
  PARENT: 1,
  STUDENT: 2,
  TEACHER: 4,
  INSTITUTE_ADMIN: 8
} as const;
