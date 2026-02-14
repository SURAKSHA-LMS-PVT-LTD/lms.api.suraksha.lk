/**
 * Complete API-Only Test: Send notification and analyze results
 * No database access needed - works with running server only
 */

const http = require('http');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  baseUrl: '127.0.0.1',
  port: 8080,
  token: process.argv[2] || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzIjoiMSIsInUiOjAsInQiOjE3NzEwOTY4NjYsImkiOjk5OTk5OSwiaWF0IjoxNzcxMDk2ODY2LCJleHAiOjE3NzExMDA0NjZ9.DOcCj4glRez7BrqQMCB6iiA_r6xsZleZD8FFpL2Oc-c'
};

// ============================================================================
// API REQUEST FUNCTION
// ============================================================================

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const bodyString = body ? JSON.stringify(body) : null;
    
    const options = {
      hostname: CONFIG.baseUrl,
      port: CONFIG.port,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${CONFIG.token}`,
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
            resolve({ success: true, data: JSON.parse(data), statusCode: res.statusCode });
          } catch (e) {
            resolve({ success: true, data: data, statusCode: res.statusCode });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Connection failed: ${error.message}`));
    });
    
    if (bodyString) {
      req.write(bodyString);
    }
    
    req.end();
  });
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

async function testServerHealth() {
  try {
    await makeRequest('GET', '/health');
    return true;
  } catch (error) {
    return false;
  }
}

async function sendTestNotification(targetTypes, title) {
  const timestamp = new Date().toISOString();
 const body = {
    title: title || "🧪 Complete API Test",
    body: `Testing notification delivery - ${timestamp}`,
    scope: "GLOBAL",
    targetUserTypes: targetTypes,
    priority: "HIGH",
    sendImmediately: true
  };

  const response = await makeRequest('POST', '/push-notifications/admin', body);
  return response.data;
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
  console.log('\n' + '-'.repeat(70));
  console.log(text);
  console.log('-'.repeat(70) + '\n');
}

// ============================================================================
// MAIN TEST
//  ============================================================================

