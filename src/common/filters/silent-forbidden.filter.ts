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
    const exceptionResponse = exception.getResponse() as any;

    // Detect origin/CORS guard blocks: they set response.status(403).send() themselves
    // and never reach here. Any ForbiddenException that reaches this filter is from
    // business-logic code (FlexibleAccessGuard, device validation, permission checks).
    // We must return a proper JSON response so the frontend can show a useful message.

    const rawMessage: string =
      (typeof exceptionResponse === 'string' ? exceptionResponse : exceptionResponse?.message) ||
      'You do not have permission to perform this action.';

    // In production, never leak internal implementation details.
    // Map known technical messages to friendly ones.
    const friendlyMessage = isProduction ? toFriendlyForbidden(rawMessage) : rawMessage;

    console.warn(`🚫 403 Forbidden - Path: ${request.url} | IP: ${request.ip || 'unknown'} | Message: ${rawMessage}`);

    response.status(403).json({
      success: false,
      statusCode: 403,
      timestamp: getCurrentSriLankaISO(),
      path: request.url,
      message: friendlyMessage,
      error: 'Forbidden',
      ...(exceptionResponse?.hint && { hint: exceptionResponse.hint }),
      ...(!isProduction && { debug: rawMessage }),
    });
  }
}

/**
 * Convert internal ForbiddenException messages to safe, user-readable strings.
 * Never leak guard names, table names, or internal structure.
 */
function toFriendlyForbidden(msg: string): string {
  const lower = msg.toLowerCase();

  if (lower.includes('device')) {
    return 'This device is not authorised to mark attendance. Please contact your administrator.';
  }
  if (lower.includes('status') && lower.includes('allowed')) {
    return 'This attendance status is not permitted on your device.';
  }
  if (lower.includes('role') || lower.includes('permission') || lower.includes('access')) {
    return 'You do not have permission to perform this action.';
  }
  if (lower.includes('institute')) {
    return 'You are not authorised to access this institute\'s data.';
  }
  if (lower.includes('expired')) {
    return 'Your session or access has expired. Please log in again.';
  }
  return 'You do not have permission to perform this action.';
}
