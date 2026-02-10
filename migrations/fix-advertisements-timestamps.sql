-- Migration: Add created_at and updated_at columns to advertisements table
-- Run this on your production database

ALTER TABLE `advertisements`
ADD COLUMN `created_at` TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

ALTER TABLE `advertisements`
ADD COLUMN `updated_at` TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6);

-- Verify the columns were added
SHOW COLUMNS FROM `advertisements` WHERE Field IN ('created_at', 'updated_at');
