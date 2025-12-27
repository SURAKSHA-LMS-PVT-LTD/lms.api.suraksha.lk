import axios, { AxiosError } from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Test script for Super Admin Login and Attendance APIs
 * 
 * Super Admin Credentials:
 * - Email: kavishasanjana22@gmail.com
 * - Password: Password123@
 */

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';
const SUPER_ADMIN_EMAIL = 'kavishasanjana22@gmail.com';
const SUPER_ADMIN_PASSWORD = 'Password123@';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    userType: string;
    firstName: string;
    lastName: string;
  };
}

let authToken = '';
let userId = '';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testLogin() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
  log('🔐 TEST 1: Super Admin Login', colors.cyan);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.cyan);

  try {
    const response = await axios.post<LoginResponse>(`${API_BASE_URL}/api/v1/auth/login`, {
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
    });

    authToken = response.data.accessToken;
    userId = response.data.user.id;

    log('✅ Login Successful!', colors.green);
    log(`\n👤 User Details:`, colors.blue);
    log(`   ID: ${response.data.user.id}`, colors.reset);
    log(`   Name: ${response.data.user.firstName} ${response.data.user.lastName}`, colors.reset);
    log(`   Email: ${response.data.user.email}`, colors.reset);
    log(`   Type: ${response.data.user.userType}`, colors.reset);
    log(`\n🔑 Access Token: ${authToken.substring(0, 50)}...`, colors.yellow);
    
    return true;
  } catch (error) {
    const axiosError = error as AxiosError<any>;
    log('❌ Login Failed!', colors.red);
    if (axiosError.response) {
      log(`   Status: ${axiosError.response.status}`, colors.red);
      log(`   Message: ${JSON.stringify(axiosError.response.data, null, 2)}`, colors.red);
    } else {
      log(`   Error: ${axiosError.message}`, colors.red);
    }
    return false;
  }
}

async function testGetMyProfile() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
  log('👤 TEST 2: Get My Profile (/auth/me)', colors.cyan);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.cyan);

  try {
    const response = await axios.get(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    log('✅ Profile Retrieved Successfully!', colors.green);
    log(`\n📋 Profile Data:`, colors.blue);
    log(JSON.stringify(response.data, null, 2), colors.reset);
    return true;
  } catch (error) {
    const axiosError = error as AxiosError<any>;
    log('❌ Failed to get profile!', colors.red);
    if (axiosError.response) {
      log(`   Status: ${axiosError.response.status}`, colors.red);
      log(`   Message: ${JSON.stringify(axiosError.response.data, null, 2)}`, colors.red);
    } else {
      log(`   Error: ${axiosError.message}`, colors.red);
    }
    return false;
  }
}

async function testMarkAttendance() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
  log('📝 TEST 3: Mark Attendance (Single)', colors.cyan);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.cyan);

  try {
    // Replace with actual institute, class, and student IDs from your database
    const attendanceData = {
      instituteId: '1',
      classId: '1',
      studentId: '1',
      date: new Date().toISOString().split('T')[0],
      status: 'present',
      markedBy: userId,
    };

    log(`📤 Sending attendance data:`, colors.blue);
    log(JSON.stringify(attendanceData, null, 2), colors.reset);

    const response = await axios.post(`${API_BASE_URL}/api/v1/attendance/mark`, attendanceData, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    log('\n✅ Attendance Marked Successfully!', colors.green);
    log(`\n📋 Response:`, colors.blue);
    log(JSON.stringify(response.data, null, 2), colors.reset);
    return true;
  } catch (error) {
    const axiosError = error as AxiosError<any>;
    log('❌ Failed to mark attendance!', colors.red);
    if (axiosError.response) {
      log(`   Status: ${axiosError.response.status}`, colors.red);
      log(`   Message: ${JSON.stringify(axiosError.response.data, null, 2)}`, colors.red);
    } else {
      log(`   Error: ${axiosError.message}`, colors.red);
    }
    return false;
  }
}

async function testBulkMarkAttendance() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
  log('📝 TEST 4: Bulk Mark Attendance', colors.cyan);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.cyan);

  try {
    const bulkAttendanceData = {
      instituteId: '1',
      classId: '1',
      date: new Date().toISOString().split('T')[0],
      attendances: [
        { studentId: '1', status: 'present' },
        { studentId: '2', status: 'present' },
        { studentId: '3', status: 'absent' },
      ],
      markedBy: userId,
    };

    log(`📤 Sending bulk attendance data:`, colors.blue);
    log(JSON.stringify(bulkAttendanceData, null, 2), colors.reset);

    const response = await axios.post(`${API_BASE_URL}/api/v1/attendance/bulk-mark`, bulkAttendanceData, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    log('\n✅ Bulk Attendance Marked Successfully!', colors.green);
    log(`\n📋 Response:`, colors.blue);
    log(JSON.stringify(response.data, null, 2), colors.reset);
    return true;
  } catch (error) {
    const axiosError = error as AxiosError<any>;
    log('❌ Failed to bulk mark attendance!', colors.red);
    if (axiosError.response) {
      log(`   Status: ${axiosError.response.status}`, colors.red);
      log(`   Message: ${JSON.stringify(axiosError.response.data, null, 2)}`, colors.red);
    } else {
      log(`   Error: ${axiosError.message}`, colors.red);
    }
    return false;
  }
}

