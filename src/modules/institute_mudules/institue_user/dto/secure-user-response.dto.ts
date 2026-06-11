import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserType } from '../../../user/enums/user-type.enum';
import { Gender } from '../../../user/enums/gender.enum';
import { maskPhoneNumber, maskEmail } from '../../../../common/utils/phone-mask.util';
import { UserEntity } from '../../../user/entities/user.entity';
import { StudentEntity } from '../../../student/entities/student.entity';
import { ParentEntity } from '../../../parent/entities/parent.entity';
import { InstituteUserEntity } from '../entities/institue_user.entity';

// Interface for raw query results or partial data
interface UserLikeData {
  id?: string;
  user_id?: string;
  firstName?: string;
  lastName?: string;
  nameWithInitials?: string;
  first_name?: string;
  last_name?: string;
  name_with_initials?: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  phone_number?: string;
  addressLine1?: string;
  address_line1?: string;
  addressLine2?: string;
  address_line2?: string;
  imageUrl?: string;
  image_url?: string;
  gender?: Gender;
  dateOfBirth?: string | Date;
  date_of_birth?: string | Date;
}

interface StudentLikeData {
  fatherId?: string;
  father_id?: string;
  motherId?: string;
  mother_id?: string;
  guardianId?: string;
  guardian_id?: string;
  studentId?: string;
  student_id?: string;
  emergencyContact?: string;
  emergency_contact?: string;
  medicalConditions?: string;
  medical_conditions?: string;
  allergies?: string;
  studentType?: 'normal' | 'paid' | 'free_card';
  student_type?: 'normal' | 'paid' | 'free_card';
}

interface InstituteUserLikeData {
  status?: string;
  verifiedAt?: Date;
  verified_at?: Date;
  verifiedBy?: string;
  verified_by?: string;
  verifierName?: string;
  houseId?: string;
  house_id?: string;
  houseName?: string;
  house_name?: string;
}

/**
 * Secure user response DTO that only includes allowed fields for institute user endpoints
 * NEVER includes sensitive data like password, subscriptionPlan, paymentExpiresAt, idUrl, etc.
 * 
 * ✅ ENVIRONMENT-BASED MASKING: Respects IS_EMAILS_MASKED and IS_PHONENUMBERS_MASKED settings
 * - When IS_EMAILS_MASKED=true: Masks email addresses (e.g., j***@example.com)
 * - When IS_PHONENUMBERS_MASKED=true: Masks phone numbers (e.g., +94****567)
 * - Emergency contacts are NEVER masked for safety reasons
 */
export class SecureUserResponseDto {
  @ApiProperty({ example: '123', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'John Doe', description: 'Full name (firstName + lastName)' })
  name: string;

  @ApiProperty({ example: 'J. Doe', description: 'Name with initials (e.g. A.B. Perera)', required: false })
  nameWithInitials?: string;

  @ApiProperty({ example: 'john.doe@example.com', description: 'User email address (respects IS_EMAILS_MASKED env)' })
  email: string;

  @ApiProperty({ example: 'Line 1, Building Name', description: 'Address line 1' })
  addressLine1?: string;

  @ApiProperty({ example: 'Line 2, Street Name', description: 'Address line 2' })
  addressLine2?: string;

  @ApiProperty({ example: '+94****789', description: 'Phone number (respects IS_PHONENUMBERS_MASKED env)' })
  phoneNumber?: string;

  @ApiProperty({ example: 'https://example.com/profile.jpg', description: 'Profile image URL (institute image if exists, else global)' })
  imageUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/institute-profile.jpg', description: 'Institute-specific image URL (null if not set)' })
  instituteUserImageUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/global-profile.jpg', description: 'Global user image URL (null if not set)' })
  globalImageUrl?: string;

  @ApiProperty({ enum: Gender, description: 'Gender' })
  gender?: Gender;

  @ApiProperty({ example: '1990-01-15', description: 'Date of birth' })
  dateOfBirth?: string;

  @ApiProperty({ example: 'STU2024001', description: 'User ID assigned by institute' })
  userIdByInstitute?: string;

  @ApiProperty({ example: 'ACTIVE', description: 'Enrollment status in the institute' })
  status?: string;

  @ApiProperty({ example: '2024-08-18T10:30:00Z', description: 'Date when enrollment was verified' })
  verifiedAt?: Date;

