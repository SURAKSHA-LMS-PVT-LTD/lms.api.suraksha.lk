import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { InstituteUserType } from '../../modules/institute_mudules/institue_user/enums/institute-user-type.enum';
import { getCurrentSriLankaTime } from '../utils/timezone.util';

export interface CacheSetOptions {
  ttl?: number;
  nx?: boolean; // Only set if key doesn't exist
  xx?: boolean; // Only set if key exists
}

export interface UserCacheData {
  userId: string;
  firstName: string;
  lastName: string;
  nameWithInitials: string;
  email: string;
  phone?: string;
  userType: string;
  dateOfBirth?: Date;
  gender?: string;
  nic?: string;
  birthCertificateNo?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  imageUrl?: string;
  isActive: boolean;
  firstLoginCompleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Related data (keep IDs only to avoid joins)
  fatherId?: string;
  motherId?: string;
  guardianId?: string;
  studentId?: string;
  
  // Parent specific data
  occupation?: string;
  workplace?: string;
  workPhone?: string;
  educationLevel?: string;
  
  // Student specific data
  emergencyContact?: string;
  medicalConditions?: string;
  allergies?: string;
  bloodGroup?: string;
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redisClient: Redis;
  private isConnected = false;
  private lastErrorTime = 0;
  private readonly ERROR_LOG_THROTTLE = 30000; // Only log errors every 30 seconds

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    // ✅ RE-ENABLED: Redis caching active with smart invalidation
    const cacheEnabled = this.configService.get<string>('CACHE_ENABLED') === 'true';
    
    if (cacheEnabled) {
      await this.connect();
    } else {
      this.logger.warn('⚠️ Redis caching disabled via CACHE_ENABLED=false');
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    // If already connected, don't reconnect
    if (this.redisClient && this.isConnected) {
      return;
    }

    await this.establishConnection();
  }

  private async establishConnection(): Promise<void> {
    try {
      // Get Redis config directly from environment variables - simple like database
      const host = process.env.REDIS_HOST;
      const port = parseInt(process.env.REDIS_PORT) || 6379;
      const username = process.env.REDIS_USERNAME;
      const password = process.env.REDIS_PASSWORD;
      // Redis db should be a number (0-15), Redis Labs cloud doesn't use db parameter
      const db = parseInt(process.env.REDIS_DB);
      const dbValue = isNaN(db) ? undefined : db;
      
      if (!host) {
        this.logger.warn('⚠️ REDIS_HOST not found - cache disabled');
        return;
      }


      // Long-term stable Redis connection - like database connection
      this.redisClient = new Redis({
        host,
        port,
        username, // ✅ FIX: Add username for Redis Labs authentication
        password,
        db: dbValue, // ✅ FIX: Only set db if valid number, undefined for Redis Labs
        // Connection settings optimized for Redis Labs cloud
        connectTimeout: parseInt(process.env.REDIS_CONNECTION_TIMEOUT) || 10000, // 10 second connection timeout
        commandTimeout: undefined, // No command timeout - let operations complete
        enableOfflineQueue: process.env.REDIS_ENABLE_OFFLINE_QUEUE !== 'false',
        enableReadyCheck: process.env.REDIS_ENABLE_READY_CHECK !== 'false', // Enable ready check for cloud
        keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE) || 0,
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST) || 3, // Allow retries for cloud
        lazyConnect: process.env.REDIS_LAZY_CONNECT === 'true',
        // Stable long-term connection settings
        family: 4, // Force IPv4 for stability
        // Retry strategy for cloud connection issues
        retryStrategy: (times) => {
          const maxRetries = parseInt(process.env.REDIS_MAX_RETRY_ATTEMPTS) || 3;
          if (times > maxRetries) {
            this.logger.warn(`⚠️ Redis max retries (${maxRetries}) exceeded - cache disabled`);
            return null; // Stop retrying
          }
          const delay = Math.min(times * 1000, 5000); // Max 5 second delay
          return delay;
        },
        // STRICT: Only reconnect on actual socket/network failures, not timeouts
        reconnectOnError: (err) => {
          const actualSocketErrors = [
            'ECONNRESET',      // Connection reset by peer (socket closed)
            'ENOTFOUND',       // DNS/host not found (network failure)  
            'ECONNREFUSED',    // Connection refused (server down)
            'ETIMEDOUT',       // Network timeout (actual network failure)
            'Connection lost', // ioredis connection lost event
            'connect ECONNREFUSED', // Connection refused on connect
            'connect ETIMEDOUT'     // Connection timeout on connect
          ];
          
          const isActualFailure = actualSocketErrors.some(errorType => 
            err.message.includes(errorType)
          );
          
          if (isActualFailure) {
            this.logger.error(`� Redis socket failure detected: ${err.message} - reconnecting`);
            return false; // ✅ NEVER auto-reconnect
          } else {
            return false;
          }
        },
      });

