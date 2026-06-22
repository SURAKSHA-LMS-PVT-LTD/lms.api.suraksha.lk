/**
 * Test: Attendance WhatsApp notification — new interactive button format.
 *
 * Sends four variants back-to-back:
 *   1) No ad (plain attendance)
 *   2) Ad with image  (image header + button)
 *   3) Ad with video  (video first → then button message)
 *   4) Ad with PDF    (document first via Meta upload → then button message)
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/test-attendance-whatsapp.ts
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
const BASE_URL        = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

const IMAGE_URL = 'https://cdn.pixabay.com/photo/2017/08/14/21/23/nature-2642043_1280.jpg';
const VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';
// Small public PDF for testing
const PDF_URL   = 'https://www.w3.org/WAI/WCAG21/wcag21.pdf';

async function post(body: Record<string, any>): Promise<any> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: TO, ...body }),
  });
  return res.json();
}

/** Download any URL (http or https) to OS temp dir, return local path. */
function downloadToTemp(url: string, filename: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), filename);
  const protocol = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpPath);
    protocol.get(url, res => {
      // Follow redirects (301/302)
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        file.close();
        downloadToTemp(res.headers.location, filename).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(tmpPath); });
    }).on('error', reject);
  });
}

/** Upload a local file to Meta Media API, return media_id. */
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
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => {
        const data = JSON.parse(body) as any;
        if (data.id) resolve(data.id as string);
        else reject(new Error(`Meta upload failed: ${body}`));
      });
    });
    req.on('error', reject);
    fd.pipe(req);
  });
}

async function sendInteractiveAttendance(opts: {
  instituteName: string;
  attendanceText: string;
  adText: string;
  adImageUrl?: string;
  adVideoUrl?: string;
  adDocUrl?: string;
}): Promise<void> {
  // If video ad — upload to Meta first, then send as separate bubble
  if (opts.adVideoUrl) {
    console.log('   → Downloading & uploading ad video to Meta...');
    const tmp = await downloadToTemp(opts.adVideoUrl, 'ad_video.mp4');
    console.log(`     File: ${(fs.statSync(tmp).size / 1024).toFixed(1)} KB`);
    const mediaId = await uploadToMeta(tmp, 'video/mp4');
    console.log(`     media_id: ${mediaId}`);
    const vr = await post({ type: 'video', video: { id: mediaId, caption: 'Advertisement' } });
    console.log(`   ${vr.messages?.[0]?.id ? '✅' : '❌'} Video bubble: ${vr.messages?.[0]?.id ?? JSON.stringify(vr.error)}`);
  }

  // If PDF/document ad — upload to Meta first, then send as separate bubble
  if (opts.adDocUrl) {
    console.log('   → Downloading & uploading ad PDF to Meta...');
    const tmp = await downloadToTemp(opts.adDocUrl, 'ad_document.pdf');
    console.log(`     File: ${(fs.statSync(tmp).size / 1024).toFixed(1)} KB`);
    const mediaId = await uploadToMeta(tmp, 'application/pdf');
    console.log(`     media_id: ${mediaId}`);
    const dr = await post({ type: 'document', document: { id: mediaId, caption: 'Advertisement', filename: 'ad.pdf' } });
    console.log(`   ${dr.messages?.[0]?.id ? '✅' : '❌'} Document bubble: ${dr.messages?.[0]?.id ?? JSON.stringify(dr.error)}`);
  }

  // Build body text
  const warningText = `\n\n⚠️ _If you don't tap Thanks below, your future attendance notifications may stop._`;
  const bodyText = opts.attendanceText + opts.adText + warningText;

  // Image header — upload to Meta first (link: is unreliable)
  let header: Record<string, any>;
  if (opts.adImageUrl) {
    console.log('   → Downloading & uploading header image to Meta...');
    const tmp = await downloadToTemp(opts.adImageUrl, 'ad_image.jpg');
    const mediaId = await uploadToMeta(tmp, 'image/jpeg');
    console.log(`     media_id: ${mediaId}`);
    header = { type: 'image', image: { id: mediaId } };
  } else {
    header = { type: 'text', text: opts.instituteName };
  }

  const interactive = {
    type: 'button',
    header,
    body:   { text: bodyText },
    footer: { text: opts.instituteName },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'attendance_thanks', title: '🙏 Thanks!' } },
      ],
    },
  };

  console.log('   → Sending interactive button message...');
  const r = await post({ type: 'interactive', interactive });
  if (r.messages?.[0]?.id) {
    console.log(`   ✅ Sent — message ID: ${r.messages[0].id}`);
  } else {
    console.error(`   ❌ Failed: ${JSON.stringify(r.error ?? r)}`);
  }
}

async function main(): Promise<void> {
  console.log('\n📋  Attendance WhatsApp notification test\n');

  // ── Test 1: No ad ─────────────────────────────────────────────────────────
  console.log('━━━  Test 1: No advertisement  ━━━');
  await sendInteractiveAttendance({
    instituteName: 'Suraksha Academy',
    attendanceText: `Your child *Kaveesha* arrived at *Grade 10 - Science* at Suraksha Academy at 8:05 AM on June 22, 2026.`,
    adText: '',
  });

  await new Promise(r => setTimeout(r, 1500));

  // ── Test 2: Image ad ──────────────────────────────────────────────────────
  console.log('\n━━━  Test 2: Image advertisement  ━━━');
  await sendInteractiveAttendance({
    instituteName: 'Suraksha Academy',
    attendanceText: `Your child *Kaveesha* was absent from *Grade 10 - Science* at Suraksha Academy at 8:05 AM on June 22, 2026.`,
    adText: `\n\n━━━━━━━━━━━━━━━━━━━━\n*Summer Special Offer!*\nEnroll now and get 30% off all courses this month.\n🔗 https://suraksha.lk/offer`,
    adImageUrl: IMAGE_URL,
  });

  await new Promise(r => setTimeout(r, 1500));

  // ── Test 3: Video ad ──────────────────────────────────────────────────────
  console.log('\n━━━  Test 3: Video advertisement  ━━━');
  await sendInteractiveAttendance({
    instituteName: 'Suraksha Academy',
    attendanceText: `Your child *Kaveesha* boarded Sunrise Transport (ABC-1234) at 7:45 AM on June 22, 2026.`,
    adText: `\n\n━━━━━━━━━━━━━━━━━━━━\n*Watch: New Features in Suraksha LMS*\nSee what's new this semester!\n🔗 https://suraksha.lk/features`,
    adVideoUrl: VIDEO_URL,
  });

  await new Promise(r => setTimeout(r, 1500));

  // ── Test 4: PDF ad ────────────────────────────────────────────────────────
  console.log('\n━━━  Test 4: PDF advertisement  ━━━');
  await sendInteractiveAttendance({
    instituteName: 'Suraksha Academy',
    attendanceText: `Your child *Kaveesha* arrived at *Grade 10 - Science* at Suraksha Academy at 8:05 AM on June 22, 2026.`,
    adText: `\n\n━━━━━━━━━━━━━━━━━━━━\n*Download Our Course Brochure*\nEverything you need to know about our programs.\n🔗 https://suraksha.lk/brochure`,
    adDocUrl: PDF_URL,
  });

  console.log('\n✅  All tests complete.\n');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
