import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsBoolean, IsIn, Min, Max, IsUrl, IsNotEmpty, ValidateIf, Validate, ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { Type, Transform } from 'class-transformer';

@ValidatorConstraint({ name: 'documentUrlRequired', async: false })
export class DocumentUrlRequiredConstraint implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const object = args.object as any;
    // Valid if any of: documentUrl, url, driveFileId, externalUrl
    return !!(object.documentUrl || object.url || object.driveFileId || object.externalUrl);
  }

  defaultMessage(args: ValidationArguments) {
    return 'One of documentUrl, url, driveFileId, or externalUrl must be provided';
  }
}

export class DocumentInfoDto {
  @ApiProperty({ 
    description: 'Name of the document', 
    example: 'Chapter 1 - Introduction.pdf' 
  })
  @IsString()
  @IsOptional()
  documentName?: string;

  @ApiProperty({ 
    description: 'URL or relative path to access the document', 
    example: '/structured-lectures/1/documents/document-1-xyz.pdf' 
  })
  @IsString()
  @IsOptional()
  documentUrl?: string;

  @ApiPropertyOptional({ 
    description: 'Description of the document', 
    example: 'Introduction to the fundamentals of mathematics' 
  })
  @IsString()
  @IsOptional()
  documentDescription?: string;

  // Alternative naming support for backward compatibility
  @ApiProperty({ 
    description: 'Name of the document (alternative field name)', 
    example: 'Chapter 1 - Introduction.pdf' 
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ 
    description: 'URL or relative path to access the document (alternative field name)', 
    example: '/structured-lectures/1/documents/document-1-xyz.pdf' 
  })
  @IsString()
  @IsOptional()
  url?: string;

  // Google Drive fields (for LECTURE_DOCUMENT uploads via /drive-access)
  @ApiPropertyOptional({
    description: 'Google Drive file ID — required when source is GOOGLE_DRIVE',
    example: '1abc123def456ghi789',
  })
  @IsString()
  @IsOptional()
  driveFileId?: string;

  @ApiPropertyOptional({
    description: 'Google Drive web view link (populated automatically from driveFileId)',
    example: 'https://drive.google.com/file/d/1abc123/view',
  })
  @IsString()
  @IsOptional()
  driveWebViewLink?: string;

