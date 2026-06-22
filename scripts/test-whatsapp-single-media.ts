/**
 * Test: Can WhatsApp send image / video / PDF as a single message with caption?
 * All media uploaded to Meta first (link: is unreliable).
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/test-whatsapp-single-media.ts
 */

import { config } from 'dotenv';
config();

import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FormDataNode = require('form-data');

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN!;
const TO              = '94779550317';
const API_VERSION     = 'v21.0';

const IMAGE_URL = 'https://cdn.pixabay.com/photo/2017/08/14/21/23/nature-2642043_1280.jpg';
const VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';
const PDF_URL   = 'https://www.w3.org/WAI/WCAG21/wcag21.pdf';

const CAPTION =
  `✅ Attendance Update\n\n` +
  `Your child *Kaveesha* arrived at *Grade 10 - Science* at Suraksha Academy at 8:05 AM on June 22, 2026.\n\n` +
  `━━━━━━━━━━━━━━━━━━━━\n` +
  `*Summer Special Offer!*\n` +
  `Enroll now and get 30% off all courses.\n` +
  `🔗 https://suraksha.lk/offer`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function download(url: string, filename: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `wa_test_${Date.now()}_${filename}`);
  const protocol = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpPath);
    protocol.get(url, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        file.close();
        download(res.headers.location, filename).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(tmpPath); });
    }).on('error', reject);
  });
}

function uploadToMeta(filePath: string, mimeType: string): Promise<string> {
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
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, ...fd.getHeaders() },
    }, res => {
      let body = '';
      res.on('data', (c: Buffer) => { body += c.toString(); });
      res.on('end', () => {
        const d = JSON.parse(body) as any;
        d.id ? resolve(d.id) : reject(new Error(`Upload failed: ${body}`));
      });
    });
    req.on('error', reject);
    fd.pipe(req);
  });
}

async function prepare(url: string, filename: string, mime: string): Promise<string> {
  console.log(`   Downloading ${filename}...`);
  const tmp = await download(url, filename);
  console.log(`   Uploading to Meta (${(fs.statSync(tmp).size / 1024).toFixed(1)} KB)...`);
  const id = await uploadToMeta(tmp, mime);
  fs.unlink(tmp, () => {});
  console.log(`   media_id: ${id}`);
  return id;
}

async function send(body: Record<string, any>): Promise<any> {
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: TO, ...body }),
  });
  return res.json();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🧪  Single-message media test (no buttons)\n');

  // ── Test 1: Image + caption ───────────────────────────────────────────────
  console.log('━━━  Test 1: image + caption  ━━━');
  const imageId = await prepare(IMAGE_URL, 'test.jpg', 'image/jpeg');
  const r1 = await send({ type: 'image', image: { id: imageId, caption: CAPTION } });
  console.log(r1.messages?.[0]?.id
    ? `✅ Sent — ${r1.messages[0].id}`
    : `❌ Failed — ${JSON.stringify(r1.error)}`);

  await new Promise(r => setTimeout(r, 1500));

  // ── Test 2: Video + caption ───────────────────────────────────────────────
  console.log('\n━━━  Test 2: video + caption  ━━━');
  const videoId = await prepare(VIDEO_URL, 'test.mp4', 'video/mp4');
  const r2 = await send({ type: 'video', video: { id: videoId, caption: CAPTION } });
  console.log(r2.messages?.[0]?.id
    ? `✅ Sent — ${r2.messages[0].id}`
    : `❌ Failed — ${JSON.stringify(r2.error)}`);

  await new Promise(r => setTimeout(r, 1500));

  // ── Test 3: PDF + caption ─────────────────────────────────────────────────
  console.log('\n━━━  Test 3: PDF + caption  ━━━');
  const pdfId = await prepare(PDF_URL, 'test.pdf', 'application/pdf');
  const r3 = await send({ type: 'document', document: { id: pdfId, caption: CAPTION, filename: 'Suraksha_Info.pdf' } });
  console.log(r3.messages?.[0]?.id
    ? `✅ Sent — ${r3.messages[0].id}`
    : `❌ Failed — ${JSON.stringify(r3.error)}`);

  console.log('\n✅  Done.\n');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
