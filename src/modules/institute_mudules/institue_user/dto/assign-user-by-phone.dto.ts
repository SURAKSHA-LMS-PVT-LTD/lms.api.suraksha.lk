import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, Matches, IsOptional, IsIn, IsUrl, IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserType } from '../../../user/enums/user-type.enum';
import { InstituteUserType } from '../enums/institute-user-type.enum';
import { IsBigIntId } from '../../../../common/validators/bigint-id.validator';

/**
 * DTO for assigning a user to an institute by phone number
 * 
 * Requirements:
 * - User must exist with the provided phone number
 * - User must have type: USER, USER_WITHOUT_PARENT, or USER_WITHOUT_STUDENT
 * - instituteUserType is REQUIRED (must specify role in institute)
 * - USER/USER_WITHOUT_PARENT can be assigned to ANY role
 * - USER_WITHOUT_STUDENT can be assigned to any role EXCEPT STUDENT
 */
export class AssignUserByPhoneDto {
  @ApiProperty({ 
    description: 'Phone number of the user to assign (must be registered in system)', 
    example: '+94771234567' 
  })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { 
    message: 'Phone number must be a valid international format' 
  })
  phoneNumber: string;

  @ApiProperty({
    description: '**REQUIRED** - Institute role for this user. Options: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER. Note: USER_WITHOUT_STUDENT users cannot be assigned as STUDENT.',
    enum: InstituteUserType,
    example: InstituteUserType.STUDENT,
    required: true
  })
  @IsNotEmpty({ message: 'Institute user type is required. Must specify role: STUDENT, TEACHER, INSTITUTE_ADMIN, or ATTENDANCE_MARKER' })
  @IsEnum(InstituteUserType, { message: 'Invalid institute user type. Must be one of: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER' })
  @Transform(({ value }) => {
    // Handle form-data string values
    if (typeof value === 'string') {
      return value.trim().toUpperCase();
    }
    return value;
  })
  instituteUserType: InstituteUserType;

  @ApiProperty({
    description: 'Institute-specific user ID/number (like student ID, admission number, employee ID). Can contain letters and numbers.',
    example: 'STU2024001',
    required: false
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_\/\.]{1,50}$/, { 
    message: 'Institute user ID must be alphanumeric with allowed special characters (-, _, /, .) and max 50 characters' 
  })
  userIdByInstitute?: string;

  @ApiProperty({
    description: 'Institute-specific card ID/number for access control',
    example: 'CARD-2024-001',
    required: false
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_\/\.]{1,50}$/, { 
    message: 'Institute card ID must be alphanumeric with allowed special characters (-, _, /, .) and max 50 characters' 
  })
  instituteCardId?: string;

  @ApiProperty({
    description: 'Institute-specific user image relative path from /upload/verify-and-publish',
    example: 'institute-user-images/user-uuid.jpg',
    required: false
  })
  @IsOptional()
  @IsString()
  instituteImage?: string;

  @ApiProperty({
    description: 'Profile image relative path from /upload/verify-and-publish endpoint (stored as-is in database)',
    example: 'institute-user-images/user-123-uuid.jpg',
    required: false
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

/**
 * DTO for assigning a user to an institute by email address
 * 
 * Requirements:
 * - User must exist with the provided email
 * - User must have type: USER, USER_WITHOUT_PARENT, or USER_WITHOUT_STUDENT
 * - instituteUserType is REQUIRED (must specify role in institute)
 * - USER/USER_WITHOUT_PARENT can be assigned to ANY role
 * - USER_WITHOUT_STUDENT can be assigned to any role EXCEPT STUDENT
 */
export class AssignUserByEmailDto {
  @ApiProperty({ 
    description: 'Email address of the user to assign (must be registered in system)', 
    example: 'student@example.com' 
  })
  @IsNotEmpty({ message: 'Email address is required' })
  @IsString()
  @IsEmail({}, { message: 'Must be a valid email address' })
  email: string;

  @ApiProperty({
    description: '**REQUIRED** - Institute role for this user. Options: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER. Note: USER_WITHOUT_STUDENT users cannot be assigned as STUDENT.',
    enum: InstituteUserType,
    example: InstituteUserType.STUDENT,
    required: true
  })
  @IsNotEmpty({ message: 'Institute user type is required. Must specify role: STUDENT, TEACHER, INSTITUTE_ADMIN, or ATTENDANCE_MARKER' })
  @IsEnum(InstituteUserType, { message: 'Invalid institute user type. Must be one of: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER' })
  @Transform(({ value }) => {
    // Handle form-data string values
    if (typeof value === 'string') {
      return value.trim().toUpperCase();
    }
    return value;
  })
  instituteUserType: InstituteUserType;

  @ApiProperty({
    description: 'Institute-specific user ID/number (like student ID, admission number, employee ID). Can contain letters and numbers.',
    example: 'STU2024001',
    required: false
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_\/\.]{1,50}$/, { 
    message: 'Institute user ID must be alphanumeric with allowed special characters (-, _, /, .) and max 50 characters' 
  })
  userIdByInstitute?: string;

  @ApiProperty({
    description: 'Institute-specific card ID/number for access control',
    example: 'CARD-2024-001',
    required: false
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_\/\.]{1,50}$/, { 
    message: 'Institute card ID must be alphanumeric with allowed special characters (-, _, /, .) and max 50 characters' 
  })
  instituteCardId?: string;

  @ApiProperty({
    description: 'Institute-specific user image relative path from /upload/verify-and-publish',
    example: 'institute-user-images/user-uuid.jpg',
    required: false
  })
  @IsOptional()
  @IsString()
  instituteImage?: string;
}

/**
 * DTO for assigning a user to an institute by user ID
 * 
 * Requirements:
 * - User must exist with the provided ID
 * - User must have type: USER, USER_WITHOUT_PARENT, or USER_WITHOUT_STUDENT
 * - instituteUserType is REQUIRED (must specify role in institute)
 * - USER/USER_WITHOUT_PARENT can be assigned to ANY role
 * - USER_WITHOUT_STUDENT can be assigned to any role EXCEPT STUDENT
 */
export class AssignUserByIdDto {
  @ApiProperty({ 
    description: 'User ID to assign to institute (must be registered in system)', 
    example: '123' 
  })
  @IsNotEmpty({ message: 'User ID is required' })
  @IsBigIntId()
  userId: string;

  @ApiProperty({
    description: '**REQUIRED** - Institute role for this user. Options: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER. Note: USER_WITHOUT_STUDENT users cannot be assigned as STUDENT.',
    enum: InstituteUserType,
    example: InstituteUserType.STUDENT,
    required: true
  })
  @IsNotEmpty({ message: 'Institute user type is required. Must specify role: STUDENT, TEACHER, INSTITUTE_ADMIN, or ATTENDANCE_MARKER' })
  @IsEnum(InstituteUserType, { message: 'Invalid institute user type. Must be one of: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER' })
  @Transform(({ value }) => {
    // Handle form-data string values
    if (typeof value === 'string') {
      return value.trim().toUpperCase();
    }
    return value;
  })
  instituteUserType: InstituteUserType;

  @ApiProperty({
    description: 'Institute-specific user ID/number (like student ID, admission number, employee ID). Can contain letters and numbers.',
    example: 'STU2024001',
    required: false
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_\/\.]{1,50}$/, { 
    message: 'Institute user ID must be alphanumeric with allowed special characters (-, _, /, .) and max 50 characters' 
  })
  userIdByInstitute?: string;

  @ApiProperty({
    description: 'Institute-specific card ID/number for access control',
    example: 'CARD-2024-001',
    required: false
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_\/\.]{1,50}$/, { 
    message: 'Institute card ID must be alphanumeric with allowed special characters (-, _, /, .) and max 50 characters' 
  })
  instituteCardId?: string;

  @ApiProperty({
    description: 'Institute-specific user image relative path from /upload/verify-and-publish',
    example: 'institute-user-images/user-uuid.jpg',
    required: false
  })
  @IsOptional()
  @IsString()
  instituteImage?: string;
}

/**
 * DTO for assigning a parent to a student by phone number
 * 
 * Important Notes:
 * - Parents are NOT stored in institute_users table
 * - They are linked via students table (father_id, mother_id, guardian_id)
 * - User must have type: USER or USER_WITHOUT_STUDENT
 * - USER_WITHOUT_PARENT users CANNOT be assigned as parents
 * - Each student can have only ONE father, ONE mother, and ONE guardian
 */
export class AssignParentByPhoneDto {
  @ApiProperty({ 
    description: 'Phone number of the parent to assign (must be USER or USER_WITHOUT_STUDENT type)', 
    example: '+94771234567' 
  })
  @IsNotEmpty({ message: 'Parent phone number is required' })
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { 
    message: 'Phone number must be a valid international format' 
  })
  phoneNumber: string;

  @ApiProperty({
    description: '**REQUIRED** - Parent relationship type: father, mother, or guardian. Each student can have only ONE of each type.',
    example: 'father',
    enum: ['father', 'mother', 'guardian'],
    required: true
  })
  @IsNotEmpty({ message: 'Parent role is required. Must be one of: father, mother, guardian' })
  @IsString()
  @IsIn(['father', 'mother', 'guardian'], { message: 'Parent role must be one of: father, mother, guardian' })
  @Transform(({ value }) => {
    // Handle form-data string values - convert to lowercase for consistency
    if (typeof value === 'string') {
      return value.trim().toLowerCase();
    }
    return value;
  })
  parentRole: 'father' | 'mother' | 'guardian';

  @ApiProperty({
    description: 'Institute-specific parent ID/number. Can contain letters and numbers.',
    example: 'PAR2024001',
    required: false
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_\/\.]{1,50}$/, { 
    message: 'Institute parent ID must be alphanumeric with allowed special characters (-, _, /, .) and max 50 characters' 
  })
  userIdByInstitute?: string;
}

/**
 * DTO for assigning a user to an institute by RFID card
 * 
 * Requirements:
 * - User must exist with the provided RFID tag
 * - User must have type: USER, USER_WITHOUT_PARENT, or USER_WITHOUT_STUDENT
 * - instituteUserType is REQUIRED (must specify role in institute)
 * - Typically used for STUDENT role but can be any role
 * - USER_WITHOUT_STUDENT users cannot be assigned as STUDENT
 */
export class AssignStudentByRfidDto {
  @ApiProperty({ 
    description: 'RFID tag identifier of the user (must be registered in system)', 
    example: 'RFID123456789' 
  })
  @IsNotEmpty({ message: 'RFID is required' })
  @IsString()
  rfid: string;

  @ApiProperty({
    description: '**REQUIRED** - Institute role for this user. Options: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER. Note: USER_WITHOUT_STUDENT users cannot be assigned as STUDENT.',
    enum: InstituteUserType,
    example: InstituteUserType.STUDENT,
    required: true
  })
  @IsNotEmpty({ message: 'Institute user type is required. Must be one of: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER' })
  @IsEnum(InstituteUserType, { message: 'Invalid institute user type. Must be one of: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER' })
  @Transform(({ value }) => {
    // Handle form-data string values
    if (typeof value === 'string') {
      return value.trim().toUpperCase();
    }
    return value;
  })
  instituteUserType: InstituteUserType;

  @ApiProperty({
    description: 'Institute-specific student ID/number (like admission number, roll number). Can contain letters and numbers.',
    example: 'STU2024001',
    required: false
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_\/\.]{1,50}$/, { 
    message: 'Institute student ID must be alphanumeric with allowed special characters (-, _, /, .) and max 50 characters' 
  })
  userIdByInstitute?: string;

  @ApiProperty({
    description: 'Institute-specific card ID/number for access control',
    example: 'CARD-2024-001',
    required: false
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_\/\.]{1,50}$/, { 
    message: 'Institute card ID must be alphanumeric with allowed special characters (-, _, /, .) and max 50 characters' 
  })
  instituteCardId?: string;

  @ApiProperty({
    description: 'Institute-specific user image relative path from /upload/verify-and-publish',
    example: 'institute-user-images/user-uuid.jpg',
    required: false
  })
  @IsOptional()
  @IsString()
  instituteImage?: string;
}

/**
 * DTO for bulk assigning multiple users to an institute
 * 
 * Features:
 * - Assigns multiple users in one API call
 * - Each assignment includes phone number and instituteUserType
 * - Partial success: some users may succeed while others fail
 * - Returns detailed results for each assignment
 * - All validation rules apply to each user individually
 */
export class BulkAssignUsersDto {
  @ApiProperty({ 
    description: 'Array of user assignments. Each must include phoneNumber and instituteUserType.', 
    type: [AssignUserByPhoneDto],
    example: [
      { phoneNumber: '+94771234567', instituteUserType: 'STUDENT', userIdByInstitute: 'STU001' },
      { phoneNumber: '+94779876543', instituteUserType: 'TEACHER', userIdByInstitute: 'TEA001' }
    ]
  })
  @IsNotEmpty({ message: 'Assignments array is required and cannot be empty' })
  assignments: AssignUserByPhoneDto[];
}

export class AssignmentResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Assigned user ID' })
  userId?: string;

  @ApiProperty({ description: 'Institute ID' })
  instituteId?: string;

  @ApiProperty({ description: 'Institute-specific user ID assigned to the user' })
  userIdByInstitute?: string;
}

export class BulkAssignmentResponseDto {
  @ApiProperty({ description: 'Overall success status' })
  success: boolean;

  @ApiProperty({ description: 'Successfully assigned users' })
  successfulAssignments: AssignmentResponseDto[];

  @ApiProperty({ description: 'Failed assignments with error details' })
  failedAssignments: {
    phoneNumber: string;
    userType: string;
    error: string;
  }[];

  @ApiProperty({ description: 'Summary counts' })
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}
