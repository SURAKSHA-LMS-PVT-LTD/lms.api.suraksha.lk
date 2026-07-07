import { SetMetadata } from '@nestjs/common';
import { UserType } from '../../modules/user/enums/user-type.enum';
import { InstituteUserType } from '../../modules/institute_mudules/institue_user/enums/institute-user-type.enum';

// Metadata keys for enhanced validations
export const VALIDATE_ENHANCED_ACCESS_KEY = 'validateEnhancedAccess';
export const VALIDATE_INSTITUTE_ADMIN_KEY = 'validateInstituteAdmin';
export const VALIDATE_GLOBAL_OR_INSTITUTE_KEY = 'validateGlobalOrInstitute';

/**
 * Enhanced validation configuration for V2 JWT tokens
 */
export interface EnhancedAccessValidation {
  // Global access levels (SUPERADMIN, ORGANIZATION_MANAGER)
  allowedGlobalUserTypes?: UserType[];
  
  // Institute-level roles from JWT institute access array
  allowedInstituteRoles?: string[]; // ['IA', 'TE', 'ST', 'AM']
  
  // Parameter name to extract institute ID from request
  instituteIdParam?: string;
  
  // Parameter name to extract class ID from request  
  classIdParam?: string;
  
  // Parameter name to extract subject ID from request
  subjectIdParam?: string;
  
  // Parameter name to extract student ID for parent access
  studentIdParam?: string;
  
  // Whether to allow parent access through children
  allowParentAccess?: boolean;
  
  // Whether to require specific class access
  requireClassAccess?: boolean;
  
  // Whether to require specific subject access  
  requireSubjectAccess?: boolean;
  
  // Custom validation message
  customMessage?: string;
}

/**
 * Institute admin specific validation (IA role + institute access)
 */
export interface InstituteAdminValidation {
  // Parameter name to extract institute ID
  instituteIdParam?: string;
  
  // Allow SUPERADMIN/ORG_MANAGER global access as fallback
  allowGlobalAccess?: boolean;
  
  // Custom validation message
  customMessage?: string;
}

/**
 * Global or institute validation (SUPERADMIN/ORG_MANAGER OR institute-level access)
 */
export interface GlobalOrInstituteValidation {
  // Global user types that have universal access
  allowedGlobalUserTypes?: UserType[];
  
  // Institute roles that have access to specific institute
  allowedInstituteRoles?: string[];
  
  // Parameter name to extract institute ID
  instituteIdParam?: string;
  
  // Custom validation message  
  customMessage?: string;
}

/**
 * 🚀 MAIN DECORATOR: Validates comprehensive access using enhanced V2 JWT tokens
 * 
 * Supports:
 * - Global access (SUPERADMIN, ORGANIZATION_MANAGER) 
 * - Institute-level access (IA, TE, ST, AM roles from JWT)
 * - Class/Subject specific access
 * - Parent access through children
 * 
 * @param validation Enhanced access validation configuration
 * 
 * @example
 * ```typescript
 * @ValidateEnhancedAccess({
 *   allowedGlobalUserTypes: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
 *   allowedInstituteRoles: ['IA', 'TE'],
 *   instituteIdParam: 'instituteId',
 *   classIdParam: 'classId',
 *   requireClassAccess: true
 * })
 * async getClassDetails(@Param('instituteId') instituteId: string) {
 *   // Only SUPERADMIN/ORG_MANAGER globally OR IA/TE with class access can execute
 * }
 * ```
 */
export const ValidateEnhancedAccess = (validation: EnhancedAccessValidation) => 
  SetMetadata(VALIDATE_ENHANCED_ACCESS_KEY, validation);

/**
 * 🎯 INSTITUTE ADMIN: Validates institute admin access specifically
 * 
 * Checks for:
 * - SUPERADMIN/ORG_MANAGER global access (if allowGlobalAccess: true)
 * - IA (Institute Admin) role for specific institute from JWT
 * 
 * @param validation Institute admin validation configuration
 * 
 * @example
 * ```typescript
 * @ValidateInstituteAdmin({
 *   instituteIdParam: 'instituteId',
 *   allowGlobalAccess: true
 * })
 * async manageInstitute(@Param('instituteId') instituteId: string) {
 *   // Only SUPERADMIN/ORG_MANAGER or IA for this institute can execute
 * }
 * ```
 */
