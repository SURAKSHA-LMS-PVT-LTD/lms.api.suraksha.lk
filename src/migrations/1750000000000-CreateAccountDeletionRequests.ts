import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: CreateAccountDeletionRequests
 *
 * Creates the `account_deletion_requests` table for Google Play-compliant
 * account deletion tracking. Tracks user-initiated deletion requests with
 * a 30-day grace period before permanent deletion.
 */
export class CreateAccountDeletionRequests1750000000000 implements MigrationInterface {
  name = 'CreateAccountDeletionRequests1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`account_deletion_requests\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`user_id\` BIGINT NOT NULL,
        \`reason\` VARCHAR(500) NULL,
        \`status\` ENUM('PENDING', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
        \`scheduled_deletion_date\` TIMESTAMP NOT NULL,
        \`requester_ip\` VARCHAR(45) NULL,
        \`cancelled_by\` BIGINT NULL,
        \`completed_at\` TIMESTAMP NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_deletion_user_id\` (\`user_id\`),
        INDEX \`idx_deletion_status_scheduled\` (\`status\`, \`scheduled_deletion_date\`),
        INDEX \`idx_deletion_user_id\` (\`user_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`account_deletion_requests\``);
  }
}