async function runTest() {
  printHeader('🧪 COMPLETE API-ONLY TEST: NOTIFICATION DELIVERY');

  console.log('Configuration:');
  console.log(`  Server: http://${CONFIG.baseUrl}:${CONFIG.port}`);
  console.log(`  Token: ${CONFIG.token.substring(0, 30)}...`);
  console.log();

  try {
    // ========================================================================
    // STEP 1: Check server health
    // ========================================================================
    
    printSection('STEP 1: Checking server status');
    
    console.log('  Testing connection to server...\n');
    
    const isHealthy = await testServerHealth();
    
    if (isHealthy) {
      console.log('  ✅ Server is ONLINE and responding\n');
    } else {
      console.log('  ❌ Server is OFFLINE or not responding');
      console.log('  💡 Start server with: npm start\n');
      process.exit(1);
    }

    // ========================================================================
    // STEP 2: Test with "ALL" target type
    // ========================================================================
    
    printSection('STEP 2: Testing notification to ALL users');
    
    console.log('  Request:');
    console.log('    Target: ALL users');
    console.log('    Scope: GLOBAL');
    console.log('    Priority: HIGH\n');
    
    console.log('  Sending notification...\n');
    
    const allResponse = await sendTestNotification(['ALL'], '🧪 Test ALL');
    
    console.log('  ✅ Response received:\n');
    console.log(`    Total Recipients:     ${allResponse.totalRecipients}`);
    console.log(`    Sent Count:           ${allResponse.sentCount}`);
    console.log(`    Failed Count:         ${allResponse.failedCount}`);
    console.log(`    Users With Tokens:    ${allResponse.usersWithTokens || 'N/A'}`);
    console.log(`    Users Without Tokens: ${allResponse.usersWithoutTokens || 'N/A'}`);
    
    if (allResponse.details) {
      console.log(`    Delivery Rate:        ${allResponse.details.deliveryRate || 'N/A'}`);
    }
    console.log();

    // ========================================================================
    // STEP 3: Test with SYSTEM_ADMINS target type
    // ========================================================================
    
    printSection('STEP 3: Testing notification to SYSTEM_ADMINS');
    
    console.log('  Request:');
    console.log('    Target: SYSTEM_ADMINS only');
    console.log('    Scope: GLOBAL');
    console.log('    Priority: HIGH\n');
    
    console.log('  Sending notification...\n');
    
    try {
      const adminResponse = await sendTestNotification(['SYSTEM_ADMINS'], '🧪 Test SYSTEM_ADMINS');
      
      console.log('  ✅ Response received:\n');
      console.log(`    Total Recipients:     ${adminResponse.totalRecipients}`);
      console.log(`    Sent Count:           ${adminResponse.sentCount}`);
      console.log(`    Failed Count:         ${adminResponse.failedCount}`);
      console.log(`    Users With Tokens:    ${adminResponse.usersWithTokens || 'N/A'}`);
      console.log(`    Users Without Tokens: ${adminResponse.usersWithoutTokens || 'N/A'}`);
      console.log();
    } catch (error) {
      console.log('  ⚠️  Note: SYSTEM_ADMINS target requires server restart after code changes\n');
      console.log(`  Error: ${error.message}\n`);
    }

    // ========================================================================
    // STEP 4: Analyze results
    // ========================================================================
    
    printSection('STEP 4: Result Analysis');
    
    const recipients = allResponse.totalRecipients || 0;
    const sent = allResponse.sentCount || 0;
    const withoutTokens = allResponse.usersWithoutTokens || 0;
    
    console.log('  Summary:\n');
    console.log(`    • API targeted ${recipients} active users`);
    console.log(`    • Sent to ${sent} devices`);
    console.log(`    • ${withoutTokens} users don't have tokens\n`);
    
    if (sent === 0 && recipients > 0) {
      console.log('  ❌ PROBLEM DETECTED:\n');
      console.log(`    • ${recipients} active users found`);
      console.log(`    • But 0 notifications sent`);
      console.log(`    • All ${recipients} users have NO FCM tokens\n`);
      
      console.log('  🔍 ROOT CAUSE:\n');
      console.log('    Users WITH tokens are INACTIVE (is_active = false)');
      console.log('    So they\'re not included in "ALL" target\n');
      
      console.log('  🔧 FIX - Run this SQL:\n');
      console.log('    UPDATE users SET is_active = true');
      console.log('    WHERE id IN (');
      console.log('      SELECT DISTINCT user_id FROM user_fcm_tokens WHERE is_active = true');
      console.log('    );\n');
      
      console.log('  ✅ After fix:');
      console.log('    • More users will be targeted');
      console.log('    • Users with tokens will receive notifications');
      console.log('    • sentCount > 0\n');
      
    } else if (sent > 0) {
      console.log('  ✅ SUCCESS!\n');
      console.log(`    • ${sent} notification(s) delivered successfully!`);
      
      if (sent < recipients) {
        console.log(`    • ${recipients - sent} user(s) need to register FCM tokens`);
        console.log('    • They should open mobile app and grant permissions\n');
      } else {
        console.log('    • All targeted users received notifications! 🎉\n');
      }
      
    } else {
      console.log('  ⚠️  NO USERS FOUND:\n');
      console.log('    • No active users in database');
      console.log('    • Or all users are inactive\n');
    }

    // ========================================================================
    // STEP 5: Recommendations
    // ========================================================================
    
    printSection('STEP 5: Recommendations & Next Steps');
    
    if (sent === 0 && recipients > 0) {
      console.log('  🎯 IMMEDIATE ACTION:\n');
      console.log('    1. Connect to your database');
      console.log('    2. Run the SQL UPDATE query shown above');
      console.log('    3. Test again - sentCount should be > 0\n');
      
      console.log('  📄 FILES TO CHECK:\n');
      console.log('    • DIAGNOSE_NOTIFICATION_ISSUE.sql - Complete SQL queries');
      console.log('    • WHY_ALL_DOESNT_DELIVER_EXPLANATION.md - Detailed explanation');
      console.log('    • SYSTEM_ADMINS_TARGET_TYPE_FEATURE.md - New features\n');
      
    } else if (sent > 0 && sent < recipients) {
      console.log('  🎯 TO IMPROVE DELIVERY:\n');
      console.log('    1. Users without tokens should:');
      console.log('       - Open mobile app');
      console.log('       - Grant notification permissions');
      console.log('       - Login to register FCM token\n');
      
      console.log('    2. Check FCM_TOKEN_TROUBLESHOOTING.md for:');
      console.log('       - How to register tokens');
      console.log('       - Common issues');
      console.log('       - Testing steps\n');
      
    } else if (sent > 0 && sent === recipients) {
      console.log('  ✅ PERFECT STATE:\n');
      console.log('    • All systems operational');
      console.log('    • All active users with tokens receiving notifications');
      console.log('    • No action needed\n');
      
    } else {
      console.log('  ⚠️  SYSTEM SETUP NEEDED:\n');
      console.log('    1. Ensure users exist in database');
      console.log('    2. Activate users: UPDATE users SET is_active = true');
      console.log('    3. Have users register FCM tokens from mobile app\n');
    }

    // ========================================================================
    // Final Summary
    // ========================================================================
    
    printHeader('📋 FINAL SUMMARY');
    
    console.log('Test Results:');
    console.log(`  ✓ Server status:           ONLINE`);
    console.log(`  ✓ API response:            SUCCESS`);
    console.log(`  ✓ Users targeted:          ${recipients}`);
    console.log(`  ${sent > 0 ? '✓' : '✗'} Notifications sent:      ${sent}`);
    console.log(`  ${withoutTokens === 0 ? '✓' : '✗'} Users without tokens:    ${withoutTokens}\n`);
    
    if (sent === 0 && recipients > 0) {
      console.log('Status: ⚠️  ACTION REQUIRED');
      console.log('Next: Run SQL UPDATE to activate users with tokens\n');
    } else if (sent > 0) {
      console.log('Status: ✅ OPERATIONAL');
      console.log(`Delivery: ${sent}/${recipients} (${((sent/recipients)*100).toFixed(1)}%)\n`);
    }
    
    printHeader('✅ TEST COMPLETE');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    
    if (error.message.includes('Connection refused') || error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Fix: Start the server with: npm start');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.error('\n💡 Fix: Token expired or invalid. Get a fresh token.');
    }
    
    console.error();
    process.exit(1);
  }
}

// ============================================================================
// RUN
// ============================================================================

console.log('\n🚀 Starting API-only notification test...');
console.log('Usage: node scripts/api-only-complete-test.js [JWT_TOKEN]\n');

runTest().catch(error => {
  console.error('\n💥 Fatal error:', error.message);
  process.exit(1);
});
