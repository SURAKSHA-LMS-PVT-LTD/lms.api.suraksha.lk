import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    // Request size validation
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength > 50 * 1024 * 1024) { // 50MB limit
      throw new BadRequestException('Request too large');
    }

    // Basic request sanitization
    if (req.url && this.containsSuspiciousPatterns(req.url)) {
      throw new BadRequestException('Suspicious request detected');
    }

    // User agent validation
    const userAgent = req.headers['user-agent'];
    if (userAgent && this.isBlockedUserAgent(userAgent)) {
      throw new BadRequestException('Blocked user agent');
    }

    next();
  }

  private containsSuspiciousPatterns(url: string): boolean {
    const suspiciousPatterns = [
      /\.\./g,                    // Path traversal
      /<script/gi,                // Script injection
      /javascript:/gi,            // JavaScript protocol
      /vbscript:/gi,              // VBScript protocol
      /on\w+=/gi,                 // Event handlers
      /eval\s*\(/gi,              // Eval function
      /expression\s*\(/gi,        // CSS expression
      /import\s+/gi,              // Import statements
      /document\./gi,             // Document object
      /window\./gi,               // Window object
      /%2e%2e/gi,                 // URL encoded path traversal
      /%3c%73%63%72%69%70%74/gi,  // URL encoded script
    ];

    return suspiciousPatterns.some(pattern => pattern.test(url));
  }

  private isBlockedUserAgent(userAgent: string): boolean {
    const blockedPatterns = [
      /sqlmap/gi,
      /nikto/gi,
      /nessus/gi,
      /openvas/gi,
      /nmap/gi,
      /curl.*bot/gi,
      /wget.*bot/gi,
    ];

    return blockedPatterns.some(pattern => pattern.test(userAgent));
  }
}
