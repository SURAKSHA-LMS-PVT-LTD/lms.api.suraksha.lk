import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { AddInstituteIdToSubjects1736482800000 } from './src/database/migrations/1736482800000-AddInstituteIdToSubjects';

// Load environment variables
config();

const runMigration = async () => {
  console.log('🚀 Starting Subject Migration (instituteType → instituteId)...\n');

  // Create DataSource with database credentials from environment variables
  const dataSourceOptions: DataSourceOptions = {
    type: 'mysql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306'),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [],
    migrations: [],
    synchronize: false,
    logging: true,
  };

  const dataSource = new DataSource(dataSourceOptions);

  try {
    console.log('📡 Connecting to database...');
    console.log(`   Host: ${dataSourceOptions.host}`);
    console.log(`   Database: ${dataSourceOptions.database}\n`);

    await dataSource.initialize();
    console.log('✅ Database connected successfully!\n');

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    console.log('🔄 Running migration: AddInstituteIdToSubjects1736482800000\n');

    const migration = new AddInstituteIdToSubjects1736482800000();
    
    console.log('⏳ Executing migration.up()...\n');
    await migration.up(queryRunner);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Changes applied:');
    console.log('   ✓ Added institute_id column to subjects table');
    console.log('   ✓ Migrated data from institute_type to institute_id');
    console.log('   ✓ Added indexes for institute_id');
    console.log('   ✓ Added foreign key constraint to institutes table');
    console.log('   ✓ Removed institute_type column');
    console.log('   ✓ Added institute_id to structured_lectures table');
    console.log('   ✓ Migrated structured_lectures data');
    console.log('   ✓ Updated indexes and foreign keys');

    await queryRunner.release();
    await dataSource.destroy();

    console.log('\n✨ Database connection closed. Migration successful!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed with error:\n');
    console.error(error);
    
    console.log('\n💡 Troubleshooting tips:');
    console.log('   1. Check database credentials in .env file');
    console.log('   2. Ensure database is accessible');
    console.log('   3. Verify institutes table has active records');
    console.log('   4. Check if migration was already run');
    
    process.exit(1);
  }
};

// Run the migration
runMigration();
