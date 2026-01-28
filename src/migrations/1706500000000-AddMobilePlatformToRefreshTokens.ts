import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/**
 * 📱 Add mobile platform support to refresh_tokens table
 * 
 * This migration adds columns to support platform-aware authentication:
 * - platform: Differentiates between web, android, and ios tokens
 * - deviceId: Unique identifier for mobile device sessions
 * - deviceName: User-friendly device name for session management UI
 */
export class AddMobilePlatformToRefreshTokens1706500000000 implements MigrationInterface {
    name = 'AddMobilePlatformToRefreshTokens1706500000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add platform column with enum type
        await queryRunner.addColumn('refresh_tokens', new TableColumn({
            name: 'platform',
            type: 'enum',
            enum: ['web', 'android', 'ios'],
            default: "'web'",
            isNullable: false
        }));

        // Add deviceId column for mobile session tracking
        await queryRunner.addColumn('refresh_tokens', new TableColumn({
            name: 'deviceId',
            type: 'varchar',
            length: '255',
            isNullable: true
        }));

        // Add deviceName column for user-friendly display
        await queryRunner.addColumn('refresh_tokens', new TableColumn({
            name: 'deviceName',
            type: 'varchar',
            length: '100',
            isNullable: true
        }));

        // Add index for device lookups
        await queryRunner.createIndex('refresh_tokens', new TableIndex({
            name: 'idx_refresh_token_device',
            columnNames: ['deviceId', 'userId']
        }));

        // Add index for platform-based queries
        await queryRunner.createIndex('refresh_tokens', new TableIndex({
            name: 'idx_refresh_token_platform',
            columnNames: ['platform', 'userId']
        }));

        console.log('✅ Migration: Added mobile platform support to refresh_tokens table');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove indexes first
        await queryRunner.dropIndex('refresh_tokens', 'idx_refresh_token_device');
        await queryRunner.dropIndex('refresh_tokens', 'idx_refresh_token_platform');

        // Remove columns
        await queryRunner.dropColumn('refresh_tokens', 'deviceName');
        await queryRunner.dropColumn('refresh_tokens', 'deviceId');
        await queryRunner.dropColumn('refresh_tokens', 'platform');

        console.log('✅ Migration rolled back: Removed mobile platform support from refresh_tokens');
    }
}