export const ValidateInstituteAdmin = (validation: InstituteAdminValidation = {}) => 
  SetMetadata(VALIDATE_INSTITUTE_ADMIN_KEY, validation);

/**
 * ⚡ HYBRID: Validates either global access OR institute-level access
 * 
 * Most common pattern: SUPERADMIN/ORG_MANAGER have universal access,
 * or specific institute roles have access to their institute
 * 
 * @param validation Global or institute validation configuration
 * 
 * @example
 * ```typescript
 * @ValidateGlobalOrInstitute({
 *   allowedGlobalUserTypes: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER], 
 *   allowedInstituteRoles: ['IA', 'TE'],
 *   instituteIdParam: 'instituteId'
 * })
 * async getInstituteData(@Param('instituteId') instituteId: string) {
 *   // SUPERADMIN/ORG_MANAGER can access any institute
 *   // IA/TE can only access their specific institute
 * }
 * ```
 */
export const ValidateGlobalOrInstitute = (validation: GlobalOrInstituteValidation) => 
  SetMetadata(VALIDATE_GLOBAL_OR_INSTITUTE_KEY, validation);

/**
 * 📚 QUICK ACCESS DECORATORS: Common validation patterns
 */

/**
 * Only SUPERADMIN and ORGANIZATION_MANAGER
 */
export const RequireGlobalAdmin = () => ValidateEnhancedAccess({
  allowedGlobalUserTypes: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
  customMessage: 'Global administrator access required'
});

/**
 * SUPERADMIN/ORG_MANAGER or Institute Admin for specific institute
 */
export const RequireInstituteAdmin = (instituteIdParam: string = 'instituteId') => 
  ValidateGlobalOrInstitute({
    allowedGlobalUserTypes: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    allowedInstituteRoles: ['IA'],
    instituteIdParam,
    customMessage: 'Institute administrator access required'
  });

/**
 * SUPERADMIN/ORG_MANAGER or Institute Admin/Teacher for specific institute
 */
export const RequireInstituteStaff = (instituteIdParam: string = 'instituteId') =>
  ValidateGlobalOrInstitute({
    allowedGlobalUserTypes: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    allowedInstituteRoles: ['IA', 'TE'],
    instituteIdParam,
    customMessage: 'Institute staff access required'
  });

/**
 * SUPERADMIN/ORG_MANAGER or any institute member (IA/TE/ST) for specific institute  
 */
export const RequireInstituteAccess = (instituteIdParam: string = 'instituteId') =>
  ValidateGlobalOrInstitute({
    allowedGlobalUserTypes: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
    allowedInstituteRoles: ['IA', 'TE', 'ST'],
    instituteIdParam,
    customMessage: 'Institute access required'
  });

/**
 * Class-specific access with teacher/student validation
 */
export const RequireClassAccess = (
  instituteIdParam: string = 'instituteId',
  classIdParam: string = 'classId'
) => ValidateEnhancedAccess({
  allowedGlobalUserTypes: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
  allowedInstituteRoles: ['IA', 'TE', 'ST'],
  instituteIdParam,
  classIdParam,
  requireClassAccess: true,
  customMessage: 'Class access required'
});

/**
 * Subject-specific access with teacher/student validation
 */
export const RequireSubjectAccess = (
  instituteIdParam: string = 'instituteId', 
  classIdParam: string = 'classId',
  subjectIdParam: string = 'subjectId'
) => ValidateEnhancedAccess({
  allowedGlobalUserTypes: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
  allowedInstituteRoles: ['IA', 'TE', 'ST'], 
  instituteIdParam,
  classIdParam,
  subjectIdParam,
  requireSubjectAccess: true,
  allowParentAccess: true,
  customMessage: 'Subject access required'
});

/**
 * Parent access through student validation
 */
export const RequireParentOrStaffAccess = (
  instituteIdParam: string = 'instituteId',
  studentIdParam: string = 'studentId'
) => ValidateEnhancedAccess({
  allowedGlobalUserTypes: [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER],
  allowedInstituteRoles: ['IA', 'TE'],
  instituteIdParam,
  studentIdParam,
  allowParentAccess: true,
  customMessage: 'Parent or staff access required'
});
