import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { UserType } from '../../modules/user/enums/user-type.enum';
import { InstituteUserType } from '../../modules/institute_mudules/institue_user/enums/institute-user-type.enum';
import { getCurrentSriLankaTime } from '../utils/timezone.util';
import { UserManagementService } from './cache-user-management.service';
import { AdminAccessControlService, AccessControlContext } from './admin-access-control.service';
import { LayerManagementService } from './layer-management.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

export interface ValidationResult {
  isValid: boolean;
  message?: string;
  userId?: string;
  userData?: any;
  accessData?: any;
  accessControlResult?: any;
}

@Injectable()
export class CacheValidationService {
  private readonly logger = new Logger(CacheValidationService.name);

  constructor(
    private readonly userManagementService: UserManagementService,
    private readonly adminAccessControlService: AdminAccessControlService,
    private readonly layerManagementService: LayerManagementService,
  ) {}

  /**
   * Extract user ID from JWT payload
   */
  private extractUserIdFromJwt(user: any): string {
    // Handle both compact JWT format and regular format
    if (user?.s) {
      return user.s; // Compact JWT format
    }
    if (user?.sub || user?.id) {
      return user.sub || user.id; // Regular JWT format
    }
    throw new UnauthorizedException('Invalid JWT payload: user ID not found');
  }

  /**
   * ✅ ENHANCED: Validate IP access for privileged roles (SUPERADMIN, ORGANIZATION_MANAGER)
   * Checks environment-configured IP ranges when enhanced security is enabled
   */
  private async validatePrivilegedRoleIpAccess(
    userId: string,
    userType: UserType,
    clientIp: string,
    origin?: string,
    userAgent?: string
  ): Promise<ValidationResult> {
    try {
      // ✅ Check if enhanced IP validation is enabled via environment
      const isIpValidationEnabled = process.env.ENHANCED_IP_VALIDATION === 'true';
      const allowedIpRanges = process.env.PRIVILEGED_ADMIN_IP_RANGES;
      
      if (!isIpValidationEnabled) {
        return {
          isValid: true,
          message: 'IP validation disabled',
          userId
        };
      }

      if (!allowedIpRanges) {
        this.logger.warn(`⚠️ Enhanced IP validation enabled but no IP ranges configured`);
        return {
          isValid: false,
          message: 'Enhanced IP validation enabled but no allowed IP ranges configured',
          userId
        };
      }

      // ✅ Parse and validate IP ranges
      const ipRanges = allowedIpRanges.split(',').map(range => range.trim());
      const isIpAllowed = this.isIpInAllowedRanges(clientIp, ipRanges);

      if (!isIpAllowed) {
        this.logger.error(`🚨 SECURITY ALERT: Privileged role ${userType} access denied from IP ${clientIp} for user ${userId}`);
        this.logger.error(`🔒 Allowed IP ranges: ${ipRanges.join(', ')}`);
        this.logger.error(`🌍 Origin: ${origin || 'unknown'}, User-Agent: ${userAgent || 'unknown'}`);
        
        return {
          isValid: false,
          message: `Access denied: IP ${clientIp} not in allowed ranges for privileged role ${userType}`,
          userId
        };
      }

      return {
        isValid: true,
        message: `IP validation passed for privileged role ${userType}`,
        userId
      };

    } catch (error) {
      this.logger.error(`Failed to validate privileged role IP access:`, error);
      return {
        isValid: false,
        message: `IP validation error: ${error.message}`,
        userId
      };
    }
  }

  /**
   * ✅ Check if IP is within allowed ranges
   * Supports CIDR notation (e.g., 192.168.1.0/24) and individual IPs
   */
  private isIpInAllowedRanges(clientIp: string, allowedRanges: string[]): boolean {
    try {
      for (const range of allowedRanges) {
        if (this.isIpInRange(clientIp, range.trim())) {
          return true;
        }
      }
      return false;
    } catch (error) {
      this.logger.error(`Error checking IP ranges:`, error);
      return false;
    }
  }

