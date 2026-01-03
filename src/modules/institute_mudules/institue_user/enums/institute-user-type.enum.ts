  export enum InstituteUserType {
    INSTITUTE_ADMIN = 'INSTITUTE_ADMIN',
    TEACHER = 'TEACHER',
    STUDENT = 'STUDENT', 
    ATTENDANCE_MARKER = 'ATTENDANCE_MARKER',
    PARENT = 'PARENT',
  }

// Compact codes for JWT tokens only
export const INSTITUTE_USER_TYPE_CODES = {
  [InstituteUserType.INSTITUTE_ADMIN]: 'IA',
  [InstituteUserType.TEACHER]: 'T',
  [InstituteUserType.STUDENT]: 'S',
  [InstituteUserType.ATTENDANCE_MARKER]: 'AM',
  [InstituteUserType.PARENT]: 'P',
} as const;

// Reverse mapping for JWT parsing
export const INSTITUTE_USER_CODE_TO_TYPE = {
  'IA': InstituteUserType.INSTITUTE_ADMIN,
  'T': InstituteUserType.TEACHER,
  'S': InstituteUserType.STUDENT,
  'AM': InstituteUserType.ATTENDANCE_MARKER,
  'P': InstituteUserType.PARENT,
} as const;
