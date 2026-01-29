import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID } from 'class-validator';
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
}
