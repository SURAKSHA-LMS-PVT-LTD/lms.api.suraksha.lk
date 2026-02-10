import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * API Key or JWT Guard
 * 
 * Allows authentication using either:
 * 1. Special API Key from environment variable (SPECIAL_API_KEY)
 * 2. Standard JWT token
 * 
 * This guard checks the Authorization header for:
 * - Bearer <SPECIAL_API_KEY> - For API key authentication
 * - Bearer <JWT_TOKEN> - For standard JWT authentication
 * 
 * Use this guard on endpoints that should be accessible by both
 * authenticated users and external systems with API keys.
 */
@Injectable()
export class ApiKeyOrJwtGuard extends AuthGuard('jwt') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('No authorization header provided');
    }

    // Extract token from "Bearer <token>" format
    const [type, token] = authHeader.split(' ');
    
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization header format. Use: Bearer <token>');
    }

    // Get special API key from environment (no fallback for security)
    const specialApiKey = this.configService.get<string>('SPECIAL_API_KEY');
    
    // 🔒 SECURITY: Use constant-time comparison to prevent timing attacks
    if (specialApiKey && token.length === specialApiKey.length) {
      const tokenBuffer = Buffer.from(token, 'utf-8');
      const keyBuffer = Buffer.from(specialApiKey, 'utf-8');
      if (crypto.timingSafeEqual(tokenBuffer, keyBuffer)) {
      // API Key authentication successful
      // Set user on request and mark as API key authenticated
      // 🔒 SECURITY: API key gets a dedicated type, NOT superadmin equivalence
      request.user = {
        isApiKeyAuth: true,
        authType: 'API_KEY',
        s: 'api-key-user', // Subject/user ID
        userType: 'API_KEY',
        u: -1, // Dedicated API key type (NOT 0/SUPERADMIN)
        i: [], // Empty institute access - API key access is checked separately in FlexibleAccessGuard
      };
      // Mark the request to skip JWT validation in handleRequest
      request._isApiKeyAuthenticated = true;
      return true;
      }
    }

    // If not API key, fall back to JWT authentication
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    
    // If already authenticated via API key, skip JWT validation and return the API key user
    if (request._isApiKeyAuthenticated || request.user?.isApiKeyAuth) {
      return request.user;
    }

    // Otherwise, use default JWT handling
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired JWT token');
    }
    return user;
  }
}
