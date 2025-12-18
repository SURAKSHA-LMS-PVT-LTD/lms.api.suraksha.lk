/**
 * Test if the NestJS system is actually using Redis cache
 */

const http = require('http');

console.log('🧪 Testing System Redis Integration...\n');

// Make a request to check cache service health
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  console.log(`✅ Server is running: ${res.statusCode}`);
  console.log('\n📊 To verify Redis is working:');
  console.log('1. Check server logs for "✅ Redis is ready" message');
  console.log('2. Look for cache HIT/MISS logs in the console');
  console.log('3. No "⚠️ Redis Error" warnings should appear\n');
  
  console.log('🎯 Make some API calls (login, user queries) to see cache in action');
  process.exit(0);
});

req.on('error', (e) => {
  console.log(`❌ Server not running: ${e.message}`);
  console.log('\nStart the server with: npm run start:dev');
  process.exit(1);
});

req.on('timeout', () => {
  console.log('❌ Server request timed out');
  req.destroy();
  process.exit(1);
});

req.end();
