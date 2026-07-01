import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class BulkClassNamesRequestDto {
  @ApiProperty({
    description: 'Student user IDs to resolve current class names for (max 5000 per request)',
    type: [String],
    example: ['123456789', '987654321'],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'userIds must contain at least one ID' })
  @ArrayMaxSize(5000, { message: 'userIds cannot exceed 5000 per request' })
  @IsString({ each: true })
  userIds: string[];
}

export class BulkClassNameResultDto {
  @ApiProperty({ description: 'Student user ID' })
  userId: string;

  @ApiProperty({ description: 'Class ID the student is currently actively enrolled in', nullable: true })
  classId: string | null;

  @ApiProperty({ description: 'Class name the student is currently actively enrolled in', nullable: true })
  className: string | null;
}
