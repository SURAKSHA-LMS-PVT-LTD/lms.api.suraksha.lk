-- Add student_type column to institute_class_subject_students table
-- Supports: 'paid' (default) and 'free_card' (exempt from enrollment fee)

ALTER TABLE `institute_class_subject_students`
  ADD COLUMN `student_type` ENUM('paid', 'free_card') NOT NULL DEFAULT 'paid' 
  COMMENT 'Student payment type: paid=regular, free_card=exempt from enrollment fee'
  AFTER `enrollment_payment_id`;
