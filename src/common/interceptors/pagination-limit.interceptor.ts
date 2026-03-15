import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

const MAX_LIMIT = 100;

/**
 * Global interceptor that caps the `limit` query parameter to prevent
 * unbounded queries that could cause DoS via resource exhaustion.
 */
@Injectable()
export class PaginationLimitInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    if (request?.query?.limit) {
      const parsed = Number(request.query.limit);
      if (!Number.isNaN(parsed) && parsed > MAX_LIMIT) {
        request.query.limit = String(MAX_LIMIT);
      }
    }
    return next.handle();
  }
}
