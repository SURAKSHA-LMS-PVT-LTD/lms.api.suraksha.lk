import { IsNotEmpty, IsNumber, IsString, IsOptional, IsArray, IsEnum, Min, Max, Length, IsBoolean, ValidateNested, IsUUID, ArrayMaxSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RecipientFilterType } from '../entities/institute-sms-message.entity';
import { SmsMessageStatus } from '../entities/institute-sms-message.entity';
import { UserType } from '../../user/enums/user-type.enum';
import { SmsRecipient, SmsCredentials, SmsFilterCriteria, RecipientBreakdown } from '../interfaces/sms-internal.interface';

// Base DTOs
export class CustomRecipientDto {
  @ApiPropertyOptional({ 
    description: 'Phone number with country code (can use either "number" or "phoneNumber")',
    example: '+94771234567'
  })
  @IsOptional()
  @IsString()
  number?: string;

  @ApiPropertyOptional({ 
    description: 'Phone number with country code (alias for "number")',
    example: '+94771234567'
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ 
    description: 'Recipient name (optional)',
    example: 'John Doe'
  })
  @IsOptional()
  @IsString()
  name?: string;
}

export class SmsRecipientFilterDto {
  @ApiProperty({ 
    description: 'Array of recipient types (can select multiple: STUDENTS, PARENTS, TEACHERS, ADMIN)',
    enum: RecipientFilterType,
    isArray: true,
    example: [RecipientFilterType.STUDENTS, RecipientFilterType.PARENTS]
  })
  @IsNotEmpty()
  @IsArray()
  @IsEnum(RecipientFilterType, { each: true })
  recipientTypes: RecipientFilterType[];

