import { InstitutePayment } from '../entities/institute-payment.entity';
import { InstitutePaymentSubmission } from '../entities/institute-payment-submission.entity';

// Base Response DTO
export class BaseResponseDto {
  success: boolean;
  message: string;
}

// Institute Payment Response DTO
export class InstitutePaymentResponseDto extends BaseResponseDto {
  data: {
    id: string;
    instituteId: string;
    createdBy: string;
    creatorName?: string;
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
    autoReminderEnabled: boolean;
    reminderDaysBefore: number;
    notes?: string;
    totalSubmissions: number;
    verifiedSubmissions: number;
    pendingSubmissions: number;
    rejectedSubmissions: number;
    createdAt: string;
    updatedAt: string;
  };
}

// Institute Payment Submission Response DTO
export class InstitutePaymentSubmissionResponseDto extends BaseResponseDto {
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

// Paginated Payments Response DTO
export class PaginatedInstitutePaymentsResponseDto extends BaseResponseDto {
  data: {
    payments: Array<{
      id: string;
      paymentType: string;
      description: string;
      amount: number;
      dueDate: string;
      targetType: string;
      priority: string;
      status: string;
      creatorName?: string;
      totalSubmissions: number;
      verifiedSubmissions: number;
      pendingSubmissions: number;
      rejectedSubmissions: number;
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

// Paginated Submissions Response DTO
export class PaginatedInstitutePaymentSubmissionsResponseDto extends BaseResponseDto {
  data: {
    submissions: Array<{
      id: string;
      paymentId: string;
      submitterName?: string;
      paymentAmount: number;
      paymentMethod: string;
      transactionReference?: string;
      paymentDate: string;
      status: string;
      verifierName?: string;
      verifiedAt?: string;
      lateFeeApplied: number;
      totalAmountPaid: number;
      createdAt: string;
      paymentDetails?: {
        paymentType: string;
        description: string;
        dueDate: string;
      };
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

// My Submissions Response DTO (for students/parents)
export class MyInstitutePaymentSubmissionsResponseDto extends BaseResponseDto {
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
      verifiedAt?: string;
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

// Statistics Response DTO
export class InstitutePaymentStatsResponseDto extends BaseResponseDto {
  data: {
    totalPayments: number;
    activePayments: number;
    completedPayments: number;
    totalSubmissions: number;
    pendingSubmissions: number;
    verifiedSubmissions: number;
    rejectedSubmissions: number;
    totalAmountCollected: number;
    pendingAmount: number;
  };
}

// Helper function to transform entity to response
export function transformInstitutePaymentToResponse(
  payment: InstitutePayment,
  includeSubmissions = false
): any {
  return {
    id: payment.id,
    instituteId: payment.instituteId,
    createdBy: payment.createdBy,
    creatorName: payment.creator?.nameWithInitials || ((payment.creator?.firstName || '') + ' ' + (payment.creator?.lastName || '')).trim() || undefined,
    paymentType: payment.paymentType,
    description: payment.description,
    amount: Number(payment.amount),
    dueDate: payment.dueDate.toISOString(),
    targetType: payment.targetType,
    priority: payment.priority,
    status: payment.status,
    paymentInstructions: payment.paymentInstructions,
    bankDetails: payment.bankDetails,
    lateFeeAmount: payment.lateFeeAmount ? Number(payment.lateFeeAmount) : null,
    lateFeeAfterDays: payment.lateFeeAfterDays,
    autoReminderEnabled: payment.autoReminderEnabled,
    reminderDaysBefore: payment.reminderDaysBefore,
    notes: payment.notes,
    totalSubmissions: payment.totalSubmissions,
    verifiedSubmissions: payment.verifiedSubmissions,
    pendingSubmissions: payment.pendingSubmissions,
    rejectedSubmissions: payment.rejectedSubmissions,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    ...(includeSubmissions && payment.submissions && {
      submissions: payment.submissions.map((submission) => transformInstitutePaymentSubmissionToResponse(submission))
    }),
  };
}

export function transformInstitutePaymentSubmissionToResponse(
  submission: InstitutePaymentSubmission,
  includePaymentDetails = false
): any {
  return {
    id: submission.id,
    paymentId: submission.paymentId,
    submittedBy: submission.submittedBy,
    submitterName: submission.submitter
      ? (submission.submitter.nameWithInitials || (submission.submitter.firstName + ' ' + submission.submitter.lastName).trim())
      : undefined,
    paymentAmount: Number(submission.paymentAmount),
    paymentMethod: submission.paymentMethod,
    transactionReference: submission.transactionReference,
    paymentDate: submission.paymentDate.toISOString(),
    receiptFileUrl: submission.receiptFileUrl,
    receiptFileName: submission.receiptFileName,
    receiptFileSize: submission.receiptFileSize,
    receiptFileType: submission.receiptFileType,
    status: submission.status,
    verifiedBy: submission.verifiedBy,
    verifierName: submission.verifier
      ? (submission.verifier.nameWithInitials || (submission.verifier.firstName + ' ' + submission.verifier.lastName).trim())
      : undefined,
    verifiedAt: submission.verifiedAt?.toISOString(),
    rejectionReason: submission.rejectionReason,
    paymentRemarks: submission.paymentRemarks,
    notes: submission.notes,
    lateFeeApplied: Number(submission.lateFeeApplied),
    totalAmountPaid: Number(submission.totalAmountPaid),
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    ...(includePaymentDetails && submission.payment && {
      paymentDetails: {
        paymentType: submission.payment.paymentType,
        description: submission.payment.description,
        dueDate: submission.payment.dueDate.toISOString(),
        targetType: submission.payment.targetType,
        priority: submission.payment.priority,
      },
    }),
  };
}
