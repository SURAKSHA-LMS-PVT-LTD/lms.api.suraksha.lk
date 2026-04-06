-- Migration: Add institute-level password columns to institute_user table
-- Date: 2025
-- Purpose: Enable institute-level authentication independent of main users table

ALTER TABLE `institute_user`
  ADD COLUMN `institute_password` VARCHAR(120) NULL DEFAULT NULL AFTER `house_id`,
  ADD COLUMN `institute_password_set_at` TIMESTAMP NULL DEFAULT NULL AFTER `institute_password`;

-- Index for institute-level login lookup (userIdByInstitute within an institute)
CREATE INDEX `idx_institute_user_login` ON `institute_user` (`institute_id`, `user_id_institue`, `status`);

-- Add INSTITUTE_PASSWORD_RESET to otp_purpose enum
ALTER TABLE `user_otps`
  MODIFY COLUMN `otp_purpose` ENUM('VERIFICATION','PASSWORD_RESET','TWO_FACTOR','PHONE_CHANGE','EMAIL_CHANGE','INSTITUTE_PASSWORD_RESET') NOT NULL DEFAULT 'VERIFICATION';
