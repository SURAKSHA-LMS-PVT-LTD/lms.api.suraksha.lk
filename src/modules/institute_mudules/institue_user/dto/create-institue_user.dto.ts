import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID, MinLength, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstituteUserStatus } from '../enums/institute-user-status.enum';
import { InstituteUserType } from '../enums/institute-user-type.enum';

export class CreateInstitueUserDto {
  @ApiProperty({
    description: 'Institute ID to assign user to',
    example: '1'
  })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({
    description: 'User ID to assign to institute',
    example: '1'
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({
    description: 'Institute-specific user ID/number (like student ID, employee ID)',
    example: 'EMP2024001'
  })
  @IsOptional()
  @IsString()
  userIdByInstitute?: string;

  @ApiProperty({
    description: 'Type of user in institute',
    enum: InstituteUserType,
    example: InstituteUserType.STUDENT
  })
  @IsEnum(InstituteUserType, {
    message: 'instituteUserType must be a valid InstituteUserType'
  })
  instituteUserType: InstituteUserType;

  @ApiPropertyOptional({
    description: 'Status of user in institute',
    enum: InstituteUserStatus,
    default: InstituteUserStatus.ACTIVE
  })
  @IsOptional()
  @IsEnum(InstituteUserStatus)
  status?: InstituteUserStatus;

  @ApiPropertyOptional({
    description: 'Institute-level password (min 8 characters). If blank, user will need admin to set it.',
    example: 'securePass123'
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Institute password must be at least 8 characters' })
  institutePassword?: string;

  @ApiPropertyOptional({
    description: 'Custom key-value data for this institute user (e.g. phone, email, notes). Stored as plain JSON — visible to admins, not encrypted.',
    example: { phoneNumber: '0771234567', email: 'student@mail.com', notes: 'Joined mid-term' }
  })
  @IsOptional()
  @IsObject()
  extraData?: Record<string, any>;
}
