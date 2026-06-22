/**
 * Test: Send a WhatsApp video message followed by an interactive list (menu) message.
 *
 * WhatsApp doesn't support video + buttons in the same bubble — so we:
 *   Step 1: Upload video to Meta Media API
 *   Step 2: Send video message (with caption)
 *   Step 3: Send interactive list message with menu buttons (Thanks, Learn More, Contact Us)
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/test-whatsapp-video-menu.ts
 */

import { config } from 'dotenv';
config();

import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FormDataNode = require('form-data');

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN!;
const TO_NUMBER       = '94779550317';
const API_VERSION     = 'v21.0';
const BASE            = `https://graph.facebook.com/${API_VERSION}`;

const IMAGE_URL = 'https://cdn.pixabay.com/photo/2017/08/14/21/23/nature-2642043_1280.jpg';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiPost(urlPath: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${BASE}${urlPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function downloadToTemp(url: string, filename: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), filename);
  await new Promise<void>((resolve, reject) => {
    const file = fs.createWriteStream(tmpPath);
    https.get(url, res => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
  return tmpPath;
}

async function uploadToMeta(filePath: string, mimeType: string): Promise<string> {
  const fd = new FormDataNode();
  fd.append('messaging_product', 'whatsapp');
  fd.append('type', mimeType);
  fd.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: mimeType,
    knownLength: fs.statSync(filePath).size,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: `/${API_VERSION}/${PHONE_NUMBER_ID}/media`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        ...fd.getHeaders(),
      },
    }, res => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => {
        const data = JSON.parse(body) as any;
        if (data.id) resolve(data.id as string);
        else reject(new Error(`Media upload failed: ${body}`));
      });
    });
    req.on('error', reject);
    fd.pipe(req);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n📹  TEST: Video message + Interactive menu\n');

  // Step 1 — upload image to Meta
  console.log('⬆️   Step 1: Downloading & uploading image to Meta...');
  const tmpImg = await downloadToTemp(IMAGE_URL, 'header_image.jpg');
  console.log(`    File size: ${(fs.statSync(tmpImg).size / 1024).toFixed(1)} KB`);
  const imageMediaId = await uploadToMeta(tmpImg, 'image/jpeg');
  console.log(`✅  Image media_id: ${imageMediaId}`);

  // Step 2 — single interactive message: image header + body + 3 reply buttons
  console.log(`\n📨  Step 2: Sending image + buttons to +${TO_NUMBER}...`);
  const result = await apiPost(`/${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to: TO_NUMBER,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'image',
        image: { id: imageMediaId },
      },
      body: {
        text: '🎓 Welcome to Suraksha LMS — the smart way to manage your institute!\n\nTap a button to reply 👇',
      },
      footer: {
        text: 'Suraksha LMS · suraksha.lk',
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'btn_thanks',  title: '🙏 Thanks!' } },
          { type: 'reply', reply: { id: 'btn_learn',   title: '📖 Learn More' } },
          { type: 'reply', reply: { id: 'btn_contact', title: '📞 Contact Us' } },
        ],
      },
    },
  });

  if (result.messages?.[0]?.id) {
    console.log('✅  Sent!');
    console.log(`    Message ID: ${result.messages[0].id}`);
    console.log('    Single bubble: image header + body text + 3 reply buttons');
  } else {
    console.error('❌  Send failed:', JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
