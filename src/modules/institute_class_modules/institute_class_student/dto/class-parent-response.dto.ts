import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Secure parent response DTO for institute class parent endpoints
 * Contains only non-sensitive parent and student information
 * Phone numbers are masked for security - showing only last 3 digits
 */

/**
 * Secure parent response DTO for class parent endpoints
 * Contains only non-sensitive parent and student information
 */
export class ClassParentResponseDto {
  @ApiProperty({ 
    example: '123', 
    description: 'Parent user ID' 
  })
  id: string;

  @ApiProperty({ 
    example: 'John Doe', 
    description: 'Parent full name' 
  })
  name: string;

  @ApiProperty({ 
    example: 'john.doe@example.com', 
    description: 'Parent email address' 
  })
  email: string;

  @ApiPropertyOptional({ 
    example: '+94****789', 
    description: 'Masked parent phone number (only last 3 digits visible for security)' 
  })
  phoneNumber?: string;

  @ApiPropertyOptional({ 
    example: 'https://example.com/profile.jpg', 
    description: 'Parent profile image URL' 
  })
  imageUrl?: string;

  @ApiPropertyOptional({ 
    example: 'Software Engineer', 
    description: 'Parent occupation' 
  })
  occupation?: string;

  @ApiPropertyOptional({ 
    example: 'Tech Company Ltd', 
    description: 'Parent workplace' 
  })
  workplace?: string;

  @ApiProperty({ 
    example: 'father', 
    description: 'Relationship to student',
    enum: ['father', 'mother', 'guardian']
  })
  relationship: 'father' | 'mother' | 'guardian';

  @ApiProperty({ 
    example: '456', 
    description: 'Student user ID' 
  })
  studentId: string;

  @ApiProperty({ 
    example: 'Jane Doe', 
    description: 'Student full name' 
  })
  studentName: string;

  @ApiPropertyOptional({ 
    example: 'STU2024001', 
    description: 'Institute-specific student ID' 
  })
  studentIdByInstitute?: string;

  constructor(
    parent: any,
    student: any,
    relationship: 'father' | 'mother' | 'guardian'
  ) {
    this.id = parent.id || parent.userId;
    this.name = parent.name || 
      `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || 
      parent.email || 'Unknown Parent';
    this.email = parent.email;
    this.phoneNumber = parent.phoneNumber || parent.phone_number;
    this.imageUrl = parent.imageUrl || parent.image_url;
    this.occupation = parent.occupation;
    this.workplace = parent.workplace;
    this.relationship = relationship;
    this.studentId = student.userId || student.user_id;
    this.studentName = student.name || 
      `${student.firstName || ''} ${student.lastName || ''}`.trim() || 
      student.email || 'Unknown Student';
    this.studentIdByInstitute = student.studentId || student.student_id;
  }
}

/**
 * Query DTO for class parent endpoints with filtering and pagination
 */
export class ClassParentQueryDto {
  @ApiPropertyOptional({ 
    example: 1, 
    description: 'Page number (default: 1)' 
  })
  page?: number = 1;

  @ApiPropertyOptional({ 
    example: 10, 
    description: 'Items per page (default: 10, max: 100)' 
  })
  limit?: number = 10;

  @ApiPropertyOptional({ 
    example: '123', 
    description: 'Filter by specific student ID' 
  })
  studentId?: string;

  @ApiPropertyOptional({ 
    example: 'father', 
    description: 'Filter by relationship type',
    enum: ['father', 'mother', 'guardian']
  })
  relationship?: 'father' | 'mother' | 'guardian';

  @ApiPropertyOptional({ 
    example: 'John', 
    description: 'Search by parent name (partial match)' 
  })
  parentName?: string;

  @ApiPropertyOptional({ 
    example: 'Jane', 
    description: 'Search by student name (partial match)' 
  })
  studentName?: string;
}

/**
 * Paginated response for class parents
 */
export class PaginatedClassParentResponseDto {
  @ApiProperty({ 
    type: [ClassParentResponseDto], 
    description: 'Array of parent data' 
  })
  data: ClassParentResponseDto[];

  @ApiProperty({
    type: 'object',
    properties: {
      total: { type: 'number', example: 100, description: 'Total number of records' },
      page: { type: 'number', example: 1, description: 'Current page number' },
      limit: { type: 'number', example: 10, description: 'Items per page' },
      totalPages: { type: 'number', example: 10, description: 'Total number of pages' }
    }
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
