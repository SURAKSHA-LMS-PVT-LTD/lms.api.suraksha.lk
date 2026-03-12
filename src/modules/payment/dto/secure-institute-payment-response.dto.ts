import { InstitutePayment } from '../entities/institute-payment.entity';
import { InstitutePaymentSubmission } from '../entities/institute-payment-submission.entity';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

// Base Response DTO
export class BaseResponseDto {
  success: boolean;
  message: string;
}

// Secure Institute Payment Response DTO - hides sensitive data for non-admins
export class SecureInstitutePaymentResponseDto extends BaseResponseDto {
  data: {
    id: string;
    instituteId: string;
    paymentType: string;
    description: string;
    amount: number;
    dueDate: string;
    targetType: string;
    priority: string;
    status: string;
    paymentInstructions?: string;
    bankDetails?: any;
    lateFeeAmount?: number;
    lateFeeAfterDays?: number;
    reminderDaysBefore: number;
    totalSubmissions?: number; // Only for admins
    verifiedSubmissions?: number; // Only for admins
    pendingSubmissions?: number; // Only for admins
    rejectedSubmissions?: number; // Only for admins
    createdAt: string;
    updatedAt: string;
  };
}

// Secure Institute Payment Submission Response DTO - hides sensitive verification data
export class SecureInstitutePaymentSubmissionResponseDto extends BaseResponseDto {
  data: {
    id: string;
    paymentId: string;
    submittedBy?: string; // Only shown to submitter and admins
    submitterName?: string; // Only shown to admins
    paymentAmount: number;
    paymentMethod: string;
    transactionReference?: string;
    paymentDate: string;
    receiptFileUrl?: string;
    receiptFileName?: string;
    receiptFileSize?: number;
    receiptFileType?: string;
    status: string;
    verifiedAt?: string; // Only verified date, not who verified
    rejectionReason?: string;
    paymentRemarks?: string;
    lateFeeApplied: number;
    totalAmountPaid: number;
    createdAt: string;
    paymentDetails?: {
      paymentType: string;
      description: string;
      dueDate: string;
      targetType: string;
      priority: string;
    };
  };
}

// Admin-only detailed response with all data
export class AdminInstitutePaymentSubmissionResponseDto extends BaseResponseDto {
  data: {
    id: string;
    paymentId: string;
    submittedBy: string;
    submitterName?: string;
    paymentAmount: number;
    paymentMethod: string;
    transactionReference?: string;
    paymentDate: string;
    receiptFileUrl?: string;
    receiptFileName?: string;
    receiptFileSize?: number;
    receiptFileType?: string;
    status: string;
    verifiedBy?: string;
    verifierName?: string;
    verifiedAt?: string;
    rejectionReason?: string;
    paymentRemarks?: string;
    notes?: string;
    lateFeeApplied: number;
    totalAmountPaid: number;
    createdAt: string;
    updatedAt: string;
    paymentDetails?: {
      paymentType: string;
      description: string;
      dueDate: string;
      targetType: string;
      priority: string;
    };
  };
}

// User role enum for data filtering
export enum UserAccessLevel {
  ADMIN = 'ADMIN',
  USER = 'USER',
  OWNER = 'OWNER', // Can see their own submissions fully
}

// Secure transform functions that filter data based on user role
export function transformInstitutePaymentToSecureResponse(
  payment: InstitutePayment,
  userRole: UserAccessLevel,
  userId?: string
): any {
  const baseData = {
    id: payment.id,
    instituteId: payment.instituteId,
    paymentType: payment.paymentType,
    description: payment.description,
    amount: Number(payment.amount),
    dueDate: payment.dueDate?.toISOString() || null,
    targetType: payment.targetType,
    priority: payment.priority,
    status: payment.status,
    paymentInstructions: payment.paymentInstructions,
    bankDetails: payment.bankDetails,
    lateFeeAmount: payment.lateFeeAmount ? Number(payment.lateFeeAmount) : null,
    lateFeeAfterDays: payment.lateFeeAfterDays,
    reminderDaysBefore: payment.reminderDaysBefore,
    createdAt: payment.createdAt?.toISOString() || null,
    updatedAt: payment.updatedAt?.toISOString() || null,
  };

  // Only admins can see submission statistics and creator info
  if (userRole === UserAccessLevel.ADMIN) {
    return {
      ...baseData,
      createdBy: payment.createdBy,
      creatorName: payment.creator?.nameWithInitials || ((payment.creator?.firstName || '') + ' ' + (payment.creator?.lastName || '')).trim() || undefined,
      autoReminderEnabled: payment.autoReminderEnabled,
      notes: payment.notes,
      totalSubmissions: payment.totalSubmissions,
      verifiedSubmissions: payment.verifiedSubmissions,
      pendingSubmissions: payment.pendingSubmissions,
      rejectedSubmissions: payment.rejectedSubmissions,
    };
  }

  return baseData;
}

