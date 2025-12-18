import { 
  createParamDecorator, 
  ExecutionContext, 
  SetMetadata, 
  applyDecorators,
  UseGuards 
} from '@nestjs/common';
import { 
  Injectable, 
  CanActivate, 
  ForbiddenException, 
  UnauthorizedException,
  Logger 
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CacheValidationService } from '../services/cache-validation.service';

// Metadata key for parent access validation
export const PARENT_ACCESS_KEY = 'parentAccess';

// Interface for parent access parameters
interface ParentAccessParams {
  studentIdParam: string;
  instituteIdParam: string;
  classIdParam?: string;
  subjectIdParam?: string;
}

/**
 * Enhanced decorator to validate parent access to student data
 * Uses enhanced hybrid validation system with institute/class/subject support
 * @param studentIdParam - The parameter name that contains the student ID
 * @param instituteIdParam - The parameter name that contains the institute ID
 * @param classIdParam - Optional parameter name that contains the class ID  
 * @param subjectIdParam - Optional parameter name that contains the subject ID
 */
export const ValidateParentAccess = (
  studentIdParam: string = 'studentId',
  instituteIdParam: string = 'instituteId', 
  classIdParam?: string,
  subjectIdParam?: string
) => {
  return applyDecorators(
    UseGuards(JwtAuthGuard), // Use existing JWT auth
    SetMetadata(PARENT_ACCESS_KEY, { studentIdParam, instituteIdParam, classIdParam, subjectIdParam }),
    UseGuards(ParentAccessGuard)
  );
};

/**
 * Enhanced guard that validates parent access to student resources
 * Uses enhanced hybrid validation system with institute/class/subject support
 */
@Injectable()
export class ParentAccessGuard implements CanActivate {
  private readonly logger = new Logger(ParentAccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly cacheValidationService: CacheValidationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const accessParams = this.reflector.get<ParentAccessParams>(PARENT_ACCESS_KEY, context.getHandler());

    if (!accessParams || !accessParams.studentIdParam) {
      this.logger.warn('⚠️ ValidateParentAccess decorator used without proper parameters');
      return true; // If no param specified, allow access (backward compatibility)
    }

    // Get user from existing JWT authentication (already validated by JwtAuthGuard)
    const user = request.user as any; // Using existing JWT user object
    if (!user || !user.id) {
      this.logger.error('❌ No authenticated user found in request');
      throw new UnauthorizedException('Authentication required');
    }

    // Extract required parameters from request
    const studentId = this.extractStudentId(request, accessParams.studentIdParam);
    const instituteId = this.extractStudentId(request, accessParams.instituteIdParam);
    const classId = accessParams.classIdParam ? this.extractStudentId(request, accessParams.classIdParam) : undefined;
    const subjectId = accessParams.subjectIdParam ? this.extractStudentId(request, accessParams.subjectIdParam) : undefined;

    if (!studentId) {
      this.logger.error(`❌ Student ID not found in parameter: ${accessParams.studentIdParam}`);
      throw new ForbiddenException(`Student ID parameter '${accessParams.studentIdParam}' is required`);
    }

    if (!instituteId) {
      this.logger.error(`❌ Institute ID not found in parameter: ${accessParams.instituteIdParam}`);
      throw new ForbiddenException(`Institute ID parameter '${accessParams.instituteIdParam}' is required`);
    }

    try {
      // Get client IP for enhanced validation
      const clientIp = request.ip || request.connection.remoteAddress || 'unknown';
      const userAgent = request.get('User-Agent') || 'unknown';
      const origin = request.get('Origin') || request.get('Referer') || 'unknown';

      // ✅ Use enhanced hybrid validation for parent access
      const accessValidation = await this.cacheValidationService.validateHybridAccess(
        user,
        instituteId,
        undefined, // allowedGlobalUserTypes - let service use defaults
        undefined, // allowedInstituteUserTypes - let service use defaults
        classId,
        subjectId,
        studentId,
        clientIp,
        origin,
        userAgent
      );

      if (!accessValidation.isValid) {
        this.logger.warn(`🚫 Parent access denied: ${accessValidation.message}`);
        throw new ForbiddenException(`Access denied: ${accessValidation.message}`);
      }


      // Add enhanced context to request for use in controllers
      request['parentAccess'] = {
        parentId: String(user.id),
        studentId: studentId,
        instituteId: instituteId,
        classId: classId,
        subjectId: subjectId,
        accessPath: accessValidation.accessData?.accessPath,
        relationshipType: accessValidation.accessData?.relationshipType,
        studentName: accessValidation.accessData?.studentName,
        dataSource: accessValidation.accessData?.dataSource
      };

      return true;

    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error(`❌ Error validating enhanced parent access:`, error);
      throw new ForbiddenException('Unable to validate parent access');
    }
  }

  /**
   * Extract parameter value from request parameters, query, or body
   */
  private extractStudentId(request: Request, paramName: string): string | null {
    // Try request parameters first (path parameters)
    if (request.params && request.params[paramName]) {
      return request.params[paramName];
    }

    // Try query parameters
    if (request.query && request.query[paramName]) {
      return request.query[paramName] as string;
    }

    // Try request body
    if (request.body && request.body[paramName]) {
      return request.body[paramName];
    }

    return null;
  }
}

/**
 * Parameter decorator to extract parent access context
 * Uses existing JWT user structure
 */
export const ParentAccessContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request['parentAccess'];
  },
);

/**
 * Enhanced type for parent access context
 */
export interface ParentAccessContext {
  parentId: string;
  studentId: string;
  instituteId: string;
  classId?: string;
  subjectId?: string;
  accessPath: string;
  relationshipType?: 'father' | 'mother' | 'guardian';
  studentName?: string;
  dataSource: string;
}
