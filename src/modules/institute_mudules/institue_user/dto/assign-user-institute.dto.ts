import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { InstituteUserStatus } from '../enums/institute-user-status.enum';
import { InstituteUserType } from '../enums/institute-user-type.enum';

export class AssignUserToInstituteDto {
  @ApiProperty({
    description: 'User ID to assign to institute',
    example: '1'
  })
  @IsNotEmpty()
  @IsBigIntId()
  userId: string;

  @ApiProperty({
    description: 'Institute ID to assign user to',
    example: '1'
  })
  @IsNotEmpty()
  @IsBigIntId()
  instituteId: string;

  @ApiProperty({
    description: 'Institute user type/role (STUDENT, TEACHER, INSTITUTE_ADMIN, PARENT, ATTENDANCE_MARKER)',
    enum: InstituteUserType,
    example: InstituteUserType.STUDENT
  })
  @IsNotEmpty()
  @IsEnum(InstituteUserType)
  instituteUserType: InstituteUserType;

  @ApiPropertyOptional({
    description: 'Status of the user in institute',
    enum: InstituteUserStatus,
    default: InstituteUserStatus.ACTIVE
  })
  @IsOptional()
  @IsEnum(InstituteUserStatus)
  status?: InstituteUserStatus = InstituteUserStatus.ACTIVE;
}
