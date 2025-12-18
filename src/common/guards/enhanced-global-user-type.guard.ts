/**
 * ⚠️ DEPRECATED GUARD
 * 
 * This guard is not used in the current implementation.
 * All validation should use CacheValidationGuard with @ValidateHybridAccess decorator.
 * 
 * This file is kept for backwards compatibility but should not be used.
 */

import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class EnhancedGlobalUserTypeGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // This guard is deprecated - use CacheValidationGuard instead
    return true;
  }
}
