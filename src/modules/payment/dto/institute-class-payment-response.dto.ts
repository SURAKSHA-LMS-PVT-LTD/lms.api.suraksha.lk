import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentTargetType, PaymentPriority, PaymentStatus } from '../entities/institute-class-payment.entity';
import { SubmissionStatus } from '../entities/institute-class-payment-submission.entity';
import { UserType } from '../../user/enums/user-type.enum';

export class InstituteClassPaymentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() instituteId: string;
  @ApiProperty() classId: string;
  @ApiPropertyOptional() createdBy?: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ enum: PaymentTargetType }) targetType: PaymentTargetType;
  @ApiProperty({ enum: PaymentPriority }) priority: PaymentPriority;
  @ApiProperty() amount: number;
  @ApiPropertyOptional() documentUrl?: string;
  @ApiProperty() lastDate: Date;
  @ApiProperty({ enum: PaymentStatus }) status: PaymentStatus;
  @ApiPropertyOptional() notes?: string;
  @ApiProperty() bankName: string;
  @ApiProperty() accountHolderName: string;
  @ApiProperty() accountHolderNumber: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiPropertyOptional() submissionsCount?: number;
  @ApiPropertyOptional() verifiedSubmissionsCount?: number;
  @ApiPropertyOptional() pendingSubmissionsCount?: number;
}

export class InstituteClassPaymentSubmissionResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() paymentId: string;
  @ApiProperty() userId: string;
  @ApiProperty({ enum: UserType }) userType: UserType;
  @ApiProperty() username: string;
  @ApiProperty() paymentDate: string | Date | null;
  @ApiProperty() receiptUrl: string;
  @ApiProperty() receiptFilename: string;
  @ApiPropertyOptional() transactionId?: string;
  @ApiProperty() submittedAmount: number;
  @ApiProperty({ enum: SubmissionStatus }) status: SubmissionStatus;
  @ApiPropertyOptional() verifiedBy?: string;
  @ApiPropertyOptional() verifiedAt?: string | Date | null;
  @ApiPropertyOptional() rejectionReason?: string;
  @ApiPropertyOptional() notes?: string;
  @ApiProperty() uploadedAt: string | Date | null;
  @ApiProperty() updatedAt: string | Date | null;
}

export class ClassPaymentCreationSuccessResponseDto {
  @ApiProperty() success: boolean;
  @ApiProperty() message: string;
  @ApiProperty() data: { paymentId: string; status: PaymentStatus; };
}

export class ClassSubmissionCreationSuccessResponseDto {
  @ApiProperty() success: boolean;
  @ApiProperty() message: string;
  @ApiProperty() data: { submissionId: string; status: SubmissionStatus; receiptFile: string; };
}

export class PaginatedClassPaymentsResponseDto {
  @ApiProperty({ type: [InstituteClassPaymentResponseDto] }) data: InstituteClassPaymentResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
}

export class PaginatedClassSubmissionsResponseDto {
  @ApiProperty({ type: [InstituteClassPaymentSubmissionResponseDto] }) data: InstituteClassPaymentSubmissionResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
}

export class ClassPaymentSubmissionStatusResponseDto {
  @ApiProperty() hasSubmission: boolean;
  @ApiPropertyOptional({ type: InstituteClassPaymentSubmissionResponseDto }) submission?: InstituteClassPaymentSubmissionResponseDto;
  @ApiProperty({ type: InstituteClassPaymentResponseDto }) payment: InstituteClassPaymentResponseDto;
}
