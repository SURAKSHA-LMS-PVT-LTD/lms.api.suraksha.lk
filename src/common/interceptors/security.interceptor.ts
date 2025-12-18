import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { SecurityMonitoringService } from '../services/security-monitoring.service';
import { EncryptionService } from '../services/encryption.service';

/**
 * 🛡️ ADVANCED SECURITY INTERCEPTOR
 * Provides comprehensive request/response security monitoring and protection
 */
@Injectable()
export class SecurityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SecurityInterceptor.name);

  constructor(
    private securityMonitoring: SecurityMonitoringService,
    private encryption: EncryptionService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    // Pre-request security checks
    this.performPreRequestSecurity(request);

    return next.handle().pipe(
      tap((data) => {
        // Post-request security processing
        this.performPostRequestSecurity(request, response, data, startTime);
      }),
      catchError((error) => {
        // Error security monitoring
        this.handleSecurityError(request, response, error);
        throw error;
      })
    );
  }

  private performPreRequestSecurity(request: Request): void {
    const clientIP = this.getClientIP(request);
    
    // 🔍 1. Validate and sanitize input data
    this.validateAndSanitizeInput(request, clientIP);

    // 🔍 2. Check for suspicious patterns in request
    this.detectSuspiciousPatterns(request, clientIP);

    // 🔍 3. Validate content types
    this.validateContentTypes(request, clientIP);

    // 🔍 4. Check request size limits
    this.validateRequestSize(request, clientIP);

    // 🔍 5. Log security-relevant request details
    this.logSecurityRelevantRequest(request);
  }

  private performPostRequestSecurity(
    request: Request, 
    response: Response, 
    data: any, 
    startTime: number
  ): void {
    const clientIP = this.getClientIP(request);
    const responseTime = Date.now() - startTime;

    // 🔒 1. Sanitize response data (skip for auth endpoints)
    const isAuthEndpoint = request.path.includes('/v2/auth/login') || request.path.includes('/auth/refresh');
    if (!isAuthEndpoint) {
      this.sanitizeResponseData(data);
    }

    // 🔒 2. Add security headers if missing
    this.ensureSecurityHeaders(response);

    // 🔒 3. Log successful security processing
    this.logSecuritySuccess(request, response, responseTime);

    // 🔒 4. Check for data leakage
    this.checkForDataLeakage(request, response, data, clientIP);
  }

  private validateAndSanitizeInput(request: Request, clientIP: string): void {
    // Validate query parameters
    if (request.query && Object.keys(request.query).length > 0) {
      for (const [key, value] of Object.entries(request.query)) {
        const stringValue = Array.isArray(value) ? value.join(' ') : String(value || '');
        const validation = this.encryption.validateInput(stringValue);
        
        if (!validation.isValid) {
          this.securityMonitoring.recordSecurityEvent({
            type: 'MALICIOUS_REQUEST',
            ip: clientIP,
            description: `Malicious query parameter detected: ${key} - ${validation.reasons.join(', ')}`,
            severity: 'HIGH',
            userAgent: request.headers['user-agent'],
            path: request.path,
            method: request.method,
            metadata: { parameter: key, value: stringValue, reasons: validation.reasons }
          });
        }
      }
    }

    // Validate request body
    if (request.body && typeof request.body === 'object') {
      this.validateObjectRecursively(request.body, clientIP, request, 'body');
    }

    // Validate headers for injection attempts
    for (const [headerName, headerValue] of Object.entries(request.headers)) {
      if (typeof headerValue === 'string') {
        const validation = this.encryption.validateInput(headerValue);
        if (!validation.isValid) {
          this.securityMonitoring.recordSecurityEvent({
            type: 'MALICIOUS_REQUEST',
            ip: clientIP,
            description: `Malicious header detected: ${headerName} - ${validation.reasons.join(', ')}`,
            severity: 'HIGH',
            userAgent: request.headers['user-agent'],
            path: request.path,
            method: request.method,
            metadata: { header: headerName, value: headerValue, reasons: validation.reasons }
          });
        }
      }
    }
  }

  private validateObjectRecursively(
    obj: any, 
    clientIP: string, 
    request: Request, 
    path: string
  ): void {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = `${path}.${key}`;
      
      if (typeof value === 'string') {
        const validation = this.encryption.validateInput(value);
        if (!validation.isValid) {
          this.securityMonitoring.recordSecurityEvent({
            type: 'INJECTION_ATTEMPT',
            ip: clientIP,
            description: `Injection attempt in ${currentPath}: ${validation.reasons.join(', ')}`,
            severity: 'HIGH',
            userAgent: request.headers['user-agent'],
            path: request.path,
            method: request.method,
            metadata: { field: currentPath, value, reasons: validation.reasons }
          });
        }
      } else if (typeof value === 'object' && value !== null) {
        this.validateObjectRecursively(value, clientIP, request, currentPath);
      }
    }
  }

  private detectSuspiciousPatterns(request: Request, clientIP: string): void {
    const fullUrl = `${request.method} ${request.originalUrl}`;
    const userAgent = request.headers['user-agent'] || '';

    // Check for automated scanning tools
    const scanningPatterns = [
      /nmap/i,
      /nikto/i,
      /sqlmap/i,
      /burpsuite/i,
      /acunetix/i,
      /nessus/i,
      /openvas/i,
      /w3af/i,
    ];

    for (const pattern of scanningPatterns) {
      if (pattern.test(userAgent) || pattern.test(fullUrl)) {
        this.securityMonitoring.recordSecurityEvent({
          type: 'SCANNING_ATTEMPT',
          ip: clientIP,
          description: `Security scanning tool detected: ${pattern.source}`,
          severity: 'HIGH',
          userAgent,
          path: request.path,
          method: request.method,
          metadata: { pattern: pattern.source, fullUrl }
        });
      }
    }

    // Check for suspicious file access attempts
    const suspiciousFiles = [
      /\.env/i,
      /\.git/i,
      /\.aws/i,
      /\.ssh/i,
      /config\.php/i,
      /wp-config/i,
      /web\.config/i,
      /\.htaccess/i,
    ];

    for (const pattern of suspiciousFiles) {
      if (pattern.test(request.path)) {
        this.securityMonitoring.recordSecurityEvent({
          type: 'UNAUTHORIZED_FILE_ACCESS',
          ip: clientIP,
          description: `Attempt to access sensitive file: ${request.path}`,
          severity: 'HIGH',
          userAgent,
          path: request.path,
          method: request.method,
        });
      }
    }
  }

  private validateContentTypes(request: Request, clientIP: string): void {
    const contentType = request.headers['content-type'];
    const method = request.method;

    // For POST/PUT/PATCH requests, validate content type
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const allowedContentTypes = [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        'text/plain',
      ];

      if (contentType && !allowedContentTypes.some(allowed => contentType.includes(allowed))) {
        this.securityMonitoring.recordSecurityEvent({
          type: 'SUSPICIOUS_CONTENT_TYPE',
          ip: clientIP,
          description: `Unusual content type: ${contentType}`,
          severity: 'MEDIUM',
          userAgent: request.headers['user-agent'],
          path: request.path,
          method: request.method,
          metadata: { contentType }
        });
      }
    }
  }

  private validateRequestSize(request: Request, clientIP: string): void {
    const contentLength = parseInt(request.headers['content-length'] || '0');
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (contentLength > maxSize) {
      this.securityMonitoring.recordSecurityEvent({
        type: 'OVERSIZED_REQUEST',
        ip: clientIP,
        description: `Request size exceeds limit: ${contentLength} bytes`,
        severity: 'MEDIUM',
        userAgent: request.headers['user-agent'],
        path: request.path,
        method: request.method,
        metadata: { contentLength, maxSize }
      });
    }
  }

  private sanitizeResponseData(data: any): void {
    if (!data || typeof data !== 'object') return;

    // Remove sensitive fields from response (but allow access_token for authentication)
    const sensitiveFields = [
      'password',
      'secret',
      'key',
      'credential',
      'session',
      'csrf',
    ];

    // Fields that should be redacted but have exceptions
    const conditionalFields = {
      'token': ['access_token', 'refresh_token'], // Allow these token types
      'auth': ['access_token', 'refresh_token'],  // Allow these auth fields
    };

    this.removeSensitiveFieldsRecursively(data, sensitiveFields, conditionalFields);
  }

  private removeSensitiveFieldsRecursively(
    obj: any, 
    sensitiveFields: string[],
    conditionalFields: Record<string, string[]> = {}
  ): void {
    if (!obj || typeof obj !== 'object') return;
    
    // Skip Date objects to prevent them from being converted to empty objects
    if (obj instanceof Date) return;
    
    // Handle arrays
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'object' && obj[i] !== null && !(obj[i] instanceof Date)) {
          this.removeSensitiveFieldsRecursively(obj[i], sensitiveFields, conditionalFields);
        }
      }
      return;
    }

    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Check if this field is sensitive
      const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));
      
      // Check if this field has conditional sensitivity
      let isConditionallyAllowed = false;
      for (const [conditionalField, allowedKeys] of Object.entries(conditionalFields)) {
        if (lowerKey.includes(conditionalField.toLowerCase())) {
          isConditionallyAllowed = allowedKeys.some(allowed => 
            lowerKey === allowed.toLowerCase() || key === allowed
          );
          if (isConditionallyAllowed) break;
        }
      }
      
      if (isSensitive && !isConditionallyAllowed) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null && !(obj[key] instanceof Date)) {
        this.removeSensitiveFieldsRecursively(obj[key], sensitiveFields, conditionalFields);
      }
    }
  }

  private ensureSecurityHeaders(response: Response): void {
    // Ensure critical security headers are present
    const criticalHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
    };

    for (const [header, value] of Object.entries(criticalHeaders)) {
      if (!response.getHeader(header)) {
        response.setHeader(header, value);
      }
    }
  }

  private checkForDataLeakage(
    request: Request, 
    response: Response, 
    data: any, 
    clientIP: string
  ): void {
    if (!data || typeof data !== 'object') return;

    const dataString = JSON.stringify(data);
    const isAuthEndpoint = request.path.includes('/v2/auth/login');
    
    // Check for potential data leakage patterns (but allow access_token in auth responses)
    const leakagePatterns = [
      /password.*[:=]/i,
      /secret.*[:=]/i,
      /key.*[:=]/i,
      /bearer\s+[a-zA-Z0-9]/i,
      /api[_-]?key.*[:=]/i,
    ];

    // Only check for token leakage if not an auth endpoint
    if (!isAuthEndpoint) {
      leakagePatterns.push(/token.*[:=]/i);
    }

    for (const pattern of leakagePatterns) {
      if (pattern.test(dataString)) {
        this.securityMonitoring.recordSecurityEvent({
          type: 'DATA_LEAKAGE_RISK',
          ip: clientIP,
          description: `Potential sensitive data in response: ${pattern.source}`,
          severity: 'HIGH',
          userAgent: request.headers['user-agent'],
          path: request.path,
          method: request.method,
          metadata: { pattern: pattern.source }
        });
      }
    }
  }

  private logSecurityRelevantRequest(request: Request): void {
    const securityRelevantPaths = [
      '/auth',
      '/login',
      '/admin',
      '/api/secure',
      '/payment',
      '/user',
    ];

    const isSecurityRelevant = securityRelevantPaths.some(path => 
      request.path.toLowerCase().includes(path)
    );

    if (isSecurityRelevant) {
    }
  }

  private logSecuritySuccess(
    request: Request, 
    response: Response, 
    responseTime: number
  ): void {
    if (responseTime > 5000) { // Log slow requests
      this.logger.warn(`⏱️ Slow request detected: ${request.method} ${request.path} - ${responseTime}ms`);
    }
  }

  private handleSecurityError(request: Request, response: Response, error: any): void {
    const clientIP = this.getClientIP(request);
    
    this.securityMonitoring.recordSecurityEvent({
      type: 'REQUEST_ERROR',
      ip: clientIP,
      description: `Request resulted in error: ${error.message}`,
      severity: 'MEDIUM',
      userAgent: request.headers['user-agent'],
      path: request.path,
      method: request.method,
      metadata: { 
        errorMessage: error.message,
        errorStack: error.stack?.substring(0, 500) // Limit stack trace length
      }
    });
  }

  private getClientIP(request: Request): string {
    return (
      request.headers['cf-connecting-ip'] as string ||
      request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      request.headers['x-real-ip'] as string ||
      request.connection.remoteAddress ||
      'unknown'
    );
  }
}
