/**
 * Constants for Institute Class Subject Lecture module
 */

export const LECTURE_CONSTANTS = {
  ENTITY_NAME: 'InstituteClassSubjectLecture',
  TABLE_NAME: 'institute_class_subject_lectures',
  
  // Lecture Types
  LECTURE_TYPES: {
    ONLINE: 'online',
    PHYSICAL: 'physical',
    HYBRID: 'hybrid',
  },

  // Lecture Status
  STATUS: {
    SCHEDULED: 'scheduled',
    LIVE: 'live',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },

  // Error Messages
  ERRORS: {
    NOT_FOUND: 'Lecture not found',
    INVALID_TIME_SLOT: 'Invalid time slot - end time must be after start time',
    TIME_CONFLICT: 'Time conflict with existing lecture',
    INSTRUCTOR_NOT_AVAILABLE: 'Instructor is not available at this time',
    VENUE_NOT_AVAILABLE: 'Venue is not available at this time',
    PAST_DATE_NOT_ALLOWED: 'Cannot create lecture in the past',
    LECTURE_ALREADY_STARTED: 'Cannot modify lecture that has already started',
    LECTURE_COMPLETED: 'Cannot modify completed lecture',
    INVALID_MEETING_LINK: 'Meeting link is required for online lectures',
    VENUE_REQUIRED: 'Venue is required for physical lectures',
    MAX_PARTICIPANTS_EXCEEDED: 'Maximum participants limit exceeded',
    BULK_OPERATION_FAILED: 'Bulk lecture creation failed',
  },

  // Success Messages
  SUCCESS: {
    CREATED: 'Lecture created successfully',
    UPDATED: 'Lecture updated successfully',
    DELETED: 'Lecture deleted successfully',
    STATUS_UPDATED: 'Lecture status updated successfully',
    BULK_CREATED: 'Lectures created successfully',
    SCHEDULE_GENERATED: 'Lecture schedule generated successfully',
  },

  // Validation Messages
  VALIDATION: {
    INSTITUTE_ID_REQUIRED: 'Institute ID is required',
    SUBJECT_ID_REQUIRED: 'Subject ID is required',
    INSTRUCTOR_ID_REQUIRED: 'Instructor ID is required',
    TITLE_REQUIRED: 'Lecture title is required',
    START_TIME_REQUIRED: 'Start time is required',
    END_TIME_REQUIRED: 'End time is required',
    LECTURE_TYPE_REQUIRED: 'Lecture type is required',
    LECTURES_REQUIRED: 'Lectures array is required for bulk operation',
  },

  // Query Relations
  RELATIONS: {
    INSTITUTE: 'institute',
    CLASS: 'class',
    SUBJECT: 'subject',
    INSTRUCTOR: 'instructor',
    ALL: ['institute', 'class', 'subject', 'instructor'],
  },

  // Default Values
  DEFAULTS: {
    LECTURE_TYPE: 'physical',
    STATUS: 'scheduled',
    IS_RECORDED: false,
    IS_ACTIVE: true,
    PAGE_SIZE: 10,
    MAX_PAGE_SIZE: 100,
    MAX_PARTICIPANTS: 50,
  },

  // Time Constraints (in minutes)
  TIME_CONSTRAINTS: {
    MIN_LECTURE_DURATION: 30, // Minimum 30 minutes
    MAX_LECTURE_DURATION: 480, // Maximum 8 hours
    ADVANCE_BOOKING_LIMIT: 30, // 30 days in advance
    MODIFICATION_CUTOFF: 30, // 30 minutes before start time
  },

  // Filter Options
  FILTERS: {
    BY_INSTITUTE: 'institute',
    BY_CLASS: 'class',
    BY_SUBJECT: 'subject',
    BY_INSTRUCTOR: 'instructor',
    BY_DATE: 'date',
    BY_STATUS: 'status',
    BY_TYPE: 'type',
  },
} as const;

// Lecture Permissions
export const LECTURE_PERMISSIONS = {
  CREATE: 'lecture:create',
  READ: 'lecture:read',
  UPDATE: 'lecture:update',
  DELETE: 'lecture:delete',
  DELETE_OWN: 'lecture:delete_own',
  MANAGE_ALL: 'lecture:manage_all',
  VIEW_ANALYTICS: 'lecture:view_analytics',
} as const;
