import { Injectable, Logger } from '@nestjs/common';
import { EnhancedEmailService } from './enhanced-email.service';

/**
 * 🚀 ASYNC EMAIL SERVICE - FIRE-AND-FORGET PATTERN
 * 
 * PURPOSE: High-performance async email sending
 * STRATEGY: Call API immediately, don't wait for response
 * PERFORMANCE: Zero blocking time - execution continues immediately
 * 
 * FEATURES:
 * ✅ Fire-and-forget - No blocking
 * ✅ Error logging for monitoring
 * ✅ Zero performance impact
 * ✅ Graceful failure handling
 * 
 * USAGE:
 * ```typescript
 * // Instead of awaiting:
 * await this.enhancedEmailService.sendOTP({...}); // ❌ Blocks for 10 seconds
 * 
 * // Use fire-and-forget:
 * this.asyncEmailService.sendOTPAsync({...});      // ✅ Returns immediately
 * ```
 */

@Injectable()
export class AsyncEmailService {
  private readonly logger = new Logger(AsyncEmailService.name);

  constructor(private readonly enhancedEmailService: EnhancedEmailService) {
  }

  /**
   * Generic fire-and-forget email sender (NO RETRY - fails fast)
   */
  private fireAndForget<T>(
    emailPromise: Promise<T>,
    emailType: string,
    recipient: string
  ): void {
    
    // Fire immediately, don't wait
    emailPromise
      .then((result) => {
        this.logger.log(`✅ ${emailType} email sent successfully to ${recipient}`);
      })
      .catch((error) => {
        this.logger.error(
          `❌ ${emailType} email FAILED to ${recipient}: ${error.message}`,
          error.stack
        );
      });
  }

  /**
   * 🔐 OTP Email (Fire-and-forget)
   */
  sendOTPAsync(params: {
    email: string;
    otp: string;
    userName?: string;
    expiryMinutes?: string;
    requestType?: string;
    ipAddress?: string;
  }): void {
    this.fireAndForget(
      this.enhancedEmailService.sendOTP({
        email: params.email,
        otp: params.otp,
        userName: params.userName || 'User',
        expiryMinutes: params.expiryMinutes || '10',
        requestType: params.requestType || 'Verification',
        ipAddress: params.ipAddress || 'Unknown',
      }),
      'OTP',
      params.email
    );
  }

  /**
   * 👤 Registration Welcome Email (Fire-and-forget)
   */
  sendRegistrationEmailAsync(params: {
    userEmail: string;
    userName: string;
    accountEmail: string;
    registrationDate: string;
    activationLink?: string;
    courseName?: string;
    studentId?: string;
  }): void {
    this.fireAndForget(
      this.enhancedEmailService.sendRegistrationEmail(params),
      'Registration',
      params.userEmail
    );
  }

  /**
   * 💳 Payment Submission Email (Fire-and-forget)
   */
  sendPaymentSubmissionEmailAsync(params: {
    userEmail: string;
    userName: string;
    submissionId: string;
    instituteId?: string;
    instituteName?: string;
    instituteSystemContactEmail?: string | null;
    instituteSystemContactPhone?: string | null;
    requestedCredits: number;
    paymentAmount: number;
    paymentMethod: string;
    paymentReference: string;
    submissionNotes?: string;
    paymentSlipUrl?: string;
    submittedAt: string;
  }): void {
    this.fireAndForget(
      this.enhancedEmailService.sendPaymentSubmissionEmail(params),
      'Payment Submission',
      params.userEmail
    );
  }

  /**
   * ✅ Payment Approved Email (Fire-and-forget)
   */
  sendPaymentApprovedEmailAsync(params: {
    userEmail: string;
    userName: string;
    submissionId: string;
    instituteId?: string;
    instituteName?: string;
    instituteSystemContactEmail?: string | null;
    instituteSystemContactPhone?: string | null;
    creditsGranted: number;
    verifiedAt: string;
    adminNotes?: string;
  }): void {
    this.fireAndForget(
      this.enhancedEmailService.sendPaymentApprovedEmail(params),
      'Payment Approved',
      params.userEmail
    );
  }

  /**
   * ❌ Payment Rejected Email (Fire-and-forget)
   */
  sendPaymentRejectedEmailAsync(params: {
    userEmail: string;
    userName: string;
    submissionId: string;
    instituteId?: string;
    instituteName?: string;
    instituteSystemContactEmail?: string | null;
    instituteSystemContactPhone?: string | null;
    rejectionReason: string;
    verifiedAt: string;
    adminNotes?: string;
  }): void {
    this.fireAndForget(
      this.enhancedEmailService.sendPaymentRejectedEmail(params),
      'Payment Rejected',
      params.userEmail
    );
  }

  /**
   * 📋 Attendance Notification (Fire-and-forget)
   */
  sendAttendanceNotificationAsync(params: {
    parentEmail: string;
    parentName: string;
    studentName: string;
    studentId: string;
    status: 'Present' | 'Absent';
    date: string;
    time: string;
    place: string;
    instituteName: string;
    markedBy?: string;
    subjectName?: string;
    className?: string;
  }): void {
    this.fireAndForget(
      this.enhancedEmailService.sendAttendanceNotification(params),
      'Attendance',
      params.parentEmail
    );
  }

  /**
   * 🧾 Payment Receipt Email (Fire-and-forget)
   */
  sendPaymentReceiptEmailAsync(params: {
    customerEmail: string;
    customerName: string;
    paymentAmount: string;
    transactionId: string;
    paymentDate: string;
    paymentTime: string;
    paymentMethod: string;
    referenceNumber: string;
    serviceName: string;
    studentName?: string;
  }): void {
    this.fireAndForget(
      this.enhancedEmailService.sendPaymentReceiptEmail(params),
      'Payment Receipt',
      params.customerEmail
    );
  }

  /**
   * 📧 Generic Template Email (Fire-and-forget)
   */
  sendTemplateEmailAsync(params: {
    templateType: string;
    toEmails: string[];
    ccEmails?: string[];
    bccEmails?: string[];
    templateData: any;
    customSubject?: string;
    fromEmail?: string;
    replyTo?: string;
  }): void {
    this.fireAndForget(
      this.enhancedEmailService.sendTemplateEmail(params),
      params.templateType,
      params.toEmails.join(', ')
    );
  }

  /**
   * 🚫 Profile Image Rejection Email (Fire-and-forget)
   */
  sendProfileImageRejectionEmailAsync(params: {
    toEmail: string;
    userName: string;
    reason: string;
    profileUpdateUrl: string;
  }): void {
    this.fireAndForget(
      this.enhancedEmailService.sendProfileImageRejectionEmail(params),
      'Profile Image Rejection',
      params.toEmail
    );
  }

  /**
   * 📤 Bulk Email Sending (Fire-and-forget for multiple recipients)
   */
  sendBulkEmailsAsync(emails: Array<{
    templateType: string;
    toEmail: string;
    templateData: any;
  }>): void {

    emails.forEach((email, index) => {
      // Stagger emails by 100ms to avoid overwhelming the service
      setTimeout(() => {
        this.sendTemplateEmailAsync({
          templateType: email.templateType,
          toEmails: [email.toEmail],
          templateData: email.templateData,
        });
      }, index * 100);
    });

  }
}
