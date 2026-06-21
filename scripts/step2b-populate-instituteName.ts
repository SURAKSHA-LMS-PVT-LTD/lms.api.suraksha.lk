/**
 * STEP 2B — Populate extra_data.instituteName for Thilina-migrated students
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/step2b-populate-instituteName.ts
 *
 * What it does:
 *   - For each institute_user row under the Thilina institute in Suraksha DB
 *     that has a sourceUserId in extra_data, looks up that user in Thilina DB
 *   - Gets the institute name from Thilina's Institute table via User.orgId
 *   - Sets extra_data.instituteName = that name (e.g. "WINS", "Sihasma", "Thilina Dhananjaya Academy")
 *   - Skips rows where instituteName is already set (idempotent)
 *   - Does NOT touch extra_data.school or any other extra_data fields
 *
 * WINS:                    416 students  (orgId ba1485bc-...)
 * Sihasma:                  14 students  (orgId c0d6b894-...)
 * Thilina Dhananjaya Academy: 21 students (orgId inst-td-001)
 */

import * as mysql from 'mysql2/promise';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.resolve(__dirname, '../.env') });

const THILINA_INSTITUTE_ID = '6e09518a-89ac-47e1-8961-326b5fd5fc9c';

async function main() {
  const surConn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  const thiConn = await mysql.createConnection({
    host: '34.42.163.47',
    port: 3306,
    user: 'root',
    password: 'Skaveesha1355660@',
    database: 'thilinadhananjaya_lms',
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  try {
    console.log('🔍 Loading Thilina institute name map...');
    const [instRows] = await thiConn.execute<any[]>(
      'SELECT id, name FROM Institute'
    );
    const instituteNameMap: Record<string, string> = {};
    for (const row of instRows) {
      instituteNameMap[row.id] = row.name;
    }
    console.log('   Institutes:', Object.entries(instituteNameMap).map(([id, name]) => `${name} (${id})`).join(', '));

    // Build map: thilina userId → instituteName
    console.log('🔍 Loading Thilina user→orgId map...');
    const [userRows] = await thiConn.execute<any[]>(
      "SELECT id, orgId FROM User WHERE role = 'STUDENT' AND orgId IS NOT NULL"
    );
    const userInstituteMap: Record<string, string> = {};
    for (const row of userRows) {
      const name = instituteNameMap[row.orgId];
      if (name) userInstituteMap[row.id] = name;
    }
    console.log(`   Loaded ${Object.keys(userInstituteMap).length} student→institute mappings`);

    // Fetch all Thilina institute_user rows that have sourceUserId in extra_data
    console.log('🔍 Fetching Suraksha institute_user rows for Thilina institute...');
    const [iuRows] = await surConn.execute<any[]>(
      `SELECT user_id, extra_data FROM institute_user WHERE institute_id = ?`,
      [THILINA_INSTITUTE_ID]
    );
    console.log(`   Found ${iuRows.length} rows`);

    let updated = 0;
    let skipped = 0;
    let noSource = 0;
    let noMatch = 0;

    for (const row of iuRows) {
      let extraData: Record<string, any> = {};
      if (row.extra_data) {
        extraData = typeof row.extra_data === 'string'
          ? JSON.parse(row.extra_data)
          : row.extra_data;
      }

      // Skip if already populated
      if (extraData.instituteName && extraData.instituteName.trim() !== '') {
        skipped++;
        continue;
      }

      const sourceUserId = extraData.sourceUserId;
      if (!sourceUserId) {
        noSource++;
        continue;
      }

      const instituteName = userInstituteMap[sourceUserId];
      if (!instituteName) {
        noMatch++;
        continue;
      }

      // Update only the instituteName key; preserve all other extra_data fields
      extraData.instituteName = instituteName;

      await surConn.execute(
        `UPDATE institute_user SET extra_data = ? WHERE institute_id = ? AND user_id = ?`,
        [JSON.stringify(extraData), THILINA_INSTITUTE_ID, row.user_id]
      );
      updated++;
    }

    console.log('\n✅ Done!');
    console.log(`   Updated:          ${updated}`);
    console.log(`   Already set:      ${skipped}`);
    console.log(`   No sourceUserId:  ${noSource}`);
    console.log(`   No Thilina match: ${noMatch}`);

  } finally {
    await surConn.end();
    await thiConn.end();
  }
}

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });
