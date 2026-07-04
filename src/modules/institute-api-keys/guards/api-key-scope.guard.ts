import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_KEY_SCOPE_KEY } from '../decorators/require-api-key-scope.decorator';
import { ApiKeyScope } from '../entities/institute-api-key.entity';

/**
 * Enforces the scope declared by `@RequireApiKeyScope(...)`. Must run AFTER
 * `InstituteApiKeyGuard` in the guard chain so `req.apiKey` is already set.
 * Replaces the three independent, copy-pasted scope-check blocks that used to
 * live in ExternalStudentController/ExternalAttendanceController/ExternalClassController.
 */
@Injectable()
export class ApiKeyScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScope = this.reflector.getAllAndOverride<ApiKeyScope>(API_KEY_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredScope) return true;

    const req = context.switchToHttp().getRequest();
    const apiKey = req.apiKey;
    if (!apiKey?.scopes?.includes(requiredScope)) {
      throw new ForbiddenException(`API key does not have the '${requiredScope}' scope`);
    }
    return true;
  }
}
