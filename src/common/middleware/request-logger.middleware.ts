import * as crypto from 'crypto';
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    (req as any).requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    this.logger.log(
      `>> [${requestId}] ${method} ${originalUrl} | ip=${ip} | ua=${this.truncate(userAgent, 120)}${this.formatBodySuffix(req.body)}`,
    );

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;

      this.logger.log(
        `<< [${requestId}] ${method} ${originalUrl} | status=${statusCode} | duration=${duration}ms`,
      );
    });

    next();
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${crypto.randomBytes(6).toString('base64url')}`;
  }

  private formatBodySuffix(body: unknown): string {
    if (!body || typeof body !== 'object') {
      return '';
    }

    const keys = Object.keys(body as Record<string, unknown>);
    if (keys.length === 0) {
      return '';
    }

    return ` | body=${this.truncate(JSON.stringify(body), 500)}`;
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength)}...`;
  }
}
