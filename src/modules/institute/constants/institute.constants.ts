export const INSTITUTE_CONSTANTS = {
  // Error Messages
  ERRORS: {
    NOT_FOUND: 'Institute not found',
    CODE_EXISTS: 'Institute with this code already exists',
    EMAIL_EXISTS: 'Institute with this email already exists',
    PHONE_EXISTS: 'Institute with this phone number already exists',
    INVALID_CODE: 'Invalid institute code format',
    CREATE_FAILED: 'Failed to create institute',
    UPDATE_FAILED: 'Failed to update institute',
    DELETE_FAILED: 'Failed to delete institute',
    DEACTIVATION_FAILED: 'Failed to deactivate institute',
    ACTIVATION_FAILED: 'Failed to activate institute',
    INVALID_TYPE: 'Invalid institute type',
    INVALID_STATUS: 'Invalid institute status',
  },

  // Success Messages
  SUCCESS: {
    CREATED: 'Institute created successfully',
    UPDATED: 'Institute updated successfully',
    DELETED: 'Institute deleted successfully',
    ACTIVATED: 'Institute activated successfully',
    DEACTIVATED: 'Institute deactivated successfully',
    FOUND: 'Institute found successfully',
    LISTED: 'Institutes listed successfully',
  },

  // Validation Rules
  VALIDATION: {
    NAME_MIN_LENGTH: 3,
    NAME_MAX_LENGTH: 200,
    CODE_MIN_LENGTH: 3,
    CODE_MAX_LENGTH: 20,
    EMAIL_MAX_LENGTH: 150,
    PHONE_MIN_LENGTH: 10,
    PHONE_MAX_LENGTH: 15,
    ADDRESS_MAX_LENGTH: 500,
    WEBSITE_MAX_LENGTH: 100,
    DESCRIPTION_MAX_LENGTH: 1000,
    CONTACT_PERSON_NAME_MAX_LENGTH: 100,
  },

  // Default Values
  DEFAULTS: {
    IS_ACTIVE: true,
    PAGE_SIZE: 10,
    MAX_PAGE_SIZE: 100,
    TYPE: 'SCHOOL',
    STATUS: 'PENDING',
  },

  // Repository Token
  REPOSITORY_TOKEN: 'INSTITUTE_REPOSITORY',

  // Cache Keys
  CACHE_KEYS: {
    INSTITUTE_BY_ID: 'institute:id:',
    INSTITUTE_BY_CODE: 'institute:code:',
    INSTITUTE_BY_EMAIL: 'institute:email:',
    INSTITUTES_LIST: 'institutes:list:',
    INSTITUTE_STATS: 'institutes:stats:',
  },

  // Cache TTL (Time to Live in seconds)
  CACHE_TTL: {
    INSTITUTE_DETAILS: 600, // 10 minutes
    INSTITUTES_LIST: 300, // 5 minutes
    INSTITUTE_STATS: 3600, // 1 hour
  },

  // Regex Patterns
  PATTERNS: {
    PHONE: /^[\+]?[1-9][\d]{9,14}$/,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    WEBSITE: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
    INSTITUTE_CODE: /^[A-Z0-9]{3,20}$/,
    POSTAL_CODE: /^[0-9]{5,10}$/,
  },

  // Institute Types
  INSTITUTE_TYPE: {
    SCHOOL: 'school',
    GOV_SCHOOL: 'gov_school',
    COLLEGE: 'college',
    UNIVERSITY: 'university',
    VOCATIONAL: 'vocational',
    TRAINING_CENTER: 'training_center',
    COACHING_CENTER: 'coaching_center',
    TUITION_INSTITUTE: 'tuition_institute',
    ONLINE_ACADEMY: 'online_academy',
    OTHER: 'other',
  },

  // Institute Status
  INSTITUTE_STATUS: {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    SUSPENDED: 'suspended',
    UNDER_REVIEW: 'under_review',
    CLOSED: 'closed',
  },

  // Accreditation Types
  ACCREDITATION_TYPE: {
    GOVERNMENT: 'government',
    PRIVATE: 'private',
    INTERNATIONAL: 'international',
    BOARD: 'board',
    UNIVERSITY: 'university',
    NONE: 'none',
  },

  // Education Levels
  EDUCATION_LEVEL: {
    PRE_PRIMARY: 'pre_primary',
    PRIMARY: 'primary',
    SECONDARY: 'secondary',
    HIGHER_SECONDARY: 'higher_secondary',
    UNDERGRADUATE: 'undergraduate',
    POSTGRADUATE: 'postgraduate',
    DOCTORATE: 'doctorate',
    DIPLOMA: 'diploma',
    CERTIFICATE: 'certificate',
  },

  // Board Types
  BOARD_TYPE: {
    CBSE: 'cbse',
    ICSE: 'icse',
    STATE_BOARD: 'state_board',
    IB: 'ib',
    CAMBRIDGE: 'cambridge',
    NIOS: 'nios',
    OTHER: 'other',
  },

  // Facility Types
  FACILITY_TYPES: [
    'library',
    'laboratory',
    'computer_lab',
    'playground',
    'auditorium',
    'canteen',
    'hostel',
    'transport',
    'medical_room',
    'sports_complex',
    'swimming_pool',
    'art_room',
    'music_room',
    'dance_room',
    'wifi',
    'air_conditioning',
    'generator',
    'security',
    'cctv',
    'parking',
  ],

  // Subscription Plans
  SUBSCRIPTION_PLAN: {
    FREE: 'free',
    BASIC: 'basic',
    STANDARD: 'standard',
    PREMIUM: 'premium',
    ENTERPRISE: 'enterprise',
  },

  // Institute Size Categories
  INSTITUTE_SIZE: {
    SMALL: 'small',        // < 100 students
    MEDIUM: 'medium',      // 100-500 students
    LARGE: 'large',        // 500-2000 students
    VERY_LARGE: 'very_large', // > 2000 students
  },

  // Contact Types
  CONTACT_TYPE: {
    PHONE: 'phone',
    EMAIL: 'email',
    WEBSITE: 'website',
    SOCIAL_MEDIA: 'social_media',
    ADDRESS: 'address',
  },

  // Social Media Platforms
  SOCIAL_MEDIA: {
    FACEBOOK: 'facebook',
    TWITTER: 'twitter',
    INSTAGRAM: 'instagram',
    LINKEDIN: 'linkedin',
    YOUTUBE: 'youtube',
    WHATSAPP: 'whatsapp',
  },
} as const;

