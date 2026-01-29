import { ForbiddenException } from '@nestjs/common';

/**
 * Helper class for validating institute access from JWT tokens
 * Prevents duplicate code and unnecessary database queries
 * 
 * PARENT ACCESS: Parents can access GET (read-only) endpoints for their children's data
 * - JWT payload contains `c` field with child student IDs
 * - When userId in request doesn't match JWT user (req.user.sub), checks if:
 *   1. Requesting user is a parent (has `c` field in JWT)
 *   2. Target userId is in parent's children list
 *   3. Request is a GET (read-only) operation
 */
export class InstituteAccessValidator {
  /**
   * Validates if user has access to a specific institute
   * @param user - JWT payload with institute access
   * @param instituteId - Institute ID to check access for
   * @param requiredRoles - Optional array of required role bitmasks (e.g., [4, 8] for Teacher or Admin)
   * @param targetUserId - Optional target user ID (for parent accessing child data)
   * @param isReadOnly - Optional flag indicating if this is a GET/read-only operation (default: false)
   * @throws ForbiddenException if user doesn't have access
   */
  static validateInstituteAccess(
    user: any,
    instituteId: string,
    requiredRoles?: number[],
    targetUserId?: string,
    isReadOnly: boolean = false
  ): void {
    const userInstituteAccess = Array.isArray(user.i) ? user.i : [];
    
    // Check if user has access to this institute
    const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === instituteId);
    
    if (!instituteEntry) {
      // 🔑 PARENT ACCESS: Check if this is a parent accessing their child's data (read-only)
      if (isReadOnly && targetUserId && this.isParentAccessingChildData(user, targetUserId)) {
        // Parent has access to child's read-only data - allow access
        return;
      }
      
      throw new ForbiddenException(
        `Access denied. You do not have access to institute ${instituteId}`
      );
    }
    
    // If specific roles are required, check if user has any of them
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some(role => instituteEntry.r === role);
      
      if (!hasRequiredRole) {
        // 🔑 PARENT ACCESS: Check if this is a parent accessing their child's data (read-only)
        if (isReadOnly && targetUserId && this.isParentAccessingChildData(user, targetUserId)) {
          // Parent has access to child's read-only data - allow access
          return;
        }
        
        const roleNames = this.getRoleNames(requiredRoles);
        throw new ForbiddenException(
          `Access denied. You need one of these roles in institute ${instituteId}: ${roleNames.join(', ')}`
        );
      }
    }
  }

  /**
   * 🔑 Checks if the requesting user is a parent accessing their child's data
   * @param user - JWT payload (parent)
   * @param targetUserId - Target user ID (child)
   * @returns true if user is parent and targetUserId is their child
   */
  private static isParentAccessingChildData(user: any, targetUserId: string): boolean {
    // Check if user has children array in JWT payload
    const children = Array.isArray(user.c) ? user.c : [];
    
    if (children.length === 0) {
      return false; // User is not a parent or has no children
    }
    
    // Check if targetUserId is in the parent's children list
    return children.includes(targetUserId);
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
   * @param targetUserId - Optional target user ID (for parent accessing child data)
   * @param isReadOnly - Optional flag indicating if this is a GET/read-only operation (default: false)
   */
  static validateResourceAccess(
    user: any,
    resource: { instituteId: string },
    requiredRoles?: number[],
    targetUserId?: string,
    isReadOnly: boolean = false
  ): void {
    this.validateInstituteAccess(user, resource.instituteId, requiredRoles, targetUserId, isReadOnly);
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
