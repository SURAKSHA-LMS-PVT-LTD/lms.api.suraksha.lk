import { Injectable, CanActivate, GoneException } from '@nestjs/common';

/**
 * DeprecatedGuard — Blocks access to deprecated/disabled API endpoints.
 * Apply at controller class level with `@UseGuards(DeprecatedGuard)`.
 * Returns HTTP 410 Gone for all matching requests.
 *
 * Usage:
 *   @Controller('...')
 *   @UseGuards(DeprecatedGuard)
 *   export class LegacyController { ... }
 */
@Injectable()
export class DeprecatedGuard implements CanActivate {
  canActivate(): never {
    throw new GoneException(
      'This endpoint has been deprecated and is no longer available. ' +
      'Please use the class-level payments API instead.',
    );
  }
}
