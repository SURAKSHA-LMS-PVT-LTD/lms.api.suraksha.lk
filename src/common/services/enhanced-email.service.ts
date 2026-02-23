import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface EmailTemplate {
  templateType: string;
  toEmails: string[];
  ccEmails?: string[];
  bccEmails?: string[];
  templateData: any;
  customSubject?: string;
  fromEmail?: string;
  replyTo?: string;
}

@Injectable()
export class EnhancedEmailService {
  private readonly logger = new Logger(EnhancedEmailService.name);
  private readonly emailServerUrl: string;
  private readonly authToken: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.emailServerUrl = this.configService.get<string>('EMAIL_SERVER_URL') || '';
    this.authToken = this.configService.get<string>('EMAIL_SERVER_AUTH_TOKEN') || '';
    this.fromEmail = this.configService.get<string>('FROM_EMAIL') || 'surakshalms@gmail.com';
    this.fromName = this.configService.get<string>('FROM_NAME') || 'Suraksha LMS System';
    this.isEnabled = this.configService.get<boolean>('EMAIL_SERVICE_ENABLED', true);

    if (!this.isEnabled) {
      this.logger.warn('⚠️ Email service is DISABLED in configuration');
    } else if (!this.emailServerUrl) {
      this.logger.error('❌ EMAIL_SERVER_URL not configured. Email sending will be disabled.');
      this.isEnabled = false;
    } else if (!this.authToken) {
      this.logger.error('❌ EMAIL_SERVER_AUTH_TOKEN not configured. Email sending will fail.');
    } else {
    }
  }

  /**
   * Generic method to send any template email
   */
  async sendTemplateEmail(template: EmailTemplate): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    if (!this.isEnabled) {
      this.logger.warn(`Email service disabled. Skipping email: ${template.templateType}`);
      return { success: false, error: 'Email service disabled' };
    }

    try {
      const payload = {
        operation: 'send_template_email',
        template_type: template.templateType,
        to_emails: template.toEmails,
        ...(template.ccEmails && { cc_emails: template.ccEmails }),
        ...(template.bccEmails && { bcc_emails: template.bccEmails }),
        template_data: template.templateData,
        ...(template.customSubject && { custom_subject: template.customSubject }),
        ...(template.fromEmail && { from_email: template.fromEmail }),
        ...(template.replyTo && { reply_to: template.replyTo }),
      };
      
      const response = await axios.post(this.emailServerUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
        timeout: 10000, // 10 second timeout
      });

      // Check for success - Lambda returns messageId when successful
      const isSuccess = response.data.messageId || response.data.message_id || response.data.status === 'success';
      
      if (isSuccess) {
        return {
          success: true,
          messageId: response.data.messageId || response.data.message_id,
        };
      } else {
        this.logger.error(`❌ Email sending failed: ${response.data.error || 'Unknown error'}`);
        return {
          success: false,
          error: response.data.error || 'Unknown error',
        };
      }
    } catch (error) {
      // Log more details about the error
      if (error.response) {
        this.logger.error(
          `❌ Lambda returned error (${template.templateType}): ` +
          `Status ${error.response.status}, Body: ${JSON.stringify(error.response.data)}`
        );
      } else {
        this.logger.error(`❌ Error sending email (${template.templateType}): ${error.message}`, error.stack);
      }
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send OTP email
   */
  async sendOTP(params: {
    email: string;
    otp: string;
    userName: string;
    expiryMinutes?: string;
    requestType: string;
    ipAddress?: string;
  }): Promise<boolean> {
    const result = await this.sendTemplateEmail({
      templateType: 'otp',
      toEmails: [params.email],
      templateData: {
        otp: params.otp,
        user: params.userName,
        expiryMinutes: params.expiryMinutes || '10',
        requestType: params.requestType,
        ipAddress: params.ipAddress || 'Unknown',
      },
    });

    return result.success;
  }

  /**
   * Send attendance notification (Institute - No Ads)
   */
  async sendAttendanceNotification(params: {
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
  }): Promise<boolean> {
    const result = await this.sendTemplateEmail({
      templateType: 'attendance_institute_no_ads',
      toEmails: [params.parentEmail],
      templateData: {
        parentName: params.parentName,
        studentName: params.studentName,
        studentId: params.studentId,
        status: params.status,
        date: params.date,
        time: params.time,
        place: params.place,
        instituteName: params.instituteName,
        markedBy: params.markedBy,
        subjectName: params.subjectName,
        className: params.className,
      },
    });

    return result.success;
  }

  /**
   * Send payment submission email (PENDING)
   */
  async sendPaymentSubmissionEmail(params: {
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
  }): Promise<boolean> {
    const result = await this.sendTemplateEmail({
      templateType: 'payment_submission',
      toEmails: [params.userEmail],
      templateData: {
        userName: params.userName,
        submissionId: params.submissionId,
        instituteId: params.instituteId || 'SYSTEM',
        instituteName: params.instituteName || 'System',
        instituteSystemContactEmail: params.instituteSystemContactEmail || 'Not provided',
        instituteSystemContactPhone: params.instituteSystemContactPhone || 'Not provided',
        requestedCredits: params.requestedCredits,
        paymentAmount: params.paymentAmount,
        paymentMethod: params.paymentMethod,
        paymentReference: params.paymentReference,
        submissionNotes: params.submissionNotes || '',
        paymentSlipUrl: params.paymentSlipUrl || '',
        status: 'PENDING',
        submittedAt: params.submittedAt,
      },
    });

    return result.success;
  }

  /**
   * Send payment approved email
   */
  async sendPaymentApprovedEmail(params: {
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
  }): Promise<boolean> {
    const result = await this.sendTemplateEmail({
      templateType: 'payment_approved',
      toEmails: [params.userEmail],
      templateData: {
        userName: params.userName,
        submissionId: params.submissionId,
        instituteId: params.instituteId || 'SYSTEM',
        instituteName: params.instituteName || 'System',
        instituteSystemContactEmail: params.instituteSystemContactEmail || 'Not provided',
        instituteSystemContactPhone: params.instituteSystemContactPhone || 'Not provided',
        action: 'APPROVE',
        creditsGranted: params.creditsGranted,
        verifiedAt: params.verifiedAt,
        adminNotes: params.adminNotes || 'Payment verified successfully.',
      },
    });

    return result.success;
  }

  /**
   * Send payment rejected email
   */
  async sendPaymentRejectedEmail(params: {
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
  }): Promise<boolean> {
    const result = await this.sendTemplateEmail({
      templateType: 'payment_rejected',
      toEmails: [params.userEmail],
      templateData: {
        userName: params.userName,
        submissionId: params.submissionId,
        instituteId: params.instituteId || 'SYSTEM',
        instituteName: params.instituteName || 'System',
        instituteSystemContactEmail: params.instituteSystemContactEmail || 'Not provided',
        instituteSystemContactPhone: params.instituteSystemContactPhone || 'Not provided',
        action: 'REJECT',
        rejectionReason: params.rejectionReason,
        verifiedAt: params.verifiedAt,
        adminNotes: params.adminNotes || 'Please resubmit with correct documentation.',
      },
    });

    return result.success;
  }

  /**
   * Send registration/welcome email
   */
  async sendRegistrationEmail(params: {
    userEmail: string;
    userName: string;
    accountEmail: string;
    registrationDate: string;
    activationLink?: string;
    courseName?: string;
    studentId?: string;
  }): Promise<boolean> {
    // Parse name into firstName and lastName
    const nameParts = (params.userName || 'User').trim().split(' ');
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || 'Member';
    const userId = params.studentId || 'Pending';

    // Use 'welcome' template type (matches Lambda example)
    const result = await this.sendTemplateEmail({
      templateType: 'welcome',
      toEmails: [params.userEmail],
      templateData: {
        firstName: firstName,
        lastName: lastName,
        userId: userId,
        accountEmail: params.accountEmail,
        registrationDate: params.registrationDate,
        activationLink: params.activationLink || undefined,
        courseName: params.courseName || undefined,
      },
    });

    return result.success;
  }

  /**
   * Send payment receipt email
   */
  async sendPaymentReceiptEmail(params: {
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
  }): Promise<boolean> {
    const result = await this.sendTemplateEmail({
      templateType: 'payment',
      toEmails: [params.customerEmail],
      templateData: {
        CUSTOMER_NAME: params.customerName,
        PAYMENT_AMOUNT: params.paymentAmount,
        TRANSACTION_ID: params.transactionId,
        PAYMENT_DATE: params.paymentDate,
        PAYMENT_TIME: params.paymentTime,
        PAYMENT_METHOD: params.paymentMethod,
        REFERENCE_NUMBER: params.referenceNumber,
        SERVICE_NAME: params.serviceName,
        STUDENT_NAME: params.studentName || params.customerName,
      },
    });

    return result.success;
  }

  /**
   * 🚫 Profile Image Rejection Email
   * Notifies user that their profile image was rejected with update link
   */
  async sendProfileImageRejectionEmail(params: {
    toEmail: string;
    userName: string;
    reason: string;
    profileUpdateUrl: string;
  }): Promise<boolean> {
    const result = await this.sendTemplateEmail({
      templateType: 'generic',
      toEmails: [params.toEmail],
      customSubject: 'Profile Image Rejected - Action Required',
      templateData: {
        USER_NAME: params.userName,
        MESSAGE_TITLE: 'Profile Image Rejected',
        MESSAGE_BODY: `Dear ${params.userName},\n\nYour Suraksha LMS account profile image has been rejected by our moderation team.\n\nReason: ${params.reason}\n\nPlease update your profile image using the link below to comply with our image guidelines:\n\n${params.profileUpdateUrl}\n\nThank you for your understanding and cooperation.`,
        ACTION_URL: params.profileUpdateUrl,
        ACTION_TEXT: 'Update Profile Image',
        FOOTER_TEXT: 'If you have questions, please contact our support team.',
      },
    });

    return result.success;
  }

  /**
   * Test email service connection
   * Validates configuration without sending a real email
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    if (!this.isEnabled) {
      return {
        success: false,
        message: 'Email service is disabled in configuration',
      };
    }

    if (!this.authToken) {
      return {
        success: false,
        message: 'EMAIL_SERVER_AUTH_TOKEN not configured',
      };
    }

    if (!this.emailServerUrl) {
      return {
        success: false,
        message: 'EMAIL_SERVER_URL not configured',
      };
    }

    try {
      // Validate connection by making a lightweight request
      // Use a health check or send to a verified test address only in dev
      const response = await axios.post(this.emailServerUrl, {
        operation: 'health_check',
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
        timeout: 5000,
      });

      return {
        success: true,
        message: `Email server connection successful (status: ${response.status})`,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to connect to email server',
        error: error.message,
      };
    }
  }
}
