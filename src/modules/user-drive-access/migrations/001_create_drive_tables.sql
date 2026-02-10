-- ============================================================
-- MIGRATION: Create Google Drive Token & File Management Tables
-- Database: MySQL 8.x
-- Module: user-drive-access
-- Date: 2026-02-11
-- 
-- SECURITY: Refresh tokens are AES-256-GCM encrypted by the
-- application before storage. The column stores ciphertext only.
-- ============================================================

-- 1. User Drive Tokens (one per user — stores encrypted refresh token)
CREATE TABLE IF NOT EXISTS `user_drive_tokens` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `google_email` VARCHAR(255) NULL,
  `google_display_name` VARCHAR(255) NULL,
  `google_profile_picture` VARCHAR(500) NULL,
  `encrypted_refresh_token` TEXT NOT NULL COMMENT 'AES-256-GCM encrypted. Format: base64(iv):base64(authTag):base64(ciphertext)',
  `granted_scopes` VARCHAR(500) NULL,
  `access_token_expires_at` DATETIME NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_used_at` DATETIME NULL,
  `refresh_count` INT NOT NULL DEFAULT 0,
  `consecutive_failures` INT NOT NULL DEFAULT 0,
  `last_failure_reason` VARCHAR(500) NULL,
  `authorized_ip` VARCHAR(45) NULL,
  `authorized_user_agent` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_drive_token_user` (`user_id`),
  KEY `idx_drive_token_active` (`is_active`, `user_id`),
  KEY `idx_drive_token_expires` (`access_token_expires_at`),
  KEY `idx_drive_token_google_email` (`google_email`),
  CONSTRAINT `fk_drive_token_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Stores encrypted Google OAuth2 refresh tokens for Drive access. Tokens encrypted with AES-256-GCM.';


-- 2. User Drive Files (tracks every file uploaded through our backend)
CREATE TABLE IF NOT EXISTS `user_drive_files` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `drive_file_id` VARCHAR(255) NOT NULL COMMENT 'Google Drive file ID',
  `drive_web_view_link` VARCHAR(500) NULL,
  `drive_web_content_link` VARCHAR(500) NULL,
  `drive_folder_id` VARCHAR(255) NULL,
  `file_name` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `file_size` BIGINT NULL,
  `uploaded_by_user_id` BIGINT NOT NULL,
  `purpose` ENUM('HOMEWORK_SUBMISSION', 'HOMEWORK_REFERENCE', 'HOMEWORK_CORRECTION', 'EXAM_SUBMISSION', 'PROFILE_DOCUMENT', 'GENERAL') NOT NULL DEFAULT 'GENERAL',
  `reference_type` VARCHAR(100) NULL COMMENT 'Polymorphic ref type: homework_submission, homework_reference, exam, etc.',
  `reference_id` BIGINT NULL COMMENT 'Polymorphic ref ID: the entity ID this file belongs to',
  `sharing_permissions` TEXT NULL COMMENT 'JSON array of {email, role, type}',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_deleted_from_drive` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_drive_file_user` (`uploaded_by_user_id`),
  KEY `idx_drive_file_drive_id` (`drive_file_id`),
  KEY `idx_drive_file_purpose` (`purpose`),
  KEY `idx_drive_file_reference` (`reference_type`, `reference_id`),
  KEY `idx_drive_file_user_purpose` (`uploaded_by_user_id`, `purpose`),
  CONSTRAINT `fk_drive_file_user` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tracks files uploaded to Google Drive through the LMS backend proxy.';
