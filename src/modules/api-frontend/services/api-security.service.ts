import { Injectable, Logger, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface SecurityValidationResult {
  isValid: boolean;
  user?: UserEntity;
  instituteUser?: InstituteUserEntity;
  permissions?: string[];
  errors?: string[];
  requestId: string;
}

@Injectable()
export class ApiSecurityService {
  private readonly logger = new Logger(ApiSecurityService.name);
  private readonly maxRequestSize = 50 * 1024 * 1024; // 50MB
  private readonly allowedFileTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ];

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
  ) {}

  /**
   * Main security validation method - the gateway for all API requests
   */
  async validateApiRequest(request: Request): Promise<SecurityValidationResult> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();


    try {
      // 1. Basic request validation
      await this.validateBasicRequest(request, requestId);

      // 2. Rate limiting check
      await this.checkRateLimit(request, requestId);

      // 3. Authentication validation
      const authResult = await this.validateAuthentication(request, requestId);

      // 4. Authorization validation
      const authzResult = await this.validateAuthorization(request, authResult, requestId);

      // 5. Content validation
      await this.validateRequestContent(request, requestId);

      // 6. File upload validation (if applicable)
      if (this.hasFileUploads(request)) {
        await this.validateFileUploads(request, requestId);
      }

      const duration = Date.now() - startTime;

      return {
        isValid: true,
        user: authResult.user,
        instituteUser: authzResult.instituteUser,
        permissions: authzResult.permissions,
        requestId
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ [${requestId}] Security validation failed (${duration}ms): ${error.message}`);
      
      return {
        isValid: false,
        errors: [error.message],
        requestId
      };
    }
  }

  /**
   * Basic request validation
   */
  private async validateBasicRequest(request: Request, requestId: string): Promise<void> {
    // Check request size
    const contentLength = parseInt(request.headers['content-length'] || '0');
    if (contentLength > this.maxRequestSize) {
      throw new BadRequestException(`Request size ${contentLength} exceeds maximum allowed size ${this.maxRequestSize}`);
    }

    // Check required headers
    if (!request.headers['user-agent']) {
      throw new BadRequestException('User-Agent header is required');
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /\.\.\//g, // Path traversal
      /<script/gi, // XSS attempts
      /union.*select/gi, // SQL injection
      /javascript:/gi, // JavaScript injection
    ];

    const urlToCheck = decodeURIComponent(request.url);
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(urlToCheck)) {
        throw new BadRequestException('Suspicious request pattern detected');
      }
    }
  }

  /**
   * Rate limiting validation
   */
  private async checkRateLimit(request: Request, requestId: string): Promise<void> {
    // Get client IP
    const clientIp = request.ip || 
                    request.connection.remoteAddress || 
                    request.headers['x-forwarded-for'] as string;

    // Rate limiting would be implemented here
    // For now, we'll just log the check
  }

  /**
   * Authentication validation
   */
  private async validateAuthentication(request: Request, requestId: string): Promise<{ user: UserEntity }> {
    // Skip auth for public endpoints
    if (this.isPublicEndpoint(request.url)) {
      return { user: null };
    }

    // Extract token
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentication token is required');
    }

    try {
      // Verify JWT token
      const payload = this.jwtService.verify(token);
      // Get user from database (using 's' field from JWT payload)
      const user = await this.userRepository.findOne({
        where: { id: payload.s },
        relations: ['institutes']
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (!user.isActive) {
        throw new UnauthorizedException('User account is deactivated');
      }

      // Check token expiration
      const currentTime = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < currentTime) {
        throw new UnauthorizedException('Token has expired');
      }
      return { user };

    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token');
      }
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      }
      throw error;
    }
  }

  /**
   * Authorization validation
   */
  private async validateAuthorization(
    request: Request, 
    authResult: { user: UserEntity }, 
    requestId: string
  ): Promise<{ instituteUser?: InstituteUserEntity; permissions: string[] }> {
    // Skip authorization for public endpoints
    if (this.isPublicEndpoint(request.url)) {
      return { permissions: ['public'] };
    }

    if (!authResult.user) {
      throw new ForbiddenException('Authentication required for this endpoint');
    }

    const { user } = authResult;
    let instituteUser: InstituteUserEntity = null;
    let permissions: string[] = [];

    // Extract institute ID from request (if applicable)
    const instituteId = this.extractInstituteId(request);

    if (instituteId) {
      // Check institute-specific permissions
      instituteUser = await this.instituteUserRepository.findOne({
        where: { 
          userId: user.id, 
          instituteId: instituteId.toString()
        },
        relations: ['institute', 'user']
      });

      if (!instituteUser) {
        throw new ForbiddenException('Access denied: Not authorized for this institute');
      }

      if (!instituteUser.verifiedBy) {
        throw new ForbiddenException('Access denied: Institute access not verified');
      }

      // Get institute-specific permissions based on user type
      permissions = this.getInstitutePermissions(user.userType);
    } else {
      // Get global permissions based on user type
      permissions = this.getGlobalPermissions(user.userType);
    }

    // Check endpoint-specific permissions
    const requiredPermission = this.getRequiredPermission(request);
    if (requiredPermission && !permissions.includes(requiredPermission) && !permissions.includes('admin')) {
      throw new ForbiddenException(`Access denied: Required permission '${requiredPermission}' not found`);
    }
    return { instituteUser, permissions };
  }

  /**
   * Request content validation
   */
  private async validateRequestContent(request: Request, requestId: string): Promise<void> {
    if (['POST', 'PATCH', 'PUT'].includes(request.method)) {
      // Validate JSON structure if content-type is application/json
      if (request.headers['content-type']?.includes('application/json')) {
        try {
          if (request.body && typeof request.body === 'string') {
            JSON.parse(request.body);
          }
        } catch (error) {
          throw new BadRequestException('Invalid JSON format');
        }
      }

      // Check for malicious content
      const bodyStr = JSON.stringify(request.body || {});
      const maliciousPatterns = [
        /<script.*>.*<\/script>/gi,
        /javascript:/gi,
        /vbscript:/gi,
        /onload\s*=/gi,
        /onerror\s*=/gi,
      ];

      for (const pattern of maliciousPatterns) {
        if (pattern.test(bodyStr)) {
          throw new BadRequestException('Malicious content detected in request body');
        }
      }
    }
  }

  /**
   * File upload validation
   * 
   * ⚠️ DEPRECATED: File validation removed - backend now only accepts URLs
   * Files are uploaded directly to cloud storage via signed URLs
   * Validation happens before signed URL generation in upload.controller.ts
   */
  private async validateFileUploads(request: Request, requestId: string): Promise<void> {
    // No longer needed - backend doesn't receive files
    // All file uploads go directly to cloud storage via signed URLs
    return;
  }

  /**
   * Helper methods
   */
  private generateRequestId(): string {
    return crypto.randomBytes(4).toString('hex');
  }

  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) return null;

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : null;
  }

  private isPublicEndpoint(url: string): boolean {
    const publicEndpoints = [
      '/v2/auth/login',  // JWT v2 login endpoint
      '/auth/initiate',
      '/auth/verify-otp',
      '/auth/password/reset',
      '/institutes/code/',
      '/examples/public',
      '/api-docs',
      '/audit/stats',
      '/'
    ];

    return publicEndpoints.some(endpoint => url.startsWith(endpoint));
  }

  private extractInstituteId(request: Request): number | null {
    // Try to extract institute ID from URL parameters
    const match = request.url.match(/\/institutes?\/(\d+)/);
    if (match) {
      return parseInt(match[1]);
    }

    // Try to extract from request body
    if (request.body?.instituteId) {
      return parseInt(request.body.instituteId);
    }

    // Try to extract from query parameters
    if (request.query?.instituteId) {
      return parseInt(request.query.instituteId as string);
    }

    return null;
  }

  private getInstitutePermissions(userType: string): string[] {
    const permissionMap = {
      'admin': ['admin', 'read', 'write', 'delete', 'manage_users', 'manage_classes', 'manage_subjects', 'manage_payments'],
      'teacher': ['read', 'write', 'manage_classes', 'manage_subjects', 'grade_students'],
      'student': ['read', 'submit_homework', 'view_grades'],
      'parent': ['read', 'view_child_progress'],
    };

    return permissionMap[userType] || ['read'];
  }

  private getGlobalPermissions(userType: string): string[] {
    const permissionMap = {
      'super_admin': ['admin', 'read', 'write', 'delete', 'manage_system'],
      'admin': ['read', 'write', 'manage_institutes'],
      'teacher': ['read', 'write'],
      'student': ['read'],
      'parent': ['read'],
    };

    return permissionMap[userType] || ['read'];
  }

  private getRequiredPermission(request: Request): string | null {
    const method = request.method.toLowerCase();
    const url = request.url.toLowerCase();

    // Admin endpoints
    if (url.includes('/admin') || url.includes('/manage')) {
      return 'admin';
    }

    // Write operations
    if (['post', 'put', 'patch'].includes(method)) {
      return 'write';
    }

    // Delete operations
    if (method === 'delete') {
      return 'delete';
    }

    // Default to read permission
    return 'read';
  }

  private hasFileUploads(request: Request): boolean {
    // Backend no longer receives files - all uploads via signed URLs
    return false;
  }
}
