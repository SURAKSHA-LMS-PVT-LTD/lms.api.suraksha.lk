export const EXAM_CONSTANTS = {
  SHEETS: {
    CLASS_SECTIONS: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
    SUMMARY_SHEET: 'Summary',
    BASKET_SUMMARY_SHEET: 'Basket Summary',
    STUDENT_ID_START_CELL: 'B8', // Starting cell for student IDs
    STUDENT_NAME_START_CELL: 'C8', // Starting cell for student names
    STUDENT_ID_COLUMN: 'B',
    STUDENT_NAME_COLUMN: 'C'
  },
  
  // Note: Template constants simplified for new exam types
  TEMPLATES: {
    ONLINE: 'TEMPLATE_ONLINE',
    PHYSICAL: 'TEMPLATE_PHYSICAL', 
    HYBRID: 'TEMPLATE_HYBRID'
  },

  ERRORS: {
    EXAM_NOT_FOUND: 'Exam not found',
    EXAM_ALREADY_EXISTS: 'Exam already exists for this class and period',
    SHEET_NOT_FOUND: 'Sheet not found',
    INVALID_EXAM_TYPE: 'Invalid exam type',
    RESULTS_ALREADY_PUBLISHED: 'Results are already published',
    EXAM_NOT_COMPLETED: 'Exam is not completed yet',
    INVALID_MARKS: 'Invalid marks provided',
    STUDENT_NOT_FOUND: 'Student not found in this class',
    TEMPLATE_NOT_FOUND: 'Template not found for this exam type',
    PERMISSION_DENIED: 'Permission denied for this operation',
    EXAM_CREATION_FAILED: 'Failed to create exam',
    EXAM_UPDATE_FAILED: 'Failed to update exam',
    EXAM_DELETE_FAILED: 'Failed to delete exam',
    EXAM_FETCH_FAILED: 'Failed to fetch exam',
    EXAM_NOT_ACTIVE: 'Exam is not active for mark entry',
  },

  SUCCESS: {
    EXAM_CREATED: 'Exam created successfully',
    MARKS_UPDATED: 'Marks updated successfully',
    RESULTS_PUBLISHED: 'Results published successfully',
    SHEET_CREATED: 'Sheet created successfully',
    MARKS_ENTERED_SUCCESSFULLY: 'Marks entered successfully',
    EXAM_DELETED_SUCCESSFULLY: 'Exam deleted successfully',
  }
};

export const ERROR_MESSAGES = EXAM_CONSTANTS.ERRORS;
export const SUCCESS_MESSAGES = EXAM_CONSTANTS.SUCCESS;
export const SHEET_CONFIG = EXAM_CONSTANTS.SHEETS;
export const TEMPLATE_KEYS = EXAM_CONSTANTS.TEMPLATES;
