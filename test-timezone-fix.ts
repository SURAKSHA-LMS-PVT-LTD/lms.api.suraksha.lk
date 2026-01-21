/**
 * Test script to verify Sri Lanka timezone is working correctly
 * Run with: npx ts-node test-timezone-fix.ts
 */

import { now as getNow, getCurrentSriLankaTime, getCurrentSriLankaISO, getCurrentSriLankaDate, formatSriLankaDateTime } from './src/common/utils/timezone.util';

console.log('🌍 Testing Sri Lanka Timezone Configuration\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Test 1: Current time
const currentTime = getNow();
console.log('1️⃣  now() function:');
console.log(`   Result: ${currentTime}`);
console.log(`   ISO String: ${currentTime.toISOString()}`);
console.log(`   Local String: ${currentTime.toLocaleString()}`);
console.log();

// Test 2: Get Sri Lanka Time
const sriLankaTime = getCurrentSriLankaTime();
console.log('2️⃣  getCurrentSriLankaTime():');
console.log(`   Result: ${sriLankaTime}`);
console.log(`   Year: ${sriLankaTime.getFullYear()}`);
console.log(`   Month: ${sriLankaTime.getMonth() + 1}`);
console.log(`   Date: ${sriLankaTime.getDate()}`);
console.log(`   Hours: ${sriLankaTime.getHours()}`);
console.log(`   Minutes: ${sriLankaTime.getMinutes()}`);
console.log();

// Test 3: ISO String
const isoString = getCurrentSriLankaISO();
console.log('3️⃣  getCurrentSriLankaISO():');
console.log(`   Result: ${isoString}`);
console.log();

// Test 4: Date String
const dateString = getCurrentSriLankaDate();
console.log('4️⃣  getCurrentSriLankaDate():');
console.log(`   Result: ${dateString}`);
console.log();

// Test 5: Formatted Date Time
const formatted = formatSriLankaDateTime(new Date());
console.log('5️⃣  formatSriLankaDateTime():');
console.log(`   Result: ${formatted}`);
console.log();

// Test 6: Compare with system time
const systemTime = new Date();
const timeDiff = sriLankaTime.getTime() - systemTime.getTime();
console.log('6️⃣  Time Comparison:');
console.log(`   System Time: ${systemTime.toISOString()}`);
console.log(`   Sri Lanka Time (our function): ${sriLankaTime.toISOString()}`);
console.log(`   Difference: ${timeDiff / 1000} seconds`);
console.log();

// Test 7: Expected behavior when saving to database
console.log('7️⃣  Database Save Simulation:');
console.log(`   What gets saved (createdAt): ${currentTime}`);
console.log(`   What appears in database: Should show Sri Lanka time`);
console.log();

// Test 8: Verify it matches Time.is Colombo
const currentSLTime = getCurrentSriLankaTime();
const hours = currentSLTime.getHours().toString().padStart(2, '0');
const minutes = currentSLTime.getMinutes().toString().padStart(2, '0');
const seconds = currentSLTime.getSeconds().toString().padStart(2, '0');
console.log('8️⃣  Current Sri Lanka Time (should match Time.is):');
console.log(`   Time: ${hours}:${minutes}:${seconds}`);
console.log(`   Date: ${currentSLTime.toDateString()}`);
console.log();

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Test Complete! Compare the times above with Time.is Colombo');
console.log('   Visit: https://time.is/Colombo');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
