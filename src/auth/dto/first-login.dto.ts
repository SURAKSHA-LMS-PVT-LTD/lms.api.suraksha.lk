import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength, Matches, IsOptional, Length, MaxLength, IsUrl, IsEnum, IsBoolean } from 'class-validator';
import { IsStrongPassword, IsPasswordMatch } from '../../common/validators/password.validator';

export class InitiateFirstLoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: '6-digit OTP code',
    example: '123456'
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  otp: string;
}

// Enhanced OTP Verification with Complete Profile Data
export class EnhancedVerifyOtpDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: '6-digit OTP code',
    example: '123456'
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;

  // Profile completion data
  @ApiPropertyOptional({ 
    description: 'Phone number',
    example: '+94771234567'
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ 
    description: 'Date of birth (YYYY-MM-DD)',
    example: '1990-01-15'
  })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ 
    description: 'Gender',
    example: 'MALE'
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ 
    description: 'Address line 1',
    example: '123 Main Street'
  })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({ 
    description: 'Address line 2',
    example: 'Apt 4B'
  })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({ 
    description: 'City',
    example: 'Colombo'
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ 
    description: 'District',
    example: 'Colombo'
  })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ 
    description: 'Province',
    example: 'Western Province'
  })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ 
    description: 'Country',
    example: 'Sri Lanka'
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ 
    description: 'New password',
    example: 'SecurePass123!'
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({ 
    description: 'Profile image relative path from /upload/verify-and-publish',
    example: 'profile-images/user-uuid.jpg'
  })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  // Student-specific fields
  @ApiPropertyOptional({ 
    description: 'Student ID (for students)',
    example: 'STU123456'
  })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiPropertyOptional({ 
    description: 'Emergency contact (for students)',
    example: '+94771234567'
  })
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiPropertyOptional({ 
    description: 'Blood group (for students)',
    example: 'O+'
  })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  // Parent-specific fields
  @ApiPropertyOptional({ 
    description: 'Occupation (for parents)',
    example: 'Software Engineer'
  })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ 
    description: 'Workplace (for parents)',
    example: 'Tech Solutions Pvt Ltd'
  })
  @IsOptional()
  @IsString()
  workplace?: string;

  @ApiPropertyOptional({ 
    description: 'Education level (for parents)',
    example: 'Bachelor\'s Degree'
  })
  @IsOptional()
  @IsString()
  educationLevel?: string;
}

export class SetPasswordDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com'
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'OTP verification token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  @IsString()
  @IsNotEmpty()
  verificationToken: string;

  @ApiProperty({
    description: 'New password (8-20 characters, must contain uppercase, lowercase, number and special character)',
    example: 'NewPassword123!',
    minLength: 8,
    maxLength: 20
  })
  @IsString()
  @IsNotEmpty()
  @IsStrongPassword({ 
    message: 'Password must be 8-20 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)' 
  })
  password: string;

  @ApiProperty({
    description: 'Confirm password (must match password)',
    example: 'NewPassword123!'
  })
  @IsString()
  @IsNotEmpty()
  @IsPasswordMatch('password', { message: 'Password confirmation must match the password' })
  confirmPassword: string;

  @ApiProperty({
    description: 'Phone number (optional - can be added later in profile)',
    example: '+1234567890',
    required: false
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be a valid international format'
  })
  phoneNumber?: string;
}

export class FirstLoginResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'OTP sent successfully to your email'
  })
  message: string;

  @ApiProperty({
    description: 'Additional data',
    required: false
  })
  data?: any;
}

export class OtpVerificationResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'OTP verified successfully'
  })
  message: string;

  @ApiProperty({
    description: 'Verification token for password setup',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  verificationToken: string;

  @ApiProperty({
    description: 'Token expiry time in minutes',
    example: 15
  })
  expiresInMinutes: number;
}

export class PasswordSetupResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Password set successfully. You can now login.'
  })
  message: string;

  @ApiProperty({
    description: 'User information'
  })
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: string;
  };
}

export class CompleteUserDataDto {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'Email address' })
  email: string;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  lastName: string;

  @ApiProperty({ description: 'User type (STUDENT, PARENT, TEACHER, etc.)' })
  userType: string;

  @ApiProperty({ description: 'Phone number' })
  phoneNumber: string;

  @ApiProperty({ description: 'Date of birth' })
  dateOfBirth: string;

  @ApiProperty({ description: 'Gender' })
  gender: string;

  @ApiProperty({ description: 'Address line 1' })
  addressLine1: string;

  @ApiPropertyOptional({ description: 'Address line 2' })
  addressLine2?: string;

  @ApiProperty({ description: 'City' })
  city: string;

  @ApiProperty({ description: 'District' })
  district: string;

  @ApiProperty({ description: 'Province' })
  province: string;

  @ApiProperty({ description: 'Country' })
  country: string;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  imageUrl?: string;

  // Student-specific data (if user is student)
  @ApiPropertyOptional({ description: 'Student ID (if applicable)' })
  studentId?: string;

  @ApiPropertyOptional({ description: 'Emergency contact' })
  emergencyContact?: string;

  @ApiPropertyOptional({ description: 'Blood group' })
  bloodGroup?: string;

  // Parent-specific data (if user is parent)  
  @ApiPropertyOptional({ description: 'Occupation' })
  occupation?: string;

  @ApiPropertyOptional({ description: 'Workplace' })
  workplace?: string;

  @ApiPropertyOptional({ description: 'Education level' })
  educationLevel?: string;
}