  /**
   * ✅ Check if IP is in specific range (supports CIDR and individual IPs)
   */
  private isIpInRange(ip: string, range: string): boolean {
    try {
      // Handle individual IP addresses
      if (!range.includes('/')) {
        return ip === range;
      }

      // Handle CIDR notation
      const [rangeIp, prefixLength] = range.split('/');
      const prefix = parseInt(prefixLength, 10);
      
      if (isNaN(prefix) || prefix < 0 || prefix > 32) {
        this.logger.warn(`Invalid CIDR prefix: ${range}`);
        return false;
      }

      // Convert IPs to integers for comparison
      const ipInt = this.ipToInteger(ip);
      const rangeIpInt = this.ipToInteger(rangeIp);
      
      if (ipInt === null || rangeIpInt === null) {
        return false;
      }

      // Create subnet mask
      const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
      
      // Compare network addresses
      return (ipInt & mask) === (rangeIpInt & mask);
      
    } catch (error) {
      this.logger.error(`Error checking IP range ${range}:`, error);
      return false;
    }
  }

  /**
   * ✅ Convert IP address to integer
   */
  private ipToInteger(ip: string): number | null {
    try {
      const parts = ip.split('.');
      if (parts.length !== 4) {
        return null;
      }

      return parts.reduce((acc, part) => {
        const num = parseInt(part, 10);
        if (isNaN(num) || num < 0 || num > 255) {
          throw new Error(`Invalid IP part: ${part}`);
        }
        return (acc << 8) + num;
      }, 0) >>> 0; // Ensure unsigned 32-bit integer
      
    } catch (error) {
      this.logger.error(`Error converting IP to integer: ${ip}`, error);
      return null;
    }
  }

