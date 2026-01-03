import { Injectable, CanActivate, ExecutionContext, Logger, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CacheValidationService } from '../services/cache-validation.service';
import {
  VALIDATE_GLOBAL_USER_TYPE_KEY,
  VALIDATE_HYBRID_ACCESS_KEY,
  GlobalUserTypeValidation,
  HybridAccessValidation
} from '../decorators/cache-validation.decorators';

@Injectable()
export class CacheValidationGuard implements CanActivate {
  private readonly logger = new Logger(CacheValidationGuard.name);

  constructor(
    private reflector: Reflector,
    private cacheValidationService: CacheValidationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.error('No user found in request - ensure JWT guard is applied first');
      throw new ForbiddenException('Authentication required');
    }

    // Check for global user type validation
    const globalValidation = this.reflector.get<GlobalUserTypeValidation>(
      VALIDATE_GLOBAL_USER_TYPE_KEY,
      context.getHandler()
    );

    if (globalValidation) {
      return await this.validateGlobalUserType(user, globalValidation);
    }

    // ✅ MAIN DECORATOR: Check for hybrid access validation
    const hybridValidation = this.reflector.get<HybridAccessValidation>(
      VALIDATE_HYBRID_ACCESS_KEY,
      context.getHandler()
    );

    if (hybridValidation) {
      return await this.validateHybridAccess(request, user, hybridValidation);
    }

    // No validation metadata found - allow access
    return true;
  }

  /**
   * Validate global user type (SUPERADMIN only)
   */
  private async validateGlobalUserType(
    user: any,
    validation: GlobalUserTypeValidation
  ): Promise<boolean> {
    try {

      const result = await this.cacheValidationService.validateGlobalUserType(
        user,
        validation.allowedUserTypes
      );

      if (!result.isValid) {
        this.logger.warn(`❌ Global validation failed: ${result.message}`);
        throw new ForbiddenException(result.message);
      }

      return true;
    } catch (error) {
      this.logger.error(`💥 Global validation error: ${error.message}`);
      throw new ForbiddenException(error.message);
    }
  }

  /**
   * ✅ MAIN METHOD: Validate hybrid access (SUPERADMIN OR INSTITUTE_ADMIN)
   */
  private async validateHybridAccess(
    request: any,
    user: any,
    validation: HybridAccessValidation
  ): Promise<boolean> {
    try {

      // Get institute ID from request parameters
      const instituteId = this.getInstituteIdFromRequest(request, validation.instituteIdParam);

      // Extract request metadata for access control
      const clientIp = this.extractClientIp(request);
      const origin = request.headers.origin || 
                    request.headers.referer?.split('/').slice(0, 3).join('/') || 
                    undefined;
      const userAgent = request.headers['user-agent'];

      const result = await this.cacheValidationService.validateHybridAccess(
        user,
        instituteId,
        validation.allowedGlobalUserTypes,
        validation.allowedInstituteUserTypes,
        undefined, // classId
        undefined, // subjectId
        undefined, // studentId
        clientIp,
        origin,
        userAgent
      );

      if (!result.isValid) {
        this.logger.warn(`❌ Hybrid validation failed: ${result.message}`);
        
        // ✅ ENHANCED: Provide diagnostic information when validation fails
        const userId = user.userId || user.id || user.sub;
        if (userId && result.message?.includes('not found')) {
          
          try {
            const diagnostic = await this.cacheValidationService.verifyUserAccess(user);
            this.logger.warn(`📊 User access diagnostic:`, {
              userExists: diagnostic.userExists,
              userType: diagnostic.userType,
              hasInstituteAccess: diagnostic.hasInstituteAccess,
              accessibleInstitutes: diagnostic.accessibleInstitutes.length,
              dataSource: diagnostic.dataSource,
              cacheWorking: diagnostic.cacheWorking
            });

            if (!diagnostic.cacheWorking) {
              this.logger.error(`🚨 CACHE SYSTEM FAILURE DETECTED - All validation using database fallback`);
            }
          } catch (diagnosticError) {
            this.logger.error(`Failed to run diagnostic:`, diagnosticError.message);
          }
        }
        
        throw new ForbiddenException(result.message);
      }

      return true;
    } catch (error) {
      this.logger.error(`💥 Hybrid validation error: ${error.message}`);
      
      // ✅ ENHANCED: Test cache health on validation errors
      if (error.message?.includes('cache') || error.message?.includes('database')) {
        try {
          const healthCheck = await this.cacheValidationService.testCacheHealth();
          this.logger.warn(`📊 Cache health status:`, healthCheck);
          
          if (!healthCheck.cacheConnected) {
            this.logger.error(`🚨 CRITICAL: Cache system completely offline - All operations using database`);
          }
        } catch (healthError) {
          this.logger.error(`Failed to test cache health:`, healthError.message);
        }
      }
      
      throw new ForbiddenException(error.message);
    }
  }

  /**
   * Extract institute ID from request parameters, query, or body
   */
  private getInstituteIdFromRequest(request: any, paramName?: string): string | null {
    if (!paramName) {
      return null;
    }

    // Check route parameters
    if (request.params && request.params[paramName]) {
      return request.params[paramName];
    }

    // Check query parameters
    if (request.query && request.query[paramName]) {
      return request.query[paramName];
    }

    // Check request body
    if (request.body && request.body[paramName]) {
      return request.body[paramName];
    }

    return null;
  }

  /**
   * Extract client IP from request headers
   */
  private extractClientIp(request: any): string {
    const clientIp = request.headers['cf-connecting-ip'] ||
           request.headers['x-real-ip'] ||
           request.headers['x-forwarded-for']?.split(',')[0] ||
           request.headers['x-client-ip'] ||
           request.connection?.remoteAddress ||
           request.socket?.remoteAddress ||
           request.ip ||
           'unknown';
    
    return typeof clientIp === 'string' ? clientIp.trim() : 'unknown';
  }
}
