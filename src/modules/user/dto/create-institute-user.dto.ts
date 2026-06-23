import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNotEmpty,
  IsObject,
  MaxLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserType } from '../enums/user-type.enum';
import { Gender } from '../enums/gender.enum';
import { Province } from '../enums/province.enum';
import { District } from '../enums/district.enum';
import { Language } from '../enums/language.enum';
import { BloodGroup } from '../../student/enums/blood-group.enum';
import { Occupation } from '../enums/occupation.enum';
import { InstituteUserType } from '../../institute_mudules/institue_user/enums/institute-user-type.enum';
import { normalizeSriLankanPhone } from '../../../common/utils/phone-normalizer.util';
import { CardDeliveryRecipient } from '../../user-card-management/enums/card-delivery-recipient.enum';

// ---------------------------------------------------------------------------
// Sub-DTOs for class / subject enrollment
// ---------------------------------------------------------------------------

export class InstAdminSubjectEnrollmentDto {
  @ApiProperty({ description: 'Subject ID to enroll in', example: '301' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;
}

export class InstAdminClassEnrollmentDto {
  @ApiProperty({ description: 'Class ID to enroll in', example: '201' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ description: 'Subject enrollments within this class', type: [InstAdminSubjectEnrollmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstAdminSubjectEnrollmentDto)
  subjectEnrollments?: InstAdminSubjectEnrollmentDto[];
}

// ---------------------------------------------------------------------------
// Student-specific sub-DTO
// ---------------------------------------------------------------------------

export class InstAdminStudentDataDto {
  @ApiPropertyOptional({ description: 'Student ID (auto-generated if omitted)', example: 'STU-2026-0001234', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }) => value?.trim() || null)
  studentId?: string;

  @ApiPropertyOptional({ description: 'Emergency contact phone (auto-normalized)', example: '+94771234567' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '' || value.trim() === '+94') return null;
    return normalizeSriLankanPhone(value);
  })
  emergencyContact?: string;

  @ApiPropertyOptional({ description: 'Blood group', enum: BloodGroup })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional({ description: 'Medical conditions' })
  @IsOptional()
  @IsString()
  medicalConditions?: string;

  @ApiPropertyOptional({ description: 'Known allergies' })
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiPropertyOptional({ 
    description: 'ID card delivery recipient — who should receive the physical ID card',
    enum: CardDeliveryRecipient,
    example: 'FATHER'
  })
  @IsOptional()
  @IsEnum(CardDeliveryRecipient, { message: 'Card delivery recipient must be one of: SELF, FATHER, MOTHER, GUARDIAN' })
  cardDeliveryRecipient?: CardDeliveryRecipient;
}

// ---------------------------------------------------------------------------
// Parent sub-DTO (minimal - reused for father/mother/guardian)
// ---------------------------------------------------------------------------

export class InstAdminParentDto {
  @ApiPropertyOptional({ description: 'First name', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => value?.trim() || null)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => value?.trim() || null)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Name with initials', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim() || null)
  nameWithInitials?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @Transform(({ value }) => value?.toLowerCase().trim() || null)
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number (auto-normalized to +94XXXXXXXXX)', maxLength: 15 })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '' || value.trim() === '+94') return null;
    return normalizeSriLankanPhone(value);
  })
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Date of birth (YYYY-MM-DD)', example: '1980-01-01' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender', enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ description: 'NIC number', maxLength: 12 })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  nic?: string;

  @ApiPropertyOptional({ description: 'Birth certificate number (optional for parents)', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  birthCertificateNo?: string;

  @ApiPropertyOptional({ description: 'Education level', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  educationLevel?: string;

  @ApiPropertyOptional({ description: 'Occupation', enum: Occupation })
  @IsOptional()
  @IsEnum(Occupation)
  occupation?: Occupation;

  @ApiPropertyOptional({ description: 'Workplace', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workplace?: string;

  @ApiPropertyOptional({ description: 'Address line 1', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @ApiPropertyOptional({ description: 'City', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  @ApiPropertyOptional({ description: 'District', enum: District })
  @IsOptional()
  @IsEnum(District)
  district?: District;

  @ApiPropertyOptional({ description: 'Province', enum: Province })
  @IsOptional()
  @IsEnum(Province)
  province?: Province;

  @ApiPropertyOptional({ description: 'Postal code', maxLength: 6 })
  @IsOptional()
  @IsString()
  @MaxLength(6)
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Password (optional - if omitted user must complete first-login)', minLength: 8 })
  @IsOptional()
  @IsString()
  password?: string;
}

// ---------------------------------------------------------------------------
// Main DTO
// ---------------------------------------------------------------------------

/**
 * 🏫 Create Institute User DTO
 *
 * Used by **institute admins** to create new users directly within their institute.
 *
 * Rules:
 * - At least ONE of email OR phoneNumber must be provided.
 * - `instituteUserType` determines the role (STUDENT / TEACHER / INSTITUTE_ADMIN / ATTENDANCE_MARKER).
 * - `instituteUserImageUrl` (institute-scoped image) is **auto-verified** — a `user_images`
 *   row is created with scope=INSTITUTE and status=VERIFIED.
 * - `globalImageUrl` (system-level image) is set to **PENDING** — a `user_images` row is
 *   created with scope=GLOBAL and status=PENDING.  System admin must approve before the
 *   image propagates to `user.imageUrl`.
 * - Until the global image is approved no physical ID card email is dispatched.
 * - Class & subject enrollments are only processed for STUDENT role.
 */
export class CreateInstituteUserDto {
  // ─── Basic identity ─────────────────────────────────────────────────────

  @ApiProperty({ description: 'First name', example: 'Kasun', maxLength: 50 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => value?.trim() || null)
  firstName: string;

  @ApiProperty({ description: 'Last name', example: 'Perera', maxLength: 50 })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => value?.trim() || null)
  lastName: string;

  @ApiPropertyOptional({ description: 'Name with initials (auto-generated if omitted)', example: 'K.B. Perera', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim() || null)
  nameWithInitials?: string;

  @ApiPropertyOptional({ description: 'Full name (auto-derived from firstName + lastName if omitted)', example: 'Kasun Bandara Perera', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Transform(({ value }) => value?.trim() || null)
  fullName?: string;

  @ApiPropertyOptional({ description: 'Religion', example: 'Buddhism', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim() || null)
  religion?: string;

  @ApiPropertyOptional({ description: 'Birth certificate number (required for students)', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => value?.trim() || null)
  birthCertificateNo?: string;

  @ApiPropertyOptional({ description: 'Email (required if phoneNumber not provided)', example: 'kasun@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @Transform(({ value }) => value?.toLowerCase().trim() || null)
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number (required if email not provided, auto-normalized to +94XXXXXXXXX)', example: '+94771234567' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '' || value.trim() === '+94') return null;
    return normalizeSriLankanPhone(value);
  })
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Gender', enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Date of birth (YYYY-MM-DD)', example: '2005-06-15' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'NIC number (Sri Lankan)', example: '200512345678', maxLength: 12 })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  nic?: string;

  @ApiPropertyOptional({ description: 'Address line 1', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @ApiPropertyOptional({ description: 'Address line 2', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @ApiPropertyOptional({ description: 'City', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  @ApiPropertyOptional({ description: 'District', enum: District })
  @IsOptional()
  @IsEnum(District)
  district?: District;

  @ApiPropertyOptional({ description: 'Province', enum: Province })
  @IsOptional()
  @IsEnum(Province)
  province?: Province;

  @ApiPropertyOptional({ description: 'Postal code', maxLength: 6 })
  @IsOptional()
  @IsString()
  @MaxLength(6)
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Preferred language', enum: Language, default: Language.ENGLISH })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @ApiPropertyOptional({
    description: 'Password (optional — if omitted the user must set a password via the first-login flow)',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  password?: string;

  // ─── Role within the institute ──────────────────────────────────────────

  @ApiProperty({
    description: 'Role in the institute. TEACHER / STUDENT / INSTITUTE_ADMIN / ATTENDANCE_MARKER',
    enum: [
      InstituteUserType.STUDENT,
      InstituteUserType.TEACHER,
      InstituteUserType.INSTITUTE_ADMIN,
      InstituteUserType.ATTENDANCE_MARKER,
    ],
    example: InstituteUserType.STUDENT,
  })
  @IsNotEmpty()
  @IsEnum(InstituteUserType)
  instituteUserType: InstituteUserType;

  // ─── Institute ID card / tracking ───────────────────────────────────────

  @ApiPropertyOptional({ description: 'Institute-assigned user ID / index number', example: 'RC-2026-001', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  userIdByInstitute?: string;

  @ApiPropertyOptional({ description: 'Institute card ID (access card, library card, etc.)', example: 'CARD-LIB-0042', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  instituteCardId?: string;

  // ─── Smart cards (requires 'smart-cards' feature) ─────────────────────────

  @ApiPropertyOptional({ description: 'Auto-assign the next available INSTITUTE smart card to this user.' })
  @IsOptional()
  @IsBoolean()
  autoAssignInstituteCard?: boolean;

  @ApiPropertyOptional({ description: 'Auto-assign the next available SURAKSHA (global) smart card to this user (written to user.rfid).' })
  @IsOptional()
  @IsBoolean()
  autoAssignSurakshaCard?: boolean;

  @ApiPropertyOptional({ description: 'Manual SURAKSHA (global) smart card value, validated against the institute pool.', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  surakshaCardId?: string;

  // ─── Images ─────────────────────────────────────────────────────────────

  /**
   * Institute-scoped image URL (obtained from the signed-upload endpoint).
   *
   * This image is **automatically verified** (scope=INSTITUTE, status=VERIFIED).
   * A `user_images` row is created and `institute_user.institute_user_image_url` is set.
   * Used for the institute ID card.
   */
  @ApiPropertyOptional({
    description:
      'Institute image URL (upload via /upload/generate-signed-url first). ' +
      'Automatically verified (INSTITUTE scope). Used for institute ID cards.',
    example: 'profile-images/1/1743000000000_photo.jpg',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim() || null)
  instituteUserImageUrl?: string;

  /**
   * Global / system-level image URL (obtained from the signed-upload endpoint).
   *
   * This image is saved as **PENDING** and requires **system admin approval** before
   * it becomes the user's active profile image (`user.imageUrl`).
   * Until approved, no physical ID card emails are dispatched.
   */
  @ApiPropertyOptional({
    description:
      'Global image URL (upload via /upload/generate-signed-url first). ' +
      'Requires SYSTEM ADMIN approval before being set as the active profile image. ' +
      'No ID card email is sent until the image is approved.',
    example: 'profile-images/1/1743000000001_photo.jpg',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim() || null)
  globalImageUrl?: string;

  // ─── Class & subject enrollment (STUDENT only) ──────────────────────────

  @ApiPropertyOptional({
    description: 'Class enrollments with optional subject enrollments. Only processed for STUDENT role.',
    type: [InstAdminClassEnrollmentDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InstAdminClassEnrollmentDto)
  @ValidateIf((o) => o.instituteUserType === InstituteUserType.STUDENT)
  classEnrollments?: InstAdminClassEnrollmentDto[];

  // ─── Student-specific ───────────────────────────────────────────────────

  @ApiPropertyOptional({
    description: 'Student-specific data (only processed for STUDENT role)',
    type: InstAdminStudentDataDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => InstAdminStudentDataDto)
  studentData?: InstAdminStudentDataDto;

  // ─── Family (only meaningful when role = STUDENT) ──────────────────────

  @ApiPropertyOptional({ description: "Father information (creates or reuses existing user)", type: InstAdminParentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InstAdminParentDto)
  father?: InstAdminParentDto;

  @ApiPropertyOptional({ description: "Mother information (creates or reuses existing user)", type: InstAdminParentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InstAdminParentDto)
  mother?: InstAdminParentDto;

  @ApiPropertyOptional({ description: "Guardian information (creates or reuses existing user)", type: InstAdminParentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InstAdminParentDto)
  guardian?: InstAdminParentDto;

  // ─── Misc ────────────────────────────────────────────────────────────────

  @ApiPropertyOptional({ description: 'Send welcome email/SMS to the created user', default: true })
  @IsOptional()
  @IsBoolean()
  sendWelcomeNotifications?: boolean;

  // ─── House enrollment ────────────────────────────────────────────────────

  @ApiPropertyOptional({
    description:
      'House ID to auto-enroll the user in upon creation. ' +
      'The house must belong to this institute. ' +
      'Sets the house_id on the institute_user record.',
    example: '5',
  })
  @IsOptional()
  @IsString()
  houseId?: string;

  @ApiPropertyOptional({
    description: 'Institute-defined custom key-value data stored on the institute_user record.',
    example: { studentId: 'S001', batch: '2025' },
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  extraData?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Response DTOs
// ---------------------------------------------------------------------------

export class InstituteUserCreationImageResultDto {
  @ApiProperty({ description: 'Image scope: GLOBAL or INSTITUTE' })
  scope: string;

  @ApiProperty({ description: 'Verification status' })
  status: string;

  @ApiPropertyOptional({ description: 'Full image URL' })
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Note if approval required' })
  note?: string;
}

export class CreateInstituteUserResponseDto {
  @ApiProperty({ description: 'Success flag' })
  success: boolean;

  @ApiProperty({ description: 'Result message' })
  message: string;

  @ApiProperty({ description: 'Created user ID' })
  userId: string;

  @ApiPropertyOptional({ description: 'First name of the created user' })
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name of the created user' })
  lastName?: string;

  @ApiPropertyOptional({ description: 'Name with initials' })
  nameWithInitials?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  phoneNumber?: string;

  @ApiProperty({ description: 'Role assigned in this institute' })
  instituteUserType: string;

  @ApiProperty({ description: 'Profile completion status' })
  profileCompletionStatus: string;

  @ApiProperty({ description: 'Profile completion percentage', example: 60 })
  profileCompletionPercentage: number;

  @ApiProperty({ description: 'Whether the user must complete their profile via first-login' })
  requiresFirstLogin: boolean;

  @ApiPropertyOptional({ description: 'First-login URL for incomplete profiles' })
  firstLoginUrl?: string;

  @ApiPropertyOptional({ description: 'Student ID (only for STUDENT role)' })
  studentId?: string;

  @ApiPropertyOptional({ description: 'Institute image details', type: InstituteUserCreationImageResultDto })
  instituteImage?: InstituteUserCreationImageResultDto;

  @ApiPropertyOptional({ description: 'Global image details', type: InstituteUserCreationImageResultDto })
  globalImage?: InstituteUserCreationImageResultDto;

  @ApiPropertyOptional({ description: 'Class enrollment results' })
  classEnrollments?: any[];

  @ApiPropertyOptional({ description: 'House ID the user was auto-enrolled in' })
  houseId?: string;

  @ApiPropertyOptional({ description: 'Whether the user was enrolled in a house' })
  houseEnrolled?: boolean;

  @ApiProperty({ description: 'Whether welcome notification was sent' })
  welcomeNotificationSent: boolean;

  @ApiPropertyOptional({
    description: 'Smart cards assigned to the user during creation (if requested).',
    type: 'array',
    items: { type: 'object', properties: { scope: { type: 'string' }, cardId: { type: 'string' }, cardName: { type: 'string' } } },
  })
  smartCards?: Array<{ scope: string; cardId: string; cardName: string }>;

  @ApiPropertyOptional({
    description: 'Card scopes whose pool was empty and skipped during self-registration (flagged for admin follow-up).',
    type: 'array',
    items: { type: 'string' },
  })
  cardPendingScopes?: string[];
}
