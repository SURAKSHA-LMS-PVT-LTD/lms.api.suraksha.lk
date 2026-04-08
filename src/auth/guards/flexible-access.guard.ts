/**
 * 🔐 FLEXIBLE ACCESS GUARD - MULTIPLE ROLE SUPPORT WITH OR LOGIC
 * 
 * This guard allows endpoints to be accessible by multiple different roles.
 * If ANY of the specified role checks pass, access is granted.
 * 
 * Use Cases:
 * - Endpoint needs SUPERADMIN OR Institute Admin OR Parent access
 * - Endpoint needs Teacher OR Student access
 * - Any combination of role-based access
 * 
 * Example Usage:
 * ```typescript
 * @Post('transfer-presidency')
 * @UseGuards(FlexibleAccessGuard)
 * @RequireAnyOfRoles({
 *   global: [UserType.SUPERADMIN],
 *   instituteAdmin: true,
 *   parent: { requireStudent: true }
 * })
 * async transferPresidency() { ... }
 * ```
 */

import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EnhancedJwtPayload, EnhancedInstituteAccessEntry, ROLE_BITMASKS, COMPACT_TO_USER_TYPE } from '../interfaces/enhanced-jwt-payload.interface';
import { UserType } from '../../modules/user/enums/user-type.enum';

/**
 * Configuration for flexible access control
 */
export interface FlexibleAccessConfig {
  // Global access types (SUPERADMIN, ORGANIZATION_MANAGER)
  global?: UserType[];
  
  // Institute Admin access
  instituteAdmin?: boolean;
  
  // Teacher access with optional class/subject requirements
  teacher?: {
    requireClass?: boolean;
    requireSubject?: boolean;
  } | boolean;
  
  // Student access with optional class/subject requirements
  student?: {
    requireClass?: boolean;
    requireSubject?: boolean;
    allowSelfOnly?: boolean; // Only allow access when filtering by own studentId
  } | boolean;
  
  // Parent access with optional student requirement
  parent?: {
    requireStudent?: boolean;
  } | boolean;
  
  // Attendance Marker access with optional class requirements
  attendanceMarker?: {
    requireClass?: boolean;
  } | boolean;
  
  // Any institute role access
  anyInstituteRole?: boolean;
  
  // Allow access to own resource (checks if params.id or params.userId matches current user)
  allowSelf?: boolean;
}

export const FLEXIBLE_ACCESS_KEY = 'flexible_access_config';

