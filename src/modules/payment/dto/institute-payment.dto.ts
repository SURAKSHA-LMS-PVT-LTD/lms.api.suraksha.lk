import { IsNotEmpty, IsString, IsNumber, IsOptional, IsEnum, IsIn, IsDateString, IsBoolean, IsInt, Min, Max, ValidateNested, Length, Matches, IsEmail, IsUrl, MaxLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaymentTargetType, PaymentPriority } from '../entities/institute-payment.entity';
import { PaymentMethodType } from '../entities/institute-payment-submission.entity';
import { getCurrentSriLankaTime } from '../../../common/utils/timezone.util';

// Enhanced Bank Details DTO with comprehensive validation
export class BankDetailsDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().replace(/[^a-zA-Z0-9\s]/g, '') : value)
  bankName?: string;

  @IsOptional()
  @IsString()
  @Length(8, 20)
  @Matches(/^[0-9]+$/, { message: 'Account number must contain only digits' })
  @Transform(({ value }) => typeof value === 'string' ? value.replace(/\D/g, '') : value)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @Length(11, 11)
  @Matches(/^[A-Z]{4}[0-9]{7}$/, { message: 'IFSC code must be in format ABCD0123456' })
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : value)
  ifscCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().replace(/[^a-zA-Z\s]/g, '') : value)
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  @Matches(/^[a-zA-Z0-9.\-_@]+$/, { message: 'UPI ID contains invalid characters' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  upiId?: string;
}

// Enhanced Create Institute Payment DTO
export class CreateInstitutePaymentDto {
  @IsNotEmpty()
  @IsString()
  @Length(3, 100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  paymentType: string;

  @IsNotEmpty()
  @IsString()
  @Length(10, 1000)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  description: string;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  amount: number;

  @IsNotEmpty()
  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      return date.toISOString();
    }
    return value;
  })
  dueDate: string;

  @IsOptional()
  @IsEnum(PaymentTargetType)
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  targetType?: PaymentTargetType;

  @IsOptional()
  @IsEnum(PaymentPriority)
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  priority?: PaymentPriority;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  paymentInstructions?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankDetailsDto)
  bankDetails?: BankDetailsDto;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  lateFeeAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  @Transform(({ value }) => parseInt(value))
  lateFeeAfterDays?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  autoReminderEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  @Transform(({ value }) => parseInt(value))
  reminderDaysBefore?: number;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  notes?: string;
}

// Enhanced Update Institute Payment DTO
export class UpdateInstitutePaymentDto {
  @IsOptional()
  @IsString()
  @Length(3, 100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  paymentType?: string;

  @IsOptional()
  @IsString()
  @Length(10, 1000)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  amount?: number;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      return date.toISOString();
    }
    return value;
  })
  dueDate?: string;

  @IsOptional()
  @IsEnum(PaymentTargetType)
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  targetType?: PaymentTargetType;

  @IsOptional()
  @IsEnum(PaymentPriority)
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  priority?: PaymentPriority;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  paymentInstructions?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BankDetailsDto)
  bankDetails?: BankDetailsDto;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  lateFeeAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  @Transform(({ value }) => parseInt(value))
  lateFeeAfterDays?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  autoReminderEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  @Transform(({ value }) => parseInt(value))
  reminderDaysBefore?: number;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  notes?: string;
}

// Enhanced Create Institute Payment Submission DTO
export class CreateInstitutePaymentSubmissionDto {
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  paymentAmount: number;

  @IsNotEmpty()
  @IsEnum(PaymentMethodType)
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  paymentMethod: PaymentMethodType;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  @Matches(/^[A-Za-z0-9\-_]+$/, { message: 'Transaction reference can only contain alphanumeric characters, hyphens, and underscores' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  transactionReference?: string;

  @IsNotEmpty()
  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      // Ensure payment date is not in future
      if (date > new Date()) {
        throw new Error('Payment date cannot be in the future');
      }
      return date.toISOString();
    }
    return value;
  })
  paymentDate: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  paymentRemarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptUrl?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  lateFeeApplied?: number;
}

