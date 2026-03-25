import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsDecimal, IsBoolean, IsEnum } from 'class-validator';
import { Grade } from '../enums/grade.enum';
export class CreateInstituteClassSubjectResaultDto {
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

  @ApiProperty({ description: 'ID of the exam', example: '1', required: false })
  @IsOptionalBigIntId()
  examId?: string;

  @ApiProperty({ description: 'Score achieved (decimal)', example: '85.50', required: false })
  @IsOptional()
  @IsString()
  score?: string;

  @ApiProperty({ description: 'Grade received (e.g., A, B, C)', example: 'A', required: false })
  @IsOptional()
  @IsEnum(Grade)
  grade?: Grade;

  @ApiProperty({ description: 'Remarks or comments', example: 'Excellent performance', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ description: 'Whether the result is active', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
