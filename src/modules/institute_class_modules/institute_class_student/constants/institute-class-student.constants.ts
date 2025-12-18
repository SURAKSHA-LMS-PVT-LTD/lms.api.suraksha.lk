/**
 * Constants for Institute Class Student module
 */

export const INSTITUTE_CLASS_STUDENT_CONSTANTS = {
  ENTITY_NAME: 'InstituteClassStudent',
  TABLE_NAME: 'institute_class_students',
  
  // Error Messages
  ERRORS: {
    NOT_FOUND: 'Institute class student not found',
    ALREADY_EXISTS: 'Student is already assigned to this class',
    INVALID_INSTITUTE: 'Invalid institute provided',
    INVALID_CLASS: 'Invalid class provided',
    INVALID_STUDENT: 'Invalid student provided',
    BULK_OPERATION_FAILED: 'Bulk operation failed',
  },

  // Success Messages
  SUCCESS: {
    CREATED: 'Student successfully assigned to class',
    UPDATED: 'Student assignment updated successfully',
    DELETED: 'Student removed from class successfully',
    BULK_CREATED: 'Students successfully assigned to class',
    BULK_DELETED: 'Students successfully removed from class',
  },

  // Validation Messages
  VALIDATION: {
    INSTITUTE_ID_REQUIRED: 'Institute ID is required',
    CLASS_ID_REQUIRED: 'Class ID is required',
    STUDENT_ID_REQUIRED: 'Student ID is required',
    STUDENT_IDS_REQUIRED: 'Student IDs are required for bulk operation',
  },

  // Query Relations
  RELATIONS: {
    INSTITUTE: 'institute',
    CLASS: 'class',
    STUDENT: 'student',
    STUDENT_USER: 'student.user',
    ALL: ['institute', 'class', 'student', 'student.user'] as string[],
    UNVERIFIED_STUDENTS: ['student', 'student.user'] as string[],
  },

  // Default Values
  DEFAULTS: {
    IS_ACTIVE: true,
    PAGE_SIZE: 10,
    MAX_PAGE_SIZE: 100,
  },
} as const;
