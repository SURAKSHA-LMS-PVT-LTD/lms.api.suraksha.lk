import { Injectable, Logger, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserType } from '../../modules/user/enums/user-type.enum';
import { LayerManagementService } from './layer-management.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
import ipRangeCheck = require('ip-range-check');

export interface AdminAccessControlConfig {
  isEnabledAdmin: boolean;
  allowedAdminIps: string[];
  allowedAdminOrigins: string[];
  adminAccessLogEnabled: boolean;
  ipGeolocationCheckEnabled: boolean;
  adminSessionTimeoutMinutes: number;
}

export interface AccessControlContext {
  userId: string;
  userType: UserType;
  clientIp: string;
  userAgent?: string;
  origin?: string;
  timestamp: Date;
}

export interface AccessControlResult {
  isAllowed: boolean;
  reason?: string;
  restrictions?: string[];
  metadata?: any;
}

@Injectable()
export class AdminAccessControlService {
  private readonly logger = new Logger(AdminAccessControlService.name);
  private readonly config: AdminAccessControlConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly layerManagementService: LayerManagementService
  ) {
    this.config = {
      isEnabledAdmin: this.configService.get<boolean>('IS_ENABLED_ADMIN', true),
      allowedAdminIps: this.parseIpList(this.configService.get<string>('ALLOWED_ADMIN_IPS', '127.0.0.1,::1')),
      allowedAdminOrigins: this.parseOriginList(this.configService.get<string>('ALLOWED_ADMIN_ORIGINS', 'http://localhost:3000')),
      adminAccessLogEnabled: this.configService.get<boolean>('ADMIN_ACCESS_LOG_ENABLED', true),
      ipGeolocationCheckEnabled: this.configService.get<boolean>('IP_GEOLOCATION_CHECK_ENABLED', false),
      adminSessionTimeoutMinutes: this.configService.get<number>('ADMIN_SESSION_TIMEOUT_MINUTES', 30)
    };

  }

  /**
   * ✅ ENHANCED: Validate admin access with layer-based environment controls
   */
  async validateAdminAccessControl(context: AccessControlContext): Promise<AccessControlResult> {
    const { userId, userType, clientIp, origin } = context;

    try {
      // 🔍 Layer 2: Admin Access Control Layer Check
      if (!this.layerManagementService.isLayerActive(2)) {
        return {
          isAllowed: true,
          reason: 'Admin access control layer disabled',
          restrictions: ['LAYER_DISABLED']
        };
      }

      // 🚨 CRITICAL: Check if admin access is globally enabled
      if (!this.config.isEnabledAdmin) {
        const reason = 'Admin access is globally disabled (IS_ENABLED_ADMIN=false)';
        this.logAccessAttempt(context, false, reason);
        
        return {
          isAllowed: false,
          reason,
          restrictions: ['ADMIN_ACCESS_DISABLED']
        };
      }

      // 🔍 Check if user type requires admin access control
      const isAdminRole = this.isAdminRole(userType);
      if (!isAdminRole) {
        // Non-admin roles bypass these restrictions
        return {
          isAllowed: true,
          reason: 'Non-admin role, access control bypassed'
        };
      }

      const restrictions: string[] = [];

      // 🌐 IP Address Validation for Admin Roles (Layer 14: Request Metadata Validation)
      if (this.layerManagementService.isLayerActive(14)) {
        const ipValidation = this.validateIpAccess(clientIp);
        if (!ipValidation.isValid) {
          restrictions.push('IP_NOT_ALLOWED');
          const reason = `IP address ${clientIp} not in allowed ranges for ${userType}`;
          this.logAccessAttempt(context, false, reason);
          
          return {
            isAllowed: false,
            reason,
            restrictions,
            metadata: { allowedIpRanges: this.config.allowedAdminIps }
          };
        }
      } else {
      }

      // 🎯 Origin Validation for Admin Roles (Layer 13: Strict Origin Validation)
      if (origin && this.layerManagementService.isLayerActive(13)) {
        const originValidation = this.validateOriginAccess(origin);
        if (!originValidation.isValid) {
          restrictions.push('ORIGIN_NOT_ALLOWED');
          const reason = `Origin ${origin} not in allowed origins for ${userType}`;
          this.logAccessAttempt(context, false, reason);
          
          return {
            isAllowed: false,
            reason,
            restrictions,
            metadata: { allowedOrigins: this.config.allowedAdminOrigins }
          };
        }
      } else if (origin && !this.layerManagementService.isLayerActive(13)) {
      }

      // 🌍 IP Geolocation Check (Layer 12: IP Geolocation - Optional/Expensive)
      if (this.layerManagementService.isLayerActive(12) && this.config.ipGeolocationCheckEnabled) {
      }

      // ✅ All validations passed
      const successReason = `Admin access granted for ${userType} from ${clientIp}`;
      this.logAccessAttempt(context, true, successReason);

      return {
        isAllowed: true,
        reason: successReason,
        metadata: {
          ipValidated: true,
          originValidated: origin ? true : 'not-provided',
          accessControlLevel: 'ADMIN_RESTRICTED'
        }
      };

    } catch (error) {
      this.logger.error(`Admin access control validation failed:`, error);
      return {
        isAllowed: false,
        reason: `Access control validation error: ${error.message}`,
        restrictions: ['VALIDATION_ERROR']
      };
    }
  }

  /**
   * Check if user type is admin role that requires access control
   */
  private isAdminRole(userType: UserType): boolean {
    return [
      UserType.SUPERADMIN,
      UserType.ORGANIZATION_MANAGER,
      UserType.ORGANIZATION_MANAGER
    ].includes(userType);
  }

  /**
   * Validate IP address against allowed ranges
   */
  private validateIpAccess(clientIp: string): { isValid: boolean; matchedRange?: string } {
    try {
      // Handle IPv6 mapped IPv4 addresses (::ffff:192.168.1.1 -> 192.168.1.1)
      const normalizedIp = clientIp.replace(/^::ffff:/, '');
      
      for (const allowedRange of this.config.allowedAdminIps) {
        if (ipRangeCheck(normalizedIp, allowedRange)) {
          return { isValid: true, matchedRange: allowedRange };
        }
      }
      
      return { isValid: false };
    } catch (error) {
      this.logger.error(`IP validation error for ${clientIp}:`, error);
      return { isValid: false };
    }
  }

  /**
   * ✅ ENHANCED: Validate origin against allowed origins with flexible matching
   */
  private validateOriginAccess(origin: string): { isValid: boolean; matchedOrigin?: string } {
    try {
      // If no origins configured, deny all in production for security
      if (this.config.allowedAdminOrigins.length === 0) {
        this.logger.warn('⚠️ No admin origins configured - denying all origins in production');
        return { isValid: false };
      }

      // Normalize origin (remove trailing slash and convert to lowercase)
      const normalizedOrigin = origin.replace(/\/$/, '').toLowerCase();
      
      for (const allowedOrigin of this.config.allowedAdminOrigins) {
        const normalizedAllowed = allowedOrigin.replace(/\/$/, '').toLowerCase();
        
        // ✅ Multiple matching strategies:
        // 1. Exact match
        if (normalizedOrigin === normalizedAllowed) {
          return { isValid: true, matchedOrigin: allowedOrigin };
        }
        
        // 2. Wildcard support (*.domain.com)
        if (this.isWildcardMatch(normalizedOrigin, normalizedAllowed)) {
          return { isValid: true, matchedOrigin: allowedOrigin };
        }
        
        // 3. Protocol-agnostic matching (http/https)
        if (this.isProtocolAgnosticMatch(normalizedOrigin, normalizedAllowed)) {
          return { isValid: true, matchedOrigin: allowedOrigin };
        }
        
        // 4. Domain-only matching (ignore protocol and port)
        if (this.isDomainMatch(normalizedOrigin, normalizedAllowed)) {
          return { isValid: true, matchedOrigin: allowedOrigin };
        }
      }
      
      return { isValid: false };
    } catch (error) {
      this.logger.error(`Origin validation error for ${origin}:`, error);
      return { isValid: false };
    }
  }

  /**
   * Support wildcard matching for origins (*.domain.com)
   */
  private isWildcardMatch(origin: string, pattern: string): boolean {
    if (!pattern.includes('*')) return false;
    
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
    return regex.test(origin);
  }

  /**
   * ✅ Protocol-agnostic matching (http://domain.com matches https://domain.com)
   */
  private isProtocolAgnosticMatch(origin: string, pattern: string): boolean {
    try {
      const originWithoutProtocol = origin.replace(/^https?:\/\//, '');
      const patternWithoutProtocol = pattern.replace(/^https?:\/\//, '');
      
      return originWithoutProtocol === patternWithoutProtocol;
    } catch (error) {
      return false;
    }
  }

  /**
   * ✅ Domain-only matching (ignores protocol and port)
   */
  private isDomainMatch(origin: string, pattern: string): boolean {
    try {
      // Extract domain from origin
      const originDomain = this.extractDomain(origin);
      const patternDomain = this.extractDomain(pattern);
      
      return originDomain === patternDomain;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract domain from URL (removes protocol, port, path)
   */
  private extractDomain(url: string): string {
    try {
      // Remove protocol
      let domain = url.replace(/^https?:\/\//, '');
      
      // Remove port
      domain = domain.split(':')[0];
      
      // Remove path
      domain = domain.split('/')[0];
      
      return domain;
    } catch (error) {
      return url;
    }
  }

  /**
   * Parse IP list from environment variable
   */
  private parseIpList(ipString: string): string[] {
    return ipString
      .split(',')
      .map(ip => ip.trim())
      .filter(ip => ip.length > 0);
  }

  /**
   * Parse origin list from environment variable
   */
  private parseOriginList(originString: string): string[] {
    return originString
      .split(',')
      .map(origin => origin.trim())
      .filter(origin => origin.length > 0);
  }

  /**
   * Log access attempts for security auditing
   */
  private logAccessAttempt(
    context: AccessControlContext,
    success: boolean,
    reason: string
  ): void {
    if (!this.config.adminAccessLogEnabled) return;

    const logLevel = success ? 'log' : 'warn';
    const emoji = success ? '✅' : '❌';
    
    this.logger[logLevel](
      `${emoji} Admin Access ${success ? 'GRANTED' : 'DENIED'}: ` +
      `User ${context.userId} (${context.userType}) from ${context.clientIp} - ${reason}`
    );

    // Additional security logging for failed attempts
    if (!success) {
      this.logger.warn(`🚨 SECURITY ALERT: Failed admin access attempt`, {
        userId: context.userId,
        userType: context.userType,
        clientIp: context.clientIp,
        origin: context.origin,
        userAgent: context.userAgent,
        timestamp: context.timestamp,
        reason
      });
    }
  }

  /**
   * Get current access control configuration (for diagnostics)
   */
  getAccessControlConfig(): AdminAccessControlConfig {
    return { ...this.config };
  }

  /**
   * Check if admin access is globally enabled
   */
  isAdminAccessEnabled(): boolean {
    return this.config.isEnabledAdmin;
  }

  /**
   * Get allowed IP ranges for admin access
   */
  getAllowedAdminIpRanges(): string[] {
    return [...this.config.allowedAdminIps];
  }

  /**
   * Get allowed origins for admin access
   */
  getAllowedAdminOrigins(): string[] {
    return [...this.config.allowedAdminOrigins];
  }
}
