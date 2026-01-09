import { MigrationInterface, QueryRunner } from "typeorm";

export class AddInstituteIdToSubjects1736482800000 implements MigrationInterface {
    name = 'AddInstituteIdToSubjects1736482800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ✅ SAFE MIGRATION: Keep same subject IDs, add instituteId, remove instituteType
        
        // 1. Add instituteId column to subjects table (nullable initially)
        await queryRunner.query(`
            ALTER TABLE \`subjects\` 
            ADD COLUMN \`institute_id\` BIGINT NULL AFTER \`id\`
        `);

        // 2. Assign subjects to institutes based on instituteType
        // Get first institute of each type and assign subjects to it
        await queryRunner.query(`
            UPDATE \`subjects\` s
            LEFT JOIN (
                SELECT id, institute_type, 
                       ROW_NUMBER() OVER (PARTITION BY institute_type ORDER BY id) as rn
                FROM \`institutes\`
                WHERE is_active = TRUE
            ) i ON s.institute_type = i.institute_type AND i.rn = 1
            SET s.institute_id = i.id
            WHERE s.institute_type IS NOT NULL
        `);

        // 3. For subjects with NULL instituteType, assign to first active institute
        await queryRunner.query(`
            UPDATE \`subjects\` s
            SET s.institute_id = (
                SELECT id FROM \`institutes\` 
                WHERE is_active = TRUE 
                ORDER BY id 
                LIMIT 1
            )
            WHERE s.institute_id IS NULL
        `);

        // 4. Add indexes for instituteId
        await queryRunner.query(`
            CREATE INDEX \`idx_subjects_institute\` ON \`subjects\` (\`institute_id\`)
        `);

        await queryRunner.query(`
            CREATE INDEX \`idx_subjects_institute_active\` ON \`subjects\` (\`institute_id\`, \`is_active\`)
        `);

        await queryRunner.query(`
            CREATE INDEX \`idx_subjects_institute_type\` ON \`subjects\` (\`institute_id\`, \`subject_type\`)
        `);

        // 5. Make instituteId NOT NULL after data migration
        await queryRunner.query(`
            ALTER TABLE \`subjects\` 
            MODIFY COLUMN \`institute_id\` BIGINT NOT NULL
        `);

        // 6. Add foreign key constraint
        await queryRunner.query(`
            ALTER TABLE \`subjects\` 
            ADD CONSTRAINT \`fk_subjects_institute\` 
            FOREIGN KEY (\`institute_id\`) 
            REFERENCES \`institutes\`(\`id\`) 
            ON DELETE CASCADE
        `);

        // 7. Drop instituteType column (no longer needed)
        await queryRunner.query(`
            ALTER TABLE \`subjects\` 
            DROP COLUMN \`institute_type\`
        `);

        // ========================================
        // Update structured_lectures table
        // ========================================

        // 8. Add instituteId to structured_lectures
        await queryRunner.query(`
            ALTER TABLE \`structured_lectures\` 
            ADD COLUMN \`institute_id\` BIGINT NULL AFTER \`id\`
        `);

        // 9. Migrate data: Set instituteId based on subject's instituteId
        await queryRunner.query(`
            UPDATE \`structured_lectures\` sl
            INNER JOIN \`subjects\` s ON sl.subject_id = s.id
            SET sl.institute_id = s.institute_id
        `);

        // 10. Make instituteId NOT NULL
        await queryRunner.query(`
            ALTER TABLE \`structured_lectures\` 
            MODIFY COLUMN \`institute_id\` BIGINT NOT NULL
        `);

        // 11. Update index to include instituteId
        await queryRunner.query(`
            DROP INDEX \`idx_lecture_subject_grade\` ON \`structured_lectures\`
        `);

        await queryRunner.query(`
            CREATE INDEX \`idx_lecture_institute_subject_grade\` 
            ON \`structured_lectures\` (\`institute_id\`, \`subject_id\`, \`grade\`)
        `);

        // 12. Add foreign key for instituteId
        await queryRunner.query(`
            ALTER TABLE \`structured_lectures\` 
            ADD CONSTRAINT \`fk_structured_lectures_institute\` 
            FOREIGN KEY (\`institute_id\`) 
            REFERENCES \`institutes\`(\`id\`) 
            ON DELETE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert structured_lectures changes
        await queryRunner.query(`
            ALTER TABLE \`structured_lectures\` 
            DROP FOREIGN KEY \`fk_structured_lectures_institute\`
        `);

        await queryRunner.query(`
            DROP INDEX \`idx_lecture_institute_subject_grade\` ON \`structured_lectures\`
        `);

        await queryRunner.query(`
            CREATE INDEX \`idx_lecture_subject_grade\` 
            ON \`structured_lectures\` (\`subject_id\`, \`grade\`)
        `);

        await queryRunner.query(`
            ALTER TABLE \`structured_lectures\` 
            DROP COLUMN \`institute_id\`
        `);

        // Revert subjects changes
        await queryRunner.query(`
            ALTER TABLE \`subjects\` 
            ADD COLUMN \`institute_type\` ENUM('SCHOOL', 'UNIVERSITY', 'TUITION') NULL
        `);

        await queryRunner.query(`
            ALTER TABLE \`subjects\` 
            DROP FOREIGN KEY \`fk_subjects_institute\`
        `);

        await queryRunner.query(`
            DROP INDEX \`idx_subjects_institute_type\` ON \`subjects\`
        `);

        await queryRunner.query(`
            DROP INDEX \`idx_subjects_institute_active\` ON \`subjects\`
        `);

        await queryRunner.query(`
            DROP INDEX \`idx_subjects_institute\` ON \`subjects\`
        `);

        await queryRunner.query(`
            ALTER TABLE \`subjects\` 
            DROP COLUMN \`institute_id\`
        `);
    }
}
