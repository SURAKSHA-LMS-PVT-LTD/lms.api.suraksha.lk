    const mysql = require('mysql2/promise');
const axios = require('axios');
const admin = require('firebase-admin');

// Database config
const dbConfig = {
  host: '136.114.215.145',
  port: 3306,
  user: 'root',
  password: 'Skaveesha1355660@',
  database: 'suraksha-lms-db'
};

// Firebase config
const firebaseConfig = {
  projectId: 'suraksha-ab3c0',
  privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCcYj5PZmaM+VhG\nEJgWTH4sZm3HsGBdEw5nvHshRQrqLXgPCEdvICh1dSxKpxAERh8srsmDeP5f2JSS\nBnKLaGg4vv6R5dxcyAx5xdAezdUpe1XIn+9z2Y4sFm7T3ohVGZGl/ezxaoLordma\n3Yc14uNjWRv2A/h29nUVSYGhzh6FVpxbvzsEktRad0Tb5+s36Eh4A2WCx7heVJOw\n18bNb4zGVLc6To6VWbfRu6eZ00FFsW2HJL/AxpN3b21DZbBM3wPUmbiPmTZ+Alz/\n7p1gsYJXZRxyt7HQwBOLfyUrS5v7GnxrN37HrX15TYuyTL2YnStMVce1tOqNPR08\n06nuH9dVAgMBAAECggEARgWFUecPdwL0oBaxCpcAjd/lOtsCItq0AgX2egygmP93\n+P8jgSH8i69GAD0yoj9FmSvAJiKof4EJ8SJ66mn69KGseeZa155pW6MTj59pWTQU\n0oquXIimrJ30zOAg2j3jJdh/Xg9rg0TIoRuc/adUWnkdWHgpqharkTcDGNCigN/2\nIPsHLR0vyzTQicwz4JOru6042T/k1VqlF+TkGABWOWPajuNB+R7WVYMxMgeSeZwY\nAhITTD/vLpxasKVQKpFMvU0oFkgn9/O7x8QGI4zyKXYuUNZhLJXndYpIvWxzE/IS\nCAwoQdk4Iqb9CW2SfNT/+a3Um9EfMvX7P/L+5CqoxwKBgQDSz2rXyKaeFWxetZKf\nDtpVTSCCckmPR85BIL4G8FI6u3LS+/mnFO63K/22rykMQanO13XXRtwFuhb70Aex\n1puxVC0a3pHOUcds8TQPE/zwPRTB1F9iKsa0JqtsFJ6WmYIo+OJKlQ1lBe6m0HH3\nnsLnIEAyHeiQjNF3Ywv67yBCQwKBgQC96BP8bgaKq6X8qBP77rZv7Pxh625tFsp8\n0Se9CcFu+ThWcThWxJoHhfFjhpBcwq6yEuVJIEVvn8i3wclnqSino0gf6huNfi5n\nW4pceN2BiWxqoHew6pU7/zVVNeookNsRmf+9zPPI1kXl9vls+Z3+g6X3tKIdSnsd\nE8L5WnAihwKBgQDIOjfJ4ovW5JQ81IsBxlK76HizTafujg4qL9Ytsv73R+lE2g2C\nk9A0bHUbmf0L5iZKDr2fjm8WhWylGi7ky+ivIjuBJNsqMuSO5f5DQAHjkLBxdaxv\nCiAXJg91pZQHiKBnGBWfLzk8tci56owE3GdUrX4r29pzyTx+/7V2Tr++DwKBgACw\njRIHnEJ4qRunyJrLnSH+7FO2tSn0QTv+znQjSu6KPSgjNR8ri5unYt8HqBKOKnA/\nHVIMqfPj0qjILWEQ/jLNpv9mrD7xTF3XuULotXU4+InSl1yvHWegX6M1lOoczI7d\nzk30JpZ+ILbbFMDOj0JTXBDwOP5+PMA4SCb7qxiVAoGACc7F9UdFe9BHAgw47Qvu\nzKHzkkAQVDZCpVZH9StVSLM8cAC+Xrdaq5cJoiX5U5QhNzxCuYF8Wzv1niPSH7Pk\n+u9U+brLlkbH3t6WKZWyhUpQr/QZG2wXsKIpDb7IfRIOxXt4YLK0YjAgqrnwsNBY\nMHizHwzYppXgA4brXWLwIok=\n-----END PRIVATE KEY-----\n",
  clientEmail: 'firebase-adminsdk-fbsvc@suraksha-ab3c0.iam.gserviceaccount.com'
};

