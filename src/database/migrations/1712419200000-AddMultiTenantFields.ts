import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMultiTenantFields1712419200000 implements MigrationInterface {
  name = 'AddMultiTenantFields1712419200000';

  private async columnExists(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    return Number(result[0]?.cnt) > 0;
  }

  private async tableExists(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [table],
    );
    return Number(result[0]?.cnt) > 0;
  }

  private async indexExists(queryRunner: QueryRunner, table: string, indexName: string): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [table, indexName],
    );
    return Number(result[0]?.cnt) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Institute multi-tenant columns (safe – skips if already exists) ───
    const cols: [string, string][] = [
      ['tier', `ENUM('FREE','STARTER','PROFESSIONAL','ENTERPRISE','ISOLATED') NOT NULL DEFAULT 'FREE'`],
      ['subdomain', `VARCHAR(63) NULL`],
      ['custom_domain', `VARCHAR(255) NULL`],
      ['custom_domain_verified', `BOOLEAN NOT NULL DEFAULT FALSE`],
      ['custom_domain_ssl_status', `ENUM('PENDING','ACTIVE','EXPIRED','FAILED') NULL`],
      ['custom_domain_verified_at', `TIMESTAMP NULL`],
      ['custom_login_enabled', `BOOLEAN NOT NULL DEFAULT FALSE`],
      ['login_logo_url', `VARCHAR(500) NULL`],
      ['login_background_type', `ENUM('COLOR','GRADIENT','IMAGE','VIDEO') NOT NULL DEFAULT 'COLOR'`],
      ['login_background_url', `VARCHAR(500) NULL`],
      ['login_video_poster_url', `VARCHAR(500) NULL`],
      ['login_illustration_url', `VARCHAR(500) NULL`],
      ['login_welcome_title', `VARCHAR(200) NULL`],
      ['login_welcome_subtitle', `VARCHAR(500) NULL`],
      ['login_footer_text', `VARCHAR(200) NULL`],
      ['login_custom_css', `JSON NULL`],
      ['favicon_url', `VARCHAR(500) NULL`],
      ['custom_app_name', `VARCHAR(100) NULL`],
      ['powered_by_visible', `BOOLEAN NOT NULL DEFAULT TRUE`],
      ['is_visible_in_app', `BOOLEAN NOT NULL DEFAULT TRUE`],
      ['is_visible_in_web_selector', `BOOLEAN NOT NULL DEFAULT TRUE`],
      ['sms_sender_name', `VARCHAR(11) NULL`],
      ['email_sender_address', `VARCHAR(255) NULL`],
      ['email_sender_name', `VARCHAR(100) NULL`],
    ];

    for (const [col, def] of cols) {
      if (!(await this.columnExists(queryRunner, 'institutes', col))) {
        await queryRunner.query(`ALTER TABLE institutes ADD COLUMN \`${col}\` ${def}`);
      }
    }

    // ─── Indexes for tenant resolution ───────────────────────────────
    if (!(await this.indexExists(queryRunner, 'institutes', 'idx_institutes_subdomain')))
      await queryRunner.query(`CREATE INDEX idx_institutes_subdomain ON institutes (subdomain)`);
    if (!(await this.indexExists(queryRunner, 'institutes', 'idx_institutes_custom_domain')))
      await queryRunner.query(`CREATE INDEX idx_institutes_custom_domain ON institutes (custom_domain)`);
    if (!(await this.indexExists(queryRunner, 'institutes', 'idx_institutes_tier')))
      await queryRunner.query(`CREATE INDEX idx_institutes_tier ON institutes (tier)`);

    // ─── Billing config per institute ────────────────────────────────
    if (!(await this.tableExists(queryRunner, 'institute_billing_config')))
    await queryRunner.query(`
      CREATE TABLE institute_billing_config (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        institute_id BIGINT NOT NULL UNIQUE,
        tier ENUM('FREE','STARTER','PROFESSIONAL','ENTERPRISE','ISOLATED') NOT NULL DEFAULT 'FREE',
        base_monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        per_user_monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        per_subdomain_login_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        sms_masking_monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        custom_pricing_json JSON NULL,
        billing_cycle_start_day INT NOT NULL DEFAULT 1,
        currency VARCHAR(3) NOT NULL DEFAULT 'LKR',
        max_free_subdomain_logins INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_billing_institute FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── Login events for billing tracking ───────────────────────────
    if (!(await this.tableExists(queryRunner, 'login_events')))
    await queryRunner.query(`
      CREATE TABLE login_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        institute_id BIGINT NULL,
        login_method ENUM('SURAKSHA_WEB','SURAKSHA_APP','SUBDOMAIN','CUSTOM_DOMAIN') NOT NULL,
        login_timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45) NULL,
        user_agent VARCHAR(500) NULL,
        INDEX idx_login_billing (institute_id, login_method, login_timestamp),
        INDEX idx_login_user_month (user_id, institute_id, login_method, login_timestamp),
        INDEX idx_login_timestamp (login_timestamp),
        CONSTRAINT fk_login_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_login_institute FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // ─── Monthly billing summary ─────────────────────────────────────
    if (!(await this.tableExists(queryRunner, 'monthly_billing_summary')))
    await queryRunner.query(`
      CREATE TABLE monthly_billing_summary (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        institute_id BIGINT NOT NULL,
        billing_month DATE NOT NULL COMMENT 'First day of the month e.g. 2026-04-01',
        total_logins INT NOT NULL DEFAULT 0,
        subdomain_logins INT NOT NULL DEFAULT 0,
        custom_domain_logins INT NOT NULL DEFAULT 0,
        unique_subdomain_users INT NOT NULL DEFAULT 0,
        unique_custom_domain_users INT NOT NULL DEFAULT 0,
        total_active_users INT NOT NULL DEFAULT 0,
        base_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        user_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        login_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        sms_masking_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        total_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        status ENUM('PENDING','INVOICED','PAID','OVERDUE') NOT NULL DEFAULT 'PENDING',
        invoice_url VARCHAR(500) NULL,
        paid_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_institute_month (institute_id, billing_month),
        CONSTRAINT fk_billing_summary_institute FOREIGN KEY (institute_id) REFERENCES institutes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS monthly_billing_summary`);
    await queryRunner.query(`DROP TABLE IF EXISTS login_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS institute_billing_config`);

    await queryRunner.query(`DROP INDEX idx_institutes_tier ON institutes`);
    await queryRunner.query(`DROP INDEX idx_institutes_custom_domain ON institutes`);
    await queryRunner.query(`DROP INDEX idx_institutes_subdomain ON institutes`);

    await queryRunner.query(`
      ALTER TABLE institutes
        DROP COLUMN email_sender_name,
        DROP COLUMN email_sender_address,
        DROP COLUMN sms_sender_name,
        DROP COLUMN is_visible_in_web_selector,
        DROP COLUMN is_visible_in_app,
        DROP COLUMN powered_by_visible,
        DROP COLUMN custom_app_name,
        DROP COLUMN favicon_url,
        DROP COLUMN login_custom_css,
        DROP COLUMN login_footer_text,
        DROP COLUMN login_welcome_subtitle,
        DROP COLUMN login_welcome_title,
        DROP COLUMN login_illustration_url,
        DROP COLUMN login_video_poster_url,
        DROP COLUMN login_background_url,
        DROP COLUMN login_background_type,
        DROP COLUMN login_logo_url,
        DROP COLUMN custom_login_enabled,
        DROP COLUMN custom_domain_verified_at,
        DROP COLUMN custom_domain_ssl_status,
        DROP COLUMN custom_domain_verified,
        DROP COLUMN custom_domain,
        DROP COLUMN subdomain,
        DROP COLUMN tier
    `);
  }
}
