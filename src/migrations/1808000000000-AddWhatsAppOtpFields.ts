import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds WhatsApp-link OTP support to both OTP-bearing tables.
 *
 * Reverse-OTP flow: the server generates a code, shows the user a wa.me deep
 * link, the user sends the code from their own WhatsApp, the webhook confirms
 * it (code + sender-phone must match) and flips the verified flag. The site
 * then does a one-shot status check.
 *
 * - user_otps:            already phone-bound. Add delivery_method + wa_sender_phone.
 * - password_reset_tokens: email-only today. Add delivery_method, phone_number
 *                          (the number to bind the WhatsApp sender against) and
 *                          wa_sender_phone.
 */
export class AddWhatsAppOtpFields1808000000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ── user_otps ────────────────────────────────────────────────────────────
    const hasUserOtpDelivery = await qr.hasColumn('user_otps', 'delivery_method');
    if (!hasUserOtpDelivery) {
      await qr.query(`
        ALTER TABLE user_otps
          ADD COLUMN delivery_method ENUM('SMS','WHATSAPP','EMAIL') NOT NULL DEFAULT 'SMS' AFTER otp_purpose,
          ADD COLUMN wa_sender_phone VARCHAR(20) NULL AFTER ip_address,
          ADD INDEX idx_user_otps_code_pending (otp_code, is_verified, expires_at)
      `);
    }

    // ── password_reset_tokens ─────────────────────────────────────────────────
    const hasResetDelivery = await qr.hasColumn('password_reset_tokens', 'delivery_method');
    if (!hasResetDelivery) {
      await qr.query(`
        ALTER TABLE password_reset_tokens
          ADD COLUMN delivery_method ENUM('SMS','WHATSAPP','EMAIL') NOT NULL DEFAULT 'EMAIL' AFTER tokenType,
          ADD COLUMN phone_number VARCHAR(20) NULL AFTER delivery_method,
          ADD COLUMN wa_sender_phone VARCHAR(20) NULL AFTER ipAddress,
          ADD INDEX idx_prt_otp_pending (otp, isOtpVerified, expiresAt)
      `);
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const hasUserOtpDelivery = await qr.hasColumn('user_otps', 'delivery_method');
    if (hasUserOtpDelivery) {
      await qr.query(`
        ALTER TABLE user_otps
          DROP INDEX idx_user_otps_code_pending,
          DROP COLUMN wa_sender_phone,
          DROP COLUMN delivery_method
      `);
    }

    const hasResetDelivery = await qr.hasColumn('password_reset_tokens', 'delivery_method');
    if (hasResetDelivery) {
      await qr.query(`
        ALTER TABLE password_reset_tokens
          DROP INDEX idx_prt_otp_pending,
          DROP COLUMN wa_sender_phone,
          DROP COLUMN phone_number,
          DROP COLUMN delivery_method
      `);
    }
  }
}
