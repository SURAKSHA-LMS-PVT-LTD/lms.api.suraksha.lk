import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsEmail, 
  IsOptional, 
  IsEnum, 
  IsBoolean, 
  ValidateNested,
  IsNotEmpty,
  MaxLength,
  IsObject,
  ValidateIf,
  ArrayMinSize,
  IsArray
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { UserType } from '../enums/user-type.enum';
import { Gender } from '../enums/gender.enum';
import { Province } from '../enums/province.enum';
import { District } from '../enums/district.enum';
import { Country } from '../enums/country.enum';
import { BloodGroup } from '../../student/enums/blood-group.enum';
import { Occupation } from '../enums/occupation.enum';
import { Language } from '../enums/language.enum';
import { normalizeSriLankanPhone } from '../../../common/utils/phone-normalizer.util';

/**
 * 👤 Minimal User Data - For admin creating users with minimal info
 * Only requires ONE of: email OR phoneNumber
 */
export class MinimalUserDto {
  @ApiPropertyOptional({ 
    description: 'First name (can be added later)',
    example: 'Anura',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => value?.trim() || null)
  firstName?: string;

  @ApiPropertyOptional({ 
    description: 'Last name (can be added later)',
    example: 'Kumara',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => value?.trim() || null)
  lastName?: string;

  @ApiPropertyOptional({ 
    description: 'Name with initials (auto-generated if not provided)',
    example: 'A.K. Kumara',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim() || null)
  nameWithInitials?: string;

  @ApiPropertyOptional({ 
    description: 'Email address (required if phone not provided)',
    example: 'anura@example.com'
  })
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @Transform(({ value }) => value?.toLowerCase().trim() || null)
  email?: string;

  @ApiPropertyOptional({ 
    description: 'Phone number (required if email not provided, auto-normalized to +94XXXXXXXXX)',
    example: '+94771234567',
    maxLength: 15
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '' || value.trim() === '+94') return null;
    return normalizeSriLankanPhone(value);
  })
  phoneNumber?: string;

  @ApiPropertyOptional({ 
    description: 'Gender',
    enum: Gender
  })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ 
    description: 'Date of birth (YYYY-MM-DD)',
    example: '1990-05-15'
  })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ 
    description: 'NIC number (Sri Lankan)',
    example: '901234567V',
    maxLength: 12
  })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  nic?: string;

  @ApiPropertyOptional({ 
    description: 'Address line 1',
    maxLength: 200
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @ApiPropertyOptional({ 
    description: 'Address line 2',
    maxLength: 200
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @ApiPropertyOptional({ 
    description: 'City',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  @ApiPropertyOptional({ 
    description: 'District',
    enum: District
  })
  @IsOptional()
  @IsEnum(District)
  district?: District;

  @ApiPropertyOptional({ 
    description: 'Province',
    enum: Province
  })
  @IsOptional()
  @IsEnum(Province)
  province?: Province;

  @ApiPropertyOptional({ 
    description: 'Postal code',
    maxLength: 6
  })
  @IsOptional()
  @IsString()
  @MaxLength(6)
  postalCode?: string;

  @ApiPropertyOptional({ 
    description: 'Profile image URL (S3 path)',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageUrl?: string;

  @ApiPropertyOptional({ 
    description: 'Preferred language',
    enum: Language,
    default: Language.ENGLISH
  })
  @IsOptional()
  @IsEnum(Language)
  language?: Language;

  @ApiPropertyOptional({ 
    description: 'RFID card number for physical access',
    example: 'RFID-001-2026',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }) => value?.trim() || null)
  rfid?: string;

  @ApiPropertyOptional({ 
    description: 'Password (optional - if provided, user can login immediately)',
    minLength: 8
  })
  @IsOptional()
  @IsString()
  password?: string;
}

/**
 * 👨 Parent/Guardian User Data - Extended from minimal
 */
export class FamilyMemberUserDto extends MinimalUserDto {
  @ApiPropertyOptional({ 
    description: 'Occupation',
    enum: Occupation
  })
  @IsOptional()
  @IsEnum(Occupation)
  occupation?: Occupation;

  @ApiPropertyOptional({ 
    description: 'Workplace name',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  workplace?: string;

  @ApiPropertyOptional({ 
    description: 'Work phone number',
    maxLength: 15
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '' || value.trim() === '+94') return null;
    return normalizeSriLankanPhone(value);
  })
  workPhone?: string;

  @ApiPropertyOptional({ 
    description: 'Education level',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  educationLevel?: string;
}

/**
 * 👦 Student User Data - Extended from minimal with student-specific fields
 */
export class FamilyStudentDto extends MinimalUserDto {
  @ApiPropertyOptional({ 
    description: 'Student ID (auto-generated if not provided)',
    example: 'STU-2026-001',
    maxLength: 15
  })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Transform(({ value }) => value?.trim() || null)
  studentId?: string;

  @ApiPropertyOptional({ 
    description: 'Emergency contact phone number',
    maxLength: 15
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '' || value.trim() === '+94') return null;
    return normalizeSriLankanPhone(value);
  })
  emergencyContact?: string;

  @ApiPropertyOptional({ 
    description: 'Blood group',
    enum: BloodGroup
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    const str = String(value).trim().toUpperCase();
    const normalized = str
      .replace('A_POSITIVE', 'A+').replace('A_NEGATIVE', 'A-')
      .replace('B_POSITIVE', 'B+').replace('B_NEGATIVE', 'B-')
      .replace('O_POSITIVE', 'O+').replace('O_NEGATIVE', 'O-')
      .replace('AB_POSITIVE', 'AB+').replace('AB_NEGATIVE', 'AB-');
    const validGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
    return validGroups.includes(normalized) ? normalized : null;
  })
  bloodGroup?: BloodGroup;

  @ApiPropertyOptional({ 
    description: 'Medical conditions',
    example: 'Asthma'
  })
  @IsOptional()
  @IsString()
  medicalConditions?: string;

  @ApiPropertyOptional({ 
    description: 'Known allergies',
    example: 'Peanuts'
  })
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiPropertyOptional({ 
    description: 'Current school name',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  schoolName?: string;

  @ApiPropertyOptional({ 
    description: 'Current grade/class',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  grade?: string;
}

/**
 * � Subject Enrollment DTO - For enrolling in subjects within a class
 */
export class SubjectEnrollmentDto {
  @ApiProperty({ 
    description: 'Subject ID to enroll in',
    example: '301'
  })
  @IsString()
  @IsNotEmpty()
  subjectId: string;
}

/**
 * 📋 Class Enrollment DTO - For enrolling in classes with optional subjects
 */
export class ClassEnrollmentDto {
  @ApiProperty({ 
    description: 'Class ID to enroll in',
    example: '201'
  })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ 
    description: 'Subject enrollments within this class',
    type: [SubjectEnrollmentDto]
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SubjectEnrollmentDto)
  @IsArray()
  subjectEnrollments?: SubjectEnrollmentDto[];
}

/**
 * 🏫 Institute Enrollment DTO - For enrolling in institutes with classes and subjects
 * System admin created enrollments are automatically ACTIVE and verified
 */
export class InstituteEnrollmentDto {
  @ApiProperty({ 
    description: 'Institute ID to enroll in',
    example: '100'
  })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiPropertyOptional({ 
    description: 'Institute user type (default: STUDENT)',
    enum: ['STUDENT', 'TEACHER', 'PARENT', 'INSTITUTE_ADMIN', 'ATTENDANCE_MARKER'],
    default: 'STUDENT'
  })
  @IsOptional()
  @IsString()
  instituteUserType?: string;

  @ApiPropertyOptional({ 
    description: 'Institute-assigned user ID (e.g., admission number, index number)',
    example: 'RC-2026-001',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  userIdByInstitute?: string;

  @ApiPropertyOptional({ 
    description: 'Institute-specific user image URL (for ID card)',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instituteUserImageUrl?: string;

  @ApiPropertyOptional({ 
    description: 'Institute-specific card ID (e.g., library card, access card)',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  instituteCardId?: string;

  @ApiPropertyOptional({ 
    description: 'Class enrollments within this institute',
    type: [ClassEnrollmentDto]
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ClassEnrollmentDto)
  @IsArray()
  classEnrollments?: ClassEnrollmentDto[];
}

/**
 * 👨‍👩‍👧 Complete Family Unit Creation DTO
 * 
 * Creates a complete family unit in one API call:
 * - Student (required)
 * - Father (optional)
 * - Mother (optional)
 * - Guardian (optional - if different from parents)
 * 
 * Each member only needs ONE of: email OR phoneNumber
 * All other fields are optional and can be completed later
 * 
 * Can also enroll student in institutes with nested class/subject structure.
 * System admin created enrollments are automatically ACTIVE and verified.
 */
export class CreateFamilyUnitDto {
  @ApiProperty({ 
    description: '👦 Student information (REQUIRED)',
    type: FamilyStudentDto
  })
  @ValidateNested()
  @Type(() => FamilyStudentDto)
  @IsNotEmpty({ message: 'Student information is required' })
  student: FamilyStudentDto;

  @ApiPropertyOptional({ 
    description: '👨 Father information (optional)',
    type: FamilyMemberUserDto
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FamilyMemberUserDto)
  father?: FamilyMemberUserDto;

  @ApiPropertyOptional({ 
    description: '👩 Mother information (optional)',
    type: FamilyMemberUserDto
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FamilyMemberUserDto)
  mother?: FamilyMemberUserDto;

  @ApiPropertyOptional({ 
    description: '👤 Guardian information (optional - if different from parents)',
    type: FamilyMemberUserDto
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => FamilyMemberUserDto)
  guardian?: FamilyMemberUserDto;

  @ApiPropertyOptional({ 
    description: '📧 Send welcome email/SMS to all created users',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  sendWelcomeNotifications?: boolean;

  @ApiPropertyOptional({ 
    description: '🏫 Institute enrollments with nested class/subject structure. Auto-activated for system admin created users.',
    type: [InstituteEnrollmentDto]
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InstituteEnrollmentDto)
  @IsArray()
  instituteEnrollments?: InstituteEnrollmentDto[];

  @ApiPropertyOptional({ 
    description: '🔑 Auto-activate all enrollments (default: true for system admin)',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  autoActivateEnrollments?: boolean;

  // Legacy fields - kept for backward compatibility
  @ApiPropertyOptional({ 
    description: '🏫 (DEPRECATED) Use instituteEnrollments instead. Institute code to auto-enroll student',
    example: 'INST-20260122-001',
    deprecated: true
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  instituteCode?: string;

  @ApiPropertyOptional({ 
    description: '📚 (DEPRECATED) Use instituteEnrollments instead. Class ID to auto-enroll student',
    example: '40',
    deprecated: true
  })
  @IsOptional()
  @IsString()
  classId?: string;
}

/**
 * 📋 Bulk Family Creation DTO
 * Create multiple families at once
 */
export class BulkCreateFamilyDto {
  @ApiProperty({ 
    description: 'Array of family units to create',
    type: [CreateFamilyUnitDto]
  })
  @ValidateNested({ each: true })
  @Type(() => CreateFamilyUnitDto)
  @IsArray()
  @ArrayMinSize(1)
  families: CreateFamilyUnitDto[];

  @ApiPropertyOptional({ 
    description: 'Continue creating remaining families if one fails',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  continueOnError?: boolean;
}

/**
 * 📊 Family Creation Response DTO
 */
export class FamilyMemberResponseDto {
  @ApiProperty({ description: 'User ID', example: '123' })
  id: string;

  @ApiPropertyOptional({ description: 'First name' })
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  lastName?: string;

  @ApiPropertyOptional({ description: 'Name with initials' })
  nameWithInitials?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  email?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  phoneNumber?: string;

  @ApiProperty({ description: 'Profile completion status', enum: ['INCOMPLETE', 'BASIC', 'COMPLETE'] })
  profileCompletionStatus: string;

  @ApiProperty({ description: 'Profile completion percentage', example: 25 })
  profileCompletionPercentage: number;

  @ApiProperty({ description: 'Whether welcome message was sent' })
  welcomeMessageSent: boolean;

  @ApiPropertyOptional({ description: 'Student ID (for students only)' })
  studentId?: string;

  @ApiPropertyOptional({ description: 'First login URL (for incomplete profiles)' })
  firstLoginUrl?: string;
}

/**
 * 📚 Subject Enrollment Response
 */
export class SubjectEnrollmentResponseDto {
  @ApiProperty({ description: 'Subject ID' })
  subjectId: string;

  @ApiPropertyOptional({ description: 'Subject name' })
  subjectName?: string;

  @ApiProperty({ description: 'Enrollment is active' })
  isActive: boolean;

  @ApiProperty({ description: 'Enrollment method' })
  enrollmentMethod: string;
}

/**
 * 📋 Class Enrollment Response
 */
export class ClassEnrollmentResponseDto {
  @ApiProperty({ description: 'Class ID' })
  classId: string;

  @ApiPropertyOptional({ description: 'Class name' })
  className?: string;

  @ApiProperty({ description: 'Enrollment is active' })
  isActive: boolean;

  @ApiProperty({ description: 'Enrollment is verified' })
  isVerified: boolean;

  @ApiProperty({ description: 'Enrollment method' })
  enrollmentMethod: string;

  @ApiPropertyOptional({ description: 'Subject enrollments' })
  subjectEnrollments?: SubjectEnrollmentResponseDto[];
}

/**
 * 🏫 Institute Enrollment Response
 */
export class InstituteEnrollmentResponseDto {
  @ApiProperty({ description: 'Enrollment success' })
  success: boolean;

  @ApiPropertyOptional({ description: 'Institute ID' })
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Institute name' })
  instituteName?: string;

  @ApiPropertyOptional({ description: 'Institute user type' })
  instituteUserType?: string;

  @ApiPropertyOptional({ description: 'Status (ACTIVE for system admin created)' })
  status?: string;

  @ApiPropertyOptional({ description: 'Institute-assigned user ID' })
  userIdByInstitute?: string;

  @ApiPropertyOptional({ description: 'Class enrollments' })
  classEnrollments?: ClassEnrollmentResponseDto[];

  @ApiPropertyOptional({ description: 'Error message if failed' })
  message?: string;
}

export class CreateFamilyUnitResponseDto {
  @ApiProperty({ description: 'Overall success status' })
  success: boolean;

  @ApiProperty({ description: 'Human-readable message' })
  message: string;

  @ApiProperty({ description: 'Student user data', type: FamilyMemberResponseDto })
  student: FamilyMemberResponseDto;

  @ApiPropertyOptional({ description: 'Father user data (if created)', type: FamilyMemberResponseDto })
  father?: FamilyMemberResponseDto;

  @ApiPropertyOptional({ description: 'Mother user data (if created)', type: FamilyMemberResponseDto })
  mother?: FamilyMemberResponseDto;

  @ApiPropertyOptional({ description: 'Guardian user data (if created)', type: FamilyMemberResponseDto })
  guardian?: FamilyMemberResponseDto;

  @ApiPropertyOptional({ 
    description: 'Institute enrollments with nested class/subject results',
    type: [InstituteEnrollmentResponseDto]
  })
  instituteEnrollments?: InstituteEnrollmentResponseDto[];

  // Legacy field - kept for backward compatibility
  @ApiPropertyOptional({ description: '(DEPRECATED) Use instituteEnrollments instead' })
  instituteEnrollment?: {
    success: boolean;
    instituteId?: string;
    instituteName?: string;
    classId?: string;
    className?: string;
    message?: string;
  };

  @ApiProperty({ description: 'Total users created', example: 4 })
  totalUsersCreated: number;

  @ApiProperty({ description: 'Users with incomplete profiles (need first login)', example: 3 })
  incompleteProfiles: number;

  @ApiProperty({ description: 'Welcome notifications sent', example: 4 })
  notificationsSent: number;

  @ApiPropertyOptional({ description: 'Summary of enrollments' })
  enrollmentSummary?: {
    totalInstitutes: number;
    totalClasses: number;
    totalSubjects: number;
    allActive: boolean;
    allVerified: boolean;
  };
}

/**
 * 📊 Bulk Family Creation Response
 */
export class BulkCreateFamilyResponseDto {
  @ApiProperty({ description: 'Total families requested' })
  totalRequested: number;

  @ApiProperty({ description: 'Successfully created families' })
  successCount: number;

  @ApiProperty({ description: 'Failed family creations' })
  failedCount: number;

  @ApiProperty({ description: 'Individual family results', type: [CreateFamilyUnitResponseDto] })
  results: (CreateFamilyUnitResponseDto | { success: false; error: string; index: number })[];
}
