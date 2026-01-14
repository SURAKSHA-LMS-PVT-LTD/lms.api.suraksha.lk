import { DataSource } from 'typeorm';
import { CreateUserCardManagement1737000000000 } from './src/database/migrations/1737000000000-CreateUserCardManagement';
import * as dotenv from 'dotenv';

dotenv.config();

const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

async function runMigration() {
  try {
    console.log('Initializing database connection...');
    await dataSource.initialize();
    console.log('Database connected!');

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    const migration = new CreateUserCardManagement1737000000000();
    
    console.log('\n=== Running User Card Management Migration ===\n');
    await migration.up(queryRunner);
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\nCreated tables:');
    console.log('  - cards (with 3 sample cards)');
    console.log('  - user_id_card_orders');
    console.log('  - card_payments');
    console.log('\nCreated indexes and foreign keys');

    await queryRunner.release();
    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.sql) {
      console.error('\nFailed SQL:', error.sql);
    }
    await dataSource.destroy();
    process.exit(1);
  }
}

runMigration();
