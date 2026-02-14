import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Migration: Add image verification columns to users table
 * 
 * Adds columns to track profile image verification status:
 * - image_verification_status: PENDING/VERIFIED/REJECTED
 * - image_verified_by: Admin user ID who verified/rejected
 * - image_verified_at: Timestamp of verification/rejection
 * - image_rejection_reason: Reason provided when image was rejected
 * 
 * Run: npx typeorm migration:run -d src/data-source.ts
 */
export class AddImageVerificationToUsers1739400000000 implements MigrationInterface {
  name = 'AddImageVerificationToUsers1739400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');

    // Add image_verification_status column
    const statusExists = table?.columns.find(col => col.name === 'image_verification_status');
    if (!statusExists) {
      await queryRunner.addColumn('users', new TableColumn({
        name: 'image_verification_status',
        type: 'enum',
        enum: ['PENDING', 'VERIFIED', 'REJECTED'],
        isNullable: true,
        comment: 'Profile image verification status: PENDING/VERIFIED/REJECTED'
      }));
      console.log('✅ Added image_verification_status column to users table');
    } else {
      console.log('⚠️ image_verification_status column already exists, skipping');
    }

    // Add image_verified_by column
    const verifiedByExists = table?.columns.find(col => col.name === 'image_verified_by');
    if (!verifiedByExists) {
      await queryRunner.addColumn('users', new TableColumn({
        name: 'image_verified_by',
        type: 'bigint',
        isNullable: true,
        comment: 'Admin user ID who verified/rejected the image'
      }));
      console.log('✅ Added image_verified_by column to users table');
    } else {
      console.log('⚠️ image_verified_by column already exists, skipping');
    }

    // Add image_verified_at column
    const verifiedAtExists = table?.columns.find(col => col.name === 'image_verified_at');
    if (!verifiedAtExists) {
      await queryRunner.addColumn('users', new TableColumn({
        name: 'image_verified_at',
        type: 'timestamp',
        isNullable: true,
        comment: 'Timestamp when image was verified/rejected'
      }));
      console.log('✅ Added image_verified_at column to users table');
    } else {
      console.log('⚠️ image_verified_at column already exists, skipping');
    }

    // Add image_rejection_reason column
    const rejectionReasonExists = table?.columns.find(col => col.name === 'image_rejection_reason');
    if (!rejectionReasonExists) {
      await queryRunner.addColumn('users', new TableColumn({
        name: 'image_rejection_reason',
        type: 'text',
        isNullable: true,
        comment: 'Reason provided when image was rejected'
      }));
      console.log('✅ Added image_rejection_reason column to users table');
    } else {
      console.log('⚠️ image_rejection_reason column already exists, skipping');
    }

    // Set existing users with images to PENDING status
    await queryRunner.query(`
      UPDATE \`users\`
      SET \`image_verification_status\` = 'PENDING'
      WHERE \`image_url\` IS NOT NULL 
        AND \`image_verification_status\` IS NULL
    `);
    console.log('✅ Set existing user images to PENDING status');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');

    // Drop columns in reverse order
    if (table?.columns.find(col => col.name === 'image_rejection_reason')) {
      await queryRunner.dropColumn('users', 'image_rejection_reason');
      console.log('✅ Removed image_rejection_reason column');
    }

    if (table?.columns.find(col => col.name === 'image_verified_at')) {
      await queryRunner.dropColumn('users', 'image_verified_at');
      console.log('✅ Removed image_verified_at column');
    }

    if (table?.columns.find(col => col.name === 'image_verified_by')) {
      await queryRunner.dropColumn('users', 'image_verified_by');
      console.log('✅ Removed image_verified_by column');
    }

    if (table?.columns.find(col => col.name === 'image_verification_status')) {
      await queryRunner.dropColumn('users', 'image_verification_status');
      console.log('✅ Removed image_verification_status column');
    }
  }
}
