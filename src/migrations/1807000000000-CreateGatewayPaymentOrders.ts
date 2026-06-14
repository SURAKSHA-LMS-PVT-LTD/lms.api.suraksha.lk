import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGatewayPaymentOrders1807000000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    if (await qr.hasTable('gateway_payment_orders')) return;

    await qr.query(`
      CREATE TABLE gateway_payment_orders (
        id                  VARCHAR(36)    NOT NULL,
        institute_id        VARCHAR(36)    NOT NULL,
        submitted_by        BIGINT         NOT NULL,
        provider            VARCHAR(50)    NOT NULL,
        service_type        VARCHAR(50)    NOT NULL,
        amount              DECIMAL(10,2)  NOT NULL,
        currency            VARCHAR(10)    NOT NULL DEFAULT 'LKR',
        requested_credits   INT            NOT NULL,
        status              ENUM('PENDING','SUCCESS','FAILED','CANCELLED','CHARGEDBACK')
                                           NOT NULL DEFAULT 'PENDING',
        gateway_payment_id  VARCHAR(100)   NULL,
        gateway_method      VARCHAR(50)    NULL,
        webhook_payload     JSON           NULL,
        tenant_payment_id   BIGINT         NULL,
        credits_granted     TINYINT(1)     NOT NULL DEFAULT 0,
        created_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_gpo_institute       (institute_id),
        INDEX idx_gpo_status          (status),
        INDEX idx_gpo_institute_status(institute_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS gateway_payment_orders');
  }
}
