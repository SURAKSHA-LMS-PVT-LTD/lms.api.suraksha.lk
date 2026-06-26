import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReminderSentAtToWhatsAppContactSessions1843000000000 implements MigrationInterface {
  name = 'AddReminderSentAtToWhatsAppContactSessions1843000000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE whatsapp_contact_sessions 
      ADD COLUMN reminder_sent_at DATETIME NULL 
      COMMENT 'When the 1-hour expiration reminder was sent';
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE whatsapp_contact_sessions 
      DROP COLUMN reminder_sent_at;
    `);
  }
}
