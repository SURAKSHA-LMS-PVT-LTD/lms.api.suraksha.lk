import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { UserType } from '../../modules/user/enums/user-type.enum';
import { InstituteUserType } from '../../modules/institute_mudules/institue_user/enums/institute-user-type.enum';
import { CacheValidationGuard } from '../guards/cache-validation.guard';

// Essential metadata keys - keeping only what's needed
export const VALIDATE_GLOBAL_USER_TYPE_KEY = 'validate_global_user_type';
export const VALIDATE_HYBRID_ACCESS_KEY = 'validate_hybrid_access';

// Essential interfaces
export interface GlobalUserTypeValidation {
  allowedUserTypes: UserType[];
}

export interface HybridAccessValidation {
  instituteIdParam?: string;
  allowedGlobalUserTypes: UserType[];
  allowedInstituteUserTypes: InstituteUserType[];
  globalAccessOverridesInstitute?: boolean;
}

/**
 * ✅ ESSENTIAL: Validates global user type from cache
 * @param allowedUserTypes - Array of allowed global user types
 * 
 * @example
 * @ValidateGlobalUserType(UserType.SUPERADMIN)
 * async systemAdminMethod() { ... }
 */
export function ValidateGlobalUserType(...allowedUserTypes: UserType[]) {
  return applyDecorators(
    SetMetadata(VALIDATE_GLOBAL_USER_TYPE_KEY, { allowedUserTypes }),
    UseGuards(CacheValidationGuard)
  );
}

/**
 * ✅ ENHANCED MAIN DECORATOR: HYBRID ACCESS VALIDATION WITH IP SECURITY
 * Allows both global users (SUPERADMIN/ORGANIZATION_MANAGER) and institute users (INSTITUTE_ADMIN) access
 * 🔒 ENHANCED: Includes IP range validation for privileged roles when enabled via environment
 * 
 * VALIDATION PATHS:
 * 1. SUPERADMIN - Full global access + IP validation if enabled
 * 2. ORGANIZATION_MANAGER - Full global access + IP validation if enabled  
 * 3. INSTITUTE_ADMIN - Institute-scoped access (no IP validation required)
 * 
 * IP VALIDATION (when ENHANCED_IP_VALIDATION=true):
 * - SUPERADMIN and ORGANIZATION_MANAGER must access from allowed IP ranges
 * - IP ranges configured via PRIVILEGED_ADMIN_IP_RANGES environment variable
 * - Supports CIDR notation (192.168.1.0/24) and individual IPs
 * - Security alerts logged for blocked attempts
 * 
 * @param instituteIdParam - Parameter name containing institute ID (optional for global users)
 * @param allowedGlobalUserTypes - Array of allowed global user types
 * @param allowedInstituteUserTypes - Array of allowed institute user types
 * @param globalAccessOverridesInstitute - Whether global access bypasses institute validation
 * 
 * @example
 * // Enable enhanced validation in .env:
 * // ENHANCED_IP_VALIDATION=true
 * // PRIVILEGED_ADMIN_IP_RANGES=192.168.1.0/24,10.0.0.0/8
 * 
 * @ValidateHybridAccess('instituteId', [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER], [InstituteUserType.INSTITUTE_ADMIN], true)
 * async secureMethod(@Param('instituteId') instituteId: string) { ... }
 */
export function ValidateHybridAccess(
  instituteIdParam: string = 'instituteId',
  allowedGlobalUserTypes: UserType[] = [UserType.SUPERADMIN],
  allowedInstituteUserTypes: InstituteUserType[] = [InstituteUserType.INSTITUTE_ADMIN],
  globalAccessOverridesInstitute: boolean = true
) {
  return applyDecorators(
    SetMetadata(VALIDATE_HYBRID_ACCESS_KEY, { 
      instituteIdParam,
      allowedGlobalUserTypes,
      allowedInstituteUserTypes,
      globalAccessOverridesInstitute
    }),
    UseGuards(CacheValidationGuard)
  );
}