  @ApiProperty({ example: 'Admin User', description: 'Name of the user who verified this enrollment' })
  verifiedBy?: string;

  @ApiPropertyOptional({ example: '12', description: 'Assigned house ID within the institute' })
  houseId?: string;

  @ApiPropertyOptional({ example: 'Blue House', description: 'Assigned house name within the institute' })
  houseName?: string;

  @ApiPropertyOptional({ example: { phone2: '0771234567', note: 'VIP student' }, description: 'Institute-defined custom key-value metadata' })
  extraData?: Record<string, any>;

  @ApiPropertyOptional({ example: 3, description: 'Max simultaneous active login sessions for this user' })
  maxDevicesPerUser?: number | null;

  constructor(user: UserEntity | UserLikeData, userIdByInstitute?: string, instituteUserData?: InstituteUserEntity | InstituteUserLikeData, maskSensitiveData: boolean = false) {
    // ✅ Handle both camelCase and snake_case field names from raw query results
    this.id = user.id || (user as any).user_id;

    // ✅ Fix "undefined undefined" issue by checking both naming conventions
    const firstName = user.firstName || (user as any).first_name || '';
    const lastName = user.lastName || (user as any).last_name || '';
    this.name = `${firstName} ${lastName}`.trim();
    this.nameWithInitials = (user as any).nameWithInitials || (user as any).name_with_initials || undefined;

    // ✅ Handle email from both naming conventions and apply masking if needed
    const email = user.email || (user as any).email || '';
    this.email = maskSensitiveData ? maskEmail(email) : email;

    // ✅ Handle address from both naming conventions
    this.addressLine1 = user.addressLine1 || (user as any).address_line1;
    this.addressLine2 = user.addressLine2 || (user as any).address_line2;

    // ✅ Handle phone from both naming conventions and apply masking
    const phoneNumber = user.phoneNumber || (user as any).phone_number;
    this.phoneNumber = maskSensitiveData ? maskPhoneNumber(phoneNumber) : phoneNumber;

    // ✅ CRITICAL FIX: Use imageUrl from instituteUserData if provided (priority logic applied in service)
    // Otherwise fall back to user imageUrl with both naming conventions
    this.imageUrl = (instituteUserData as any)?.imageUrl || user.imageUrl || (user as any).image_url || (user as any).user_image_url;

    // Expose both institute-level and global images separately so frontend can apply its own priority
    this.instituteUserImageUrl = (instituteUserData as any)?.instituteUserImageUrl || (user as any).institute_user_image_url || null;
    this.globalImageUrl = (instituteUserData as any)?.globalImageUrl || user.imageUrl || (user as any).image_url || (user as any).user_image_url || null;

    this.gender = user.gender;

    // ✅ Handle date of birth from both naming conventions
    const dateOfBirth = user.dateOfBirth || (user as any).date_of_birth;
    this.dateOfBirth = dateOfBirth instanceof Date ? dateOfBirth.toISOString().split('T')[0] : dateOfBirth;

    this.userIdByInstitute = userIdByInstitute;

    // ✅ Add enrollment verification information with proper field name handling
    if (instituteUserData) {
      this.status = instituteUserData.status;
      this.verifiedAt = instituteUserData.verifiedAt || (instituteUserData as any).verified_at;
      this.verifiedBy = instituteUserData.verifiedBy || (instituteUserData as any).verified_by || (instituteUserData as any).verifierName;
      this.houseId = (instituteUserData as any).houseId || (instituteUserData as any).house_id;
      this.houseName = (instituteUserData as any).houseName || (instituteUserData as any).house_name;
      // Parse extraData from JSON string if coming from raw query, or use object directly
      const rawExtra = (instituteUserData as any).extraData || (instituteUserData as any).extra_data;
      if (rawExtra) {
        this.extraData = typeof rawExtra === 'string' ? JSON.parse(rawExtra) : rawExtra;
      }
      this.maxDevicesPerUser = (instituteUserData as any).maxDevicesPerUser !== undefined ? (instituteUserData as any).maxDevicesPerUser : (instituteUserData as any).max_devices_per_user;
    }
  }
}

/**
 * Parent details within student response
 * ✅ Respects environment masking settings for email and phone
 * ✅ ENHANCEMENT: Added children array to show students when parent data is requested
 */
export class SecureParentDetailsDto {
  @ApiProperty({ example: '456', description: 'Parent user ID' })
  id?: string;

