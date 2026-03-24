import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsEmail, 
  IsOptional, 
  IsEnum, 
  IsBoolean, 
  Length, 
  IsUrl,
  IsDateString,
  ValidateNested,
  IsObject,
  ValidateIf,
  IsNotEmpty,
  IsPhoneNumber,
  MinLength,
  MaxLength,
  Matches
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';
import { UserType } from '../enums/user-type.enum';
import { Gender } from '../enums/gender.enum';
import { Province } from '../enums/province.enum';
import { District } from '../enums/district.enum';
import { Country } from '../enums/country.enum';
import { BloodGroup } from '../../student/enums/blood-group.enum';
import { Occupation } from '../enums/occupation.enum';
import { Language } from '../enums/language.enum';
import { IsDateOfBirth, TransformToYMDDate } from '../../../common/validators/date-format.validator';
import { IsOptionalNic } from '../../../common/validators/optional-nic.validator';
import { IsAllowedUserType } from '../../../common/validators/allowed-user-type.validator';
import { normalizeSriLankanPhone } from '../../../common/utils/phone-normalizer.util';
import { CardDeliveryRecipient } from '../../user-card-management/enums/card-delivery-recipient.enum';

/**
 * � Institute enrollment data
 * When provided, user is automatically enrolled to institute as STUDENT after creation
 * 
 * SECURITY: User type is LOCKED as STUDENT - cannot enroll as other types
 */
export class InstituteEnrollmentDto {
  @ApiProperty({ 
    description: '🏫 Institute code (auto-generated format: INST-YYYYMMDD-XXX). User will be enrolled as STUDENT ONLY.',
    example: 'INST-20260118-001',
    maxLength: 50
  })
  @IsNotEmpty({ message: 'Institute code is required for enrollment' })
  @IsString({ message: 'Institute code must be a string' })
  @MaxLength(50, { message: 'Institute code cannot exceed 50 characters' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string') return value;
    return value.trim();
  })
  instituteCode: string;
}

/**
 * �🎓 Student-specific data
 * Used when userType = USER or USER_WITHOUT_PARENT
 */