@Injectable()
export class FlexibleAccessGuard implements CanActivate {
  private readonly logger = new Logger(FlexibleAccessGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const config = this.reflector.getAllAndOverride<FlexibleAccessConfig>(
      FLEXIBLE_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!config) {
      throw new ForbiddenException(
        'FlexibleAccessGuard requires @RequireAnyOfRoles() decorator',
      );
    }

    const request = context.switchToHttp().getRequest();
    const user: EnhancedJwtPayload = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // ============================================
    // SPECIAL CASE: API Key Authentication
    // ============================================
    // API key users are allowed through ONLY when the endpoint explicitly
    // uses ApiKeyOrJwtGuard (which sets isApiKeyAuth=true).
    // This ensures API keys work on intentionally-exposed endpoints
    // but cannot bypass guards on JWT-only endpoints.
    if ((user.isApiKeyAuth || user.authType === 'API_KEY') && user.u === -1) {
      return true;
    }

    const accessChecks: Array<{ check: boolean; reason: string }> = [];

    // ============================================
    // CHECK 1: Global Access (SUPERADMIN, ORG_MANAGER)
    // ============================================
    if (config.global && config.global.length > 0) {
      // Convert JWT's numeric user type to UserType enum value string
      // JWT stores: u: 0 (number for SUPERADMIN)
      // COMPACT_TO_USER_TYPE[0] → 'SUPER_ADMIN' (which equals UserType.SUPERADMIN)
      const userTypeValue = COMPACT_TO_USER_TYPE[user.u] as string;
      
      const hasGlobalAccess = config.global.includes(userTypeValue as UserType);
      accessChecks.push({
        check: hasGlobalAccess,
        reason: `Global access (${config.global.join(', ')})`,
      });
      
      if (hasGlobalAccess) {
        return true; // ✅ Global access always wins
      }
    }

    // ============================================
    // CHECK 2: Self Access (Access to own resource)
    // ============================================
    if (config.allowSelf) {
      const params = request.params || {};
      const userId = String(user.s); // Current user ID from JWT
      
      // Check if accessing own resource by id, userId, or studentId parameter
      // Use String() to ensure type-safe comparison (params are always strings)
      const isSelf = 
        (params.id && String(params.id) === userId) || 
        (params.userId && String(params.userId) === userId) || 
        (params.studentId && String(params.studentId) === userId);
      
      accessChecks.push({
        check: isSelf || false,
        reason: 'Self access (own resource)',
      });
      
      if (isSelf) {
        return true; // ✅ User can access their own resource
      }
    }

    // For institute-based checks, ensure user has institute access
    // Use user.i (from JWT spread) OR user.enhancedInstituteAccess (from JWT strategy extraction)
    const rawAccess = user.i ?? (request.user as any).enhancedInstituteAccess;
    const instituteAccess: EnhancedInstituteAccessEntry[] = Array.isArray(rawAccess) ? rawAccess : [];
    
    // ✅ FIX: Only throw error if ONLY institute checks are configured (no global fallback)
    // This allows endpoints with both global + institute roles to work for users without institutes
    if (instituteAccess.length === 0) {
      const hasInstituteBasedChecks = 
        config.instituteAdmin || 
        config.teacher || 
        config.student || 
        config.anyInstituteRole;
      
      // Only throw if endpoint requires ONLY institute roles (no global or parent access configured)
      // Parent access doesn't require institute membership - parents use JWT 'c' (children) array
      const hasOnlyInstituteChecks = hasInstituteBasedChecks && !config.global && !config.parent;
      
      if (hasOnlyInstituteChecks) {
        throw new ForbiddenException(
          `User has no institute access but endpoint requires institute roles. Please re-login to refresh your token. Token info: userId=${user.s}, userType=${user.u}, hasInstituteAccess=${user.i ? 'yes' : 'no'}`,
        );
      }
    }

    // Extract parameters from request for institute validation
    const params = request.params || {};
    const body = request.body || {};
    const url = request.url || '';
    
    // 🔍 For resource-specific endpoints (GET/PATCH/DELETE with :id but no :instituteId), check if user has the role in ANY institute
    // The service layer will validate access to the specific institute after fetching the resource
    const isResourceEndpoint = params.id && !params.instituteId && !body.instituteId && 
      ['GET', 'PATCH', 'DELETE'].includes(request.method);
    const instituteId = isResourceEndpoint ? null : (params.instituteId || body.instituteId);

    // ============================================
    // CHECK 2: Institute Admin Access
    // ============================================
    if (config.instituteAdmin) {
      // For resource endpoints, check if user has Institute Admin role in ANY institute
      // For other endpoints, check if user has role in the SPECIFIC institute
      // Use bitwise AND to handle combined role bitmasks (e.g. IA+TE = 12)
      const hasInstituteAdmin = isResourceEndpoint
        ? instituteAccess.some((entry) => (entry.r & ROLE_BITMASKS.IA) !== 0)
        : instituteAccess.some(
            (entry) =>
              (entry.r & ROLE_BITMASKS.IA) !== 0 &&
              (!instituteId || String(entry.i) === String(instituteId)),
          );
      
      accessChecks.push({
        check: hasInstituteAdmin || false,
        reason: 'Institute Admin access',
      });
      
      if (hasInstituteAdmin) {
        return true; // ✅ Institute Admin access granted
      }
    }

    // ============================================
    // CHECK 3: Teacher Access
    // ============================================
    if (config.teacher) {
      const teacherConfig = typeof config.teacher === 'boolean' 
        ? {} 
        : config.teacher;
      
      const teacherEntries = instituteAccess.filter((entry) => (entry.r & ROLE_BITMASKS.TE) !== 0);
      
      if (teacherEntries.length > 0) {
        let hasTeacherAccess = true;
        
        // For resource endpoints, just check if user has Teacher role in ANY institute
        // For other endpoints, validate the specific institute
        if (!isResourceEndpoint && instituteId) {
          hasTeacherAccess = teacherEntries.some((entry) => String(entry.i) === String(instituteId));
        }
        
        // Validate class if required
        if (hasTeacherAccess && teacherConfig.requireClass) {
          const classId = params.classId || body.classId;
          if (classId) {
            hasTeacherAccess = teacherEntries.some(
              (entry) => entry.c?.some(([cId]) => cId === classId),
            );
          }
        }
        
        // Validate subject if required
        if (hasTeacherAccess && teacherConfig.requireSubject) {
          const subjectId = params.subjectId || body.subjectId;
          if (subjectId) {
            hasTeacherAccess = teacherEntries.some(
              (entry) =>
                entry.c?.some(([cId, subjectBitmask]) => {
                  const subjectNum = parseInt(subjectId, 10);
                  if (isNaN(subjectNum) || subjectNum < 1 || subjectNum > 30) {
                    return false; // Reject invalid/non-numeric subject IDs
                  }
                  return (subjectBitmask & (1 << (subjectNum - 1))) !== 0;
                }),
            );
          }
        }
        
        accessChecks.push({
          check: hasTeacherAccess,
          reason: 'Teacher access',
        });
        
        if (hasTeacherAccess) {
          return true; // ✅ Teacher access granted
        }
      } else {
        accessChecks.push({
          check: false,
          reason: 'Teacher access (no teacher role found)',
        });
      }
    }

    // ============================================
    // CHECK 4: Student Access
    // ============================================
    if (config.student) {
      const studentConfig = typeof config.student === 'boolean' 
        ? {} 
        : config.student;
      
      const studentEntries = instituteAccess.filter((entry) => (entry.r & ROLE_BITMASKS.ST) !== 0);
      
      if (studentEntries.length > 0) {
        let hasStudentAccess = true;
        
        // For resource endpoints, just check if user has Student role in ANY institute
        // For other endpoints, validate the specific institute
        if (!isResourceEndpoint && instituteId) {
          hasStudentAccess = studentEntries.some((entry) => String(entry.i) === String(instituteId));
        }
        
        // ✅ SPECIAL: If student config allows self-only access (for attendance endpoints)
        // Check if studentId in params/body matches current user
        if (hasStudentAccess && (studentConfig as any).allowSelfOnly) {
          const studentId = params.studentId || body.studentId;
          const currentUserId = String(user.s);
          
          // Student can only access if filtering by their own ID
          hasStudentAccess = !!studentId && String(studentId) === currentUserId;
        }
        
        // Validate class if required
        if (hasStudentAccess && studentConfig.requireClass) {
          const classId = params.classId || body.classId;
          if (classId) {
            hasStudentAccess = studentEntries.some(
              (entry) => entry.c?.some(([cId]) => cId === classId),
            );
          }
        }
        
        accessChecks.push({
          check: hasStudentAccess,
          reason: (studentConfig as any).allowSelfOnly 
            ? 'Student access (own data only)' 
            : 'Student access',
        });
        
        if (hasStudentAccess) {
          return true; // ✅ Student access granted
        }
      } else {
        accessChecks.push({
          check: false,
          reason: 'Student access (no student role found)',
        });
      }
    }

    // ============================================
    // CHECK 5: Parent Access
    // ============================================
    if (config.parent) {
      const parentConfig = typeof config.parent === 'boolean' 
        ? {} 
        : config.parent;
      
      // 🎯 ENHANCED: Parent access validation with JWT 'c' (children) array check
      // Parents can access their children's data if the target userId/studentId is in JWT 'c' array
      const childrenIds = user.c ? user.c.map(childId => String(childId)) : [];
      
      let hasParentAccess = false;
      
      // Extract target userId/studentId from route params and body only (NOT query params)
      // Query params excluded to prevent HTTP parameter pollution attacks
      const targetUserId = params.id || params.userId || params.studentUserId || params.studentId || 
                          body.userId || body.studentId;
      
      // ✅ Parent can access if:
      // 1. They have children in JWT (c array exists and has entries)
      // 2. The target userId/studentId matches one of their children
      if (childrenIds.length > 0 && targetUserId) {
        const targetUserIdStr = String(targetUserId);
        hasParentAccess = childrenIds.includes(targetUserIdStr);
      }
      
      // 🔧 Backward compatibility: If no specific child ID in request, check requireStudent config
      if (!hasParentAccess && !targetUserId) {
        // Check if user has parent-capable user type (has children in JWT)
        const hasChildren = childrenIds.length > 0;
        
        if (parentConfig.requireStudent) {
          // Parent must provide studentId/userId in request
          hasParentAccess = false; // Reject if no target ID provided
        } else {
          // No student requirement, just having children is enough
          hasParentAccess = hasChildren;
        }
      }
      
      accessChecks.push({
        check: hasParentAccess,
        reason: targetUserId 
          ? `Parent access (child ID: ${targetUserId})` 
          : parentConfig.requireStudent 
            ? 'Parent access (with studentId filter)' 
            : 'Parent access',
      });
      
      if (hasParentAccess) {
        return true; // ✅ Parent access granted
      }
    }

    // ============================================
    // CHECK 6: Attendance Marker Access
    // ============================================
    if (config.attendanceMarker) {
      const attendanceMarkerConfig = typeof config.attendanceMarker === 'boolean' 
        ? {} 
        : config.attendanceMarker;
      
      const attendanceMarkerEntries = instituteAccess.filter((entry) => (entry.r & ROLE_BITMASKS.AM) !== 0);
      
      if (attendanceMarkerEntries.length > 0) {
        let hasAttendanceMarkerAccess = true;
        
        // For resource endpoints, just check if user has Attendance Marker role in ANY institute
        // For other endpoints, validate the specific institute
        if (!isResourceEndpoint && instituteId) {
          hasAttendanceMarkerAccess = attendanceMarkerEntries.some((entry) => String(entry.i) === String(instituteId));
        }
        
        // Validate class if required
        if (hasAttendanceMarkerAccess && attendanceMarkerConfig.requireClass) {
          const classId = params.classId || body.classId;
          if (classId) {
            hasAttendanceMarkerAccess = attendanceMarkerEntries.some(
              (entry) => entry.c?.some(([cId]) => cId === classId),
            );
          }
        }
        
        accessChecks.push({
          check: hasAttendanceMarkerAccess,
          reason: 'Attendance Marker access',
        });
        
        if (hasAttendanceMarkerAccess) {
          return true; // ✅ Attendance Marker access granted
        }
      } else {
        accessChecks.push({
          check: false,
          reason: 'Attendance Marker access (no attendance marker role found)',
        });
      }
    }

    // ============================================
    // CHECK 7: Any Institute Role
    // ============================================
    if (config.anyInstituteRole) {
      const hasAnyRole = instituteAccess.length > 0;
      const matchesInstitute = !instituteId || instituteAccess.some((entry) => String(entry.i) === String(instituteId));
      
      const hasAccess = hasAnyRole && matchesInstitute;
      
      accessChecks.push({
        check: hasAccess || false,
        reason: 'Any institute role',
      });
      
      if (hasAccess) {
        return true; // ✅ Any institute role access granted
      }
    }

    // ============================================
    // ALL CHECKS FAILED
    // ============================================
    const failedReasons = accessChecks
      .filter((check) => !check.check)
      .map((check) => check.reason)
      .join(', ');

    // Log diagnostic info for debugging access issues
    this.logger.warn(
      `Access denied for user ${user.s} on ${request.method} ${request.url}. ` +
      `Required: ${failedReasons}. ` +
      `JWT userType: ${user.u}, instituteAccess entries: ${instituteAccess.length}, ` +
      `roles: [${instituteAccess.map(e => `{i:${e.i},r:${e.r}}`).join(',')}], ` +
      `targetInstituteId: ${instituteId || 'none'}`,
    );

    throw new ForbiddenException(
      `Access denied. Required one of: ${failedReasons || 'No valid access configuration'}`,
    );
  }
}
