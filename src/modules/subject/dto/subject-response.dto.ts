import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubjectType } from '../entities/subject.entity';

export class SubjectResponseDto {
  @ApiProperty({ description: 'Subject ID', example: '1' })
  id: string;

  @ApiProperty({ description: 'Subject code', example: 'MATH101' })
  code: string;

  @ApiProperty({ description: 'Subject name', example: 'Mathematics' })
  name: string;

  @ApiPropertyOptional({ description: 'Subject description', example: 'Basic mathematics course' })
  description?: string;

  @ApiPropertyOptional({ description: 'Subject category', example: 'Science' })
  category?: string;

  @ApiPropertyOptional({ description: 'Credit hours', example: 3 })
  creditHours?: number;

  @ApiProperty({ description: 'Active status', example: true })
  isActive: boolean;

  @ApiProperty({ 
    description: 'Subject type (e.g., MAIN, BASKET, COMMON, GRADE_6TO9_BASKET, GRADE_10TO11_BASKET_1, etc.)', 
    example: 'MAIN' 
  })
  subjectType: string;

  @ApiPropertyOptional({ 
    description: 'Basket category (e.g., LANGUAGE, ARTS, TECHNOLOGY, COMMERCE, SCIENCE, RELIGION)', 
    example: 'LANGUAGE' 
  })
  basketCategory?: string;

  @ApiProperty({ description: 'Institute ID', example: '1' })
  instituteId: string;

  @ApiPropertyOptional({ 
    nullable: true
  })

  @ApiPropertyOptional({ 
    description: 'Subject image URL', 
    example: 'https://storage.googleapis.com/laas-file-storage/subject-images/subject-123-1609459200000.jpg' 
  })
  imgUrl?: string;

  @ApiProperty({ description: 'Creation date', example: '2025-09-12T10:00:00Z' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date', example: '2025-09-12T10:00:00Z' })
  updatedAt: Date;

  constructor(subject: Partial<SubjectResponseDto>) {
    Object.assign(this, subject);
  }
}
