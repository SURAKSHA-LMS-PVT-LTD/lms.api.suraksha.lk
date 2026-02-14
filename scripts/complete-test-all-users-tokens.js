/**
 * Complete Test: Get all users, all tokens, and send notification
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  console.log('\n' + '='.repeat(90));
  console.log('🧪 COMPLETE TEST: ALL USERS & TOKENS + NOTIFICATION DELIVERY');
  console.log('='.repeat(90) + '\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // =============================================================================
  // STEP 1: Get all users
  // =============================================================================
  
  console.log('📋 STEP 1: Getting ALL users from database...\n');
  
  const [allUsers] = await connection.execute(`
    SELECT 
      id,
      email,
      name_with_initials,
      user_type,
      is_active,
      is_email_verified
    FROM users
    ORDER BY is_active DESC, user_type, email
  `);

  console.log(`   Total users in database: ${allUsers.length}`);
  
  const activeUsers = allUsers.filter(u => u.is_active);
  const inactiveUsers = allUsers.filter(u => !u.is_active);
  
  console.log(`   • Active users (is_active = true):   ${activeUsers.length}`);
  console.log(`   • Inactive users (is_active = false): ${inactiveUsers.length}\n`);

  // Count by user type
  const usersByType = {};
  allUsers.forEach(u => {
    usersByType[u.user_type] = (usersByType[u.user_type] || 0) + 1;
  });

  console.log('   Users by type:');
  Object.entries(usersByType).forEach(([type, count]) => {
    console.log(`   • ${type}: ${count}`);
  });
  console.log();

  // =============================================================================
  // STEP 2: Get all FCM tokens
  // =============================================================================

  console.log('='.repeat(90));
  console.log('\n📱 STEP 2: Getting ALL FCM tokens from database...\n');

  const [allTokens] = await connection.execute(`
    SELECT 
      t.id,
      t.user_id,
      t.fcm_token,
      t.device_type,
      t.device_id,
      t.is_active as token_active,
      t.last_used_at,
      u.email,
      u.name_with_initials,
      u.user_type,
      u.is_active as user_active
    FROM user_fcm_tokens t
    INNER JOIN users u ON u.id = t.user_id
    ORDER BY u.is_active DESC, t.is_active DESC, t.last_used_at DESC
  `);

  console.log(`   Total FCM tokens in database: ${allTokens.length}`);
  
  const activeTokens = allTokens.filter(t => t.token_active);
  const inactiveTokens = allTokens.filter(t => !t.token_active);
  
  console.log(`   • Active tokens:   ${activeTokens.length}`);
  console.log(`   • Inactive tokens: ${inactiveTokens.length}\n`);

  // Group by user
  const tokensByUser = {};
  allTokens.forEach(t => {
    if (!tokensByUser[t.user_id]) {
      tokensByUser[t.user_id] = {
        email: t.email,
        name: t.name_with_initials,
        userType: t.user_type,
        userActive: t.user_active,
        tokens: []
      };
    }
    tokensByUser[t.user_id].tokens.push({
      deviceType: t.device_type,
      tokenActive: t.token_active,
      lastUsed: t.last_used_at
    });
  });

  console.log(`   Users with FCM tokens: ${Object.keys(tokensByUser).length}\n`);

  // Show detailed token info
  console.log('   Token Details:\n');
  Object.entries(tokensByUser).forEach(([userId, data], index) => {
    const activeCount = data.tokens.filter(t => t.token_active).length;
    const userStatus = data.userActive ? '✅ ACTIVE' : '❌ INACTIVE';
    const tokenStatus = activeCount > 0 ? `✅ ${activeCount} active` : '❌ 0 active';
    
    console.log(`   ${index + 1}. ${userStatus} | ${data.userType}`);
    console.log(`      Email: ${data.email}`);
    console.log(`      Name: ${data.name || 'N/A'}`);
    console.log(`      Tokens: ${data.tokens.length} total (${tokenStatus})`);
    data.tokens.forEach((token, i) => {
      const tStatus = token.tokenActive ? '✅' : '❌';
      console.log(`        ${i + 1}. ${tStatus} ${token.deviceType} - Last used: ${token.lastUsed || 'Never'}`);
    });
    console.log();
  });

  // =============================================================================
  // STEP 3: Analyze targeting
  // =============================================================================

  console.log('='.repeat(90));
  console.log('\n🎯 STEP 3: Analyzing notification targeting...\n');

  // Users that "ALL" target type will find (is_active = true)
  const [targetedByAll] = await connection.execute(`
    SELECT id, email, user_type
    FROM users
    WHERE is_active = true
  `);

  console.log(`   "ALL" target type will find: ${targetedByAll.length} users`);

  // Of those, how many have tokens?
  const [targetedWithTokens] = await connection.execute(`
    SELECT DISTINCT u.id, u.email, u.user_type, COUNT(t.id) as token_count
    FROM users u
    INNER JOIN user_fcm_tokens t ON t.user_id = u.id
    WHERE u.is_active = true AND t.is_active = true
    GROUP BY u.id, u.email, u.user_type
  `);

  console.log(`   Of those, ${targetedWithTokens.length} have active FCM tokens`);
  console.log(`   So ${targetedByAll.length - targetedWithTokens.length} will be targeted but have NO tokens\n`);

  if (targetedWithTokens.length === 0) {
    console.log('   ❌ PROBLEM: No targeted users have FCM tokens!');
    console.log('   ❌ This is why sentCount = 0\n');
  } else {
    console.log('   ✅ These users will receive notifications:\n');
    targetedWithTokens.forEach((user, i) => {
      console.log(`      ${i + 1}. ${user.email} (${user.user_type}) - ${user.token_count} token(s)`);
    });
    console.log();
  }

  // Users with tokens but NOT active (won't be targeted)
  const [notTargetedWithTokens] = await connection.execute(`
    SELECT DISTINCT u.id, u.email, u.user_type, COUNT(t.id) as token_count
    FROM users u
    INNER JOIN user_fcm_tokens t ON t.user_id = u.id
    WHERE u.is_active = false AND t.is_active = true
    GROUP BY u.id, u.email, u.user_type
  `);

  if (notTargetedWithTokens.length > 0) {
    console.log(`   ⚠️  ${notTargetedWithTokens.length} users have tokens but are INACTIVE (won't receive):\n`);
    notTargetedWithTokens.forEach((user, i) => {
      console.log(`      ${i + 1}. ${user.email} (${user.user_type}) - ${user.token_count} token(s)`);
    });
    console.log();
  }

  // =============================================================================
  // STEP 4: Show the fix
  // =============================================================================

  if (notTargetedWithTokens.length > 0) {
    console.log('='.repeat(90));
    console.log('\n🔧 STEP 4: SQL FIX NEEDED\n');
    
    const inactiveUserIds = notTargetedWithTokens.map(u => u.id).join(', ');
    
    console.log('   To make notifications reach all users with tokens, run:\n');
    console.log('   UPDATE users SET is_active = true');
    console.log(`   WHERE id IN (${inactiveUserIds});\n`);
    console.log('   OR to activate ALL users with tokens:\n');
    console.log('   UPDATE users SET is_active = true');
    console.log('   WHERE id IN (');
    console.log('     SELECT DISTINCT user_id FROM user_fcm_tokens WHERE is_active = true');
    console.log('   );\n');
  }

  // =============================================================================
  // STEP 5: Provide test command
  // =============================================================================

  console.log('='.repeat(90));
  console.log('\n🧪 STEP 5: TEST NOTIFICATION COMMAND\n');

  console.log('   After fixing (if needed), test with this PowerShell command:\n');
  console.log('   $token = "YOUR_JWT_TOKEN"');
  console.log('   $body = @{');
  console.log('     title = "🧪 Test Notification"');
  console.log('     body = "Testing delivery to all users - ' + new Date().toISOString() + '"');
  console.log('     scope = "GLOBAL"');
  console.log('     targetUserTypes = @("ALL")');
  console.log('     priority = "HIGH"');
  console.log('     sendImmediately = $true');
  console.log('   } | ConvertTo-Json\n');
  console.log('   $response = Invoke-RestMethod -Uri "http://127.0.0.1:8080/push-notifications/admin" `');
  console.log('     -Method POST `');
  console.log('     -Headers @{"Authorization"="Bearer $token"; "Content-Type"="application/json"} `');
  console.log('     -Body $body\n');
  console.log('   Write-Host "Total Recipients: $($response.totalRecipients)"');
  console.log('   Write-Host "Sent Count: $($response.sentCount)"');
  console.log('   Write-Host "Expected: sentCount = ' + targetedWithTokens.length + ' (users with tokens)"\n');

  // =============================================================================
  // Summary
  // =============================================================================

  console.log('='.repeat(90));
  console.log('\n📊 SUMMARY\n');
  console.log(`   Total users in database:             ${allUsers.length}`);
  console.log(`   Users with is_active = true:         ${activeUsers.length}`);
  console.log(`   Total FCM tokens:                    ${allTokens.length}`);
  console.log(`   Users with active FCM tokens:        ${Object.keys(tokensByUser).length}`);
  console.log(`   Users targeted by "ALL":             ${targetedByAll.length}`);
  console.log(`   Targeted users WITH tokens:          ${targetedWithTokens.length} ← Will receive`);
  console.log(`   Targeted users WITHOUT tokens:       ${targetedByAll.length - targetedWithTokens.length} ← Won't receive`);
  console.log(`   Inactive users WITH tokens:          ${notTargetedWithTokens.length} ← Need activation\n`);

  if (notTargetedWithTokens.length > 0) {
    console.log('   ❌ ACTION REQUIRED: Run SQL UPDATE to activate users with tokens');
  } else if (targetedWithTokens.length === 0) {
    console.log('   ⚠️  NO USERS HAVE FCM TOKENS - Register tokens from mobile app');
  } else {
    console.log('   ✅ ALL USERS WITH TOKENS ARE ACTIVE - Notifications should deliver!');
  }

  console.log('\n' + '='.repeat(90) + '\n');

  await connection.end();
}

main().catch(error => {
  console.error('\n❌ ERROR:', error.message);
  console.error('\nMake sure:');
  console.error('  1. Database credentials are correct in .env file');
  console.error('  2. MySQL server is running');
  console.error('  3. You have necessary permissions\n');
  process.exit(1);
});
