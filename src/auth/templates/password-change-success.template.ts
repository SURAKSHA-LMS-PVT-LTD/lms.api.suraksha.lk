import { EmailTemplate, PasswordChangeData } from './email-template.interface';

/**
 * Password Change Success Email Template
 * Confirmation template sent after successful password change
 */
export class PasswordChangeSuccessTemplate {
  static generate(data: PasswordChangeData): EmailTemplate {
    const { firstName, email, changeDate, ipAddress } = data;
    
    const subject = `LAAS - Password Successfully Changed`;
    
    const formatDate = (date: Date) => {
      return date.toLocaleString('en-US', {
        timeZone: 'UTC', // Dates are stored as Sri Lanka time in UTC slots — read without offset
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };
    
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LAAS - Password Changed</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f5f7fa; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 30px 20px; text-align: center; }
        .content { padding: 30px 20px; }
        .success-box { background: #f8fff8; border: 2px solid #28a745; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
        .details { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .security-alert { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; font-size: 28px;">✅ LAAS Platform</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Password Successfully Changed</p>
        </div>
        
        <div class="content">
            <h2 style="color: #333; margin-bottom: 20px;">Hi ${firstName},</h2>
            
            <div class="success-box">
                <h3 style="color: #28a745; margin: 0 0 10px 0;">🔐 Password Changed Successfully</h3>
                <p style="margin: 0; color: #555;">Your password has been updated and your account is secure.</p>
            </div>
            
            <p style="color: #555; margin-bottom: 20px;">
                This email confirms that your password was successfully changed for your LAAS account.
            </p>
            
            <div class="details">
                <h4 style="margin: 0 0 10px 0; color: #333;">Change Details:</h4>
                <p style="margin: 5px 0;"><strong>Account:</strong> ${email}</p>
                <p style="margin: 5px 0;"><strong>Date & Time:</strong> ${formatDate(changeDate)}</p>
                ${ipAddress ? `<p style="margin: 5px 0;"><strong>IP Address:</strong> ${ipAddress}</p>` : ''}
            </div>
            
            <div class="security-alert">
                <p style="margin: 0; color: #555;">
                    <strong>⚠️ Important:</strong> If you didn't make this change, please contact our support team 
                    immediately and secure your account.
                </p>
            </div>
            
            <h4 style="color: #333; margin-top: 25px;">Security Recommendations:</h4>
            <ul style="color: #555; margin: 10px 0; padding-left: 20px;">
                <li>Keep your password confidential and don't share it with anyone</li>
                <li>Use a unique password for your LAAS account</li>
                <li>Enable two-factor authentication if available</li>
                <li>Log out from shared or public computers</li>
            </ul>
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
LAAS Platform - Password Successfully Changed

Hi ${firstName},

This email confirms that your password was successfully changed for your LAAS account.

Change Details:
- Account: ${email}
- Date & Time: ${formatDate(changeDate)}
${ipAddress ? `- IP Address: ${ipAddress}` : ''}

Important: If you didn't make this change, please contact our support team immediately.

Security Recommendations:
- Keep your password confidential and don't share it with anyone
- Use a unique password for your LAAS account
- Enable two-factor authentication if available
- Log out from shared or public computers

---
LAAS Platform - Learning Analytics & Assessment System
This is an automated message, please do not reply directly.
`;

    return { subject, htmlBody, textBody };
  }
}
