import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsArray, ValidateNested, IsOptional, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { Grade } from '../enums/grade.enum';

export class StudentResultDto {
  @ApiProperty({ description: 'ID of the student', example: '3' })
  @IsNotEmpty()
  @IsBigIntId()
  studentId: string;

  @ApiProperty({ description: 'Score achieved (decimal)', example: '92.50', required: false })
  @IsOptional()
  @IsString()
  score?: string;

  @ApiProperty({ description: 'Grade received', example: 'A+', required: false })
  @IsOptional()
  @IsEnum(Grade)
  grade?: Grade;

  @ApiProperty({ description: 'Remarks or comments', example: 'Outstanding performance', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreateBulkResultsDto {
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

  @ApiProperty({ description: 'ID of the exam', example: '1', required: false })
  @IsOptionalBigIntId()
  examId?: string;

  @ApiProperty({ 
    description: 'Array of student results', 
    type: [StudentResultDto],
    example: [
      {
        studentId: "3",
        score: "92.50",
        grade: "A+",
        remarks: "Outstanding performance"
      },
      {
        studentId: "4", 
        score: "78.25",
        grade: "B+",
        remarks: "Good work"
      }
    ]
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentResultDto)
  results: StudentResultDto[];
}