  /**
   * ✅ ENHANCED: Validate global user type with database fallback and environment controls
   */
  async validateGlobalUserType(
    user: any,
    allowedUserTypes: UserType[],
    clientIp?: string,
    origin?: string,
    userAgent?: string
  ): Promise<ValidationResult> {
    try {
      const userId = this.extractUserIdFromJwt(user);

      // ✅ LAYER-AWARE: Check if cache validation layer is active
      if (!this.layerManagementService.isLayerActive(3)) { // Cache Validation layer
        try {
          // Force direct database access when cache layer is disabled
          const userData = await this.userManagementService['fetchUserWithRelations'](userId);
          
          if (!userData) {
            this.logger.error(`❌ User ${userId} not found in database`);
            return {
              isValid: false,
              message: `User ${userId} not found in database`,
              userId
            };
          }

          const userType = userData.userType as UserType;
          const isValid = allowedUserTypes.includes(userType);


          return {
            isValid,
            message: isValid 
              ? `User has valid global access as ${userType}` 
              : `User type ${userType} not in allowed types: ${allowedUserTypes.join(', ')}`,
            userId,
            userData
          };

        } catch (dbError) {
          this.logger.error(`❌ Direct database access failed for user ${userId}:`, dbError);
          return {
            isValid: false,
            message: `Database validation failed: ${dbError.message}`,
            userId
          };
        }
      }

      // ✅ PRIMARY: Try cache first for performance
      let userData = await this.userManagementService.getUserDataWithFallback(userId);
      let dataSource = 'cache';
      
      // ✅ LAYER-AWARE FALLBACK: If cache fails or returns invalid data, query database directly
      if (!userData || !userData.userType) {
        if (!this.layerManagementService.isLayerActive(4)) { // Database Fallback layer
          this.logger.warn(`🔧 Database fallback layer disabled, returning cache failure`);
          return {
            isValid: false,
            message: `Cache validation failed and database fallback is disabled`,
            userId
          };
        }

        this.logger.warn(`⚠️ Cache validation failed for user ${userId}, querying database directly`);
        
        try {
          // Direct database query as ultimate fallback using existing method
          userData = await this.userManagementService['fetchUserWithRelations'](userId);
          dataSource = 'database';
          
          if (!userData) {
            this.logger.error(`❌ User ${userId} not found in database either`);
            return {
              isValid: false,
              message: `User ${userId} not found in cache or database`,
              userId
            };
          }
          
          // Cache the fresh data for future use
          await this.userManagementService.setUserCache(userId, false);
          
        } catch (dbError) {
          this.logger.error(`❌ Database fallback failed for user ${userId}:`, dbError);
          return {
            isValid: false,
            message: `Database validation failed: ${dbError.message}`,
            userId
          };
        }
      }

      const userType = userData.userType as UserType;
      const isValid = allowedUserTypes.includes(userType);

      if (!isValid) {
        return {
          isValid: false,
          message: `User type ${userType} not in allowed types: ${allowedUserTypes.join(', ')}`,
          userId,
          userData
        };
      }

      // ✅ ENHANCED: Layer-aware environment-based access control for admin roles
      const isAdminRole = [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER].includes(userType);
      
      if (clientIp && isAdminRole && (
          this.layerManagementService.isLayerActive(10) || // IP Origin Validation layer
          this.layerManagementService.isLayerActive(2)     // Admin Access Control layer
        )) {
        const accessContext: AccessControlContext = {
          userId,
          userType,
          clientIp,
          origin,
          userAgent,
          timestamp: getCurrentSriLankaTime()
        };

        const accessControlResult = await this.adminAccessControlService.validateAdminAccessControl(accessContext);
        
        if (!accessControlResult.isAllowed) {
          this.logger.warn(`🚨 Global user type access denied: ${accessControlResult.reason}`);
          return {
            isValid: false,
            message: `Access denied: ${accessControlResult.reason}`,
            userId,
            userData,
            accessControlResult
          };
        }


        return {
          isValid: true,
          message: `User has valid global access as ${userType} with access control validation`,
          userId,
          userData,
          accessControlResult
        };
      } else if (clientIp && isAdminRole) {
      }

      // ✅ Standard validation (without IP/origin checks for non-admin roles)

      return {
        isValid,
        message: isValid 
          ? `User has valid global access as ${userType}` 
          : `User type ${userType} not in allowed types: ${allowedUserTypes.join(', ')}`,
        userId,
        userData
      };

    } catch (error) {
      this.logger.error(`Failed to validate global user type:`, error);
      return {
        isValid: false,
        message: `Validation error: ${error.message}`,
        userId: 'unknown'
      };
    }
  }

