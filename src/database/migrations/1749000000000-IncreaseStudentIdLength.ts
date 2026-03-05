import { MigrationInterface, QueryRunner } from "typeorm";

export class IncreaseStudentIdLength1749000000000 implements MigrationInterface {
    name = 'IncreaseStudentIdLength1749000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Increase student_id from VARCHAR(15) to VARCHAR(20)
        // Fix: auto-generated IDs like STU-2025-0004231 are 16 chars, exceeding VARCHAR(15)
        await queryRunner.query(`
            ALTER TABLE \`students\` 
            MODIFY COLUMN \`student_id\` VARCHAR(20) NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert student_id back to VARCHAR(15)
        await queryRunner.query(`
            ALTER TABLE \`students\` 
            MODIFY COLUMN \`student_id\` VARCHAR(15) NULL
        `);
    }
}
