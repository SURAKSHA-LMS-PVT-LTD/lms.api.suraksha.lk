import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cache } from 'cache-manager';
import { AdvertisementEntity } from '../entities/advertisement.entity';
import { getCurrentSriLankaTime } from '../../../common/utils/timezone.util';

/**
 * Advertisement Cache Service with Metrics Tracking
 * 
 * Features:
 * - 1-hour cache TTL (configurable via CACHE_AD_TTL_SECONDS)
 * - Tracks sendings in cache with timestamp
 * - Syncs to DB every 10 minutes based on timestamp check (configurable via CACHE_AD_METRICS_SYNC_INTERVAL_MINUTES)
 * - Simple pattern: check cache → if miss, fetch DB → cache for TTL
 * - On-demand sync (no scheduled cron jobs)
 */
@Injectable()
export class AdvertisementCacheService {
  private readonly logger = new Logger(AdvertisementCacheService.name);
  private readonly ADS_CACHE_KEY = 'ads:active';
  private readonly METRICS_CACHE_KEY = 'ads:metrics';
  
  // Configurable via environment variables
  private readonly CACHE_TTL: number; // Seconds
  private readonly METRICS_SYNC_INTERVAL: number; // Minutes
  private readonly isCachingEnabled: boolean; // Enable/disable flag

  constructor(
    @InjectRepository(AdvertisementEntity)
    private advertisementRepository: Repository<AdvertisementEntity>,
    @Inject('CACHE_MANAGER') private cacheManager: Cache,
  ) {
    // Read from environment with defaults
    this.CACHE_TTL = parseInt(process.env.CACHE_AD_TTL_SECONDS) || 3600; // Default 1 hour
    this.METRICS_SYNC_INTERVAL = parseInt(process.env.CACHE_AD_METRICS_SYNC_INTERVAL_MINUTES) || 10; // Default 10 minutes
    
    // ✅ Check if advertisement caching is enabled
    const globalCacheEnabled = process.env.CACHE_ENABLED === 'true';
    const adCacheEnabled = process.env.CACHE_ADVERTISEMENT_ENABLED !== 'false'; // Default: enabled
    this.isCachingEnabled = globalCacheEnabled && adCacheEnabled;
    
    if (!globalCacheEnabled) {
      this.logger.warn('🚨 GLOBAL CACHING DISABLED - Advertisement cache will be bypassed');
    } else if (!adCacheEnabled) {
      this.logger.warn('🚨 ADVERTISEMENT CACHING DISABLED - Using direct database access');
    }
  }

  /**
   * Get active advertisements with caching
   * Simple pattern: check cache → if miss, fetch from DB → cache for TTL
   */
  async getActiveAdvertisements(): Promise<AdvertisementEntity[]> {
    try {
      // 🚨 BYPASS CACHE: If caching is disabled, fetch directly from database
      if (!this.isCachingEnabled) {
        return await this.fetchFromDatabase();
      }

      // Check cache first
      const cached = await this.cacheManager.get<AdvertisementEntity[]>(this.ADS_CACHE_KEY);

      if (cached && Array.isArray(cached)) {
        return cached;
      }

      // Cache miss - fetch from database and cache
      const ads = await this.fetchFromDatabase();
      await this.cacheManager.set(this.ADS_CACHE_KEY, ads, this.CACHE_TTL);
      
      return ads;
      
    } catch (error) {
      this.logger.error('❌ Cache error - falling back to database', error);
      return await this.fetchFromDatabase();
    }
  }

  /**
   * Track sending (notification sent) for an advertisement
   * Stored in cache with timestamp, synced to DB based on time check
   */
  async trackSending(adId: string): Promise<void> {
    try {
      // 🚨 BYPASS CACHE: If caching is disabled, update database directly
      if (!this.isCachingEnabled) {
        await this.advertisementRepository.increment({ id: adId }, 'currentSendings', 1);
        return;
      }

      const metrics = await this.getMetricsFromCache();
      const now = getCurrentSriLankaTime();
      
      if (!metrics.data[adId]) {
        metrics.data[adId] = { sendings: 0 };
      }
      metrics.data[adId].sendings += 1;
      metrics.lastUpdated = now;
      
      await this.cacheManager.set(this.METRICS_CACHE_KEY, metrics, this.CACHE_TTL * 24);
      
      // Check if sync is needed based on timestamp
      await this.checkAndSyncMetrics(metrics);
    } catch (error) {
      this.logger.error(`Failed to track sending for ad ${adId}`, error);
    }
  }

  /**
   * Get metrics from cache with timestamp
   */
  private async getMetricsFromCache(): Promise<{
    data: Record<string, { sendings: number }>;
    lastUpdated: Date;
    lastSyncTime: Date | null;
  }> {
    const metrics = await this.cacheManager.get<any>(this.METRICS_CACHE_KEY);
    return metrics || { data: {}, lastUpdated: getCurrentSriLankaTime(), lastSyncTime: null };
  }

  /**
   * Check if sync is needed based on timestamp and trigger if necessary
   */
  private async checkAndSyncMetrics(metrics: { 
    data: Record<string, { sendings: number }>; 
    lastUpdated: Date;
    lastSyncTime: Date | null;
  }): Promise<void> {
    try {
      const now = getCurrentSriLankaTime();
      
      if (!metrics.lastSyncTime) {
        // First time - sync immediately
        await this.syncMetricsToDB(metrics);
        return;
      }

      const minutesSinceLastSync = (now.getTime() - new Date(metrics.lastSyncTime).getTime()) / 60000;
      
      if (minutesSinceLastSync >= this.METRICS_SYNC_INTERVAL) {
        await this.syncMetricsToDB(metrics);
      }
    } catch (error) {
      this.logger.error('Failed to check and sync metrics', error);
    }
  }