export class StudentDataDto {
  @ApiPropertyOptional({ 
    description: 'Student ID (optional, auto-generated if not provided, max 15 characters)',
    example: 'STU-2024-001',
    maxLength: 15
  })
  @IsOptional()
  @IsString({ message: 'Student ID must be a string' })
  @MaxLength(15, { message: 'Student ID cannot exceed 15 characters' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  studentId?: string;

  @ApiPropertyOptional({ 
    description: 'Emergency contact phone number (auto-normalized to +94XXXXXXXXX)',
    example: '+94771234567',
    maxLength: 15
  })
  @IsOptional()
  @IsString({ message: 'Emergency contact must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '' || value.trim() === '+94') return null;
    return normalizeSriLankanPhone(value);
  })
  emergencyContact?: string;

  @ApiPropertyOptional({ 
    description: 'Medical conditions (if any, TEXT field - no character limit)',
    example: 'Asthma, requires inhaler'
  })
  @IsOptional()
  @IsString({ message: 'Medical conditions must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  medicalConditions?: string;

  @ApiPropertyOptional({ 
    description: 'Known allergies (TEXT field - no character limit)',
    example: 'Peanuts, Penicillin'
  })
  @IsOptional()
  @IsString({ message: 'Allergies must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  allergies?: string;

  @ApiPropertyOptional({ 
    description: 'Blood group (accepts formats: A+, A-, B+, B-, O+, O-, AB+, AB-)',
    enum: BloodGroup,
    example: BloodGroup.O_POSITIVE
  })
  @IsOptional()
  @IsString({ message: 'Blood group must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    const str = String(value).trim().toUpperCase();
    // Normalize underscore format to symbol format: A_POSITIVE -> A+
    const normalized = str
      .replace('A_POSITIVE', 'A+')
      .replace('A_NEGATIVE', 'A-')
      .replace('B_POSITIVE', 'B+')
      .replace('B_NEGATIVE', 'B-')
      .replace('O_POSITIVE', 'O+')
      .replace('O_NEGATIVE', 'O-')
      .replace('AB_POSITIVE', 'AB+')
      .replace('AB_NEGATIVE', 'AB-');
    
    // Validate it's a valid blood group
    const validGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
    return validGroups.includes(normalized) ? normalized : null;
  })
  bloodGroup?: BloodGroup;

  @ApiPropertyOptional({ 
    description: 'Father user ID (link to existing parent)',
    example: 'b5e1e2f8-4a6b-4c1d-8e9f-3a2b1c4d5e6f'
  })
  @IsOptional()
  @IsString({ message: 'Father ID must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  fatherId?: string;

  @ApiPropertyOptional({ 
    description: 'Father phone number (system will fetch user by phone, auto-normalized)',
    example: '+94771234567'
  })
  @IsOptional()
  @IsString({ message: 'Father phone number must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '' || value.trim() === '+94') return null;
    return normalizeSriLankanPhone(value);
  })
  fatherPhoneNumber?: string;

  @ApiPropertyOptional({ 
    description: 'Mother user ID (link to existing parent)',
    example: 'c6f2f3g9-5b7c-5d2e-9f0g-4b3c2d5e6f7g'
  })
  @IsOptional()
  @IsString({ message: 'Mother ID must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  motherId?: string;

  @ApiPropertyOptional({ 
    description: 'Mother phone number (system will fetch user by phone, auto-normalized)',
    example: '+94777654321'
  })
  @IsOptional()
  @IsString({ message: 'Mother phone number must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '' || value.trim() === '+94') return null;
    return normalizeSriLankanPhone(value);
  })
  motherPhoneNumber?: string;

  @ApiPropertyOptional({ 
    description: 'Guardian user ID (link to existing parent)',
    example: 'd7g3g4h0-6c8d-6e3f-0g1h-5c4d3e6f7g8h'
  })
  @IsOptional()
  @IsString({ message: 'Guardian ID must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  guardianId?: string;

  @ApiPropertyOptional({ 
    description: 'Guardian phone number (system will fetch user by phone, auto-normalized)',
    example: '+94773333333'
  })
  @IsOptional()
  @IsString({ message: 'Guardian phone number must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '' || value.trim() === '+94') return null;
    return normalizeSriLankanPhone(value);
  })
  guardianPhoneNumber?: string;

  @ApiPropertyOptional({ 
    description: 'Reason why father information is skipped (TEXT field)',
    example: 'Father is deceased'
  })
  @IsOptional()
  @IsString({ message: 'Father skip reason must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  fatherSkipReason?: string;

  @ApiPropertyOptional({ 
    description: 'Reason why mother information is skipped (TEXT field)',
    example: 'Mother is not available'
  })
  @IsOptional()
  @IsString({ message: 'Mother skip reason must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  motherSkipReason?: string;

  @ApiPropertyOptional({ 
    description: 'Reason why guardian information is skipped (TEXT field)',
    example: 'No guardian assigned'
  })
  @IsOptional()
  @IsString({ message: 'Guardian skip reason must be a string' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  guardianSkipReason?: string;

  @ApiPropertyOptional({ 
    description: 'ID card delivery recipient — who should receive the physical ID card',
    enum: CardDeliveryRecipient,
    example: CardDeliveryRecipient.FATHER
  })
  @IsOptional()
  @IsEnum(CardDeliveryRecipient, { message: 'Card delivery recipient must be one of: SELF, FATHER, MOTHER, GUARDIAN' })
  cardDeliveryRecipient?: CardDeliveryRecipient;
}

/**
 * 👪 Parent-specific data
 * Used when userType = USER or USER_WITHOUT_STUDENT
 */
export class ParentDataDto {
  @ApiPropertyOptional({ 
    description: 'Parent occupation',
    enum: Occupation,
    example: Occupation.ENGINEER
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  @IsEnum(Occupation, {
    message: 'Invalid occupation. Must be one of the valid occupation types'
  })
  occupation?: Occupation;

  @ApiPropertyOptional({ 
    description: 'Workplace name (max 100 characters)',
    example: 'ABC Corporation',
    maxLength: 100
  })
  @IsOptional()
  @IsString({ message: 'Workplace must be a string' })
  @MaxLength(100, { message: 'Workplace cannot exceed 100 characters' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  workplace?: string;

  @ApiPropertyOptional({ 
    description: 'Work phone number (auto-normalized to +94XXXXXXXXX)',
    example: '+94112345678'
  })
  @IsOptional()
  @IsString({ message: 'Work phone must be a string' })
  @Transform(({ value }) => {
    if (!value || value.trim() === '' || value === '+94') return null;
    return normalizeSriLankanPhone(value);
  })
  workPhone?: string;

  @ApiPropertyOptional({ 
    description: 'Education level (max 100 characters)',
    example: 'Bachelor of Engineering',
    maxLength: 100
  })
  @IsOptional()
  @IsString({ message: 'Education level must be a string' })
  @MaxLength(100, { message: 'Education level cannot exceed 100 characters' })
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    return value.trim();
  })
  educationLevel?: string;
}

/**
 * 🚀 COMPREHENSIVE USER CREATION DTO
 * 
 * Creates user in multiple tables based on userType:
 * 
 * - USER: Creates in users + students + parents tables
 * - USER_WITHOUT_PARENT: Creates in users + students tables only
 * - USER_WITHOUT_STUDENT: Creates in users + parents tables only
 * - SUPER_ADMIN, ORGANIZATION_MANAGER: Creates in users table only
 */
export class CreateUserComprehensiveDto {
  // ============================================
  // USER BASE DATA (Required for all userTypes)
  // ============================================
  
  @ApiProperty({ 
    description: 'First name', 
    example: 'John',
    minLength: 1,
    maxLength: 50
  })
  @IsNotEmpty({ message: 'First name is required' })
  @IsString({ message: 'First name must be a string' })
  @Length(1, 50, { message: 'First name must be between 1 and 50 characters' })
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @ApiProperty({ 
    description: 'Last name (required)', 
    example: 'Doe',
    minLength: 1,
    maxLength: 50
  })
  @IsNotEmpty({ message: 'Last name is required' })
  @IsString({ message: 'Last name must be a string' })
  @Length(1, 50, { message: 'Last name must be between 1 and 50 characters' })
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @ApiProperty({ 
    description: 'Name with initials (required)', 
    example: 'J. Doe',
    minLength: 1,
    maxLength: 100
  })
  @IsNotEmpty({ message: 'Name with initials is required' })
  @IsString({ message: 'Name with initials must be a string' })
  @Length(1, 100, { message: 'Name with initials must be between 1 and 100 characters' })
  @Transform(({ value }) => value?.trim())
  nameWithInitials: string;

  @ApiProperty({ 
    description: 'Email address (optional for students if parent contact is provided, required for other user types)', 
    example: 'john.doe@example.com',
    maxLength: 60
  })
  @IsOptional()
  @ValidateIf(o => o.email && o.email.trim() !== '')
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => {
    if (!value || (typeof value === 'string' && value.trim() === '')) return null;
    return value.toLowerCase().trim();
  })
  email?: string;

  @ApiPropertyOptional({ 
    description: 'Phone number with country code (optional, auto-normalized to +94XXXXXXXXX format)', 
    example: '+94771234567',
    minLength: 10,
    maxLength: 15
  })
  @IsOptional()
  @IsString({ message: 'Phone number must be a string' })
  @Transform(({ value }) => {
    if (!value) return null;
    // Normalize to +94XXXXXXXXX format
    return normalizeSriLankanPhone(value);
  })
  phoneNumber?: string;

  @ApiProperty({ 
    description: 'User type - Only USER, USER_WITHOUT_PARENT, or USER_WITHOUT_STUDENT allowed. SUPERADMIN and ORGANIZATION_MANAGER cannot be created through this endpoint.',
    enum: [UserType.USER, UserType.USER_WITHOUT_PARENT, UserType.USER_WITHOUT_STUDENT],
    example: UserType.USER,
    enumName: 'UserType'
  })
  @IsNotEmpty({ message: 'User type is required' })
  @IsAllowedUserType({ 
    message: 'Invalid user type. Only USER, USER_WITHOUT_PARENT, USER_WITHOUT_STUDENT allowed for user creation. SUPERADMIN and ORGANIZATION_MANAGER cannot be created through this endpoint.'
  })
  userType: UserType;

  @ApiPropertyOptional({ 
    description: 'Date of birth (YYYY-MM-DD format)', 
    example: '1995-05-15'
  })
  @IsOptional()
  @IsDateOfBirth({ message: 'Date of birth must be in YYYY-MM-DD format and be a valid date' })
  @TransformToYMDDate()
  dateOfBirth?: Date;

  @ApiProperty({ 
    description: 'Gender', 
    enum: Gender,
    example: Gender.MALE
  })
  @IsNotEmpty({ message: 'Gender is required' })
  @IsEnum(Gender, { 
    message: 'Invalid gender. Must be one of: MALE, FEMALE, OTHER (uppercase required)'
  })
  gender: Gender;

  @ApiPropertyOptional({ 
    description: 'National Identity Card number (optional, max 12 characters)', 
    example: '199512345678',
    maxLength: 12
  })
  @IsOptional()
  @IsOptionalNic()
  @MaxLength(12, { message: 'NIC cannot exceed 12 characters' })
  @Transform(({ value }) => value?.trim())
  nic?: string;

  @ApiPropertyOptional({ 
    description: 'Birth certificate number (optional, max 50 characters)', 
    example: 'BC-123456789',
    maxLength: 50
  })
  @IsOptional()
  @IsString({ message: 'Birth certificate number must be a string' })
  @MaxLength(50, { message: 'Birth certificate number cannot exceed 50 characters' })
  @Transform(({ value }) => value?.trim())
  birthCertificateNo?: string;

  @ApiPropertyOptional({ 
    description: 'Address line 1 (max 200 characters) - Optional, not required', 
    example: '123 Main Street',
    maxLength: 200
  })
  @IsOptional()
  @IsString({ message: 'Address line 1 must be a string' })
  @MaxLength(200, { message: 'Address line 1 cannot exceed 200 characters' })
  @Transform(({ value }) => value?.trim())
  addressLine1?: string;

  @ApiPropertyOptional({ 
    description: 'Address line 2 (max 200 characters) - Optional, not required', 
    example: 'Apartment 4B',
    maxLength: 200
  })
  @IsOptional()
  @IsString({ message: 'Address line 2 must be a string' })
  @MaxLength(200, { message: 'Address line 2 cannot exceed 200 characters' })
  @Transform(({ value }) => value?.trim())
  addressLine2?: string;

  @ApiPropertyOptional({ 
    description: 'City', 
    example: 'Colombo'
  })
  @IsOptional()
  @IsString({ message: 'City must be a string' })
  @Length(1, 50, { message: 'City must be between 1 and 50 characters' })
  @Transform(({ value }) => value?.trim())
  city?: string;

  @ApiProperty({ 
    description: 'District (required)', 
    enum: District,
    example: District.COLOMBO
  })
  @IsNotEmpty({ message: 'District is required and cannot be empty' })
  @Transform(({ value }) => {
    if (!value || value.trim() === '') {
      throw new BadRequestException('District is required and cannot be empty');
    }
    return value;
  })
  @IsEnum(District, { 
    message: 'Invalid district. Must be one of: COLOMBO, GAMPAHA, KALUTARA, KANDY, MATALE, NUWARA_ELIYA, GALLE, MATARA, HAMBANTOTA, JAFFNA, KILINOCHCHI, MANNAR, MULLAITIVU, VAVUNIYA, TRINCOMALEE, BATTICALOA, AMPARA, KURUNEGALA, PUTTALAM, ANURADHAPURA, POLONNARUWA, BADULLA, MONARAGALA, RATNAPURA, KEGALLE (uppercase with underscores for spaces)'
  })
  district: District;

  @ApiProperty({ 
    description: 'Province (required)', 
    enum: Province,
    example: Province.WESTERN
  })
  @IsNotEmpty({ message: 'Province is required and cannot be empty' })
  @Transform(({ value }) => {
    if (!value || value.trim() === '') {
      throw new BadRequestException('Province is required and cannot be empty');
    }
    return value;
  })
  @IsEnum(Province, { 
    message: 'Invalid province. Must be one of: WESTERN, CENTRAL, SOUTHERN, NORTHERN, EASTERN, NORTH_WESTERN, NORTH_CENTRAL, UVA, SABARAGAMUWA (uppercase with underscores)'
  })
  province: Province;

  @ApiPropertyOptional({ 
    description: 'Postal code (Sri Lankan format, exactly 5 digits)', 
    example: '00100',
    pattern: '^[0-9]{5}$',
    minLength: 5,
    maxLength: 5
  })
  @IsOptional()
  @IsString({ message: 'Postal code must be a string' })
  @Length(5, 5, { message: 'Postal code must be exactly 5 digits' })
  @Matches(/^[0-9]{5}$/, { message: 'Postal code must be exactly 5 digits' })
  postalCode?: string;

  @ApiProperty({ 
    description: 'Country', 
    enum: Country,
    example: Country.SRI_LANKA
  })
  @IsNotEmpty({ message: 'Country is required' })
  @IsEnum(Country, { 
    message: 'Invalid country. Must be: "Sri Lanka" (exact match with space and capital letters required)'
  })
  country: Country;

  @ApiPropertyOptional({ 
    description: 'Preferred language for communication (S=Sinhala, E=English, T=Tamil)', 
    enum: Language,
    example: Language.ENGLISH,
    default: Language.ENGLISH
  })
  @IsOptional()
  @IsEnum(Language, { 
    message: 'Invalid language. Must be one of: S (Sinhala), E (English), T (Tamil)'
  })
  language?: Language;

  // ============================================
  // IMAGE & DOCUMENT HANDLING (JSON Support)
  // ============================================

  @ApiPropertyOptional({ 
    description: '🖼️ Profile image relative path from /upload/verify-and-publish (stored as-is in database)',
    example: 'profile-images/user-uuid.jpg'
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  imageUrl?: string;

  @ApiPropertyOptional({ 
    description: '📄 ID document relative path from /upload/verify-and-publish (stored as-is in database)',
    example: 'id-documents/user-id-uuid.pdf'
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  idUrl?: string;

  @ApiPropertyOptional({ 
    description: 'Account active status', 
    default: true
  })
  @IsOptional()
  @Transform(({ value }) => {
    // Handle string values from form-data
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
    }
    // Handle boolean values
    if (typeof value === 'boolean') return value;
    // Handle numeric values
    if (typeof value === 'number') return value !== 0;
    // Default to true if undefined/null
    if (value === undefined || value === null) return true;
    return Boolean(value);
  })
  @IsBoolean({ message: 'isActive must be a boolean value' })
  isActive?: boolean;

  @ApiPropertyOptional({ 
    description: '🏫 Institute ID (optional, used for SMS notifications)',
    example: '123'
  })
  @IsOptional()
  @IsString({ message: 'Institute ID must be a string' })
  instituteId?: string;

  // ============================================
  // STUDENT DATA (Required if userType = USER or USER_WITHOUT_PARENT)
  // ============================================
  
  @ApiPropertyOptional({ 
    description: '🎓 Student-specific data (REQUIRED if userType is USER or USER_WITHOUT_PARENT)',
    type: StudentDataDto
  })
  @ValidateIf(o => o.userType === UserType.USER || o.userType === UserType.USER_WITHOUT_PARENT)
  @IsNotEmpty({ 
    message: 'studentData is required when userType is USER or USER_WITHOUT_PARENT' 
  })
  @ValidateNested({ message: 'studentData must be a valid object' })
  @Type(() => StudentDataDto)
  @IsObject({ message: 'studentData must be an object' })
  studentData?: StudentDataDto;

  // ============================================
  // PARENT DATA (Required if userType = USER or USER_WITHOUT_STUDENT)
  // ============================================
  
  @ApiPropertyOptional({ 
    description: '👪 Parent-specific data (REQUIRED if userType is USER or USER_WITHOUT_STUDENT)',
    type: ParentDataDto
  })
  @ValidateIf(o => o.userType === UserType.USER || o.userType === UserType.USER_WITHOUT_STUDENT)
  @IsNotEmpty({ 
    message: 'parentData is required when userType is USER or USER_WITHOUT_STUDENT' 
  })
  @ValidateNested({ message: 'parentData must be a valid object' })
  @Type(() => ParentDataDto)
  @IsObject({ message: 'parentData must be an object' })
  parentData?: ParentDataDto;

  // ============================================
  // INSTITUTE ENROLLMENT (Optional - Auto-enrolls user as STUDENT)
  // ============================================
  
  @ApiPropertyOptional({ 
    description: '🏫 Institute enrollment data (OPTIONAL - If provided, user will be auto-enrolled as STUDENT)',
    type: InstituteEnrollmentDto
  })
  @IsOptional()
  @ValidateNested({ message: 'institute must be a valid object' })
  @Type(() => InstituteEnrollmentDto)
  @IsObject({ message: 'institute must be an object' })
  institute?: InstituteEnrollmentDto;
}
