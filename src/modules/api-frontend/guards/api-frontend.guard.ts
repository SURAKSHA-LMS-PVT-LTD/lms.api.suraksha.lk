import { Injectable, CanActivate, ExecutionContext, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiSecurityService, SecurityValidationResult } from '../services/api-security.service';
import { Observable } from 'rxjs';

// Custom decorators for metadata
export const IS_PUBLIC_KEY = 'isPublic';
export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

// Interface for extended request with security context
export interface SecureRequest extends Request {
  securityContext?: SecurityValidationResult;
  user?: any;
  instituteUser?: any;
  permissions?: string[];
}

@Injectable()
export class ApiFrontendGuard implements CanActivate {
  private readonly logger = new Logger(ApiFrontendGuard.name);

  constructor(
    private readonly apiSecurityService: ApiSecurityService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SecureRequest>();
    const startTime = Date.now();


    try {
      // Perform comprehensive security validation
      const validationResult = await this.apiSecurityService.validateApiRequest(request);

      if (!validationResult.isValid) {
        this.logger.error(`🚫 Security validation failed: ${validationResult.errors?.join(', ')}`);
        
        // Determine appropriate exception based on error type
        const errorMessage = validationResult.errors?.[0] || 'Access denied';
        
        if (errorMessage.includes('token') || errorMessage.includes('Authentication')) {
          throw new UnauthorizedException(errorMessage);
        } else {
          throw new ForbiddenException(errorMessage);
        }
      }

      // Attach security context to request for downstream use
      request.securityContext = validationResult;
      request.user = validationResult.user;
      request.instituteUser = validationResult.instituteUser;
      request.permissions = validationResult.permissions;

      const duration = Date.now() - startTime;

      return true;

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ API Frontend Guard - Access denied (${duration}ms): ${error.message}`);
      throw error;
    }
  }
}

// Decorator to mark endpoints as public (skip authentication)
export const Public = () => (target: any, key?: string, descriptor?: PropertyDescriptor) => {
  if (descriptor) {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, descriptor.value);
  } else {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
  }
};

// Decorator to specify required permissions for an endpoint
export const RequirePermissions = (...permissions: string[]) => 
  (target: any, key?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(REQUIRED_PERMISSIONS_KEY, permissions, descriptor.value);
    } else {
      Reflect.defineMetadata(REQUIRED_PERMISSIONS_KEY, permissions, target);
    }
  };
