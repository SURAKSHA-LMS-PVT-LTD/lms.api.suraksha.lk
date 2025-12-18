export const PARENT_CONSTANTS = {
  // Error Messages
  ERRORS: {
    NOT_FOUND: 'Parent not found',
    EMAIL_EXISTS: 'Parent with this email already exists',
    PHONE_EXISTS: 'Parent with this phone number already exists',
    INVALID_USER: 'Invalid user data provided',
    CREATE_FAILED: 'Failed to create parent',
    UPDATE_FAILED: 'Failed to update parent',
    DELETE_FAILED: 'Failed to delete parent',
    INVALID_OCCUPATION: 'Invalid occupation provided',
    INVALID_RELATIONSHIP: 'Invalid relationship type',
    NO_CHILDREN: 'Parent has no associated children',
  },

  // Success Messages
  SUCCESS: {
    CREATED: 'Parent created successfully',
    UPDATED: 'Parent updated successfully',
    DELETED: 'Parent deleted successfully',
    FOUND: 'Parent found successfully',
    LISTED: 'Parents listed successfully',
  },

  // Validation Rules
  VALIDATION: {
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 100,
    EMAIL_MAX_LENGTH: 150,
    PHONE_MIN_LENGTH: 10,
    PHONE_MAX_LENGTH: 15,
    ADDRESS_MAX_LENGTH: 500,
    OCCUPATION_MAX_LENGTH: 100,
    WORKPLACE_MAX_LENGTH: 200,
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
  REPOSITORY_TOKEN: 'PARENT_REPOSITORY',

  // Cache Keys
  CACHE_KEYS: {
    PARENT_BY_ID: 'parent:id:',
    PARENT_BY_EMAIL: 'parent:email:',
    PARENTS_LIST: 'parents:list:',
    PARENT_CHILDREN: 'parent:children:',
  },

  // Cache TTL (Time to Live in seconds)
  CACHE_TTL: {
    PARENT_DETAILS: 300, // 5 minutes
    PARENTS_LIST: 180, // 3 minutes
    CHILDREN_LIST: 240, // 4 minutes
  },

  // Regex Patterns
  PATTERNS: {
    PHONE: /^[\+]?[1-9][\d]{9,14}$/,
    EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    CNIC: /^[0-9]{5}-[0-9]{7}-[0-9]$/,
  },

  // Gender Options
  GENDER: {
    MALE: 'male',
    FEMALE: 'female',
    OTHER: 'other',
  },

  // Relationship Types
  RELATIONSHIP_TYPE: {
    FATHER: 'father',
    MOTHER: 'mother',
    GUARDIAN: 'guardian',
    STEP_FATHER: 'step_father',
    STEP_MOTHER: 'step_mother',
    GRANDFATHER: 'grandfather',
    GRANDMOTHER: 'grandmother',
    UNCLE: 'uncle',
    AUNT: 'aunt',
    OTHER: 'other',
  },

  // Marital Status
  MARITAL_STATUS: {
    SINGLE: 'single',
    MARRIED: 'married',
    DIVORCED: 'divorced',
    WIDOWED: 'widowed',
    SEPARATED: 'separated',
  },

  // Education Level
  EDUCATION_LEVEL: {
    PRIMARY: 'primary',
    SECONDARY: 'secondary',
    INTERMEDIATE: 'intermediate',
    BACHELOR: 'bachelor',
    MASTER: 'master',
    DOCTORATE: 'doctorate',
    OTHER: 'other',
  },

  // Income Range
  INCOME_RANGE: {
    VERY_LOW: 'very_low',     // < 25,000
    LOW: 'low',               // 25,000 - 50,000
    MEDIUM: 'medium',         // 50,000 - 100,000
    HIGH: 'high',             // 100,000 - 200,000
    VERY_HIGH: 'very_high',   // > 200,000
  },

  // Communication Preferences
  COMMUNICATION_PREFERENCES: {
    EMAIL: 'email',
    SMS: 'sms',
    PHONE_CALL: 'phone_call',
    WHATSAPP: 'whatsapp',
    IN_PERSON: 'in_person',
  },

  // Parent Types
  PARENT_TYPE: {
    BIOLOGICAL: 'biological',
    ADOPTIVE: 'adoptive',
    STEP: 'step',
    GUARDIAN: 'guardian',
    FOSTER: 'foster',
  },
} as const;

export type ParentGender = typeof PARENT_CONSTANTS.GENDER[keyof typeof PARENT_CONSTANTS.GENDER];
export type ParentRelationshipType = typeof PARENT_CONSTANTS.RELATIONSHIP_TYPE[keyof typeof PARENT_CONSTANTS.RELATIONSHIP_TYPE];
export type ParentMaritalStatus = typeof PARENT_CONSTANTS.MARITAL_STATUS[keyof typeof PARENT_CONSTANTS.MARITAL_STATUS];
export type ParentEducationLevel = typeof PARENT_CONSTANTS.EDUCATION_LEVEL[keyof typeof PARENT_CONSTANTS.EDUCATION_LEVEL];
export type ParentIncomeRange = typeof PARENT_CONSTANTS.INCOME_RANGE[keyof typeof PARENT_CONSTANTS.INCOME_RANGE];
export type ParentCommunicationPreference = typeof PARENT_CONSTANTS.COMMUNICATION_PREFERENCES[keyof typeof PARENT_CONSTANTS.COMMUNICATION_PREFERENCES];
export type ParentType = typeof PARENT_CONSTANTS.PARENT_TYPE[keyof typeof PARENT_CONSTANTS.PARENT_TYPE];
