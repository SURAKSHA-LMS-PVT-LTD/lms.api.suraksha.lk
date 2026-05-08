import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNewUserTypesToPaymentSubmissions1784000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add USER, USER_WITHOUT_PARENT, USER_WITHOUT_STUDENT to institute_class_payment_submissions
    await queryRunner.query(`
      ALTER TABLE \`institute_class_payment_submissions\`
      MODIFY COLUMN \`user_type\` ENUM(
        'SUPER_ADMIN','ORGANIZATION_MANAGER',
        'USER','USER_WITHOUT_PARENT','USER_WITHOUT_STUDENT'
      ) NOT NULL
    `);

    // Same for institute_class_subject_payment_submissions if it exists
    const [subjectTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institute_class_subject_payment_submissions'`,
    );
    if (subjectTable) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_subject_payment_submissions\`
        MODIFY COLUMN \`user_type\` ENUM(
          'SUPER_ADMIN','ORGANIZATION_MANAGER',
          'USER','USER_WITHOUT_PARENT','USER_WITHOUT_STUDENT'
        ) NOT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`institute_class_payment_submissions\`
      MODIFY COLUMN \`user_type\` ENUM('SUPER_ADMIN','ORGANIZATION_MANAGER') NOT NULL
    `);
    const [subjectTable] = await queryRunner.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'institute_class_subject_payment_submissions'`,
    );
    if (subjectTable) {
      await queryRunner.query(`
        ALTER TABLE \`institute_class_subject_payment_submissions\`
        MODIFY COLUMN \`user_type\` ENUM('SUPER_ADMIN','ORGANIZATION_MANAGER') NOT NULL
      `);
    }
  }
}
