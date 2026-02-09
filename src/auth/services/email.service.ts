import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AwsSesEmailService } from './aws-ses-email.service';
import { maskEmail } from '../../common/utils/pii-masking.util';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly isDevelopment: boolean;

  constructor(
    private readonly awsSesEmailService: AwsSesEmailService,
    private readonly configService: ConfigService
  ) {
    this.isDevelopment = this.configService.get('NODE_ENV') !== 'production';
  }

  async sendFirstLoginOTP(email: string, otp: string, firstName: string, instituteName?: string): Promise<void> {
    
    try {
      if (this.isDevelopment) {
        // In development, log to console and also send email if AWS is configured
        this.logger.warn(`=== DEVELOPMENT MODE ===`);
        this.logger.warn(`First Login OTP sent to ${email.substring(0, 3)}***`);
        this.logger.warn(`=== END DEVELOPMENT MODE ===`);
      }

      // Always attempt to send via AWS SES (will gracefully handle failures)
      const emailSent = await this.awsSesEmailService.sendFirstLoginOTP(email, otp, firstName, instituteName);
      
      if (!emailSent) {
        this.logger.warn(`AWS SES failed, falling back to mock email for ${maskEmail(email)}`);
        await this.mockSendEmail(email, otp, firstName, 'First Login');
      } else {
      }

    } catch (error) {
      this.logger.error(`Error sending first login OTP to ${maskEmail(email)}:`, error);
      // Fallback to mock email in case of any errors
      await this.mockSendEmail(email, otp, firstName, 'First Login');
    }
  }

  async sendPasswordResetOTP(email: string, otp: string, firstName: string): Promise<void> {
    
    try {
      if (this.isDevelopment) {
        this.logger.warn(`=== DEVELOPMENT MODE ===`);
        this.logger.warn(`Password Reset OTP sent to ${email.substring(0, 3)}***`);
        this.logger.warn(`=== END DEVELOPMENT MODE ===`);
      }

      // Always attempt to send via AWS SES
      const emailSent = await this.awsSesEmailService.sendPasswordResetOTP(email, otp, firstName);
      
      if (!emailSent) {
        this.logger.warn(`AWS SES failed, falling back to mock email for ${maskEmail(email)}`);
        await this.mockSendEmail(email, otp, firstName, 'Password Reset');
      } else {
      }

    } catch (error) {
      this.logger.error(`Error sending password reset OTP to ${maskEmail(email)}:`, error);
      // Fallback to mock email in case of any errors
      await this.mockSendEmail(email, otp, firstName, 'Password Reset');
    }
  }

  private async mockSendEmail(email: string, otp: string, firstName: string, emailType?: string): Promise<void> {
    // Mock email sending with a delay to simulate real email service
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const emailTemplate = `
      Subject: Your OTP Code - LaaS Platform ${emailType ? `(${emailType})` : ''}
      
      Dear ${firstName},
      
      Your OTP code is: ${otp}
      
      This code will expire in 15 minutes.
      
      If you did not request this code, please ignore this email.
      
      Best regards,
      LaaS Platform Team
    `;
    
  }

  async sendChangePasswordOTP(email: string, otp: string, firstName: string): Promise<void> {
    
    try {
      if (this.isDevelopment) {
        this.logger.warn(`=== DEVELOPMENT MODE ===`);
        this.logger.warn(`Change Password OTP sent to ${email.substring(0, 3)}***`);
        this.logger.warn(`=== END DEVELOPMENT MODE ===`);
      }

      // Always attempt to send via AWS SES
      const emailSent = await this.awsSesEmailService.sendChangePasswordOTP(email, otp, firstName);
      
      if (!emailSent) {
        this.logger.warn(`AWS SES failed, falling back to mock email for ${maskEmail(email)}`);
        await this.mockSendEmail(email, otp, firstName, 'Change Password');
      } else {
      }

    } catch (error) {
      this.logger.error(`Error sending change password OTP to ${maskEmail(email)}:`, error);
      // Fallback to mock email in case of any errors
      await this.mockSendEmail(email, otp, firstName, 'Change Password');
    }
  }

  async sendPasswordChangeSuccess(
    email: string, 
    firstName: string, 
    ipAddress?: string, 
    userAgent?: string
  ): Promise<void> {
    
    try {
      if (this.isDevelopment) {
        this.logger.warn(`=== DEVELOPMENT MODE ===`);
        this.logger.warn(`Password Change Success notification for ${maskEmail(email)} (${firstName})`);
        this.logger.warn(`=== END DEVELOPMENT MODE ===`);
      }

      // Always attempt to send via AWS SES
      const emailSent = await this.awsSesEmailService.sendPasswordChangeSuccess(email, firstName, ipAddress, userAgent);
      
      if (!emailSent) {
        this.logger.warn(`AWS SES failed, falling back to mock email for ${maskEmail(email)}`);
        await this.mockSendEmail(email, 'N/A', firstName, 'Password Change Success');
      } else {
      }

    } catch (error) {
      this.logger.error(`Error sending password change success notification to ${maskEmail(email)}:`, error);
      // Fallback to mock email in case of any errors
      await this.mockSendEmail(email, 'N/A', firstName, 'Password Change Success');
    }
  }

  async sendSecurityAlert(
    email: string,
    firstName: string,
    alertType: 'password_changed' | 'login_attempt' | 'account_locked' | 'suspicious_activity',
    ipAddress?: string,
    location?: string
  ): Promise<void> {
    
    try {
      if (this.isDevelopment) {
        this.logger.warn(`=== DEVELOPMENT MODE ===`);
        this.logger.warn(`Security Alert for ${maskEmail(email)} (${firstName}): ${alertType}`);
        this.logger.warn(`=== END DEVELOPMENT MODE ===`);
      }

      // Always attempt to send via AWS SES
      const emailSent = await this.awsSesEmailService.sendSecurityAlert(email, firstName, alertType, ipAddress, location);
      
      if (!emailSent) {
        this.logger.warn(`AWS SES failed, falling back to mock email for ${maskEmail(email)}`);
        await this.mockSendEmail(email, 'N/A', firstName, `Security Alert - ${alertType}`);
      } else {
      }

    } catch (error) {
      this.logger.error(`Error sending security alert to ${maskEmail(email)}:`, error);
      // Fallback to mock email in case of any errors
      await this.mockSendEmail(email, 'N/A', firstName, `Security Alert - ${alertType}`);
    }
  }

  /**
   * Test AWS SES connection and send statistics
   */
  async testAwsSesConnection(): Promise<boolean> {
    try {
      return await this.awsSesEmailService.testConnection();
    } catch (error) {
      this.logger.error('Failed to test AWS SES connection:', error);
      return false;
    }
  }

  /**
   * Get AWS SES sending statistics
   */
  async getEmailStatistics() {
    try {
      return await this.awsSesEmailService.getSendingStatistics();
    } catch (error) {
      this.logger.error('Failed to get email statistics:', error);
      return null;
    }
  }
}
