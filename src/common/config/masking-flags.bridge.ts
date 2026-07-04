/**
 * Module-level cache for masking flags read from SystemConfigService.
 *
 * phone-mask.util.ts exports plain functions (used inside DTO @Transform
 * decorators, which have no access to Nest DI), so the live-editable
 * IS_EMAILS_MASKED / IS_PHONENUMBERS_MASKED / IS_ADDRESS_MASKED flags are
 * bridged here: main.ts populates this cache once at bootstrap and refreshes
 * it on a timer; the util functions read the cached value synchronously.
 */
let maskingFlags = {
  email: true,
  phone: true,
  address: true,
};

export function setMaskingFlags(flags: { email: boolean; phone: boolean; address: boolean }): void {
  maskingFlags = flags;
}

export function getMaskingFlags(): { email: boolean; phone: boolean; address: boolean } {
  return maskingFlags;
}
