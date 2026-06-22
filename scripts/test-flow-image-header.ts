/**
 * Test: Flow with image header.
 * Sends the registration flow with an image in the message bubble header.
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/test-flow-image-header.ts
 */

import { config } from 'dotenv';
config();

const BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!;
const PHONE_NUMBER_ID      = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN         = process.env.WHATSAPP_ACCESS_TOKEN!;
const TO_NUMBER            = '94779550317';
const API_VERSION          = 'v21.0';
const BASE                 = `https://graph.facebook.com/${API_VERSION}`;
const IMAGE_URL            = 'https://cdn.pixabay.com/photo/2017/08/14/21/23/nature-2642043_1280.jpg';
// Meta requires media uploaded via Media API — direct URL links are unreliable.
// Use uploadMediaFromUrl() to get a media ID, then reference by id: not link:

const FLOW_JSON = {
  version: '7.3',
  screens: [
    {
      id: 'JOIN_NOW',
      title: 'Join Now',
      data: {},
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Form',
            name: 'form',
            children: [
              { type: 'TextSubheading', text: 'Get early access to our Mega Sales Day deals. Register now!' },
              { type: 'TextInput', name: 'name', label: 'Name', 'input-type': 'text', required: true },
              { type: 'TextInput', name: 'email', label: 'Email', 'input-type': 'email', required: true },
              {
                type: 'OptIn', label: 'I agree to the terms.', required: true, name: 'tos_optin',
                'on-click-action': { name: 'navigate', payload: {}, next: { name: 'TERMS_AND_CONDITIONS', type: 'screen' } },
              },
              { type: 'OptIn', label: 'Keep me up to date about offers and promotions', name: 'marketing_optin' },
              {
                type: 'Footer', label: 'Continue',
                'on-click-action': {
                  name: 'navigate',
                  next: { type: 'screen', name: 'CATEGORIES' },
                  payload: {
                    name: '${form.name}', email: '${form.email}',
                    tos_optin: '${form.tos_optin}', marketing_optin: '${form.marketing_optin}',
                  },
                },
              },
            ],
          },
        ],
      },
    },
    {
      id: 'CATEGORIES',
      title: 'Join now',
      data: {
        name:            { type: 'string',  __example__: 'Example' },
        email:           { type: 'string',  __example__: 'Example' },
        tos_optin:       { type: 'boolean', __example__: false },
        marketing_optin: { type: 'boolean', __example__: false },
      },
      terminal: true,
      success: true,
      layout: {
        type: 'SingleColumnLayout',
        children: [
          {
            type: 'Form',
            name: 'form',
            children: [
              { type: 'TextSubheading', text: 'Let us know which category you are interested in?' },
              {
                type: 'CheckboxGroup', label: 'Select categories', required: true, name: 'categories',
                'data-source': [
                  { id: 'mobile_phones', title: 'Mobile phones' },
                  { id: 'televisions',   title: 'Televisions' },
                  { id: 'home_audio',    title: 'Home audio' },
                  { id: 'headphones',    title: 'Headphones & earphones' },
                  { id: 'ebook_readers', title: 'eBook readers' },
                  { id: 'cameras',       title: 'Cameras' },
                  { id: 'accessories',   title: 'Accessories' },
                ],
              },
              {
                type: 'Footer', label: 'Confirm',
                'on-click-action': {
                  name: 'complete',
                  payload: {
                    name: '${data.name}', email: '${data.email}',
                    tos_optin: '${data.tos_optin}', marketing_optin: '${data.marketing_optin}',
                    categories: '${form.categories}',
                  },
                },
              },
            ],
          },
        ],
      },
    },
    {
      id: 'TERMS_AND_CONDITIONS',
      title: 'Terms and conditions',
      data: {},
      layout: {
        type: 'SingleColumnLayout',
        children: [
          { type: 'TextHeading',    text: 'Our Terms' },
          { type: 'TextSubheading', text: 'Data usage' },
          { type: 'TextBody',       text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vitae odio dui. Praesent ut nulla tincidunt, scelerisque augue malesuada, volutpat lorem.' },
          { type: 'TextSubheading', text: 'Privacy policy' },
          { type: 'TextBody',       text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vitae odio dui. Praesent ut nulla tincidunt, scelerisque augue malesuada, volutpat lorem.' },
        ],
      },
    },
  ],
};

import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FormDataNode = require('form-data');

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
    https.get(url, res => { res.pipe(file); file.on('finish', () => { file.close(); resolve(); }); }).on('error', reject);
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
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, ...fd.getHeaders() },
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

async function uploadFlowJson(flowId: string, flowJson: object): Promise<void> {
  const fd = new FormDataNode();
  fd.append('file', Buffer.from(JSON.stringify(flowJson)), { filename: 'flow.json', contentType: 'application/json' });
  fd.append('asset_type', 'FLOW_JSON');
  fd.append('name', 'flow.json');
  const res = await fetch(`${BASE}/${flowId}/assets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, ...fd.getHeaders() },
    body: fd,
  });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Flow JSON upload failed: ${JSON.stringify(data)}`);
}

async function main(): Promise<void> {
  console.log('\n🖼️  TEST: Flow with image header\n');

  // Step 1 — upload image to Meta
  console.log('⬆️   Step 1: Downloading & uploading image to Meta...');
  const tmpImg = await downloadToTemp(IMAGE_URL, 'header_image.jpg');
  const imageMediaId = await uploadToMeta(tmpImg, 'image/jpeg');
  console.log(`✅  Image uploaded — media_id: ${imageMediaId}`);

  // Step 2 — create flow
  console.log('📋  Step 2: Creating flow...');
  const createResult = await apiPost(`/${BUSINESS_ACCOUNT_ID}/flows`, {
    name: `Mega Sales Image Test ${Date.now()}`,
    categories: ['SIGN_UP'],
  });
  if (!createResult.id) { console.error('❌  Create failed:', JSON.stringify(createResult, null, 2)); process.exit(1); }
  const flowId: string = createResult.id;
  console.log(`✅  Flow created — flow_id: ${flowId}`);

  // Step 3 — upload flow JSON
  console.log('📤  Step 3: Uploading flow JSON...');
  await uploadFlowJson(flowId, FLOW_JSON);
  console.log('✅  Flow JSON uploaded');

  // Step 4 — send with image header using media ID
  console.log(`📨  Step 4: Sending flow with image header to +${TO_NUMBER}...`);
  const sendResult = await apiPost(`/${PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to: TO_NUMBER,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: {
        type: 'image',
        image: { id: imageMediaId },
      },
      body:   { text: 'Register to get early access to our exclusive deals!' },
      footer: { text: 'Tap below to join' },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_action: 'navigate',
          flow_token: `img-test-${Date.now()}`,
          flow_id: flowId,
          flow_cta: 'Join Now',
          mode: 'draft',
          flow_action_payload: { screen: 'JOIN_NOW' },
        },
      },
    },
  });

  if (sendResult.messages?.[0]?.id) {
    console.log('✅  Sent!');
    console.log(`    Message ID : ${sendResult.messages[0].id}`);
    console.log(`    Flow ID    : ${flowId}`);
  } else {
    console.error('❌  Send failed:', JSON.stringify(sendResult, null, 2));
    process.exit(1);
  }
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
