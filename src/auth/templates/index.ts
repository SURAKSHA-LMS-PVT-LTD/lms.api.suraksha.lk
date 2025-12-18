/**
 * Email Template Manager
 * Central export point for all email templates used in the authentication system
 */

// Template Interfaces
export * from './email-template.interface';

// Authentication Templates
export { FirstLoginTemplate } from './first-login.template';
export { PasswordResetTemplate } from './password-reset.template';
export { ChangePasswordTemplate } from './change-password.template';
export { PasswordChangeSuccessTemplate } from './password-change-success.template';
export { SecurityAlertTemplate } from './security-alert.template';

// Import for factory use
import { FirstLoginTemplate } from './first-login.template';
import { PasswordResetTemplate } from './password-reset.template';
import { ChangePasswordTemplate } from './change-password.template';
import { PasswordChangeSuccessTemplate } from './password-change-success.template';
import { SecurityAlertTemplate } from './security-alert.template';

// Template Types
export enum EmailTemplateType {
  FIRST_LOGIN = 'first_login',
  PASSWORD_RESET = 'password_reset',
  CHANGE_PASSWORD = 'change_password',
  PASSWORD_CHANGE_SUCCESS = 'password_change_success',
  SECURITY_ALERT = 'security_alert'
}

// Template Factory
export class EmailTemplateFactory {
  static getTemplate(type: EmailTemplateType) {
    switch (type) {
      case EmailTemplateType.FIRST_LOGIN:
        return FirstLoginTemplate;
      case EmailTemplateType.PASSWORD_RESET:
        return PasswordResetTemplate;
      case EmailTemplateType.CHANGE_PASSWORD:
        return ChangePasswordTemplate;
      case EmailTemplateType.PASSWORD_CHANGE_SUCCESS:
        return PasswordChangeSuccessTemplate;
      case EmailTemplateType.SECURITY_ALERT:
        return SecurityAlertTemplate;
      default:
        throw new Error(`Unknown email template type: ${type}`);
    }
  }
}
