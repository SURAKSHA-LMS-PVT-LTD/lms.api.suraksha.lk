import { EmailTemplate, OTPEmailData } from './email-template.interface';

/**
 * Password Reset OTP Email Template
 * Security-focused template for password reset requests
 */
export class PasswordResetTemplate {
  static generate(data: OTPEmailData): EmailTemplate {
    const { firstName, otp, expiryMinutes } = data;
    
    const subject = `LAAS - Password Reset Code`;
    
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LAAS - Password Reset</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f5f7fa; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%); color: white; padding: 30px 20px; text-align: center; }
        .content { padding: 30px 20px; }
        .otp-box { background: #fff5f5; border: 2px dashed #ff6b6b; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
        .otp-code { font-size: 32px; font-weight: bold; color: #ff6b6b; letter-spacing: 4px; font-family: 'Courier New', monospace; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
        .warning { color: #dc3545; font-size: 14px; margin-top: 15px; }
        .security-alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; font-size: 28px;">🔒 LAAS Platform</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Password Reset Request</p>
        </div>
        
        <div class="content">
            <h2 style="color: #333; margin-bottom: 20px;">Hi ${firstName},</h2>
            
            <p style="color: #555; margin-bottom: 20px;">
                We received a request to reset your password. Use the verification code below to continue:
            </p>
            
            <div class="otp-box">
                <p style="margin: 0 0 10px 0; color: #555; font-size: 16px;">Password Reset Code</p>
                <div class="otp-code">${otp}</div>
                <p class="warning">⏱️ Expires in ${expiryMinutes} minutes</p>
            </div>
            
            <div class="security-alert">
                <p style="margin: 0; color: #555;">
                    <strong>⚠️ Security Alert:</strong> If you didn't request this password reset, 
                    please ignore this email and contact support immediately.
                </p>
            </div>
            
            <p style="color: #777; font-size: 14px; margin-top: 25px;">
                If you continue to have problems, please contact our support team.
            </p>
        </div>
        
        <div class="footer">
            <p style="margin: 0;">
                <strong>LAAS Platform</strong> - Secure Learning Management<br>
                This is an automated message, please do not reply directly.
            </p>
        </div>
    </div>
</body>
</html>`;

    const textBody = `
LAAS Platform - Password Reset

Hi ${firstName},

We received a request to reset your password.

Your password reset verification code is:

${otp}

This code will expire in ${expiryMinutes} minutes.

Important: If you didn't request this password reset, please ignore this email and contact support.

---
LAAS Platform - Learning Analytics & Assessment System
This is an automated message, please do not reply directly.
`;

    return { subject, htmlBody, textBody };
  }
}
