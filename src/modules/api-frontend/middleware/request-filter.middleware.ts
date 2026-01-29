import { Injectable, NestMiddleware, Logger, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { getCurrentSriLankaTime, getCurrentSriLankaISO } from '../../../common/utils/timezone.util';

@Injectable()
export class RequestFilterMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestFilterMiddleware.name);
  
  // Blocked IP addresses (can be loaded from database/config)
  private readonly blockedIPs = new Set([
    // Add IPs to block
  ]);

  // Blocked user agents
  private readonly blockedUserAgents = [
    /bot/i,
    /spider/i,
    /crawler/i,
    /scanner/i,
    /curl/i,
    /wget/i,
  ];

  // Suspicious patterns in URLs
  private readonly suspiciousPatterns = [
    /\.\.\//g, // Path traversal
    /%2e%2e%2f/gi, // URL encoded path traversal
    /%252e%252e%252f/gi, // Double URL encoded path traversal
    /\/etc\/passwd/gi, // Linux system files
    /\/windows\/system32/gi, // Windows system files
    /<script/gi, // XSS attempts
    /javascript:/gi, // JavaScript protocol
    /data:/gi, // Data URLs
    /vbscript:/gi, // VBScript
    /livescript:/gi, // LiveScript
    /about:/gi, // About protocol
    /file:/gi, // File protocol
    /union.*select/gi, // SQL injection
    /select.*from/gi, // SQL injection
    /drop.*table/gi, // SQL injection
    /insert.*into/gi, // SQL injection
    /update.*set/gi, // SQL injection
    /delete.*from/gi, // SQL injection
    /exec.*\(/gi, // Command injection
    /eval.*\(/gi, // Code injection
    /base64/gi, // Base64 encoded content
    /\x00/g, // Null bytes
    /\x0d\x0a/g, // CRLF injection
  ];

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const clientIP = this.getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';
    const url = req.url;

    try {
      // 1. Check for blocked IPs
      if (this.blockedIPs.has(clientIP)) {
        this.logger.warn(`🚫 Blocked IP attempt: ${clientIP} - ${req.method} ${url}`);
        throw new BadRequestException('Access denied');
      }

      // 2. Check for blocked user agents
      if (this.isBlockedUserAgent(userAgent)) {
        this.logger.warn(`🤖 Blocked user agent: ${userAgent} - ${clientIP} - ${req.method} ${url}`);
        throw new BadRequestException('Access denied');
      }

      // 3. Check for suspicious URL patterns
      if (this.hasSuspiciousPatterns(url)) {
        this.logger.warn(`⚠️ Suspicious URL pattern detected: ${url} - ${clientIP} - ${userAgent}`);
        throw new BadRequestException('Invalid request pattern');
      }

      // 4. Check request size limits
      const contentLength = parseInt(req.headers['content-length'] || '0');
      if (contentLength > 50 * 1024 * 1024) { // 50MB limit
        this.logger.warn(`📦 Large request size: ${contentLength} bytes - ${clientIP} - ${req.method} ${url}`);
        throw new BadRequestException('Request too large');
      }

      // 5. Check for required headers
      if (!req.headers['user-agent']) {
        this.logger.warn(`📋 Missing User-Agent header - ${clientIP} - ${req.method} ${url}`);
        throw new BadRequestException('User-Agent header required');
      }

      // 6. Check HTTP method
      const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
      if (!allowedMethods.includes(req.method)) {
        this.logger.warn(`🚷 Invalid HTTP method: ${req.method} - ${clientIP} - ${url}`);
        throw new BadRequestException('Invalid HTTP method');
      }

      // 7. Add security context to request
      (req as any).securityContext = {
        clientIP,
        userAgent,
        requestTime: getCurrentSriLankaTime(),
        contentLength,
      };

      const duration = Date.now() - startTime;

      next();

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ Request filter blocked (${duration}ms) - ${req.method} ${url} - ${clientIP}: ${error.message}`);
      
      // Log security incident
      this.logSecurityIncident(req, clientIP, userAgent, error.message);
      
      // Send error response
      res.status(400).json({
        statusCode: 400,
        message: error.message,
        timestamp: getCurrentSriLankaISO(),
      });
    }
  }

  private getClientIP(req: Request): string {
    // Get real client IP considering proxy headers
    return (
      req.headers['cf-connecting-ip'] || // Cloudflare
      req.headers['x-real-ip'] || // Nginx
      req.headers['x-forwarded-for']?.toString().split(',')[0] || // General proxy
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    ).toString().trim();
  }

  private isBlockedUserAgent(userAgent: string): boolean {
    if (!userAgent || userAgent.length < 3) {
      return true; // Block empty or very short user agents
    }

    return this.blockedUserAgents.some(pattern => pattern.test(userAgent));
  }

  private hasSuspiciousPatterns(url: string): boolean {
    const decodedUrl = decodeURIComponent(decodeURIComponent(url)); // Double decode to catch double encoding
    
    return this.suspiciousPatterns.some(pattern => {
      if (pattern.test(url) || pattern.test(decodedUrl)) {
        return true;
      }
      return false;
    });
  }

  private logSecurityIncident(req: Request, clientIP: string, userAgent: string, reason: string): void {
    const incidentData = {
      timestamp: getCurrentSriLankaISO(),
      type: 'REQUEST_FILTER_BLOCK',
      clientIP,
      userAgent,
      method: req.method,
      url: req.url,
      headers: this.sanitizeHeaders(req.headers),
      reason,
    };

    this.logger.error(`🚨 SECURITY_INCIDENT: ${JSON.stringify(incidentData)}`);
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    // Remove sensitive headers
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];
    return sanitized;
  }
}
