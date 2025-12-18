import { IsBigIntId, IsOptionalBigIntId } from '../../../common/validators/bigint-id.validator';
import { IsString, IsNumber, IsOptional, Min, Max, IsEnum } from 'class-validator';
import { Grade } from '../enums/exam.enum';
export class MarkEntryDto {
  @IsBigIntId()
  examId: string;

  @IsBigIntId()
  studentId: string;

  @IsString()
  subjectName: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  marksObtained: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  totalMarks?: number = 100;

  @IsOptional()
  @IsEnum(Grade)
  grade?: Grade;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class BulkMarkEntryDto {
  @IsBigIntId()
  examId: string;

  marks: MarkEntryDto[];
}

export class StudentMarkDto {
  @IsBigIntId()
  studentId: string;

  @IsString()
  studentName: string;

  subjects: {
    subjectName: string;
    marksObtained: number;
    totalMarks: number;
    percentage: number;
    grade?: Grade;
    remarks?: string;
  }[];

  @IsOptional()
  @IsNumber()
  totalMarks?: number;

  @IsOptional()
  @IsNumber()
  totalObtained?: number;

  @IsOptional()
  @IsNumber()
  overallPercentage?: number;
}
