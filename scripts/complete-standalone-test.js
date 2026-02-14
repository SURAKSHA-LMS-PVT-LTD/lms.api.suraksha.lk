/**
 * Complete Standalone Test: All Users, Tokens, and Notification Delivery
 * No external dependencies except mysql2, dotenv, and http
 */

const mysql = require('mysql2/promise');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============================================================================
// ENVIRONMENT CONFIGURATION
// ============================================================================

function loadEnv() {
  // Try to use dotenv package first
  try {
    require('dotenv').config();
    
    return {
      dbHost: process.env.DB_HOST,
      dbUser: process.env.DB_USER,
      dbPassword: process.env.DB_PASSWORD,
      dbName: process.env.DB_NAME,
      dbPort: process.env.DB_PORT || '3306'
    };
  } catch (error) {
    // Fallback to manual parsing
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) {
      console.error('❌ .env file not found!');
      process.exit(1);
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    const config = {};
    lines.forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const equalIndex = line.indexOf('=');
        const key = line.substring(0, equalIndex).trim();
        const value = line.substring(equalIndex + 1).trim().replace(/^["'](.*)["']$/, '$1');
        config[key] = value;
      }
    });

    return {
      dbHost: config.DB_HOST,
      dbUser: config.DB_USER,
      dbPassword: config.DB_PASSWORD,
      dbName: config.DB_NAME,
      dbPort: config.DB_PORT || '3306'
    };
  }
}

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

async function connectDatabase(config) {
  return await mysql.createConnection({
    host: config.dbHost,
    user: config.dbUser,
    password: config.dbPassword,
    database: config.dbName,
    port: config.dbPort
  });
}

async function getAllUsers(connection) {
  const [users] = await connection.execute(`
    SELECT 
      id,
      email,
      name_with_initials,
      user_type,
      is_active,
      is_email_verified,
      created_at
    FROM users
    ORDER BY is_active DESC, user_type, created_at DESC
  `);
  return users;
}

async function getAllTokens(connection) {
  const [tokens] = await connection.execute(`
    SELECT 
      t.id as token_id,
      t.user_id,
      t.fcm_token,
      t.device_type,
      t.device_id,
      t.is_active as token_active,
      t.last_used_at,
      t.created_at as token_created_at,
      u.email,
      u.name_with_initials,
      u.user_type,
      u.is_active as user_active
    FROM user_fcm_tokens t
    INNER JOIN users u ON u.id = t.user_id
    ORDER BY u.is_active DESC, t.is_active DESC, t.last_used_at DESC
  `);
  return tokens;
}

async function getTargetedUsers(connection) {
  // Users that "ALL" will target (is_active = true)
  const [targeted] = await connection.execute(`
    SELECT id, email, user_type, is_active
    FROM users
    WHERE is_active = true
  `);
  return targeted;
}

async function getTargetedUsersWithTokens(connection) {
  // Active users who have tokens
  const [usersWithTokens] = await connection.execute(`
    SELECT 
      DISTINCT u.id, 
      u.email, 
      u.user_type, 
      COUNT(t.id) as token_count
    FROM users u
    INNER JOIN user_fcm_tokens t ON t.user_id = u.id
    WHERE u.is_active = true AND t.is_active = true
    GROUP BY u.id, u.email, u.user_type
  `);
  return usersWithTokens;
}

async function getInactiveUsersWithTokens(connection) {
  // Inactive users who have tokens (won't be targeted)
  const [inactiveWithTokens] = await connection.execute(`
    SELECT 
      DISTINCT u.id, 
      u.email, 
      u.user_type, 
      COUNT(t.id) as token_count
    FROM users u
    INNER JOIN user_fcm_tokens t ON t.user_id = u.id
    WHERE u.is_active = false AND t.is_active = true
    GROUP BY u.id, u.email, u.user_type
  `);
  return inactiveWithTokens;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

function makeApiRequest(method, path, token, body = null) {
  return new Promise((resolve, reject) => {
    const bodyString = body ? JSON.stringify(body) : null;
    
    const options = {
      hostname: '127.0.0.1',
      port: 8080,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    };

    if (bodyString) {
      options.headers['Content-Length'] = Buffer.byteLength(bodyString);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ data: data, statusCode: res.statusCode });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    
    if (bodyString) {
      req.write(bodyString);
    }
    
    req.end();
  });
}

async function sendTestNotification(token) {
  const timestamp = new Date().toISOString();
  const body = {
    title: "🧪 Complete Test",
    body: `Testing all users delivery - ${timestamp}`,
    scope: "GLOBAL",
    targetUserTypes: ["ALL"],
    priority: "HIGH",
    sendImmediately: true
  };

  return await makeApiRequest('POST', '/push-notifications/admin', token, body);
}

