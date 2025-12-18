import { IsBigIntId, IsOptionalBigIntId } from '../../../common/validators/bigint-id.validator';
import { IsString, IsOptional, IsEnum, IsDateString, IsBoolean } from 'class-validator';
import { ExamType, ExamStatus, Grade } from '../enums/exam.enum';

export class UpdateExamDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ExamType)
  examType?: ExamType;

  @IsOptional()
  @IsEnum(Grade)
  grade?: Grade;

  @IsOptional()
  @IsEnum(ExamStatus)
  status?: ExamStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isResultsPublished?: boolean;

  @IsOptional()
  @IsString()
  templateUrl?: string;
}

export class PublishResultsDto {
  @IsBigIntId()
  examId: string;

  @IsOptional()
  @IsBoolean()
  sendNotifications?: boolean = true;
}
