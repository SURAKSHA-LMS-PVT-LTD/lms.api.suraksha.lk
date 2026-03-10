import * as crypto from 'crypto';
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';
import { ValidationError } from 'class-validator';
import { ThrottlerException } from '@nestjs/throttler';
import { AuditService } from '../services/audit.service';
import { getCurrentSriLankaISO } from '../utils/timezone.util';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  constructor(private readonly auditService: AuditService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorInfo = this.getErrorInfo(exception);
    const timestamp = getCurrentSriLankaISO();
    const requestId = this.generateRequestId();

    // Log the error with appropriate level based on error type
    const logLevel = this.getLogLevel(errorInfo.type);
    this.logError(requestId, {
      timestamp,
      url: request.url,
      method: request.method,
      ip: request.ip,
      userAgent: request.headers['user-agent'] || 'Unknown',
      body: this.sanitizeBody(request.body),
      query: request.query,
      params: request.params,
      headers: this.sanitizeHeaders(request.headers),
      error: errorInfo,
      logLevel,
    });

    // Create audit log for the error
    this.auditService.createAuditLog({
      userId: this.extractUserId(request),
      action: 'ERROR',
      resource: this.extractResource(request.url),
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'] || 'Unknown',
      requestBody: this.sanitizeBody(request.body),
      statusCode: errorInfo.statusCode,
      duration: 0, // Duration not available in exception filter
      error: {
        type: errorInfo.type,
        message: errorInfo.message,
        details: errorInfo.details,
        stack: errorInfo.stack,
      },
      metadata: {
        requestId,
        query: request.query,
        params: request.params,
        timestamp,
      },
    });

    const isProduction = process.env.NODE_ENV === 'production';
    const isServerError = errorInfo.statusCode >= 500;

    // Send structured error response
    response.status(errorInfo.statusCode).json({
      success: false,
      statusCode: errorInfo.statusCode,
      timestamp,
      path: request.url,
      method: request.method,
      message: errorInfo.message,
      error: errorInfo.type,
      requestId,
      // Only include details for client errors in production; hide for server errors
      ...(errorInfo.details && (!isProduction || !isServerError) && { details: errorInfo.details }),
      ...(!isProduction && errorInfo.stack && { 
        stack: errorInfo.stack 
      }),
    });
  }

  private getErrorInfo(exception: unknown): {
    statusCode: number;
    message: string;
    type: string;
    details?: any;
    stack?: string;
  } {
    // Handle Throttler (Rate Limiting) Exceptions - Clean response
    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Please try again later.',
        type: 'RateLimitExceeded',
        details: {
          retryAfter: '60 seconds',
          hint: 'Please wait before making more requests'
        },
        // No stack trace for rate limiting
      };
    }

    // Handle NestJS HTTP Exceptions
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const isThrottlerRelated = exception.message?.includes('ThrottlerException') || 
                                exception.message?.includes('Too Many Requests');
      
      if (isThrottlerRelated) {
        return {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          type: 'RateLimitExceeded',
          details: {
            retryAfter: '60 seconds',
            hint: 'Please wait before making more requests'
          },
        };
      }

      // NestJS ValidationPipe produces: { message: string[], error: 'Bad Request', statusCode: 400 }
      // We must turn the array into a readable top-level message + structured details.
      if (typeof response === 'object' && Array.isArray((response as any).message)) {
        const validationMessages: string[] = (response as any).message;
        const firstMessage = validationMessages[0] || 'Validation failed';
        // Capitalise first letter and ensure it ends with a period.
        const friendlyFirst = firstMessage.charAt(0).toUpperCase() + firstMessage.slice(1);
        const suffix = validationMessages.length > 1 ? ` (and ${validationMessages.length - 1} more issue${validationMessages.length - 1 > 1 ? 's' : ''})` : '';
        return {
          statusCode: exception.getStatus(),
          message: `${friendlyFirst}${suffix}`,
          type: 'ValidationError',
          details: {
            actionHint: 'Please check the highlighted fields and correct the errors before submitting again.',
            fields: validationMessages,
          },
          stack: process.env.NODE_ENV === 'development' ? exception.stack : undefined,
        };
      }

      return {
        statusCode: exception.getStatus(),
        message: typeof response === 'string' ? response : (response as any).message || exception.message,
        type: 'HttpException',
        details: typeof response === 'object' ? response : undefined,
        stack: process.env.NODE_ENV === 'development' ? exception.stack : undefined,
      };
    }

    // Handle TypeORM Database Errors
    if (exception instanceof QueryFailedError) {
      return this.handleDatabaseError(exception);
    }

    if (exception instanceof EntityNotFoundError) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: 'The requested resource was not found',
        type: 'EntityNotFoundError',
        details: process.env.NODE_ENV !== 'production' ? exception.message : undefined,
        stack: process.env.NODE_ENV !== 'production' ? exception.stack : undefined,
      };
    }

    // Handle Validation Errors
    if (Array.isArray(exception) && exception[0] instanceof ValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        type: 'ValidationError',
        details: this.formatValidationErrors(exception),
      };
    }

    // Handle standard JavaScript errors
    if (exception instanceof Error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: process.env.NODE_ENV === 'production' 
          ? 'Internal server error occurred' 
          : exception.message,
        type: exception.constructor.name,
        stack: process.env.NODE_ENV !== 'production' ? exception.stack : undefined,
      };
    }

    // Handle unknown errors
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      type: 'UnknownError',
      details: process.env.NODE_ENV !== 'production'
        ? (typeof exception === 'object' ? JSON.stringify(exception) : String(exception))
        : undefined,
    };
  }

  private handleDatabaseError(error: QueryFailedError): {
    statusCode: number;
    message: string;
    type: string;
    details?: any;
    stack?: string;
  } {
    const message = error.message;
    const code = (error as any).code;
    const errno = (error as any).errno;
    const isDev = process.env.NODE_ENV !== 'production';

    // Handle specific MySQL error codes
    switch (code) {
      case 'ER_DUP_ENTRY':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'Duplicate entry: A record with this information already exists',
          type: 'DuplicateEntryError',
          details: this.extractDuplicateField(message),
          stack: isDev ? error.stack : undefined,
        };

      case 'ER_NO_REFERENCED_ROW_2':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Referenced record does not exist',
          type: 'ForeignKeyConstraintError',
          details: isDev ? message : undefined,
          stack: isDev ? error.stack : undefined,
        };

      case 'ER_ROW_IS_REFERENCED_2':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'Cannot delete: Record is being referenced by other records',
          type: 'ForeignKeyConstraintError',
          details: isDev ? message : undefined,
          stack: isDev ? error.stack : undefined,
        };

      case 'ER_DATA_TOO_LONG':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Data too long for field',
          type: 'DataTooLongError',
          details: isDev ? message : undefined,
          stack: isDev ? error.stack : undefined,
        };

      case 'ER_ACCESS_DENIED_ERROR':
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database access denied',
          type: 'DatabaseAccessError',
          stack: isDev ? error.stack : undefined,
        };

      case 'ER_BAD_DB_ERROR':
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database connection error',
          type: 'DatabaseConnectionError',
          stack: isDev ? error.stack : undefined,
        };

      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: isDev ? message : 'Database operation failed',
          type: 'DatabaseError',
          details: isDev ? { code, errno, message } : undefined,
          stack: isDev ? error.stack : undefined,
        };
    }
  }

  private extractDuplicateField(message: string): string {
    // Extract field name from MySQL duplicate entry error
    const match = message.match(/Duplicate entry '.*' for key '(\w+)'/);
    return match ? `Field: ${match[1]}` : 'Unknown field';
  }

  private formatValidationErrors(validationErrors: ValidationError[]): any {
    return validationErrors.map(error => ({
      property: error.property,
      value: error.value,
      constraints: error.constraints,
      children: error.children && error.children.length > 0 ? this.formatValidationErrors(error.children) : undefined,
    }));
  }

  private logError(requestId: string, errorData: any): void {
    const logLevel = errorData.logLevel || 'error';
    const emoji = this.getErrorEmoji(errorData.error.type);
    
    const logMessage = `${emoji} ${errorData.error.type.toUpperCase()} [${requestId}] ${errorData.method} ${errorData.url} - ${errorData.error.statusCode}`;
    
    const logData = {
      requestId,
      timestamp: errorData.timestamp,
      method: errorData.method,
      url: errorData.url,
      ip: errorData.ip,
      userAgent: errorData.userAgent,
      requestBody: errorData.body,
      query: errorData.query,
      params: errorData.params,
      error: {
        type: errorData.error.type,
        message: errorData.error.message,
        statusCode: errorData.error.statusCode,
        details: errorData.error.details,
        ...(process.env.NODE_ENV === 'development' && errorData.error.stack && {
          stack: errorData.error.stack
        }),
      },
    };

    // Use appropriate log level
    switch (logLevel) {
      case 'warn':
        this.logger.warn(logMessage, logData);
        break;
      case 'info':
        break;
      default:
        this.logger.error(logMessage, logData);
    }
  }

  private getErrorEmoji(errorType: string): string {
    switch (errorType) {
      case 'RateLimitExceeded': return 'ðŸš¦';
      case 'ValidationError': return 'âš ï¸';
      case 'DatabaseError': return 'ðŸ’¾';
      case 'HttpException': return 'ðŸ”´';
      case 'UnknownError': return 'ðŸ’¥';
      default: return 'âŒ';
    }
  }

  private getLogLevel(errorType: string): string {
    // Rate limiting is expected behavior, log as warning
    if (errorType === 'RateLimitExceeded') {
      return 'warn';
    }
    
    // Validation errors are expected, log as info
    if (errorType === 'ValidationError' || errorType === 'HttpException') {
      return 'info';
    }
    
    // Database and unexpected errors are serious
    if (errorType === 'DatabaseError' || errorType === 'UnknownError') {
      return 'error';
    }
    
    return 'error';
  }

  private extractUserId(request: Request): string | undefined {
    return request.user?.['id'] || 
           request.user?.['userId'] || 
           request.headers['user-id'] as string ||
           undefined;
  }

  private extractResource(url: string): string {
    const pathParts = url.split('/').filter(part => part && !part.startsWith('?'));
    return pathParts[0] || 'unknown';
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

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });
    
    return {
      'user-agent': sanitized['user-agent'],
      'content-type': sanitized['content-type'],
      'accept': sanitized['accept'],
      'host': sanitized['host'],
    };
  }

  private generateRequestId(): string {
    return `err_${Date.now()}_${crypto.randomBytes(6).toString('base64url')}`;
  }
}