async function testGetAttendance() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
  log('📊 TEST 5: Get Attendance Records', colors.cyan);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.cyan);

  try {
    const queryParams = {
      instituteId: '1',
      classId: '1',
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    };

    log(`📤 Query Parameters:`, colors.blue);
    log(JSON.stringify(queryParams, null, 2), colors.reset);

    const response = await axios.get(`${API_BASE_URL}/api/v1/attendance`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      params: queryParams,
    });

    log('\n✅ Attendance Records Retrieved Successfully!', colors.green);
    log(`\n📋 Response (first 3 records):`, colors.blue);
    const records = response.data.data || response.data;
    const displayRecords = Array.isArray(records) ? records.slice(0, 3) : records;
    log(JSON.stringify(displayRecords, null, 2), colors.reset);
    log(`\n📈 Total Records: ${Array.isArray(records) ? records.length : 'N/A'}`, colors.yellow);
    return true;
  } catch (error) {
    const axiosError = error as AxiosError<any>;
    log('❌ Failed to get attendance records!', colors.red);
    if (axiosError.response) {
      log(`   Status: ${axiosError.response.status}`, colors.red);
      log(`   Message: ${JSON.stringify(axiosError.response.data, null, 2)}`, colors.red);
    } else {
      log(`   Error: ${axiosError.message}`, colors.red);
    }
    return false;
  }
}

async function testBookhireAttendance() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
  log('🚌 TEST 6: Bookhire Attendance (Mark Pickup)', colors.cyan);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.cyan);

  try {
    const bookhireAttendanceData = {
      bookhireId: '1',
      studentId: '1',
      date: new Date().toISOString().split('T')[0],
      status: 'pickup',
      markedBy: userId,
    };

    log(`📤 Sending bookhire attendance data:`, colors.blue);
    log(JSON.stringify(bookhireAttendanceData, null, 2), colors.reset);

    const response = await axios.post(`${API_BASE_URL}/api/v1/private-transportation/attendance/mark`, bookhireAttendanceData, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    log('\n✅ Bookhire Attendance Marked Successfully!', colors.green);
    log(`\n📋 Response:`, colors.blue);
    log(JSON.stringify(response.data, null, 2), colors.reset);
    return true;
  } catch (error) {
    const axiosError = error as AxiosError<any>;
    log('❌ Failed to mark bookhire attendance!', colors.red);
    if (axiosError.response) {
      log(`   Status: ${axiosError.response.status}`, colors.red);
      log(`   Message: ${JSON.stringify(axiosError.response.data, null, 2)}`, colors.red);
    } else {
      log(`   Error: ${axiosError.message}`, colors.red);
    }
    return false;
  }
}

async function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', colors.magenta);
  log('║  🚀 SUPER ADMIN AUTHENTICATION & ATTENDANCE API TESTS     ║', colors.magenta);
  log('╚════════════════════════════════════════════════════════════╝\n', colors.magenta);

  log(`🌐 API Base URL: ${API_BASE_URL}`, colors.yellow);
  log(`📧 Super Admin Email: ${SUPER_ADMIN_EMAIL}`, colors.yellow);
  log(`🔑 Password: ${'*'.repeat(SUPER_ADMIN_PASSWORD.length)}`, colors.yellow);

  const results = {
    login: false,
    profile: false,
    markAttendance: false,
    bulkMarkAttendance: false,
    getAttendance: false,
    bookhireAttendance: false,
  };

  // Test 1: Login
  results.login = await testLogin();
  if (!results.login) {
    log('\n⚠️  Cannot proceed without successful login. Please check:', colors.yellow);
    log('   1. Is the server running? (npm run start:dev)', colors.yellow);
    log('   2. Is the database accessible?', colors.yellow);
    log('   3. Does the super admin user exist?', colors.yellow);
    log('   4. Are the credentials correct?', colors.yellow);
    return;
  }

  // Test 2: Get Profile
  results.profile = await testGetMyProfile();

  // Test 3: Mark Attendance
  results.markAttendance = await testMarkAttendance();

  // Test 4: Bulk Mark Attendance
  results.bulkMarkAttendance = await testBulkMarkAttendance();

  // Test 5: Get Attendance
  results.getAttendance = await testGetAttendance();

  // Test 6: Bookhire Attendance
  results.bookhireAttendance = await testBookhireAttendance();

  // Summary
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.cyan);
  log('📊 TEST SUMMARY', colors.cyan);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', colors.cyan);

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;

  Object.entries(results).forEach(([test, passed]) => {
    const icon = passed ? '✅' : '❌';
    const color = passed ? colors.green : colors.red;
    log(`${icon} ${test.padEnd(30)} ${passed ? 'PASSED' : 'FAILED'}`, color);
  });

  log(`\n📈 Overall: ${passed}/${total} tests passed`, passed === total ? colors.green : colors.yellow);

  if (passed === total) {
    log('\n🎉 All tests passed successfully!', colors.green);
  } else {
    log('\n⚠️  Some tests failed. Check the logs above for details.', colors.yellow);
  }
}

// Run all tests
runAllTests().catch(error => {
  log('\n💥 Unexpected error:', colors.red);
  console.error(error);
  process.exit(1);
});
