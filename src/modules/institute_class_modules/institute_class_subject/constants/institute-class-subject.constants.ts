/**
 * Constants for Institute Class Subject module
 */

export const INSTITUTE_CLASS_SUBJECT_CONSTANTS = {
  ENTITY_NAME: 'InstituteClassSubject',
  TABLE_NAME: 'institute_class_subjects',
  
  // Error Messages
  ERRORS: {
    NOT_FOUND: 'Institute class subject not found',
    ALREADY_EXISTS: 'Subject is already assigned to this class',
    INVALID_INSTITUTE: 'Invalid institute provided',
    INVALID_CLASS: 'Invalid class provided',
    INVALID_SUBJECT: 'Invalid subject provided',
    INVALID_TEACHER: 'Invalid teacher provided',
    TEACHER_NOT_QUALIFIED: 'Teacher is not qualified for this subject',
    BULK_OPERATION_FAILED: 'Bulk operation failed',
  },

  // Success Messages
  SUCCESS: {
    CREATED: 'Subject successfully assigned to class',
    UPDATED: 'Subject assignment updated successfully',
    DELETED: 'Subject removed from class successfully',
    TEACHER_ASSIGNED: 'Teacher successfully assigned to subject',
    BULK_CREATED: 'Subjects successfully assigned to class',
    BULK_DELETED: 'Subjects successfully removed from class',
  },

  // Validation Messages
  VALIDATION: {
    INSTITUTE_ID_REQUIRED: 'Institute ID is required',
    CLASS_ID_REQUIRED: 'Class ID is required',
    SUBJECT_ID_REQUIRED: 'Subject ID is required',
    TEACHER_ID_REQUIRED: 'Teacher ID is required',
    SUBJECTS_REQUIRED: 'Subjects are required for bulk operation',
  },

  // Query Relations
  RELATIONS: {
    INSTITUTE: 'institute',
    CLASS: 'class',
    SUBJECT: 'subject',
    TEACHER: 'teacher',
    ALL: ['institute', 'class', 'subject', 'teacher'],
  },

  // Default Values
  DEFAULTS: {
    IS_ACTIVE: true,
    PAGE_SIZE: 10,
    MAX_PAGE_SIZE: 100,
  },
} as const;