const API_BASE = 'http://localhost:8080';
const JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzIjoiMSIsInUiOjAsInQiOjE3NzExMDA1MDgsImkiOjk5OTk5OSwiaWF0IjoxNzcxMTAwNTA4LCJleHAiOjE3NzExODY5MDh9.cl3pMVMAC_rysyBMXaaXrdI27mQoUblAj5mwjoRzjcU';

async function testFullFlow() {
  let connection;

  try {
    console.log('\n════════════════════════════════════════════════════');
    console.log('  COMPLETE FCM NOTIFICATION FLOW TEST');
    console.log('════════════════════════════════════════════════════\n');

    // Step 1: Connect to database
    console.log('📊 Step 1: Connecting to database...\n');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database\n');

    // Step 2: Get active FCM tokens with user info
    console.log('🔍 Step 2: Fetching active FCM tokens...\n');
    const [tokens] = await connection.execute(`
      SELECT 
        t.id AS token_id,
        t.user_id,
        t.fcm_token,
        t.device_type,
        t.device_id,
        t.is_active AS token_active,
        u.is_active AS user_active,
        u.user_type,
        u.name_with_initials
      FROM user_fcm_tokens t
      JOIN users u ON t.user_id = u.id
      WHERE t.is_active = TRUE
      ORDER BY t.created_at DESC
      LIMIT 5
    `);

    console.log(`Found ${tokens.length} active FCM token(s):\n`);
    tokens.forEach((token, i) => {
      console.log(`${i + 1}. Token ID: ${token.token_id}`);
      console.log(`   User: ${token.name_with_initials} (ID: ${token.user_id})`);
      console.log(`   User Active: ${token.user_active ? '✅ YES' : '❌ NO'}`);
      console.log(`   User Type: ${token.user_type}`);
      console.log(`   Device: ${token.device_type}`);
      console.log(`   FCM Token: ${token.fcm_token.substring(0, 50)}...`);
      console.log('');
    });

    if (tokens.length === 0) {
      console.log('❌ No active FCM tokens found!');
      console.log('   Users need to register their devices first.\n');
      return;
    }

    const testToken = tokens[0];
    const inactiveUsers = tokens.filter(t => !t.user_active);

    if (inactiveUsers.length > 0) {
      console.log(`⚠️  WARNING: ${inactiveUsers.length} inactive user(s) with tokens:`);
      inactiveUsers.forEach(t => {
        console.log(`   - User ${t.user_id} (${t.name_with_initials}) - Token ID: ${t.token_id}`);
      });
      console.log('   These will be EXCLUDED by backend API!\n');
    }

    // Step 3: Initialize Firebase
    console.log('🔥 Step 3: Initializing Firebase Admin SDK...\n');
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: firebaseConfig.projectId,
          privateKey: firebaseConfig.privateKey.replace(/\\n/g, '\n'),
          clientEmail: firebaseConfig.clientEmail,
        }),
      });
    }
    console.log('✅ Firebase initialized\n');

    // Step 4: Send notification DIRECTLY to FCM token (bypass backend)
    console.log('📤 Step 4: Sending notification DIRECTLY via FCM...\n');
    console.log(`   Target: User ${testToken.user_id} (${testToken.name_with_initials})`);
    console.log(`   Token: ${testToken.fcm_token.substring(0, 50)}...`);
    console.log(`   User Active: ${testToken.user_active ? 'YES' : 'NO'}\n`);

    try {
      const message = {
        token: testToken.fcm_token,
        notification: {
          title: '🎯 Direct FCM Test',
          body: `Sent directly at ${new Date().toLocaleTimeString()}`,
        },
        data: {
          testType: 'direct',
          timestamp: Date.now().toString()
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          },
        },
      };

      const messageId = await admin.messaging().send(message);
      console.log(`✅ DIRECT SEND SUCCESS!`);
      console.log(`   Message ID: ${messageId}`);
      console.log(`   This proves the FCM token is valid!\n`);
    } catch (error) {
      console.log(`❌ DIRECT SEND FAILED!`);
      console.log(`   Error: ${error.code} - ${error.message}`);
      if (error.code === 'messaging/mismatched-credential') {
        console.log(`   ⚠️  Token is from different Firebase project!`);
      }
      console.log('');
    }

    // Step 5: Call backend API
    console.log('📤 Step 5: Calling backend API /push-notifications/admin...\n');
    console.log(`   This will use your service layer filtering`);
    console.log(`   Only ACTIVE users will be targeted\n`);

    try {
      const response = await axios.post(
        `${API_BASE}/push-notifications/admin`,
        {
          title: '🔔 Backend API Test',
          body: `Sent via backend at ${new Date().toLocaleTimeString()}`,
          scope: 'GLOBAL',
          targetUserTypes: ['ALL'],
          priority: 'HIGH',
          sendImmediately: true
        },
        {
          headers: {
            'Authorization': `Bearer ${JWT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ BACKEND API RESPONSE:`);
      console.log(`   Notification ID: ${response.data.id}`);
      console.log(`   Total Recipients: ${response.data.totalRecipients}`);
      console.log(`   Sent Count: ${response.data.sentCount}`);
      console.log(`   Failed Count: ${response.data.failedCount}\n`);

      // Analysis
      console.log('════════════════════════════════════════════════════');
      console.log('📊 ANALYSIS:');
      console.log('════════════════════════════════════════════════════\n');

      if (response.data.sentCount > 0) {
        console.log('✅ SUCCESS! Backend sent notifications!');
        console.log(`   ${response.data.sentCount} notification(s) delivered\n`);
      } else if (response.data.totalRecipients === 0) {
        console.log('❌ PROBLEM: Backend found 0 recipients!');
        console.log('   Reason: ALL users with FCM tokens are INACTIVE');
        console.log('   Solution: Run this SQL:');
        console.log('   ');
        console.log('   UPDATE users SET is_active = TRUE');
        console.log('   WHERE id IN (');
        console.log('     SELECT DISTINCT user_id FROM user_fcm_tokens');
        console.log('     WHERE is_active = TRUE');
        console.log('   );\n');
      } else if (response.data.totalRecipients > 0 && response.data.sentCount === 0) {
        console.log('⚠️  PROBLEM: Backend found recipients but sent 0!');
        console.log('   Possible reasons:');
        console.log('   1. Users are inactive (not included in target list)');
        console.log('   2. FCM tokens failed (mismatch error)');
        console.log('   Check server console for FCM errors!\n');
      }

      // Show user status details
      if (inactiveUsers.length > 0) {
        console.log('════════════════════════════════════════════════════');
        console.log('⚠️  INACTIVE USERS WITH TOKENS:');
        console.log('════════════════════════════════════════════════════\n');
        for (const user of inactiveUsers) {
          console.log(`User: ${user.name_with_initials} (ID: ${user.user_id})`);
          console.log(`  Token ID: ${user.token_id}`);
          console.log(`  Status: INACTIVE (excluded from notifications)`);
          console.log(`  Token: ${user.fcm_token.substring(0, 40)}...`);
          console.log('');
        }
        console.log('To activate these users, run:');
        console.log(`UPDATE users SET is_active = TRUE WHERE id IN (${inactiveUsers.map(u => u.user_id).join(',')});\n`);
      }

    } catch (error) {
      console.log(`❌ BACKEND API FAILED!`);
      console.log(`   Error: ${error.response?.data?.message || error.message}\n`);
    }

    console.log('════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed.\n');
    }
  }
}

testFullFlow();
