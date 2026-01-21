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
  const date = getCurrentSriLankaTime();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Get current timestamp in Sri Lanka timezone as ISO string
 */
export function getCurrentSriLankaISO(): string {
  return getCurrentSriLankaTime().toISOString();
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
 * Create a new Date object with Sri Lanka timezone consideration
 * Use this instead of new Date() for current time
 */
export function now(): Date {
  return getCurrentSriLankaTime();
}

/**
 * Get Date.now() equivalent in Sri Lanka timezone
 */
export function nowTimestamp(): number {
  return getCurrentSriLankaTime().getTime();
}

/**
 * Calculate expiry date from current Sri Lanka time
 * @param years - Number of years to add
 */
export function getExpiryDate(years: number): Date {
  const currentDate = getCurrentSriLankaTime();
  currentDate.setFullYear(currentDate.getFullYear() + years);
  return currentDate;
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
  console.log(`   - Current Sri Lanka Time: ${now.toISOString().replace('T', ' ').substring(0, 19)} (${formatSriLankaTime(now)})`);
  console.log(`   - Current UTC Time: ${utcNow.toISOString().replace('T', ' ').substring(0, 19)}`);
  console.log(`   - Current Date: ${getCurrentSriLankaDate()}`);
  console.log(`   - System TZ Variable: ${process.env.TZ || 'not set'}`);
}
