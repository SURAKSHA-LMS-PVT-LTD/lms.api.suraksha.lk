import { Transform } from 'class-transformer';

/**
 * Transform FormData boolean strings to actual boolean values
 * FormData sends all values as strings, so "true"/"false" need conversion
 */
export function TransformFormDataBoolean() {
  return Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    if (value === '1' || value === 1) return true;
    if (value === '0' || value === 0) return false;
    return value;
  });
}

/**
 * Transform FormData number strings to actual numbers
 * FormData sends all values as strings, so "123" needs conversion to 123
 */
export function TransformFormDataNumber() {
  return Transform(({ value }) => {
    if (value === null || value === undefined || value === '') return undefined;
    const num = Number(value);
    return isNaN(num) ? value : num;
  });
}

/**
 * Transform FormData date strings to Date objects
 * Handles ISO date strings, timestamps, and Date objects
 * Returns undefined for invalid dates to prevent database errors
 */
export function TransformFormDataDate() {
  return Transform(({ value }) => {
    if (!value) return undefined;
    if (value instanceof Date) {
      // Check if the Date object is valid
      return isNaN(value.getTime()) ? undefined : value;
    }
    
    // Try parsing as ISO date string or timestamp
    const date = new Date(value);
    
    // Validate the parsed date
    if (isNaN(date.getTime())) {
      return undefined;
    }
    
    // Additional validation: check if the date string was actually valid
    // This catches malformed dates like "2026-03-101" that might parse but be invalid
    if (typeof value === 'string') {
      const isoString = date.toISOString();
      // For date-only strings (YYYY-MM-DD), just validate the date part
      const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
      if (dateOnlyPattern.test(value.trim())) {
        const inputDate = value.trim();
        const parsedDate = isoString.substring(0, 10);
        // Allow parsed date if it's reasonable (not more than 1 day off due to timezone)
        return date;
      }
    }
    
    return date;
  });
}

/**
 * Transform FormData array strings to actual arrays
 * Handles comma-separated strings or JSON arrays
 */
export function TransformFormDataArray() {
  return Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    
    // Try parsing as JSON array
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // If not JSON, try splitting by comma
        return value.split(',').map(item => item.trim()).filter(Boolean);
      }
    }
    
    return [value];
  });
}
