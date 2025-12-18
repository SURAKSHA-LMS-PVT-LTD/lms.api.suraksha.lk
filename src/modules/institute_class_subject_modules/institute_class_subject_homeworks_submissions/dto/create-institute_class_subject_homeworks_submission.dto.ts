import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsDateString, IsUrl, IsBoolean, Matches } from 'class-validator';
export class CreateInstituteClassSubjectHomeworksSubmissionDto {
  @ApiProperty({ description: 'ID of the homework assignment', example: '1' })
  @IsNotEmpty()
  @IsBigIntId()
  homeworkId: string;

  @ApiProperty({ description: 'ID of the student submitting', example: '1' })
  @IsNotEmpty()
  @IsBigIntId()
  studentId: string;

  @ApiProperty({ description: 'Submission date', example: '2024-01-15', required: false })
  @IsOptional()
  @IsDateString()
  submissionDate?: string;

  @ApiProperty({ description: 'Relative path to the submitted file from /upload/verify-and-publish', example: 'homework-files/submission-uuid.pdf', required: false })
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @ApiProperty({ description: 'Relative path to teacher correction file from /upload/verify-and-publish', example: 'correction-files/correction-uuid.pdf', required: false })
  @IsOptional()
  @IsString()
  teacherCorrectionFileUrl?: string;

  @ApiProperty({ description: 'Teacher remarks on the submission', example: 'Good work, but needs improvement in question 3', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiProperty({ description: 'Whether the submission is active', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