  @ApiPropertyOptional({ 
    description: 'Filter by class IDs (UUID format required for security)',
    example: ['550e8400-e29b-41d4-a716-446655440000', '6ba7b810-9dad-11d1-80b4-00c04fd430c8'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each class ID must be a valid UUID' })
  @ArrayMaxSize(100, { message: 'Maximum 100 class IDs allowed' })
  classIds?: string[];

  @ApiPropertyOptional({ 
    description: 'Filter by subject IDs (UUID format required for security)',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each subject ID must be a valid UUID' })
  @ArrayMaxSize(100, { message: 'Maximum 100 subject IDs allowed' })
  subjectIds?: string[];
}

// Request DTOs
export class SendCustomSmsDto {
  @ApiProperty({ 
    description: 'SMS message template with placeholders',
    example: 'Hello {{name}}, welcome to our institute! Your admission is confirmed.',
    minLength: 1,
    maxLength: 1000
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 1000)
  messageTemplate: string;

  @ApiProperty({ 
    description: 'Array of custom recipients',
    type: [CustomRecipientDto]
  })
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomRecipientDto)
  customRecipients: CustomRecipientDto[];

  @ApiProperty({ 
    description: 'SMS mask ID to use (required)',
    example: 'MASK_12345',
    maxLength: 100
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  maskId: string;

  @ApiPropertyOptional({ 
    description: 'Send message now (if true, scheduledAt is ignored and message is sent immediately)',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  isNow?: boolean;

  @ApiPropertyOptional({ 
    description: 'Schedule message for later (optional, ignored if isNow is true)',
    example: '2024-12-31T10:00:00Z'
  })
  @IsOptional()
  scheduledAt?: Date;
}

export class SendBulkSmsDto {
  @ApiProperty({ 
    description: 'SMS message template with placeholders',
    example: 'Dear {{firstName}}, your class schedule has been updated. Please check your portal.',
    minLength: 1,
    maxLength: 1000
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 1000)
  messageTemplate: string;

  @ApiProperty({ 
    description: 'Array of recipient types (supports multiple: STUDENTS, PARENTS, TEACHERS, ADMIN)',
    enum: RecipientFilterType,
    isArray: true,
    example: [RecipientFilterType.STUDENTS, RecipientFilterType.PARENTS]
  })
  @IsNotEmpty()
  @IsArray()
  @IsEnum(RecipientFilterType, { each: true })
  recipientTypes: RecipientFilterType[];

  @ApiPropertyOptional({ 
    description: 'Filter by class IDs (UUID format required for security)',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each class ID must be a valid UUID' })
  @ArrayMaxSize(100, { message: 'Maximum 100 class IDs allowed' })
  classIds?: string[];

  @ApiPropertyOptional({ 
    description: 'Filter by subject IDs (UUID format required for security)',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each subject ID must be a valid UUID' })
  @ArrayMaxSize(100, { message: 'Maximum 100 subject IDs allowed' })
  subjectIds?: string[];

  @ApiProperty({ 
    description: 'SMS mask ID to use (required)',
    example: 'MASK_12345',
    maxLength: 100
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  maskId: string;

  @ApiPropertyOptional({ 
    description: 'Send message now (if true, scheduledAt is ignored and message is sent immediately)',
    example: true
  })
  @IsOptional()
  @IsBoolean()
  isNow?: boolean;

  @ApiPropertyOptional({ 
    description: 'Schedule message for later (optional, ignored if isNow is true)',
    example: '2024-12-31T10:00:00Z'
  })
  @IsOptional()
  scheduledAt?: Date;
}

export class GetRecipientCountDto {
  @ApiProperty({ 
    description: 'Array of recipient types (supports multiple: STUDENTS, PARENTS, TEACHERS, ADMIN)',
    enum: RecipientFilterType,
    isArray: true,
    example: [RecipientFilterType.STUDENTS, RecipientFilterType.PARENTS]
  })
  @IsNotEmpty()
  @IsArray()
  @IsEnum(RecipientFilterType, { each: true })
  recipientTypes: RecipientFilterType[];

  @ApiPropertyOptional({ 
    description: 'Filter by class IDs (UUID format required for security)',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each class ID must be a valid UUID' })
  @ArrayMaxSize(100, { message: 'Maximum 100 class IDs allowed' })
  classIds?: string[];

  @ApiPropertyOptional({ 
    description: 'Filter by subject IDs (UUID format required for security)',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String]
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each subject ID must be a valid UUID' })
  @ArrayMaxSize(100, { message: 'Maximum 100 subject IDs allowed' })
  subjectIds?: string[];
}

export class SmsPaymentSubmissionDto {
  @ApiProperty({ 
    description: 'Number of SMS credits requested',
    example: 1000,
    minimum: 1,
    maximum: 1000000
  })
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(1000000)
  requestedCredits: number;

  @ApiProperty({ 
    description: 'Payment amount',
    example: 50.00,
    minimum: 0.01,
    maximum: 100000
  })
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  @Max(100000)
  paymentAmount: number;

  @ApiProperty({ 
    description: 'Payment method',
    example: 'Bank Transfer',
    maxLength: 100
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  paymentMethod: string;

  @ApiPropertyOptional({ 
    description: 'Payment reference number',
    example: 'TXN123456789',
    maxLength: 200
  })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  paymentReference?: string;

  @ApiPropertyOptional({ 
    description: 'Additional notes for the submission',
    example: 'Payment made on 2024-10-07 via online banking',
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  submissionNotes?: string;

  // File upload properties (handled via /upload/verify-and-publish endpoint)
  @ApiPropertyOptional({ 
    description: 'Payment slip URL (relative path from cloud storage)',
    example: 'payment-receipts/payment-receipts-a3b690c9-8dc6-49ac-9570-9c8f47ab244b.pdf',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  paymentSlipUrl?: string;

  @ApiPropertyOptional({ 
    description: 'Payment slip filename',
    example: 'payment-receipts-a3b690c9-8dc6-49ac-9570-9c8f47ab244b.pdf',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @Length(0, 255)
  paymentSlipFilename?: string;
}

// Response DTOs
export class SmsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'SMS processing initiated. Credits will be deducted after successful delivery.' })
  message: string;

  @ApiProperty({ example: 'MSG_12345' })
  messageId: string;

  @ApiProperty({ example: 5 })
  totalRecipients: number;

  @ApiProperty({ example: 'QUEUED' })
  status: string;

  @ApiProperty({ example: 5 })
  estimatedCredits: number;

  @ApiProperty({ example: '15ms' })
  processingTime: string;

  // Enhanced credit information
  @ApiProperty({ example: 1000, required: false })
  currentCreditCount?: number;

  @ApiProperty({ example: 1.0, required: false })
  costPerMessage?: number;

  @ApiProperty({ example: 5.0, required: false })
  totalCost?: number;

  @ApiProperty({ example: 995.0, required: false })
  remainingCreditsAfter?: number;

  @ApiProperty({ example: false, required: false })
  requiresApproval?: boolean;

  @ApiProperty({ example: 1000, required: false })
  maxBulkCountAllowed?: number;

  @ApiProperty({ example: 'SMS', required: false })
  campaignType?: string;
}

export class RecipientCountResponseDto {
  @ApiProperty({ example: 150 })
  estimatedCount: number;

  @ApiProperty({
    type: 'object',
    properties: {
      students: { type: 'number', example: 100 },
      teachers: { type: 'number', example: 25 },
      parents: { type: 'number', example: 20 },
      admin: { type: 'number', example: 5 }
    }
  })
  breakdown: {
    students: number;
    teachers: number;
    parents: number;
    admin: number;
  };

  @ApiProperty({
    type: 'object',
    properties: {
      recipientTypes: { 
        type: 'array', 
        items: { type: 'string', enum: ['STUDENTS', 'PARENTS', 'TEACHERS', 'ADMIN', 'ALL', 'CUSTOM'] },
        example: ['STUDENTS', 'PARENTS'] 
      },
      classIds: { type: 'array', items: { type: 'string' }, example: ['1', '2'] },
      subjectIds: { type: 'array', items: { type: 'string' }, example: ['1'] },
      instituteId: { type: 'string', example: '12345' }
    }
  })
  filterDetails: SmsFilterCriteria;

  @ApiProperty({ example: true })
  cached: boolean;

  @ApiProperty({ example: 150 })
  estimatedCredits: number;
}

export class PaymentSubmissionResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: '12345' })
  submissionId: string;

  @ApiProperty({ example: 1000 })
  requestedCredits: number;

  @ApiProperty({ example: 50.00 })
  paymentAmount: number;

  @ApiProperty({ example: 'PENDING' })
  status: string;

  @ApiProperty({ example: 'Payment submission created successfully. Please wait for admin verification.' })
  message: string;
}

export class SmsCredentialsStatusDto {
  @ApiProperty({ example: 'PRE_APPROVED' })
  verificationStage: string;

  @ApiProperty({ example: 1000 })
  availableCredits: number;

  @ApiProperty({ example: 5000 })
  totalCreditsGranted: number;

  @ApiProperty({ example: 4000 })
  totalCreditsUsed: number;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'object',
      properties: {
        maskId: { type: 'string', example: 'MASK_12345' },
        displayName: { type: 'string', example: 'ABC Institute' },
        phoneNumber: { type: 'string', example: '+94771234567' },
        isActive: { type: 'boolean', example: true }
      }
    }
  })
  senderMasks: Array<{
    maskId: string;
    displayName: string;
    phoneNumber: string;
    isActive: boolean;
  }>;

  @ApiProperty({ example: true })
  isActive: boolean;
}

export class SmsStatisticsDto {
  @ApiProperty({ example: 'Last 30 days' })
  period: string;

  @ApiProperty({ example: 150 })
  totalMessages: number;

  @ApiProperty({ example: 5000 })
  totalRecipients: number;

  @ApiProperty({ example: 4950 })
  successfulSends: number;

  @ApiProperty({ example: 50 })
  failedSends: number;

  @ApiProperty({ example: 5000 })
  totalCreditsUsed: number;

  @ApiProperty({ example: '99.00%' })
  successRate: string;
}

// Internal DTOs for service communication
export class SmsProcessingContextDto {
  instituteId: string;
  userId: string;
  userType: UserType;
  messageType: string;
  recipientFilterType: RecipientFilterType;
  messageTemplate: string;
  recipients: SmsRecipient[];
  credentials: SmsCredentials;
  scheduledAt?: Date;
  filterCriteria?: SmsFilterCriteria;
  requestedMaskId: string;
}

export class SmsDeliveryResultDto {
  messageId: string;
  successful: number;
  failed: number;
  totalRecipients: number;
}

/**
 * DTO for payment verification by admin
 */
export class PaymentVerificationDto {
  @ApiProperty({ 
    description: 'Verification action',
    enum: ['APPROVE', 'REJECT'],
    example: 'APPROVE'
  })
  @IsNotEmpty({ message: 'Action is required' })
  @IsEnum(['APPROVE', 'REJECT'], { message: 'Action must be either APPROVE or REJECT' })
  action: 'APPROVE' | 'REJECT';

  @ApiProperty({ 
    description: 'Credits to grant (required for APPROVE)',
    example: 1000,
    required: false
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Credits to grant must be a number' })
  @Min(1, { message: 'Credits to grant must be at least 1' })
  creditsToGrant?: number;

  @ApiProperty({ 
    description: 'Admin notes for verification',
    example: 'Payment verified successfully',
    required: false
  })
  @IsOptional()
  @IsString({ message: 'Admin notes must be a string' })
  @Length(0, 1000, { message: 'Admin notes cannot exceed 1000 characters' })
  adminNotes?: string;

  @ApiProperty({ 
    description: 'Rejection reason (required for REJECT)',
    example: 'Invalid payment proof provided',
    required: false
  })
  @IsOptional()
  @IsString({ message: 'Rejection reason must be a string' })
  @Length(0, 500, { message: 'Rejection reason cannot exceed 500 characters' })
  rejectionReason?: string;
}

/**
 * Response DTO for SMS payment verification
 */
export class SmsPaymentVerificationResponseDto {
  @ApiProperty({ description: 'Verification success status', example: true })
  success: boolean;

  @ApiProperty({ description: 'Submission ID that was verified', example: 'sub_123456' })
  submissionId: string;

  @ApiProperty({ description: 'Verification action taken', example: 'APPROVE' })
  action: string;

  @ApiProperty({ description: 'Credits granted (if approved)', example: 1000, required: false })
  creditsGranted?: number;

  @ApiProperty({ description: 'Response message', example: 'Payment approved and credits granted' })
  message: string;

  @ApiProperty({ description: 'Verification timestamp', example: '2024-01-15T10:30:00Z' })
  verifiedAt: string;
}

/**
 * Response DTO for verification list
 */
export class VerificationListResponseDto {
  @ApiProperty({ description: 'List of pending verifications', type: [Object] })
  verifications: any[];

  @ApiProperty({ description: 'Total number of pending verifications', example: 25 })
  total: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages: number;
}

/**
 * Response DTO for institute payment submissions
 */
export class InstitutePaymentSubmissionsResponseDto {
  @ApiProperty({ description: 'List of payment submissions', type: [Object] })
  submissions: any[];

  @ApiProperty({ description: 'Total number of submissions', example: 15 })
  total: number;

  @ApiProperty({ description: 'Current page number', example: 1 })
  page: number;

  @ApiProperty({ description: 'Items per page', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 2 })
  totalPages: number;

  @ApiProperty({ description: 'Institute ID', example: '1' })
  instituteId: string;
}

/**
 * Response DTOs for message history
 */
export class SmsMessageHistoryItemDto {
  @ApiProperty({ example: '123456789' })
  id: string;

  @ApiProperty({ example: 'CUSTOM_NUMBERS' })
  messageType: string;

  @ApiProperty({ example: 'ALL' })
  recipientFilterType: string;

  @ApiProperty({ example: 'Hello {{name}}' })
  messageTemplate: string;

  @ApiProperty({ example: 120 })
  totalRecipients: number;

  @ApiProperty({ example: 118 })
  successfulSends: number;

  @ApiProperty({ example: 2 })
  failedSends: number;

  @ApiProperty({ example: 120 })
  creditsUsed: number;

  @ApiProperty({ enum: SmsMessageStatus, example: SmsMessageStatus.SENT })
  status: SmsMessageStatus;

  @ApiProperty({ example: '2025-10-16T19:52:44.278Z' })
  createdAt: string;

  @ApiProperty({ example: 'MASK_12345', required: false })
  maskIdUsed?: string;
}

export class SmsMessageHistoryResponseDto {
  @ApiProperty({ type: [SmsMessageHistoryItemDto] })
  items: SmsMessageHistoryItemDto[];

  @ApiProperty({ example: 25 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

/**
 * Campaign Approval DTOs
 */
export class CampaignApprovalDto {
  @ApiPropertyOptional({ 
    description: 'Admin notes for approval',
    example: 'Approved - exam notification'
  })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class CampaignRejectionDto {
  @ApiProperty({ 
    description: 'Reason for rejection',
    example: 'Inappropriate content detected'
  })
  @IsNotEmpty()
  @IsString()
  rejectionReason: string;

  @ApiPropertyOptional({ 
    description: 'Additional admin notes',
    example: 'Please revise the message content'
  })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}

export class PendingCampaignItemDto {
  @ApiProperty({ example: '123' })
  messageId: string;

  @ApiProperty({ example: '1' })
  instituteId: string;

  @ApiProperty({ example: 'ABC School' })
  instituteName: string;

  @ApiProperty({ example: '2' })
  sentBy: string;

  @ApiProperty({ example: 'John Doe' })
  senderName: string;

  @ApiProperty({ example: 'BULK_INSTITUTE_USERS' })
  messageType: string;

  @ApiProperty({ example: 'STUDENTS' })
  recipientType: string;

  @ApiProperty({ example: 500 })
  totalRecipients: number;

  @ApiProperty({ example: 'Hello {{name}}, exam on Monday' })
  messageTemplate: string;

  @ApiProperty({ example: 500 })
  estimatedCredits: number;

  @ApiProperty({ enum: SmsMessageStatus, example: SmsMessageStatus.PENDING_VERIFICATION })
  status: SmsMessageStatus;

  @ApiProperty({ example: '2025-10-17T10:00:00.000Z' })
  createdAt: string;

  @ApiPropertyOptional({ example: '2025-10-17T15:00:00.000Z' })
  scheduledAt?: string;

  @ApiPropertyOptional()
  filterCriteria?: any;

  @ApiPropertyOptional({ example: 'SchoolName' })
  maskIdUsed?: string;
}

export class PendingApprovalsResponseDto {
  @ApiProperty({ type: [PendingCampaignItemDto] })
  approvals: PendingCampaignItemDto[];

  @ApiProperty({ example: 5 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class CampaignApprovalResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Campaign approved and queued for sending' })
  message: string;

  @ApiProperty({ example: '123' })
  messageId: string;

  @ApiProperty({ enum: SmsMessageStatus, example: SmsMessageStatus.APPROVED })
  status: SmsMessageStatus;

  @ApiProperty({ example: '1' })
  approvedBy: string;

  @ApiProperty({ example: '2025-10-17T12:00:00.000Z' })
  approvedAt: string;

  @ApiPropertyOptional({ example: 'Approved - exam notification' })
  adminNotes?: string;
}

export class CampaignRejectionResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Campaign rejected' })
  message: string;

  @ApiProperty({ example: '123' })
  messageId: string;

  @ApiProperty({ enum: SmsMessageStatus, example: SmsMessageStatus.REJECTED })
  status: SmsMessageStatus;

  @ApiProperty({ example: 'Inappropriate content detected' })
  rejectionReason: string;

  @ApiPropertyOptional({ example: 'Please revise the message content' })
  adminNotes?: string;
}

// ==================== SENDER MASK DTOs ====================

export class CreateSenderMaskDto {
  @ApiPropertyOptional({
    description: 'Institute ID (required for SUPERADMIN callers). If omitted, instituteId will be taken from JWT token for institute admins',
    example: '1'
  })
  @IsOptional()
  @IsString()
  instituteId?: string;

  @ApiProperty({ 
    description: 'Sender mask ID (approved by SMS provider)',
    example: 'MASK_12345'
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 50)
  maskId: string;

  @ApiProperty({ 
    description: 'Display name for the mask',
    example: 'ABC Institute'
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  displayName: string;

  @ApiProperty({ 
    description: 'Phone number associated with the mask',
    example: '+94771234567'
  })
  @IsNotEmpty()
  @IsString()
  @Length(10, 15)
  phoneNumber: string;

  @ApiProperty({ 
    description: 'Whether the mask is active',
    example: true
  })
  @IsBoolean()
  isActive: boolean;
}

export class SenderMaskResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Sender mask created successfully' })
  message: string;

  @ApiProperty({ 
    description: 'Created sender mask details',
    example: {
      maskId: 'MASK_12345',
      displayName: 'ABC Institute',
      phoneNumber: '+94771234567',
      isActive: true
    }
  })
  mask: {
    maskId: string;
    displayName: string;
    phoneNumber: string;
    isActive: boolean;
  };

  @ApiProperty({ example: '1' })
  instituteId: string;
}

export class SenderMasksListResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ 
    description: 'List of sender masks',
    type: 'array',
    example: [
      {
        maskId: 'MASK_12345',
        displayName: 'ABC Institute',
        phoneNumber: '+94771234567',
        isActive: true
      }
    ]
  })
  masks: {
    maskId: string;
    displayName: string;
    phoneNumber: string;
    isActive: boolean;
  }[];

  @ApiProperty({ example: 3 })
  total: number;

  @ApiProperty({ example: '1' })
  instituteId: string;
}
