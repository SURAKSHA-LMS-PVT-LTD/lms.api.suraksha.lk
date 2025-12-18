/**
 * SMS Status Enum Migration - TypeORM Version
 * Purpose: TypeORM migration class for SMS status enum update
 * Date: 2025-10-17
 */

import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateSmsStatusEnum1729180800000 implements MigrationInterface {
    name = 'UpdateSmsStatusEnum1729180800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        console.log('🚀 Starting SMS status enum migration...');

        // Step 1: Create backup table
        console.log('📦 Creating backup table...');
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS institute_sms_messages_backup_20251017 AS
            SELECT * FROM institute_sms_messages
        `);

        const backupCount = await queryRunner.query(`
            SELECT COUNT(*) as count FROM institute_sms_messages_backup_20251017
        `);
        console.log(`✅ Backed up ${backupCount[0].count} records`);

        // Step 2: Update QUEUED → APPROVED
        console.log('🔄 Updating QUEUED → APPROVED...');
        const queuedResult = await queryRunner.query(`
            UPDATE institute_sms_messages
            SET status = 'APPROVED'
            WHERE status = 'QUEUED'
        `);
        console.log(`✅ Updated ${queuedResult.affectedRows || 0} QUEUED records`);

        // Step 3: Update SENDING → APPROVED (incomplete)
        console.log('🔄 Updating SENDING → APPROVED (incomplete)...');
        const sendingIncomplete = await queryRunner.query(`
            UPDATE institute_sms_messages
            SET status = 'APPROVED'
            WHERE status = 'SENDING' 
              AND completed_at IS NULL
        `);
        console.log(`✅ Updated ${sendingIncomplete.affectedRows || 0} incomplete SENDING records`);

        // Step 4: Update SENDING → SENT (completed successfully)
        console.log('🔄 Updating SENDING → SENT (completed)...');
        const sendingSent = await queryRunner.query(`
            UPDATE institute_sms_messages
            SET status = 'SENT'
            WHERE status = 'SENDING' 
              AND completed_at IS NOT NULL
              AND failed_sends = 0
        `);
        console.log(`✅ Updated ${sendingSent.affectedRows || 0} completed SENDING records`);

        // Step 5: Update SENDING → PARTIALLY_SENT
        console.log('🔄 Updating SENDING → PARTIALLY_SENT...');
        const sendingPartial = await queryRunner.query(`
            UPDATE institute_sms_messages
            SET status = 'PARTIALLY_SENT'
            WHERE status = 'SENDING' 
              AND completed_at IS NOT NULL
              AND failed_sends > 0
              AND successful_sends > 0
        `);
        console.log(`✅ Updated ${sendingPartial.affectedRows || 0} partial SENDING records`);

        // Step 6: Update SENDING → FAILED
        console.log('🔄 Updating SENDING → FAILED...');
        const sendingFailed = await queryRunner.query(`
            UPDATE institute_sms_messages
            SET status = 'FAILED'
            WHERE status = 'SENDING' 
              AND completed_at IS NOT NULL
              AND successful_sends = 0
              AND failed_sends > 0
        `);
        console.log(`✅ Updated ${sendingFailed.affectedRows || 0} failed SENDING records`);

        // Step 7: Modify enum column
        console.log('🔧 Modifying enum column...');
        await queryRunner.query(`
            ALTER TABLE institute_sms_messages 
            MODIFY COLUMN status ENUM(
                'PENDING_VERIFICATION',
                'APPROVED',
                'REJECTED',
                'SENT',
                'PARTIALLY_SENT',
                'FAILED'
            ) NOT NULL DEFAULT 'PENDING_VERIFICATION'
        `);
        console.log('✅ Enum column updated');

        // Step 8: Add indexes
        console.log('📊 Adding indexes...');
        
        try {
            await queryRunner.query(`
                CREATE INDEX idx_sms_pending_verification 
                ON institute_sms_messages(status, created_at)
                WHERE status = 'PENDING_VERIFICATION'
            `);
        } catch (e) {
            console.log('⚠️ Index idx_sms_pending_verification may already exist');
        }

        try {
            await queryRunner.query(`
                CREATE INDEX idx_sms_approved_processing 
                ON institute_sms_messages(status, sent_at)
                WHERE status = 'APPROVED'
            `);
        } catch (e) {
            console.log('⚠️ Index idx_sms_approved_processing may already exist');
        }

        console.log('✅ Indexes created');

        // Step 9: Verify migration
        console.log('🔍 Verifying migration...');
        const statusDistribution = await queryRunner.query(`
            SELECT 
                status,
                COUNT(*) as count
            FROM institute_sms_messages
            GROUP BY status
        `);
        
        console.log('📊 Status distribution after migration:');
        statusDistribution.forEach(row => {
            console.log(`   ${row.status}: ${row.count}`);
        });

        console.log('✅ SMS status enum migration completed successfully!');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        console.log('⏪ Rolling back SMS status enum migration...');

        // Restore from backup
        console.log('📦 Restoring from backup...');
        await queryRunner.query(`
            TRUNCATE TABLE institute_sms_messages
        `);
        
        await queryRunner.query(`
            INSERT INTO institute_sms_messages 
            SELECT * FROM institute_sms_messages_backup_20251017
        `);

        // Restore original enum
        console.log('🔧 Restoring original enum...');
        await queryRunner.query(`
            ALTER TABLE institute_sms_messages 
            MODIFY COLUMN status ENUM(
                'PENDING_VERIFICATION',
                'APPROVED',
                'REJECTED',
                'QUEUED',
                'SENDING',
                'SENT',
                'PARTIALLY_SENT',
                'FAILED'
            ) NOT NULL DEFAULT 'PENDING_VERIFICATION'
        `);

        // Drop indexes
        console.log('🗑️ Dropping indexes...');
        try {
            await queryRunner.query(`
                DROP INDEX idx_sms_pending_verification ON institute_sms_messages
            `);
        } catch (e) {
            console.log('⚠️ Could not drop idx_sms_pending_verification');
        }

        try {
            await queryRunner.query(`
                DROP INDEX idx_sms_approved_processing ON institute_sms_messages
            `);
        } catch (e) {
            console.log('⚠️ Could not drop idx_sms_approved_processing');
        }

        const restoredCount = await queryRunner.query(`
            SELECT COUNT(*) as count FROM institute_sms_messages
        `);
        console.log(`✅ Restored ${restoredCount[0].count} records`);
        console.log('✅ Rollback completed successfully!');
    }
}
