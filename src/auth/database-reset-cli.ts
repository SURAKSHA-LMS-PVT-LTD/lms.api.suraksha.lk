import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatabaseResetService } from './database-reset.service';

async function runDatabaseReset() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const databaseResetService = app.get(DatabaseResetService);

  const command = process.argv[2];

  try {
    switch (command) {
      case 'reset':
        console.log('🔄 Resetting database with default users...');
        await databaseResetService.resetDatabaseWithDefaults();
        break;
        
      case 'migrate':
        console.log('🔄 Migrating existing passwords...');
        const count = await databaseResetService.migrateAllPasswords('password123');
        console.log(`✅ Migrated ${count} passwords`);
        break;
        
      case 'status':
        console.log('📊 Checking password status...');
        const status = await databaseResetService.getUsersPasswordStatus();
        console.table(status);
        break;
        
      case 'test':
        const email = process.argv[3];
        const password = process.argv[4];
        if (!email || !password) {
          console.log('❌ Usage: npm run db-reset test <email> <password>');
          break;
        }
        console.log(`🔐 Testing login for ${email}...`);
        const isValid = await databaseResetService.testUserLogin(email, password);
        console.log(isValid ? '✅ Login successful' : '❌ Login failed');
        break;
        
      case 'create':
        const userData = {
          firstName: process.argv[3] || 'Test',
          lastName: process.argv[4] || 'User',
          email: process.argv[5] || 'test@example.com',
          password: process.argv[6] || 'test123',
          userType: process.argv[7] as any || 'STUDENT',
        };
        console.log('👤 Creating new user...');
        const newUser = await databaseResetService.createSecureUser(userData);
        console.log(`✅ Created user: ${newUser.email}`);
        break;
        
      default:
        console.log('🛠️ Database Reset & Password Management Utility');
        console.log('');
        console.log('Available commands:');
        console.log('  reset   - Reset database and create default users');
        console.log('  migrate - Migrate existing passwords to secure format');
        console.log('  status  - Check password status for all users');
        console.log('  test    - Test login: npm run db-reset test <email> <password>');
        console.log('  create  - Create user: npm run db-reset create <firstName> <lastName> <email> <password> <userType>');
        console.log('');
        console.log('Examples:');
        console.log('  npm run db-reset reset');
        console.log('  npm run db-reset migrate');
        console.log('  npm run db-reset status');
        console.log('  npm run db-reset test admin@school.com admin123');
        console.log('  npm run db-reset create John Doe john@example.com john123 TEACHER');
        break;
    }
  } catch (error) {
    console.error('❌ Command failed:', error.message);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runDatabaseReset();
