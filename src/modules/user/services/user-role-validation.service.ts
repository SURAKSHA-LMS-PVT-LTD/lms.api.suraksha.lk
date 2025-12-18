import { Injectable, BadRequestException } from '@nestjs/common';
import { UserType, USER_TYPE_CAPABILITIES } from '../enums/user-type.enum';
import { InstituteUserType } from '../../institute_mudules/institue_user/enums/institute-user-type.enum';

@Injectable()
export class UserRoleValidationService {
  
  /**
   * Validates if a user can be assigned to a specific institute role
   * 
   * Rules:
   * - Only USER and USER_WITHOUT_PARENT can be assigned as STUDENT
   * - Only USER can be assigned as PARENT (not USER_WITHOUT_PARENT or USER_WITHOUT_STUDENT)
   * - Only USER and USER_WITHOUT_PARENT can be assigned to any other roles
   * - USER_WITHOUT_STUDENT cannot be assigned as STUDENT
   * - SUPERADMIN and ORGANIZATION_MANAGER cannot be assigned to institutes
   */
  validateInstituteRoleAssignment(
    userType: UserType, 
    targetInstituteRole: InstituteUserType
  ): { isValid: boolean; reason?: string } {
    
    // 🔧 NORMALIZE: Handle case inconsistencies in database user types
    // Convert variations like "user_without_Parent" to "USER_WITHOUT_PARENT"
    const normalizedUserType = (userType as string)?.toUpperCase().replace(/\s+/g, '_') as UserType;
    
    const capabilities = USER_TYPE_CAPABILITIES[normalizedUserType];
    
    if (!capabilities) {
      return { 
        isValid: false, 
        reason: `Invalid user profile. User type "${userType}" is not recognized. Please contact administrator to fix user profile. Target institute role: ${targetInstituteRole}`
      };
    }
    
    // Global users (SUPER_ADMIN) don't get institute assignments
    if (capabilities.globalAccess) {
      return { isValid: false, reason: 'Global users should not be assigned to specific institutes' };
    }
    
    // Fixed role users must match their designated role
    if (capabilities.fixedInstituteRole) {
      if (capabilities.fixedInstituteRole !== targetInstituteRole) {
        return { 
          isValid: false, 
          reason: `${normalizedUserType} users must be assigned as ${capabilities.fixedInstituteRole} only` 
        };
      }
      return { isValid: true };
    }
    
    // ✅ NEW VALIDATION: STUDENT role restrictions
    if (targetInstituteRole === InstituteUserType.STUDENT) {
      // Only USER and USER_WITHOUT_PARENT can be assigned as STUDENT
      if (normalizedUserType === UserType.USER || normalizedUserType === UserType.USER_WITHOUT_PARENT) {
        return { isValid: true };
      }
      
      // USER_WITHOUT_STUDENT cannot be assigned as STUDENT
      if (normalizedUserType === UserType.USER_WITHOUT_STUDENT) {
        return { 
          isValid: false, 
          reason: `This user cannot be assigned as STUDENT. User profile type restricts STUDENT role assignment.`
        };
      }
      
      return { 
        isValid: false, 
        reason: `This user cannot be assigned as STUDENT. Only certain user profile types support STUDENT role.`
      };
    }
    
    // ✅ NEW VALIDATION: PARENT role restrictions
    if (targetInstituteRole === InstituteUserType.PARENT) {
      // Only USER and USER_WITHOUT_STUDENT can be assigned as PARENT
      if (normalizedUserType === UserType.USER || normalizedUserType === UserType.USER_WITHOUT_STUDENT) {
        return { isValid: true };
      }
      
      return { 
        isValid: false, 
        reason: `This user cannot be assigned as PARENT. User profile type restricts PARENT role assignment.`
      };
    }
    
    // ✅ NEW VALIDATION: Other roles (TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER)
    // USER, USER_WITHOUT_PARENT, and USER_WITHOUT_STUDENT can be assigned to these roles
    if (normalizedUserType === UserType.USER || normalizedUserType === UserType.USER_WITHOUT_PARENT || normalizedUserType === UserType.USER_WITHOUT_STUDENT) {
      return { isValid: true };
    }
    
    return { isValid: false, reason: 'Role assignment not allowed for this user type' };
  }
  
