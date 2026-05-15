import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove AUTO_INCREMENT from users.id.
 *
 * After this migration the application assigns random 9-digit numeric IDs
 * via UserEntity.assignRandomId() (BeforeInsert hook) so user IDs remain
 * human-readable on receipts and SMS but are no longer sequential/guessable.
 *
 * The column type stays BIGINT UNSIGNED — existing IDs are preserved.
 * Collision probability at 100M users ≈ 0.4% (9-digit space = 900M values).
 * If a collision occurs, the insert fails with a unique-key error and the
 * caller retries (standard optimistic-insert pattern).
 */
export class RemoveUserIdAutoIncrement1790000000003 implements MigrationInterface {
  name = 'RemoveUserIdAutoIncrement1790000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop AUTO_INCREMENT by redefining the column without it.
    // PRIMARY KEY stays; column type stays BIGINT UNSIGNED NOT NULL.
    await queryRunner.query(
      `ALTER TABLE users MODIFY COLUMN id BIGINT UNSIGNED NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore AUTO_INCREMENT (safe — existing IDs are not touched).
    await queryRunner.query(
      `ALTER TABLE users MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`,
    );
  }
}
