-- Convert timestamp columns to datetime for better TypeORM compatibility
-- This ensures dates are properly serialized in JSON responses

USE `suraksha-lms-db`;

-- Update institute_lectures table
ALTER TABLE institute_lectures 
  MODIFY COLUMN start_time DATETIME NOT NULL,
  MODIFY COLUMN end_time DATETIME NOT NULL,
  MODIFY COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  MODIFY COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Verify the changes
DESCRIBE institute_lectures;

-- Check sample data
SELECT id, title, start_time, end_time, created_at, updated_at 
FROM institute_lectures 
WHERE id = 4;
