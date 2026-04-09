import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsBoolean, IsObject } from 'class-validator';
export class CreateInstituteClassSubjectStudentDto {
  @ApiProperty({ description: 'ID of the institute', example: '1' })
  @IsNotEmpty()
  @IsBigIntId()
  instituteId: string;

  @ApiProperty({ description: 'ID of the class', example: '1' })
  @IsNotEmpty()
  @IsBigIntId()
  classId: string;

  @ApiProperty({ description: 'ID of the subject', example: '1' })
  @IsNotEmpty()
  @IsBigIntId()
  subjectId: string;

  @ApiProperty({ description: 'ID of the student', example: '1' })
  @IsNotEmpty()
  @IsBigIntId()
  studentId: string;

  @ApiProperty({ description: 'Whether the student enrollment is active', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Custom key-value data for this subject enrollment (e.g. phone, notes). Stored as plain JSON — visible to admins, not encrypted.',
    example: { phoneNumber: '0771234567', notes: 'Scholarship student' }
  })
  @IsOptional()
  @IsObject()
  extraData?: Record<string, any>;
}