  @ApiProperty({ example: 'Robert Doe', description: 'Parent full name (firstName + lastName)' })
  name?: string;

  @ApiProperty({ example: 'R. Doe', description: 'Parent name with initials', required: false })
  nameWithInitials?: string;

  @ApiProperty({ example: 'robert.doe@example.com', description: 'Parent email address (respects IS_EMAILS_MASKED env)' })
  email?: string;

  @ApiProperty({ example: '+94****780', description: 'Parent phone number (respects IS_PHONENUMBERS_MASKED env)' })
  phoneNumber?: string;

  @ApiProperty({ example: 'https://example.com/parent-profile.jpg', description: 'Parent profile image URL' })
  imageUrl?: string;

  @ApiProperty({ example: 'Software Engineer', description: 'Parent occupation' })
  occupation?: string;

  @ApiProperty({ example: 'Tech Company Ltd', description: 'Parent workplace' })
  workPlace?: string;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        userId: { type: 'string', example: '789' },
        studentId: { type: 'string', example: 'STU2024001' },
        name: { type: 'string', example: 'Jane Doe' },
        email: { type: 'string', example: 'jane.doe@example.com' },
        phoneNumber: { type: 'string', example: '+94****123' },
        imageUrl: { type: 'string', example: 'https://example.com/student.jpg' },
        relationshipType: { type: 'string', example: 'father', enum: ['father', 'mother', 'guardian'] }
      }
    },
    description: 'List of children (students) associated with this parent'
  })
  children?: Array<{
    userId: string;
    studentId?: string;
    name: string;
    email?: string;
    phoneNumber?: string;
    imageUrl?: string;
    relationshipType: 'father' | 'mother' | 'guardian';
  }>;

  constructor(parent?: any, maskSensitiveData: boolean = false) {
    if (parent) {
      // ✅ Null-safe ID extraction
      this.id = parent.id || parent.user_id || parent.userId || undefined;

      // ✅ Null-safe name construction
      const firstName = parent.first_name || parent.firstName || '';
      const lastName = parent.last_name || parent.lastName || '';
      this.name = parent.name || (firstName || lastName ? `${firstName} ${lastName}`.trim() : undefined);
      this.nameWithInitials = parent.nameWithInitials || parent.name_with_initials || undefined;

      // ✅ Respect masking setting from environment variables with null safety
      // ✅ Return null instead of undefined so fields appear in JSON response
      this.email = parent.email ? (maskSensitiveData ? maskEmail(parent.email) : parent.email) : null;

      const phoneNumber = parent.phone_number || parent.phoneNumber;
      this.phoneNumber = phoneNumber ? (maskSensitiveData ? maskPhoneNumber(phoneNumber) : phoneNumber) : null;

      this.imageUrl = parent.image_url || parent.imageUrl || null;
      this.occupation = parent.occupation || null;
      this.workPlace = parent.workplace || parent.workPlace || null;
      this.children = parent.children || []; // ✅ Include children information
    }
  }
}

/**
 * Secure student response DTO with full parent information and medical details
 * ✅ OPTIMIZATION UPDATE: Now includes unmasked emails for all family members
 * ✅ ENHANCEMENT UPDATE: Added medical and emergency information for students
 */
export class SecureStudentResponseDto extends SecureUserResponseDto {
  @ApiProperty({ type: SecureParentDetailsDto, description: 'Father details' })
  father?: SecureParentDetailsDto;

  @ApiProperty({ type: SecureParentDetailsDto, description: 'Mother details' })
  mother?: SecureParentDetailsDto;

  @ApiProperty({ type: SecureParentDetailsDto, description: 'Guardian details' })
  guardian?: SecureParentDetailsDto;

  // Medical and Emergency Information
  @ApiProperty({ example: '+94771234567', description: 'Emergency contact phone number (always unmasked for safety)' })
  emergencyContact?: string;

  @ApiProperty({ example: 'Asthma, requires inhaler', description: 'Medical conditions and special needs' })
  medicalConditions?: string;

  @ApiProperty({ example: 'Peanuts, Shellfish', description: 'Known allergies' })
  allergies?: string;

  @ApiProperty({ example: 'BC2024001234', description: 'Birth certificate number or student ID' })
  studentId?: string;

  @ApiProperty({ example: 'free_card', enum: ['normal', 'paid', 'free_card'], description: 'Enrollment type at class level' })
  studentType?: 'normal' | 'paid' | 'free_card';

