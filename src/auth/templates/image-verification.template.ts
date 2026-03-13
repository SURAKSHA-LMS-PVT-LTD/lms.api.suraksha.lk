/**
 * Email Template for Image Rejection
 * Sends professional rejection email with signed upload URL
 */

export interface ImageRejectionEmailData {
  userName: string;
  rejectionReason: string;
  uploadUrl: string;
  expiresAt: string;
  supportEmail?: string;
}

export function getImageRejectionEmailTemplate(data: ImageRejectionEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { userName, rejectionReason, uploadUrl, expiresAt, supportEmail = 'support@suraksha.lk' } = data;

  const expiryDate = new Date(expiresAt);
  const formattedExpiry = expiryDate.toLocaleString('en-US', {
    timeZone: 'UTC', // Dates are stored as Sri Lanka time in UTC slots — read without offset
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const subject = '📸 Profile Image Update Required - Suraksha LMS';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Update Required</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">
                📸 Profile Image Update Required
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="font-size: 16px; color: #333333; margin: 0 0 20px; line-height: 1.6;">
                Dear <strong>${userName}</strong>,
              </p>
              
              <p style="font-size: 16px; color: #333333; margin: 0 0 20px; line-height: 1.6;">
                Thank you for submitting your profile image. After review, we need you to upload a new image for the following reason:
              </p>
              
              <!-- Rejection Reason Box -->
              <div style="background-color: #fff3cd; border-left: 4px solid: #ffc107; padding: 20px; margin: 20px 0; border-radius: 8px;">
                <p style="margin: 0; font-size: 15px; color: #856404; font-weight: 500;">
                  <strong>Review Feedback:</strong>
                </p>
                <p style="margin: 10px 0 0; font-size: 15px; color: #856404; line-height: 1.6;">
                  ${rejectionReason}
                </p>
              </div>
              
              <p style="font-size: 16px; color: #333333; margin: 20px 0; line-height: 1.6;">
                Please upload a new image by clicking the button below:
              </p>
              
              <!-- Upload Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${uploadUrl}" 
                       style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                      📤 Upload New Image
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Important Info Box -->
              <div style="background-color: #e7f3ff; border-left: 4px solid #2196F3; padding: 20px; margin: 30px 0; border-radius: 8px;">
                <p style="margin: 0; font-size: 14px; color: #0c5460; line-height: 1.8;">
                  <strong>⏰ Important:</strong> This upload link is valid until <strong>${formattedExpiry}</strong>
                </p>
              </div>
              
              <!-- Guidelines -->
              <div style="margin: 30px 0;">
                <h3 style="color: #333333; font-size: 18px; margin: 0 0 15px;">📋 Image Upload Guidelines:</h3>
                <ul style="color: #666666; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                  <li>Use a <strong>clear, recent photo</strong> with good lighting</li>
                  <li>Face should be clearly visible (no sunglasses or masks)</li>
                  <li>Plain background preferred</li>
                  <li>Maximum file size: <strong>5MB</strong></li>
                  <li>Supported formats: JPG, PNG, WEBP, GIF</li>
                  <li>Photo should be professional and appropriate</li>
                </ul>
              </div>
              
              <!-- Alternate Link -->
              <div style="margin-top: 30px; padding-top: 25px; border-top: 1px solid #e0e0e0;">
                <p style="font-size: 13px; color: #666666; margin: 0 0 10px;">
                  <strong>Can't click the button?</strong> Copy and paste this link into your browser:
                </p>
                <p style="font-size: 12px; color: #2196F3; word-break: break-all; background-color: #f8f9fa; padding: 12px; border-radius: 6px; margin: 0;">
                  ${uploadUrl}
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="font-size: 14px; color: #666666; margin: 0 0 10px;">
                Need help? Contact us at <a href="mailto:${supportEmail}" style="color: #667eea; text-decoration: none;">${supportEmail}</a>
              </p>
              <p style="font-size: 12px; color: #999999; margin: 10px 0 0;">
                © ${new Date().getFullYear()} Suraksha LMS. All rights reserved.
              </p>
              <p style="font-size: 11px; color: #999999; margin: 10px 0 0;">
                This is an automated email. Please do not reply directly to this message.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const text = `
Profile Image Update Required

Dear ${userName},

Thank you for submitting your profile image. After review, we need you to upload a new image for the following reason:

REVIEW FEEDBACK:
${rejectionReason}

Please upload a new image using this link:
${uploadUrl}

IMPORTANT: This upload link is valid until ${formattedExpiry}

IMAGE UPLOAD GUIDELINES:
- Use a clear, recent photo with good lighting
- Face should be clearly visible (no sunglasses or masks)
- Plain background preferred
- Maximum file size: 5MB
- Supported formats: JPG, PNG, WEBP, GIF
- Photo should be professional and appropriate

Need help? Contact us at ${supportEmail}

© ${new Date().getFullYear()} Suraksha LMS. All rights reserved.
This is an automated email. Please do not reply directly to this message.
  `;

  return { subject, html, text };
}

/**
 * Email Template for Image Approval
 */
export interface ImageApprovalEmailData {
  userName: string;
  approvedAt: string;
  dashboardUrl?: string;
}

export function getImageApprovalEmailTemplate(data: ImageApprovalEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { userName, approvedAt, dashboardUrl = 'https://lms.suraksha.lk/dashboard' } = data;

  const approvalDate = new Date(approvedAt).toLocaleString('en-US', {
    timeZone: 'UTC', // Dates are stored as Sri Lanka time in UTC slots — read without offset
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const subject = '✅ Profile Image Approved - Suraksha LMS';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Image Approved</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">
                ✅ Profile Image Approved!
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px; text-align: center;">
              <p style="font-size: 18px; color: #333333; margin: 0 0 20px;">
                Dear <strong>${userName}</strong>,
              </p>
              <p style="font-size: 16px; color: #666666; margin: 0 0 30px; line-height: 1.6;">
                Great news! Your profile image has been <strong style="color: #4CAF50;">approved</strong> and is now active on your account.
              </p>
              <p style="font-size: 14px; color: #999999; margin: 0;">
                Approved on: ${approvalDate}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: #ffffff; text-decoration: none; padding: 14px 35px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      View Your Profile
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="font-size: 12px; color: #999999; margin: 0;">
                © ${new Date().getFullYear()} Suraksha LMS
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const text = `
Profile Image Approved!

Dear ${userName},

Great news! Your profile image has been approved and is now active on your account.

Approved on: ${approvalDate}

View your profile at: ${dashboardUrl}

© ${new Date().getFullYear()} Suraksha LMS
  `;

  return { subject, html, text };
}
