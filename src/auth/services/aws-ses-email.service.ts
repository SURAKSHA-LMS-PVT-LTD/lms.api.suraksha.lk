import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand, GetSendQuotaCommand, GetSendStatisticsCommand } from '@aws-sdk/client-ses';
import { getCurrentSriLankaTime } from '../../common/utils/timezone.util';
import { 
  EmailTemplate, 
  FirstLoginTemplate,
  PasswordResetTemplate,
  ChangePasswordTemplate,
  PasswordChangeSuccessTemplate,
  SecurityAlertTemplate
} from '../templates';

@Injectable()
export class AwsSesEmailService {
  private readonly logger = new Logger(AwsSesEmailService.name);
  private readonly sesClient: SESClient;
  private readonly sourceEmail: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    if (!region || !accessKeyId || !secretAccessKey) {
      this.logger.error(
        'AWS SES credentials incomplete. Missing: ' +
        [!region && 'AWS_REGION', !accessKeyId && 'AWS_ACCESS_KEY_ID', !secretAccessKey && 'AWS_SECRET_ACCESS_KEY']
          .filter(Boolean).join(', ')
      );
    }

    this.sesClient = new SESClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    this.sourceEmail = this.configService.get<string>('SES_SOURCE_EMAIL') || 'noreply@laas.com';
  }

  /**
   * Mask email for safe logging (e.g., "ab***@gmail.com")
   */
  private maskEmail(email: string): string {
    if (!email || !email.includes('@')) return '***';
    const [local, domain] = email.split('@');
    const visibleChars = Math.min(2, local.length);
    return `${local.slice(0, visibleChars)}***@${domain}`;
  }

  /**
   * Send email via SES with standardized error handling
   */
  private async sendSesEmail(
    toEmail: string,
    template: { subject: string; htmlBody: string; textBody: string },
    emailType: string,
  ): Promise<boolean> {
    try {
      const command = new SendEmailCommand({
        Source: this.sourceEmail,
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Subject: { Data: template.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: template.htmlBody, Charset: 'UTF-8' },
            Text: { Data: template.textBody, Charset: 'UTF-8' },
          },
        },
      });

      await this.sesClient.send(command);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send ${emailType} email to ${this.maskEmail(toEmail)}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Send first login OTP email using AWS SES
   */
  async sendFirstLoginOTP(
    email: string, 
    otp: string, 
    firstName: string, 
    instituteName?: string
  ): Promise<boolean> {
    const template = FirstLoginTemplate.generate({
      firstName,
      otp,
      expiryMinutes: 15,
      instituteName
    });
    return this.sendSesEmail(email, template, 'first login OTP');
  }

  /**
   * Send password reset OTP email using AWS SES
   */
  async sendPasswordResetOTP(
    email: string, 
    otp: string, 
    firstName: string
  ): Promise<boolean> {
    const template = PasswordResetTemplate.generate({
      firstName,
      otp,
      expiryMinutes: 15
    });
    return this.sendSesEmail(email, template, 'password reset OTP');
  }

  /**
   * Send change password OTP email using AWS SES
   */
  async sendChangePasswordOTP(
    email: string, 
    otp: string, 
    firstName: string
  ): Promise<boolean> {
    const template = ChangePasswordTemplate.generate({
      firstName,
      otp,
      expiryMinutes: 15
    });
    return this.sendSesEmail(email, template, 'change password OTP');
  }

  /**
   * Send password change success notification
   */
  async sendPasswordChangeSuccess(
    email: string,
    firstName: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<boolean> {
    const template = PasswordChangeSuccessTemplate.generate({
      firstName,
      email,
      changeDate: getCurrentSriLankaTime(),
      ipAddress,
      userAgent
    });
    return this.sendSesEmail(email, template, 'password change success');
  }

  /**
   * Send security alert notification
   */
  async sendSecurityAlert(
    email: string,
    firstName: string,
    alertType: 'password_changed' | 'login_attempt' | 'account_locked' | 'suspicious_activity',
    ipAddress?: string,
    location?: string
  ): Promise<boolean> {
    const template = SecurityAlertTemplate.generate({
      firstName,
      email,
      alertType,
      timestamp: getCurrentSriLankaTime(),
      ipAddress,
      location
    });
    return this.sendSesEmail(email, template, 'security alert');
  }

  /**
   * Test AWS SES connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const command = new GetSendQuotaCommand({});
      await this.sesClient.send(command);
      return true;
    } catch (error) {
      this.logger.error('AWS SES connection test failed:', error);
      return false;
    }
  }

  /**
   * Get SES sending statistics
   */
  async getSendingStatistics() {
    try {
      const command = new GetSendStatisticsCommand({});
      const stats = await this.sesClient.send(command);
      return stats.SendDataPoints;
    } catch (error) {
      this.logger.error('Failed to get SES statistics:', error);
      return null;
    }
  }
}
