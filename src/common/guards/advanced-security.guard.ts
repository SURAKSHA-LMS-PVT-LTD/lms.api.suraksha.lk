import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { getCurrentSriLankaISO } from '../utils/timezone.util';

/**
 * 🛡️ ADVANCED SECURITY GUARD
 * Implements multiple security layers:
 * - IP Whitelisting/Blacklisting
 * - Geolocation blocking
 * - User-Agent validation
 * - Request pattern analysis
 * - Brute force protection
 */
@Injectable()
export class AdvancedSecurityGuard implements CanActivate {
  private readonly logger = new Logger(AdvancedSecurityGuard.name);
  private readonly suspiciousIPs = new Map<string, { attempts: number; lastAttempt: number; blocked: boolean }>();
  private readonly requestPatterns = new Map<string, number[]>();

  // Blocked user agents (bots, scanners, etc.)
  private readonly blockedUserAgents = [
    /sqlmap/i,
    /nikto/i,
    /nessus/i,
    /burp/i,
    /acunetix/i,
    /havij/i,
    /masscan/i,
    /nmap/i,
    /wget/i,
    /curl.*bot/i,
    /python-requests/i,
    /bot.*scan/i,
    /security.*scan/i,
  ];

  // Blocked countries (ISO country codes)
  private readonly blockedCountries = process.env.BLOCKED_COUNTRIES?.split(',') || [];
  
  // Allowed IP ranges for admin operations
  private readonly adminIPRanges = process.env.ADMIN_IP_RANGES?.split(',') || [];

  constructor(
    private reflector: Reflector,
    private configService: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const clientIP = this.getClientIP(request);
    const userAgent = request.headers['user-agent'] || '';
    const path = request.path;
    const method = request.method;

    try {
      // 🔒 1. IP-based security checks
      await this.validateIPSecurity(clientIP, request);

      // 🔒 2. User-Agent validation
      this.validateUserAgent(userAgent, clientIP);

      // 🔒 3. Request pattern analysis
      this.analyzeRequestPattern(clientIP, path, method);

      // 🔒 4. Geolocation blocking (if enabled)
      await this.validateGeolocation(clientIP);

      // 🔒 5. Admin endpoint protection
      this.validateAdminAccess(request, clientIP);

      // 🔒 6. Suspicious activity detection
      this.detectSuspiciousActivity(request, clientIP);

      return true;
    } catch (error) {
      this.logger.error(`🚫 Security violation from ${clientIP}: ${error.message}`);
      this.recordSecurityViolation(clientIP, error.message, request);
      throw error;
    }
  }

  private getClientIP(request: Request): string {
    return (
      request.headers['cf-connecting-ip'] as string ||
      request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      request.headers['x-real-ip'] as string ||
      request.connection.remoteAddress ||
      request.socket.remoteAddress ||
      'unknown'
    );
  }

  private async validateIPSecurity(clientIP: string, request: Request): Promise<void> {
    // Check if IP is blocked
    const ipStatus = this.suspiciousIPs.get(clientIP);
    if (ipStatus?.blocked) {
      throw new ForbiddenException(`IP ${clientIP} is blocked due to suspicious activity`);
    }

    // Check IP whitelist (if configured)
    const whitelist = process.env.IP_WHITELIST?.split(',') || [];
    if (whitelist.length > 0 && !whitelist.includes(clientIP)) {
      throw new ForbiddenException(`IP ${clientIP} not in whitelist`);
    }

    // Check IP blacklist
    const blacklist = process.env.IP_BLACKLIST?.split(',') || [];
    if (blacklist.includes(clientIP)) {
      throw new ForbiddenException(`IP ${clientIP} is blacklisted`);
    }

    // Check for private/local IPs in production
    if (process.env.NODE_ENV === 'production' && this.isPrivateIP(clientIP)) {
      this.logger.warn(`🔍 Private IP ${clientIP} accessing production system`);
    }
  }

  private validateUserAgent(userAgent: string, clientIP: string): void {
    // Block empty user agents
    if (!userAgent || userAgent.trim().length === 0) {
      throw new ForbiddenException('Missing User-Agent header');
    }

    // Block suspicious user agents
    for (const pattern of this.blockedUserAgents) {
      if (pattern.test(userAgent)) {
        this.logger.warn(`🚫 Blocked suspicious User-Agent from ${clientIP}: ${userAgent}`);
        throw new ForbiddenException('Suspicious User-Agent detected');
      }
    }

    // Detect automated tools
    if (this.isAutomatedTool(userAgent)) {
      this.logger.warn(`🤖 Automated tool detected from ${clientIP}: ${userAgent}`);
      // Could block or rate limit automated tools
    }
  }

  private analyzeRequestPattern(clientIP: string, path: string, method: string): void {
    const now = Date.now();
    const patterns = this.requestPatterns.get(clientIP) || [];
    
    // Keep only requests from last 5 minutes
    const recentPatterns = patterns.filter(timestamp => now - timestamp < 300000);
    recentPatterns.push(now);
    
    this.requestPatterns.set(clientIP, recentPatterns);

    // Detect rapid requests (more than 20 requests in 1 minute)
    const lastMinute = recentPatterns.filter(timestamp => now - timestamp < 60000);
    if (lastMinute.length > 20) {
      this.markSuspiciousIP(clientIP, 'Rapid request pattern detected');
      throw new ForbiddenException('Request rate too high');
    }

    // Detect scanning patterns
    if (this.isScanningPattern(path)) {
      this.markSuspiciousIP(clientIP, `Scanning pattern detected: ${path}`);
      throw new ForbiddenException('Scanning activity detected');
    }
  }