  /**
   * ✅ ENHANCED: Validate admin access with database fallback and environment controls
   */
  async validateAdminAccess(user: any, clientIp?: string, origin?: string, userAgent?: string): Promise<ValidationResult> {
    try {
      const userId = this.extractUserIdFromJwt(user);

      // ✅ LAYER-AWARE: Check if cache validation layer is active
      if (!this.layerManagementService.isLayerActive(3)) { // Cache Validation layer
        try {
          // Force direct database access when cache layer is disabled
          const userData = await this.userManagementService['fetchUserWithRelations'](userId);
          
          if (!userData) {
            this.logger.error(`❌ User ${userId} not found in database`);
            return {
              isValid: false,
              message: `User ${userId} not found in database`,
              userId
            };
          }

          const userType = userData.userType as UserType;
          const isAdmin = [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER].includes(userType);


          return {
            isValid: isAdmin,
            message: isAdmin 
              ? `User has admin access as ${userType}` 
              : `User type ${userType} does not have admin access`,
            userId,
            userData
          };

        } catch (dbError) {
          this.logger.error(`❌ Direct database access failed for user ${userId}:`, dbError);
          return {
            isValid: false,
            message: `Database validation failed: ${dbError.message}`,
            userId
          };
        }
      }

      // ✅ PRIMARY: Try cache first for performance
      let userData = await this.userManagementService.getUserDataWithFallback(userId);
      let dataSource = 'cache';
      
      // ✅ LAYER-AWARE FALLBACK: If cache fails or returns invalid data, query database directly
      if (!userData || !userData.userType) {
        if (!this.layerManagementService.isLayerActive(4)) { // Database Fallback layer
          this.logger.warn(`🔧 Database fallback layer disabled, returning cache failure`);
          return {
            isValid: false,
            message: `Cache validation failed and database fallback is disabled`,
            userId
          };
        }

        this.logger.warn(`⚠️ Cache validation failed for user ${userId}, querying database directly`);
        
        try {
          // Direct database query as ultimate fallback using existing method
          userData = await this.userManagementService['fetchUserWithRelations'](userId);
          dataSource = 'database';
          
          if (!userData) {
            this.logger.error(`❌ User ${userId} not found in database either`);
            return {
              isValid: false,
              message: `User ${userId} not found in cache or database`,
              userId
            };
          }
          
          // Cache the fresh data for future use
          await this.userManagementService.setUserCache(userId, false);
          
        } catch (dbError) {
          this.logger.error(`❌ Database fallback failed for user ${userId}:`, dbError);
          return {
            isValid: false,
            message: `Database validation failed: ${dbError.message}`,
            userId
          };
        }
      }

      const userType = userData.userType as UserType;
      const isAdmin = [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER].includes(userType);

      if (!isAdmin) {
        return {
          isValid: false,
          message: `User type ${userType} does not have admin access`,
          userId,
          userData
        };
      }

      // ✅ ENHANCED: Layer-aware environment-based access control for admin roles
      if (clientIp && isAdmin && (
          this.layerManagementService.isLayerActive(10) || // IP Origin Validation layer
          this.layerManagementService.isLayerActive(2)     // Admin Access Control layer
        )) {
        const accessContext: AccessControlContext = {
          userId,
          userType,
          clientIp,
          origin,
          userAgent,
          timestamp: getCurrentSriLankaTime()
        };

        const accessControlResult = await this.adminAccessControlService.validateAdminAccessControl(accessContext);
        
        if (!accessControlResult.isAllowed) {
          this.logger.warn(`🚨 Admin access denied: ${accessControlResult.reason}`);
          return {
            isValid: false,
            message: `Admin access denied: ${accessControlResult.reason}`,
            userId,
            userData,
            accessControlResult
          };
        }


        return {
          isValid: true,
          message: `Admin access granted for ${userType} with access control validation`,
          userId,
          userData,
          accessControlResult
        };
      } else if (clientIp && isAdmin) {
      }

      // ✅ Standard admin validation (without IP/origin checks)

      return {
        isValid: isAdmin,
        message: isAdmin 
          ? `User has admin access as ${userType}` 
          : `User type ${userType} does not have admin access`,
        userId,
        userData
      };

    } catch (error) {
      this.logger.error(`Failed to validate admin access:`, error);
      return {
        isValid: false,
        message: `Validation error: ${error.message}`,
        userId: 'unknown'
      };
    }
  }

  /**
   * ✅ ENHANCED: Validate institute user type with robust cache/database fallback
   * This method ensures validation continues even if caching completely fails
   */
  async validateInstituteUserTypeWithFallback(
    user: any,
    instituteId: string,
    allowedUserTypes: InstituteUserType[]
  ): Promise<ValidationResult> {
    try {
      const userId = this.extractUserIdFromJwt(user);

      // ⚠️ ACCESS CACHE REMOVED: This method now returns invalid
      // TODO: Implement direct database validation if needed
      this.logger.warn(`⚠️ Access cache removed - validateInstituteUserTypeWithFallback returning invalid for user ${userId}`);
      
      return {
        isValid: false,
        message: `Access validation unavailable - access cache system removed`,
        userId
      };

    } catch (error) {
      this.logger.error(`Failed to validate institute user type with fallback:`, error);
      return {
        isValid: false,
        message: `Validation error: ${error.message}`,
        userId: 'unknown'
      };
    }
  }

