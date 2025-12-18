import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand, GetSendQuotaCommand, GetSendStatisticsCommand } from '@aws-sdk/client-ses';
import { 
  EmailTemplate, 
  OTPEmailData, 
  PasswordChangeData,
  SecurityAlertData,
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
    // Initialize AWS SES Client
    this.sesClient = new SESClient({
      region: this.configService.get<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.sourceEmail = this.configService.get<string>('SES_SOURCE_EMAIL') || 'noreply@laas.com';
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
    try {

      const template = FirstLoginTemplate.generate({
        firstName,
        otp,
        expiryMinutes: 15,
        instituteName
      });

      const command = new SendEmailCommand({
        Source: this.sourceEmail,
        Destination: {
          ToAddresses: [email]
        },
        Message: {
          Subject: {
            Data: template.subject,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: template.htmlBody,
              Charset: 'UTF-8'
            },
            Text: {
              Data: template.textBody,
              Charset: 'UTF-8'
            }
          }
        }
      });

      const result = await this.sesClient.send(command);
      
      return true;

    } catch (error) {
      this.logger.error(`Failed to send first login OTP email to ${email}:`, error);
      return false;
    }
  }

  /**
   * Send password reset OTP email using AWS SES
   */
  async sendPasswordResetOTP(
    email: string, 
    otp: string, 
    firstName: string
  ): Promise<boolean> {
    try {

      const template = PasswordResetTemplate.generate({
        firstName,
        otp,
        expiryMinutes: 15
      });

      const command = new SendEmailCommand({
        Source: this.sourceEmail,
        Destination: {
          ToAddresses: [email]
        },
        Message: {
          Subject: {
            Data: template.subject,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: template.htmlBody,
              Charset: 'UTF-8'
            },
            Text: {
              Data: template.textBody,
              Charset: 'UTF-8'
            }
          }
        }
      });

      const result = await this.sesClient.send(command);
      
      return true;

    } catch (error) {
      this.logger.error(`Failed to send password reset OTP email to ${email}:`, error);
      return false;
    }
  }

  /**
   * Send change password OTP email using AWS SES
   */
  async sendChangePasswordOTP(
    email: string, 
    otp: string, 
    firstName: string
  ): Promise<boolean> {
    try {

      const template = ChangePasswordTemplate.generate({
        firstName,
        otp,
        expiryMinutes: 15
      });

      const command = new SendEmailCommand({
        Source: this.sourceEmail,
        Destination: {
          ToAddresses: [email]
        },
        Message: {
          Subject: {
            Data: template.subject,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: template.htmlBody,
              Charset: 'UTF-8'
            },
            Text: {
              Data: template.textBody,
              Charset: 'UTF-8'
            }
          }
        }
      });

      const result = await this.sesClient.send(command);
      
      return true;

    } catch (error) {
      this.logger.error(`Failed to send change password OTP email to ${email}:`, error);
      return false;
    }
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
    try {

      const template = PasswordChangeSuccessTemplate.generate({
        firstName,
        email,
        changeDate: new Date(),
        ipAddress,
        userAgent
      });

      const command = new SendEmailCommand({
        Source: this.sourceEmail,
        Destination: {
          ToAddresses: [email]
        },
        Message: {
          Subject: {
            Data: template.subject,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: template.htmlBody,
              Charset: 'UTF-8'
            },
            Text: {
              Data: template.textBody,
              Charset: 'UTF-8'
            }
          }
        }
      });

      const result = await this.sesClient.send(command);
      
      return true;

    } catch (error) {
      this.logger.error(`Failed to send password change success notification to ${email}:`, error);
      return false;
    }
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
    try {

      const template = SecurityAlertTemplate.generate({
        firstName,
        email,
        alertType,
        timestamp: new Date(),
        ipAddress,
        location
      });

      const command = new SendEmailCommand({
        Source: this.sourceEmail,
        Destination: {
          ToAddresses: [email]
        },
        Message: {
          Subject: {
            Data: template.subject,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: template.htmlBody,
              Charset: 'UTF-8'
            },
            Text: {
              Data: template.textBody,
              Charset: 'UTF-8'
            }
          }
        }
      });

      const result = await this.sesClient.send(command);
      
      return true;

    } catch (error) {
      this.logger.error(`Failed to send security alert to ${email}:`, error);
      return false;
    }
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
