import { UserType } from '../../modules/user/enums/user-type.enum';

// ULTRA SIMPLE JWT payload - Only 3 essential fields
export interface JwtPayload {
  s: string;    // subject (user ID) - REQUIRED
  ut: string;   // user type (shortened: IA, TE, ST, PA, AM, SA, OM) - REQUIRED
  iat: number;  // issued at (created date) - REQUIRED
}

// User type mappings for ultra-compact tokens
export const USER_TYPE_COMPACT = {
  SUPER_ADMIN: 'SA',
  ORGANIZATION_MANAGER: 'OM',
  USER: 'U',
  USER_WITHOUT_PARENT: 'UWP',
  USER_WITHOUT_STUDENT: 'UWS'
} as const;

export const COMPACT_TO_USER_TYPE = {
  SA: 'SUPER_ADMIN',
  OM: 'ORGANIZATION_MANAGER',
  U: 'USER',
  UWP: 'USER_WITHOUT_PARENT',
  UWS: 'USER_WITHOUT_STUDENT'
} as const;

// ULTRA SIMPLE Login Response - Just token and basic user info
export interface LoginResponse {
  access_token: string;  // JWT with user ID, user type, and created date only
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: string;
  };
}

// Helper function to convert full user type to compact
export function toCompactUserType(userType: string): string {
  return USER_TYPE_COMPACT[userType as keyof typeof USER_TYPE_COMPACT] || userType;
}

// Helper function to convert compact user type to full
export function fromCompactUserType(compactType: string): UserType {
  const fullType = COMPACT_TO_USER_TYPE[compactType as keyof typeof COMPACT_TO_USER_TYPE] || compactType;
  return fullType as UserType;
}

// Helper function to create ultra-simple JWT payload
export function createOptimizedJwtPayload(userId: string, userType: string): JwtPayload {
  return {
    s: userId,
    ut: toCompactUserType(userType),
    iat: Math.floor(Date.now() / 1000)  // Current timestamp as created date
  };
}

// Helper function to extract user info from JWT payload
export function extractUserFromJwt(payload: JwtPayload): { userId: string; userType: string } {
  return {
    userId: payload.s,
    userType: fromCompactUserType(payload.ut)
  };
}
