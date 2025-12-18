const { DataSource } = require('typeorm');
const { InstituteLectureEntity } = require('../dist/modules/institute_mudules/institue_lectures/entities/institue_lecture.entity');

async function testLectureLoading() {
  const dataSource = new DataSource({
    type: 'mysql',
    host: '34.29.9.105',
    port: 3306,
    username: 'root',
    password: 'suraksha@123',
    database: 'suraksha-lms-db',
    ssl: { rejectUnauthorized: false },
    entities: [InstituteLectureEntity],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log('✅ Connected to database\n');

    const lectureRepo = dataSource.getRepository(InstituteLectureEntity);
    
    // Test 1: Load lecture with ID 4
    console.log('📋 Test 1: Load lecture ID 4 with TypeORM');
    const lecture = await lectureRepo.findOne({ where: { id: '4' } });
    
    if (lecture) {
      console.log('Raw entity object:');
      console.log({
        id: lecture.id,
        title: lecture.title,
        startTime: lecture.startTime,
        endTime: lecture.endTime,
        createdAt: lecture.createdAt,
        updatedAt: lecture.updatedAt,
        startTimeType: typeof lecture.startTime,
        startTimeIsDate: lecture.startTime instanceof Date,
      });
      
      console.log('\n📤 JSON.stringify result:');
      console.log(JSON.stringify(lecture, null, 2));
      
      console.log('\n🔍 Entity keys:');
      console.log(Object.keys(lecture));
      
      console.log('\n🔍 Checking getters:');
      try {
        console.log('duration:', lecture.duration);
        console.log('isOngoing:', lecture.isOngoing);
        console.log('isUpcoming:', lecture.isUpcoming);
      } catch (e) {
        console.log('Error calling getters:', e.message);
      }
    } else {
      console.log('❌ Lecture not found');
    }

    await dataSource.destroy();
  } catch (error) {
    console.error('❌ Error:', error);
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

testLectureLoading();
