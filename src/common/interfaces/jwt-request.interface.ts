/**
 * JWT v2 Request Interface
 * 
 * This interface defines the authenticated request structure used throughout the application.
 * It extends the Express Request with JWT v2 payload information.
 * 
 * JWT v2 Compact Format:
 * {
 *   s: userId (string),
 *   u: userType (UserType enum),
 *   i: [{
 *     i: instituteId (string),
 *     r: roleBitmask (number),
 *     c: [[classId, subjectBitmask]]
 *   }],
 *   o?: organizationAccess (optional),
 *   c?: children (optional - for parents)
 * }
 */

import { Request } from 'express';
import { UserType } from '../../modules/user/enums/user-type.enum';

/**
 * Institute access information in JWT v2 format
 */
export interface InstituteAccess {
  /** Institute ID */
  i: string;
  
  /** Role bitmask (1=SUPERADMIN, 2=IA, 4=TE, 8=ST, 16=PARENT) */
  r: number;
  
  /** Class and subject access array: [classId, subjectBitmask][] */
  c?: [string, number][];
}

/**
 * Organization access information (for organization managers)
 */
export interface OrganizationAccess {
  /** Organization ID */
  organizationId: string;
  
  /** Organization role */
  role: string;
  
  /** Is president flag */
  isPresident?: boolean;
}

/**
 * JWT v2 Payload Structure
 */
export interface JwtPayload {
  /** User ID (compact format: 's') */
  s: string;
  
  /** User Type compact numeric (0=SUPERADMIN,1=ORG_MGR,2=USER,3=WO_PARENT,4=WO_STUDENT) */
  u: number;
  
  /** User Type string from DB (e.g. 'SUPER_ADMIN', 'USER') — use this for comparisons */
  userType?: string;
  
  /** Institute access array (compact format: 'i') */
  i?: InstituteAccess[];
  
  /** Organization access (optional) */
  o?: OrganizationAccess;
  
  /** Children IDs (for parent users) */
  c?: string[];
  
  /** IAT (issued at) timestamp */
  iat?: number;
  
  /** EXP (expiration) timestamp */
  exp?: number;
}

/**
 * Extended Request interface with JWT user information
 * 
 * Usage in controllers:
 * ```typescript
 * @Get('example')
 * async example(@Request() req: JwtRequest) {
 *   const userId = req.user.s;
 *   const userType = req.user.u;
 *   const institutes = req.user.i;
 * }
 * ```
 */
export interface JwtRequest extends Request {
  /** Authenticated user from JWT v2 */
  user: JwtPayload;
}

/**
 * Helper type guards for role checking
 */
export class JwtRequestHelper {
  /**
   * Check if user is SUPERADMIN
   */
  static isSuperAdmin(user: JwtPayload): boolean {
    return user.userType === UserType.SUPERADMIN || user.u === 0;
  }

  /**
   * Check if user has access to specific institute
   */
  static hasInstituteAccess(user: JwtPayload, instituteId: string): boolean {
    if (this.isSuperAdmin(user)) return true;
    return user.i?.some(inst => inst.i === instituteId) ?? false;
  }

  /**
   * Check if user has specific role in institute (using bitmask)
   * @param user JWT payload
   * @param instituteId Institute ID
   * @param roleBitmask Role bitmask to check (2=IA, 4=TE, 8=ST, 16=PARENT)
   */
  static hasRole(user: JwtPayload, instituteId: string, roleBitmask: number): boolean {
    if (this.isSuperAdmin(user)) return true;
    
    const institute = user.i?.find(inst => inst.i === instituteId);
    if (!institute) return false;
    
    return (institute.r & roleBitmask) !== 0;
  }

  /**
   * Check if student has access to specific subject
   * @param user JWT payload
   * @param instituteId Institute ID
   * @param classId Class ID
   * @param subjectId Subject ID (1-based index)
   */
  static hasSubjectAccess(
    user: JwtPayload,
    instituteId: string,
    classId: string,
    subjectId: number
  ): boolean {
    if (this.isSuperAdmin(user)) return true;

    const institute = user.i?.find(inst => inst.i === instituteId);
    if (!institute) return false;

    const classAccess = institute.c?.find(([cId]) => cId === classId);
    if (!classAccess) return false;

    const [, subjectBitmask] = classAccess;
    return (subjectBitmask & (1 << (subjectId - 1))) !== 0;
  }

  /**
   * Get user ID from JWT
   */
  static getUserId(user: JwtPayload): string {
    return user.s;
  }

  /**
   * Get user type from JWT (returns the DB string value if available, otherwise maps from compact number)
   */
  static getUserType(user: JwtPayload): string {
    return user.userType || String(user.u);
  }

  /**
   * Get all institute IDs user has access to
   */
  static getInstituteIds(user: JwtPayload): string[] {
    return user.i?.map(inst => inst.i) ?? [];
  }

  /**
   * Get children IDs for parent users
   */
  static getChildrenIds(user: JwtPayload): string[] {
    return user.c ?? [];
  }
}
