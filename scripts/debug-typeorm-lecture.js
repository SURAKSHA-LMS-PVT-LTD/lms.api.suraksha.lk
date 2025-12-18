const { DataSource } = require('typeorm');

async function debugLecture() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: '34.29.9.105',
    port: 3306,
    username: 'root',
    password: 'suraksha@123',
    database: 'suraksha-lms-db',
    ssl: { rejectUnauthorized: false },
    entities: [],
  });

  try {
    await dataSource.initialize();
    console.log('✅ Connected to database\n');

    // Direct query to see raw data
    const rawData = await dataSource.query(
      'SELECT id, title, start_time, end_time, created_at, updated_at FROM institute_lectures WHERE id = 4'
    );
    console.log('📋 Raw SQL Query Result:');
    console.log(JSON.stringify(rawData[0], null, 2));
    console.log('\n');

    // Check the data types
    console.log('🔍 Data Types:');
    const lecture = rawData[0];
    console.log('start_time type:', typeof lecture.start_time);
    console.log('start_time value:', lecture.start_time);
    console.log('start_time instanceof Date:', lecture.start_time instanceof Date);
    console.log('\n');

    // Try JSON.stringify to see if that's the issue
    console.log('📤 JSON.stringify result:');
    console.log(JSON.stringify(lecture));
    console.log('\n');

    // Test entity loading with TypeORM metadata
    const queryBuilder = dataSource
      .createQueryBuilder()
      .select('*')
      .from('institute_lectures', 'lecture')
      .where('lecture.id = :id', { id: 4 });
    
    const qbResult = await queryBuilder.getRawOne();
    console.log('📋 QueryBuilder getRawOne Result:');
    console.log(JSON.stringify(qbResult, null, 2));

    await dataSource.destroy();
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

debugLecture();
