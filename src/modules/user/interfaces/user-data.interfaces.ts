/**
 * User Service Data Interfaces
 * 
 * These interfaces provide type safety for internal data structures
 * used within the User Service for creating and managing users.
 */

import { UserType } from '../enums/user-type.enum';
import { Gender } from '../enums/gender.enum';
import { Language } from '../enums/language.enum';

/**
 * Base user data structure used internally in user service
 */
export interface UserData {
  firstName: string;
  lastName: string;
  nameWithInitials?: string;
  email?: string;
  phoneNumber?: string;
  userType: UserType;
  dateOfBirth?: Date | string;
  gender?: Gender;
  nic?: string;
  birthCertificateNo?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string | any; // Can be string or District entity
  province?: string;
  postalCode?: string;
  country?: string;
  idUrl?: string;
  password?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  language?: Language | string;
  [key: string]: any; // Allow additional fields for flexibility
}

/**
 * Student-specific data structure
 */
export interface StudentData {
  studentId?: string;
  fatherId?: string;
  motherId?: string;
  guardianId?: string;
  fatherPhoneNumber?: string;
  motherPhoneNumber?: string;
  guardianPhoneNumber?: string;
  schoolName?: string;
  grade?: string;
  stream?: string;
  admissionDate?: Date;
  emergencyContact?: string;
  bloodGroup?: string;
  medicalConditions?: string;
  allergies?: string;
  previousSchool?: string;
  transferCertificateNo?: string;
  [key: string]: any; // Allow additional fields
}

/**
 * Parent-specific data structure
 */
export interface ParentData {
  parentId?: string;
  occupation?: string;
  workPlace?: string;
  workPhoneNumber?: string;
  emergencyContact?: string;
  relationship?: string;
  isGuardian?: boolean;
  [key: string]: any; // Allow additional fields
}

/**
 * Comprehensive user creation data (includes user + student/parent)
 */
export interface ComprehensiveUserData extends UserData {
  studentData?: StudentData;
  parentData?: ParentData;
}

/**
 * User access level for authorization checks
 */
export enum UserAccessLevel {
  SELF = 'SELF',
  CHILD = 'CHILD',
  INSTITUTE = 'INSTITUTE',
  SUPERADMIN = 'SUPERADMIN',
  ORGANIZATION = 'ORGANIZATION',
  NONE = 'NONE'
}

/**
 * User entity fetch result with access information
 */
export interface UserAccessResult {
  user: any; // UserEntity (avoiding circular dependency)
  hasAccess: boolean;
  role?: string;
  accessLevel?: UserAccessLevel;
}

/**
 * Comprehensive user creation response
 * Returned by createComprehensive method
 */
export interface ComprehensiveUserResponse {
  success: boolean;
  message: string;
  userId: string;
}

/**
 * Institute parent information for filtered queries
 */
export interface InstituteParentInfo {
  userId: string;
  firstName: string;
  lastName: string;
  nameWithInitials?: string;
  email?: string;
  phoneNumber?: string;
  userType: UserType;
  gender?: Gender;
  isActive: boolean;
  imageUrl?: string;
  // Parent-specific fields
  occupation?: string;
  workplace?: string;
  workPhone?: string;
  // Student relationship
  studentId?: string;
  studentFirstName?: string;
  studentLastName?: string;
  relationshipType?: string; // 'father', 'mother', 'guardian'
}
