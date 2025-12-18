/**
 * Test Telegram Session Message Sending
 * Sends sample attendance notifications with advertisements to test number
 * 
 * Usage: node test-telegram-session-message.js
 */

// NOTE: Replace with actual Telegram chat ID
// To get your chat ID, message @userinfobot on Telegram
const testChatId = 'YOUR_TELEGRAM_CHAT_ID'; // Update this!

// Sample 1: TRANSPORT Attendance - Present (boarded bus) with Image Ad
const sample1 = {
  chat_id: testChatId,
  photo: 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=800',
  caption: `<b>ADVERTISEMENT</b>
School Supplies Sale!

Get 50% off on all school bags, stationery, and uniforms this week only! Visit our store or shop online.

Visit: https://shop.com/sale?utm_source=telegram

━━━━━━━━━━━━━━━━━━━━

Your child <b>Sarah Johnson</b> boarded School Bus #12 at 08:30 AM on 2025-11-29.

━━━━━━━━━━━━━━━━━━━━

<i>If you require further updates within the next 24 hours, please reply or react to this message.</i>

<i>Suraksha LMS | Royal College</i>`,
  parse_mode: 'HTML'
};

// Sample 2: INSTITUTE Attendance - Absent with Video Ad
const sample2 = {
  chat_id: testChatId,
  video: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  caption: `<b>ADVERTISEMENT</b>
Online Tutoring Classes

Expert teachers available for Math, Science, and English. Free trial class available! Watch our video to learn more.

Visit: https://tutoring.com/classes?ref=telegram

━━━━━━━━━━━━━━━━━━━━

Your child <b>Michael Chen</b> was absent from Trinity College at 08:30 AM on 2025-11-29.

━━━━━━━━━━━━━━━━━━━━

<i>If you require further updates within the next 24 hours, please reply or react to this message.</i>

<i>Suraksha LMS | Trinity College</i>`,
  parse_mode: 'HTML'
};

// Sample 3: INSTITUTE Attendance - Present (arrived at school), no ad
const sample3 = {
  chat_id: testChatId,
  text: `Your child <b>David Silva</b> arrived at St. Thomas College at 08:35 AM on 2025-11-29.

━━━━━━━━━━━━━━━━━━━━

<i>If you require further updates within the next 24 hours, please reply or react to this message.</i>

<i>Suraksha LMS | St. Thomas College</i>`,
  parse_mode: 'HTML'
};

async function sendTelegramMessage(endpoint, messageData) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

  if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ Telegram bot token not configured!');
    console.error('Please set TELEGRAM_BOT_TOKEN in .env');
    return;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messageData)
      }
    );

    const result = await response.json();

    if (result.ok) {
      console.log(`✅ Message sent successfully! ID: ${result.result.message_id}`);
      return true;
    } else {
      console.error('❌ Failed to send message:', result);
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending message:', error.message);
    return false;
  }
}

async function sendAllSamples() {
  if (testChatId === 'YOUR_TELEGRAM_CHAT_ID') {
    console.error('❌ Please update testChatId with your actual Telegram chat ID!');
    console.log('To get your chat ID:');
    console.log('1. Message @userinfobot on Telegram');
    console.log('2. Copy your chat ID');
    console.log('3. Update testChatId in this file');
    return;
  }

  console.log('📱 Sending Telegram Session Message Samples to chat ID:', testChatId);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('\n📤 Sending Sample 1: TRANSPORT - Boarded bus (Image Ad)...');
  await sendTelegramMessage('sendPhoto', sample1);
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

  console.log('\n📤 Sending Sample 2: INSTITUTE - Absent from school (Video Ad)...');
  await sendTelegramMessage('sendVideo', sample2);
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

  console.log('\n📤 Sending Sample 3: INSTITUTE - Arrived at school (No Ad)...');
  await sendTelegramMessage('sendMessage', sample3);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All samples sent! Check Telegram chat:', testChatId);
}

// Run the test
sendAllSamples().catch(console.error);