  // Keep legacy fields for backward compatibility
  @ApiProperty({ example: '456', description: 'Father user ID (legacy)' })
  fatherId?: string;

  @ApiProperty({ example: '789', description: 'Mother user ID (legacy)' })
  motherId?: string;

  @ApiProperty({ example: '101', description: 'Guardian user ID (legacy)' })
  guardianId?: string;

  constructor(user: UserEntity | UserLikeData, student?: StudentEntity | StudentLikeData, userIdByInstitute?: string, parentDetails?: any, instituteUserData?: InstituteUserEntity | InstituteUserLikeData, maskSensitiveData: boolean = false) {
    super(user, userIdByInstitute, instituteUserData, maskSensitiveData);

    if (student) {
      // ✅ Handle both camelCase and snake_case for legacy fields with null safety
      this.fatherId = student.fatherId || (student as any).father_id || undefined;
      this.motherId = student.motherId || (student as any).mother_id || undefined;
      this.guardianId = student.guardianId || (student as any).guardian_id || undefined;

      // ✅ Medical and Emergency Information with both naming conventions and null safety
      this.emergencyContact = student.emergencyContact || (student as any).emergency_contact || undefined;
      this.medicalConditions = student.medicalConditions || (student as any).medical_conditions || undefined;
      this.allergies = student.allergies || (student as any).allergies || undefined;
      this.studentId = student.studentId || (student as any).student_id || undefined;
      this.studentType = (student as any).studentType || (student as any).student_type || 'normal';
    }

    // ✅ Full parent details with unmasked emails for admin access and null safety
    if (parentDetails) {
      this.father = parentDetails.father ? new SecureParentDetailsDto(parentDetails.father, maskSensitiveData) : undefined;
      this.mother = parentDetails.mother ? new SecureParentDetailsDto(parentDetails.mother, maskSensitiveData) : undefined;
      this.guardian = parentDetails.guardian ? new SecureParentDetailsDto(parentDetails.guardian, maskSensitiveData) : undefined;
    }
  }
}

/**
 * Secure parent response DTO with professional information
 * ✅ OPTIMIZATION UPDATE: Now includes unmasked email for admin users
 */
export class SecureParentResponseDto extends SecureUserResponseDto {
  @ApiProperty({ example: 'Software Engineer', description: 'Occupation' })
  occupation?: string;

  @ApiProperty({ example: 'Tech Company Ltd', description: 'Workplace' })
  workPlace?: string;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        userId: { type: 'string', example: '789' },
        studentId: { type: 'string', example: 'STU2024001' },
        name: { type: 'string', example: 'Jane Doe' },
        email: { type: 'string', example: 'jane.doe@example.com' },
        phoneNumber: { type: 'string', example: '+94****123' },
        imageUrl: { type: 'string', example: 'https://example.com/student.jpg' },
        relationshipType: { type: 'string', example: 'father', enum: ['father', 'mother', 'guardian'] }
      }
    },
    description: 'List of children (students) associated with this parent (only included when students=true)',
    required: false
  })
  children?: Array<{
    userId: string;
    studentId?: string;
    name: string;
    email?: string;
    phoneNumber?: string;
    imageUrl?: string;
    relationshipType: 'father' | 'mother' | 'guardian';
  }>;

  constructor(user: UserEntity | UserLikeData, parent?: ParentEntity | any, userIdByInstitute?: string, instituteUserData?: InstituteUserEntity | InstituteUserLikeData, maskSensitiveData: boolean = false) {
    super(user, userIdByInstitute, instituteUserData, maskSensitiveData);

    if (parent) {
      // ✅ Handle both naming conventions: workplace and workPlace
      this.occupation = parent.occupation;
      this.workPlace = parent.workplace || parent.workPlace;
      // ✅ Include children if provided
      this.children = parent.children || undefined;
    }
  }
}

/**
 * Paginated response for secure user data
 */
export class PaginatedSecureUserResponseDto {
  @ApiProperty({ type: [SecureUserResponseDto] })
  data: SecureUserResponseDto[];

  @ApiProperty({
    type: 'object',
    properties: {
      total: { type: 'number', example: 100 },
      page: { type: 'number', example: 1 },
      limit: { type: 'number', example: 10 },
      totalPages: { type: 'number', example: 10 }
    }
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
