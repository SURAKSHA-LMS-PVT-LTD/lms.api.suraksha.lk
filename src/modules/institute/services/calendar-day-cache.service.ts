import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InstituteCalendarDayEntity } from '../entities/institute-calendar-day.entity';
import { InstituteCalendarService } from './institute-calendar.service';
import { getCurrentSriLankaDate } from '../../../common/utils/timezone.util';

interface CacheEntry {
  day: InstituteCalendarDayEntity;
  defaultEventId: string | null; // ✅ Cache default event ID to eliminate DB query per attendance mark
  expiresAt: number;
}

@Injectable()
export class CalendarDayCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CalendarDayCacheService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(private readonly calendarService: InstituteCalendarService) {
    // Start cleanup interval (every hour)
    this.cleanupInterval = setInterval(() => this.cleanup(), 3600000);
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Get today's calendar day for an institute (with caching)
   * Returns both the calendar day and cached default event ID
   */
  async getTodayCalendarDay(
    instituteId: string,
  ): Promise<{ day: InstituteCalendarDayEntity; defaultEventId: string | null }> {
    return this.getCalendarDayForDate(instituteId, this.getTodayDateString());
  }

  /**
   * Get calendar day for a specific date (with caching)
   * Used when marking attendance for a date other than today
   */
  async getCalendarDayForDate(
    instituteId: string,
    dateStr: string,
  ): Promise<{ day: InstituteCalendarDayEntity; defaultEventId: string | null }> {
    const cacheKey = `${instituteId}_${dateStr}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`Cache HIT for ${cacheKey}`);
      return { day: cached.day, defaultEventId: cached.defaultEventId };
    }

    this.logger.debug(`Cache MISS for ${cacheKey}`);

    // Fetch from database — getOrCreateCalendarDay accepts a date string
    const day = await this.calendarService.getOrCreateCalendarDay(
      instituteId,
      dateStr,
    );

    // Also fetch and cache default event to eliminate DB query per attendance mark
    let defaultEventId: string | null = null;
    try {
      const defaultEvent = await this.calendarService.getDefaultEventForDay(String(day.id));
      defaultEventId = defaultEvent ? String(defaultEvent.id) : null;
    } catch (err) {
      this.logger.warn(`Failed to fetch default event for day ${day.id}: ${err.message}`);
    }

    // Cache until midnight (Sri Lanka timezone)
    const midnightExpiry = this.getNextMidnightTimestamp();
    this.cache.set(cacheKey, {
      day,
      defaultEventId,
      expiresAt: midnightExpiry,
    });

    return { day, defaultEventId };
  }

  /**
   * Invalidate cache for a specific institute and date
   * If no date provided, invalidates today's cache
   */
  invalidate(instituteId: string, dateStr?: string): void {
    const targetDate = dateStr || this.getTodayDateString();
    const cacheKey = `${instituteId}_${targetDate}`;
    this.cache.delete(cacheKey);
    this.logger.log(`Invalidated cache for ${cacheKey}`);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.logger.log('Cleared all calendar cache');
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  // Helper methods
  private getTodayDateString(): string {
    // Use centralized timezone utility for consistency
    return getCurrentSriLankaDate();
  }

  private getNextMidnightTimestamp(): number {
    // Get midnight in Sri Lanka timezone (Asia/Colombo, UTC+5:30)
    const now = new Date();
    
    // Format current time in Sri Lanka timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(now);
    const values: Record<string, string> = {};
    parts.forEach((part) => {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    });
    
    // Create midnight tomorrow in Sri Lanka (next day at 00:00 Sri Lanka = 18:30 UTC previous day)
    // Sri Lanka is UTC+5:30, so midnight Sri Lanka = UTC time - 5h30m
    const tomorrowMidnightUTC = new Date(
      Date.UTC(
        parseInt(values.year),
        parseInt(values.month) - 1,
        parseInt(values.day) + 1,
        0,
        0,
        0,
        0,
      ),
    );
    // Subtract 5h30m offset to convert Sri Lanka midnight to UTC timestamp
    const SRI_LANKA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    return tomorrowMidnightUTC.getTime() - SRI_LANKA_OFFSET_MS;
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
      this.logger.debug(`Cleaned up ${removed} expired cache entries`);
    }
  }
}
