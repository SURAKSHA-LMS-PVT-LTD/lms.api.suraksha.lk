import { IsString, IsOptional, IsDateString, IsEnum, IsNumber, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EnrollmentStatus } from '../entities/student-bookhire-enrollment.entity';

export class CreateStudentBookhireEnrollmentDto {
  @ApiProperty({ description: 'Student ID' })
  @IsString()
  studentId: string;

  @ApiProperty({ description: 'Bookhire ID' })
  @IsNumber()
  @Type(() => Number)
  bookhireId: number;

  @ApiPropertyOptional({ description: 'Pickup location' })
  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @ApiPropertyOptional({ description: 'Drop-off location' })
  @IsOptional()
  @IsString()
  dropoffLocation?: string;

  @ApiPropertyOptional({ description: 'Monthly fee amount for this student' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  monthlyFee?: number;
}

export class UpdateStudentBookhireEnrollmentDto {
  @ApiPropertyOptional({ description: 'Student Card ID for attendance marking' })
  @IsOptional()
  @IsString()
  cardId?: string;

  @ApiPropertyOptional({ description: 'Start date for the enrollment' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date for the enrollment' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Enrollment status' })
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;

  @ApiPropertyOptional({ description: 'Parent contact number' })
  @IsOptional()
  @IsString()
  parentContact?: string;

  @ApiPropertyOptional({ description: 'Emergency contact number' })
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiPropertyOptional({ description: 'Pickup location' })
  @IsOptional()
  @IsString()
  pickupLocation?: string;

  @ApiPropertyOptional({ description: 'Drop-off location' })
  @IsOptional()
  @IsString()
  dropoffLocation?: string;

  @ApiPropertyOptional({ description: 'Monthly fee amount for this student' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  monthlyFee?: number;
}

export class EnrollmentStatusUpdateDto {
  @ApiProperty({ description: 'New enrollment status', enum: EnrollmentStatus })
  @IsEnum(EnrollmentStatus)
  status: EnrollmentStatus;

  @ApiPropertyOptional({ description: 'Reason for status change' })
  @IsOptional()
  @IsString()
  reason?: string;
}

// ========================================
// RESPONSE DTOs - Consistent API Responses
// ========================================

export class StudentBookhireEnrollmentResponseDto {
  @ApiProperty({ description: 'Enrollment ID' })
  id: string;

  @ApiProperty({ description: 'Student ID' })
  studentId: string;

  @ApiProperty({ description: 'Bookhire ID' })
  bookhireId: number;

  @ApiProperty({ description: 'Bookhire Title', required: false })
  bookhireTitle?: string;

  @ApiProperty({ description: 'Bookhire Vehicle Number', required: false })
  vehicleNumber?: string;

  @ApiProperty({ description: 'Bookhire Image URL', required: false })
  imageUrl?: string;

  @ApiProperty({ description: 'Enrollment date' })
  enrollmentDate: Date;

  @ApiProperty({ enum: EnrollmentStatus, description: 'Enrollment status' })
  status: EnrollmentStatus;

  @ApiProperty({ description: 'Pickup location', required: false })
  pickupLocation?: string;

  @ApiProperty({ description: 'Drop-off location', required: false })
  dropoffLocation?: string;

  @ApiProperty({ description: 'Monthly fee amount for this student', required: false })
  monthlyFee?: number;

  @ApiProperty({ description: 'Is enrollment active', required: false })
  isActive?: boolean;

  @ApiProperty({ description: 'Approved at timestamp', required: false })
  approvedAt?: Date;

  @ApiProperty({ description: 'Approved by user ID', required: false })
  approvedBy?: string;

  @ApiProperty({ description: 'Rejected at timestamp', required: false })
  rejectedAt?: Date;

  @ApiProperty({ description: 'Rejection reason', required: false })
  rejectionReason?: string;

  @ApiProperty({ description: 'Cancelled at timestamp', required: false })
  cancelledAt?: Date;

  @ApiProperty({ description: 'Cancellation reason', required: false })
  cancellationReason?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class StudentBookhireEnrollmentListResponseDto {
  @ApiProperty({ description: 'List of enrollments', type: [StudentBookhireEnrollmentResponseDto] })
  enrollments: StudentBookhireEnrollmentResponseDto[];

  @ApiProperty({ description: 'Total number of enrollments' })
  total: number;

  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  @ApiProperty({ description: 'Current page number' })
  currentPage: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;
}