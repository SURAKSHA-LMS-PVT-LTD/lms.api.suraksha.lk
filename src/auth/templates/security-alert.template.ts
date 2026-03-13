import { EmailTemplate, SecurityAlertData } from './email-template.interface';

/**
 * Security Alert Email Template
 * Template for various security-related notifications
 */
export class SecurityAlertTemplate {
  static generate(data: SecurityAlertData): EmailTemplate {
    const { firstName, email, alertType, timestamp, ipAddress, location } = data;
    
    const getAlertInfo = (type: string) => {
      switch (type) {
        case 'password_changed':
          return {
            title: 'Password Changed',
            icon: '🔐',
            message: 'Your password has been changed',
            color: '#28a745'
          };
        case 'login_attempt':
          return {
            title: 'Suspicious Login Attempt',
            icon: '🚨',
            message: 'Someone attempted to access your account',
            color: '#dc3545'
          };
        case 'account_locked':
          return {
            title: 'Account Locked',
            icon: '🔒',
            message: 'Your account has been temporarily locked',
            color: '#ffc107'
          };
        case 'suspicious_activity':
          return {
            title: 'Suspicious Activity Detected',
            icon: '⚠️',
            message: 'Unusual activity detected on your account',
            color: '#fd7e14'
          };
        default:
          return {
            title: 'Security Alert',
            icon: '🛡️',
            message: 'Security notification for your account',
            color: '#6f42c1'
          };
      }
    };
    
    const alert = getAlertInfo(alertType);
    const subject = `LAAS Security Alert - ${alert.title}`;
    
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
    <title>LAAS - Security Alert</title>
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f5f7fa; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, ${alert.color} 0%, ${alert.color}dd 100%); color: white; padding: 30px 20px; text-align: center; }
        .content { padding: 30px 20px; }
        .alert-box { background: ${alert.color}11; border: 2px solid ${alert.color}; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 14px; }
        .details { background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .action-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0; font-size: 28px;">${alert.icon} LAAS Platform</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Security Alert</p>
        </div>
        
        <div class="content">
            <h2 style="color: #333; margin-bottom: 20px;">Hi ${firstName},</h2>
            
            <div class="alert-box">
                <h3 style="color: ${alert.color}; margin: 0 0 10px 0;">${alert.icon} ${alert.title}</h3>
                <p style="margin: 0; color: #555;">${alert.message}</p>
            </div>
            
            <p style="color: #555; margin-bottom: 20px;">
                We're writing to inform you about important security activity on your LAAS account.
            </p>
            
            <div class="details">
                <h4 style="margin: 0 0 10px 0; color: #333;">Activity Details:</h4>
                <p style="margin: 5px 0;"><strong>Account:</strong> ${email}</p>
                <p style="margin: 5px 0;"><strong>Date & Time:</strong> ${formatDate(timestamp)}</p>
                ${ipAddress ? `<p style="margin: 5px 0;"><strong>IP Address:</strong> ${ipAddress}</p>` : ''}
                ${location ? `<p style="margin: 5px 0;"><strong>Location:</strong> ${location}</p>` : ''}
            </div>
            
            <div class="action-box">
                <p style="margin: 0; color: #555;">
                    <strong>🚨 Action Required:</strong> If this activity wasn't initiated by you, 
                    please secure your account immediately and contact our support team.
                </p>
            </div>
            
            <h4 style="color: #333; margin-top: 25px;">Recommended Actions:</h4>
            <ul style="color: #555; margin: 10px 0; padding-left: 20px;">
                <li>Change your password if you suspect unauthorized access</li>
                <li>Review your recent account activity</li>
                <li>Ensure you're using a strong, unique password</li>
                <li>Contact support if you notice any suspicious activity</li>
            </ul>
        </div>
        
        <div class="footer">
            <p style="margin: 0;">
                <strong>LAAS Platform</strong> - Secure Learning Management<br>
                This is an automated security message, please do not reply directly.
            </p>
        </div>
    </div>
</body>
</html>`;

    const textBody = `
LAAS Platform - Security Alert

Hi ${firstName},

${alert.title}: ${alert.message}

We're writing to inform you about important security activity on your LAAS account.

Activity Details:
- Account: ${email}
- Date & Time: ${formatDate(timestamp)}
${ipAddress ? `- IP Address: ${ipAddress}` : ''}
${location ? `- Location: ${location}` : ''}

Action Required: If this activity wasn't initiated by you, please secure your account immediately.

Recommended Actions:
- Change your password if you suspect unauthorized access
- Review your recent account activity
- Ensure you're using a strong, unique password
- Contact support if you notice any suspicious activity

---
LAAS Platform - Learning Analytics & Assessment System
This is an automated security message, please do not reply directly.
`;

    return { subject, htmlBody, textBody };
  }
}
