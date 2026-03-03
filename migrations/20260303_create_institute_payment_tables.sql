-- ============================================================================
-- Migration: Create Institute Payment Tables
-- Date: 2026-03-03
-- Description: Creates all 4 institute payment tables with indexes
-- ============================================================================

-- 1. Institute Payments (main table)
CREATE TABLE IF NOT EXISTS `institute_payments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `institute_id` BIGINT NOT NULL,
  `created_by` BIGINT NULL,
  `payment_type` VARCHAR(100) NOT NULL,
  `description` TEXT NOT NULL,
  `payment_amount` DECIMAL(10, 2) NOT NULL,
  `due_date` TIMESTAMP NOT NULL,
  `target_type` ENUM('STUDENTS', 'PARENTS', 'BOTH') NOT NULL DEFAULT 'BOTH',
  `priority` ENUM('MANDATORY', 'OPTIONAL', 'DONATION') NOT NULL DEFAULT 'MANDATORY',
  `status` ENUM('ACTIVE', 'INACTIVE', 'COMPLETED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `payment_instructions` TEXT NULL,
  `bank_details` JSON NULL,
  `late_fee_amount` DECIMAL(10, 2) NULL,
  `late_fee_after_days` INT NULL,
  `auto_reminder_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `reminder_days_before` INT NOT NULL DEFAULT 3,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_inst_pay_institute` (`institute_id`),
  INDEX `idx_inst_pay_status` (`status`),
  INDEX `idx_inst_pay_institute_status` (`institute_id`, `status`),
  INDEX `idx_inst_pay_due_date` (`due_date`),
  INDEX `idx_inst_pay_created_by` (`created_by`),
  CONSTRAINT `fk_inst_pay_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Institute Payment Submissions
CREATE TABLE IF NOT EXISTS `institute_payment_submissions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `payment_id` BIGINT NOT NULL,
  `submitted_by` BIGINT NOT NULL,
  `payment_amount` DECIMAL(10, 2) NOT NULL,
  `payment_method` ENUM('BANK_TRANSFER', 'ONLINE_PAYMENT', 'CASH_DEPOSIT', 'UPI', 'CHEQUE') NOT NULL,
  `transaction_reference` VARCHAR(100) NULL,
  `payment_date` TIMESTAMP NOT NULL,
  `receipt_file_url` VARCHAR(255) NULL,
  `receipt_file_name` VARCHAR(255) NULL,
  `receipt_file_size` BIGINT NULL,
  `receipt_file_type` VARCHAR(100) NULL,
  `status` ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `verified_by` BIGINT NULL,
  `verified_at` TIMESTAMP NULL,
  `rejection_reason` TEXT NULL,
  `payment_remarks` TEXT NULL,
  `notes` TEXT NULL,
  `late_fee_applied` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_amount_paid` DECIMAL(10, 2) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_sub_payment` (`payment_id`),
  INDEX `idx_sub_submitted_by` (`submitted_by`),
  INDEX `idx_sub_status` (`status`),
  INDEX `idx_sub_payment_status` (`payment_id`, `status`),
  INDEX `idx_sub_receipt_url` (`receipt_file_url`),
  CONSTRAINT `fk_sub_payment_id` FOREIGN KEY (`payment_id`) REFERENCES `institute_payments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sub_submitted_by` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sub_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Institute Class Subject Payments
CREATE TABLE IF NOT EXISTS `institute_class_subject_payments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `institute_id` BIGINT NOT NULL,
  `class_id` BIGINT NOT NULL,
  `subject_id` BIGINT NOT NULL,
  `created_by` BIGINT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NOT NULL,
  `target_type` ENUM('PARENTS', 'STUDENTS') NOT NULL,
  `priority` ENUM('MANDATORY', 'OPTIONAL', 'DONATION') NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `document_url` VARCHAR(255) NULL,
  `last_date` TIMESTAMP NOT NULL,
  `status` ENUM('ACTIVE', 'INACTIVE', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_csp_institute` (`institute_id`),
  INDEX `idx_csp_class` (`class_id`),
  INDEX `idx_csp_subject` (`subject_id`),
  INDEX `idx_csp_institute_class_subject` (`institute_id`, `class_id`, `subject_id`),
  INDEX `idx_csp_status` (`status`),
  CONSTRAINT `fk_csp_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Institute Class Subject Payment Submissions
CREATE TABLE IF NOT EXISTS `institute_class_subject_payment_submissions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `payment_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `user_type` ENUM('SUPERADMIN', 'ORGANIZATION_MANAGER', 'USER', 'USER_WITHOUT_PARENT', 'USER_WITHOUT_STUDENT') NOT NULL,
  `username` VARCHAR(100) NOT NULL,
  `payment_date` TIMESTAMP NOT NULL,
  `receipt_url` VARCHAR(255) NOT NULL,
  `receipt_filename` VARCHAR(255) NOT NULL,
  `transaction_id` VARCHAR(100) NULL,
  `submitted_amount` DECIMAL(10, 2) NOT NULL,
  `status` ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `verified_by` BIGINT NULL,
  `verified_at` TIMESTAMP NULL,
  `rejection_reason` TEXT NULL,
  `notes` TEXT NULL,
  `uploaded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_csps_payment` (`payment_id`),
  INDEX `idx_csps_user` (`user_id`),
  INDEX `idx_csps_status` (`status`),
  INDEX `idx_csps_payment_status` (`payment_id`, `status`),
  INDEX `idx_csps_receipt_url` (`receipt_url`),
  CONSTRAINT `fk_csps_payment_id` FOREIGN KEY (`payment_id`) REFERENCES `institute_class_subject_payments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_csps_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_csps_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
