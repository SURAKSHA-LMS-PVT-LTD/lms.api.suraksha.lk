import { EmailTemplate, OTPEmailData } from './email-template.interface';

/**
 * First Login OTP Email Template
 * Professional template for welcoming new users with their first login OTP
 */
export class FirstLoginTemplate {
  static generate(data: OTPEmailData): EmailTemplate {
    const { firstName, otp, expiryMinutes, instituteName } = data;
    
    const subject = `Welcome to LAAS - Your Login Code`;
    
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LAAS - First Login</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f5f7fa; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
        .content { padding: 30px 20px; }
        .otp-box { background: #f8f9ff; border: 2px dashed #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
        .otp-code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 4px; font-family: 'Courier New', monospace; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
        .highlight { color: #667eea; font-weight: 600; }
        .warning { color: #dc3545; font-size: 14px; margin-top: 15px; }
        .security-note { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; font-size: 28px;">🎓 LAAS Platform</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Learning Analytics & Assessment System</p>
        </div>
        
        <div class="content">
            <h2 style="color: #333; margin-bottom: 20px;">Welcome, ${firstName}! 👋</h2>
            
            <p style="color: #555; margin-bottom: 20px;">
                You're taking the first step into your learning journey${instituteName ? ` at <span class="highlight">${instituteName}</span>` : ''}. 
                Complete your account setup with the verification code below:
            </p>
            
            <div class="otp-box">
                <p style="margin: 0 0 10px 0; color: #555; font-size: 16px;">Your Verification Code</p>
                <div class="otp-code">${otp}</div>
                <p class="warning">⏱️ Expires in ${expiryMinutes} minutes</p>
            </div>
            
            <div class="security-note">
                <p style="margin: 0; color: #555;">
                    <strong>🔐 Security Note:</strong> This code is for your first-time login only. 
                    Keep it confidential and don't share with anyone.
                </p>
            </div>

            <div style="background: #f0f7ff; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                <p style="margin: 0 0 10px 0; color: #333; font-weight: 600;">📱 Get the Suraksha LMS App</p>
                <p style="margin: 0 0 15px 0; color: #555; font-size: 14px;">Access your courses anywhere, anytime</p>
                <a href="https://play.google.com/store/apps/details?id=lk.suraksha.lms" 
                   style="display: inline-block; background: #667eea; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 0 5px 10px;">
                    📲 Download Android App
                </a>
                <br>
                <a href="https://lms.suraksha.lk" 
                   style="display: inline-block; color: #667eea; padding: 8px 24px; text-decoration: none; font-size: 14px;">
                    🌐 Or visit lms.suraksha.lk
                </a>
            </div>
            
            <p style="color: #777; font-size: 14px; margin-top: 25px;">
                Having trouble? Contact your administrator or reply to this email for assistance.
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
LAAS Platform - First Login Verification

Welcome, ${firstName}!

Your verification code for first-time login${instituteName ? ` at ${instituteName}` : ''} is:

${otp}

This code will expire in ${expiryMinutes} minutes.

Important: Keep this code confidential and don't share with anyone.

Download the Suraksha LMS mobile app:
https://play.google.com/store/apps/details?id=lk.suraksha.lms

Or visit: https://lms.suraksha.lk

If you didn't request this code, please ignore this email.

---
LAAS Platform - Learning Analytics & Assessment System
This is an automated message, please do not reply directly.
`;

    return { subject, htmlBody, textBody };
  }
}
