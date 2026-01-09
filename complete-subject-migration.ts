import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

// Load environment variables
config();

const completeMigration = async () => {
  console.log('🔧 Completing Subject Migration (removing institute_type, finalizing institute_id)...\n');

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
    await dataSource.initialize();
    console.log('✅ Connected!\n');

    const queryRunner = dataSource.createQueryRunner();

    console.log('⏳ Step 1: Check if institute_id has values...');
    const nullCount = await queryRunner.query(`
      SELECT COUNT(*) as count FROM subjects WHERE institute_id IS NULL
    `);
    console.log(`   Found ${nullCount[0].count} subjects with NULL institute_id\n`);

    if (nullCount[0].count > 0) {
      console.log('⏳ Step 2: Filling NULL institute_id values...');
      
      // Assign to first active institute
      await queryRunner.query(`
        UPDATE subjects s
        SET s.institute_id = (
          SELECT id FROM institutes 
          WHERE is_active = TRUE 
          ORDER BY id 
          LIMIT 1
        )
        WHERE s.institute_id IS NULL
      `);
      console.log('   ✅ Filled NULL values\n');
    }

    console.log('⏳ Step 3: Adding indexes for institute_id (if not exists)...');
    
    // Try to create indexes (ignore if they already exist)
    try {
      await queryRunner.query(`
        CREATE INDEX idx_subjects_institute ON subjects (institute_id)
      `);
      console.log('   ✅ Added idx_subjects_institute');
    } catch (e: any) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('   ℹ️  idx_subjects_institute already exists');
      } else {
        throw e;
      }
    }

    try {
      await queryRunner.query(`
        CREATE INDEX idx_subjects_institute_active ON subjects (institute_id, is_active)
      `);
      console.log('   ✅ Added idx_subjects_institute_active');
    } catch (e: any) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('   ℹ️  idx_subjects_institute_active already exists');
      } else {
        throw e;
      }
    }

    try {
      await queryRunner.query(`
        CREATE INDEX idx_subjects_institute_type ON subjects (institute_id, subject_type)
      `);
      console.log('   ✅ Added idx_subjects_institute_type\n');
    } catch (e: any) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('   ℹ️  idx_subjects_institute_type already exists\n');
      } else {
        throw e;
      }
    }

    console.log('⏳ Step 4: Making institute_id NOT NULL...');
    await queryRunner.query(`
      ALTER TABLE subjects 
      MODIFY COLUMN institute_id BIGINT NOT NULL
    `);
    console.log('   ✅ institute_id is now NOT NULL\n');

    console.log('⏳ Step 5: Adding foreign key constraint (if not exists)...');
    try {
      await queryRunner.query(`
        ALTER TABLE subjects 
        ADD CONSTRAINT fk_subjects_institute 
        FOREIGN KEY (institute_id) 
        REFERENCES institutes(id) 
        ON DELETE CASCADE
      `);
      console.log('   ✅ Added foreign key constraint\n');
    } catch (e: any) {
      if (e.code === 'ER_FK_DUP_NAME' || e.errno === 1826) {
        console.log('   ℹ️  Foreign key already exists\n');
      } else {
        throw e;
      }
    }

    console.log('⏳ Step 6: Removing institute_type column...');
    await queryRunner.query(`
      ALTER TABLE subjects 
      DROP COLUMN institute_type
    `);
    console.log('   ✅ Removed institute_type column\n');

    console.log('✅ Migration completed successfully!');
    console.log('\n📊 Final subjects table structure:');
    const finalStructure = await queryRunner.query(`DESCRIBE subjects`);
    console.table(finalStructure);

    await queryRunner.release();
    await dataSource.destroy();

    console.log('\n✨ Database connection closed. Migration successful!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed with error:\n');
    console.error(error);
    process.exit(1);
  }
};

completeMigration();