// Enhanced OTP Verification Response with complete user data
export class EnhancedOtpCompleteVerificationResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'OTP verified and profile completed successfully.'
  })
  message: string;

  @ApiProperty({
    description: 'Simple JWT token containing only user ID',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  access_token: string;

  @ApiProperty({
    description: 'Complete updated user data'
  })
  user: CompleteUserDataDto;
}

export class MinimalUserDataDto {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'Email address' })
  email: string;

  @ApiProperty({ description: 'First name' })
  firstName: string;

  @ApiProperty({ description: 'Last name' })
  lastName: string;

  @ApiProperty({ description: 'User type (STUDENT, PARENT, TEACHER, etc.)' })
  userType: string;

  // Empty fields user can complete
  @ApiPropertyOptional({ description: 'Phone number (empty - to be filled)' })
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Date of birth (empty - to be filled)' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender (empty - to be filled)' })
  gender?: string;

  @ApiPropertyOptional({ description: 'Address line 1 (empty - to be filled)' })
  addressLine1?: string;

  @ApiPropertyOptional({ description: 'Address line 2 (empty - to be filled)' })
  addressLine2?: string;

  @ApiPropertyOptional({ description: 'City (empty - to be filled)' })
  city?: string;

  @ApiPropertyOptional({ description: 'District (empty - to be filled)' })
  district?: string;

  @ApiPropertyOptional({ description: 'Province (empty - to be filled)' })
  province?: string;

  @ApiPropertyOptional({ description: 'Country (empty - to be filled)' })
  country?: string;

  // Student-specific data (if user is student)
  @ApiPropertyOptional({ description: 'Student ID (if applicable)' })
  studentId?: string;

  @ApiPropertyOptional({ description: 'Emergency contact (empty - to be filled)' })
  emergencyContact?: string;

  @ApiPropertyOptional({ description: 'Blood group (empty - to be filled)' })
  bloodGroup?: string;

  // Parent-specific data (if user is parent)  
  @ApiPropertyOptional({ description: 'Occupation (empty - to be filled)' })
  occupation?: string;

  @ApiPropertyOptional({ description: 'Workplace (empty - to be filled)' })
  workplace?: string;

  @ApiPropertyOptional({ description: 'Education level (empty - to be filled)' })
  educationLevel?: string;
}

// Enhanced OTP Verification Response with minimal user data
export class EnhancedOtpVerificationResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'OTP verified successfully. Complete your profile.'
  })
  message: string;

  @ApiProperty({
    description: 'Simple JWT token containing only user ID',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
  access_token: string;

  @ApiProperty({
    description: 'Minimal user data for profile completion'
  })
  user: MinimalUserDataDto;
}

// Profile completion DTO for updating user information
export class CompleteProfileDto {
  @ApiPropertyOptional({ 
    description: 'Phone number',
    example: '+94771234567'
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ 
    description: 'Date of birth (YYYY-MM-DD)',
    example: '1990-01-15'
  })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ 
    description: 'Gender',
    example: 'MALE'
  })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ 
    description: 'Address line 1',
    example: '123 Main Street'
  })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({ 
    description: 'Address line 2',
    example: 'Apt 4B'
  })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({ 
    description: 'City',
    example: 'Colombo'
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ 
    description: 'District',
    example: 'Colombo'
  })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ 
    description: 'Province',
    example: 'Western Province'
  })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ 
    description: 'Country',
    example: 'Sri Lanka'
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ 
    description: 'New password (optional)',
    example: 'SecurePass123!'
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  // Student-specific fields
  @ApiPropertyOptional({ 
    description: 'Emergency contact (for students)',
    example: '+94771234567'
  })
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiPropertyOptional({ 
    description: 'Blood group (for students)',
    example: 'O+'
  })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  // Parent-specific fields (CompleteProfileDto)
  @ApiPropertyOptional({ description: 'Occupation (for parents)', example: 'Software Engineer' })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ description: 'Workplace (for parents)', example: 'Tech Solutions Pvt Ltd' })
  @IsOptional()
  @IsString()
  workplace?: string;

  @ApiPropertyOptional({ description: 'Education level (for parents)', example: 'Bachelor\'s Degree' })
  @IsOptional()
  @IsString()
  educationLevel?: string;
}