// Enhanced Verify Payment Submission DTO
export class VerifyInstitutePaymentSubmissionDto {
  @IsNotEmpty()
  @IsIn(['VERIFIED', 'HALF_VERIFIED', 'QUARTER_VERIFIED', 'REJECTED'])
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toUpperCase();
    }
    return value;
  })
  status: 'VERIFIED' | 'HALF_VERIFIED' | 'QUARTER_VERIFIED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @Length(0, 500)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  notes?: string;
}

// Enhanced Query DTOs with validation
export class GetInstitutePaymentsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Transform(({ value }) => parseInt(value) || 1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value) || 10)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'EXPIRED'])
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  status?: 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

  @IsOptional()
  @IsEnum(PaymentTargetType)
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  targetType?: PaymentTargetType;

  @IsOptional()
  @IsEnum(PaymentPriority)
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  priority?: PaymentPriority;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? value : date.toISOString();
    }
    return value;
  })
  dueDateFrom?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? value : date.toISOString();
    }
    return value;
  })
  dueDateTo?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  search?: string;
}

export class GetInstitutePaymentSubmissionsQueryDto {
  // Pagination
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Transform(({ value }) => parseInt(value) || 1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Transform(({ value }) => parseInt(value) || 10)
  limit?: number = 10;

  // Status filtering
  @IsOptional()
  @IsIn(['PENDING', 'VERIFIED', 'HALF_VERIFIED', 'QUARTER_VERIFIED', 'REJECTED'])
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  status?: 'PENDING' | 'VERIFIED' | 'HALF_VERIFIED' | 'QUARTER_VERIFIED' | 'REJECTED';

  // Payment method filtering
  @IsOptional()
  @IsEnum(PaymentMethodType)
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : value)
  paymentMethod?: PaymentMethodType;

  // Date range filtering - Payment Date
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      // Set to start of day
      date.setHours(0, 0, 0, 0);
      return date.toISOString();
    }
    return value;
  })
  paymentDateFrom?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      // Set to end of day
      date.setHours(23, 59, 59, 999);
      return date.toISOString();
    }
    return value;
  })
  paymentDateTo?: string;

  // Date range filtering - Submission Created Date
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      date.setHours(0, 0, 0, 0);
      return date.toISOString();
    }
    return value;
  })
  submissionDateFrom?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      date.setHours(23, 59, 59, 999);
      return date.toISOString();
    }
    return value;
  })
  submissionDateTo?: string;

  // Date range filtering - Verification Date
  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      date.setHours(0, 0, 0, 0);
      return date.toISOString();
    }
    return value;
  })
  verificationDateFrom?: string;

  @IsOptional()
  @IsDateString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      date.setHours(23, 59, 59, 999);
      return date.toISOString();
    }
    return value;
  })
  verificationDateTo?: string;

  // Amount range filtering
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  })
  amountFrom?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : num;
  })
  amountTo?: number;

  // Text search - Transaction reference or payment remarks
  @IsOptional()
  @IsString()
  @Length(0, 100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  search?: string;

  // Student filtering (for admin view)
  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  studentId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  studentName?: string;

  // Sorting options
  @IsOptional()
  @IsEnum(['paymentDate', 'submissionDate', 'verificationDate', 'amount', 'status', 'studentName'])
  @Transform(({ value }) => typeof value === 'string' ? value : 'submissionDate')
  sortBy?: 'paymentDate' | 'submissionDate' | 'verificationDate' | 'amount' | 'status' | 'studentName' = 'submissionDate';

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  @Transform(({ value }) => typeof value === 'string' ? value.toUpperCase() : 'DESC')
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  // Special filters
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  hasLateFee?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  hasAttachment?: boolean;
}

// DTO for admin to manually verify/record payment for a specific student
export class AdminVerifyStudentPaymentDto {
  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  @Transform(({ value }) => {
    const num = parseFloat(value);
    return isNaN(num) ? value : Math.round(num * 100) / 100;
  })
  amount: number;

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  notes?: string;

  @IsOptional()
  @IsIn(['full', 'half', 'quarter'])
  paymentTier?: 'full' | 'half' | 'quarter';
}
