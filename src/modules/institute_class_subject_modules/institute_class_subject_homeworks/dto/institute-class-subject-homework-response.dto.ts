import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { HomeworkReferenceType, HomeworkReferenceSource } from '../entities/institute_class_subject_homework_reference.entity';

/**
 * Simplified submission data included with homework response
 */
export class HomeworkSubmissionSimpleDto {
  @ApiProperty({ description: 'Submission ID', example: '1' })
  id: string;

  @ApiProperty({ description: 'Student ID', example: '40' })
  studentId: string;

  @ApiPropertyOptional({ description: 'Student name' })
  studentName?: string;

  @ApiPropertyOptional({ description: 'Student image URL' })
  studentImageUrl?: string;

  @ApiProperty({ description: 'Submission date', example: '2026-01-20T10:00:00Z' })
  submissionDate?: Date;

  @ApiPropertyOptional({ description: 'Submitted file URL' })
  fileUrl?: string;

  @ApiPropertyOptional({ description: 'Teacher correction file URL' })
  teacherCorrectionFileUrl?: string;

  @ApiPropertyOptional({ description: 'Google Drive file ID (if submitted via Drive)' })
  driveFileId?: string;

  @ApiPropertyOptional({ description: 'Google Drive view URL' })
  driveViewUrl?: string;

  @ApiPropertyOptional({ description: 'Google Drive file name' })
  driveFileName?: string;

  @ApiPropertyOptional({ description: 'Google Drive file MIME type' })
  driveMimeType?: string;

  @ApiPropertyOptional({ description: 'Google Drive file size in bytes' })
  driveFileSize?: number;

  @ApiPropertyOptional({ description: 'Submission type', enum: ['UPLOAD', 'GOOGLE_DRIVE'] })
  submissionType?: string;

  @ApiPropertyOptional({ description: 'Teacher remarks/feedback' })
  remarks?: string;

  @ApiPropertyOptional({ description: 'Has correction file uploaded by teacher', example: true })
  hasCorrectionFile?: boolean;

  @ApiPropertyOptional({ description: 'Has teacher remarks/feedback', example: true })
  hasRemarks?: boolean;

  @ApiPropertyOptional({ description: 'Is corrected by teacher (has file or remarks)', example: true })
  isCorrected?: boolean;

  @ApiPropertyOptional({ description: 'Correction status', enum: ['corrected', 'pending'], example: 'corrected' })
  correctionStatus?: string;

  @ApiProperty({ description: 'Is active', example: true })
  isActive: boolean;

  @ApiProperty({ description: 'Created at' })
  createdAt?: Date;

  @ApiProperty({ description: 'Updated at' })
  updatedAt?: Date;
}

/**
 * Simplified reference data included with homework response
 */
export class HomeworkReferenceSimpleDto {
  @ApiProperty({ description: 'Reference ID', example: '1' })
  id: string;

  @ApiProperty({ description: 'Title', example: 'Chapter 1 Video' })
  title: string;

  @ApiPropertyOptional({ description: 'Description' })
  description?: string;

  @ApiProperty({ description: 'Reference type', enum: HomeworkReferenceType })
  referenceType: HomeworkReferenceType;

  @ApiProperty({ description: 'Reference source', enum: HomeworkReferenceSource })
  referenceSource: HomeworkReferenceSource;

  @ApiProperty({ description: 'Display order', example: 0 })
  displayOrder: number;

  @ApiPropertyOptional({ description: 'Primary viewable URL' })
  viewUrl?: string;

  @ApiPropertyOptional({ description: 'File name' })
  fileName?: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  fileSize?: number;

  @ApiPropertyOptional({ description: 'MIME type' })
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Video duration in seconds' })
  videoDuration?: number;

  @ApiPropertyOptional({ description: 'Thumbnail URL' })
  thumbnailUrl?: string;
}

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
    nameWithInitials: string;
    imageUrl?: string;
    email: string;
  };

  @ApiPropertyOptional({ 
    description: 'Reference materials (videos, PDFs, links, etc.)', 
    type: [HomeworkReferenceSimpleDto] 
  })
  @Expose()
  references?: HomeworkReferenceSimpleDto[];

  @ApiPropertyOptional({ description: 'Total reference count' })
  @Expose()
  referenceCount?: number;

  @ApiPropertyOptional({ 
    description: 'Current user\'s submissions for this homework (students see their own, teachers see all)', 
    type: [HomeworkSubmissionSimpleDto] 
  })
  @Expose()
  mySubmissions?: HomeworkSubmissionSimpleDto[];

  @ApiPropertyOptional({ description: 'Total submissions count (for teachers)' })
  @Expose()
  submissionCount?: number;

  @ApiPropertyOptional({ description: 'Number of corrected submissions', example: 5 })
  @Expose()
  correctedCount?: number;

  @ApiPropertyOptional({ description: 'Number of submissions pending correction', example: 2 })
  @Expose()
  pendingCorrectionCount?: number;

  @ApiPropertyOptional({ description: 'Whether current user has submitted', example: true })
  @Expose()
  hasSubmitted?: boolean;
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
