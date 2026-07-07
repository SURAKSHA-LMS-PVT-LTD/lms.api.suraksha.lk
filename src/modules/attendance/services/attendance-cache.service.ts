import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../../common/services/cache.service';

/**
 * Month-scoped response cache for attendance reads, built for the monthly
 * partitioning model: a PAST month's attendance is immutable, so it caches
 * with a long TTL; the CURRENT month keeps changing, so it gets a short TTL
 * (staleness bounded to seconds, no invalidation bookkeeping needed).
 *
 * DISABLED unless BOTH are true:
 *   - CACHE_ENABLED=true              (global Redis switch — needs a cache server)
 *   - ATTENDANCE_CACHE_ENABLED=true   (attendance-specific switch)
 * When off, getOrCompute simply runs the fetcher — zero behavior change.
 *
 * TTLs (seconds):
 *   ATTENDANCE_CACHE_CURRENT_MONTH_TTL  default 60      (current month)
 *   ATTENDANCE_CACHE_PAST_MONTH_TTL     default 604800  (7 days — past months)
 */
@Injectable()
export class AttendanceCacheService {
  private readonly logger = new Logger(AttendanceCacheService.name);
  private readonly PREFIX = 'att:v1:';

  constructor(private readonly cacheService: CacheService) {}

  private get enabled(): boolean {
    return (
      process.env.CACHE_ENABLED === 'true' &&
      process.env.ATTENDANCE_CACHE_ENABLED === 'true'
    );
  }

  private get currentMonthTtl(): number {
    const n = parseInt(process.env.ATTENDANCE_CACHE_CURRENT_MONTH_TTL ?? '60', 10);
    return Number.isFinite(n) && n >= 10 ? n : 60;
  }

  private get pastMonthTtl(): number {
    const n = parseInt(process.env.ATTENDANCE_CACHE_PAST_MONTH_TTL ?? '604800', 10);
    return Number.isFinite(n) && n >= 60 ? n : 604800;
  }

  /**
   * TTL for a window ending at `endDate` (YYYY-MM-DD): long when the whole
   * window is in a past month (immutable data), short when it touches the
   * current month (or the future, e.g. an open month view).
   */
  private ttlFor(endDate: string): number {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return endDate.slice(0, 7) < currentMonth ? this.pastMonthTtl : this.currentMonthTtl;
  }

  /**
   * Cache-through helper for month/range-scoped attendance reads.
   * Key parts must include every filter that affects the result
   * (institute/class/subject/student/status/page/limit/dates...).
   */
  async getOrCompute<T>(
    keyParts: Array<string | number | undefined | null>,
    endDate: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    if (!this.enabled) {
      return fetcher();
    }

    const key = this.PREFIX + keyParts.map(p => p ?? '-').join(':');
    try {
      const hit = await this.cacheService.get<T>(key);
      if (hit !== null && hit !== undefined) {
        return hit;
      }
    } catch {
      // cache read problems must never break the request
    }

    const result = await fetcher();

    // Fire-and-forget write — response latency never waits on Redis.
    this.cacheService
      .set(key, result, { ttl: this.ttlFor(endDate) })
      .catch(() => undefined);

    return result;
  }
}
