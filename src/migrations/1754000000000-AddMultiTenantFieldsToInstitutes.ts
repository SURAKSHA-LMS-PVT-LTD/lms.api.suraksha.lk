import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMultiTenantFieldsToInstitutes1754000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tier & Subdomain
    const hasTier = await this.columnExists(queryRunner, 'institutes', 'tier');
    if (!hasTier) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`tier\` ENUM('FREE','STARTER','PROFESSIONAL','ENTERPRISE','ISOLATED') NOT NULL DEFAULT 'FREE' COMMENT 'Package tier: FREE, STARTER, PROFESSIONAL, ENTERPRISE, ISOLATED'`,
      );
    }

    const hasSubdomain = await this.columnExists(queryRunner, 'institutes', 'subdomain');
    if (!hasSubdomain) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`subdomain\` VARCHAR(63) NULL COMMENT 'Subdomain slug e.g. "royalcollege" → royalcollege.suraksha.lk'`,
      );
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD UNIQUE INDEX \`idx_institutes_subdomain\` (\`subdomain\`)`,
      );
    }

    const hasCustomDomain = await this.columnExists(queryRunner, 'institutes', 'custom_domain');
    if (!hasCustomDomain) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`custom_domain\` VARCHAR(255) NULL COMMENT 'Custom domain e.g. "lms.royalcollege.lk"'`,
      );
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD UNIQUE INDEX \`idx_institutes_custom_domain\` (\`custom_domain\`)`,
      );
    }

    const hasCustomDomainVerified = await this.columnExists(queryRunner, 'institutes', 'custom_domain_verified');
    if (!hasCustomDomainVerified) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`custom_domain_verified\` TINYINT(1) NOT NULL DEFAULT 0`,
      );
    }

    const hasCustomDomainSslStatus = await this.columnExists(queryRunner, 'institutes', 'custom_domain_ssl_status');
    if (!hasCustomDomainSslStatus) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`custom_domain_ssl_status\` ENUM('PENDING','ACTIVE','EXPIRED','FAILED') NULL`,
      );
    }

    const hasCustomDomainVerifiedAt = await this.columnExists(queryRunner, 'institutes', 'custom_domain_verified_at');
    if (!hasCustomDomainVerifiedAt) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`custom_domain_verified_at\` TIMESTAMP NULL`,
      );
    }

    // Login Page Customization
    const hasCustomLoginEnabled = await this.columnExists(queryRunner, 'institutes', 'custom_login_enabled');
    if (!hasCustomLoginEnabled) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`custom_login_enabled\` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Whether custom login page is active'`,
      );
    }

    const hasLoginLogoUrl = await this.columnExists(queryRunner, 'institutes', 'login_logo_url');
    if (!hasLoginLogoUrl) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`login_logo_url\` VARCHAR(500) NULL`,
      );
    }

    const hasLoginBackgroundType = await this.columnExists(queryRunner, 'institutes', 'login_background_type');
    if (!hasLoginBackgroundType) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`login_background_type\` ENUM('COLOR','GRADIENT','IMAGE','VIDEO') NOT NULL DEFAULT 'COLOR'`,
      );
    }

    const hasLoginBackgroundUrl = await this.columnExists(queryRunner, 'institutes', 'login_background_url');
    if (!hasLoginBackgroundUrl) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`login_background_url\` VARCHAR(500) NULL COMMENT 'Background image or video URL'`,
      );
    }

    const hasLoginVideoPosterUrl = await this.columnExists(queryRunner, 'institutes', 'login_video_poster_url');
    if (!hasLoginVideoPosterUrl) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`login_video_poster_url\` VARCHAR(500) NULL COMMENT 'Poster image for video background'`,
      );
    }

    const hasLoginIllustrationUrl = await this.columnExists(queryRunner, 'institutes', 'login_illustration_url');
    if (!hasLoginIllustrationUrl) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`login_illustration_url\` VARCHAR(500) NULL COMMENT 'Replaces default login illustration'`,
      );
    }

    const hasLoginWelcomeTitle = await this.columnExists(queryRunner, 'institutes', 'login_welcome_title');
    if (!hasLoginWelcomeTitle) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`login_welcome_title\` VARCHAR(200) NULL`,
      );
    }

    const hasLoginWelcomeSubtitle = await this.columnExists(queryRunner, 'institutes', 'login_welcome_subtitle');
    if (!hasLoginWelcomeSubtitle) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`login_welcome_subtitle\` VARCHAR(500) NULL`,
      );
    }

    const hasLoginFooterText = await this.columnExists(queryRunner, 'institutes', 'login_footer_text');
    if (!hasLoginFooterText) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`login_footer_text\` VARCHAR(200) NULL`,
      );
    }

    const hasLoginCustomCss = await this.columnExists(queryRunner, 'institutes', 'login_custom_css');
    if (!hasLoginCustomCss) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`login_custom_css\` JSON NULL COMMENT 'Custom CSS overrides: { fontFamily, borderRadius, ... }'`,
      );
    }

    const hasFaviconUrl = await this.columnExists(queryRunner, 'institutes', 'favicon_url');
    if (!hasFaviconUrl) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`favicon_url\` VARCHAR(500) NULL`,
      );
    }

    const hasCustomAppName = await this.columnExists(queryRunner, 'institutes', 'custom_app_name');
    if (!hasCustomAppName) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`custom_app_name\` VARCHAR(100) NULL COMMENT 'Browser tab title override'`,
      );
    }

    const hasPoweredByVisible = await this.columnExists(queryRunner, 'institutes', 'powered_by_visible');
    if (!hasPoweredByVisible) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`powered_by_visible\` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Show "Powered by Suraksha LMS"'`,
      );
    }

    // Visibility Controls
    const hasIsVisibleInApp = await this.columnExists(queryRunner, 'institutes', 'is_visible_in_app');
    if (!hasIsVisibleInApp) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`is_visible_in_app\` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Show in Suraksha mobile app institute selector'`,
      );
    }

    const hasIsVisibleInWebSelector = await this.columnExists(queryRunner, 'institutes', 'is_visible_in_web_selector');
    if (!hasIsVisibleInWebSelector) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`is_visible_in_web_selector\` TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Show in lms.suraksha.lk institute selector'`,
      );
    }

    // SMS / Email Masking
    const hasSmsSenderName = await this.columnExists(queryRunner, 'institutes', 'sms_sender_name');
    if (!hasSmsSenderName) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`sms_sender_name\` VARCHAR(11) NULL COMMENT 'Custom SMS sender ID (max 11 chars)'`,
      );
    }

    const hasEmailSenderAddress = await this.columnExists(queryRunner, 'institutes', 'email_sender_address');
    if (!hasEmailSenderAddress) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`email_sender_address\` VARCHAR(255) NULL`,
      );
    }

    const hasEmailSenderName = await this.columnExists(queryRunner, 'institutes', 'email_sender_name');
    if (!hasEmailSenderName) {
      await queryRunner.query(
        `ALTER TABLE \`institutes\` ADD COLUMN \`email_sender_name\` VARCHAR(100) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      'email_sender_name', 'email_sender_address', 'sms_sender_name',
      'is_visible_in_web_selector', 'is_visible_in_app',
      'powered_by_visible', 'custom_app_name', 'favicon_url',
      'login_custom_css', 'login_footer_text', 'login_welcome_subtitle',
      'login_welcome_title', 'login_illustration_url', 'login_video_poster_url',
      'login_background_url', 'login_background_type', 'login_logo_url',
      'custom_login_enabled', 'custom_domain_verified_at',
      'custom_domain_ssl_status', 'custom_domain_verified',
    ];

    for (const col of columns) {
      const exists = await this.columnExists(queryRunner, 'institutes', col);
      if (exists) {
        await queryRunner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`${col}\``);
      }
    }

    // Drop indexes before columns
    try { await queryRunner.query(`ALTER TABLE \`institutes\` DROP INDEX \`idx_institutes_custom_domain\``); } catch {}
    const hasCustomDomain = await this.columnExists(queryRunner, 'institutes', 'custom_domain');
    if (hasCustomDomain) {
      await queryRunner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`custom_domain\``);
    }

    try { await queryRunner.query(`ALTER TABLE \`institutes\` DROP INDEX \`idx_institutes_subdomain\``); } catch {}
    const hasSubdomain = await this.columnExists(queryRunner, 'institutes', 'subdomain');
    if (hasSubdomain) {
      await queryRunner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`subdomain\``);
    }

    const hasTier = await this.columnExists(queryRunner, 'institutes', 'tier');
    if (hasTier) {
      await queryRunner.query(`ALTER TABLE \`institutes\` DROP COLUMN \`tier\``);
    }
  }

  private async columnExists(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
    const result = await queryRunner.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    return parseInt(result[0].cnt, 10) > 0;
  }
}
