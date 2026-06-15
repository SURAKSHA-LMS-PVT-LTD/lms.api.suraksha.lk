import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPackageFieldsToGatewayOrders1807000000001 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    const hasUserId = await qr.hasColumn('gateway_payment_orders', 'user_id');
    if (hasUserId) return;

    await qr.query(`
      ALTER TABLE gateway_payment_orders
        ADD COLUMN user_id             BIGINT      NULL AFTER credits_granted,
        ADD COLUMN target_plan         VARCHAR(50) NULL AFTER user_id,
        ADD COLUMN target_validity_days INT        NULL AFTER target_plan,
        ADD INDEX  idx_gpo_user (user_id)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    const hasUserId = await qr.hasColumn('gateway_payment_orders', 'user_id');
    if (!hasUserId) return;

    await qr.query(`
      ALTER TABLE gateway_payment_orders
        DROP INDEX idx_gpo_user,
        DROP COLUMN user_id,
        DROP COLUMN target_plan,
        DROP COLUMN target_validity_days
    `);
  }
}
