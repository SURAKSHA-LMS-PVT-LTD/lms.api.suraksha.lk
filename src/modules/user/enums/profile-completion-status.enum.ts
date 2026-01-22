/**
 * Profile Completion Status
 * 
 * Indicates the level of profile completion for a user.
 * Used to determine if user can access full system features.
 */
export enum ProfileCompletionStatus {
  /**
   * INCOMPLETE - Minimal data provided (e.g., only phone or email)
   * User cannot login until they complete their profile
   * Typical for admin-created users
   */
  INCOMPLETE = 'INCOMPLETE',

  /**
   * BASIC - Basic required fields completed
   * User can login but with limited functionality
   * Has: name, email/phone, password set
   */
  BASIC = 'BASIC',

  /**
   * COMPLETE - Full profile completed
   * User has full access to system
   * Has: all personal info, verified contact, etc.
   */
  COMPLETE = 'COMPLETE'
}

/**
 * Profile completion requirements by status
 */
export const PROFILE_COMPLETION_REQUIREMENTS = {
  [ProfileCompletionStatus.INCOMPLETE]: {
    description: 'Profile not yet completed. User must complete registration.',
    canLogin: false,
    requiredFields: ['email OR phoneNumber'],
    missingFields: ['firstName', 'lastName', 'password']
  },
  [ProfileCompletionStatus.BASIC]: {
    description: 'Basic profile completed. Limited access until full completion.',
    canLogin: true,
    requiredFields: ['firstName', 'lastName', 'email OR phoneNumber', 'password'],
    missingFields: ['dateOfBirth', 'gender', 'address', 'verified contact']
  },
  [ProfileCompletionStatus.COMPLETE]: {
    description: 'Full profile completed. All features available.',
    canLogin: true,
    requiredFields: ['All basic + additional info + verified contact'],
    missingFields: []
  }
};

/**
 * Calculate profile completion percentage
 * @param user User entity with fields
 * @returns Completion percentage (0-100)
 */
export function calculateProfileCompletion(user: {
  firstName?: string;
  lastName?: string;
  nameWithInitials?: string;
  email?: string;
  phoneNumber?: string;
  password?: string;
  dateOfBirth?: Date;
  gender?: string;
  nic?: string;
  addressLine1?: string;
  city?: string;
  district?: string;
  province?: string;
  imageUrl?: string;
  isPhoneVerified?: boolean;
  isEmailVerified?: boolean;
}): number {
  let score = 0;
  const weights = {
    // Required fields (60%)
    firstName: 10,
    lastName: 10,
    email: 10,
    phoneNumber: 10,
    password: 10,
    nameWithInitials: 10,
    
    // Important fields (25%)
    dateOfBirth: 5,
    gender: 5,
    nic: 5,
    addressLine1: 5,
    city: 5,
    
    // Optional but valuable (15%)
    district: 3,
    province: 3,
    imageUrl: 3,
    isPhoneVerified: 3,
    isEmailVerified: 3
  };

  if (user.firstName) score += weights.firstName;
  if (user.lastName) score += weights.lastName;
  if (user.email) score += weights.email;
  if (user.phoneNumber) score += weights.phoneNumber;
  if (user.password) score += weights.password;
  if (user.nameWithInitials) score += weights.nameWithInitials;
  if (user.dateOfBirth) score += weights.dateOfBirth;
  if (user.gender) score += weights.gender;
  if (user.nic) score += weights.nic;
  if (user.addressLine1) score += weights.addressLine1;
  if (user.city) score += weights.city;
  if (user.district) score += weights.district;
  if (user.province) score += weights.province;
  if (user.imageUrl) score += weights.imageUrl;
  if (user.isPhoneVerified) score += weights.isPhoneVerified;
  if (user.isEmailVerified) score += weights.isEmailVerified;

  return score;
}

/**
 * Determine profile completion status based on score and required fields
 */
export function determineProfileStatus(user: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  password?: string;
  dateOfBirth?: Date;
  isPhoneVerified?: boolean;
  isEmailVerified?: boolean;
}): ProfileCompletionStatus {
  const hasContact = !!(user.email || user.phoneNumber);
  const hasBasicInfo = !!(user.firstName && user.lastName);
  const hasPassword = !!user.password;
  const hasVerifiedContact = !!(user.isPhoneVerified || user.isEmailVerified);

  // Must have at least email OR phone
  if (!hasContact) {
    return ProfileCompletionStatus.INCOMPLETE;
  }

  // Must have basic info and password for BASIC
  if (!hasBasicInfo || !hasPassword) {
    return ProfileCompletionStatus.INCOMPLETE;
  }

  // Must have verified contact and additional info for COMPLETE
  if (hasVerifiedContact && user.dateOfBirth) {
    return ProfileCompletionStatus.COMPLETE;
  }

  return ProfileCompletionStatus.BASIC;
}