  /**
   * Sync metrics to database (called on-demand based on timestamp)
   * ✅ BUG-E FIX: Atomic swap — take snapshot, clear cache first, then sync to DB.
   * If DB write fails, the buffered metrics are lost (acceptable trade-off vs double-counting).
   */
  private async syncMetricsToDB(metrics: { 
    data: Record<string, { sendings: number }>; 
    lastUpdated: Date;
    lastSyncTime: Date | null;
  }): Promise<void> {
    try {
      const adIds = Object.keys(metrics.data);

      if (adIds.length === 0) {
        return;
      }

      // Step 1: Take snapshot of current data
      const snapshot = { ...metrics.data };
      
      // Step 2: Clear cache FIRST to prevent double-counting on crash
      const now = getCurrentSriLankaTime();
      const clearedMetrics = {
        data: {},
        lastUpdated: now,
        lastSyncTime: now
      };
      await this.cacheManager.set(this.METRICS_CACHE_KEY, clearedMetrics, this.CACHE_TTL * 24);

      // Step 3: BUG-7 FIX — Use Promise.allSettled so one failed DB write
      // does NOT silently drop all remaining metric increments.
      const syncTasks = Object.entries(snapshot).map(([adId, { sendings }]) =>
        this.advertisementRepository
          .increment({ id: adId }, 'currentSendings', sendings)
          .catch(err => {
            this.logger.error(
              `❌ Failed to sync sendings for ad ${adId} (${sendings} sends lost): ${err.message}`,
            );
          }),
      );

      await Promise.allSettled(syncTasks);
      
    } catch (error) {
      this.logger.error('❌ Failed to sync metrics to database (cache already cleared to prevent double-counting)', error);
    }
  }

  /**
   * Fetch from database with optimized query
   */
  private async fetchFromDatabase(): Promise<AdvertisementEntity[]> {
    const currentTime = new Date();
    
    const ads = await this.advertisementRepository
      .createQueryBuilder('ad')
      .where('ad.isActive = :isActive', { isActive: true })
      .andWhere('ad.startDate <= :currentTime', { currentTime })
      .andWhere('ad.endDate >= :currentTime', { currentTime })
      .andWhere('ad.currentSendings < ad.maxSendings')
      .orderBy('ad.priority', 'DESC')
      .addOrderBy('ad.createdAt', 'DESC')
      .getMany();
    
    return ads;
  }

  /**
   * Invalidate cache (call after CREATE/UPDATE/DELETE operations)
   * Simply deletes cache, next request will fetch fresh data from DB
   */
  async invalidateCache(): Promise<void> {
    try {
      await this.cacheManager.del(this.ADS_CACHE_KEY);
    } catch (error) {
      this.logger.error('❌ Cache invalidation failed', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStatus(): Promise<{
    isCached: boolean;
    totalAds: number;
    ttlSeconds: number;
    pendingMetrics: number;
    metricsLastUpdated: Date | null;
    lastSyncTime: Date | null;
  }> {
    try {
      const cached = await this.cacheManager.get<AdvertisementEntity[]>(this.ADS_CACHE_KEY);
      const metrics = await this.getMetricsFromCache();

      return {
        isCached: !!cached,
        totalAds: cached?.length || 0,
        ttlSeconds: this.CACHE_TTL,
        pendingMetrics: Object.keys(metrics.data).length,
        metricsLastUpdated: metrics.lastUpdated,
        lastSyncTime: metrics.lastSyncTime
      };
    } catch (error) {
      return {
        isCached: false,
        totalAds: 0,
        ttlSeconds: this.CACHE_TTL,
        pendingMetrics: 0,
        metricsLastUpdated: null,
        lastSyncTime: null
      };
    }
  }

  /**
   * Return currently cached advertisements for admin observability.
   * Falls back to DB snapshot when cache is empty/disabled.
   */
  async getCurrentCachedAdvertisements(): Promise<{
    source: 'cache' | 'database';
    total: number;
    advertisements: Array<{
      id: string;
      title: string;
      priority: number;
      currentSendings: number;
      maxSendings: number;
      endDate: Date;
      isActive: boolean;
    }>;
  }> {
    try {
      if (!this.isCachingEnabled) {
        const ads = await this.fetchFromDatabase();
        return {
          source: 'database',
          total: ads.length,
          advertisements: ads.map(ad => ({
            id: ad.id,
            title: ad.title,
            priority: ad.priority,
            currentSendings: ad.currentSendings,
            maxSendings: ad.maxSendings,
            endDate: ad.endDate,
            isActive: ad.isActive,
          })),
        };
      }

      const cached = await this.cacheManager.get<AdvertisementEntity[]>(this.ADS_CACHE_KEY);
      if (cached && Array.isArray(cached)) {
        return {
          source: 'cache',
          total: cached.length,
          advertisements: cached.map(ad => ({
            id: ad.id,
            title: ad.title,
            priority: ad.priority,
            currentSendings: ad.currentSendings,
            maxSendings: ad.maxSendings,
            endDate: ad.endDate,
            isActive: ad.isActive,
          })),
        };
      }

      const ads = await this.fetchFromDatabase();
      return {
        source: 'database',
        total: ads.length,
        advertisements: ads.map(ad => ({
          id: ad.id,
          title: ad.title,
          priority: ad.priority,
          currentSendings: ad.currentSendings,
          maxSendings: ad.maxSendings,
          endDate: ad.endDate,
          isActive: ad.isActive,
        })),
      };
    } catch (error) {
      this.logger.error('Failed to get current cached advertisements', error);
      return {
        source: 'database',
        total: 0,
        advertisements: [],
      };
    }
  }
}

