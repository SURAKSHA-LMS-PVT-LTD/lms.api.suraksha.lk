import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateInstituteClassLectureGroups1782682199041 implements MigrationInterface {
    name = 'CreateInstituteClassLectureGroups1782682199041'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`institute_class_lecture_groups\` (\`id\` varchar(36) NOT NULL, \`institute_id\` varchar(36) NOT NULL, \`class_id\` varchar(36) NOT NULL, \`name\` varchar(255) NOT NULL, \`image\` varchar(255) NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_by\` bigint NULL, \`updated_by\` bigint NULL, \`created_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_iclg_institute\` (\`institute_id\`), INDEX \`IDX_iclg_class\` (\`class_id\`), INDEX \`IDX_iclg_inst_class\` (\`institute_id\`, \`class_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`institute_class_lectures\` ADD \`group_id\` varchar(36) NULL`);
        await queryRunner.query(`ALTER TABLE \`institute_class_lectures\` ADD CONSTRAINT \`FK_icl_group\` FOREIGN KEY (\`group_id\`) REFERENCES \`institute_class_lecture_groups\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`institute_class_lecture_groups\` ADD CONSTRAINT \`FK_iclg_institute\` FOREIGN KEY (\`institute_id\`) REFERENCES \`institutes\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`institute_class_lecture_groups\` ADD CONSTRAINT \`FK_iclg_class\` FOREIGN KEY (\`class_id\`) REFERENCES \`institute_classes\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`institute_class_lecture_groups\` ADD CONSTRAINT \`FK_iclg_created_by\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`institute_class_lecture_groups\` ADD CONSTRAINT \`FK_iclg_updated_by\` FOREIGN KEY (\`updated_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`institute_class_lecture_groups\` DROP FOREIGN KEY \`FK_iclg_updated_by\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_lecture_groups\` DROP FOREIGN KEY \`FK_iclg_created_by\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_lecture_groups\` DROP FOREIGN KEY \`FK_iclg_class\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_lecture_groups\` DROP FOREIGN KEY \`FK_iclg_institute\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_lectures\` DROP FOREIGN KEY \`FK_icl_group\``);
        await queryRunner.query(`ALTER TABLE \`institute_class_lectures\` DROP COLUMN \`group_id\``);
        await queryRunner.query(`DROP TABLE \`institute_class_lecture_groups\``);
    }
}
