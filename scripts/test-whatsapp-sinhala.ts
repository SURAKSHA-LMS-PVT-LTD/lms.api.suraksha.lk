/**
 * Test: Sinhala attendance messages — all 4 ad modes.
 *
 * Architecture:
 *   No ad      → plain text + "🙏 Thanks!" button
 *   Image ad   → single bubble: image header + caption (attendance + ad) + "🙏 Thanks!" button
 *   Video ad   → video bubble (caption = ad text) → plain text attendance (no button)
 *   PDF ad     → document bubble (caption = ad text) → plain text attendance (no button)
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/test-whatsapp-sinhala.ts
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

// ─── Sinhala attendance text ──────────────────────────────────────────────────

const ATTENDANCE_EN =
  `✅ *Attendance Update*\n\n` +
  `Your child *Kaveesha* arrived at *Grade 10 - Science* at Suraksha Academy at 8:05 AM on June 22, 2026.\n\n` +
  `_Suraksha LMS · suraksha.lk_`;

const ATTENDANCE_SI =
  `✅ *පැමිණීම් යාවත්කාලීන කිරීම*\n\n` +
  `ඔබගේ දරුවා *කවීෂා* ජූනි 22, 2026 දින පෙ.ව. 8:05 ට *10 ශ්‍රේණිය - විද්‍යාව* (සුරක්‍ෂා ඇකඩමිය) වෙත පැමිණියා.\n\n` +
  `_Suraksha LMS · suraksha.lk_`;

const AD_TEXT_EN =
  `\n━━━━━━━━━━━━━━━━━━━━\n` +
  `*Summer Special Offer!*\n` +
  `Enroll now and get 30% off all courses.\n` +
  `🔗 https://suraksha.lk/offer`;

const AD_TEXT_SI =
  `\n━━━━━━━━━━━━━━━━━━━━\n` +
  `*ගිම්හාන විශේෂ දීමනාව!*\n` +
  `දැන් ලියාපදිංචි වී සියලු පාඨමාලා 30% ක් ලාභ ගන්න.\n` +
  `🔗 https://suraksha.lk/offer`;

const WARNING_SI =
  `\n\n⚠️ _ඔබ Thanks මත ටච් කිරීමෙන් නොමිලේ මෙවැනි ඉදිරි දැනුම් දීම් ලබා ගත හැක. එසේ නොකිරීමෙන් මෙවැනි පණිවිඩ ඔබ අංකයට දැනුම් දීම් ස්වංක්‍රීයව අත්හිටවෙනු ඇත._`;

const WARNING_EN =
  `\n\n⚠️ _Tap Thanks to keep receiving free attendance updates._`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function download(url: string, filename: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `wa_si_${Date.now()}_${filename}`);
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
  process.stdout.write(`   Downloading & uploading ${filename}... `);
  const tmp = await download(url, filename);
  const id = await uploadToMeta(tmp, mime);
  fs.unlink(tmp, () => {});
  process.stdout.write(`media_id: ${id}\n`);
  return id;
}

async function post(body: Record<string, any>): Promise<any> {
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: TO, ...body }),
  });
  return res.json();
}

function ok(r: any, label: string): void {
  console.log(r.messages?.[0]?.id
    ? `   ✅ ${label}: ${r.messages[0].id}`
    : `   ❌ ${label}: ${JSON.stringify(r.error)}`);
}

async function gap(): Promise<void> {
  await new Promise(r => setTimeout(r, 1500));
}

// ─── Send helpers per mode ────────────────────────────────────────────────────

/** No ad — attendance + Thanks button (EN then SI) */
async function sendNoAd(): Promise<void> {
  await sendButtonAttendance({ lang: 'EN', attendanceText: ATTENDANCE_EN, adText: '', warning: WARNING_EN });
  await sendButtonAttendance({ lang: 'SI', attendanceText: ATTENDANCE_SI, adText: '', warning: WARNING_SI });
}

