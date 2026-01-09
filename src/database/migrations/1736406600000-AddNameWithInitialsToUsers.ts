/**
 * Add Name With Initials Column Migration
 * Purpose: Add name_with_initials column to users table (required field)
 * Date: 2026-01-09
 */

import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddNameWithInitialsToUsers1736406600000 implements MigrationInterface {
    name = 'AddNameWithInitialsToUsers1736406600000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        console.log('🚀 Starting migration to add name_with_initials column...');

        // Add the name_with_initials column to users table
        await queryRunner.addColumn('users', new TableColumn({
            name: 'name_with_initials',
            type: 'varchar',
            length: '100',
            isNullable: false,
            default: "''"
        }));

        console.log('✅ Successfully added name_with_initials column to users table');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        console.log('🔄 Rolling back name_with_initials column...');

        // Remove the name_with_initials column
        await queryRunner.dropColumn('users', 'name_with_initials');

        console.log('✅ Successfully removed name_with_initials column from users table');
    }
}
