import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SKIP_ORIGIN_VALIDATION_KEY } from '../decorators/skip-origin-validation.decorator';

/**
 * 🛡️ ORIGIN VALIDATION GUARD
 * 
 * Purpose: Block direct browser/Postman access to ALL endpoints (including @Public())
 * - Only allows requests from whitelisted frontend domains
 * - Validates Origin and Referer headers
 * - @Public() routes STILL require valid origin (only skip JWT, not origin check)
 * - Only API key authentication bypasses origin validation
 * 
 * Usage:
 * Applied globally - validates ALL requests
 * @Public() - Only skips JWT authentication, NOT origin validation
 */
@Injectable()
export class OriginValidationGuard implements CanActivate {
  private readonly logger = new Logger(OriginValidationGuard.name);
  private readonly allowedOrigins: string[];
  private readonly allowedIPs: string[];
  private readonly strictMode: boolean;
  private readonly isDevelopment: boolean;

  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
  ) {
    // Check if development mode
    this.isDevelopment = this.configService.get<string>('NODE_ENV') !== 'production';

    // Load allowed origins from environment
    const originsEnv = this.configService.get<string>('CORS_ORIGINS', '');
    const baseOrigins = originsEnv
      ? originsEnv.split(',').map(o => o.trim())
      : ['https://lms.suraksha.lk', 'https://org.suraksha.lk', 'https://transport.suraksha.lk', 'https://admin.suraksha.lk'];

    // Also honor verified tenant custom domains supplied via CUSTOM_DOMAIN_ORIGINS,
    // so this guard stays in sync with the CORS layer (which already allows them).
    // Without this, a custom domain passes CORS but is then 403'd here.
    const customDomainsEnv = this.configService.get<string>('CUSTOM_DOMAIN_ORIGINS', '');
    const customDomains = customDomainsEnv
      ? customDomainsEnv.split(',').map(o => o.trim()).filter(Boolean)
      : [];

    this.allowedOrigins = [...baseOrigins, ...customDomains];

    // Load allowed IPs from environment (for server-to-server communication)
    const ipsEnv = this.configService.get<string>('ALLOWED_IPS', '');
    this.allowedIPs = ipsEnv ? ipsEnv.split(',').map(ip => ip.trim()) : [];

    // Strict mode: Reject if both Origin and Referer are missing (disabled in development)
    this.strictMode = this.isDevelopment ? false : this.configService.get<boolean>('ORIGIN_STRICT_MODE', true);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // ✅ BYPASS in development mode - Allow all requests
    if (this.isDevelopment) {
      return true;
    }

    // ✅ BYPASS: endpoints decorated with @SkipOriginValidation() (external API key endpoints)
    const skipOrigin = this.reflector.getAllAndOverride<boolean>(
      SKIP_ORIGIN_VALIDATION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skipOrigin) {
      return true;
    }

    // ✅ BYPASS: ONLY for API key authentication (backend-to-backend)
    // @Public() routes do NOT bypass origin validation!
    if (request._isApiKeyAuthenticated || request.user?.isApiKeyAuth) {
      return true;
    }

    // 🔒 ALL OTHER REQUESTS (including @Public()) must have valid origin

    // Extract Origin and Referer headers
    const origin = request.headers.origin || request.headers.Origin;
    const referer = request.headers.referer || request.headers.Referer;

    // 🔍 Validate Origin
    if (origin) {
      if (this.isOriginAllowed(origin)) {
        return true;
      }
      
      // 🚫 SILENT BLOCK - Return empty 403 (looks like DNS/network error)
      const clientIP = request.ip || request.connection?.remoteAddress || 'unknown';
      this.logger.warn(`SECURITY BLOCK - Unauthorized origin: ${origin} from IP: ${clientIP}`);
      response.status(403).send();
      return false;
    }

    // 🔍 Fallback: Check Referer if Origin is missing
    if (referer) {
      const refererOrigin = this.extractOriginFromReferer(referer);
      if (refererOrigin && this.isOriginAllowed(refererOrigin)) {
        return true;
      }

      // 🚫 SILENT BLOCK - Return empty 403
      const clientIP = request.ip || request.connection?.remoteAddress || 'unknown';
      this.logger.warn(`SECURITY BLOCK - Unauthorized referer from IP: ${clientIP}`);
      response.status(403).send();
      return false;
    }

    // 🚫 PRODUCTION STRICT MODE: No Origin or Referer - SILENT BLOCK
    const clientIP = request.ip || request.connection?.remoteAddress || 'unknown';
    this.logger.warn(`SECURITY BLOCK - No origin/referer headers from IP: ${clientIP}`);
    response.status(403).send();
    return false;
  }

  // Matches any https://<subdomain>.suraksha.lk origin (same pattern as CORS middleware)
  private readonly surakshaDomainPattern = /^https:\/\/[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.suraksha\.lk$/;

  /**
   * Check if origin is in whitelist.
   * Supports:
   *   - Exact match against CORS_ORIGINS env list
   *   - Simple glob wildcards in the env list (e.g. https://*.example.com)
   *   - Any *.suraksha.lk subdomain (multi-tenant SSO support)
   */
  private isOriginAllowed(origin: string): boolean {
    // Normalize origin (remove trailing slash)
    const normalizedOrigin = origin.toLowerCase().replace(/\/$/, '');

    // ✅ Always allow any *.suraksha.lk subdomain (SSO / multi-tenant frontends)
    if (this.surakshaDomainPattern.test(normalizedOrigin)) {
      return true;
    }

    return this.allowedOrigins.some(allowed => {
      const normalizedAllowed = allowed.toLowerCase().replace(/\/$/, '');
      
      // Exact match
      if (normalizedOrigin === normalizedAllowed) {
        return true;
      }

      // Wildcard match (e.g., *.example.com)
      if (normalizedAllowed.includes('*')) {
        const regex = new RegExp('^' + normalizedAllowed.replace(/\*/g, '.*') + '$');
        return regex.test(normalizedOrigin);
      }

      return false;
    });
  }

  /**
   * Extract origin from referer URL
   */
  private extractOriginFromReferer(referer: string): string | null {
    try {
      const url = new URL(referer);
      return `${url.protocol}//${url.host}`;
    } catch {
      return null;
    }
  }
}
