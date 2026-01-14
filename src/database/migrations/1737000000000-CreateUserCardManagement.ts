import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUserCardManagement1737000000000 implements MigrationInterface {
    name = 'CreateUserCardManagement1737000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // MySQL doesn't need separate ENUM types, they are defined inline in columns
        
        // 1. Create cards table (Catalog)
        await queryRunner.query(`
            CREATE TABLE \`cards\` (
                \`id\` BIGINT NOT NULL AUTO_INCREMENT,
                \`card_name\` VARCHAR(100) NOT NULL,
                \`card_type\` ENUM('NFC', 'PVC', 'TEMPORARY') NOT NULL,
                \`card_image_url\` VARCHAR(500),
                \`card_video_url\` VARCHAR(500),
                \`description\` TEXT,
                \`price\` DECIMAL(10,2) NOT NULL,
                \`quantity_available\` INT NOT NULL DEFAULT 0,
                \`validity_days\` INT NOT NULL DEFAULT 365,
                \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
                \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`)
            )
        `);

        // 2. Create user_id_card_orders table
        await queryRunner.query(`
            CREATE TABLE \`user_id_card_orders\` (
                \`id\` BIGINT NOT NULL AUTO_INCREMENT,
                \`user_id\` BIGINT NOT NULL,
                \`card_id\` BIGINT NOT NULL,
                \`card_type\` ENUM('NFC', 'PVC', 'TEMPORARY') NOT NULL,
                \`payment_id\` BIGINT,
                \`card_expiry_date\` TIMESTAMP NOT NULL,
                \`status\` ENUM('ACTIVE', 'INACTIVE', 'DEACTIVATED', 'EXPIRED', 'LOST', 'DAMAGED', 'REPLACED') NOT NULL DEFAULT 'INACTIVE',
                \`order_status\` ENUM('PENDING_PAYMENT', 'PAYMENT_RECEIVED', 'VERIFYING', 'VERIFIED', 'PREPARING', 'PRINTING', 'DELIVERING', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED', 'REJECTED') NOT NULL DEFAULT 'PENDING_PAYMENT',
                \`rejected_reason\` TEXT,
                \`order_date\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`delivery_address\` TEXT NOT NULL,
                \`contact_phone\` VARCHAR(20) NOT NULL,
                \`notes\` TEXT,
                \`tracking_number\` VARCHAR(100),
                \`rfid_number\` VARCHAR(50),
                \`delivered_at\` TIMESTAMP NULL,
                \`activated_at\` TIMESTAMP NULL,
                \`deactivated_at\` TIMESTAMP NULL,
                \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`)
            )
        `);

        // Create indexes for user_id_card_orders
        await queryRunner.query(`
            CREATE INDEX \`idx_user_card_order_user\` ON \`user_id_card_orders\` (\`user_id\`)
        `);
        await queryRunner.query(`
            CREATE INDEX \`idx_user_card_order_status\` ON \`user_id_card_orders\` (\`order_status\`, \`status\`)
        `);
        await queryRunner.query(`
            CREATE INDEX \`idx_user_card_order_date\` ON \`user_id_card_orders\` (\`order_date\`)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX \`idx_user_card_rfid\` ON \`user_id_card_orders\` (\`rfid_number\`)
        `);

        // 3. Create card_payments table
        await queryRunner.query(`
            CREATE TABLE \`card_payments\` (
                \`id\` BIGINT NOT NULL AUTO_INCREMENT,
                \`order_id\` BIGINT NOT NULL,
                \`submission_url\` VARCHAR(500) NOT NULL,
                \`payment_type\` ENUM('SLIP_UPLOAD', 'VISA_MASTER') NOT NULL,
                \`payment_amount\` DECIMAL(10,2) NOT NULL,
                \`payment_reference\` VARCHAR(100),
                \`payment_status\` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                \`verified_by\` BIGINT,
                \`verified_at\` TIMESTAMP NULL,
                \`rejection_reason\` TEXT,
                \`notes\` TEXT,
                \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`)
            )
        `);

        // Create index for card_payments
        await queryRunner.query(`
            CREATE INDEX \`idx_card_payment_order\` ON \`card_payments\` (\`order_id\`)
        `);

        // Add foreign keys
        await queryRunner.query(`
            ALTER TABLE \`user_id_card_orders\` 
            ADD CONSTRAINT \`FK_order_user\` 
            FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) 
            ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE \`user_id_card_orders\` 
            ADD CONSTRAINT \`FK_order_card\` 
            FOREIGN KEY (\`card_id\`) REFERENCES \`cards\`(\`id\`) 
            ON DELETE RESTRICT
        `);

        await queryRunner.query(`
            ALTER TABLE \`card_payments\` 
            ADD CONSTRAINT \`FK_payment_order\` 
            FOREIGN KEY (\`order_id\`) REFERENCES \`user_id_card_orders\`(\`id\`) 
            ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE \`card_payments\` 
            ADD CONSTRAINT \`FK_payment_verifier\` 
            FOREIGN KEY (\`verified_by\`) REFERENCES \`users\`(\`id\`) 
            ON DELETE SET NULL
        `);

        // Seed sample cards
        await queryRunner.query(`
            INSERT INTO \`cards\` 
            (\`card_name\`, \`card_type\`, \`price\`, \`quantity_available\`, \`validity_days\`, \`description\`)
            VALUES
            ('Standard NFC Card', 'NFC', 500.00, 100, 730, 'Standard NFC-enabled ID card with 2-year validity'),
            ('Standard PVC Card', 'PVC', 300.00, 200, 730, 'Standard PVC ID card with 2-year validity'),
            ('Temporary Card', 'TEMPORARY', 150.00, 50, 90, 'Temporary card valid for 90 days')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign keys
        await queryRunner.query(`ALTER TABLE \`card_payments\` DROP FOREIGN KEY \`FK_payment_verifier\``);
        await queryRunner.query(`ALTER TABLE \`card_payments\` DROP FOREIGN KEY \`FK_payment_order\``);
        await queryRunner.query(`ALTER TABLE \`user_id_card_orders\` DROP FOREIGN KEY \`FK_order_card\``);
        await queryRunner.query(`ALTER TABLE \`user_id_card_orders\` DROP FOREIGN KEY \`FK_order_user\``);

        // Drop indexes
        await queryRunner.query(`DROP INDEX \`idx_card_payment_order\` ON \`card_payments\``);
        await queryRunner.query(`DROP INDEX \`idx_user_card_rfid\` ON \`user_id_card_orders\``);
        await queryRunner.query(`DROP INDEX \`idx_user_card_order_date\` ON \`user_id_card_orders\``);
        await queryRunner.query(`DROP INDEX \`idx_user_card_order_status\` ON \`user_id_card_orders\``);
        await queryRunner.query(`DROP INDEX \`idx_user_card_order_user\` ON \`user_id_card_orders\``);

        // Drop tables
        await queryRunner.query(`DROP TABLE \`card_payments\``);
        await queryRunner.query(`DROP TABLE \`user_id_card_orders\``);
        await queryRunner.query(`DROP TABLE \`cards\``);
    }
}
