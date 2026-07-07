import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class SimpleRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimpleRedisService.name);
  private redisClient: Redis;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const cacheConfig = this.configService.get('cache.cache');
    if (cacheConfig?.enabled) {
      await this.connect();
    } else {
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      // ✅ Use your proven working Redis configuration
      const redisConfig = {
        host: 'redis-18329.c47035.us-east-1-mz.ec2.cloud.rlrcp.com',
        port: 18329,
        username: 'laas',
        password: process.env.REDIS_PASSWORD,
        db: 0,
        // ✅ Your proven stable settings
        connectTimeout: 60000,
        lazyConnect: true,
        maxRetriesPerRequest: 5,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        keepAlive: 30000,
        family: 4,
        enableOfflineQueue: false,
        maxLoadingTimeout: 0,
        // ✅ Simple retry strategy that works
        retryStrategy: (times) => {
          if (times > 3) return null;
          return Math.min(times * 50, 2000);
        }
      };

      
      this.redisClient = new Redis(redisConfig);
      
      // ✅ Minimal event handlers
      this.redisClient.on('connect', () => {
        this.isConnected = true;
      });

      this.redisClient.on('ready', () => {
        this.isConnected = true;
      });

      this.redisClient.on('error', (error) => {
      });

      // Connect
      await this.redisClient.connect();
      
      // Test connection
      const pingResult = await this.redisClient.ping();
      if (pingResult === 'PONG') {
        return;
      }
      
    } catch (error) {
      this.logger.warn(`⚠️ Redis connection failed: ${error.message} - application continues without cache`);
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
      }
    }
  }

  isRedisConnected(): boolean {
    return this.isConnected;
  }

  async get(key: string): Promise<any> {
    if (!this.isConnected || !this.redisClient) {
      return null;
    }

    try {
      const value = await this.redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<boolean> {
    if (!this.isConnected || !this.redisClient) {
      return false;
    }

    try {
      const serialized = JSON.stringify(value);
      const result = await this.redisClient.setex(key, ttl, serialized);
      return result === 'OK';
    } catch (error) {
      return false;
    }
  }

  async del(key: string | string[]): Promise<number> {
    if (!this.isConnected || !this.redisClient) {
      return 0;
    }

    try {
      const keys = Array.isArray(key) ? key : [key];
      return await this.redisClient.del(...keys);
    } catch (error) {
      return 0;
    }
  }
}
