import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InstituteClassSubjectResponseDto {
  @ApiProperty({ description: 'Institute ID' })
  instituteId: string;

  @ApiProperty({ description: 'Class ID' })
  classId: string;

  @ApiProperty({ description: 'Subject ID' })
  subjectId: string;

  @ApiPropertyOptional({ description: 'Teacher ID' })
  teacherId?: string;

  @ApiProperty({ description: 'Subject details' })
  subject?: {
    id: string;
    name: string;
    code: string;
  };

  @ApiPropertyOptional({ description: 'Teacher details' })
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
    nameWithInitials?: string;
    email: string;
    imageUrl: string;
  };

  @ApiPropertyOptional({ description: 'Class details including class teacher' })
  class?: {
    id: string;
    name: string;
    code?: string;
    grade?: number;
    specialty?: string;
    classTeacherId?: string;
  };

  @ApiProperty({ description: 'Whether the assignment is active' })
  isActive: boolean;

  @ApiProperty({ description: 'Whether self-enrollment is enabled for this subject' })
  enrollmentEnabled: boolean;

  @ApiPropertyOptional({ description: 'Enrollment key for self-enrollment (only visible to authorized users)' })
  enrollmentKey?: string;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;
}

export class BulkInstituteClassSubjectResponseDto {
  @ApiProperty({ description: 'Success status', example: true })
  success: boolean;

  @ApiProperty({ description: 'Success message', example: 'Successfully assigned 3 subjects to class' })
  message: string;

  @ApiProperty({ description: 'Number of subjects successfully assigned', example: 3 })
  assignedCount: number;

  @ApiProperty({ description: 'Number of subjects skipped (already assigned)', example: 0 })
  skippedCount: number;

  @ApiPropertyOptional({ description: 'List of errors if any', example: [] })
  errors?: string[];
}

export class InstituteClassSubjectSuccessResponseDto {
  @ApiProperty({ description: 'Success status', example: true })
  success: boolean;

  @ApiProperty({ description: 'Success message', example: 'Subject successfully assigned to class' })
  message: string;
}

export class PaginatedInstituteClassSubjectResponseDto {
  @ApiProperty({ type: [InstituteClassSubjectResponseDto] })
  data: InstituteClassSubjectResponseDto[];

  @ApiProperty({ description: 'Total number of records' })
  total: number;

  @ApiProperty({ description: 'Current page number' })
  page: number;

  @ApiProperty({ description: 'Number of records per page' })
  limit: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;
}
