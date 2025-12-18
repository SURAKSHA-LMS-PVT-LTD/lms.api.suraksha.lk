/**
 * 🔴 Redis Connection Test
 * Tests if Redis credentials are working
 */

require('dotenv').config();
const Redis = require('ioredis');

async function testRedisConnection() {
  console.log('🔍 Testing Redis Connection...\n');
  
  const config = {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    // db should be a number (0-15), not a database name
    // Redis Labs might not use the 'db' parameter - remove it or set to 0
    // db: 0,
    connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 10000,
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST) || 2,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 1000, 5000);
    },
  };

  console.log('📋 Configuration:');
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Username: ${config.username}`);
  console.log(`   Password: ${config.password ? '***' + config.password.slice(-4) : 'NOT SET ❌'}`);
  console.log(`   Database: ${config.db}`);
  console.log(`   Timeout: ${config.connectTimeout}ms\n`);

  if (!config.password) {
    console.log('❌ ERROR: REDIS_PASSWORD is not set in .env file!\n');
    console.log('Please add REDIS_PASSWORD to your .env file:\n');
    console.log('REDIS_PASSWORD=your_redis_password_here\n');
    process.exit(1);
  }

  const redis = new Redis(config);
  
  redis.on('connect', () => {
    console.log('✅ Connected to Redis server');
  });

  redis.on('ready', () => {
    console.log('✅ Redis is ready\n');
  });

  redis.on('error', (err) => {
    console.error('\n❌ Redis connection error:');
    console.error('   Message:', err.message);
    console.error('   Code:', err.code || 'N/A');
    
    if (err.message.includes('NOAUTH') || err.message.includes('authentication')) {
      console.error('\n🔴 Authentication failed! Check your REDIS_USERNAME and REDIS_PASSWORD');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('ECONNREFUSED')) {
      console.error('\n🔴 Cannot reach Redis server! Check REDIS_HOST and REDIS_PORT');
    } else if (err.message.includes('WRONGPASS') || err.message.includes('invalid password')) {
      console.error('\n🔴 Wrong password! Check your REDIS_PASSWORD');
    } else if (err.message.includes('invalid') || err.message.includes('ERR')) {
      console.error('\n🔴 Invalid configuration or command');
    }
  });

  // Wait a bit for connection to establish
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // Test basic operations
    console.log('🧪 Testing PING...');
    const pong = await redis.ping();
    console.log(`✅ PING successful: ${pong}`);

    console.log('🧪 Testing SET operation...');
    await redis.set('test:connection', 'success', 'EX', 10);
    console.log('✅ SET successful');

    console.log('🧪 Testing GET operation...');
    const value = await redis.get('test:connection');
    console.log(`✅ GET successful: ${value}`);

    console.log('🧪 Testing DEL operation...');
    await redis.del('test:connection');
    console.log('✅ DEL successful');

    console.log('\n🎉 All Redis operations successful!');
    console.log('✅ Redis credentials are working correctly\n');

    redis.disconnect();
    return true;
  } catch (error) {
    console.error('\n❌ Redis operation failed:');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
    redis.disconnect();
    throw error;
  }
}

// Run the test
testRedisConnection()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Redis connection test failed');
    process.exit(1);
  });
