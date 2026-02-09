/**
 * Shared utility for detecting and normalizing user identifier types.
 * Used by auth.service.ts, user.service.ts, and login flows.
 */

export type IdentifierType = 'email' | 'phone' | 'system_id' | 'birth_certificate';

export interface DetectedIdentifier {
  type: IdentifierType;
  normalized: string;
}

/**
 * Detect whether a given identifier is an email, phone number,
 * system ID (6-digit), or birth certificate number, and normalize it.
 */
export function detectIdentifierType(identifier: string): DetectedIdentifier {
  const trimmed = identifier.trim();

  // Email detection
  if (trimmed.includes('@') && trimmed.includes('.')) {
    return { type: 'email', normalized: trimmed.toLowerCase() };
  }

  // Sri Lankan phone number detection
  const phonePattern = /^(\+94|94|0)?7[012578]\d{7}$/;
  const digitsOnly = trimmed.replace(/^\+/, '');
  if (phonePattern.test(trimmed)) {
    let normalized = digitsOnly;
    if (normalized.startsWith('94')) {
      normalized = '0' + normalized.substring(2);
    } else if (!normalized.startsWith('0')) {
      normalized = '0' + normalized;
    }
    return { type: 'phone', normalized };
  }

  // 6-digit system ID
  if (/^\d{6}$/.test(trimmed)) {
    return { type: 'system_id', normalized: trimmed };
  }

  // Numeric-only birth certificate
  if (/^\d+$/.test(trimmed)) {
    return { type: 'birth_certificate', normalized: trimmed };
  }

  // Default: treat as email
  return { type: 'email', normalized: trimmed.toLowerCase() };
}