      // ✅ MINIMAL event handlers - no reconnection noise
      this.redisClient.on('connect', () => {
        this.isConnected = true;
      });

      this.redisClient.on('ready', () => {
        this.isConnected = true;
      });

      this.redisClient.on('error', (error: any) => {
        this.isConnected = false;
        // ✅ DETAILED error logging to identify timeout source
        const now = Date.now();
        if (now - this.lastErrorTime > this.ERROR_LOG_THROTTLE) {
          this.logger.warn(`⚠️ Redis Error Details:`);
          this.logger.warn(`   Message: ${error.message}`);
          this.logger.warn(`   Command: ${error.command || 'unknown'}`);
          this.logger.warn(`   Args: ${JSON.stringify(error.args || [])}`);
          this.logger.warn(`   → Cache disabled, using database`);
          this.lastErrorTime = now;
        }
      });

      this.redisClient.on('close', () => {
        this.isConnected = false;
      });

      this.redisClient.on('end', () => {
        this.isConnected = false;
      });

      // ✅ DISABLE reconnecting event handler - no reconnection noise
      this.redisClient.on('reconnecting', () => {
        // Silent - no logging of reconnection attempts
      });

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const connectionWaitTimeout = parseInt(process.env.REDIS_CONNECTION_WAIT_TIMEOUT) || 35000;
        const timeout = setTimeout(() => {
          reject(new Error(`Redis connection timeout after ${connectionWaitTimeout}ms`));
        }, connectionWaitTimeout);

