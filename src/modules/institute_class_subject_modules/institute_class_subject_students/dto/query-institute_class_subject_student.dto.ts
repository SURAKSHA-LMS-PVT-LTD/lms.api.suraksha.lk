import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsArray } from 'class-validator';
import { PaginationDto } from '../../../../common/dto/pagination.dto';

export class QueryInstituteClassSubjectStudentDto extends PaginationDto {
  @ApiProperty({ description: 'Filter by institute ID', example: '1', required: false })
  @IsOptionalBigIntId()
  instituteId?: string;

  @ApiProperty({ description: 'Filter by class ID', example: '1', required: false })
  @IsOptionalBigIntId()
  classId?: string;

  @ApiProperty({ description: 'Filter by subject ID', example: '1', required: false })
  @IsOptionalBigIntId()
  subjectId?: string;

  @ApiProperty({ description: 'Filter by student ID', example: '1', required: false })
  @IsOptionalBigIntId()
  studentId?: string;

  @ApiProperty({ description: 'Filter by active status', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BulkEnrollStudentsDto {
  @ApiProperty({ description: 'ID of the institute', example: '1' })
  @IsBigIntId()
  instituteId: string;

  @ApiProperty({ description: 'ID of the class', example: '1' })
  @IsBigIntId()
  classId: string;

  @ApiProperty({ description: 'ID of the subject', example: '1' })
  @IsBigIntId()
  subjectId: string;

  @ApiProperty({ description: 'Array of student IDs to enroll', example: ['1', '2', '3'] })
  @IsArray()
  @IsString({ each: true })
  studentIds: string[];

  @ApiProperty({ description: 'Whether enrollments are active', example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
