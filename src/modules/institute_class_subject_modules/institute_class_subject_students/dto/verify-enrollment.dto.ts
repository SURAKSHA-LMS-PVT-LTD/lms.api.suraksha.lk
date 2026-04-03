import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength, IsArray, ArrayNotEmpty } from 'class-validator';

// DTO for verifying a single student enrollment
export class VerifyEnrollmentDto {
  @ApiProperty({
    description: 'Student ID to verify',
    example: '123'
  })
  @IsString()
  @IsNotEmpty()
  studentId: string;
}

// DTO for rejecting a single student enrollment
export class RejectEnrollmentDto {
  @ApiProperty({
    description: 'Student ID to reject',
    example: '123'
  })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiPropertyOptional({
    description: 'Reason for rejecting the enrollment',
    example: 'Student does not meet the prerequisites for this subject',
    maxLength: 500
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  rejectionReason?: string;
}

// DTO for bulk verification
export class BulkVerifyEnrollmentDto {
  @ApiProperty({
    description: 'Array of student IDs to verify',
    example: ['123', '456', '789'],
    type: [String]
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  studentIds: string[];
}

// DTO for bulk rejection
export class BulkRejectEnrollmentDto {
  @ApiProperty({
    description: 'Array of student IDs to reject',
    example: ['123', '456'],
    type: [String]
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  studentIds: string[];

  @ApiPropertyOptional({
    description: 'Reason for rejecting the enrollments',
    example: 'Students do not meet the prerequisites',
    maxLength: 500
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  rejectionReason?: string;
}

// Response for unverified students list
export class UnverifiedStudentResponseDto {
  @ApiProperty({ description: 'Institute ID', example: '1' })
  instituteId: string;

  @ApiProperty({ description: 'Class ID', example: '40' })
  classId: string;

  @ApiProperty({ description: 'Subject ID', example: '5' })
  subjectId: string;

  @ApiProperty({ description: 'Student ID', example: '123' })
  studentId: string;

  @ApiProperty({ description: 'Student first name', example: 'John' })
  studentFirstName?: string;

  @ApiProperty({ description: 'Student last name', example: 'Doe' })
  studentLastName?: string;

  @ApiProperty({ description: 'Student email', example: 'john@example.com' })
  studentEmail?: string;

  @ApiProperty({ description: 'Student image URL', required: false })
  studentImageUrl?: string;

  @ApiProperty({ description: 'Enrollment method', example: 'self_enrolled' })
  enrollmentMethod: string;

  @ApiProperty({ description: 'Verification status', example: 'pending' })
  verificationStatus: string;

  @ApiProperty({ description: 'Student type', example: 'paid', enum: ['paid', 'free_card'] })
  studentType: string;

  @ApiProperty({ description: 'When the student enrolled', example: '2025-08-30T10:15:30Z' })
  enrolledAt: Date;
}

// Response for verification/rejection actions
export class VerificationActionResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Student enrollment verified successfully'
  })
  message: string;

  @ApiProperty({ description: 'Institute ID', example: '1' })
  instituteId: string;

  @ApiProperty({ description: 'Class ID', example: '40' })
  classId: string;

  @ApiProperty({ description: 'Subject ID', example: '5' })
  subjectId: string;

  @ApiProperty({ description: 'Student ID', example: '123' })
  studentId: string;

  @ApiProperty({ description: 'New verification status', example: 'verified' })
  verificationStatus: string;

  @ApiProperty({ description: 'Verified/rejected by user ID', example: '100' })
  actionBy: string;

  @ApiProperty({ description: 'Action timestamp' })
  actionAt: Date;

  @ApiPropertyOptional({ description: 'Rejection reason (only for rejections)' })
  rejectionReason?: string;
}

// Response for bulk verification/rejection
export class BulkVerificationResponseDto {
  @ApiProperty({
    description: 'Summary message',
    example: 'Successfully verified 3 students'
  })
  message: string;

  @ApiProperty({ description: 'Number of successful actions', example: 3 })
  successCount: number;

  @ApiProperty({ description: 'Number of failed actions', example: 0 })
  failedCount: number;

  @ApiProperty({ description: 'New verification status applied', example: 'verified' })
  verificationStatus: string;

  @ApiProperty({
    description: 'Details of successful actions',
    type: [Object]
  })
  successful: { studentId: string; studentName: string }[];

  @ApiProperty({
    description: 'Details of failed actions',
    type: [Object]
  })
  failed: { studentId: string; reason: string }[];
}
