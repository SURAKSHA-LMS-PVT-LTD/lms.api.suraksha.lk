-- ============================================
-- Image Verification Migration
-- Add verification columns to users table
-- ============================================

-- Add image_verification_status column
ALTER TABLE `users`
ADD COLUMN `image_verification_status` ENUM('PENDING', 'VERIFIED', 'REJECTED') NULL
COMMENT 'Profile image verification status: PENDING/VERIFIED/REJECTED';

-- Add image_verified_by column
ALTER TABLE `users`
ADD COLUMN `image_verified_by` BIGINT NULL
COMMENT 'Admin user ID who verified/rejected the image';

-- Add image_verified_at column
ALTER TABLE `users`
ADD COLUMN `image_verified_at` TIMESTAMP NULL
COMMENT 'Timestamp when image was verified/rejected';

-- Add image_rejection_reason column
ALTER TABLE `users`
ADD COLUMN `image_rejection_reason` TEXT NULL
COMMENT 'Reason provided when image was rejected';

-- Set existing users with images to PENDING status
UPDATE `users`
SET `image_verification_status` = 'PENDING'
WHERE `image_url` IS NOT NULL 
  AND `image_verification_status` IS NULL;

SELECT '✅ Image verification columns added successfully!' as status;
