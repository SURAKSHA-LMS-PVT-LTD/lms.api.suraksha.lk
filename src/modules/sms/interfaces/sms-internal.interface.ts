import { UserType } from '../../user/enums/user-type.enum';
import { RecipientFilterType } from '../entities/institute-sms-message.entity';

/**
 * Recipient interface for SMS processing
 */
export interface SmsRecipient {
  phoneNumber: string;
  name?: string;
  userId?: string;
  userType?: UserType;
}

/**
 * SMS Credentials interface
 */
export interface SmsCredentials {
  maskId: string;
  displayName: string;
  phoneNumber: string;
  isActive: boolean;
}

/**
 * Filter criteria for recipient selection
 */
export interface SmsFilterCriteria {
  recipientTypes: RecipientFilterType[];
  classIds?: string[];
  subjectIds?: string[];
  customNumbers?: Array<{ number?: string; name?: string; phoneNumber?: string }>;  // For custom SMS recipients
  userIds?: string[];  // For SPECIFIC_USERS sends (system user IDs or institute-assigned user IDs)
  instituteId: string;
}

/**
 * Recipient breakdown by type
 */
export interface RecipientBreakdown {
  students: number;
  teachers: number;
  parents: number;
  admin: number;
}

/**
 * Processing context for SMS operations
 */
export interface SmsProcessingContext {
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

/**
 * Payment submission verification details
 */
export interface PaymentVerificationDetails {
  submissionId: string;
  action: 'APPROVE' | 'REJECT';
  creditsToGrant?: number;
  adminNotes?: string;
  rejectionReason?: string;
  verifiedBy: string;
  verifiedAt: Date;
}