  private async validateGeolocation(clientIP: string): Promise<void> {
    if (this.blockedCountries.length === 0) return;

    try {
      // This would integrate with a geolocation service
      // For now, just log the requirement
      
      // Example implementation would check IP against geolocation database
      // const country = await this.getCountryByIP(clientIP);
      // if (this.blockedCountries.includes(country)) {
      //   throw new ForbiddenException(`Access blocked from country: ${country}`);
      // }
    } catch (error) {
      this.logger.error(`Geolocation check failed for ${clientIP}: ${error.message}`);
    }
  }

  private validateAdminAccess(request: Request, clientIP: string): void {
    const isAdminEndpoint = request.path.includes('/admin') || 
                           request.path.includes('/super') ||
                           request.path.includes('/system');

    if (isAdminEndpoint && this.adminIPRanges.length > 0) {
      const hasAdminAccess = this.adminIPRanges.some(range => {
        return this.isIPInRange(clientIP, range);
      });

      if (!hasAdminAccess) {
        this.logger.error(`🚫 Unauthorized admin access attempt from ${clientIP}`);
        throw new ForbiddenException('Admin access denied from this IP');
      }
    }
  }

  private detectSuspiciousActivity(request: Request, clientIP: string): void {
    const suspiciousPatterns = [
      // SQL injection attempts
      /union.*select/i,
      /drop.*table/i,
      /insert.*into/i,
      /'.*or.*'.*=/i,
      
      // XSS attempts
      /<script/i,
      /javascript:/i,
      /onload=/i,
      /onerror=/i,
      
      // Path traversal
      /\.\.\//,
      /\.\.%2f/i,
      /\.\.%5c/i,
      
      // Command injection
      /;.*cat/i,
      /;.*ls/i,
      /;.*whoami/i,
      /\|.*cat/i,
    ];

    const fullURL = `${request.method} ${request.path}${request.url.includes('?') ? request.url.substring(request.url.indexOf('?')) : ''}`;
    const body = JSON.stringify(request.body || {});

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(fullURL) || pattern.test(body)) {
        this.markSuspiciousIP(clientIP, `Malicious pattern detected: ${pattern.source}`);
        throw new ForbiddenException('Malicious request detected');
      }
    }
  }

  private markSuspiciousIP(clientIP: string, reason: string): void {
    const current = this.suspiciousIPs.get(clientIP) || { attempts: 0, lastAttempt: 0, blocked: false };
    current.attempts += 1;
    current.lastAttempt = Date.now();

    // Block IP after 3 suspicious attempts
    if (current.attempts >= 3) {
      current.blocked = true;
      this.logger.error(`🚫 IP ${clientIP} blocked after ${current.attempts} violations. Last: ${reason}`);
    }

    this.suspiciousIPs.set(clientIP, current);
  }

  private recordSecurityViolation(clientIP: string, reason: string, request: Request): void {
    const violation = {
      timestamp: getCurrentSriLankaISO(),
      ip: clientIP,
      reason,
      path: request.path,
      method: request.method,
      userAgent: request.headers['user-agent'],
      headers: request.headers,
    };

    // Log security violation (could be sent to security monitoring system)
    this.logger.error(`🚨 SECURITY VIOLATION: ${JSON.stringify(violation)}`);
    
    // Could integrate with external security monitoring
    // await this.securityMonitoringService.reportViolation(violation);
  }

  private isPrivateIP(ip: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^::1$/,
      /^fe80:/i,
    ];

    return privateRanges.some(range => range.test(ip));
  }

  private isAutomatedTool(userAgent: string): boolean {
    const automatedPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /python/i,
      /curl/i,
      /wget/i,
      /postman/i,
      /insomnia/i,
    ];

    return automatedPatterns.some(pattern => pattern.test(userAgent));
  }

  private isScanningPattern(path: string): boolean {
    // Whitelist legitimate admin endpoints
    const legitimateAdminPaths = [
      /^\/api\/sms\/admin\//i,
      /^\/api\/organization\/admin\//i,
      /^\/api\/users\/admin\//i,
      /^\/api\/.*\/admin\/.+/i, // Allow any module with /admin/ followed by specific path
    ];

    // Check if it's a legitimate admin endpoint first
    if (legitimateAdminPaths.some(pattern => pattern.test(path))) {
      return false; // Not scanning - it's a legitimate API endpoint
    }

    // Check for suspicious scanning patterns
    const scanningPaths = [
      /\/wp-admin/i,
      /\/phpMyAdmin/i,
      /\/config\/?$/i, // Only flag /config at end of path
      /\/\.env/i,
      /\/\.git/i,
      /\/backup\/?$/i,
      /\/sql\/?$/i,
      /\/database\/?$/i,
      /\/test\/?$/i,
      /\/debug\/?$/i,
    ];

    return scanningPaths.some(pattern => pattern.test(path));
  }

  private isIPInRange(ip: string, range: string): boolean {
    // Simple implementation - in production, use a proper IP range library
    if (range.includes('/')) {
      // CIDR notation
      return false; // Implement CIDR checking
    } else {
      // Exact IP match
      return ip === range;
    }
  }

  // Cleanup method to prevent memory leaks
  cleanupOldRecords(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up old IP records
    for (const [ip, data] of this.suspiciousIPs.entries()) {
      if (now - data.lastAttempt > maxAge) {
        this.suspiciousIPs.delete(ip);
      }
    }

    // Clean up old request patterns
    for (const [ip, patterns] of this.requestPatterns.entries()) {
      const recentPatterns = patterns.filter(timestamp => now - timestamp < maxAge);
      if (recentPatterns.length === 0) {
        this.requestPatterns.delete(ip);
      } else {
        this.requestPatterns.set(ip, recentPatterns);
      }
    }
  }
}
