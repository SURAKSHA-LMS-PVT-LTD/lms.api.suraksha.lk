import { SetMetadata } from '@nestjs/common';
import { ApiKeyScope } from '../entities/institute-api-key.entity';

export const API_KEY_SCOPE_KEY = 'institute_api_key_required_scope';

/**
 * Declares which `ApiKeyScope` an external/:v1 endpoint requires. Read by
 * `ApiKeyScopeGuard`, which must run after `InstituteApiKeyGuard` (so
 * `req.apiKey` is already populated) — apply both guards together:
 *
 *   @UseGuards(InstituteApiKeyGuard, ApiKeyScopeGuard)
 *   @RequireApiKeyScope(ApiKeyScope.STUDENT_CREATE)
 */
export const RequireApiKeyScope = (scope: ApiKeyScope) => SetMetadata(API_KEY_SCOPE_KEY, scope);
