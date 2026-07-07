import { getMaskingFlags } from '../config/masking-flags.bridge';

/**
 * Utility function to mask email addresses for security when enabled via environment variables.
 * When IS_EMAILS_MASKED=true (case-insensitive) the local part is obfuscated while the domain remains visible.
 * When the flag is disabled the original email string is returned unmodified (aside from trimming).
 */
export function maskEmail(email: string | null | undefined): string | undefined {
  if (!email) {
    return undefined;
  }

  const rawEmail = email.toString().trim();
  if (!rawEmail) {
    return undefined;
  }

  const shouldMask = getMaskingFlags().email;
  if (!shouldMask) {
    return rawEmail;
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return undefined;
  }

  const [localPart, domain] = rawEmail.split('@');

  if (!localPart || localPart.length === 0) {
    return undefined;
  }

  let maskedLocal: string;

  if (localPart.length === 1) {
    maskedLocal = `${localPart[0]}***`;
  } else if (localPart.length <= 3) {
    maskedLocal = `${localPart[0]}***`;
  } else if (localPart.length <= 6) {
    maskedLocal = `${localPart[0]}***${localPart.slice(-1)}`;
  } else {
    maskedLocal = `${localPart.slice(0, 2)}***${localPart.slice(-1)}`;
  }

  return `${maskedLocal}@${domain}`;
}

/**
 * Type guard to check if a value is a valid email format
 */
export function isValidEmailFormat(email: any): email is string {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const cleaned = email.trim();
  
  // Basic email format validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned);
}

/**
 * Examples of masked emails:
 * john@example.com → j***n@example.com
 * gotabaya@gmail.com → go***a@gmail.com
 * a@domain.com → a***@domain.com
 * test@company.co.uk → t***t@company.co.uk
 */

/**
 * Utility function to mask phone numbers for security
 * Shows only the first 2-3 digits (country code) and last 3 digits
 * Pattern: +93********456 (hides middle digits with asterisks)
 */
export function maskPhoneNumber(phoneNumber: string | null | undefined): string | undefined {
  if (!phoneNumber) {
    return undefined;
  }

  const cleanPhone = phoneNumber.toString().trim();

  // Check if it's a valid phone format (contains only digits, +, -, (, ), and spaces)
  if (!/^[\d\s\-\(\)\+]+$/.test(cleanPhone)) {
    return undefined;
  }

  const digits = cleanPhone.replace(/[^\d]/g, '');
  const hasPlus = cleanPhone.startsWith('+');

  if (!digits) {
    return undefined;
  }

  const shouldMask = getMaskingFlags().phone;
  if (!shouldMask) {
    return hasPlus ? `+${digits}` : digits;
  }

  if (digits.length <= 3) {
    const visible = digits[0] ?? '';
    return hasPlus ? `+${visible}***` : `${visible}***`;
  }

  const lastPart = digits.slice(-3);
  const firstPartLength = Math.min(3, Math.max(1, digits.length - 3));
  const firstPart = digits.slice(0, firstPartLength);
  const middleLength = Math.max(3, digits.length - firstPart.length - lastPart.length);
  const maskedMiddle = '*'.repeat(middleLength);

  const masked = `${firstPart}${maskedMiddle}${lastPart}`;
  return hasPlus ? `+${masked}` : masked;
}

/**
 * Type guard to check if a value is a valid phone number format
 */
export function isValidPhoneFormat(phone: any): phone is string {
  if (!phone || typeof phone !== 'string') {
    return false;
  }
  
  const cleaned = phone.trim();
  
  // Must have at least 6 characters and contain only digits, +, -, (, ), and spaces
  return cleaned.length >= 6 && /^[\d\s\-\(\)\+]+$/.test(cleaned);
}

/**
 * Examples of masked phone numbers:
 * +94123456789 → +94****789
 * +1234567890 → +12****890
 * +931234567890 → +93*****890
 * 1234567890 → +12****890
 * 94123456789 → +94****789
 */

/**
 * Utility function to mask a free-text home/delivery address for security when
 * enabled via the live-editable IS_ADDRESS_MASKED flag. Address is free text
 * (not a fixed-shape value like a phone/email), so the mask keeps only the
 * first word (usually the house/lot number or first line token) and replaces
 * everything else with asterisks, rather than character-position slicing.
 */
export function maskAddress(address: string | null | undefined): string | undefined {
  if (!address) {
    return undefined;
  }

  const rawAddress = address.toString().trim();
  if (!rawAddress) {
    return undefined;
  }

  const shouldMask = getMaskingFlags().address;
  if (!shouldMask) {
    return rawAddress;
  }

  const words = rawAddress.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return undefined;
  }

  const firstWord = words[0];
  if (words.length === 1) {
    // Single token — mask like an identifier (keep first char only).
    return firstWord.length <= 2 ? '***' : `${firstWord[0]}***`;
  }

  return `${firstWord} ***`;
}

/**
 * Examples of masked addresses:
 * "12 Galle Road, Colombo 03" → "12 ***"
 * "No. 45/A, Kandy" → "No. ***"
 * "Colombo" → "C***"
 */