export type InstituteType = typeof INSTITUTE_CONSTANTS.INSTITUTE_TYPE[keyof typeof INSTITUTE_CONSTANTS.INSTITUTE_TYPE];
export type InstituteStatus = typeof INSTITUTE_CONSTANTS.INSTITUTE_STATUS[keyof typeof INSTITUTE_CONSTANTS.INSTITUTE_STATUS];
export type AccreditationType = typeof INSTITUTE_CONSTANTS.ACCREDITATION_TYPE[keyof typeof INSTITUTE_CONSTANTS.ACCREDITATION_TYPE];
export type EducationLevel = typeof INSTITUTE_CONSTANTS.EDUCATION_LEVEL[keyof typeof INSTITUTE_CONSTANTS.EDUCATION_LEVEL];
export type BoardType = typeof INSTITUTE_CONSTANTS.BOARD_TYPE[keyof typeof INSTITUTE_CONSTANTS.BOARD_TYPE];
export type SubscriptionPlan = typeof INSTITUTE_CONSTANTS.SUBSCRIPTION_PLAN[keyof typeof INSTITUTE_CONSTANTS.SUBSCRIPTION_PLAN];
export type InstituteSize = typeof INSTITUTE_CONSTANTS.INSTITUTE_SIZE[keyof typeof INSTITUTE_CONSTANTS.INSTITUTE_SIZE];
export type ContactType = typeof INSTITUTE_CONSTANTS.CONTACT_TYPE[keyof typeof INSTITUTE_CONSTANTS.CONTACT_TYPE];
export type SocialMediaPlatform = typeof INSTITUTE_CONSTANTS.SOCIAL_MEDIA[keyof typeof INSTITUTE_CONSTANTS.SOCIAL_MEDIA];