  // Custom external URL fields (YouTube, Vimeo, website links, etc.)
  @ApiPropertyOptional({
    description: 'Any external URL — YouTube, Vimeo, Wikipedia, a website, etc.',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @IsString()
  @IsOptional()
  externalUrl?: string;

  @ApiPropertyOptional({
    description: 'Display title for the external link (shown instead of the raw URL)',
    example: 'Khan Academy — Introduction to Algebra',
  })
  @IsString()
  @IsOptional()
  linkTitle?: string;

  @ApiPropertyOptional({
    description: 'Source of the document',
    example: 'EXTERNAL_URL',
    enum: ['GOOGLE_DRIVE', 'EXTERNAL_URL'],
  })
  @IsString()
  @IsOptional()
  source?: string;

  // Validate that at least one URL or Drive ID is provided
  @Validate(DocumentUrlRequiredConstraint)
  _validateUrl?: any;
}

export class CreateLectureDto {
  @ApiProperty({ description: 'Institute ID this lecture belongs to', example: '101' })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({ description: 'Subject ID this lecture belongs to', example: 'SUBJ_MATH_001' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ description: 'Grade level (1-13)', example: 10, minimum: 1, maximum: 13 })
  @IsNumber()
  @Min(1)
  @Max(13)
  @Type(() => Number)
  grade: number;

  @ApiProperty({ description: 'Title of the lecture', example: 'Introduction to Algebra' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Detailed description of the lecture', example: 'This lecture covers the basic concepts of algebra including variables, equations, and expressions.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Lesson number (must be >= 1)', example: 1 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  lessonNumber?: number;

  @ApiPropertyOptional({ description: 'Lecture number within the lesson (must be >= 1)', example: 1 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  lectureNumber?: number;

  @ApiPropertyOptional({ description: 'Name of the lecture provider/instructor', example: 'Dr. John Smith' })
  @IsString()
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({ description: 'URL or relative path to the lecture video/stream', example: 'https://zoom.us/j/123456789' })
  @IsString()
  @IsOptional()
  lectureLink?: string;

  // Alternative field names for compatibility
  @ApiPropertyOptional({ description: 'URL or relative path to the lecture video/stream (alternative field name)', example: 'https://zoom.us/j/123456789' })
  @IsString()
  @IsOptional()
  lectureVideoUrl?: string;

  @ApiPropertyOptional({ description: 'Array of document URLs or relative paths (alternative field name)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  documentUrls?: string[];

  @ApiPropertyOptional({ description: 'URL or relative path to the cover image for the lecture', example: '/structured-lectures/1/covers/cover-1-xyz.jpg' })
  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: 'Array of documents related to this lecture', type: [DocumentInfoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentInfoDto)
  @IsOptional()
  documents?: DocumentInfoDto[];

  @ApiPropertyOptional({ description: 'Whether the lecture is active', example: true, default: true })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;
}

export class UpdateLectureDto {
  @ApiPropertyOptional({ description: 'Institute ID this lecture belongs to', example: '101' })
  @IsString()
  @IsOptional()
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Subject ID this lecture belongs to', example: 'SUBJ_MATH_002' })
  @IsString()
  @IsOptional()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Grade level (1-13)', example: 11, minimum: 1, maximum: 13 })
  @IsNumber()
  @Min(1)
  @Max(13)
  @IsOptional()
  grade?: number;

  @ApiPropertyOptional({ description: 'Title of the lecture', example: 'Advanced Introduction to Algebra' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: 'Detailed description of the lecture', example: 'Updated description with more advanced concepts.' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Lesson number (must be >= 1)', example: 2 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  lessonNumber?: number;

  @ApiPropertyOptional({ description: 'Lecture number within the lesson (must be >= 1)', example: 3 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  lectureNumber?: number;

  @ApiPropertyOptional({ description: 'Name of the lecture provider/instructor', example: 'Dr. Jane Doe' })
  @IsString()
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({ description: 'URL or relative path to the lecture video/stream', example: 'https://meet.google.com/abc-defg-hij' })
  @IsString()
  @IsOptional()
  lectureLink?: string;

  @ApiPropertyOptional({ description: 'URL or relative path to the cover image for the lecture', example: '/structured-lectures/1/covers/cover-1-xyz.jpg' })
  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: 'Array of document URLs or relative paths (alternative field name)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  documentUrls?: string[];

  @ApiPropertyOptional({ description: 'Array of documents related to this lecture', type: [DocumentInfoDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentInfoDto)
  @IsOptional()
  documents?: DocumentInfoDto[];

  @ApiPropertyOptional({ description: 'Whether the lecture is active', example: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class LectureResponseDto {
  @ApiProperty({ description: 'Unique identifier for the lecture', example: '648a1b2c3d4e5f6789abcdef' })
  _id: string;

  @ApiProperty({ description: 'Institute ID this lecture belongs to', example: '101' })
  instituteId: string;

  @ApiProperty({ description: 'Subject ID this lecture belongs to', example: 'SUBJ_MATH_001' })
  subjectId: string;

  @ApiProperty({ description: 'Grade level (1-13)', example: 10 })
  grade: number;

  @ApiProperty({ description: 'Title of the lecture', example: 'Introduction to Algebra' })
  title: string;

  @ApiProperty({ description: 'Detailed description of the lecture' })
  description: string;

  @ApiProperty({ description: 'Lesson number', example: 1 })
  lessonNumber: number;

  @ApiProperty({ description: 'Lecture number within the lesson', example: 1 })
  lectureNumber: number;

  @ApiPropertyOptional({ description: 'Name of the lecture provider/instructor' })
  provider?: string;

  @ApiPropertyOptional({ description: 'URL to the lecture video/stream' })
  lectureLink?: string;

  @ApiPropertyOptional({ description: 'URL to the cover image for the lecture' })
  coverImageUrl?: string;

  @ApiProperty({ description: 'Array of documents related to this lecture', type: [DocumentInfoDto] })
  documents: DocumentInfoDto[];

  @ApiProperty({ description: 'Whether the lecture is active' })
  isActive: boolean;

  @ApiProperty({ description: 'When the lecture was created' })
  createdAt: Date;

  @ApiProperty({ description: 'When the lecture was last updated' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'ID of user who created the lecture' })
  createdBy?: string;

  @ApiPropertyOptional({ description: 'ID of user who last updated the lecture' })
  updatedBy?: string;
}

export class GetLecturesBySubjectResponseDto {
  @ApiProperty({ description: 'Success status', example: true })
  success: boolean;

  @ApiProperty({ description: 'Response message', example: 'Found 15 lectures for subject SUBJ_MATH_001, grade 10' })
  message: string;

  @ApiProperty({ description: 'Subject and grade information' })
  subjectInfo: {
    subjectId: string;
    grade: number;
    totalLectures: number;
    totalLessons: number;
    activeLectures: number;
  };

  @ApiProperty({ description: 'Lectures grouped by lessons' })
  data: {
    lessonNumber: number;
    lessonName: string;
    lectures: LectureResponseDto[];
  }[];
}

export class LectureQueryDto {
  @ApiPropertyOptional({ description: 'Filter by institute ID', example: '101' })
  @IsString()
  @IsOptional()
  instituteId?: string;

  @ApiPropertyOptional({ description: 'Filter by subject ID', example: 'SUBJ_MATH_001' })
  @IsString()
  @IsOptional()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Filter by grade level (1-13)', example: 10, minimum: 1, maximum: 13 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(13)
  grade?: number;

  @ApiPropertyOptional({ description: 'Filter by active status', example: true })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Page number for pagination', example: 1, default: 1 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page', example: 10, default: 50 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Search in title and description', example: 'algebra' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Sort field', example: 'createdAt', default: 'createdAt', enum: ['createdAt', 'updatedAt', 'title', 'orderIndex'] })
  @IsString()
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'title', 'orderIndex'], { message: 'sortBy must be one of: createdAt, updatedAt, title, orderIndex' })
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', example: 'DESC', default: 'DESC', enum: ['ASC', 'DESC'] })
  @IsString()
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}

export class LectureListResponseDto {
  @ApiProperty({ description: 'List of lectures', type: [LectureResponseDto] })
  lectures: LectureResponseDto[];

  @ApiProperty({ description: 'Total number of lectures' })
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;
}