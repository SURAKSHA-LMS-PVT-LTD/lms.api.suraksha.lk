/**
 * Test script: Create a WhatsApp Flow via the Flows API, then send it
 * as a session interactive message to +94779550317.
 *
 * Step 1 — Create the flow (POST /flows)  → get flow_id
 * Step 2 — Upload the flow JSON            → publish it as DRAFT
 * Step 3 — Send the interactive flow msg  → session message (free in 24h window)
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/test-whatsapp-flow.ts
 */

import { config } from 'dotenv';
config();

const BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!;
const PHONE_NUMBER_ID      = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN         = process.env.WHATSAPP_ACCESS_TOKEN!;
const TO_NUMBER            = '94779550317'; // no +
const API_VERSION          = 'v21.0';       // Flows API requires v21+
const BASE                 = `https://graph.facebook.com/${API_VERSION}`;

// ─── Flow JSON ────────────────────────────────────────────────────────────────

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
              {
                type: 'TextSubheading',
                text: 'Get early access to our Mega Sales Day deals. Register now!',
              },
              {
                type: 'TextInput',
                name: 'name',
                label: 'Name',
                'input-type': 'text',
                required: true,
              },
              {
                type: 'TextInput',
                label: 'Email',
                name: 'email',
                'input-type': 'email',
                required: true,
              },
              {
                type: 'OptIn',
                label: 'I agree to the terms.',
                required: true,
                name: 'tos_optin',
                'on-click-action': {
                  name: 'navigate',
                  payload: {},
                  next: { name: 'TERMS_AND_CONDITIONS', type: 'screen' },
                },
              },
              {
                type: 'OptIn',
                label: 'Keep me up to date about offers and promotions',
                name: 'marketing_optin',
              },
              {
                type: 'Footer',
                label: 'Continue',
                'on-click-action': {
                  name: 'navigate',
                  next: { type: 'screen', name: 'CATEGORIES' },
                  payload: {
                    name:            '${form.name}',
                    email:           '${form.email}',
                    tos_optin:       '${form.tos_optin}',
                    marketing_optin: '${form.marketing_optin}',
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
              {
                type: 'TextSubheading',
                text: 'Let us know which category you are interested in?',
              },
              {
                type: 'CheckboxGroup',
                label: 'Select categories',
                required: true,
                name: 'categories',
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
                type: 'Footer',
                label: 'Confirm',
                'on-click-action': {
                  name: 'complete',
                  payload: {
                    name:            '${data.name}',
                    email:           '${data.email}',
                    tos_optin:       '${data.tos_optin}',
                    marketing_optin: '${data.marketing_optin}',
                    categories:      '${form.categories}',
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
          {
            type: 'TextBody',
            text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vitae odio dui. Praesent ut nulla tincidunt, scelerisque augue malesuada, volutpat lorem.',
          },
          { type: 'TextSubheading', text: 'Privacy policy' },
          {
            type: 'TextBody',
            text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed vitae odio dui. Praesent ut nulla tincidunt, scelerisque augue malesuada, volutpat lorem.',
          },
        ],
      },
    },
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiPost(path: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiPostForm(path: string, formData: FormData): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: formData,
  });
  return res.json();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!BUSINESS_ACCOUNT_ID || !PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.error('❌  Missing env: WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_PHONE_NUMBER_ID, or WHATSAPP_ACCESS_TOKEN');
    process.exit(1);
  }

  // ── Step 1: Create the flow ───────────────────────────────────────────────
  console.log('\n📋  Step 1: Creating flow in WhatsApp Manager...');
  const createResult = await apiPost(`/${BUSINESS_ACCOUNT_ID}/flows`, {
    name: `Mega Sales Test ${Date.now()}`,
    categories: ['SIGN_UP'],
  });

  if (!createResult.id) {
    console.error('❌  Failed to create flow:');
    console.error(JSON.stringify(createResult, null, 2));
    process.exit(1);
  }

  const flowId: string = createResult.id;
  console.log(`✅  Flow created — flow_id: ${flowId}`);

  // ── Step 2: Upload the flow JSON asset ───────────────────────────────────
  console.log('\n📤  Step 2: Uploading flow JSON...');

  const flowJsonBytes = Buffer.from(JSON.stringify(FLOW_JSON, null, 2), 'utf8');
  const formData = new FormData();
  formData.append('file', new Blob([flowJsonBytes], { type: 'application/json' }), 'flow.json');
  formData.append('asset_type', 'FLOW_JSON');
  formData.append('name', 'flow.json');

  const uploadResult = await apiPostForm(`/${flowId}/assets`, formData);

  if (uploadResult.success !== true) {
    console.error('❌  Failed to upload flow JSON:');
    console.error(JSON.stringify(uploadResult, null, 2));
    // Clean up orphan flow
    await apiPost(`/${flowId}`, { deprecated: true }).catch(() => {});
    process.exit(1);
  }

  console.log('✅  Flow JSON uploaded successfully');

  // ── Step 3: Send the interactive flow message ─────────────────────────────
  console.log(`\n📨  Step 3: Sending flow to +${TO_NUMBER}...`);

  const msgBody = {
    messaging_product: 'whatsapp',
    to: TO_NUMBER,
    type: 'interactive',
    interactive: {
      type: 'flow',
      header: {
        type: 'video',
        video: {
          link: 'https://surakshalms.s3.us-east-1.amazonaws.com/SURAKSHA_LMS.mp4',
        },
      },
      body: {
        text: 'Register to get early access to our exclusive deals!',
      },
      footer: {
        text: 'Tap below to join',
      },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_action: 'navigate',
          flow_token: `test-${Date.now()}`,
          flow_id: flowId,
          flow_cta: 'Join Now',
          mode: 'draft', // change to 'published' after publishing the flow
          flow_action_payload: {
            screen: 'JOIN_NOW',
          },
        },
      },
    },
  };

  const sendResult = await apiPost(`/${PHONE_NUMBER_ID}/messages`, msgBody);

  if (sendResult.messages?.[0]?.id) {
    const msgId = sendResult.messages[0].id;
    console.log('✅  Flow message sent!');
    console.log(`    WhatsApp message ID : ${msgId}`);
    console.log(`    Flow ID             : ${flowId}`);
    console.log('\n💡  Note: Flow is in DRAFT mode. To publish:');
    console.log(`    POST https://graph.facebook.com/${API_VERSION}/${flowId}/publish`);
  } else {
    console.error('❌  Failed to send flow message:');
    console.error(JSON.stringify(sendResult, null, 2));
    console.log(`\n    Flow ID ${flowId} was created — delete it in WhatsApp Manager if not needed.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌  Unexpected error:', err.message);
  process.exit(1);
});
