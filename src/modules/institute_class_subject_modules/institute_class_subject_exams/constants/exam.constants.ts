/**
 * Constants for Institute Class Subject Exam module
 */

export const EXAM_CONSTANTS = {
  ENTITY_NAME: 'InstituteClassSubjectExam',
  TABLE_NAME: 'institute_class_subject_exams',
  
  // Exam Types
  EXAM_TYPES: {
    ONLINE: 'online',
    PHYSICAL: 'physical',
    HYBRID: 'hybrid',
  },

  // Exam Status
  STATUS: {
    SCHEDULED: 'scheduled',
    ONGOING: 'ongoing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    GRADED: 'graded',
  },

  // Exam Categories
  CATEGORIES: {
    UNIT_TEST: 'unit_test',
    MIDTERM: 'midterm', 
    FINAL: 'final',
    ASSESSMENT: 'assessment',
    QUIZ: 'quiz',
    PRACTICAL: 'practical',
  },

  // Question Types
  QUESTION_TYPES: {
    MCQ: 'mcq',
    TRUE_FALSE: 'true_false',
    SHORT_ANSWER: 'short_answer',
    LONG_ANSWER: 'long_answer',
    FILL_BLANK: 'fill_blank',
    MATCHING: 'matching',
    ESSAY: 'essay',
  },

  // Grading Types
  GRADING_TYPES: {
    AUTOMATIC: 'automatic',
    MANUAL: 'manual',
    HYBRID: 'hybrid',
  },

  // Default Values
  DEFAULTS: {
    DURATION_MINUTES: 60,
    MAX_ATTEMPTS: 1,
    PASSING_MARKS: 40,
    TOTAL_MARKS: 100,
    EXAM_TYPE: 'physical',
    STATUS: 'scheduled',
    GRADING_TYPE: 'manual',
  },

  // Validation Rules
  VALIDATION: {
    MIN_DURATION: 15, // 15 minutes minimum
    MAX_DURATION: 480, // 8 hours maximum
    MIN_MARKS: 1,
    MAX_MARKS: 1000,
    MIN_PASSING_PERCENTAGE: 0,
    MAX_PASSING_PERCENTAGE: 100,
    MAX_ATTEMPTS: 10,
  },

  // Relations
  RELATIONS: {
    ALL: ['institute', 'class', 'subject', 'creator', 'results'],
    WITH_RESULTS: ['results', 'results.student'],
    WITH_QUESTIONS: ['questions'],
    BASIC: ['institute', 'class', 'subject'],
  },

  // Sort Options
  SORT_OPTIONS: {
    DATE_ASC: { startTime: 'ASC' },
    DATE_DESC: { startTime: 'DESC' },
    TITLE_ASC: { title: 'ASC' },
    TITLE_DESC: { title: 'DESC' },
    CREATED_ASC: { createdAt: 'ASC' },
    CREATED_DESC: { createdAt: 'DESC' },
  },

  // Time Constraints (in minutes)
  TIME_CONSTRAINTS: {
    MIN_EXAM_DURATION: 15, // Minimum 15 minutes
    MAX_EXAM_DURATION: 480, // Maximum 8 hours
    ADVANCE_BOOKING_LIMIT: 60, // 60 days in advance
    MODIFICATION_CUTOFF: 60, // 60 minutes before start time
    RESULT_PUBLISH_DELAY: 30, // 30 minutes after exam end
  },

  // Filter Options
  FILTERS: {
    BY_INSTITUTE: 'institute',
    BY_CLASS: 'class',
    BY_SUBJECT: 'subject',
    BY_CREATOR: 'creator',
    BY_DATE: 'date',
    BY_STATUS: 'status',
    BY_TYPE: 'type',
    BY_CATEGORY: 'category',
  },

  // Pagination
  PAGINATION: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    DEFAULT_OFFSET: 0,
  },

  // Security
  SECURITY: {
    EXAM_ACCESS_TOKEN_EXPIRY: '24h',
    RESULT_VIEW_TIMEOUT: '1h',
  },
} as const;

// Exam Permissions
export const EXAM_PERMISSIONS = {
  CREATE: 'exam:create',
  READ: 'exam:read',
  UPDATE: 'exam:update',
  DELETE: 'exam:delete',
  DELETE_OWN: 'exam:delete_own',
  MANAGE_ALL: 'exam:manage_all',
  GRADE: 'exam:grade',
  VIEW_RESULTS: 'exam:view_results',
  PUBLISH_RESULTS: 'exam:publish_results',
  START_EXAM: 'exam:start',
  SUBMIT_EXAM: 'exam:submit',
  VIEW_ANALYTICS: 'exam:view_analytics',
} as const;
