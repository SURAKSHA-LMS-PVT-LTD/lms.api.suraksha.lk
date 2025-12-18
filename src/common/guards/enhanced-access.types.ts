export const ENHANCED_ACCESS_RULES_KEY = 'enhanced_access_rules';

export type AllowedAccessRole =
  | 'SYSTEM_ADMIN'
  | 'INSTITUTE_ADMIN'
  | 'ATTENDANCE_MARKER'
  | 'TEACHER'
  | 'STUDENT'
  | 'PARENT';

export interface SystemAdminRule {
  type: 'SYSTEM_ADMIN';
}

export interface InstituteAdminRule {
  type: 'INSTITUTE_ADMIN';
  instituteParam: string;
  allowAttendanceMarker?: boolean;
}

export interface ParentAccessRule {
  type: 'PARENT_ACCESS';
  studentParam: string;
}

export interface UserTypeAccessRule {
  type: 'USER_TYPE_ACCESS';
  instituteParam?: string;
  userIdParam?: string;
  classParam?: string;
  subjectParam?: string;
  allowedRoles: AllowedAccessRole[];
}

export type EnhancedAccessRule =
  | SystemAdminRule
  | InstituteAdminRule
  | ParentAccessRule
  | UserTypeAccessRule;
