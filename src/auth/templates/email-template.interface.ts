/**
 * Email Template Interface
 * Defines the structure for all email templates used in the authentication system
 */

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface OTPEmailData {
  firstName: string;
  otp: string;
  expiryMinutes: number;
  instituteName?: string;
}

export interface PasswordChangeData {
  firstName: string;
  email: string;
  changeDate: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface WelcomeEmailData {
  firstName: string;
  email: string;
  instituteName?: string;
  temporaryPassword?: string;
}

export interface SecurityAlertData {
  firstName: string;
  email: string;
  alertType: 'password_changed' | 'login_attempt' | 'account_locked' | 'suspicious_activity';
  timestamp: Date;
  ipAddress?: string;
  location?: string;
}
