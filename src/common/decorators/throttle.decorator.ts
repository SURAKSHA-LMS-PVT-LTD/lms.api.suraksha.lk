import { SetMetadata } from '@nestjs/common';

/**
 * 🔒 CUSTOM RATE LIMITING DECORATOR
 * 
 * Use this decorator to override global rate limits for specific endpoints
 * 
 * @example
 * // Strict limit for login (5 attempts per 15 minutes)
 * @Throttle({ default: { limit: 5, ttl: 900000 } })
 * @Post('login')
 * async login() { ... }
 * 
 * // Bypass rate limiting for specific endpoint
 * @SkipThrottle()
 * @Get('public')
 * async publicEndpoint() { ... }
 */

export const THROTTLE_KEY = 'throttle';
export const SKIP_THROTTLE_KEY = 'skipThrottle';

/**
 * Override rate limit for specific endpoint
 */
export interface ThrottleOptions {
  default?: {
    limit: number;  // Number of requests
    ttl: number;    // Time window in milliseconds
  };
  short?: {
    limit: number;
    ttl: number;
  };
  medium?: {
    limit: number;
    ttl: number;
  };
  long?: {
    limit: number;
    ttl: number;
  };
}

/**
 * Apply custom rate limit to endpoint
 * 
 * @param options - Rate limit configuration
 */
export const Throttle = (options: ThrottleOptions) => SetMetadata(THROTTLE_KEY, options);

/**
 * Skip rate limiting for specific endpoint
 */
export const SkipThrottle = (skip = true) => SetMetadata(SKIP_THROTTLE_KEY, skip);
