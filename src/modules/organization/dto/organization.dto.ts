import { IsString, IsBoolean, IsOptional, IsEnum, MaxLength, IsNotEmpty, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { OrganizationType } from '../entities/organization.entity';
import { OrganizationRole } from '../entities/organization-user.entity';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Environmental Club', description: 'Organization name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: OrganizationType, example: OrganizationType.INSTITUTE })
  @IsEnum(OrganizationType)
  @IsNotEmpty()
  type: OrganizationType;

  @ApiProperty({ example: false, description: 'Is organization public' })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isPublic: boolean;

  @ApiPropertyOptional({ example: 'SECRET123', description: 'Enrollment key for private organizations' })
  @IsString()
  @IsOptional()
  enrollmentKey?: string;

  @ApiPropertyOptional({ example: true, description: 'Require verification after enrollment' })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  needEnrollmentVerification?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Enable self-enrollment' })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  enabledEnrollments?: boolean;

  @ApiPropertyOptional({ 
    example: 'institute-images/org-logo-123.jpg',
    description: 'Organization logo/image URL (relative path from /upload/verify-and-publish endpoint)'
  })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ example: '12', description: 'Institute ID (required for institute admins)' })
  @IsString()
  @IsOptional()
  instituteId?: string;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  enrollmentKey?: string;

  @ApiPropertyOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  needEnrollmentVerification?: boolean;

  @ApiPropertyOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  enabledEnrollments?: boolean;

  @ApiPropertyOptional({ 
    type: 'string', 
    format: 'binary',
    description: 'Organization logo/image file (JPG, JPEG, PNG, max 5MB). Use multipart/form-data for updates.'
  })
  // Note: imageUrl is no longer accepted as string input for security.
  // Images must be uploaded as files via dedicated upload endpoint.

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  instituteId?: string;
}

export class EnrollUserDto {
  @ApiProperty({ example: '123', description: 'Organization ID' })
  @IsString()
  @IsNotEmpty()
  organizationId: string;

  @ApiPropertyOptional({ example: 'SECRET123', description: 'Enrollment key if required' })
  @IsString()
  @IsOptional()
  enrollmentKey?: string;
}

export class OrgVerifyUserDto {
  @ApiProperty({ example: '456', description: 'User ID to verify' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: true, description: 'Verification status' })
  @IsBoolean()
  @IsNotEmpty()
  isVerified: boolean;
}

export class AssignInstituteDto {
  @ApiProperty({ example: '12', description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;
}

export class AssignUserRoleDto {
  @ApiProperty({ example: '456', description: 'User ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ 
    example: OrganizationRole.ADMIN, 
    enum: OrganizationRole,
    description: 'Role to assign (PRESIDENT, ADMIN, MODERATOR, MEMBER)'
  })
  @IsEnum(OrganizationRole, { message: 'Invalid role. Must be one of: PRESIDENT, ADMIN, MODERATOR, MEMBER' })
  @IsNotEmpty()
  role: OrganizationRole;
}

export class ChangeUserRoleDto {
  @ApiProperty({ example: '456', description: 'User ID' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ 
    example: OrganizationRole.ADMIN, 
    enum: OrganizationRole,
    description: 'New role (PRESIDENT, ADMIN, MODERATOR, MEMBER)'
  })
  @IsEnum(OrganizationRole, { message: 'Invalid role. Must be one of: PRESIDENT, ADMIN, MODERATOR, MEMBER' })
  @IsNotEmpty()
  newRole: OrganizationRole;
}

export class RemoveUserDto {
  @ApiProperty({ example: '456', description: 'User ID to remove' })
  @IsString()
  @IsNotEmpty()
  userId: string;
}

export class TransferPresidencyDto {
  @ApiProperty({ example: '456', description: 'New president user ID' })
  @IsString()
  @IsNotEmpty()
  newPresidentUserId: string;
}

export class OrganizationAssignUserToInstituteDto {
  @ApiProperty({ example: '456', description: 'User ID to assign to institute' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: '12', description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiPropertyOptional({ example: 'STU2024001', description: 'Institute-specific user ID (optional)' })
  @IsString()
  @IsOptional()
  userIdByInstitute?: string;

  @ApiPropertyOptional({ 
    example: 'STUDENT', 
    description: 'Institute user type (STUDENT, TEACHER, ADMIN, PARENT, etc.)',
    enum: ['STUDENT', 'TEACHER', 'ADMIN', 'PARENT', 'STAFF', 'OTHER']
  })
  @IsString()
  @IsOptional()
  instituteUserType?: string;

  @ApiPropertyOptional({ 
    example: true, 
    description: 'Auto-verify user in institute (admin assignment = auto-verified)' 
  })
  @IsBoolean()
  @IsOptional()
  autoVerify?: boolean;
}

export class BulkAssignUsersToInstituteDto {
  @ApiProperty({ 
    example: ['456', '789', '123'], 
    description: 'Array of user IDs to assign to institute',
    type: [String]
  })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  userIds: string[];

  @ApiProperty({ example: '12', description: 'Institute ID' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiPropertyOptional({ 
    example: 'STUDENT', 
    description: 'Default institute user type for all users',
    enum: ['STUDENT', 'TEACHER', 'ADMIN', 'PARENT', 'STAFF', 'OTHER']
  })
  @IsString()
  @IsOptional()
  defaultInstituteUserType?: string;

  @ApiPropertyOptional({ 
    example: true, 
    description: 'Auto-verify all users in institute' 
  })
  @IsBoolean()
  @IsOptional()
  autoVerify?: boolean;
}
