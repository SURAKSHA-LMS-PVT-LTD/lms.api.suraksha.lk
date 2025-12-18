export const STUDENT_CONSTANTS = {
  // Error Messages
  ERRORS: {
    NOT_FOUND: 'Student not found',
    EMAIL_EXISTS: 'Student with this email already exists',
    PHONE_EXISTS: 'Student with this phone number already exists',
    INVALID_PARENT: 'Invalid parent ID provided',
    INVALID_USER: 'Invalid user data provided',
    CREATE_FAILED: 'Failed to create student',
    UPDATE_FAILED: 'Failed to update student',
    DELETE_FAILED: 'Failed to delete student',
    INVALID_ADMISSION_NUMBER: 'Invalid admission number format',
    ADMISSION_NUMBER_EXISTS: 'Student with this admission number already exists',
  },

  // Success Messages
  SUCCESS: {
    CREATED: 'Student created successfully',
    UPDATED: 'Student updated successfully',
    DELETED: 'Student deleted successfully',
    FOUND: 'Student found successfully',
    LISTED: 'Students listed successfully',
  },

  // Validation Rules
  VALIDATION: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 100,
    EMAIL_MAX_LENGTH: 150,
    PHONE_MIN_LENGTH: 10,
    PHONE_MAX_LENGTH: 15,
    ADDRESS_MAX_LENGTH: 500,
    ADMISSION_NUMBER_MIN_LENGTH: 3,
    ADMISSION_NUMBER_MAX_LENGTH: 20,
    EMERGENCY_CONTACT_MIN_LENGTH: 10,
    EMERGENCY_CONTACT_MAX_LENGTH: 15,
  },

  // Default Values
  DEFAULTS: {
    IS_ACTIVE: true,
    PAGE_SIZE: 10,
    MAX_PAGE_SIZE: 100,
  },

  // Repository Token
  REPOSITORY_TOKEN: 'STUDENT_REPOSITORY',

  // Cache Keys
  CACHE_KEYS: {
    STUDENT_BY_ID: 'student:id:',
    STUDENT_BY_EMAIL: 'student:email:',
    STUDENT_BY_ADMISSION: 'student:admission:',
    STUDENTS_LIST: 'students:list:',
  },

  // Cache TTL (Time to Live in seconds)
  CACHE_TTL: {
    STUDENT_DETAILS: 300, // 5 minutes
    STUDENTS_LIST: 180, // 3 minutes
  },

  // Regex Patterns
  PATTERNS: {
    PHONE: /^[\+]?[1-9][\d]{9,14}$/,
    ADMISSION_NUMBER: /^[A-Za-z0-9]{3,20}$/,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },

  // Gender Options
  GENDER: {
    MALE: 'male',
    FEMALE: 'female',
    OTHER: 'other',
  },

  // Blood Group Options
  BLOOD_GROUPS: [
    'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'
  ],

  // Academic Status
  ACADEMIC_STATUS: {
    ACTIVE: 'active',
    SUSPENDED: 'suspended',
    GRADUATED: 'graduated',
    DROPPED_OUT: 'dropped_out',
    TRANSFERRED: 'transferred',
  },
} as const;

export type StudentGender = typeof STUDENT_CONSTANTS.GENDER[keyof typeof STUDENT_CONSTANTS.GENDER];
export type StudentAcademicStatus = typeof STUDENT_CONSTANTS.ACADEMIC_STATUS[keyof typeof STUDENT_CONSTANTS.ACADEMIC_STATUS];
export type StudentBloodGroup = typeof STUDENT_CONSTANTS.BLOOD_GROUPS[number];
