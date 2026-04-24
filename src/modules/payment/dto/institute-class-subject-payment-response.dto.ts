import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentTargetType, PaymentPriority, PaymentStatus } from '../entities/institute-class-subject-payment.entity';
import { SubmissionStatus } from '../entities/institute-class-subject-payment-submission.entity';
import { UserType } from '../../user/enums/user-type.enum';

export class InstituteClassSubjectPaymentResponseDto {
  @ApiProperty({ description: 'Payment ID' })
  id: string;

  @ApiProperty({ description: 'Institute ID' })
  instituteId: string;

  @ApiProperty({ description: 'Class ID' })
  classId: string;

  @ApiProperty({ description: 'Subject ID' })
  subjectId: string;

  @ApiProperty({ description: 'Created by user ID' })
  createdBy: string;

  @ApiProperty({ description: 'Payment title' })
  title: string;

  @ApiProperty({ description: 'Payment description' })
  description: string;

  @ApiProperty({ description: 'Payment target type', enum: PaymentTargetType })
  targetType: PaymentTargetType;

  @ApiProperty({ description: 'Payment priority', enum: PaymentPriority })
  priority: PaymentPriority;

  @ApiProperty({ description: 'Payment amount' })
  amount: number;

  @ApiPropertyOptional({ description: 'Document URL' })
  documentUrl?: string;

  @ApiProperty({ description: 'Last submission date' })
  lastDate: Date;

  @ApiProperty({ description: 'Payment status', enum: PaymentStatus })
  status: PaymentStatus;

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes?: string;

  @ApiProperty({ description: 'Bank name for payment transfer' })
  bankName: string;

  @ApiProperty({ description: 'Account holder name' })
  accountHolderName: string;

  @ApiProperty({ description: 'Account holder number / Account ID' })
  accountHolderNumber: string;

  @ApiProperty({ description: 'Created at' })
  createdAt: Date;

  @ApiProperty({ description: 'Updated at' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Total submissions count' })
  submissionsCount?: number;

  @ApiPropertyOptional({ description: 'Verified submissions count' })
  verifiedSubmissionsCount?: number;

  @ApiPropertyOptional({ description: 'Pending submissions count' })
  pendingSubmissionsCount?: number;
}

export class InstituteClassSubjectPaymentSubmissionResponseDto {
  @ApiProperty({ description: 'Submission ID' })
  id: string;

  @ApiProperty({ description: 'Payment ID' })
  paymentId: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'User type', enum: UserType })
  userType: UserType;

  @ApiProperty({ description: 'Username' })
  username: string;

  @ApiProperty({ description: 'Payment date (ISO string)' })
  paymentDate: string | Date | null;

  @ApiProperty({ description: 'Receipt file URL' })
  receiptUrl: string;

  @ApiProperty({ description: 'Receipt filename' })
  receiptFilename: string;

  @ApiPropertyOptional({ description: 'Transaction ID' })
  transactionId?: string;

  @ApiProperty({ description: 'Submitted amount' })
  submittedAmount: number;

  @ApiProperty({ description: 'Submission status', enum: SubmissionStatus })
  status: SubmissionStatus;

  @ApiPropertyOptional({ description: 'Verified by user ID' })
  verifiedBy?: string;

  @ApiPropertyOptional({ description: 'Verification date (ISO string)' })
  verifiedAt?: string | Date | null;

  @ApiPropertyOptional({ description: 'Rejection reason' })
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes?: string;

  @ApiProperty({ description: 'Uploaded at (ISO string)' })
  uploadedAt: string | Date | null;

  @ApiProperty({ description: 'Updated at (ISO string)' })
  updatedAt: string | Date | null;
}

export class PaymentCreationSuccessResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ 
    description: 'Payment creation data',
    type: 'object',
    properties: {
      paymentId: { type: 'string', description: 'Payment ID' },
      status: { enum: PaymentStatus, description: 'Payment status' }
    }
  })
  data: {
    paymentId: string;
    status: PaymentStatus;
  };
}

export class SubmissionCreationSuccessResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ 
    description: 'Submission creation data',
    type: 'object',
    properties: {
      submissionId: { type: 'string', description: 'Submission ID' },
      status: { enum: SubmissionStatus, description: 'Submission status' },
      receiptFile: { type: 'string', description: 'Uploaded receipt filename' }
    }
  })
  data: {
    submissionId: string;
    status: SubmissionStatus;
    receiptFile: string;
  };
}

export class PaginatedPaymentsResponseDto {
  @ApiProperty({ type: [InstituteClassSubjectPaymentResponseDto] })
  data: InstituteClassSubjectPaymentResponseDto[];

  @ApiProperty({ description: 'Total count' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total pages' })
  totalPages: number;
}

export class PaginatedSubmissionsResponseDto {
  @ApiProperty({ type: [InstituteClassSubjectPaymentSubmissionResponseDto] })
  data: InstituteClassSubjectPaymentSubmissionResponseDto[];

  @ApiProperty({ description: 'Total count' })
  total: number;

  @ApiProperty({ description: 'Current page' })
  page: number;

  @ApiProperty({ description: 'Items per page' })
  limit: number;

  @ApiProperty({ description: 'Total pages' })
  totalPages: number;
}

export class PaymentSubmissionStatusResponseDto {
  @ApiProperty({ description: 'Has user submitted for this payment' })
  hasSubmission: boolean;

  @ApiPropertyOptional({ description: 'User submission details if exists', type: InstituteClassSubjectPaymentSubmissionResponseDto })
  submission?: InstituteClassSubjectPaymentSubmissionResponseDto;

  @ApiProperty({ description: 'Payment details', type: InstituteClassSubjectPaymentResponseDto })
  payment: InstituteClassSubjectPaymentResponseDto;
}

export class UserSubmissionDetailsResponseDto {
  @ApiProperty({ description: 'Submission ID' })
  id: string;

  @ApiProperty({ description: 'Payment ID' })
  paymentId: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'User type', enum: UserType })
  userType: UserType;

  @ApiProperty({ description: 'Username' })
  username: string;

  @ApiProperty({ description: 'Payment date' })
  paymentDate: Date;

  @ApiProperty({ description: 'Receipt URL' })
  receiptUrl: string;

  @ApiProperty({ description: 'Original receipt filename' })
  receiptFilename: string;

  @ApiPropertyOptional({ description: 'Transaction ID' })
  transactionId?: string;

  @ApiProperty({ description: 'Submitted amount' })
  submittedAmount: number;

  @ApiProperty({ description: 'Submission status', enum: SubmissionStatus })
  status: SubmissionStatus;

  @ApiPropertyOptional({ description: 'Verified by user ID' })
  verifiedBy?: string;

  @ApiPropertyOptional({ description: 'Verified at timestamp' })
  verifiedAt?: Date;

  @ApiPropertyOptional({ description: 'Rejection reason' })
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes?: string;

  @ApiProperty({ description: 'Uploaded at' })
  uploadedAt: Date;

  @ApiProperty({ description: 'Updated at' })
  updatedAt: Date;
}
