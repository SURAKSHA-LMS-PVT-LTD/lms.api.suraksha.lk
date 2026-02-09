import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsOptional, IsString, IsEnum, IsDateString, IsBoolean, IsNumberString, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryInstituteClassSubjectExamDto {
  @ApiPropertyOptional({
    description: 'Institute ID',
    example: '1',
  })
  @IsOptionalBigIntId()
  instituteId?: string;

  @ApiPropertyOptional({
    description: 'Class ID',
    example: '1',
  })
  @IsOptionalBigIntId()
  classId?: string;

  @ApiPropertyOptional({
    description: 'Subject ID',
    example: '1',
  })
  @IsOptionalBigIntId()
  subjectId?: string;

  @ApiPropertyOptional({
    description: 'Exam type',
    enum: ['online', 'physical'],
    example: 'online',
  })
  @IsOptional()
  @IsEnum(['online', 'physical'])
  examType?: 'online' | 'physical';

  @ApiPropertyOptional({
    description: 'Exam status',
    enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'],
    example: 'scheduled',
  })
  @IsOptional()
  @IsEnum(['draft', 'scheduled', 'active', 'completed', 'cancelled'])
  status?: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';

  @ApiPropertyOptional({
    description: 'From date (ISO string)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'To date (ISO string)',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Is active status',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    return value === 'true' || value === true;
  })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Search term for title or description',
    example: 'physics',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: '1',
  })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: '10',
  })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'scheduleDate',
    enum: ['scheduleDate', 'createdAt', 'updatedAt', 'title', 'totalMarks'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['scheduleDate', 'createdAt', 'updatedAt', 'title', 'totalMarks'], { message: 'sortBy must be one of: scheduleDate, createdAt, updatedAt, title, totalMarks' })
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    example: 'ASC',
  })
  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({
    description: 'Created by user ID',
    example: '1',
  })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'Teacher ID (alias for createdBy)',
    example: '1',
  })
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiPropertyOptional({
    description: 'User ID (for parent access validation)',
    example: '1',
  })
  @IsOptionalBigIntId()
  userId?: string;
}
