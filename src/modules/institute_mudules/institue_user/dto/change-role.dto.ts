import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { InstituteUserType } from '../enums/institute-user-type.enum';

export class ChangeInstituteUserRoleDto {
  @ApiProperty({ enum: InstituteUserType, description: 'New role for the institute user' })
  @IsEnum(InstituteUserType)
  newRole: InstituteUserType;
}
