export enum UserType {
  SUPERADMIN = 'SUPER_ADMIN',
  ORGANIZATION_MANAGER = 'ORGANIZATION_MANAGER',
  // Enhanced flexible global user types
  USER = 'USER', // Can play any institute role + can be assigned as student parent
  USER_WITHOUT_PARENT = 'USER_WITHOUT_PARENT', // Can play any institute role but CANNOT be assigned as parent
  USER_WITHOUT_STUDENT = 'USER_WITHOUT_STUDENT' // Can play parent role but CANNOT play student role
}

// Interface for user type capabilities
export interface UserTypeCapability {
  canPlayAnyInstituteRole: boolean;
  canBeAssignedAsParent: boolean;
  canPlayStudentRole: boolean;
  canPlayParentRole: boolean;
  description: string;
  fixedInstituteRole?: string;
  globalAccess?: boolean;
}

// Role assignment capabilities for global user types
export const USER_TYPE_CAPABILITIES: Record<UserType, UserTypeCapability> = {
  [UserType.SUPERADMIN]: {
    canPlayAnyInstituteRole: true,
    canBeAssignedAsParent: false,
    canPlayStudentRole: false,
    canPlayParentRole: false,
    globalAccess: true,
    description: 'System-wide super admin access with global privileges'
  },
  [UserType.ORGANIZATION_MANAGER]: {
    canPlayAnyInstituteRole: true,
    canBeAssignedAsParent: false,
    canPlayStudentRole: false,
    canPlayParentRole: false,
    description: 'Organization level management with institute access control'
  },
  [UserType.USER]: {
    canPlayAnyInstituteRole: true,
    canBeAssignedAsParent: true,
    canPlayStudentRole: true,
    canPlayParentRole: true,
    description: 'Full flexibility - any institute role + parent assignment capabilities'
  },
  [UserType.USER_WITHOUT_PARENT]: {
    canPlayAnyInstituteRole: true,
    canBeAssignedAsParent: false,
    canPlayStudentRole: true,
    canPlayParentRole: false,
    description: 'Flexible institute role user - can be student but cannot be assigned as parent'
  },
  [UserType.USER_WITHOUT_STUDENT]: {
    canPlayAnyInstituteRole: false,
    canBeAssignedAsParent: true,
    canPlayStudentRole: false,
    canPlayParentRole: true,
    description: 'Parent-only user - can only play parent role, cannot be student'
  }
};
