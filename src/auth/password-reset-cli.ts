import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PasswordMigrationService } from './password-migration.service';

async function resetAllPasswords() {
  // 🔒 SECURITY: Block execution in production environment
  if (process.env.NODE_ENV === 'production') {
    console.error('\u274c CRITICAL: Password reset CLI is BLOCKED in production environment!');
    console.error('This tool should never be run against a production database.');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const passwordMigrationService = app.get(PasswordMigrationService);

  try {
    console.log('🔄 Starting password reset process...');
    
    // Reset all passwords to a default value
    const migratedCount = await passwordMigrationService.bulkMigrateWithDefaultPassword('password123');
    
    console.log(`✅ Successfully reset ${migratedCount} user passwords`);
    console.log('📝 Default password has been set for all users');
    console.log('⚠️  Please ask users to change their passwords after first login');
    
  } catch (error) {
    console.error('❌ Password reset failed:', error);
  } finally {
    await app.close();
  }
}

async function resetSingleUserPassword() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const passwordMigrationService = app.get(PasswordMigrationService);

  // Get command line arguments
  const args = process.argv.slice(2);
  const email = args[0];
  const newPassword = args[1] || 'password123';

  if (!email) {
    console.log('❌ Please provide email address');
    console.log('Usage: npm run reset-password:single user@example.com newPassword');
    await app.close();
    return;
  }

  try {
    console.log(`🔄 Resetting password for: ${email}`);
    
    // Test and migrate single user
    const success = await passwordMigrationService.testUserPassword(email, newPassword);
    
    if (success) {
      console.log(`✅ Password reset successful for ${email}`);
    } else {
      console.log(`❌ Password reset failed for ${email}`);
    }
    
  } catch (error) {
    console.error('❌ Password reset failed:', error);
  } finally {
    await app.close();
  }
}

// Check which command to run
const command = process.argv[2];

if (command === 'all') {
  resetAllPasswords();
} else if (command === 'single') {
  resetSingleUserPassword();
} else {
  console.log('Password Reset Utility');
  console.log('Commands:');
  console.log('  npm run reset-password all              - Reset all user passwords to default');
  console.log('  npm run reset-password single <email>   - Reset specific user password');
}
