import { UserType } from '../../modules/user/enums/user-type.enum';

/**
 * Ultra-compact class access - [classId, subjectBitMask?, hierarchy?]
 * Examples:
 * - ["1"] = class 1, all subjects
 * - ["1", 7] = class 1, subjects 1,2,3 (bitmask 111 = 7)
 * - ["1", 7, 2] = class 1, subjects 1,2,3, hierarchy level 2
 */
export type CompactClassAccess = [string] | [string, number] | [string, number, number];

/**
 * Ultra-compact institute access - [instituteId, roleBitMask, classes?]
 * Role bitmask: IA=8, TE=4, ST=2, AM=1
 * Examples:
 * - ["1", 12] = institute 1, roles IA+TE (8+4=12)
 * - ["1", 2, [["1"], ["2", 3]]] = institute 1, role ST, classes 1(all subjects) and 2(subjects 1,2)
 */
export interface EnhancedInstituteAccessEntry {
  i: string;        // instituteId (was instituteId)
  r: number;        // role bitmask (was roles[])
  c?: CompactClassAccess[];  // classes (was classes)
}

/**
 * Ultra-compact JWT payload used by /v2/auth/login.
 * 
 * - `s`: subject/user id
 * - `u`: user type (0=SA, 1=OM, 2=U, 3=UWP, 4=UWS) 
 * - `t`: timestamp (issued at)
 * - `i`: institute access array or global flag (999999)
 * - `c`: child student ids for parents
 * - `isApiKeyAuth`: true if authenticated via API key (optional)
 * - `authType`: 'API_KEY' if using API key authentication (optional)
 */
export interface EnhancedJwtPayload {
  s: string;
  u: number;        // user type as number (was ut)
  t: number;        // timestamp (was iat)
  i?: number | EnhancedInstituteAccessEntry[];  // institute access (was ia)
  c?: string[];     // children (was ca)
  isApiKeyAuth?: boolean;  // Flag for API key authentication
  authType?: 'API_KEY' | 'JWT';  // Authentication method
}

export interface EnhancedLoginResponse {
  access_token: string;
  payload: EnhancedJwtPayload;
  user: {
    id: string;
    email: string;
    nameWithInitials: string;
    userType: UserType;
    imageUrl?: string;
    firstLoginCompleted?: boolean;
  };
}

export const GLOBAL_INSTITUTE_ACCESS_FLAG = 999999;

// Role bitmasks for compact representation
export const ROLE_BITMASKS = {
  IA: 8,  // Institute Admin
  TE: 4,  // Teacher  
  ST: 2,  // Student
  AM: 1,  // Attendance Marker
} as const;

// User type mappings for ultra-compact representation
export const USER_TYPE_COMPACT = {
  SUPERADMIN: 0,
  ORGANIZATION_MANAGER: 1, 
  USER: 2,
  USER_WITHOUT_PARENT: 3,
  USER_WITHOUT_STUDENT: 4,
} as const;

export const COMPACT_TO_USER_TYPE = {
  0: 'SUPER_ADMIN',
  1: 'ORGANIZATION_MANAGER',
  2: 'USER', 
  3: 'USER_WITHOUT_PARENT',
  4: 'USER_WITHOUT_STUDENT',
} as const;
