import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsNotEmpty, 
  IsString, 
  IsEnum, 
  IsOptional, 
  IsEmail,
  Matches,
  ValidateIf,
  IsBoolean
} from 'class-validator';
import { InstituteUserType } from '../enums/institute-user-type.enum';
import { InstituteUserStatus } from '../enums/institute-user-status.enum';
import { Type } from 'class-transformer';

/**
 * Enhanced DTO for assigning a user to an institute
 * 
 * Supports 4 identification methods:
 * 1. User ID (system-wide unique ID)
 * 2. RFID (physical card/tag identifier)
 * 3. Phone Number (registered phone)
 * 4. Email (registered email)
 * 
 * Features:
 * - One of the 4 identifiers MUST be provided
 * - Optional image upload during assignment
 * - Auto-verification of uploaded images
 * - Institute-specific user ID and card ID
 * - Required institute user type (STUDENT, TEACHER, ADMIN, etc.)
 * - Optional status (defaults to PENDING)
 */
export class EnhancedAssignUserToInstituteDto {
  // =================== USER IDENTIFICATION (ONE REQUIRED) ===================
  
  @ApiPropertyOptional({
    description: 'User ID (system-wide unique identifier). Provide ONE of: userId, rfid, phoneNumber, or email',
    example: '123',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: 'RFID card/tag identifier. Provide ONE of: userId, rfid, phoneNumber, or email',
    example: 'RFID-ABC-123456',
  })
  @IsOptional()
  @IsString()
  rfid?: string;

  @ApiPropertyOptional({
    description: 'Phone number (international format). Provide ONE of: userId, rfid, phoneNumber, or email',
    example: '+94771234567',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, { 
    message: 'Phone number must be in valid international format (e.g., +94771234567)' 
  })
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Email address. Provide ONE of: userId, rfid, phoneNumber, or email',
    example: 'john.doe@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email?: string;

  // =================== INSTITUTE INFORMATION (REQUIRED) ===================

  @ApiProperty({
    description: 'Institute-specific user ID/number (e.g., student admission number, employee ID)',
    example: 'STU-2024-001',
    required: false
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_\/\.]{1,100}$/, {
    message: 'Institute user ID must be alphanumeric with special characters (-, _, /, .) max 100 characters'
  })
  instituteUserId?: string;

  @ApiPropertyOptional({
    description: 'Institute-specific card ID for access control (e.g., access card number)',
    example: 'CARD-2024-001',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9\-_\/\.]{1,100}$/, {
    message: 'Institute card ID must be alphanumeric with special characters (-, _, /, .) max 100 characters'
  })
  instituteCardId?: string;

  @ApiProperty({
    description: 'Institute role/type for this user. Cannot be PARENT (parents are assigned differently)',
    enum: InstituteUserType,
    example: InstituteUserType.STUDENT,
    required: true
  })
  @IsNotEmpty({ message: 'Institute user type is required. Must be one of: STUDENT, TEACHER, INSTITUTE_ADMIN, ATTENDANCE_MARKER' })
  @IsEnum(InstituteUserType, {
    message: 'Invalid institute user type. Must be: STUDENT, TEACHER, INSTITUTE_ADMIN, or ATTENDANCE_MARKER'
  })
  instituteUserType: InstituteUserType;

  @ApiPropertyOptional({
    description: 'Status of user in institute',
    enum: InstituteUserStatus,
    default: InstituteUserStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(InstituteUserStatus, {
    message: 'Invalid status. Must be: ACTIVE, INACTIVE, PENDING, SUSPENDED, or REJECTED'
  })
  status?: InstituteUserStatus;

  // =================== IMAGE UPLOAD (OPTIONAL) ===================

  @ApiPropertyOptional({
    description: 'If true and image is provided, the image will be automatically verified by the assigning user',
    example: true,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  autoVerifyImage?: boolean;
}

/**
 * Response DTO for enhanced user assignment
 */
export class EnhancedAssignmentResponseDto {
  @ApiProperty({ 
    description: 'Success status',
    example: true 
  })
  success: boolean;

  @ApiProperty({ 
    description: 'Response message',
    example: 'User successfully assigned to institute' 
  })
  message: string;

  @ApiProperty({ 
    description: 'Assigned user details',
    type: 'object',
    properties: {
      userId: { type: 'string', example: '123' },
      userName: { type: 'string', example: 'John Doe' },
      nameWithInitials: { type: 'string', example: 'J. Doe' },
      userType: { type: 'string', example: 'USER' },
      identifier: { type: 'string', example: 'phone: +94771234567' }
    }
  })
  user: {
    userId: string;
    userName: string;
    nameWithInitials?: string;
    userType: string;
    identifier: string; // Shows which identifier was used
  };

  @ApiProperty({ 
    description: 'Institute assignment details',
    type: 'object',
    properties: {
      instituteId: { type: 'string', example: '1' },
      instituteUserId: { type: 'string', example: 'STU-2024-001' },
      instituteCardId: { type: 'string', example: 'CARD-2024-001' },
      instituteUserType: { type: 'string', example: 'STUDENT' },
      status: { type: 'string', example: 'PENDING' }
    }
  })
  assignment: {
    instituteId: string;
    instituteUserId?: string;
    instituteCardId?: string;
    instituteUserType: InstituteUserType;
    status: InstituteUserStatus;
  };

  @ApiPropertyOptional({
    description: 'Image upload details (if image was uploaded)',
    type: 'object',
    properties: {
      imageUrl: { type: 'string', example: 'https://storage.googleapis.com/...' },
      isVerified: { type: 'boolean', example: true },
      verifiedBy: { type: 'string', example: '456' },
      verifiedAt: { type: 'string', example: '2025-01-19T10:30:00Z' }
    }
  })
  imageInfo?: {
    imageUrl: string;
    isVerified: boolean;
    verifiedBy?: string;
    verifiedAt?: Date;
  };
}

/**
 * DTO for bulk assignment with enhanced features
 */
export class BulkEnhancedAssignDto {
  @ApiProperty({
    description: 'Array of user assignments',
    type: [EnhancedAssignUserToInstituteDto],
    example: [
      {
        phoneNumber: '+94771234567',
        instituteUserId: 'STU-001',
        instituteUserType: 'STUDENT',
        status: 'ACTIVE'
      },
      {
        email: 'teacher@example.com',
        instituteUserId: 'TEA-001',
        instituteUserType: 'TEACHER',
        status: 'ACTIVE'
      }
    ]
  })
  @IsNotEmpty({ message: 'Assignments array is required and cannot be empty' })
  assignments: EnhancedAssignUserToInstituteDto[];
}

/**
 * Response for bulk assignment operations
 */
export class BulkEnhancedAssignmentResponseDto {
  @ApiProperty({ 
    description: 'Overall success status',
    example: true 
  })
  success: boolean;

  @ApiProperty({ 
    description: 'Successfully assigned users',
    type: [EnhancedAssignmentResponseDto]
  })
  successfulAssignments: EnhancedAssignmentResponseDto[];

  @ApiProperty({
    description: 'Failed assignments with error details',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        identifier: { type: 'string', example: 'phone: +94771234567' },
        instituteUserType: { type: 'string', example: 'STUDENT' },
        error: { type: 'string', example: 'User not found' }
      }
    }
  })
  failedAssignments: {
    identifier: string;
    instituteUserType: string;
    error: string;
  }[];

  @ApiProperty({
    description: 'Summary statistics',
    type: 'object',
    properties: {
      total: { type: 'number', example: 10 },
      successful: { type: 'number', example: 8 },
      failed: { type: 'number', example: 2 }
    }
  })
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}