// ============================================================================
// DISPLAY FUNCTIONS
// ============================================================================

function printHeader(text) {
  console.log('\n' + '='.repeat(90));
  console.log(text);
  console.log('='.repeat(90) + '\n');
}

function printSection(text) {
  console.log('\n' + '-'.repeat(90));
  console.log(text);
  console.log('-'.repeat(90) + '\n');
}

function analyzeUsers(users) {
  const active = users.filter(u => u.is_active);
  const inactive = users.filter(u => !u.is_active);
  const verified = users.filter(u => u.is_email_verified);
  
  const byType = {};
  users.forEach(u => {
    byType[u.user_type] = (byType[u.user_type] || 0) + 1;
  });

  return { active, inactive, verified, byType };
}

function analyzeTokens(tokens) {
  const activeTokens = tokens.filter(t => t.token_active);
  const inactiveTokens = tokens.filter(t => !t.token_active);
  
  const byUser = {};
  tokens.forEach(t => {
    if (!byUser[t.user_id]) {
      byUser[t.user_id] = {
        email: t.email,
        name: t.name_with_initials,
        userType: t.user_type,
        userActive: t.user_active,
        tokens: []
      };
    }
    byUser[t.user_id].tokens.push({
      deviceType: t.device_type,
      tokenActive: t.token_active,
      lastUsed: t.last_used_at
    });
  });

  return { activeTokens, inactiveTokens, byUser };
}

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================

