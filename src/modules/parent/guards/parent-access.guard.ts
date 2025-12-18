import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ParentAccessService } from '../services/parent-access.service';
import { UserType } from '../../user/enums/user-type.enum';

// Metadata key for parent access decorator
export const PARENT_ACCESS_KEY = 'parentAccess';

// Interface for requests with parent access context  
export interface ParentAccessRequest extends Request {
  user?: any;
  params?: any;
  accessibleStudent?: {
    student: any;
    parentRelation: string;
  };
}

// Export types for external use
export interface AccessibleStudent {
  student: any;
  parentRelation: string;
}

// Decorator to specify which parameter contains the student ID
export const ParentAccess = (studentIdParam: string) => SetMetadata(PARENT_ACCESS_KEY, studentIdParam);

@Injectable()
export class ParentAccessGuard implements CanActivate {
  private readonly logger = new Logger(ParentAccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly parentAccessService: ParentAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ParentAccessRequest>();
    const handler = context.getHandler();
    
    // Get the student ID parameter name from metadata
    const studentIdParam = this.reflector.get<string>(PARENT_ACCESS_KEY, handler);
    
    // If no parent access decorator, allow access (not a parent-specific endpoint)
    if (!studentIdParam) {
      return true;
    }

    // Check if user is authenticated
    if (!request.user) {
      this.logger.error('❌ No authenticated user found');
      this.logger.error('❌ Request object keys:', Object.keys(request));
      this.logger.error('❌ Request headers:', request.headers);
      throw new ForbiddenException('Authentication required');
    }

    // Check if user is a parent
    if (request.user.userType !== UserType.USER_WITHOUT_STUDENT) {
      this.logger.error(`❌ Access denied: User ${request.user.email} is not a parent (type: ${request.user.userType})`);
      throw new ForbiddenException('Only parents can access this endpoint');
    }

    // Extract student ID from request parameters
    const studentId = request.params[studentIdParam];
    if (!studentId) {
      this.logger.error(`❌ Student ID parameter '${studentIdParam}' not found in request`);
      throw new ForbiddenException(`Student ID parameter '${studentIdParam}' is required`);
    }


    try {
      // Check if parent has access to this student
      const accessResult = await this.parentAccessService.hasAccessToStudent(request.user, studentId);
      
      if (!accessResult) {
        this.logger.error(`❌ Parent ${request.user.email} does not have access to student ${studentId}`);
        throw new ForbiddenException('You do not have access to this student');
      }

      // Attach accessible student info to request
      request.accessibleStudent = accessResult;
      
      return true;

    } catch (error) {
      this.logger.error(`❌ Parent access check failed: ${error.message}`);
      
      if (error instanceof ForbiddenException) {
        throw error;
      }
      
      throw new ForbiddenException('Parent access validation failed');
    }
  }
}
