import { registerAs } from '@nestjs/config';

export default registerAs('cache', () => {
  // Parse db as number, set to undefined if NaN (for Redis Labs cloud)
  const dbValue = parseInt(process.env.REDIS_DB);
  const db = isNaN(dbValue) ? undefined : dbValue;
  
  return {
    // Redis Configuration - Ultra-persistent connection strategy
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      username: process.env.REDIS_USERNAME || undefined,
      password: process.env.REDIS_PASSWORD || undefined,
      db: db, // Use undefined for Redis Labs, numeric for standard Redis
    connectionTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 120000,
    commandTimeout: process.env.REDIS_COMMAND_TIMEOUT === '0' ? 0 : (parseInt(process.env.REDIS_COMMAND_TIMEOUT) || undefined),
    maxRetriesPerRequest: process.env.REDIS_MAX_RETRIES === 'null' ? null : (parseInt(process.env.REDIS_MAX_RETRIES) || null),
    enableReadyCheck: process.env.REDIS_ENABLE_READY_CHECK === 'true',
    lazyConnect: process.env.REDIS_LAZY_CONNECT === 'true',
    keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE) || 600000,
    maxLoadingTimeout: process.env.REDIS_MAX_REDIS_LOADING_TIMEOUT === '0' ? 0 : (parseInt(process.env.REDIS_MAX_REDIS_LOADING_TIMEOUT) || undefined),
    enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE !== 'false',
    autoReconnect: process.env.REDIS_AUTO_RECONNECT !== 'false',
    reconnectOnError: process.env.REDIS_RECONNECT_ON_ERROR !== 'false',
    retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY_ON_FAILOVER) || 2000,
    persistentMode: process.env.REDIS_PERSISTENT_MODE === 'true',
  },

  // Cache Configuration - Simplified caching strategy with enable/disable flags
  cache: {
    enabled: process.env.CACHE_ENABLED === 'true',
    
    // ✅ Feature flags for granular cache control
    userCacheEnabled: process.env.CACHE_USER_ENABLED !== 'false', // Default: enabled
    advertisementCacheEnabled: process.env.CACHE_ADVERTISEMENT_ENABLED !== 'false', // Default: enabled
    
    // TTL values in seconds - set via environment variables
    defaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL) || 604800, // Default: 7 days
    // User cache: days converted to seconds (env: CACHE_USER_TTL_DAYS)
    userTtl: (parseInt(process.env.CACHE_USER_TTL_DAYS) || 30) * 86400, // Default: 30 days in seconds
  },

  // Cache Keys Configuration - Simplified
  keys: {
    // User Data Cache Keys (only user caching)
    user: {
      profile: 'user:profile:',
      details: 'user:details:',
      withRelations: 'user:relations:',
      byEmail: 'user:email:',
      byPhone: 'user:phone:',
    },

    // Statistics and Aggregated Data
    stats: {
      userCount: 'stats:users:count',
      activeUsers: 'stats:users:active',
      instituteUsers: 'stats:institute:users:',
    },
  },
}});