// ============================================================
// 📱 MULTI-IDENTIFIER FIRST LOGIN DTOs
// ============================================================

/**
 * Step 1: Unified initiation — user provides phone, email, or systemId.
 * Backend auto-detects the identifier type and finds the user.
 */
export class InitiateFirstLoginDto2 {
  @ApiProperty({
    description: 'User identifier — can be phone number, email address, system student ID, or UUID (user ID)',
    examples: ['0771234567', 'student@gmail.com', 'STU-0001', '123e4567-e89b-12d3-a456-426614174000']
  })
  @IsString()
  @IsNotEmpty()
  identifier: string;
}

/**
 * Step 2: Verify OTP — works for both phone SMS OTP and email OTP.
 * The channel field tells the backend which OTP channel to verify.
 */
export class VerifyFirstLoginOtpDto {
  @ApiProperty({ description: 'The identifier used to receive OTP (normalized phone or email)', example: '94771234567' })
  @IsString()
  @IsNotEmpty()
  identifier: string;

  @ApiProperty({ description: '6-digit OTP code', example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;

  @ApiProperty({ description: 'OTP channel', example: 'phone', enum: ['phone', 'email'] })
  @IsString()
  @IsNotEmpty()
  channel: 'phone' | 'email';
}

/**
 * Step 3 (in-flow): Request phone OTP verification during profile completion.
 * Used when user initiated via email/systemId and now needs to verify phone.
 */
export class InitiateFirstLoginByPhoneDto {
  @ApiProperty({ description: 'Phone number (Sri Lankan: 077X, 94X, +94X)', example: '0771234567' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}

/**
 * Verify phone OTP during first login.
 */
export class VerifyPhoneOtpFirstLoginDto {
  @ApiProperty({ description: 'Phone number used in initiation', example: '0771234567' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ description: '6-digit OTP code received via SMS', example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}

export class RequestEmailOtpFirstLoginDto {
  @ApiProperty({ description: 'Email address to verify', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class VerifyEmailOtpFirstLoginDto {
  @ApiProperty({ description: 'Email address being verified', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: '6-digit OTP code received via email', example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otpCode: string;
}

/**
 * Request phone OTP during profile completion (requires JWT).
 */
export class RequestPhoneOtpFirstLoginDto {
  @ApiProperty({ description: 'Phone number to verify (Sri Lankan format)', example: '0771234567' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}

/**
 * Verify phone OTP during profile completion (requires JWT).
 */
export class VerifyPhoneOtpInFlowDto {
  @ApiProperty({ description: 'Phone number being verified', example: '0771234567' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ description: '6-digit OTP code received via SMS', example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}

export class CompleteFirstLoginProfileDto {
  @ApiProperty({ description: 'First name', example: 'Sugath' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ description: 'Last name', example: 'Perera' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ description: 'New password (min 6 chars)', example: 'MyPassword123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: 'Confirm password', example: 'MyPassword123!' })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;

  @ApiPropertyOptional({ description: 'User type', example: 'USER', enum: ['USER', 'USER_WITHOUT_PARENT', 'USER_WITHOUT_STUDENT'] })
  @IsOptional()
  @IsString()
  userType?: string;

  @ApiPropertyOptional({ description: 'Name with initials', example: 'S. Perera' })
  @IsOptional()
  @IsString()
  nameWithInitials?: string;

  @ApiPropertyOptional({ description: 'Date of birth (YYYY-MM-DD)', example: '2005-03-15' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender', example: 'MALE', enum: ['MALE', 'FEMALE', 'OTHER'] })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'NIC number', example: '200512345678' })
  @IsOptional()
  @IsString()
  nic?: string;

  @ApiPropertyOptional({ description: 'Address line 1', example: '123 Main Street' })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({ description: 'Address line 2' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({ description: 'City', example: 'Colombo' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'District', example: 'COLOMBO' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ description: 'Province', example: 'WESTERN' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiPropertyOptional({ description: 'Country', example: 'SRI_LANKA' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Profile image URL (only if no existing image)' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Emergency contact (student)' })
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiPropertyOptional({ description: 'Medical conditions (student)' })
  @IsOptional()
  @IsString()
  medicalConditions?: string;

  @ApiPropertyOptional({ description: 'Allergies (student)' })
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiPropertyOptional({ description: 'Blood group (student)', enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-'] })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional({ description: 'Occupation (parent)' })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ description: 'Workplace (parent)' })
  @IsOptional()
  @IsString()
  workplace?: string;

  @ApiPropertyOptional({ description: 'Work phone (parent)' })
  @IsOptional()
  @IsString()
  workPhone?: string;

  @ApiPropertyOptional({ description: 'Education level (parent)' })
  @IsOptional()
  @IsString()
  educationLevel?: string;
}
