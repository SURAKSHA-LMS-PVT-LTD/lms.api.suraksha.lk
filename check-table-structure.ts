import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

// Load environment variables
config();

const checkTableStructure = async () => {
  console.log('🔍 Checking subjects table structure...\n');

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
    logging: false,
  };

  const dataSource = new DataSource(dataSourceOptions);

  try {
    console.log('📡 Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Connected!\n');

    const queryRunner = dataSource.createQueryRunner();

    // Check subjects table structure
    console.log('📋 Subjects Table Structure:');
    const subjectsColumns = await queryRunner.query(`DESCRIBE subjects`);
    console.table(subjectsColumns);

    // Check if institute_id already exists
    const hasInstituteId = subjectsColumns.some((col: any) => col.Field === 'institute_id');
    const hasInstituteType = subjectsColumns.some((col: any) => col.Field === 'institute_type');

    console.log('\n📊 Analysis:');
    console.log(`   institute_id exists: ${hasInstituteId ? '✅ YES' : '❌ NO'}`);
    console.log(`   institute_type exists: ${hasInstituteType ? '✅ YES' : '❌ NO'}`);

    if (hasInstituteId && !hasInstituteType) {
      console.log('\n✨ Migration appears to be already completed!');
      console.log('   The subjects table already has institute_id and no institute_type.');
    } else if (hasInstituteType && !hasInstituteId) {
      console.log('\n⚠️  Migration needs to be run.');
      console.log('   The subjects table has institute_type but no institute_id.');
    } else if (hasInstituteId && hasInstituteType) {
      console.log('\n⚠️  Partial migration state detected.');
      console.log('   Both institute_id and institute_type exist.');
    }

    // Check institutes table structure
    console.log('\n📋 Institutes Table Structure:');
    const institutesColumns = await queryRunner.query(`DESCRIBE institutes`);
    console.table(institutesColumns);

    // Count subjects
    const subjectCount = await queryRunner.query(`SELECT COUNT(*) as count FROM subjects`);
    console.log(`\n📊 Total Subjects: ${subjectCount[0].count}`);

    // Count institutes
    const instituteCount = await queryRunner.query(`SELECT COUNT(*) as count FROM institutes WHERE is_active = TRUE`);
    console.log(`📊 Active Institutes: ${instituteCount[0].count}`);

    await queryRunner.release();
    await dataSource.destroy();

    console.log('\n✅ Check complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:\n');
    console.error(error);
    process.exit(1);
  }
};

checkTableStructure();
