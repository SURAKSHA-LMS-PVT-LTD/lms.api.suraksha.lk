import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SecurityMonitoringService } from '../services/security-monitoring.service';

/**
 * 🛡️ COMPREHENSIVE SECURITY HEADERS MIDDLEWARE
 * Implements all essential security headers with advanced configuration
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityHeadersMiddleware.name);

  constructor(private securityMonitoring: SecurityMonitoringService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // 🔒 Content Security Policy (CSP) - Strict
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: https: blob:",
      "media-src 'self' https:",
      "object-src 'none'",
      "frame-src 'none'",
      "worker-src 'self'",
      "child-src 'self'",
      "form-action 'self'",
      "connect-src 'self' https:",
      "base-uri 'self'",
      "manifest-src 'self'",
      "upgrade-insecure-requests"
    ];
    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

    // 🔒 HTTP Strict Transport Security (HSTS) - 2 years
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');

    // 🔒 X-Frame-Options - Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // 🔒 X-Content-Type-Options - Prevent MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 🔒 Referrer Policy - Control referrer information
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 🔒 X-XSS-Protection - Legacy XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // 🔒 Permissions Policy - Control browser features
    const permissionsPolicies = [
      'accelerometer=()',
      'ambient-light-sensor=()',
      'autoplay=()',
      'battery=()',
      'camera=()',
      'cross-origin-isolated=()',
      'display-capture=()',
      'document-domain=()',
      'encrypted-media=()',
      'execution-while-not-rendered=()',
      'execution-while-out-of-viewport=()',
      'fullscreen=()',
      'geolocation=()',
      'gyroscope=()',
      'keyboard-map=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'navigation-override=()',
      'payment=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'sync-xhr=()',
      'usb=()',
      'web-share=()',
      'xr-spatial-tracking=()'
    ];
    res.setHeader('Permissions-Policy', permissionsPolicies.join(', '));

    // 🔒 X-Permitted-Cross-Domain-Policies - Restrict Flash/PDF cross-domain
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    // 🔒 Cross-Origin Embedder Policy
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    // 🔒 Cross-Origin Opener Policy
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    // 🔒 Cross-Origin Resource Policy
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    // 🔒 Remove server information headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    // 🔍 Security monitoring
    this.monitorSecurityHeaders(req, res);

    next();
  }

  private monitorSecurityHeaders(req: Request, res: Response): void {
    const clientIP = this.getClientIP(req);
    
    // Check for potential security bypass attempts
    const suspiciousHeaders = [
      'x-forwarded-host',
      'x-forwarded-server',
      'x-originating-ip',
      'x-remote-ip',
      'x-cluster-client-ip'
    ];

    for (const header of suspiciousHeaders) {
      if (req.headers[header]) {
        this.securityMonitoring.recordSecurityEvent({
          type: 'SUSPICIOUS_HEADER',
          ip: clientIP,
          description: `Suspicious header detected: ${header}`,
          severity: 'MEDIUM',
          userAgent: req.headers['user-agent'],
          path: req.path,
          method: req.method,
          metadata: { header, value: req.headers[header] }
        });
      }
    }

    // Check for missing critical headers in responses
    res.on('finish', () => {
      const criticalHeaders = [
        'Content-Security-Policy',
        'Strict-Transport-Security',
        'X-Frame-Options',
        'X-Content-Type-Options'
      ];

      const missingHeaders = criticalHeaders.filter(header => !res.getHeader(header));
      if (missingHeaders.length > 0) {
        this.logger.warn(`⚠️ Missing security headers: ${missingHeaders.join(', ')} for ${req.path}`);
      }
    });
  }

  private getClientIP(req: Request): string {
    return (
      req.headers['cf-connecting-ip'] as string ||
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.headers['x-real-ip'] as string ||
      req.connection.remoteAddress ||
      'unknown'
    );
  }
}
