import { MigrationInterface, QueryRunner } from "typeorm";

export class IncreaseAddressLineLength1736481600000 implements MigrationInterface {
    name = 'IncreaseAddressLineLength1736481600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Increase address_line1 from VARCHAR(50) to VARCHAR(200)
        await queryRunner.query(`
            ALTER TABLE \`users\` 
            MODIFY COLUMN \`address_line1\` VARCHAR(200) NULL
        `);

        // Increase address_line2 from VARCHAR(50) to VARCHAR(200)
        await queryRunner.query(`
            ALTER TABLE \`users\` 
            MODIFY COLUMN \`address_line2\` VARCHAR(200) NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert address_line2 back to VARCHAR(50)
        await queryRunner.query(`
            ALTER TABLE \`users\` 
            MODIFY COLUMN \`address_line2\` VARCHAR(50) NULL
        `);

        // Revert address_line1 back to VARCHAR(50)
        await queryRunner.query(`
            ALTER TABLE \`users\` 
            MODIFY COLUMN \`address_line1\` VARCHAR(50) NULL
        `);
    }
}
