/**
 * PII (Personally Identifiable Information) masking utilities for safe logging.
 * 
 * OWASP A09:2021 - Security Logging and Monitoring Failures
 * Never log full emails, phone numbers, passwords, or identity documents.
 */

/**
 * Mask an email address for safe logging.
 * "user@example.com" → "u***@e***.com"
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  const domainParts = domain.split('.');
  const maskedLocal = local[0] + '***';
  const maskedDomain = domainParts[0][0] + '***.' + domainParts.slice(1).join('.');
  return `${maskedLocal}@${maskedDomain}`;
}

/**
 * Mask a phone number for safe logging.
 * "+94771234567" → "+94***4567"
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return '***';
  const last4 = phone.slice(-4);
  const prefix = phone.slice(0, Math.min(3, phone.length - 4));
  return `${prefix}***${last4}`;
}

/**
 * Mask a generic identifier (NIC, birth cert, system ID, etc.)
 * Shows only first 2 and last 2 characters.
 * "123456789V" → "12***9V"
 */
export function maskIdentifier(id: string): string {
  if (!id || id.length <= 4) return '***';
  return `${id.slice(0, 2)}***${id.slice(-2)}`;
}

/**
 * Auto-detect identifier type and apply appropriate masking.
 * Safe for logging any user-provided identifier.
 */
export function maskPii(value: string): string {
  if (!value) return '***';
  const trimmed = value.trim();
  if (trimmed.includes('@')) return maskEmail(trimmed);
  if (/^\+?\d{9,}$/.test(trimmed.replace(/\s/g, ''))) return maskPhone(trimmed);
  return maskIdentifier(trimmed);
}
