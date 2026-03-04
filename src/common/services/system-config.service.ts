/**
 * ⚙️ SYSTEM CONFIG SERVICE — Generic Settings Store with Caching
 * 
 * Reads/writes from the system_config table with an in-memory cache layer.
 * All system-wide settings should go through this service.
 * 
 * Usage:
 *   const mode = await systemConfigService.get('ATTENDANCE', 'SYNC_MODE', 'DYNAMO_FIRST');
 *   await systemConfigService.set('ATTENDANCE', 'SYNC_MODE', 'IMMEDIATE', userId);
 *   const allAttendance = await systemConfigService.getGroup('ATTENDANCE');
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfigEntity } from '../entities/system-config.entity';

interface CachedEntry {
  value: string;
  expiresAt: number;
}

@Injectable()
export class SystemConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemConfigService.name);

  /** Cache: "GROUP:KEY" → value + expiry */
  private readonly cache = new Map<string, CachedEntry>();

  /** Cache TTL: 5 minutes (300,000 ms) */
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(SystemConfigEntity)
    private readonly configRepo: Repository<SystemConfigEntity>,
  ) {}

  async onModuleInit() {
    // Pre-warm cache with all active settings
    try {
      const allConfig = await this.configRepo.find({ where: { isActive: true } });
      for (const entry of allConfig) {
        const cacheKey = `${entry.configGroup}:${entry.configKey}`;
        this.cache.set(cacheKey, {
          value: entry.configValue,
          expiresAt: Date.now() + this.CACHE_TTL_MS,
        });
      }
      this.logger.log(`⚙️ System config loaded: ${allConfig.length} settings cached`);
    } catch (error) {
      this.logger.warn(`⚙️ Could not pre-warm system config cache: ${error.message}. Will fetch on demand.`);
    }

    // Cleanup expired entries every 10 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // READ
  // ═══════════════════════════════════════════════════════════

  /**
   * Get a single config value.
   * Returns the stored value or `defaultValue` if not found/inactive.
   */
  async get(group: string, key: string, defaultValue: string): Promise<string> {
    const cacheKey = `${group}:${key}`;

    // 1. Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    // 2. Query DB
    try {
      const entry = await this.configRepo.findOne({
        where: { configGroup: group, configKey: key, isActive: true },
      });

      if (entry) {
        this.cache.set(cacheKey, {
          value: entry.configValue,
          expiresAt: Date.now() + this.CACHE_TTL_MS,
        });
        return entry.configValue;
      }
    } catch (error) {
      this.logger.warn(`Failed to read system_config [${group}:${key}]: ${error.message}`);
    }

    return defaultValue;
  }

  /**
   * Synchronous cache-only read (no DB fallback).
   * Use in hot paths where you can't await. Returns defaultValue if not cached.
   */
  getSync(group: string, key: string, defaultValue: string): string {
    const cacheKey = `${group}:${key}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    // Trigger async refill for next call
    this.get(group, key, defaultValue).catch(() => {});
    return defaultValue;
  }

  /**
   * Get all settings in a group as a key-value map.
   */
  async getGroup(group: string): Promise<Record<string, string>> {
    try {
      const entries = await this.configRepo.find({
        where: { configGroup: group, isActive: true },
      });

      const result: Record<string, string> = {};
      for (const entry of entries) {
        result[entry.configKey] = entry.configValue;
        // Also refresh cache
        this.cache.set(`${group}:${entry.configKey}`, {
          value: entry.configValue,
          expiresAt: Date.now() + this.CACHE_TTL_MS,
        });
      }
      return result;
    } catch (error) {
      this.logger.warn(`Failed to read system_config group [${group}]: ${error.message}`);
      return {};
    }
  }

  /**
   * Typed helpers
   */
  async getNumber(group: string, key: string, defaultValue: number): Promise<number> {
    const val = await this.get(group, key, String(defaultValue));
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  async getBoolean(group: string, key: string, defaultValue: boolean): Promise<boolean> {
    const val = await this.get(group, key, String(defaultValue));
    return val === 'true' || val === '1';
  }

  // ═══════════════════════════════════════════════════════════
  // ADMIN — Full entity access for CRUD admin panel
  // ═══════════════════════════════════════════════════════════

  /**
   * Get all config entries (optionally filtered). Returns full entities for admin UI.
   */
  async getAll(filters?: { group?: string; isActive?: boolean }): Promise<SystemConfigEntity[]> {
    const where: any = {};
    if (filters?.group) where.configGroup = filters.group;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;
    return this.configRepo.find({ where, order: { configGroup: 'ASC', configKey: 'ASC' } });
  }

  /**
   * Get a single config entity by group + key (including inactive).
   */
  async getEntity(group: string, key: string): Promise<SystemConfigEntity | null> {
    return this.configRepo.findOne({ where: { configGroup: group, configKey: key } });
  }

  /**
   * List all distinct group names with counts.
   */
  async getGroupSummaries(): Promise<{ group: string; count: number; activeCount: number }[]> {
    const raw = await this.configRepo
      .createQueryBuilder('c')
      .select('c.config_group', 'group_name')
      .addSelect('COUNT(*)', 'total')
      .addSelect('SUM(CASE WHEN c.is_active = 1 THEN 1 ELSE 0 END)', 'active')
      .groupBy('c.config_group')
      .orderBy('c.config_group', 'ASC')
      .getRawMany();

    return raw.map((r) => ({
      group: r.group_name,
      count: parseInt(r.total, 10),
      activeCount: parseInt(r.active, 10),
    }));
  }

  /**
   * Hard-delete a config entry (permanent). Use deactivate() for soft-delete.
   */
  async remove(group: string, key: string): Promise<boolean> {
    const result = await this.configRepo.delete({ configGroup: group, configKey: key });
    this.cache.delete(`${group}:${key}`);
    return (result.affected ?? 0) > 0;
  }

  /**
   * Reactivate a previously deactivated config entry.
   */
  async reactivate(group: string, key: string, updatedBy?: string): Promise<void> {
    const entity = await this.configRepo.findOne({ where: { configGroup: group, configKey: key } });
    if (!entity) throw new Error(`Config [${group}:${key}] not found`);
    entity.isActive = true;
    if (updatedBy) entity.updatedBy = updatedBy;
    await this.configRepo.save(entity);
    this.cache.set(`${group}:${key}`, {
      value: entity.configValue,
      expiresAt: Date.now() + this.CACHE_TTL_MS,
    });
    this.logger.log(`⚙️ Config reactivated: [${group}:${key}]`);
  }

  // ═══════════════════════════════════════════════════════════
  // WRITE
  // ═══════════════════════════════════════════════════════════

  /**
   * Set a config value (upsert). Creates if not exists, updates if exists.
   */
  async set(
    group: string,
    key: string,
    value: string,
    updatedBy?: string,
    options?: { description?: string; valueType?: string },
  ): Promise<void> {
    try {
      const existing = await this.configRepo.findOne({
        where: { configGroup: group, configKey: key },
      });

      if (existing) {
        existing.configValue = value;
        existing.isActive = true;
        if (updatedBy) existing.updatedBy = updatedBy;
        if (options?.description) existing.description = options.description;
        if (options?.valueType) existing.valueType = options.valueType;
        await this.configRepo.save(existing);
      } else {
        await this.configRepo.save({
          configGroup: group,
          configKey: key,
          configValue: value,
          isActive: true,
          updatedBy: updatedBy || null,
          description: options?.description || null,
          valueType: options?.valueType || 'STRING',
        });
      }

      // Update cache immediately
      this.cache.set(`${group}:${key}`, {
        value,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });

      this.logger.log(`⚙️ Config updated: [${group}:${key}] = ${value}${updatedBy ? ` by ${updatedBy}` : ''}`);
    } catch (error) {
      this.logger.error(`Failed to set system_config [${group}:${key}]: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deactivate a config entry (soft-delete). The row stays for audit.
   */
  async deactivate(group: string, key: string, updatedBy?: string): Promise<void> {
    await this.configRepo.update(
      { configGroup: group, configKey: key },
      { isActive: false, updatedBy: updatedBy || null },
    );
    this.cache.delete(`${group}:${key}`);
    this.logger.log(`⚙️ Config deactivated: [${group}:${key}]`);
  }

  // ═══════════════════════════════════════════════════════════
  // CACHE MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  /**
   * Invalidate a specific entry from cache (forces DB read on next access)
   */
  invalidate(group: string, key: string): void {
    this.cache.delete(`${group}:${key}`);
  }

  /**
   * Invalidate all entries in a group
   */
  invalidateGroup(group: string): void {
    const prefix = `${group}:`;
    for (const k of this.cache.keys()) {
      if (k.startsWith(prefix)) this.cache.delete(k);
    }
  }

  /**
   * Force full cache refresh from DB
   */
  async refreshCache(): Promise<number> {
    this.cache.clear();
    const allConfig = await this.configRepo.find({ where: { isActive: true } });
    for (const entry of allConfig) {
      this.cache.set(`${entry.configGroup}:${entry.configKey}`, {
        value: entry.configValue,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
    }
    this.logger.log(`⚙️ System config cache refreshed: ${allConfig.length} entries`);
    return allConfig.length;
  }

  private cleanup(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(`Cleaned up ${removed} expired system config cache entries`);
    }
  }
}
