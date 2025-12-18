import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Cache Key Decorator
 * Extracts cache key from request parameters for cache operations
 */
export const CacheKey = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.params[data] : request.params;
  },
);

/**
 * User Cache Decorator
 * Extracts user ID from request for user cache operations
 */
export const UserCacheId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.id || request.params.userId || request.body.userId;
  },
);

/**
 * Bulk Cache Decorator
 * Extracts user IDs array from request for bulk cache operations
 */
export const BulkCacheIds = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.body.userIds || request.params.userIds || [];
  },
);

/**
 * Cache Control Headers Decorator
 * Sets cache control headers for HTTP responses
 */
export function CacheControl(maxAge: number = 3600) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);
      const response = args.find(arg => arg.res || arg.response);
      if (response) {
        response.set('Cache-Control', `public, max-age=${maxAge}`);
      }
      return result;
    };
  };
}
