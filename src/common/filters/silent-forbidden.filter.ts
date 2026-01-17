import { ExceptionFilter, Catch, ArgumentsHost, ForbiddenException, HttpException } from '@nestjs/common';
import { Response } from 'express';
import { getCurrentSriLankaISO } from '../utils/timezone.util';

/**
 * 🔒 SILENT FORBIDDEN EXCEPTION FILTER
 * 
 * Purpose: Return empty 403 responses instead of JSON for security
 * - Makes the API appear unreachable (like DNS error)
 * - Prevents information leakage about API structure
 * - Only returns plain 403 status code
 * 
 * This applies to:
 * - Origin validation failures
 * - Unauthorized access attempts
 * - CORS violations
 */
@Catch(ForbiddenException)
export class SilentForbiddenExceptionFilter implements ExceptionFilter {
  catch(exception: ForbiddenException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      // 🚫 PRODUCTION: Silent rejection - return empty 403 (looks like network error)
      console.warn(`🚫 403 Forbidden - Path: ${request.url} | IP: ${request.ip || 'unknown'}`);
      response.status(403).send();
    } else {
      // 🔍 DEVELOPMENT: Return detailed error for debugging
      const exceptionResponse = exception.getResponse() as any;
      response.status(403).json({
        statusCode: 403,
        timestamp: getCurrentSriLankaISO(),
        path: request.url,
        message: exceptionResponse.message || 'Forbidden',
        error: exceptionResponse.error || 'Forbidden',
        ...(exceptionResponse.hint && { hint: exceptionResponse.hint })
      });
    }
  }
}
