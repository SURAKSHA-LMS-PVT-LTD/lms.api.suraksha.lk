import * as crypto from 'crypto';
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { AuditService } from '../services/audit.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLog');

  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    const { method, originalUrl, ip, headers } = request;
    const userAgent = headers['user-agent'] || 'Unknown';
    const requestId = (request as any).requestId || (headers['x-request-id'] as string) || this.generateRequestId();

    response.setHeader('X-Request-ID', requestId);
    
    // Extract action and resource from route
    const { action, resource } = this.extractActionAndResource(method, originalUrl);
    
    const userId = this.extractUserId(request);

    return next.handle().pipe(
      tap({
        next: async (responseBody) => {
          const duration = Date.now() - startTime;

          this.logResponse(requestId, {
            method,
            url: originalUrl,
            statusCode: response.statusCode,
            duration,
            responseBody: this.sanitizeResponse(responseBody),
            userId,
          });
          
          // Save to audit service
          await this.auditService.createAuditLog({
            userId,
            action,
            resource,
            method,
            url: originalUrl,
            ip,
            userAgent,
            requestBody: this.sanitizeBody(request.body),
            responseBody: this.sanitizeResponse(responseBody),
            statusCode: response.statusCode,
            duration,
            metadata: {
              requestId,
              query: request.query,
              params: request.params,
            },
          });
        },
        error: async (error) => {
          const duration = Date.now() - startTime;
          
          // Enhanced error logging with more details
          const errorDetails = {
            message: error.message,
            stack: error.stack,
            name: error.constructor.name,
            status: error.status || error.statusCode,
            response: error.response, // For HTTP exceptions
          };

          this.logError(requestId, {
            method,
            url: originalUrl,
            statusCode: error.status || error.statusCode || response.statusCode || 500,
            duration,
            error: errorDetails,
            requestBody: this.sanitizeBody(request.body),
            userId,
            ip,
          });
          
          // Save error to audit service
          await this.auditService.createAuditLog({
            userId,
            action,
            resource,
            method,
            url: originalUrl,
            ip,
            userAgent,
            requestBody: this.sanitizeBody(request.body),
            statusCode: error.status || error.statusCode || response.statusCode || 500,
            duration,
            error: errorDetails,
            metadata: {
              requestId,
              query: request.query,
              params: request.params,
            },
          });
        },
      }),
    );
  }

  private extractActionAndResource(method: string, url: string): { action: string; resource: string } {
    // Remove query parameters and split the URL
    const cleanUrl = url.split('?')[0];
    const pathParts = cleanUrl.split('/').filter(part => part.trim() !== '');
    
    // Extract resource - first meaningful part of the path
    let resource = 'unknown';
    if (pathParts.length > 0) {
      resource = pathParts[0];
    }
    
    // Handle special cases where resource might be in a different position
    if (resource === 'api' && pathParts.length > 1) {
      resource = pathParts[1]; // For URLs like /api/users
    }
    
    
    let action = 'READ';
    
    switch (method.toUpperCase()) {
      case 'POST':
        action = url.includes('login') ? 'LOGIN' : 'CREATE';
        break;
      case 'GET':
        action = 'READ';
        break;
      case 'PUT':
      case 'PATCH':
        action = 'UPDATE';
        break;
      case 'DELETE':
        action = 'DELETE';
        break;
    }

    // Special cases
    if (url.includes('activate')) action = 'ACTIVATE';
    if (url.includes('deactivate')) action = 'DEACTIVATE';
    if (url.includes('statistics')) action = 'VIEW_STATS';
    if (url.includes('search')) action = 'SEARCH';

    return { action, resource };
  }

  private extractUserId(request: Request): string | undefined {
    // Try to extract user ID from various sources
    return request.user?.['id'] || 
           request.user?.['userId'] || 
           request.headers['user-id'] as string ||
           undefined;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${crypto.randomBytes(6).toString('base64url')}`;
  }

  private sanitizeBody(body: any): any {
    if (!body) return null;
    
    const sanitized = { ...body };
    
    // ðŸ”’ COMPREHENSIVE PASSWORD SANITIZATION - Remove all sensitive fields
    const sensitiveFields = [
      'password', 
      'currentPassword', 
      'newPassword', 
      'confirmPassword',
      'confirmNewPassword',
      'oldPassword',
      'token', 
      'secret', 
      'key', 
      'auth', 
      'authorization',
      'accessToken',
      'refreshToken',
      'apiKey'
    ];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    // Also check nested objects for sensitive fields
    Object.keys(sanitized).forEach(key => {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sensitiveFields.forEach(field => {
          if (sanitized[key][field]) {
            sanitized[key][field] = '[REDACTED]';
          }
        });
      }
    });
    
    return sanitized;
  }

  private sanitizeResponse(responseBody: any): any {
    if (!responseBody) return null;
    
    // Limit response body size in logs to avoid console flooding
    const responseStr = JSON.stringify(responseBody);
    if (responseStr.length > 4000) {
      return {
        ...responseBody,
        data: Array.isArray(responseBody.data) 
          ? `[Array of ${responseBody.data.length} items (Total size: ${responseStr.length} chars)]`
          : '[Large response body truncated]',
        _truncated: true,
        _originalSize: responseStr.length
      };
    }
    
    return responseBody;
  }

  private logResponse(requestId: string, data: any): void {
    const userSuffix = data.userId ? ` | user=${data.userId}` : '';
    const responseSuffix = data.responseBody ? ` | response=${this.previewBody(data.responseBody)}` : '';
    this.logger.log(
      `<< [${requestId}] ${data.method} ${data.url} | status=${data.statusCode} | duration=${data.duration}ms${userSuffix}${responseSuffix}`,
    );
  }

  private logError(requestId: string, data: any): void {
    this.logger.error(`ERROR [${requestId}] ${data.method} ${data.url} | status=${data.statusCode} | duration=${data.duration}ms`, {
      requestId,
      type: 'ERROR',
      method: data.method,
      url: data.url,
      statusCode: data.statusCode,
      duration: data.duration,
      error: data.error,
      requestBody: data.requestBody,
      userId: data.userId,
      ip: data.ip,
      timestamp: data.timestamp,
    });
    
    // Log validation errors in detail if it's a BadRequestException
    if (data.error?.name === 'BadRequestException' && data.error?.response?.message) {
      this.logger.error(`VALIDATION [${requestId}]`, {
        validationErrors: data.error.response.message,
        requestBody: data.requestBody,
      });
    }
  }

  private previewBody(body: any): string {
    const bodyString = JSON.stringify(body);
    if (bodyString.length <= 500) {
      return bodyString;
    }

    return `${bodyString.slice(0, 500)}...`;
  }
}