/** Image ad — image header + attendance + ad text + button (EN then SI, same image reused) */
async function sendImageAd(imageId: string): Promise<void> {
  await sendButtonAttendance({ lang: 'EN', attendanceText: ATTENDANCE_EN, adText: AD_TEXT_EN, warning: WARNING_EN, imageId });
  await sendButtonAttendance({ lang: 'SI', attendanceText: ATTENDANCE_SI, adText: AD_TEXT_SI, warning: WARNING_SI, imageId });
}

/** Video ad — video bubble (ad caption) → attendance + Thanks button (EN + SI) */
async function sendVideoAd(videoId: string): Promise<void> {
  const adCaption = AD_TEXT_EN.trim(); // ad text as-is for video caption
  const rv = await post({ type: 'video', video: { id: videoId, caption: adCaption } });
  ok(rv, `Video ad bubble`);
  await gap();
  // Attendance button — EN then SI
  await sendButtonAttendance({ lang: 'EN', attendanceText: ATTENDANCE_EN, adText: '', warning: WARNING_EN });
  await sendButtonAttendance({ lang: 'SI', attendanceText: ATTENDANCE_SI, adText: '', warning: WARNING_SI });
}

/** PDF ad — document bubble (ad caption) → attendance + Thanks button (EN + SI) */
async function sendPdfAd(pdfId: string): Promise<void> {
  const adCaption = AD_TEXT_EN.trim();
  const rd = await post({ type: 'document', document: { id: pdfId, caption: adCaption, filename: 'Suraksha_Info.pdf' } });
  ok(rd, `PDF ad bubble`);
  await gap();
  // Attendance button — EN then SI
  await sendButtonAttendance({ lang: 'EN', attendanceText: ATTENDANCE_EN, adText: '', warning: WARNING_EN });
  await sendButtonAttendance({ lang: 'SI', attendanceText: ATTENDANCE_SI, adText: '', warning: WARNING_SI });
}

async function sendButtonAttendance(opts: { lang: string; attendanceText: string; adText: string; warning: string; imageId?: string }): Promise<void> {
  const header = opts.imageId
    ? { type: 'image', image: { id: opts.imageId } }
    : { type: 'text', text: 'Suraksha Academy' };
  const bodyText = opts.attendanceText + opts.adText + opts.warning;
  const r = await post({
    type: 'interactive',
    interactive: {
      type: 'button',
      header,
      body:   { text: bodyText },
      footer: { text: 'Suraksha LMS · suraksha.lk' },
      action: { buttons: [{ type: 'reply', reply: { id: 'attendance_thanks', title: '🙏 Thanks!' } }] },
    },
  });
  ok(r, `Button (${opts.lang})`);
  await gap();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🇱🇰  Sinhala + English attendance notification test\n');

  // ── Mode 1: No ad ──────────────────────────────────────────────────────────
  console.log('━━━  Mode 1: No advertisement  ━━━');
  await sendNoAd();

  // ── Mode 2: Image ad ───────────────────────────────────────────────────────
  console.log('\n━━━  Mode 2: Image advertisement  ━━━');
  const imageId = await prepare(IMAGE_URL, 'ad.jpg', 'image/jpeg');
  await sendImageAd(imageId);

  // ── Mode 3: Video ad ───────────────────────────────────────────────────────
  console.log('\n━━━  Mode 3: Video advertisement  ━━━');
  const videoId = await prepare(VIDEO_URL, 'ad.mp4', 'video/mp4');
  await sendVideoAd(videoId);

  // ── Mode 4: PDF ad ─────────────────────────────────────────────────────────
  console.log('\n━━━  Mode 4: PDF advertisement  ━━━');
  const pdfId = await prepare(PDF_URL, 'ad.pdf', 'application/pdf');
  await sendPdfAd(pdfId);

  console.log('\n✅  All done.\n');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
