import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class ChangeInstituteUserTypeDto {
  @ApiProperty({
    description: 'The custom institute user type to assign. Accepts a real institute_user_types.id (bigint string), its slug, or a synthetic "system-*" id (e.g. "system-teacher") for built-in types not yet materialized as a row.',
  })
  @IsString()
  @IsNotEmpty()
  userTypeId: string;
}