export function transformInstitutePaymentSubmissionToSecureResponse(
  submission: InstitutePaymentSubmission,
  userRole: UserAccessLevel,
  userId?: string,
  includePaymentDetails = false,
  cloudStorageService?: CloudStorageService
): any {
  const baseData = {
    id: submission.id,
    paymentId: submission.paymentId,
    paymentAmount: Number(submission.paymentAmount),
    paymentMethod: submission.paymentMethod,
    transactionReference: submission.transactionReference,
    paymentDate: submission.paymentDate?.toISOString() || null,
    // ✅ Transform receiptFileUrl to full URL if cloudStorageService is provided
    receiptFileUrl: cloudStorageService && submission.receiptFileUrl 
      ? cloudStorageService.getFullUrl(submission.receiptFileUrl) 
      : submission.receiptFileUrl,
    receiptFileName: submission.receiptFileName,
    receiptFileSize: submission.receiptFileSize,
    receiptFileType: submission.receiptFileType,
    status: submission.status,
    verifiedAt: submission.verifiedAt?.toISOString(),
    rejectionReason: submission.rejectionReason,
    paymentRemarks: submission.paymentRemarks,
    lateFeeApplied: Number(submission.lateFeeApplied),
    totalAmountPaid: Number(submission.totalAmountPaid),
    createdAt: submission.createdAt?.toISOString() || null,
  };

  // Include payment details if requested
  if (includePaymentDetails && submission.payment) {
    baseData['paymentDetails'] = {
      paymentType: submission.payment.paymentType,
      description: submission.payment.description,
      dueDate: submission.payment.dueDate?.toISOString() || null,
      targetType: submission.payment.targetType,
      priority: submission.payment.priority,
    };
  }

  // Admin can see everything
  if (userRole === UserAccessLevel.ADMIN) {
    return {
      ...baseData,
      submittedBy: submission.submittedBy,
      submitterName: submission.submitter
        ? (submission.submitter.nameWithInitials || (submission.submitter.firstName + ' ' + submission.submitter.lastName).trim())
        : undefined,
      verifiedBy: submission.verifiedBy,
      verifierName: submission.verifier
        ? (submission.verifier.nameWithInitials || (submission.verifier.firstName + ' ' + submission.verifier.lastName).trim())
        : undefined,
      notes: submission.notes,
      updatedAt: submission.updatedAt?.toISOString() || null,
    };
  }

  // Owner can see their own submission with submittedBy
  if (userRole === UserAccessLevel.OWNER && userId && submission.submittedBy === userId) {
    return {
      ...baseData,
      submittedBy: submission.submittedBy,
    };
  }

  // Regular users can't see sensitive verification data
  return baseData;
}

// Paginated secure responses
export class PaginatedSecureInstitutePaymentsResponseDto extends BaseResponseDto {
  data: {
    payments: Array<any>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
    _debug?: {
      totalRecordsInDB: number;
      activeRecordsInDB: number;
    };
  };
}

export class PaginatedSecureInstitutePaymentSubmissionsResponseDto extends BaseResponseDto {
  data: {
    submissions: Array<any>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
}

// My Submissions Response DTO (for students/parents) - only their own data
export class MySecureInstitutePaymentSubmissionsResponseDto extends BaseResponseDto {
  data: {
    submissions: Array<{
      id: string;
      paymentId: string;
      paymentType: string;
      description: string;
      dueDate: string;
      priority: string;
      paymentAmount: number;
      paymentMethod: string;
      transactionReference?: string;
      paymentDate: string;
      status: string;
      verifiedAt?: string; // Only when verified, not who verified
      rejectionReason?: string;
      lateFeeApplied: number;
      totalAmountPaid: number;
      receiptFileName?: string;
      createdAt: string;
    }>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
      hasNextPage: boolean;
      hasPreviousPage: boolean;
    };
  };
}
