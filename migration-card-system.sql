-- ============================================
-- Card System Migration
-- Add RFID card + Normal card fields to users table
-- ============================================

-- RFID Card Fields
ALTER TABLE `users`
ADD COLUMN `rfid_expiry_date` TIMESTAMP NULL
COMMENT 'RFID/NFC card expiration date';

ALTER TABLE `users`
ADD COLUMN `rfid_card_status` ENUM('ACTIVE', 'INACTIVE', 'DEACTIVATED', 'EXPIRED', 'LOST', 'DAMAGED', 'REPLACED') NULL
COMMENT 'RFID/NFC card status';

-- Normal (QR/Barcode) Card Fields
ALTER TABLE `users`
ADD COLUMN `card_id` VARCHAR(50) NULL
COMMENT 'Normal (QR/Barcode) card identifier';

ALTER TABLE `users`
ADD COLUMN `card_expiry_date` TIMESTAMP NULL
COMMENT 'Normal card expiration date';

ALTER TABLE `users`
ADD COLUMN `card_status` ENUM('ACTIVE', 'INACTIVE', 'DEACTIVATED', 'EXPIRED', 'LOST', 'DAMAGED', 'REPLACED') NULL
COMMENT 'Normal card status';

-- Add unique index on card_id
ALTER TABLE `users`
ADD UNIQUE INDEX `idx_users_card_id` (`card_id`);

-- Sync existing RFID users - if rfid exists, set rfid_card_status from active card orders
UPDATE `users` u
INNER JOIN `user_id_card_orders` o ON o.user_id = u.id AND o.rfid_number = u.rfid
SET 
  u.rfid_card_status = o.status,
  u.rfid_expiry_date = o.card_expiry_date
WHERE u.rfid IS NOT NULL
  AND o.status = 'ACTIVE';

SELECT 'Card system columns added successfully!' as status;
