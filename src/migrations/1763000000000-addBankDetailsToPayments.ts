import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddBankDetailsToPayments1763000000000 implements MigrationInterface {
  name = 'AddBankDetailsToPayments1763000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add bank details columns to institute_class_subject_payments
    await queryRunner.addColumn(
      'institute_class_subject_payments',
      new TableColumn({
        name: 'bank_name',
        type: 'varchar',
        length: '100',
        isNullable: false,
        default: "''",
      }),
    );

    await queryRunner.addColumn(
      'institute_class_subject_payments',
      new TableColumn({
        name: 'account_holder_name',
        type: 'varchar',
        length: '150',
        isNullable: false,
        default: "''",
      }),
    );

    await queryRunner.addColumn(
      'institute_class_subject_payments',
      new TableColumn({
        name: 'account_holder_number',
        type: 'varchar',
        length: '50',
        isNullable: false,
        default: "''",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the bank detail columns
    await queryRunner.dropColumn('institute_class_subject_payments', 'bank_name');
    await queryRunner.dropColumn('institute_class_subject_payments', 'account_holder_name');
    await queryRunner.dropColumn('institute_class_subject_payments', 'account_holder_number');
  }
}
