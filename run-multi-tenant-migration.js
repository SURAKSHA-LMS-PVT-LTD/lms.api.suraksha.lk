const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const colExists = async (table, col) => {
    const [rows] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, col],
    );
    return Number(rows[0].cnt) > 0;
  };

  const tableExists = async (table) => {
    const [rows] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [table],
    );
    return Number(rows[0].cnt) > 0;
  };

  const indexExists = async (table, idx) => {
    const [rows] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
      [table, idx],
    );
    return Number(rows[0].cnt) > 0;
  };

  // --- Add columns to institutes ---
  const cols = [
    ['tier', "ENUM('FREE','STARTER','PROFESSIONAL','ENTERPRISE','ISOLATED') NOT NULL DEFAULT 'FREE'"],
    ['subdomain', 'VARCHAR(63) NULL'],
    ['custom_domain', 'VARCHAR(255) NULL'],
    ['custom_domain_verified', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ['custom_domain_ssl_status', "ENUM('PENDING','ACTIVE','EXPIRED','FAILED') NULL"],
    ['custom_domain_verified_at', 'TIMESTAMP NULL'],
    ['custom_login_enabled', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ['login_logo_url', 'VARCHAR(500) NULL'],
    ['login_background_type', "ENUM('COLOR','GRADIENT','IMAGE','VIDEO') NOT NULL DEFAULT 'COLOR'"],
    ['login_background_url', 'VARCHAR(500) NULL'],
    ['login_video_poster_url', 'VARCHAR(500) NULL'],
    ['login_illustration_url', 'VARCHAR(500) NULL'],
    ['login_welcome_title', 'VARCHAR(200) NULL'],
    ['login_welcome_subtitle', 'VARCHAR(500) NULL'],
    ['login_footer_text', 'VARCHAR(200) NULL'],
    ['login_custom_css', 'JSON NULL'],
    ['favicon_url', 'VARCHAR(500) NULL'],
    ['custom_app_name', 'VARCHAR(100) NULL'],
    ['powered_by_visible', 'BOOLEAN NOT NULL DEFAULT TRUE'],
    ['is_visible_in_app', 'BOOLEAN NOT NULL DEFAULT TRUE'],
    ['is_visible_in_web_selector', 'BOOLEAN NOT NULL DEFAULT TRUE'],
    ['sms_sender_name', 'VARCHAR(11) NULL'],
    ['email_sender_address', 'VARCHAR(255) NULL'],
    ['email_sender_name', 'VARCHAR(100) NULL'],
  ];

  for (const [col, def] of cols) {
    if (!(await colExists('institutes', col))) {
      await conn.query(`ALTER TABLE institutes ADD COLUMN \`${col}\` ${def}`);
      console.log('Added:', col);
    } else {
      console.log('Exists:', col);
    }
  }

  // --- Indexes ---
  const indexes = [
    ['institutes', 'idx_institutes_subdomain', 'subdomain'],
    ['institutes', 'idx_institutes_custom_domain', 'custom_domain'],
    ['institutes', 'idx_institutes_tier', 'tier'],
  ];
  for (const [table, idx, col] of indexes) {
    if (!(await indexExists(table, idx))) {
      await conn.query(`CREATE INDEX ${idx} ON ${table} (${col})`);
      console.log('Created index:', idx);
    } else {
      console.log('Index exists:', idx);
    }
  }

  // --- Billing config table ---
  if (!(await tableExists('institute_billing_config'))) {
    await conn.query(`
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
    console.log('Created table: institute_billing_config');
  } else {
    console.log('Table exists: institute_billing_config');
  }

  // --- Login events table ---
  if (!(await tableExists('login_events'))) {
    await conn.query(`
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
    console.log('Created table: login_events');
  } else {
    console.log('Table exists: login_events');
  }

  // --- Monthly billing summary table ---
  if (!(await tableExists('monthly_billing_summary'))) {
    await conn.query(`
      CREATE TABLE monthly_billing_summary (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        institute_id BIGINT NOT NULL,
        billing_month DATE NOT NULL,
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
    console.log('Created table: monthly_billing_summary');
  } else {
    console.log('Table exists: monthly_billing_summary');
  }

  // --- Record both migrations as executed ---
  const migrationNames = [
    [1712419200000, 'AddMultiTenantFields1712419200000'],
    [1754000000000, 'AddMultiTenantFieldsToInstitutes1754000000000'],
  ];
  for (const [ts, name] of migrationNames) {
    const [existing] = await conn.query('SELECT id FROM migrations WHERE name = ?', [name]);
    if (existing.length === 0) {
      await conn.query('INSERT INTO migrations (timestamp, name) VALUES (?, ?)', [ts, name]);
      console.log('Recorded migration:', name);
    } else {
      console.log('Migration already recorded:', name);
    }
  }

  await conn.end();
  console.log('\nAll done!');
})().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