async function runCompleteTest() {
  printHeader('🧪 COMPLETE TEST: ALL USERS, TOKENS & NOTIFICATION DELIVERY');

  // Get JWT token from command line or use default
  const token = process.argv[2] || process.env.TEST_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzIjoiMSIsInUiOjAsInQiOjE3NzEwOTY4NjYsImkiOjk5OTk5OSwiaWF0IjoxNzcxMDk2ODY2LCJleHAiOjE3NzExMDA0NjZ9.DOcCj4glRez7BrqQMCB6iiA_r6xsZleZD8FFpL2Oc-c';

  let connection;
  
  try {
    // ============================================================================
    // STEP 1: Load configuration and connect to database
    // ============================================================================
    
    console.log('📋 STEP 1: Loading configuration and connecting to database...\n');
    
    const config = loadEnv();
    console.log(`   Database: ${config.dbName}@${config.dbHost}:${config.dbPort}`);
    console.log(`   User: ${config.dbUser}\n`);
    
    connection = await connectDatabase(config);
    console.log('   ✅ Connected to database successfully\n');

    // ============================================================================
    // STEP 2: Get all users
    // ============================================================================
    
    printSection('📋 STEP 2: Getting ALL users from database');
    
    const allUsers = await getAllUsers(connection);
    const userAnalysis = analyzeUsers(allUsers);
    
    console.log(`   Total users in database: ${allUsers.length}`);
    console.log(`   • Active users (is_active = true):   ${userAnalysis.active.length}`);
    console.log(`   • Inactive users (is_active = false): ${userAnalysis.inactive.length}`);
    console.log(`   • Email verified users:               ${userAnalysis.verified.length}\n`);
    
    console.log('   Users by type:');
    Object.entries(userAnalysis.byType).forEach(([type, count]) => {
      console.log(`   • ${type}: ${count}`);
    });

    // Show sample of users
    console.log('\n   Sample users (first 5):');
    allUsers.slice(0, 5).forEach((user, i) => {
      const status = user.is_active ? '✅ ACTIVE' : '❌ INACTIVE';
      console.log(`   ${i + 1}. ${status} | ${user.user_type}`);
      console.log(`      Email: ${user.email}`);
      console.log(`      Name: ${user.name_with_initials || 'N/A'}`);
    });

    // ============================================================================
    // STEP 3: Get all FCM tokens
    // ============================================================================
    
    printSection('📱 STEP 3: Getting ALL FCM tokens from database');
    
    const allTokens = await getAllTokens(connection);
    const tokenAnalysis = analyzeTokens(allTokens);
    
    console.log(`   Total FCM tokens in database: ${allTokens.length}`);
    console.log(`   • Active tokens:   ${tokenAnalysis.activeTokens.length}`);
    console.log(`   • Inactive tokens: ${tokenAnalysis.inactiveTokens.length}`);
    console.log(`   • Unique users with tokens: ${Object.keys(tokenAnalysis.byUser).length}\n`);

    // Show detailed token information
    console.log('   Token details by user:\n');
    Object.entries(tokenAnalysis.byUser).forEach(([userId, data], index) => {
      const activeCount = data.tokens.filter(t => t.tokenActive).length;
      const userStatus = data.userActive ? '✅ ACTIVE' : '❌ INACTIVE';
      const tokenStatus = activeCount > 0 ? `✅ ${activeCount} active` : '❌ 0 active';
      
      console.log(`   ${index + 1}. ${userStatus} | ${data.userType}`);
      console.log(`      Email: ${data.email}`);
      console.log(`      Name: ${data.name || 'N/A'}`);
      console.log(`      Tokens: ${data.tokens.length} total (${tokenStatus})`);
      
      if (data.tokens.length <= 3) {
        data.tokens.forEach((token, i) => {
          const tStatus = token.tokenActive ? '✅' : '❌';
          const lastUsed = token.lastUsed ? new Date(token.lastUsed).toLocaleString() : 'Never';
          console.log(`        ${i + 1}. ${tStatus} ${token.deviceType} - Last: ${lastUsed}`);
        });
      }
      console.log();
    });

    // ============================================================================
    // STEP 4: Analyze notification targeting
    // ============================================================================
    
    printSection('🎯 STEP 4: Analyzing notification targeting logic');
    
    const targetedUsers = await getTargetedUsers(connection);
    const targetedWithTokens = await getTargetedUsersWithTokens(connection);
    const inactiveWithTokens = await getInactiveUsersWithTokens(connection);
    
    console.log(`   Users "ALL" will target (is_active = true): ${targetedUsers.length}`);
    console.log(`   Of those, users WITH active FCM tokens:     ${targetedWithTokens.length}`);
    console.log(`   So ${targetedUsers.length - targetedWithTokens.length} targeted users will have NO tokens\n`);
    
    if (targetedWithTokens.length > 0) {
      console.log('   ✅ These active users WILL receive notifications:\n');
      targetedWithTokens.forEach((user, i) => {
        console.log(`      ${i + 1}. ${user.email} (${user.user_type}) - ${user.token_count} token(s)`);
      });
      console.log();
    } else {
      console.log('   ❌ NO active users have FCM tokens!\n');
    }
    
    if (inactiveWithTokens.length > 0) {
      console.log(`   ⚠️  ${inactiveWithTokens.length} INACTIVE users have tokens (WON'T receive):\n`);
      inactiveWithTokens.forEach((user, i) => {
        console.log(`      ${i + 1}. ${user.email} (${user.user_type}) - ${user.token_count} token(s)`);
      });
      console.log();
    }

    // ============================================================================
    // STEP 5: Send test notification
    // ============================================================================
    
    printSection('🔔 STEP 5: Sending test notification via API');
    
    console.log('   Request details:');
    console.log('   • URL: POST http://127.0.0.1:8080/push-notifications/admin');
    console.log('   • Target: ALL users');
    console.log('   • Priority: HIGH');
    console.log('   • Send immediately: true\n');
    
    console.log('   Sending notification...\n');
    
    const response = await sendTestNotification(token);
    
    console.log('   ✅ API Response:\n');
    console.log(`      Total Recipients:     ${response.totalRecipients}`);
    console.log(`      Sent Count:           ${response.sentCount}`);
    console.log(`      Failed Count:         ${response.failedCount}`);
    console.log(`      Users With Tokens:    ${response.usersWithTokens || 'N/A'}`);
    console.log(`      Users Without Tokens: ${response.usersWithoutTokens || 'N/A'}`);
    
    if (response.details && response.details.deliveryRate) {
      console.log(`      Delivery Rate:        ${response.details.deliveryRate}`);
    }
    console.log();

    // ============================================================================
    // STEP 6: Analyze results and provide recommendations
    // ============================================================================
    
    printSection('📊 STEP 6: Result Analysis & Recommendations');
    
    const recipients = response.totalRecipients || 0;
    const sent = response.sentCount || 0;
    const withoutTokens = response.usersWithoutTokens || 0;
    
    console.log('   Result Summary:\n');
    console.log(`   • Database has ${allUsers.length} total users`);
    console.log(`   • ${userAnalysis.active.length} users are active`);
    console.log(`   • ${Object.keys(tokenAnalysis.byUser).length} users have FCM tokens`);
    console.log(`   • API targeted ${recipients} users`);
    console.log(`   • API sent to ${sent} devices\n`);
    
    if (sent === 0 && recipients > 0) {
      console.log('   ❌ PROBLEM DETECTED:\n');
      console.log(`      • ${recipients} active users were targeted`);
      console.log(`      • But ${withoutTokens} of them have NO FCM tokens`);
      console.log(`      • Result: 0 notifications delivered\n`);
      
      if (inactiveWithTokens.length > 0) {
        console.log('   🔍 ROOT CAUSE:\n');
        console.log(`      • ${inactiveWithTokens.length} users HAVE tokens but are INACTIVE`);
        console.log('      • They need to be activated to receive notifications\n');
        
        console.log('   🔧 FIX - Run this SQL:\n');
        console.log('      UPDATE users SET is_active = true');
        console.log('      WHERE id IN (');
        console.log('        SELECT DISTINCT user_id FROM user_fcm_tokens WHERE is_active = true');
        console.log('      );\n');
        
        const inactiveUserIds = inactiveWithTokens.map(u => u.id).join(', ');
        console.log(`   📝 Or activate specific users: WHERE id IN (${inactiveUserIds});\n`);
        
        console.log('   ✅ After running the SQL:');
        console.log(`      • Total targeted users: ${recipients + inactiveWithTokens.length}`);
        console.log(`      • Users with tokens: ${inactiveWithTokens.length}`);
        console.log(`      • Expected sentCount: ${inactiveWithTokens.length}\n`);
      } else {
        console.log('   🔍 ROOT CAUSE:\n');
        console.log('      • Active users don\'t have FCM tokens registered');
        console.log('      • Users need to open mobile app and grant notification permissions\n');
      }
    } else if (sent > 0) {
      console.log('   ✅ SUCCESS!\n');
      console.log(`      • ${sent} notification(s) delivered successfully!`);
      
      if (sent < recipients) {
        console.log(`      • Note: ${recipients - sent} targeted user(s) don't have tokens`);
        console.log('      • They need to register tokens from mobile app\n');
      } else {
        console.log('      • All targeted users received notifications! 🎉\n');
      }
    } else {
      console.log('   ⚠️  NO USERS TARGETED:\n');
      console.log('      • No active users in database OR');
      console.log('      • All users are inactive\n');
    }

    // ============================================================================
    // STEP 7: Summary and next steps
    // ============================================================================
    
    printHeader('📋 COMPLETE TEST SUMMARY');
    
    console.log('Database Statistics:');
    console.log(`  • Total users:                    ${allUsers.length}`);
    console.log(`  • Active users:                   ${userAnalysis.active.length}`);
    console.log(`  • Users with FCM tokens:          ${Object.keys(tokenAnalysis.byUser).length}`);
    console.log(`  • Active tokens:                  ${tokenAnalysis.activeTokens.length}\n`);
    
    console.log('Notification Test Results:');
    console.log(`  • Users targeted:                 ${recipients}`);
    console.log(`  • Notifications sent:             ${sent}`);
    console.log(`  • Users without tokens:           ${withoutTokens}\n`);
    
    console.log('Targeting Analysis:');
    console.log(`  • Active users with tokens:       ${targetedWithTokens.length} ← Will receive`);
    console.log(`  • Active users without tokens:    ${recipients - targetedWithTokens.length} ← Won't receive`);
    console.log(`  • Inactive users with tokens:     ${inactiveWithTokens.length} ← Need activation\n`);
    
    if (inactiveWithTokens.length > 0) {
      console.log('⚠️  ACTION REQUIRED:');
      console.log('   Run SQL UPDATE to activate users with tokens');
      console.log('   See: DIAGNOSE_NOTIFICATION_ISSUE.sql\n');
    } else if (sent > 0) {
      console.log('✅ ALL SYSTEMS OPERATIONAL');
      console.log('   Notifications are being delivered successfully!\n');
    } else if (Object.keys(tokenAnalysis.byUser).length === 0) {
      console.log('⚠️  NO FCM TOKENS REGISTERED');
      console.log('   Users need to open mobile app and grant permissions\n');
    }
    
    printHeader('✅ TEST COMPLETE');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('\nDetails:', error.stack);
    
    if (error.message.includes('Access denied')) {
      console.error('\n💡 Fix: Check database credentials in .env file');
    } else if (error.message.includes('ECONNREFUSED') || error.message.includes('HTTP')) {
      console.error('\n💡 Fix: Make sure server is running on localhost:8080 (npm start)');
    }
    
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// ============================================================================
// RUN THE TEST
// ============================================================================

console.log('\n🚀 Starting complete notification system test...');
console.log('Usage: node scripts/complete-standalone-test.js [JWT_TOKEN]\n');

runCompleteTest().catch(error => {
  console.error('\n💥 Fatal error:', error.message);
  process.exit(1);
});
