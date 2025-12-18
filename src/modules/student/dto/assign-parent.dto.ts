import { IsBigIntId, IsOptionalBigIntId } from '../../../common/validators/bigint-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';
export class AssignParentDto {
  @ApiProperty({
    description: 'Type of parent relationship',
    enum: ['father', 'mother', 'guardian'],
    example: 'father'
  })
  @IsString()
  @IsIn(['father', 'mother', 'guardian'])
  parentType: 'father' | 'mother' | 'guardian';

  @ApiProperty({
    description: 'User ID of the parent to assign',
    example: '123'
  })
  @IsBigIntId()
  parentUserId: string;
}

export class RemoveParentDto {
  @ApiProperty({
    description: 'Type of parent relationship to remove',
    enum: ['father', 'mother', 'guardian'],
    example: 'father'
  })
  @IsString()
  @IsIn(['father', 'mother', 'guardian'])
  parentType: 'father' | 'mother' | 'guardian';
}
