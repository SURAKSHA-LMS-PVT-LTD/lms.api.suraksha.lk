import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAutoVerifyToRegistrationLink1782919910252 implements MigrationInterface {
    name = 'AddAutoVerifyToRegistrationLink1782919910252'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`institute_registration_links\` ADD \`auto_verify\` tinyint NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`institute_registration_links\` DROP COLUMN \`auto_verify\``);
    }
}
