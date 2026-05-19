import { SetMetadata } from '@nestjs/common';

export const SKIP_ORIGIN_VALIDATION_KEY = 'skipOriginValidation';

/**
 * Mark a controller or route as exempt from Origin/Referer validation.
 * Use ONLY for external API endpoints that are authenticated by other means
 * (e.g. InstituteApiKeyGuard) and called by non-browser clients.
 */
export const SkipOriginValidation = () => SetMetadata(SKIP_ORIGIN_VALIDATION_KEY, true);
