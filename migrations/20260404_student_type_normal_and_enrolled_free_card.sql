-- Migration: Add 'normal' to student_type enum and 'enrolled_free_card' to verification_status enum
-- Date: 2026-04-04

-- 1. Add 'enrolled_free_card' to verification_status enum
ALTER TABLE institute_class_subject_students
  MODIFY COLUMN verification_status ENUM('verified', 'pending', 'rejected', 'pending_payment', 'payment_rejected', 'enrolled_free_card') NOT NULL DEFAULT 'verified';

-- 2. Add 'normal' to student_type enum and change default to 'normal'
ALTER TABLE institute_class_subject_students
  MODIFY COLUMN student_type ENUM('normal', 'paid', 'free_card') NOT NULL DEFAULT 'normal';

-- 3. Update existing 'paid' students to 'normal' (since 'paid' was the old default for all students)
UPDATE institute_class_subject_students
  SET student_type = 'normal'
  WHERE student_type = 'paid';
