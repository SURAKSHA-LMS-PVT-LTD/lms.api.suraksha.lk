import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

export class InstituteClassSubjectHomeworkResponseDto {
  @ApiProperty({ description: 'Homework ID', example: '123' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Institute ID', example: '44' })
  @Expose()
  instituteId: string;

  @ApiProperty({ description: 'Class ID', example: '40' })
  @Expose()
  classId: string;

  @ApiProperty({ description: 'Subject ID', example: '40' })
  @Expose()
  subjectId: string;

  @ApiProperty({ description: 'Teacher ID', example: '40' })
  @Expose()
  teacherId: string;

  @ApiProperty({ description: 'Homework title', example: 'Mathematics Assignment Chapter 5' })
  @Expose()
  title: string;

  @ApiProperty({ description: 'Homework description', example: 'Solve exercises 1-10 from textbook', required: false })
  @Expose()
  description?: string;

  @ApiProperty({ description: 'Start date', example: '2025-08-15T10:00:00Z' })
  @Expose()
  @Transform(({ value }) => value?.toISOString())
  startDate: Date;

  @ApiProperty({ description: 'End date (due date)', example: '2025-08-20T23:59:59Z', required: false })
  @Expose()
  @Transform(({ value }) => value?.toISOString())
  endDate?: Date;

  @ApiProperty({ description: 'Reference link', example: 'https://example.com/resources', required: false })
  @Expose()
  referenceLink?: string;

  @ApiProperty({ description: 'Active status', example: true, required: false })
  @Expose()
  isActive?: boolean;

  @ApiProperty({ description: 'Creation timestamp', example: '2025-08-12T10:00:00Z', required: false })
  @Expose()
  @Transform(({ value }) => value?.toISOString())
  createdAt?: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2025-08-12T10:00:00Z', required: false })
  @Expose()
  @Transform(({ value }) => value?.toISOString())
  updatedAt?: Date;

  // Related entities (optional, only when needed)
  @ApiProperty({ description: 'Institute details', required: false })
  @Expose()
  institute?: {
    id: string;
    name: string;
  };

  @ApiProperty({ description: 'Class details', required: false })
  @Expose()
  class?: {
    id: string;
    name: string;
  };

  @ApiProperty({ description: 'Subject details', required: false })
  @Expose()
  subject?: {
    id: string;
    name: string;
  };

  @ApiProperty({ description: 'Teacher details', required: false })
  @Expose()
  teacher?: {
    id: string;
    name: string;
    email: string;
  };
}

export class PaginatedInstituteClassSubjectHomeworkResponseDto {
  @ApiProperty({ type: [InstituteClassSubjectHomeworkResponseDto], description: 'List of homework assignments' })
  data: InstituteClassSubjectHomeworkResponseDto[];

  @ApiProperty({ description: 'Total count of homework assignments', example: 50 })
  total: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 5 })
  totalPages: number;

  @ApiProperty({ description: 'Has next page', example: true })
  hasNext: boolean;

  @ApiProperty({ description: 'Has previous page', example: false })
  hasPrev: boolean;
}