        this.redisClient.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.redisClient.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      
    } catch (error) {
      this.logger.error(`❌ Redis connection failed: ${error.message}`);
      this.logger.warn('🔄 Application continues without cache');
      this.isConnected = false;
    }
  }



  private async disconnect(): Promise<void> {
    if (this.redisClient) {
      try {
        this.isConnected = false;
        await this.redisClient.quit();
        this.redisClient = null;
      } catch (error) {
        this.logger.warn(`⚠️ Redis disconnect error: ${error.message}`);
      }
    }
  }





  private isCacheEnabled(): boolean {
    // ✅ Check if caching is enabled using correct environment variable
    const cacheEnabled = this.configService.get('CACHE_ENABLED') === 'true';
    
    if (!cacheEnabled) {
      return false;
    }
    
    if (!this.redisClient) {
      return false;
    }
    
    return true;
  }

  private getDefaultTtl(): number {
    const ttl = this.configService.get('cache.cache.defaultTtl', 600);
    // ♻️ FOREVER CACHING: No TTL limit - cache until manually refreshed
    return ttl;
  }

  private getUserTtl(): number {
    const ttl = this.configService.get('cache.cache.userTtl', 3600);
    // ♻️ FOREVER CACHING: No TTL limit - cache until manually refreshed
    return ttl;
  }

  private getUserAccessTtl(): number {
    const ttl = this.configService.get('cache.cache.userAccessTtl', 1800);
    // ♻️ FOREVER CACHING: No TTL limit - cache until manually refreshed
    return ttl;
  }

  private getParentAccessTtl(): number {
    const ttl = this.configService.get('cache.cache.parentAccessTtl', 7200);
    // ✅ PARENT ACCESS CACHING: Uses environment-configured TTL for parent access data
    return ttl;
  }

  // ==================== GENERIC CACHE OPERATIONS ====================

  async get<T = any>(key: string): Promise<T | null> {
    if (!this.isCacheEnabled()) {
      return null;
    }

    // Skip if not connected
    if (!this.isConnected) {
      return null;
    }

    try {
      // Use Redis with infinite timeout - let it complete naturally
      const value = await this.redisClient.get(key);
      
      if (value) {
        // ✅ Parse JSON with date handling for User cache data
        const parsed = JSON.parse(value);
        
        // ✅ Convert date strings back to Date objects for UserCacheData
        if (parsed && typeof parsed === 'object' && parsed.userId) {
          if (parsed.dateOfBirth && typeof parsed.dateOfBirth === 'string') {
            parsed.dateOfBirth = new Date(parsed.dateOfBirth);
          }
          if (parsed.createdAt && typeof parsed.createdAt === 'string') {
            parsed.createdAt = new Date(parsed.createdAt);
          }
          if (parsed.updatedAt && typeof parsed.updatedAt === 'string') {
            parsed.updatedAt = new Date(parsed.updatedAt);
          }
        }
        return parsed;
      } else {
        return null;
      }
    } catch (error) {
      // ✅ THROTTLED error logging for cache operations
      const now = Date.now();
      if (now - this.lastErrorTime > this.ERROR_LOG_THROTTLE) {
        this.lastErrorTime = now;
      }
      return null;
    }
  }

  async set(key: string, value: any, options?: CacheSetOptions): Promise<boolean> {
    if (!this.isCacheEnabled()) {
      return false;
    }

    const serialized = JSON.stringify(value);
    let ttl = options?.ttl || this.getDefaultTtl();
    ttl = Math.max(60, ttl);
    
    // Skip if not connected
    if (!this.isConnected) {
      return false;
    }

    try {
      // Use Redis with infinite timeout - let it complete naturally
      let result: Promise<string | null>;
      
      if (options?.nx) {
        result = this.redisClient.set(key, serialized, 'EX', ttl, 'NX');
      } else if (options?.xx) {
        result = this.redisClient.set(key, serialized, 'EX', ttl, 'XX');
      } else {
        result = this.redisClient.setex(key, ttl, serialized);
      }

      const finalResult = await result;
      const success = finalResult === 'OK';
      
      if (success) {
      }
      
      return success;
    } catch (error) {
      // ✅ THROTTLED error logging for cache operations
      const now = Date.now();
      if (now - this.lastErrorTime > this.ERROR_LOG_THROTTLE) {
        this.lastErrorTime = now;
      }
      return false;
    }
  }

  async del(key: string | string[]): Promise<number> {
    if (!this.isCacheEnabled()) {
      return 0;
    }

    try {
      const keys = Array.isArray(key) ? key : [key];
      return await this.redisClient.del(...keys);
    } catch (error) {
      this.logger.error(`Failed to delete cache keys:`, error);
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isCacheEnabled()) {
      return false;
    }

    try {
      const result = await this.redisClient.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to check cache key existence ${key}:`, error);
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.isCacheEnabled()) {
      return [];
    }

    try {
      return await this.redisClient.keys(pattern);
    } catch (error) {
      this.logger.error(`Failed to get keys with pattern ${pattern}:`, error);
      return [];
    }
  }

  async flushAll(): Promise<boolean> {
    if (!this.isCacheEnabled()) {
      return false;
    }

    try {
      await this.redisClient.flushall();
      return true;
    } catch (error) {
      this.logger.error('Failed to flush all cache:', error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    if (!this.isCacheEnabled()) {
      return -1;
    }

    try {
      return await this.redisClient.ttl(key);
    } catch (error) {
      this.logger.error(`Failed to get TTL for key ${key}:`, error);
      return -1;
    }
  }

  // ==================== USER DATA CACHE OPERATIONS ====================

  async setUserCache(userId: string, userData: UserCacheData): Promise<boolean> {
    const key = this.configService.get('cache.keys.user.details') + userId;
    return await this.set(key, userData, { ttl: this.getUserTtl() });
  }

  async getUserCache(userId: string): Promise<UserCacheData | null> {
    const key = this.configService.get('cache.keys.user.details') + userId;
    return await this.get<UserCacheData>(key);
  }

  async removeUserCache(userId: string): Promise<number> {
    const patterns = [
      this.configService.get('cache.keys.user.details') + userId,
      this.configService.get('cache.keys.user.profile') + userId,
      this.configService.get('cache.keys.user.withRelations') + userId,
    ];
    return await this.del(patterns);
  }

  async setUserByEmailCache(email: string, userData: UserCacheData): Promise<boolean> {
    const key = this.configService.get('cache.keys.user.byEmail') + email;
    return await this.set(key, userData, { ttl: this.getUserTtl() });
  }

  async getUserByEmailCache(email: string): Promise<UserCacheData | null> {
    const key = this.configService.get('cache.keys.user.byEmail') + email;
    return await this.get<UserCacheData>(key);
  }

  // ==================== BULK OPERATIONS ====================

  async setMultiple(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<number> {
    if (!this.isCacheEnabled()) {
      return 0;
    }

    let successCount = 0;
    for (const entry of entries) {
      const success = await this.set(entry.key, entry.value, { ttl: entry.ttl });
      if (success) successCount++;
    }
    return successCount;
  }

  async getMultiple<T = any>(keys: string[]): Promise<Array<{ key: string; value: T | null }>> {
    if (!this.isCacheEnabled()) {
      return keys.map(key => ({ key, value: null }));
    }

    const results: Array<{ key: string; value: T | null }> = [];
    
    for (const key of keys) {
      const value = await this.get<T>(key);
      results.push({ key, value });
    }
    
    return results;
  }

  // ==================== CACHE STATISTICS ====================

  async getCacheStats(): Promise<any> {
    if (!this.isCacheEnabled()) {
      return { 
        connected: false, 
        error: 'Cache not enabled or not connected' 
      };
    }

    try {
      const info = await this.redisClient.info('memory');
      const dbSize = await this.redisClient.dbsize();
      
      return {
        connected: this.isConnected,
        dbSize,
        memoryInfo: this.parseRedisInfo(info),
        userCacheCount: (await this.keys(this.configService.get('cache.keys.user.details') + '*')).length,
        accessCacheCount: (await this.keys(this.configService.get('cache.keys.userAccess.hierarchical') + '*')).length,
      };
    } catch (error) {
      this.logger.error('Failed to get cache stats:', error);
      return { connected: false, error: error.message };
    }
  }

  private parseRedisInfo(info: string): any {
    const lines = info.split('\r\n').filter(line => line.includes(':'));
    const result: any = {};
    
    lines.forEach(line => {
      const [key, value] = line.split(':');
      if (key && value !== undefined) {
        result[key] = isNaN(Number(value)) ? value : Number(value);
      }
    });
    
    return result;
  }

  // ==================== HEALTH CHECK ====================

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      if (!this.isCacheEnabled()) {
        return {
          status: 'disabled',
          details: { 
            message: 'Cache is disabled or not connected'
          }
        };
      }

      const testKey = 'health:check:' + Date.now();
      const testValue = { test: true, timestamp: getCurrentSriLankaTime() };
      
      await this.set(testKey, testValue, { ttl: 10 });
      const retrieved = await this.get(testKey);
      await this.del(testKey);

      const isWorking = JSON.stringify(retrieved) === JSON.stringify(testValue);

      return {
        status: isWorking ? 'healthy' : 'unhealthy',
        details: {
          redis: {
            connected: this.isConnected,
            testPassed: isWorking
          },
          timestamp: getCurrentSriLankaTime()
        }
      };
    } catch (error) {
      return {
        status: 'error',
        details: { 
          error: error.message, 
          timestamp: getCurrentSriLankaTime() 
        }
      };
    }
  }


}
