import AppDataSource from './src/data-source';
import { CreateInstituteCalendarTables1740355200000 } from './src/migrations/1740355200000-CreateInstituteCalendarTables';

async function runCalendarMigration() {
  try {
    console.log('Initializing data source...');
    await AppDataSource.initialize();
    
    console.log('Running calendar migration...');
    const migration = new CreateInstituteCalendarTables1740355200000();
    const queryRunner = AppDataSource.createQueryRunner();
    
    await migration.up(queryRunner);
    
    // Record migration in migrations table
    await queryRunner.query(
      `INSERT INTO migrations (timestamp, name) VALUES (?, ?)`,
      [1740355200000, 'CreateInstituteCalendarTables1740355200000']
    );
    
    console.log('✅ Calendar migration completed successfully!');
    
    await queryRunner.release();
    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await AppDataSource.destroy();
    process.exit(1);
  }
}

runCalendarMigration();
