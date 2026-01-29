import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { SecureRequest } from '../guards/api-frontend.guard';
import { getCurrentSriLankaISO } from '../../../common/utils/timezone.util';

@Injectable()
export class SecurityMonitoringInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SecurityMonitoringInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<SecureRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();
    
    const requestId = request.securityContext?.requestId || 'unknown';
    const userInfo = request.user ? `${request.user.email} (${request.user.userType})` : 'anonymous';


    // Add security headers to response
    this.addSecurityHeaders(response);

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        
        // Log sensitive operations
        if (this.isSensitiveOperation(request)) {
          this.logSensitiveOperation(request, requestId, 'SUCCESS');
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logger.error(`❌ [${requestId}] Request Failed (${duration}ms) - Error: ${error.message}`);
        
        // Log security incidents
        if (this.isSecurityIncident(error)) {
          this.logSecurityIncident(request, requestId, error);
        }

        // Log sensitive operation failures
        if (this.isSensitiveOperation(request)) {
          this.logSensitiveOperation(request, requestId, 'FAILED', error.message);
        }

        return throwError(error);
      })
    );
  }

  private addSecurityHeaders(response: Response): void {
    // Add security headers
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-XSS-Protection', '1; mode=block');
    response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'");
  }

  private isSensitiveOperation(request: SecureRequest): boolean {
    const sensitivePatterns = [
      /\/auth\//,
      /\/password/,
      /\/admin/,
      /\/delete/,
      /\/payment/,
      /\/verify/,
      /\/users.*\/activate/,
      /\/users.*\/deactivate/,
    ];

    return sensitivePatterns.some(pattern => pattern.test(request.url)) ||
           ['DELETE', 'PATCH'].includes(request.method);
  }

  private isSecurityIncident(error: any): boolean {
    const securityErrors = [
      'UnauthorizedException',
      'ForbiddenException',
      'ThrottlerException',
    ];

    return securityErrors.includes(error.constructor.name) ||
           error.message.includes('token') ||
           error.message.includes('authentication') ||
           error.message.includes('authorization');
  }

  private logSensitiveOperation(request: SecureRequest, requestId: string, status: string, error?: string): void {
    const logData = {
      requestId,
      timestamp: getCurrentSriLankaISO(),
      method: request.method,
      url: request.url,
      userEmail: request.user?.email || 'anonymous',
      userType: request.user?.userType || 'unknown',
      instituteId: request.instituteUser?.instituteId || null,
      permissions: request.permissions || [],
      clientIp: request.ip || request.connection.remoteAddress,
      userAgent: request.headers['user-agent'],
      status,
      error: error || null,
    };

    this.logger.warn(`🔐 SENSITIVE_OPERATION: ${JSON.stringify(logData)}`);
  }

  private logSecurityIncident(request: SecureRequest, requestId: string, error: any): void {
    const incidentData = {
      requestId,
      timestamp: getCurrentSriLankaISO(),
      incidentType: error.constructor.name,
      method: request.method,
      url: request.url,
      clientIp: request.ip || request.connection.remoteAddress,
      userAgent: request.headers['user-agent'],
      userEmail: request.user?.email || 'anonymous',
      errorMessage: error.message,
      headers: this.sanitizeHeaders(request.headers),
    };

    this.logger.error(`🚨 SECURITY_INCIDENT: ${JSON.stringify(incidentData)}`);
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    // Remove sensitive headers from logs
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];
    return sanitized;
  }
}
