import { IsBigIntId, IsOptionalBigIntId } from '../../../common/validators/bigint-id.validator';
import { IsString, IsOptional, IsEnum, IsDateString, IsBoolean } from 'class-validator';
import { ExamType, Grade } from '../enums/exam.enum';

export class CreateExamDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsBigIntId()
  instituteId: string;

  @IsBigIntId()
  classId: string;

  @IsEnum(ExamType)
  examType: ExamType;

  @IsOptional()
  @IsEnum(Grade)
  grade?: Grade;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsBoolean()
  isResultsPublished?: boolean = false;

  @IsOptional()
  @IsString()
  templateUrl?: string; // Override default template if needed
}
