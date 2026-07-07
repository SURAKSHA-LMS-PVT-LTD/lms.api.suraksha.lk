import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SecureLogger extends Logger {
  private sensitivePatterns = [
    /password\s*[:=]\s*[^\s]+/gi,
    /secret\s*[:=]\s*[^\s]+/gi,
    /token\s*[:=]\s*[^\s]+/gi,
    /key\s*[:=]\s*[^\s]+/gi,
    /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
  ];

  log(message: any, context?: string) {
    super.log(this.sanitize(message), context);
  }

  error(message: any, trace?: string, context?: string) {
    super.error(this.sanitize(message), trace, context);
  }

  warn(message: any, context?: string) {
    super.warn(this.sanitize(message), context);
  }

  debug(message: any, context?: string) {
    if (process.env.NODE_ENV === 'development') {
      super.debug(this.sanitize(message), context);
    }
  }

  verbose(message: any, context?: string) {
    if (process.env.NODE_ENV === 'development') {
      super.verbose(this.sanitize(message), context);
    }
  }

  private sanitize(message: any): any {
    if (typeof message !== 'string') {
      if (typeof message === 'object') {
        return this.sanitizeObject(message);
      }
      return message;
    }

    let sanitized = message;
    this.sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    return sanitized;
  }

  private sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const sanitized = { ...obj };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'authorization'];

    for (const key in sanitized) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeObject(sanitized[key]);
      } else if (typeof sanitized[key] === 'string') {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }

    return sanitized;
  }
}
