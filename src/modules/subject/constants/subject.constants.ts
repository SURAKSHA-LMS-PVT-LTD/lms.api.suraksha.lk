export const SUBJECT_CONSTANTS = {
  CODE: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 50,
  },
  NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 255,
  },
  CATEGORY: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 100,
  },
  CREDIT_HOURS: {
    MIN: 1,
    MAX: 10,
  },
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
  },
  SORT: {
    DEFAULT_FIELD: 'createdAt',
    DEFAULT_ORDER: 'DESC' as const,
    ALLOWED_FIELDS: ['id', 'code', 'name', 'category', 'creditHours', 'isActive', 'createdAt', 'updatedAt'],
    ALLOWED_ORDERS: ['ASC', 'DESC'] as const,
  },
} as const;

export const SUBJECT_CATEGORIES = [
  'Mathematics',
  'Science',
  'Language Arts',
  'Social Studies',
  'Arts',
  'Physical Education',
  'Technology',
  'Foreign Language',
  'Vocational',
  'Other',
] as const;

export type SubjectCategory = typeof SUBJECT_CATEGORIES[number];