  /**
   * ✅ ENHANCED: Validate institute user type access with database fallback
   */
  async validateInstituteUserType(
    user: any,
    instituteId: string,
    allowedUserTypes: InstituteUserType[]
  ): Promise<ValidationResult> {
    try {
      const userId = this.extractUserIdFromJwt(user);

      // ⚠️ ACCESS CACHE REMOVED: This method now returns invalid
      // TODO: Implement direct database validation if needed
      this.logger.warn(`⚠️ Access cache removed - validateInstituteUserType returning invalid for user ${userId}`);
      
      return {
        isValid: false,
        message: `Access validation unavailable - access cache system removed`,
        userId
      };

    } catch (error) {
      this.logger.error(`Failed to validate institute user type:`, error);
      return {
        isValid: false,
        message: `Validation error: ${error.message}`,
        userId: 'unknown'
      };
    }
  }

  /**
   * Validate institute user class access from cache
   */
  async validateInstituteUserClassAccess(
    user: any,
    instituteId: string,
    classId: string,
    allowedUserTypes: InstituteUserType[]
  ): Promise<ValidationResult> {
    try {
      const userId = this.extractUserIdFromJwt(user);

      // First validate institute access
      const instituteValidation = await this.validateInstituteUserType(user, instituteId, allowedUserTypes);
      if (!instituteValidation.isValid) {
        return instituteValidation;
      }

      const accessData = instituteValidation.accessData;
      const instituteAccess = accessData.hierarchicalAccess[instituteId];

      // Check class access
      const classAccess = instituteAccess.classes[classId];
      if (!classAccess) {
        return {
          isValid: false,
          message: `User ${userId} has no access to class ${classId} in institute ${instituteId}`,
          userId,
          accessData
        };
      }


      return {
        isValid: true,
        message: `User has valid class access as ${instituteAccess.userType}`,
        userId,
        accessData
      };

    } catch (error) {
      this.logger.error(`Failed to validate class access:`, error);
      return {
        isValid: false,
        message: `Validation error: ${error.message}`,
        userId: 'unknown'
      };
    }
  }

  /**
   * Validate institute user class subject access from cache
   */
  async validateInstituteUserClassSubjectAccess(
    user: any,
    instituteId: string,
    classId: string,
    subjectId: string,
    allowedUserTypes: InstituteUserType[]
  ): Promise<ValidationResult> {
    try {
      const userId = this.extractUserIdFromJwt(user);

      // First validate class access
      const classValidation = await this.validateInstituteUserClassAccess(user, instituteId, classId, allowedUserTypes);
      if (!classValidation.isValid) {
        return classValidation;
      }

      const accessData = classValidation.accessData;
      const instituteAccess = accessData.hierarchicalAccess[instituteId];
      const classAccess = instituteAccess.classes[classId];

      // Check subject access
      const hasSubjectAccess = classAccess.subjects.includes(subjectId);
      if (!hasSubjectAccess) {
        return {
          isValid: false,
          message: `User ${userId} has no access to subject ${subjectId} in class ${classId} of institute ${instituteId}`,
          userId,
          accessData
        };
      }


      return {
        isValid: true,
        message: `User has valid subject access as ${instituteAccess.userType}`,
        userId,
        accessData
      };

    } catch (error) {
      this.logger.error(`Failed to validate subject access:`, error);
      return {
        isValid: false,
        message: `Validation error: ${error.message}`,
        userId: 'unknown'
      };
    }
  }

  /**
   * Utility method to check if user is admin in any institute
   * ⚠️ ACCESS CACHE REMOVED: This method now returns false
   */
  async isUserInstituteAdmin(user: any, instituteId?: string): Promise<boolean> {
    // Access cache removed - return false
    return false;
  }

  /**
   * Utility method to get user's accessible institutes
   * ⚠️ ACCESS CACHE REMOVED: This method now returns empty array
   */
  async getUserAccessibleInstitutes(user: any): Promise<string[]> {
    // Access cache removed - return empty array
    return [];
  }

