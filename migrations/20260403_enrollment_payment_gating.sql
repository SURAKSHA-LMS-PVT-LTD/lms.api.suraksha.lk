-- ============================================================================
-- Migration: Enrollment Payment Gating
-- Date: 2026-04-03
-- Description: Adds enrollment fee fields to institute_class_subjects and
--              payment tracking fields to institute_class_subject_students
-- ============================================================================

-- 1. Add enrollment fee fields to institute_class_subjects
ALTER TABLE `institute_class_subjects`
  ADD COLUMN `enrollment_fee_required` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Whether enrollment requires payment',
  ADD COLUMN `enrollment_fee_amount` DECIMAL(10,2) NULL COMMENT 'Monthly/enrollment fee amount';

-- 2. Add payment tracking fields to institute_class_subject_students
--    Expand verification_status enum to include payment states
ALTER TABLE `institute_class_subject_students`
  MODIFY COLUMN `verification_status` ENUM('verified','pending','rejected','pending_payment','payment_rejected') NOT NULL DEFAULT 'verified'
    COMMENT 'verified=active, pending=awaiting admin, rejected=denied, pending_payment=awaiting payment verification, payment_rejected=payment slip rejected (can resubmit)',
  ADD COLUMN `enrollment_payment_id` BIGINT NULL COMMENT 'FK to institute_class_subject_payment_submissions if payment-gated',
  ADD INDEX `idx_css_enrollment_payment` (`enrollment_payment_id`);
