import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsNumber, IsString, IsArray, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateEnrollmentSettingsDto {
  @ApiProperty({
    description: 'Enable or disable self-enrollment for the subject',
    example: true
  })
  @IsBoolean()
  enrollmentEnabled: boolean;

  @ApiPropertyOptional({ description: 'Explicit enrollment key to set (null to clear key). When provided, overrides auto-generation.', example: 'MATH2026' })
  @IsOptional()
  @IsString()
  enrollmentKey?: string | null;

  @ApiPropertyOptional({
    description: 'Whether payment is required for enrollment',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  enrollmentFeeRequired?: boolean;

  @ApiPropertyOptional({
    description: 'Fee amount for enrollment (required if enrollmentFeeRequired is true)',
    example: 5000.00
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  enrollmentFeeAmount?: number;

  @ApiPropertyOptional({ description: 'Class-level payment ID that gates self-enrollment', example: '42' })
  @IsOptional()
  @IsString()
  enrollmentPaymentRefId?: string;

  @ApiPropertyOptional({ description: 'Allowed submission statuses for payment-gated enrollment', example: ['VERIFIED', 'HALF_VERIFIED'] })
  @IsOptional()
  @IsArray()
  enrollmentPaymentStatuses?: string[];
}

export class EnrollmentSettingsResponseDto {
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
    description: 'Whether enrollment is enabled',
    example: true
  })
  enrollmentEnabled: boolean;

  @ApiProperty({
    description: 'Enrollment key (only returned when enrollment is enabled and user is teacher)',
    example: 'MATH10-ABC123',
    required: false
  })
  @IsOptional()
  enrollmentKey?: string;

  @ApiProperty({
    description: 'Current number of enrolled students',
    example: 25
  })
  currentEnrollmentCount: number;

  @ApiProperty({
    description: 'When the settings were last updated',
    example: '2025-08-30T10:15:30Z'
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Whether payment is required for enrollment',
    example: true
  })
  enrollmentFeeRequired?: boolean;

  @ApiPropertyOptional({
    description: 'Fee amount for enrollment',
    example: 5000.00
  })
  enrollmentFeeAmount?: number;

  @ApiPropertyOptional({ description: 'Class-level payment ID that gates self-enrollment' })
  enrollmentPaymentRefId?: string;

  @ApiPropertyOptional({ description: 'Allowed submission statuses for payment-gated enrollment' })
  enrollmentPaymentStatuses?: string[];
}