  /**
   * Utility method to get user's accessible classes in an institute
   * ⚠️ ACCESS CACHE REMOVED: This method now returns empty array
   */
  async getUserAccessibleClasses(user: any, instituteId: string): Promise<string[]> {
    // Access cache removed - return empty array
    return [];
  }

  /**
   * Utility method to get user's accessible subjects in a class
   * ⚠️ ACCESS CACHE REMOVED: This method now returns empty array
   */
  async getUserAccessibleSubjects(user: any, instituteId: string, classId: string): Promise<string[]> {
    // Access cache removed - return empty array
    return [];
  }

  /**
   * ✅ ENHANCED HYBRID VALIDATION WITH RELIABLE DATABASE FALLBACK
   * This method validates that user has either:
   * 1. SUPERADMIN global access (for full system access) + IP range validation if enabled
   * 2. ORGANIZATION_MANAGER global access + IP range validation if enabled
   * 3. INSTITUTE_ADMIN access to specific institute (for institute-scoped access)
   * 4. PARENT access through specific student (requires studentId for validation)
   * 
   * 🔧 CACHING FALLBACK STRATEGY:
   * - Always attempts cache first for performance
   * - Falls back to direct database queries if cache fails
   * - Continues validation even if caching is completely broken
   */
  async validateHybridAccess(
    user: any,
    instituteId?: string,
    allowedGlobalUserTypes?: UserType[],
    allowedInstituteUserTypes?: InstituteUserType[],
    classId?: string,
    subjectId?: string, 
    studentId?: string,
    clientIp?: string,
    origin?: string,
    userAgent?: string
  ): Promise<ValidationResult> {
    try {
      const userId = this.extractUserIdFromJwt(user);

      // ✅ Set default values for allowed types if not provided
      const effectiveAllowedGlobalTypes = allowedGlobalUserTypes || [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER];
      const effectiveAllowedInstituteTypes = allowedInstituteUserTypes || [InstituteUserType.INSTITUTE_ADMIN];
      

      // ✅ STEP 1: Get user data with robust fallback handling
      let userData;
      let dataSource = 'unknown';

      try {
        // Primary: Attempt cache-based retrieval
        userData = await this.userManagementService.getUserDataWithFallback(userId);
        if (userData && userData.userType) {
          dataSource = 'cache';
        } else {
          this.logger.warn(`⚠️ Cache returned empty/invalid data for user ${userId}`);
        }
      } catch (cacheError) {
        this.logger.warn(`⚠️ Cache access failed for user ${userId}:`, cacheError.message);
      }

      // Fallback: Direct database query if cache failed or returned invalid data
      if (!userData || !userData.userType) {
        
        try {
          userData = await this.userManagementService['fetchUserWithRelations'](userId);
          if (userData && userData.userType) {
            dataSource = 'database';
            
            // Try to refresh cache with fresh data (non-blocking)
            try {
              await this.userManagementService.setUserCache(userId, false);
            } catch (cacheRefreshError) {
              this.logger.warn(`⚠️ Cache refresh failed for user ${userId}:`, cacheRefreshError.message);
              // Continue without caching - validation can proceed
            }
          }
        } catch (dbError) {
          this.logger.error(`❌ Database fallback failed for user ${userId}:`, dbError.message);
          return {
            isValid: false,
            message: `User ${userId} not found in cache or database: ${dbError.message}`,
            userId
          };
        }
      }

      // Final check: Ensure we have valid user data
      if (!userData || !userData.userType) {
        this.logger.error(`❌ User ${userId} not found in system after all attempts`);
        return {
          isValid: false,
          message: `User ${userId} not found in system`,
          userId
        };
      }

      const userType = userData.userType as UserType;

      // (Configuration already set above)

      // ✅ STEP 2: Enhanced IP range validation for privileged roles
      const privilegedRoles = [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER];
      const isPrivilegedRole = privilegedRoles.includes(userType);

      if (isPrivilegedRole && clientIp) {
        const ipValidationResult = await this.validatePrivilegedRoleIpAccess(
          userId,
          userType,
          clientIp,
          origin,
          userAgent
        );

        if (!ipValidationResult.isValid) {
          this.logger.warn(`🚨 IP validation failed for privileged role ${userType}: ${ipValidationResult.message}`);
          return ipValidationResult;
        }

      }

      // ✅ PATH 1: Check allowed global user types
      if (effectiveAllowedGlobalTypes.includes(userType)) {
        return {
          isValid: true,
          message: `Access granted via ${userType} global permissions with enhanced IP validation`,
          userId,
          userData,
          accessData: { 
            accessPath: userType,
            ipValidated: isPrivilegedRole && clientIp ? true : false
          }
        };
      }

      // ✅ PATH 3: Check institute user type access to specific institute with cache fallback
      if (instituteId) {
        
        const instituteValidation = await this.validateInstituteUserTypeWithFallback(
          user,
          instituteId,
          effectiveAllowedInstituteTypes
        );

        if (instituteValidation.isValid) {
          // Get the actual user type from the validation result
          const actualInstituteUserType = instituteValidation.accessData?.hierarchicalAccess?.[instituteId]?.userType || 'UNKNOWN';
          return {
            isValid: true,
            message: `Access granted via ${actualInstituteUserType} permissions for institute ${instituteId}`,
            userId,
            userData: instituteValidation.userData || userData,
            accessData: { 
              accessPath: actualInstituteUserType,
              instituteId,
              ipValidated: false, // Institute users don't require IP validation
              dataSource: instituteValidation.accessData?.dataSource || 'database',
              ...instituteValidation.accessData 
            }
          };
        } else {
          this.logger.warn(`❌ User ${userId} lacks institute access to institute ${instituteId}: ${instituteValidation.message}`);
        }
      }

      // ✅ PATH 4: Check PARENT access through specific student (requires studentId)
      if (userType === UserType.USER_WITHOUT_STUDENT && studentId && instituteId) {
        
        const parentValidation = await this.validateParentAccessThroughStudent(
          userId,
          studentId,
          instituteId,
          classId,
          subjectId
        );

        if (parentValidation.isValid) {
          return {
            isValid: true,
            message: `Access granted via PARENT permissions through student ${studentId}`,
            userId,
            userData: parentValidation.userData || userData,
            accessData: { 
              accessPath: 'PARENT',
              instituteId,
              classId,
              subjectId,
              studentId,
              ipValidated: false, // Parents don't require IP validation
              dataSource: parentValidation.accessData?.dataSource || 'database',
              ...parentValidation.accessData 
            }
          };
        } else {
          this.logger.warn(`❌ User ${userId} lacks PARENT access through student ${studentId}: ${parentValidation.message}`);
        }
      } else if (userType === UserType.USER_WITHOUT_STUDENT && !studentId) {
        this.logger.warn(`❌ PARENT user ${userId} requires studentId for access validation`);
        return {
          isValid: false,
          message: `PARENT access validation requires studentId parameter`,
          userId,
          userData
        };
      }

      // ✅ FALLBACK: No valid access path found
      const failureMessage = instituteId 
        ? `User ${userId} with type ${userType} lacks SUPERADMIN, ORGANIZATION_MANAGER global access, INSTITUTE_ADMIN access to institute ${instituteId}, and PARENT access through specified student`
        : `User ${userId} with type ${userType} lacks SUPERADMIN or ORGANIZATION_MANAGER global access (no institute specified for INSTITUTE_ADMIN/PARENT check)`;

      this.logger.warn(`❌ Enhanced hybrid validation failed: ${failureMessage}`);

      return {
        isValid: false,
        message: failureMessage,
        userId,
        userData
      };

    } catch (error) {
      this.logger.error(`Failed to validate hybrid access:`, error);
      return {
        isValid: false,
        message: `Hybrid validation error: ${error.message}`,
        userId: 'unknown'
      };
    }
  }

