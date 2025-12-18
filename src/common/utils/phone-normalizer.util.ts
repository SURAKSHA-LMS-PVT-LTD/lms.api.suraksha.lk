/**
 * 📞 PHONE NUMBER NORMALIZATION UTILITY
 * 
 * Ensures all phone numbers are stored in consistent format: +94XXXXXXXXX
 * Handles various input formats:
 * - 077XXXXXXX
 * - 94XXXXXXXXX
 * - +94XXXXXXXXX
 * - 0094XXXXXXXXX
 */

/**
 * Normalize Sri Lankan phone number to international format +94XXXXXXXXX
 * @param phoneNumber - Input phone number in any format
 * @returns Normalized phone number with +94 prefix
 */
export function normalizeSriLankanPhone(phoneNumber: string | null | undefined): string | null {
  if (!phoneNumber) return null;
  
  // Remove all whitespace, unicode marks, and non-numeric characters except +
  let cleaned = phoneNumber
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u200B\s\-\(\)\.]/g, '')
    .trim();
  
  if (!cleaned) return null;
  
  // Remove leading + if present for processing
  const hasPlus = cleaned.startsWith('+');
  if (hasPlus) {
    cleaned = cleaned.substring(1);
  }
  
  // Remove leading zeros (00, 0094, 094, etc.)
  cleaned = cleaned.replace(/^0+/, '');
  
  // Handle different formats
  if (cleaned.startsWith('94')) {
    // Already has country code: 94XXXXXXXXX
    return `+${cleaned}`;
  } else if (cleaned.startsWith('7') && cleaned.length === 9) {
    // Sri Lankan mobile without country code: 7XXXXXXXX
    return `+94${cleaned}`;
  } else if (cleaned.length === 10 && cleaned.startsWith('0')) {
    // Format: 0XXXXXXXXX
    return `+94${cleaned.substring(1)}`;
  } else if (cleaned.length === 9) {
    // Assume Sri Lankan number without leading 0: XXXXXXXXX
    return `+94${cleaned}`;
  }
  
  // If we can't determine format, return with + prefix if it looks valid
  if (cleaned.length >= 10 && cleaned.length <= 15 && /^\d+$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  
  // Invalid format
  return null;
}

/**
 * Validate if phone number is a valid Sri Lankan format after normalization
 * @param phoneNumber - Phone number to validate
 * @returns true if valid Sri Lankan number
 */
export function isValidSriLankanPhone(phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber) return false;
  
  const normalized = normalizeSriLankanPhone(phoneNumber);
  if (!normalized) return false;
  
  // Valid Sri Lankan mobile: +94 followed by 9 digits starting with 7
  // Valid Sri Lankan landline: +94 followed by 9 digits
  const mobileRegex = /^\+947\d{8}$/;
  const landlineRegex = /^\+94[1-9]\d{8}$/;
  
  return mobileRegex.test(normalized) || landlineRegex.test(normalized);
}

/**
 * Format phone number for display (masks middle digits for privacy)
 * @param phoneNumber - Phone number to format
 * @returns Masked phone number: +947****567
 */
export function maskPhoneNumber(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) return '';
  
  const normalized = normalizeSriLankanPhone(phoneNumber);
  if (!normalized || normalized.length < 8) return phoneNumber;
  
  // Show first 4 and last 3 digits
  const visible = 7;
  const masked = normalized.substring(0, 4) + '*'.repeat(normalized.length - visible) + normalized.substring(normalized.length - 3);
  return masked;
}
