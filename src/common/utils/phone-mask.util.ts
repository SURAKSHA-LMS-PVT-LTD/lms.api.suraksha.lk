const TRUTHY_ENV_VALUES = new Set(['true', '1', 'yes', 'on']);

function isMaskingEnabled(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
}

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

  const shouldMask = isMaskingEnabled(process.env.IS_EMAILS_MASKED);
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

  const shouldMask = isMaskingEnabled(process.env.IS_PHONENUMBERS_MASKED);
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