  /**
   * ✅ ENHANCED: Validate PARENT access through specific student with CACHE-FIRST approach
   * Ensures parent has access to institute/class/subject through their child's enrollment
   * Uses cached parent access data with database fallback when cache fails
   */
  private async validateParentAccessThroughStudent(
    parentUserId: string,
    studentId: string,
    instituteId: string,
    classId?: string,
    subjectId?: string
  ): Promise<ValidationResult> {
    // ⚠️ ACCESS CACHE REMOVED: This method now returns invalid
    // Parent access validation requires access caching which was removed for simplified caching strategy
    this.logger.warn(`⚠️ Access cache removed - validateParentAccessThroughStudent returning invalid for parent ${parentUserId}`);
    
    return {
      isValid: false,
      message: 'Parent access validation unavailable - access cache system removed',
      userId: parentUserId
    };
  }

  /**
   * ✅ DIAGNOSTIC: Verify if user has any access in the system
   * Useful for troubleshooting access issues when caching fails
   */
  async verifyUserAccess(user: any): Promise<{
    userExists: boolean;
    userType?: UserType;
    hasInstituteAccess: boolean;
    accessibleInstitutes: string[];
    dataSource: string;
    cacheWorking: boolean;
    error?: string;
  }> {
    try {
      const userId = this.extractUserIdFromJwt(user);

      let cacheWorking = true;
      let userData;
      const dataSource = 'cache';

      try {
        userData = await this.userManagementService.getUserDataWithFallback(userId);
        
        if (!userData || !userData.userType) {
          cacheWorking = false;
          this.logger.warn(`Cache returned incomplete data for user ${userId}`);
        }
      } catch (cacheError) {
        cacheWorking = false;
        this.logger.warn(`Cache completely failed for user ${userId}:`, cacheError.message);
      }

      // Fallback to database if cache failed
      if (!userData || !userData.userType) {
        try {
          userData = await this.userManagementService['fetchUserWithRelations'](userId);
        } catch (dbError) {
          this.logger.error(`Database fallback failed for user ${userId}:`, dbError.message);
          return {
            userExists: false,
            hasInstituteAccess: false,
            accessibleInstitutes: [],
            dataSource: 'none',
            cacheWorking,
            error: `Database access failed: ${dbError.message}`
          };
        }
      }

      const userExists = !!(userData && userData.userType);
      const userType = userData?.userType as UserType;
      // Access cache removed - return empty arrays
      const accessibleInstitutes: string[] = [];
      const hasInstituteAccess = false;

      return {
        userExists,
        userType,
        hasInstituteAccess,
        accessibleInstitutes,
        dataSource,
        cacheWorking
      };

    } catch (error) {
      this.logger.error(`Failed to verify user access:`, error);
      return {
        userExists: false,
        hasInstituteAccess: false,
        accessibleInstitutes: [],
        dataSource: 'error',
        cacheWorking: false,
        error: error.message
      };
    }
  }

  /**
   * ✅ DIAGNOSTIC: Test caching system health
   */
  async testCacheHealth(): Promise<{
    cacheConnected: boolean;
    userCacheWorking: boolean;
    accessCacheWorking: boolean;
    error?: string;
  }> {
    try {

      let cacheConnected = true;
      let userCacheWorking = true;
      const accessCacheWorking = false; // Access cache removed

      try {
        await this.userManagementService.getUserDataWithFallback('test-cache-health');
      } catch (userCacheError) {
        userCacheWorking = false;
        this.logger.warn(`User cache not working:`, userCacheError.message);
      }

      if (!userCacheWorking) {
        cacheConnected = false;
      }

      const result = {
        cacheConnected,
        userCacheWorking,
        accessCacheWorking
      };

      return result;

    } catch (error) {
      this.logger.error(`Failed to test cache health:`, error);
      return {
        cacheConnected: false,
        userCacheWorking: false,
        accessCacheWorking: false,
        error: error.message
      };
    }
  }
}
