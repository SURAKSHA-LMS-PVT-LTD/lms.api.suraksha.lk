/**
 * Test SMS Message Sending
 * Sends sample attendance notifications with advertisements to test number
 * 
 * Usage: node test-sms-message.js
 */

const https = require('https');
const testNumber = '94779550317'; // Your test number

// Sample SMS messages
const samples = [
  {
    title: 'TRANSPORT - Present (Boarded Bus) with Ad',
    message: `ADVERTISEMENT
School Supplies Sale!

Get 50% off on all school bags, stationery, and uniforms this week only! Visit our store or shop online.

Visit: https://shop.com/sale

---

Your child Sarah Johnson boarded School Bus #12 at 08:30 AM on 2025-11-29.

---
Suraksha LMS | Royal College`
  },
  {
    title: 'INSTITUTE - Absent with Ad',
    message: `ADVERTISEMENT
Online Tutoring Classes

Expert teachers available for Math, Science, and English. Free trial class available!

Visit: https://tutoring.com/classes

---

Your child Michael Chen was absent from Trinity College at 09:00 AM on 2025-11-29.

---
Suraksha LMS | Trinity College`
  },
  {
    title: 'INSTITUTE - Arrived (No Ad)',
    message: `Your child Emma Williams arrived at Gateway Academy at 07:45 AM on 2025-11-29.

---
Suraksha LMS | Gateway Academy`
  }
];

// SMS Provider Configuration (SMSlenz)
const SMSLENZ_USER_ID = process.env.SMSLENZ_USER_ID;
const SMSLENZ_API_KEY = process.env.SMSLENZ_API_KEY;
const SMSLENZ_SENDER_ID = process.env.SMSLENZ_SENDER_ID || 'SMSlenzDEMO';

async function sendSMS(recipientNumber, message) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      user_id: SMSLENZ_USER_ID,
      api_key: SMSLENZ_API_KEY,
      sender_id: SMSLENZ_SENDER_ID,
      contact: recipientNumber,
      message: message
    });

    const options = {
      hostname: 'smslenz.lk',
      port: 443,
      path: '/api/send-sms',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ success: true, data: { response: data } });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('📱 Sending SMS Test Messages to', testNumber);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (!SMSLENZ_USER_ID || !SMSLENZ_API_KEY) {
    console.error('❌ Error: SMSLENZ_USER_ID and SMSLENZ_API_KEY environment variables are required');
    console.log('\nUsage:');
    console.log('$env:SMSLENZ_USER_ID="your_user_id"');
    console.log('$env:SMSLENZ_API_KEY="your_api_key"');
    console.log('$env:SMSLENZ_SENDER_ID="your_sender_id"  # Optional');
    console.log('node test-sms-message.js\n');
    process.exit(1);
  }

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    console.log(`📤 Sending Sample ${i + 1}: ${sample.title}...`);
    
    try {
      const result = await sendSMS(testNumber, sample.message);
      
      if (result.status === 'success' || result.data?.status === 'success') {
        console.log(`✅ SMS sent successfully! Campaign ID: ${result.data?.campaign_id || 'N/A'}`);
      } else {
        console.log(`❌ SMS failed:`, result);
      }
    } catch (error) {
      console.error(`❌ Error sending SMS:`, error.message);
    }
    
    console.log('');
    
    // Wait 2 seconds between messages to avoid rate limiting
    if (i < samples.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All SMS samples sent! Check your phone:', testNumber);
}

runTests().catch(console.error);
