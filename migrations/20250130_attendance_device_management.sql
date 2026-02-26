-- ============================================================================
-- MIGRATION: Attendance Device Management System
-- Version: 1.0.0
-- Date: 2025-01-30
-- Description: Creates 5 tables for device registration, configuration,
--              event binding, session management, and audit logging.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ATTENDANCE_DEVICES — Core device registry
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `attendance_devices` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `device_uid` VARCHAR(128) NOT NULL COMMENT 'Unique hardware/serial identifier',
  `device_name` VARCHAR(255) NOT NULL COMMENT 'Human-readable name',
  `device_type` ENUM('TABLET','PHONE','RFID_READER','BIOMETRIC','KIOSK','NFC_TERMINAL','QR_SCANNER','OTHER') NOT NULL DEFAULT 'TABLET',
  `institute_id` VARCHAR(64) NULL COMMENT 'FK to institute (nullable if unassigned)',
  `institute_name` VARCHAR(255) NULL COMMENT 'Denormalized for quick lookups',
  `is_enabled` TINYINT NOT NULL DEFAULT 1,
  `status` ENUM('ACTIVE','INACTIVE','MAINTENANCE','BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  `assigned_by` VARCHAR(64) NULL,
  `assigned_at` TIMESTAMP NULL,
  `last_heartbeat_at` TIMESTAMP NULL,
  `last_activity_at` TIMESTAMP NULL,
  `ip_address` VARCHAR(45) NULL,
  `firmware_version` VARCHAR(64) NULL,
  `metadata` JSON NULL COMMENT 'Extensible device metadata',
  `description` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `IDX_DEVICE_UID` (`device_uid`),
  INDEX `IDX_DEVICE_INSTITUTE` (`institute_id`),
  INDEX `IDX_DEVICE_STATUS` (`status`),
  INDEX `IDX_DEVICE_ENABLED` (`is_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Registered attendance marking devices';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ATTENDANCE_DEVICE_CONFIG — Per-device configuration
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `attendance_device_config` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `device_id` BIGINT NOT NULL COMMENT 'FK to attendance_devices.id',
  `max_sessions` INT NOT NULL DEFAULT 1 COMMENT 'Maximum concurrent sessions',
  `rate_limit_per_minute` INT NOT NULL DEFAULT 30 COMMENT 'Max marks per minute',
  `rate_limit_per_hour` INT NOT NULL DEFAULT 500 COMMENT 'Max marks per hour',
  `allowed_status_mode` ENUM('ANY','BLOCKED','ONLY') NOT NULL DEFAULT 'ANY'
    COMMENT 'ANY=all statuses, BLOCKED=no marking, ONLY=only listed statuses',
  `allowed_status_list` JSON NULL COMMENT 'Array of allowed status strings when mode=ONLY',
  `auto_status` VARCHAR(32) NULL COMMENT 'Auto-apply this status on mark (e.g. "present")',
  `require_location` TINYINT NOT NULL DEFAULT 0,
  `require_photo` TINYINT NOT NULL DEFAULT 0,
  `allowed_ip_ranges` JSON NULL COMMENT 'Array of CIDR ranges (system admin only)',
  `operating_start_time` VARCHAR(5) NULL COMMENT 'HH:MM format',
  `operating_end_time` VARCHAR(5) NULL COMMENT 'HH:MM format',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `UQ_DEVICE_CONFIG` (`device_id`),
  CONSTRAINT `FK_device_config_device` FOREIGN KEY (`device_id`)
    REFERENCES `attendance_devices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Per-device configuration and constraints';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. ATTENDANCE_DEVICE_EVENT_BINDINGS — Device ↔ Event bindings
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `attendance_device_event_bindings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `device_id` BIGINT NOT NULL COMMENT 'FK to attendance_devices.id',
  `event_id` INT NOT NULL COMMENT 'FK to calendar event',
  `event_name` VARCHAR(255) NULL COMMENT 'Denormalized event name',
  `calendar_day_id` INT NULL COMMENT 'Optional calendar day reference',
  `bound_by` VARCHAR(64) NOT NULL COMMENT 'User who created this binding',
  `is_active` TINYINT NOT NULL DEFAULT 1 COMMENT 'Only 1 active binding per device',
  `status` ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `status_override` VARCHAR(32) NULL COMMENT 'Override status for marks via this binding',
  `notes` TEXT NULL,
  `bound_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `unbound_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `IDX_BINDING_DEVICE` (`device_id`),
  INDEX `IDX_BINDING_ACTIVE` (`device_id`, `is_active`),
  INDEX `IDX_BINDING_EVENT` (`event_id`),
  CONSTRAINT `FK_binding_device` FOREIGN KEY (`device_id`)
    REFERENCES `attendance_devices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Maps devices to events — only one active binding per device at a time';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. ATTENDANCE_DEVICE_SESSIONS — Active session tracking
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `attendance_device_sessions` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `device_id` BIGINT NOT NULL COMMENT 'FK to attendance_devices.id',
  `session_token` VARCHAR(128) NOT NULL COMMENT 'UUID v4 session token',
  `user_id` VARCHAR(64) NULL COMMENT 'Operator user ID',
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `ip_address` VARCHAR(45) NULL,
  `user_agent` VARCHAR(512) NULL,
  `marks_count` INT NOT NULL DEFAULT 0 COMMENT 'Number of marks in this session',
  `started_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` TIMESTAMP NULL,
  `ended_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `IDX_SESSION_TOKEN` (`session_token`),
  INDEX `IDX_SESSION_DEVICE` (`device_id`),
  INDEX `IDX_SESSION_ACTIVE` (`device_id`, `is_active`),
  CONSTRAINT `FK_session_device` FOREIGN KEY (`device_id`)
    REFERENCES `attendance_devices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Active device sessions with token-based identification';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. ATTENDANCE_DEVICE_AUDIT_LOG — Immutable audit trail
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `attendance_device_audit_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `device_id` BIGINT NOT NULL COMMENT 'FK to attendance_devices.id',
  `action` ENUM(
    'CREATED','ASSIGNED','UNASSIGNED','ENABLED','DISABLED',
    'CONFIG_CHANGED','EVENT_BOUND','EVENT_UNBOUND',
    'SESSION_STARTED','SESSION_ENDED',
    'BLOCKED','UNBLOCKED','INSTITUTE_CHANGED',
    'DELETED','STATUS_MODE_CHANGED','RATE_LIMIT_CHANGED'
  ) NOT NULL,
  `performed_by` VARCHAR(64) NOT NULL,
  `details` JSON NULL COMMENT 'Before/after state, metadata',
  `ip_address` VARCHAR(45) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `IDX_AUDIT_DEVICE` (`device_id`),
  INDEX `IDX_AUDIT_ACTION` (`action`),
  INDEX `IDX_AUDIT_DATE` (`created_at`),
  CONSTRAINT `FK_audit_device` FOREIGN KEY (`device_id`)
    REFERENCES `attendance_devices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='INSERT-only audit trail for all device management operations';

-- ============================================================================
-- ROLLBACK (if needed):
-- DROP TABLE IF EXISTS `attendance_device_audit_log`;
-- DROP TABLE IF EXISTS `attendance_device_sessions`;
-- DROP TABLE IF EXISTS `attendance_device_event_bindings`;
-- DROP TABLE IF EXISTS `attendance_device_config`;
-- DROP TABLE IF EXISTS `attendance_devices`;
-- ============================================================================
