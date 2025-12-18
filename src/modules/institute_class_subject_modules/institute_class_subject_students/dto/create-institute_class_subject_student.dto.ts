import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';
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
}
