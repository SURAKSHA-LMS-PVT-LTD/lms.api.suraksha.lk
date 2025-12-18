/**
 * Test WhatsApp Session Message Sending
 * Sends sample attendance notifications with advertisements to test number
 * 
 * Usage: node test-whatsapp-session-message.js
 */

const testNumber = '94779550317'; // Your test number

// Sample 1: TRANSPORT Attendance - Present (boarded bus) with Image Ad
const sample1 = {
  messaging_product: 'whatsapp',
  to: testNumber,
  type: 'image',
  image: {
    link: 'https://images.unsplash.com/photo-1501504905252-473c47e087f8?w=800',
    caption: `*ADVERTISEMENT*
School Supplies Sale!

Get 50% off on all school bags, stationery, and uniforms this week only! Visit our store or shop online.

Visit: https://shop.com/sale?utm_source=whatsapp

━━━━━━━━━━━━━━━━━━━━

Your child *Sarah Johnson* boarded School Bus #12 at 08:30 AM on 2025-11-29.

━━━━━━━━━━━━━━━━━━━━

_If you require further updates within the next 24 hours, please reply or react to this message._`
  }
};

// Sample 2: INSTITUTE Attendance - Absent with Video Ad
const sample2 = {
  messaging_product: 'whatsapp',
  to: testNumber,
  type: 'video',
  video: {
    link: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    caption: `*ADVERTISEMENT*
Online Tutoring Classes

Expert teachers available for Math, Science, and English. Free trial class available! Watch our video to learn more.

Visit: https://tutoring.com/classes?ref=whatsapp

━━━━━━━━━━━━━━━━━━━━

Your child *Michael Chen* was absent from Trinity College at 08:30 AM on 2025-11-29.

━━━━━━━━━━━━━━━━━━━━

_If you require further updates within the next 24 hours, please reply or react to this message._`
  }
};

// Sample 3: INSTITUTE Attendance - Present (arrived at school), no ad
const sample3 = {
  messaging_product: 'whatsapp',
  to: testNumber,
  type: 'text',
  text: {
    body: `Your child *David Silva* arrived at St. Thomas College at 08:35 AM on 2025-11-29.

━━━━━━━━━━━━━━━━━━━━

_If you require further updates within the next 24 hours, please reply or react to this message._`
  }
};

async function sendWhatsAppMessage(messageData) {
  const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
  const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.error('❌ WhatsApp credentials not configured!');
    console.error('Please set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env');
    return;
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messageData)
      }
    );

    const result = await response.json();

    if (response.ok && result.messages) {
      console.log(`✅ Message sent successfully! ID: ${result.messages[0].id}`);
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
  console.log('📱 Sending WhatsApp Session Message Samples to', testNumber);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('\n📤 Sending Sample 1: TRANSPORT - Boarded bus (Image Ad)...');
  await sendWhatsAppMessage(sample1);
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

  console.log('\n📤 Sending Sample 2: INSTITUTE - Absent from school (Video Ad)...');
  await sendWhatsAppMessage(sample2);
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

  console.log('\n📤 Sending Sample 3: INSTITUTE - Arrived at school (No Ad)...');
  await sendWhatsAppMessage(sample3);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All samples sent! Check WhatsApp on', testNumber);
}

// Run the test
sendAllSamples().catch(console.error);
