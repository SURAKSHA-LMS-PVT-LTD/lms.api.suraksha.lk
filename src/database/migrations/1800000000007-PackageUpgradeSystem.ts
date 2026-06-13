import { MigrationInterface, QueryRunner } from 'typeorm';

export class PackageUpgradeSystem1800000000007 implements MigrationInterface {
  name = 'PackageUpgradeSystem1800000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add target_plan and quantity columns to payments table
    await queryRunner.query(`
      ALTER TABLE payments
        ADD COLUMN IF NOT EXISTS target_plan ENUM(
          'FREE','WHATSAPP','TELEGRAM','EMAIL',
          'PRO-WHATSAPP','PRO-SMS','PRO-TELEGRAM','PRO-EMAIL','DYNAMAD'
        ) NULL AFTER notes,
        ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1 AFTER target_plan
    `);

    // Create package_definitions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS package_definitions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        subscription_plan ENUM(
          'FREE','WHATSAPP','TELEGRAM','EMAIL',
          'PRO-WHATSAPP','PRO-SMS','PRO-TELEGRAM','PRO-EMAIL','DYNAMAD'
        ) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500) NULL,
        features JSON NULL,
        price DECIMAL(10,2) NOT NULL,
        validity_days INT NOT NULL DEFAULT 30,
        image_url VARCHAR(500) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL,
        UNIQUE KEY idx_pkg_plan (subscription_plan),
        KEY idx_pkg_active_sort (is_active, sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Seed default package definitions (INSERT IGNORE skips if already seeded)
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await queryRunner.query(`
      INSERT IGNORE INTO package_definitions
        (subscription_plan, name, description, features, price, validity_days, image_url, sort_order, is_active, created_at, updated_at)
      VALUES
        (
          'WHATSAPP',
          'WhatsApp Basic',
          'Send notifications and updates via WhatsApp to your students and parents.',
          '["WhatsApp message delivery","Student & parent notifications","Attendance alerts","Exam result notifications"]',
          990.00, 30, NULL, 1, 1, '${now}', '${now}'
        ),
        (
          'TELEGRAM',
          'Telegram Basic',
          'Deliver messages and updates through Telegram channels and bots.',
          '["Telegram message delivery","Automated bot notifications","Homework reminders","Event announcements"]',
          790.00, 30, NULL, 2, 1, '${now}', '${now}'
        ),
        (
          'EMAIL',
          'Email Basic',
          'Professional email notifications for your institute communications.',
          '["Email delivery","Bulk email to students & parents","Exam result emails","Monthly reports"]',
          590.00, 30, NULL, 3, 1, '${now}', '${now}'
        ),
        (
          'PRO-WHATSAPP',
          'WhatsApp Pro',
          'Full-featured WhatsApp communication suite with priority support and advanced features.',
          '["Everything in WhatsApp Basic","Priority message delivery","Custom sender name","Bulk messaging","Delivery reports","Priority support"]',
          1990.00, 30, NULL, 4, 1, '${now}', '${now}'
        ),
        (
          'PRO-SMS',
          'SMS Pro',
          'Reliable SMS delivery with custom masking for professional institute branding.',
          '["SMS delivery with custom mask","Bulk SMS campaigns","Attendance SMS alerts","Exam result SMS","Priority support"]',
          1490.00, 30, NULL, 5, 1, '${now}', '${now}'
        ),
        (
          'PRO-TELEGRAM',
          'Telegram Pro',
          'Advanced Telegram integration with custom bot and priority delivery.',
          '["Everything in Telegram Basic","Custom bot branding","Priority delivery","Advanced scheduling","Delivery analytics","Priority support"]',
          1290.00, 30, NULL, 6, 1, '${now}', '${now}'
        ),
        (
          'PRO-EMAIL',
          'Email Pro',
          'Premium email suite with custom domain sending and advanced templates.',
          '["Everything in Email Basic","Custom sender domain","HTML email templates","Scheduled campaigns","Open & click tracking","Priority support"]',
          990.00, 30, NULL, 7, 1, '${now}', '${now}'
        ),
        (
          'DYNAMAD',
          'DynamAd',
          'Dynamic advertisement and content delivery platform for your institute.',
          '["Dynamic ad campaigns","Multi-channel delivery","Student engagement analytics","Custom content scheduling","Branded notifications","Dedicated support"]',
          2990.00, 30, NULL, 8, 1, '${now}', '${now}'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS package_definitions`);
    await queryRunner.query(`
      ALTER TABLE payments
        DROP COLUMN IF EXISTS quantity,
        DROP COLUMN IF EXISTS target_plan
    `);
  }
}
