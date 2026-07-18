#!/usr/bin/env node
/**
 * One-off: send an initialization WhatsApp message to a number.
 *
 *   node send-whatsapp-init.mjs 94779550317           # template (hello_world) — works cold
 *   node send-whatsapp-init.mjs 94779550317 text       # plain text — ONLY if 24h window open
 *
 * Reads WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN from .env.
 */
import 'dotenv/config';

const to   = (process.argv[2] || '').replace(/[^0-9]/g, '');
const mode = process.argv[3] || 'template';

const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN;

if (!to)       { console.error('Usage: node send-whatsapp-init.mjs <number> [text]'); process.exit(1); }
if (!PHONE_ID || !TOKEN) { console.error('Missing WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN in .env'); process.exit(1); }

const body = mode === 'text'
  ? { messaging_product: 'whatsapp', to, type: 'text', text: { body: 'Hello from Suraksha LMS — this is an initialization message.' } }
  : { messaging_product: 'whatsapp', to, type: 'template', template: { name: 'hello_world', language: { code: 'en_US' } } };

console.log(`Sending ${mode} message to ${to.slice(0, 4)}****${to.slice(-3)} via phone-id ${PHONE_ID.slice(0, 6)}****`);

const res = await fetch(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const json = await res.json();

if (res.ok && json.messages) {
  console.log('✅ Sent. Message id:', json.messages[0]?.id);
} else {
  const err = json.error || {};
  console.error('❌ Failed.');
  console.error('   code:', err.code, '| subcode:', err.error_subcode);
  console.error('   message:', err.message);
  if (err.code === 131047) console.error('   → 24h session window is closed. The number must message you first, or use a template (default mode).');
  if (err.code === 131030) console.error('   → Recipient not in allowed list (account still in sandbox/dev — add the number as a test recipient in Meta dashboard).');
  if (err.code === 132001) console.error('   → Template "hello_world" not found/approved for this account.');
}
