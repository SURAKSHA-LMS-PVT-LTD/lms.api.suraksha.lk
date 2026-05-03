import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length, IsOptional } from 'class-validator';

export class SelfEnrollDto {
  @ApiProperty({
    description: 'Institute ID',
    example: '1'
  })
  @IsString()
  @IsNotEmpty()
  instituteId: string;

  @ApiProperty({
    description: 'Class ID',
    example: '40'
  })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiProperty({
    description: 'Subject ID',
    example: '5'
  })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiPropertyOptional({
    description: 'Enrollment key for the subject (not required when payment-gated enrollment is configured without a key)',
    example: 'MATH10-ABC123',
    minLength: 3,
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @Length(3, 50)
  enrollmentKey?: string;

  @ApiPropertyOptional({
    description: 'Target student user ID (for parents enrolling on behalf of their child)',
    example: '500341'
  })
  @IsString()
  @IsOptional()
  targetStudentId?: string;
}

export class SelfEnrollResponseDto {
  @ApiProperty({
    description: 'Success message',
    example: 'Successfully enrolled in Mathematics for Class 10A. Awaiting verification.'
  })
  message: string;

  @ApiProperty({
    description: 'Institute ID',
    example: '1'
  })
  instituteId: string;

  @ApiProperty({
    description: 'Class ID',
    example: '40'
  })
  classId: string;

  @ApiProperty({
    description: 'Subject ID',
    example: '5'
  })
  subjectId: string;

  @ApiProperty({
    description: 'Subject name',
    example: 'Mathematics'
  })
  subjectName: string;

  @ApiProperty({
    description: 'Class name',
    example: 'Grade 10A'
  })
  className: string;

  @ApiProperty({
    description: 'Enrollment method',
    example: 'self_enrolled'
  })
  enrollmentMethod: string;

  @ApiProperty({
    description: 'Verification status',
    example: 'pending',
    enum: ['verified', 'pending', 'rejected', 'pending_payment', 'payment_rejected', 'enrolled_free_card']
  })
  verificationStatus: string;

  @ApiProperty({
    description: 'Enrollment timestamp',
    example: '2025-08-30T10:15:30Z'
  })
  enrolledAt: Date;

  @ApiProperty({
    description: 'Whether payment is required for this enrollment',
    example: true
  })
  paymentRequired?: boolean;

  @ApiProperty({
    description: 'Fee amount if payment is required',
    example: 5000.00
  })
  feeAmount?: number;

  @ApiProperty({
    description: 'Payment submission ID if auto-created',
    example: '123'
  })
  enrollmentPaymentId?: string;

  @ApiProperty({
    description: 'Student enrollment type based on class-level pre-approval',
    example: 'free_card',
    enum: ['normal', 'paid', 'free_card', 'half_paid', 'quarter_paid']
  })
  studentType?: 'normal' | 'paid' | 'free_card' | 'half_paid' | 'quarter_paid';

  @ApiPropertyOptional({ description: 'Title of the class-level payment required for enrollment', example: 'Monthly Class Fee – January' })
  enrollmentPaymentTitle?: string;

  @ApiPropertyOptional({ description: 'Amount of the required class payment in LKR', example: 2500 })
  enrollmentPaymentAmount?: number;

  @ApiPropertyOptional({ description: 'Due date of the required class payment (ISO 8601)', example: '2026-01-31T00:00:00.000Z' })
  enrollmentPaymentDueDate?: string;
}
