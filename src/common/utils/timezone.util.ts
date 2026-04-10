/**
 * Timezone Utility for Sri Lanka Time (Asia/Colombo, UTC+5:30)
 * Centralizes all date/time operations to ensure consistency across the application
 */

export const TIMEZONE = {
  name: 'Asia/Colombo',
  offset: '+05:30',
  offsetMinutes: 330, // 5 hours 30 minutes in minutes
  offsetMilliseconds: 19800000, // 5 hours 30 minutes in milliseconds
};

/**
 * Get current date/time in Sri Lanka timezone
 * Returns a Date object that when saved to database shows Sri Lanka local time
 * This is the CORRECT implementation for database storage
 */
export function getCurrentSriLankaTime(): Date {
  // Get current time in Sri Lanka timezone using Intl API
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE.name,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(new Date());
  const values: Record<string, string> = {};
  parts.forEach(part => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });
  
  // Create UTC timestamp using Date.UTC() with Sri Lanka time components
  // This treats the Sri Lanka time as if it were UTC
  const utcTimestamp = Date.UTC(
    parseInt(values.year),
    parseInt(values.month) - 1, // Month is 0-indexed
    parseInt(values.day),
    parseInt(values.hour),
    parseInt(values.minute),
    parseInt(values.second || '0'),
    0 // milliseconds
  );
  
  // Create Date object from this timestamp
  // This Date, when converted to ISO or saved to DB, will show Sri Lanka time
  const sriLankaDate = new Date(utcTimestamp);
  
  return sriLankaDate;
}

/**
 * Get current date in Sri Lanka timezone as YYYY-MM-DD string
 */
export function getCurrentSriLankaDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE.name }).format(new Date());
}

/**
 * Get current timestamp in Sri Lanka timezone as ISO string
 */
export function getCurrentSriLankaISO(): string {
  return getCurrentSriLankaTime().toISOString();
}

/**
 * Convert an epoch-millisecond timestamp to a YYYY-MM-DD date string
 * in Sri Lanka timezone (UTC+5:30).
 * This is the canonical way to derive the attendance date from a timestamp,
 * ensuring the date column always matches the timing of the mark.
 */
export function timestampToSriLankaDate(epochMs: number): string {
  // Shift the epoch to Sri Lanka local time, then read UTC components
  const d = new Date(epochMs + TIMEZONE.offsetMilliseconds);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert any date to Sri Lanka timezone
 * Handles dates from UTC database correctly
 */
export function toSriLankaTime(date: Date | string): Date {
  const inputDate = typeof date === 'string' ? new Date(date) : date;
  
  // Get UTC time
  const utcTime = Date.UTC(
    inputDate.getUTCFullYear(),
    inputDate.getUTCMonth(),
    inputDate.getUTCDate(),
    inputDate.getUTCHours(),
    inputDate.getUTCMinutes(),
    inputDate.getUTCSeconds(),
    inputDate.getUTCMilliseconds()
  );
  
  // Add Sri Lanka offset
  const sriLankaTime = new Date(utcTime + TIMEZONE.offsetMilliseconds);
  
  return sriLankaTime;
}

/**
 * Format date to Sri Lanka locale string
 * Example: "January 15, 2026"
 */
export function formatSriLankaDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const inputDate = typeof date === 'string' ? new Date(date) : date;
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE.name,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  };
  
  return inputDate.toLocaleDateString('en-US', defaultOptions);
}

/**
 * Format time to Sri Lanka locale string
 * Example: "2:30 PM"
 */
export function formatSriLankaTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const inputDate = typeof date === 'string' ? new Date(date) : date;
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE.name,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  };
  
  return inputDate.toLocaleTimeString('en-US', defaultOptions);
}

/**
 * Format date and time to Sri Lanka locale string
 * Example: "January 15, 2026, 2:30 PM"
 */
export function formatSriLankaDateTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const inputDate = typeof date === 'string' ? new Date(date) : date;
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE.name,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...options,
  };
  
  return inputDate.toLocaleString('en-US', defaultOptions);
}

/**
 * Get current time as a proper UTC Date for database storage.
 * The mysql2 connection (timezone:'+05:30') handles UTC→Sri Lanka conversion
 * automatically, so this must return real UTC — NOT fake UTC.
 *
 * Previous implementation used getCurrentSriLankaTime() which created a Date
 * with Sri Lanka components in UTC fields (fake UTC). Combined with mysql2's
 * +05:30 client-side conversion, this caused a double offset: timestamps were
 * stored 5h30m ahead of the correct value in MySQL.
 */
export function now(): Date {
  return new Date();
}

/**
 * Get current Unix timestamp in milliseconds (real UTC).
 * Equivalent to Date.now() — use this for all time math, JWT iat, and duration calculations.
 */
export function nowTimestamp(): number {
  return Date.now();
}

/**
 * Calculate expiry date N years from now (real UTC).
 * MySQL2 timezone:'+05:30' handles the UTC→SriLanka conversion on write.
 */
export function getExpiryDate(years: number): Date {
  const currentDate = new Date();
  currentDate.setFullYear(currentDate.getFullYear() + years);
  return currentDate;
}

/**
 * Format a Date object for MySQL DATETIME/TIMESTAMP columns
 * Uses the Sri Lanka time that's already "baked into" the Date from getCurrentSriLankaTime()
 * Returns format: 'YYYY-MM-DD HH:MM:SS'
 */
export function formatForMySQL(date: Date): string {
  // Use getUTC* methods since getCurrentSriLankaTime() stores Sri Lanka time as UTC values
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Ensure timezone is set before application starts
 */
export function ensureTimezoneSet(): void {
  if (process.env.TZ !== TIMEZONE.name) {
    process.env.TZ = TIMEZONE.name;
    console.log(`✅ Timezone set to ${TIMEZONE.name} (${TIMEZONE.offset})`);
  }
}

/**
 * Log current timezone information
 */
export function logTimezoneInfo(): void {
  const now = getCurrentSriLankaTime();
  const utcNow = new Date();
  console.log('🌍 Timezone Information:');
  console.log(`   - Timezone: ${TIMEZONE.name}`);
  console.log(`   - Offset: UTC${TIMEZONE.offset}`);
  console.log(`   - Current Sri Lanka Time: ${now.toISOString().replace('T', ' ').substring(0, 19)} (${formatSriLankaTime(utcNow)})`); // utcNow = real UTC; formatSriLankaTime applies Asia/Colombo correctly
  console.log(`   - Current UTC Time: ${utcNow.toISOString().replace('T', ' ').substring(0, 19)}`);
  console.log(`   - Current Date: ${getCurrentSriLankaDate()}`);
  console.log(`   - System TZ Variable: ${process.env.TZ || 'not set'}`);
}
