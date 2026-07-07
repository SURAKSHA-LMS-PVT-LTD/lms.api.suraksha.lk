import { BadRequestException } from '@nestjs/common';

/**
 * Unified date-range rules for attendance reads, matched to the monthly
 * partitioning of attendance_records (migration 1852000000000):
 *
 * - `month=YYYY-MM` — the canonical, preferred parameter. Resolves to that
 *   calendar month's first/last day; the query prunes to exactly ONE partition.
 * - `startDate`+`endDate` — still accepted for compatibility, but must span
 *   at most 31 days AND at most 2 adjacent calendar months (a rolling window
 *   like "last 7 days" crossing a month boundary touches exactly 2 partitions,
 *   which is still fast; anything wider forgoes pruning and is rejected).
 *
 * This replaces the previous per-endpoint caps (5/7/30/31/365 days) with one
 * consistent rule so the frontend can standardize on month-based fetching.
 */

export interface ResolvedDateRange {
  startDate: string; // YYYY-MM-DD inclusive
  endDate: string;   // YYYY-MM-DD inclusive
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** First and last day (YYYY-MM-DD) of a YYYY-MM month string. */
export function monthToRange(month: string): ResolvedDateRange {
  if (!MONTH_RE.test(month)) {
    throw new BadRequestException(`Invalid month "${month}". Expected format YYYY-MM, e.g. 2026-06.`);
  }
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day of this month
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Resolve a query's date window from either `month` or `startDate`/`endDate`.
 *
 * Returns null when neither is provided and no default is requested — callers
 * that previously defaulted to "last 7 days" pass `defaultDays` to keep that
 * behavior.
 */
export function resolveAttendanceDateRange(
  query: { month?: string; startDate?: string; endDate?: string },
  opts?: { defaultDays?: number },
): ResolvedDateRange | null {
  if (query.month) {
    return monthToRange(query.month);
  }

  const { startDate, endDate } = query;
  if (!startDate && !endDate) {
    if (opts?.defaultDays) {
      const end = new Date();
      const start = new Date();
      start.setUTCDate(start.getUTCDate() - (opts.defaultDays - 1));
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
      };
    }
    return null;
  }

  if (!startDate || !endDate) {
    throw new BadRequestException('Provide either month=YYYY-MM, or BOTH startDate and endDate.');
  }
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    throw new BadRequestException('Invalid date format. Expected YYYY-MM-DD.');
  }
  if (startDate > endDate) {
    throw new BadRequestException('startDate must be on or before endDate.');
  }

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > 31) {
    throw new BadRequestException(
      'Date range cannot exceed 31 days. Use month=YYYY-MM to fetch a full calendar month.',
    );
  }

  const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  if (monthIndex(end) - monthIndex(start) > 1) {
    throw new BadRequestException(
      'Date range cannot span more than 2 adjacent calendar months. Use month=YYYY-MM for month views.',
    );
  }

  return { startDate, endDate };
}
