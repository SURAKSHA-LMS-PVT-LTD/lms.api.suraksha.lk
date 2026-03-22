import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export class SecureUnverifiedStudentResponseDto {
  @ApiProperty({ description: 'Student user ID', example: '123' })
  @Expose()
  studentUserId: string;

  @ApiProperty({ description: 'Student full name', example: 'John Doe' })
  @Expose()
  studentName: string;

  @ApiProperty({ description: 'Student email', example: 'john.doe@example.com' })
  @Expose()
  studentEmail: string;

  @ApiProperty({ description: 'Masked phone number', example: '+1***-***-1234' })
  @Expose()
  phoneNumber: string;

  @ApiProperty({ description: 'Student profile image URL (if available)', required: false })
  @Expose()
  imageUrl?: string;

  @ApiProperty({ description: 'Enrollment method', example: 'self_enrollment' })
  @Expose()
  enrollmentMethod: string;

  @ApiProperty({ description: 'Date of enrollment request', example: '2024-08-30T10:00:00Z' })
  @Expose()
  enrollmentDate: Date;

  @ApiProperty({ description: 'Additional enrollment information (if provided)', required: false })
  @Expose()
  enrollmentReason?: string;

  @ApiProperty({ description: 'Student ID assigned by institute (if available)', required: false })
  @Expose()
  instituteStudentId?: string;

  // Exclude sensitive information
  @Exclude()
  passwordHash: string;

  @Exclude()
  privateNotes: string;

  constructor(partial: Partial<SecureUnverifiedStudentResponseDto>) {
    Object.assign(this, partial);
  }
}

export class PaginatedUnverifiedStudentsResponseDto {
  @ApiProperty({ 
    description: 'Array of unverified students',
    type: [SecureUnverifiedStudentResponseDto]
  })
  data: SecureUnverifiedStudentResponseDto[];

  @ApiProperty({ 
    description: 'Pagination metadata',
    example: {
      total: 25,
      page: 1,
      limit: 10,
      totalPages: 3
    }
  })
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export class VerificationResultDto {
  @ApiProperty({ description: 'Number of students approved', example: 5 })
  approved: number;

  @ApiProperty({ description: 'Number of students rejected', example: 2 })
  rejected: number;

  @ApiProperty({ description: 'Number of verification attempts that failed', example: 0 })
  failed: number;

  @ApiProperty({ 
    description: 'Details of verification results',
    example: [
      { studentUserId: '123', status: 'approved', message: 'Successfully verified' },
      { studentUserId: '456', status: 'rejected', message: 'Missing documentation' }
    ]
  })
  details: Array<{
    studentUserId: string;
    status: 'approved' | 'rejected' | 'failed';
    message: string;
  }>;
}

export class ClassEnrollmentStatsDto {
  @ApiProperty({ description: 'Total enrolled students', example: 25 })
  totalEnrolled: number;

  @ApiProperty({ description: 'Verified students', example: 20 })
  verified: number;

  @ApiProperty({ description: 'Pending verification', example: 5 })
  pendingVerification: number;

  @ApiProperty({ description: 'Students enrolled by teachers/admins', example: 15 })
  teacherAssigned: number;

  @ApiProperty({ description: 'Students self-enrolled', example: 10 })
  selfEnrolled: number;

  @ApiProperty({ description: 'Class capacity (if set)', example: 30, required: false })
  classCapacity?: number;

  @ApiProperty({ description: 'Available spots', example: 5, required: false })
  availableSpots?: number;
}
