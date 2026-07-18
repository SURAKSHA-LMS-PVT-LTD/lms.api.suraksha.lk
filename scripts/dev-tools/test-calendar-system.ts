/**
 * Test Calendar System - Generate & View
 * Run this to create a calendar and test attendance with calendar linkage
 */

import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';
const INSTITUTE_ID = '109'; // Cambridge International School
const AUTH_TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Get from login

async function testCalendarSystem() {
  console.log('🧪 Testing Calendar System Integration\n');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    // STEP 1: Set Operating Config (Mon-Fri, 8am-3pm)
    console.log('1️⃣  Setting operating config (Mon-Fri)...');
    const operatingConfig = await axios.post(
      `${API_BASE}/institutes/${INSTITUTE_ID}/calendar/operating-config`,
      {
        dayOfWeek: 1, // Monday
        isOperating: true,
        startTime: '08:00:00',
        endTime: '15:00:00',
        academicYear: '2026',
        createdBy: 'admin',
      },
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );
    console.log('   ✅ Operating config set\n');

    // Repeat for Tue-Fri (dayOfWeek 2-5)
    for (let day = 2; day <= 5; day++) {
      await axios.post(
        `${API_BASE}/institutes/${INSTITUTE_ID}/calendar/operating-config`,
        {
          dayOfWeek: day,
          isOperating: true,
          startTime: '08:00:00',
          endTime: '15:00:00',
          academicYear: '2026',
          createdBy: 'admin',
        },
        { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
      );
    }

    // STEP 2: Generate 2026 Calendar
    console.log('2️⃣  Generating 2026 calendar...');
    const calendar = await axios.post(
      `${API_BASE}/institutes/${INSTITUTE_ID}/calendar/generate`,
      {
        academicYear: '2026',
        startDate: '2026-02-01',
        endDate: '2026-12-31',
        publicHolidays: [
          { date: '2026-04-14', title: 'Sinhala & Tamil New Year' },
          { date: '2026-05-01', title: 'May Day' },
        ],
        termBreaks: [
          { startDate: '2026-04-01', endDate: '2026-04-30', title: 'First Term Break' },
        ],
        createdBy: 'admin',
      },
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );
    console.log('   ✅ Calendar generated:', calendar.data.data);
    console.log('');

    // STEP 3: Get Today's Calendar Day
    console.log('3️⃣  Getting today\'s calendar day...');
    const today = await axios.get(
      `${API_BASE}/institutes/${INSTITUTE_ID}/calendar/today`,
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );
    console.log('   ✅ Today:', today.data.data);
    console.log('   📆 Day Type:', today.data.data?.dayType);
    console.log('   📅 Calendar Day ID:', today.data.data?.id);
    console.log('   🎯 Is Attendance Expected:', today.data.data?.isAttendanceExpected);
    console.log('');

    // STEP 4: Mark Attendance (will auto-link to calendar)
    console.log('4️⃣  Marking test attendance...');
    const attendance = await axios.post(
      `${API_BASE}/attendance/mark`,
      {
        studentId: '2',
        instituteId: INSTITUTE_ID,
        instituteName: 'Cambridge International School',
        date: new Date().toISOString().split('T')[0],
        status: 'PRESENT',
        location: 'Test Location',
      },
      { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } }
    );
    console.log('   ✅ Attendance marked:', attendance.data);
    console.log('');

    // STEP 5: View DynamoDB to verify calendar linkage
    console.log('5️⃣  Now run: npx ts-node view-dynamodb-attendance.ts');
    console.log('   🔍 Look for NEW record with:');
    console.log('      ✅ calendarDayId: <uuid>');
    console.log('      ✅ eventId: <uuid>');
    console.log('      ✅ userType: STUDENT');
    console.log('');

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.error('\n💡 Authentication failed. Please:');
      console.error('   1. Login to get JWT token');
      console.error('   2. Update AUTH_TOKEN in this script');
    }
  }
}

testCalendarSystem()
  .then(() => console.log('\n✅ Calendar system test complete!'))
  .catch((error) => console.error('❌ Test failed:', error));
