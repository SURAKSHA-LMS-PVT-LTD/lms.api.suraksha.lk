import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

/**
 * Rate Limiting Interceptor
 * Simple in-memory rate limiting for API endpoints.
 * In production, prefer Redis-backed rate limiting for multi-instance deployments.
 *
 * Memory safety: the map is capped at MAX_ENTRIES. When the cap is hit, all
 * expired entries are evicted first; if still over cap, the oldest 20 % are
 * dropped (LRU-approximate) so the server can never OOM on unique-IP floods.
 */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly requests = new Map<string, { count: number; resetTime: number }>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private static readonly MAX_ENTRIES = 50_000;
  private cleanupCallCount = 0;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const identifier = this.getIdentifier(request);

    this.checkRateLimit(identifier);

    // Run cleanup every 500 requests to amortise the O(n) scan cost
    this.cleanupCallCount++;
    if (this.cleanupCallCount >= 500) {
      this.cleanupCallCount = 0;
      this.cleanupExpiredEntries();
    }

    return next.handle();
  }

  private getIdentifier(request: Request): string {
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    // Only first 50 chars of user-agent to bound key size
    const userAgent = (request.get('user-agent') || 'unknown').substring(0, 50);
    return `${ip}:${userAgent}`;
  }

  private checkRateLimit(identifier: string): void {
    const now = Date.now();
    const current = this.requests.get(identifier);

    if (!current || now > current.resetTime) {
      this.enforceSizeCap();
      this.requests.set(identifier, { count: 1, resetTime: now + this.windowMs });
      return;
    }

    if (current.count >= this.maxRequests) {
      throw new BadRequestException({
        message: 'Rate limit exceeded. Too many requests.',
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((current.resetTime - now) / 1000),
      });
    }

    current.count++;
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [key, value] of this.requests.entries()) {
      if (now > value.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  private enforceSizeCap(): void {
    if (this.requests.size < RateLimitInterceptor.MAX_ENTRIES) return;

    // First pass: remove expired entries
    this.cleanupExpiredEntries();
    if (this.requests.size < RateLimitInterceptor.MAX_ENTRIES) return;

    // Second pass: drop oldest 20 % (Map iteration order is insertion order)
    const dropCount = Math.ceil(this.requests.size * 0.2);
    let dropped = 0;
    for (const key of this.requests.keys()) {
      if (dropped >= dropCount) break;
      this.requests.delete(key);
      dropped++;
    }
  }
}