  /**
   * Validates if a user can be assigned as a parent to a student
   */
  validateParentAssignment(userType: UserType): { isValid: boolean; reason?: string } {
    
    // 🔧 NORMALIZE: Handle case inconsistencies
    const normalizedUserType = (userType as string)?.toUpperCase().replace(/\s+/g, '_') as UserType;
    
    const capabilities = USER_TYPE_CAPABILITIES[normalizedUserType];
    
    if (!capabilities) {
      return { isValid: false, reason: 'Unknown user type' };
    }
    
    if (!capabilities.canBeAssignedAsParent) {
      return { 
        isValid: false, 
        reason: `${normalizedUserType} users cannot be assigned as parents` 
      };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validates if a user can play a parent role in institute context
   */
  validateParentRoleInInstitute(userType: UserType): { isValid: boolean; reason?: string } {
    
    // 🔧 NORMALIZE: Handle case inconsistencies
    const normalizedUserType = (userType as string)?.toUpperCase().replace(/\s+/g, '_') as UserType;
    
    const capabilities = USER_TYPE_CAPABILITIES[normalizedUserType];
    
    if (!capabilities) {
      return { isValid: false, reason: 'Unknown user type' };
    }
    
    if (!capabilities.canPlayParentRole) {
      return { 
        isValid: false, 
        reason: `${normalizedUserType} users cannot play parent roles in institutes` 
      };
    }
    
    return { isValid: true };
  }
  
  /**
   * Validates if a user can play a student role in institute context
   */
  validateStudentRoleInInstitute(userType: UserType): { isValid: boolean; reason?: string } {
    
    // 🔧 NORMALIZE: Handle case inconsistencies
    const normalizedUserType = (userType as string)?.toUpperCase().replace(/\s+/g, '_') as UserType;
    
    const capabilities = USER_TYPE_CAPABILITIES[normalizedUserType];
    
    if (!capabilities) {
      return { isValid: false, reason: 'Unknown user type' };
    }
    
    if (!capabilities.canPlayStudentRole) {
      return { 
        isValid: false, 
        reason: `${normalizedUserType} users cannot play student roles in institutes` 
      };
    }
    
    return { isValid: true };
  }
  
  /**
   * Gets allowed institute roles for a user type
   */
  getAllowedInstituteRoles(userType: UserType): InstituteUserType[] {
    
    // 🔧 NORMALIZE: Handle case inconsistencies
    const normalizedUserType = (userType as string)?.toUpperCase().replace(/\s+/g, '_') as UserType;
    
    const capabilities = USER_TYPE_CAPABILITIES[normalizedUserType];
    
    if (!capabilities) {
      return [];
    }
    
    // Global users don't get institute roles
    if (capabilities.globalAccess) {
      return [];
    }
    
    // Fixed role users
    if (capabilities.fixedInstituteRole) {
      return [capabilities.fixedInstituteRole as InstituteUserType];
    }
    
    // Flexible users
    const allRoles = Object.values(InstituteUserType);
    
    if (normalizedUserType === UserType.USER_WITHOUT_STUDENT) {
      // Can play parent role but not student
      return allRoles.filter(role => role !== InstituteUserType.STUDENT);
    }
    
    if (normalizedUserType === UserType.USER_WITHOUT_PARENT) {
      // Can play any role except parent (but parent isn't an institute role anymore)
      return allRoles;
    }
    
    if (normalizedUserType === UserType.USER) {
      // Can play any role
      return allRoles;
    }
    
    return [];
  }
  
  /**
   * Validates user creation requirements
   */
  validateUserCreationRequirements(userType: UserType, hasStudentDetails: boolean, hasParentDetails: boolean): {
    isValid: boolean;
    missingRequirements?: string[];
  } {
    
    const missing: string[] = [];
    
    // All users should have both student and parent details when created
    if (!hasStudentDetails) {
      missing.push('Student details are required');
    }
    
    if (!hasParentDetails) {
      missing.push('Parent details are required');
    }
    
    return {
      isValid: missing.length === 0,
      missingRequirements: missing.length > 0 ? missing : undefined
    };
  }
  
  /**
   * ✅ NEW: Validates if someone can be assigned as PARENT when they already have a STUDENT relation
   * 
   * Rule: Cannot assign someone as PARENT in an institute if they are already a STUDENT in that institute
   * 
   * @param hasStudentRelation - Whether the user already has a STUDENT relation in the institute
   * @param targetRole - The role being assigned
   * @returns Validation result
   */
  validateParentStudentConflict(
    hasStudentRelation: boolean, 
    targetRole: InstituteUserType
  ): { isValid: boolean; reason?: string } {
    
    // If trying to assign as PARENT and they already have STUDENT relation
    if (targetRole === InstituteUserType.PARENT && hasStudentRelation) {
      return {
        isValid: false,
        reason: 'Cannot assign user as PARENT because they already have a STUDENT relation in this institute'
      };
    }
    
    return { isValid: true };
  }
  
  /**
   * ✅ NEW: Comprehensive validation for institute role assignment
   * 
   * Combines user type validation with conflict checking
   * 
   * @param userType - The user's type
   * @param targetRole - The role being assigned
   * @param hasStudentRelation - Whether user already has STUDENT relation in institute
   * @returns Validation result
   */
  validateComprehensiveRoleAssignment(
    userType: UserType,
    targetRole: InstituteUserType,
    hasStudentRelation: boolean = false
  ): { isValid: boolean; reason?: string } {
    
    // First check user type compatibility
    const userTypeValidation = this.validateInstituteRoleAssignment(userType, targetRole);
    if (!userTypeValidation.isValid) {
      return userTypeValidation;
    }
    
    // Then check for PARENT-STUDENT conflict
    const conflictValidation = this.validateParentStudentConflict(hasStudentRelation, targetRole);
    if (!conflictValidation.isValid) {
      return conflictValidation;
    }
    
    return { isValid: true };
  }
}
