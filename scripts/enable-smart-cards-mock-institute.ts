/**
 * Enable the 'smart-cards' feature for the mock/demo institute.
 *
 * The 'smart-cards' feature is DEFAULT_OFF (seeded disabled for every institute).
 * This script flips it ON for the mock institute so the UI shows smart-card sections
 * without needing a system-admin to manually enable it via the admin panel.
 *
 * Mock institute ID: de300000-0000-4000-8000-000000000001
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/enable-smart-cards-mock-institute.ts
 */

import * as mysql from 'mysql2/promise';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.resolve(__dirname, '../.env') });

const MOCK_INSTITUTE_ID = 'de300000-0000-4000-8000-000000000001';
const FEATURE_KEY = 'smart-cards';

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME || process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || process.env.DB_DATABASE,
  });

  try {
    // Verify the mock institute exists
    const [institutes] = await connection.execute<any[]>(
      'SELECT id, name FROM institutes WHERE id = ?',
      [MOCK_INSTITUTE_ID],
    );
    if (institutes.length === 0) {
      console.error(`❌ Mock institute ${MOCK_INSTITUTE_ID} not found in the database.`);
      process.exit(1);
    }
    console.log(`✅ Found institute: ${institutes[0].name} (${institutes[0].id})`);

    // Upsert the feature toggle to enabled
    const [result] = await connection.execute<any>(
      `INSERT INTO institute_feature_toggles
         (institute_id, feature_key, enabled, enabled_source, enabled_at, created_at, updated_at)
       VALUES (?, ?, 1, 'SYSTEM', NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         enabled = 1,
         enabled_source = 'SYSTEM',
         enabled_at = NOW(),
         updated_at = NOW()`,
      [MOCK_INSTITUTE_ID, FEATURE_KEY],
    );

    const wasInserted = result.affectedRows === 1 && result.warningStatus === 0;
    console.log(
      wasInserted
        ? `✅ Inserted new toggle: smart-cards ENABLED for mock institute`
        : `✅ Updated existing toggle: smart-cards ENABLED for mock institute`,
    );

    // Also verify feature_catalog has the smart-cards entry (in case migration hasn't run)
    const [catalog] = await connection.execute<any[]>(
      'SELECT `key`, label, is_active FROM feature_catalog WHERE `key` = ?',
      [FEATURE_KEY],
    );
    if (catalog.length === 0) {
      console.warn(
        `⚠️  feature_catalog has no 'smart-cards' entry. Run the smart-cards migration first:\n` +
        `   npx typeorm migration:run -d src/data-source.ts`,
      );
    } else {
      console.log(
        `✅ feature_catalog entry found: "${catalog[0].label}" (active=${catalog[0].is_active})`,
      );
    }

    console.log('\n🎉 Done! The smart-cards feature is now ENABLED for the mock institute.');
    console.log('   Restart the API server if it is running (NestJS caches feature toggles).');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
