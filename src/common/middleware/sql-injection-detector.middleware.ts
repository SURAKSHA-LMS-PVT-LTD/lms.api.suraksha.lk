import { Injectable, NestMiddleware, BadRequestException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * SQL Injection Detection Middleware
 * 
 * ✅ SECURITY: Emergency protection layer to detect SQL injection attempts
 * This middleware scans incoming requests for common SQL injection patterns
 * and blocks suspicious requests before they reach the application logic.
 * 
 * DEPLOYMENT PRIORITY: HIGH
 * Deploy this middleware immediately as defense-in-depth while code fixes are being implemented.
 * 
 * @example
 * // In main module:
 * export class AppModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer
 *       .apply(SqlInjectionDetectorMiddleware)
 *       .forRoutes('*'); // Apply to all routes
 *   }
 * }
 */
@Injectable()
export class SqlInjectionDetectorMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SqlInjectionDetectorMiddleware.name);

  /**
   * SQL Injection Patterns to Detect
   * These patterns match common SQL injection attack techniques
   */
  private readonly sqlInjectionPatterns = [
    // UNION-based injection
    /(\bUNION\b.*\bSELECT\b)/i,
    
    // Boolean-based blind injection
    /(\bOR\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+)/i,
    /(\bAND\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+)/i,
    
    // Time-based blind injection
    /(\bSLEEP\s*\()/i,
    /(\bBENCHMARK\s*\()/i,
    /(\bWAITFOR\s+DELAY\b)/i,
    
    // Stacked queries
    /(;\s*DROP\s+TABLE\b)/i,
    /(;\s*DELETE\s+FROM\b)/i,
    /(;\s*UPDATE\b.*\bSET\b)/i,
    /(;\s*INSERT\s+INTO\b)/i,
    
    // Comment-based injection
    /(--\s*$)/,
    /(\s+#\s*$)/,
    /(\/\*.*\*\/)/,
    
    // Information schema access
    /(\bINFORMATION_SCHEMA\b)/i,
    
    // System table access
    /(\bmysql\.user\b)/i,
    /(\bsys\.)/i,
    
    // SQL functions that shouldn't be in user input
    /(\bCONCAT\s*\(.*\bSELECT\b)/i,
    /(\bCONCAT_WS\s*\(.*\bSELECT\b)/i,
    /(\bGROUP_CONCAT\s*\(.*\bSELECT\b)/i,
    
    // Hex encoding attempts
    /(0x[0-9a-fA-F]+)/,
    
    // Quote manipulation
    /(['"]\s*\+\s*['"])/,
    /(['"]\s*\|\|\s*['"])/,
    
    // Multiple statements
    /(;\s*SELECT\b)/i,
    
    // Load file attempts
    /(\bLOAD_FILE\s*\()/i,
    /(\bINTO\s+OUTFILE\b)/i,
    /(\bINTO\s+DUMPFILE\b)/i,
    
    // Execution attempts
    /(\bEXEC\s*\()/i,
    /(\bEXECUTE\s*\()/i,
    /(\bxp_cmdshell\b)/i
  ];

  /**
   * Check if a value contains SQL injection patterns
   */
  private containsSqlInjection(value: any): boolean {
    if (typeof value === 'string') {
      // Only check strings that are long enough and look suspicious
      if (value.length > 2) {
        return this.sqlInjectionPatterns.some(pattern => pattern.test(value));
      }
      return false;
    }
    
    if (Array.isArray(value)) {
      return value.some(item => this.containsSqlInjection(item));
    }
    
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(val => this.containsSqlInjection(val));
    }
    
    return false;
  }

  /**
   * Extract suspicious payload for logging
   */
  private extractSuspiciousPayload(value: any, maxLength: number = 200): string {
    if (typeof value === 'string') {
      return value.length > maxLength ? value.substring(0, maxLength) + '...' : value;
    }
    
    if (Array.isArray(value) || typeof value === 'object') {
      const str = JSON.stringify(value);
      return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }
    
    return String(value);
  }

  /**
   * Middleware handler
   */
  use(req: Request, res: Response, next: NextFunction) {
    try {
      // Skip health check and static routes
      if (
        req.path === '/health' || 
        req.path === '/api/health' ||
        req.path.startsWith('/public/') ||
        req.path.startsWith('/assets/')
      ) {
        return next();
      }

      // Check request body
      if (req.body && Object.keys(req.body).length > 0) {
        if (this.containsSqlInjection(req.body)) {
          const suspiciousPayload = this.extractSuspiciousPayload(req.body);
          
          this.logger.warn(
            `🚨 SQL Injection attempt detected in request body!\n` +
            `  Path: ${req.method} ${req.path}\n` +
            `  IP: ${req.ip}\n` +
            `  User-Agent: ${req.get('user-agent')}\n` +
            `  Payload: ${suspiciousPayload}`
          );
          
          throw new BadRequestException(
            'Invalid request: Potential SQL injection pattern detected. ' +
            'If this is a legitimate request, please contact support.'
          );
        }
      }

      // Check query parameters
      if (req.query && Object.keys(req.query).length > 0) {
        if (this.containsSqlInjection(req.query)) {
          const suspiciousPayload = this.extractSuspiciousPayload(req.query);
          
          this.logger.warn(
            `🚨 SQL Injection attempt detected in query parameters!\n` +
            `  Path: ${req.method} ${req.path}\n` +
            `  IP: ${req.ip}\n` +
            `  User-Agent: ${req.get('user-agent')}\n` +
            `  Payload: ${suspiciousPayload}`
          );
          
          throw new BadRequestException(
            'Invalid request: Potential SQL injection pattern detected in query parameters. ' +
            'If this is a legitimate request, please contact support.'
          );
        }
      }

      // Check route parameters (if they exist in Express)
      if (req.params && Object.keys(req.params).length > 0) {
        if (this.containsSqlInjection(req.params)) {
          const suspiciousPayload = this.extractSuspiciousPayload(req.params);
          
          this.logger.warn(
            `🚨 SQL Injection attempt detected in route parameters!\n` +
            `  Path: ${req.method} ${req.path}\n` +
            `  IP: ${req.ip}\n` +
            `  User-Agent: ${req.get('user-agent')}\n` +
            `  Payload: ${suspiciousPayload}`
          );
          
          throw new BadRequestException(
            'Invalid request: Potential SQL injection pattern detected in URL parameters. ' +
            'If this is a legitimate request, please contact support.'
          );
        }
      }

      // Request passed all checks
      next();
      
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      // Don't let middleware errors break the application
      this.logger.error(`Error in SQL injection detector middleware: ${error.message}`);
      next();
    }
  }
}
