import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from "typeorm";

export class CreateFeatureTables1678886400000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Feature Catalog Table
        await queryRunner.createTable(new Table({
            name: "feature_catalog",
            columns: [
                {
                    name: "key",
                    type: "varchar",
                    isPrimary: true,
                },
                {
                    name: "label",
                    type: "varchar",
                },
                {
                    name: "description",
                    type: "text",
                    isNullable: true,
                },
                {
                    name: "scope",
                    type: "enum",
                    enum: ['INSTITUTE', 'CLASS', 'SUBJECT'],
                },
                {
                    name: "category",
                    type: "enum",
                    enum: ['ATTENDANCE', 'ACADEMICS', 'PAYMENTS', 'COMMUNICATION', 'BRANDING', 'TRANSPORT', 'SERVICES'],
                },
                {
                    name: "pricing",
                    type: "enum",
                    enum: ['FREE', 'PAID'],
                },
                {
                    name: "billing_cycle",
                    type: "enum",
                    enum: ['MONTHLY', 'YEARLY', 'BOTH', 'TIER'],
                },
                {
                    name: "is_core",
                    type: "boolean",
                    default: false,
                },
                {
                    name: "dependencies",
                    type: "json",
                    isNullable: true,
                },
                {
                    name: "ui_targets",
                    type: "json",
                    isNullable: true,
                },
                {
                    name: "is_active",
                    type: "boolean",
                    default: true,
                },
            ],
        }), true);

        // Institute Feature Toggles Table
        await queryRunner.createTable(new Table({
            name: "institute_feature_toggles",
            columns: [
                {
                    name: "id",
                    type: "int",
                    isPrimary: true,
                    isGenerated: true,
                    generationStrategy: "increment",
                },
                {
                    name: "institute_id",
                    type: "int",
                },
                {
                    name: "feature_key",
                    type: "varchar",
                },
                {
                    name: "enabled",
                    type: "boolean",
                },
                {
                    name: "enabled_source",
                    type: "enum",
                    enum: ['ADMIN', 'PLAN', 'SYSTEM'],
                    isNullable: true,
                },
                {
                    name: "enabled_by_user_id",
                    type: "int",
                    isNullable: true,
                },
                {
                    name: "enabled_at",
                    type: "timestamp",
                    default: "now()",
                },
                {
                    name: "expires_at",
                    type: "timestamp",
                    isNullable: true,
                },
                {
                    name: "notes",
                    type: "text",
                    isNullable: true,
                },
                {
                    name: "created_at",
                    type: "timestamp",
                    default: "now()",
                },
                {
                    name: "updated_at",
                    type: "timestamp",
                    default: "now()",
                },
            ],
        }), true);

        await queryRunner.createForeignKey("institute_feature_toggles", new TableForeignKey({
            columnNames: ["feature_key"],
            referencedColumnNames: ["key"],
            referencedTableName: "feature_catalog",
            onDelete: "CASCADE",
        }));

        await queryRunner.createIndex("institute_feature_toggles", new TableIndex({ name: "IDX_institute_feature_toggles_institute_id", columnNames: ["institute_id"] }));
        await queryRunner.createIndex("institute_feature_toggles", new TableIndex({ name: "IDX_institute_feature_toggles_feature_key", columnNames: ["feature_key"] }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable("institute_feature_toggles");
        await queryRunner.dropTable("feature_catalog");
    }

}
