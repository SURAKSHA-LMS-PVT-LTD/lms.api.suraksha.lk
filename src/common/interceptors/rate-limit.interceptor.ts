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
 * Simple in-memory rate limiting for API endpoints
 * In production, use Redis or similar distributed cache
 */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly requests = new Map<string, { count: number; resetTime: number }>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 100, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const identifier = this.getIdentifier(request);

    this.checkRateLimit(identifier);
    this.cleanupExpiredEntries();

    return next.handle();
  }

  private getIdentifier(request: Request): string {
    // Use IP address and user agent for identification
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const userAgent = request.get('user-agent') || 'unknown';
    return `${ip}:${userAgent.substring(0, 50)}`; // Limit user agent length
  }

  private checkRateLimit(identifier: string): void {
    const now = Date.now();
    const current = this.requests.get(identifier);

    if (!current || now > current.resetTime) {
      this.requests.set(identifier, { count: 1, resetTime: now + this.windowMs });
      return;
    }

    if (current.count >= this.maxRequests) {
      throw new BadRequestException({
        message: 'Rate limit exceeded. Too many requests.',
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((current.resetTime - now) / 1000)
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
}
