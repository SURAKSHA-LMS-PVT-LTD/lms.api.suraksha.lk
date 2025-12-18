import { Injectable, PipeTransform, ArgumentMetadata, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

export interface FilteredQuery {
  instituteId?: string;
  classId?: string;
  subjectId?: string;
  teacherId?: string;
  studentId?: string;
  [key: string]: any;
}

/**
 * Pipe to enforce access control filtering on query parameters
 * Ensures users can only access data they have permission for
 */
@Injectable()
export class AccessControlFilterPipe implements PipeTransform {
  
  async transform(value: FilteredQuery, metadata: ArgumentMetadata): Promise<FilteredQuery> {
    if (metadata.type !== 'query') {
      return value;
    }

    // Get the request context (should be set by AccessControlGuard)
    const request = this.getRequest();
    if (!request) {
      throw new BadRequestException('Request context not available');
    }

    const user = request.user;
    const accessContext = request.accessContext;

    if (!user) {
      throw new BadRequestException('User context not available');
    }

    // Apply filtering based on user type and permissions
    return this.applyAccessControlFilters(value, user, accessContext);
  }

  private applyAccessControlFilters(
    query: FilteredQuery, 
    user: any, 
    accessContext: any
  ): FilteredQuery {
    const filteredQuery = { ...query };

    // Get accessible institute IDs from user token
    const accessibleInstituteIds = this.getAccessibleInstituteIds(user);

    // Institute ID filtering
    if (query.instituteId) {
      // Validate user has access to specified institute
      if (!accessibleInstituteIds.includes(query.instituteId)) {
        throw new ForbiddenException(`Access denied to institute ID: ${query.instituteId}`);
      }
    } else {
      // If no institute specified and user has limited access, apply restriction
      if (accessibleInstituteIds.length === 1) {
        filteredQuery.instituteId = accessibleInstituteIds[0];
      } else if (accessibleInstituteIds.length === 0) {
        throw new ForbiddenException('No accessible institutes found');
      }
      // For multiple institutes, let service handle broader filtering
    }

    // Class ID filtering (only if institute is accessible)
    if (query.classId && query.instituteId) {
      const hasClassAccess = this.hasClassAccess(user, query.instituteId, query.classId);
      if (!hasClassAccess) {
        throw new ForbiddenException(`Access denied to class ID: ${query.classId}`);
      }
    }

    // Access control will be handled by decorators - no need for manual user type filtering

    // Subject ID filtering (validate access if specified)
    if (query.subjectId && query.instituteId && query.classId) {
      const hasSubjectAccess = this.hasSubjectAccess(user, query.instituteId, query.classId, query.subjectId);
      if (!hasSubjectAccess) {
        throw new ForbiddenException(`Access denied to subject ID: ${query.subjectId}`);
      }
    }

    return filteredQuery;
  }

  private getAccessibleInstituteIds(user: any): string[] {
    if (!user.instituteAccess || !Array.isArray(user.instituteAccess)) {
      return [];
    }

    return user.instituteAccess.map((access: any) => access.instituteId);
  }

  private hasClassAccess(user: any, instituteId: string, classId: string): boolean {
    const instituteAccess = user.instituteAccess?.find(
      (access: any) => access.instituteId === instituteId
    );

    if (!instituteAccess) {
      return false;
    }

    // Admin users have access to all classes in their institute
    if (instituteAccess.role === 'ADMIN' || instituteAccess.role === 'SUPER_ADMIN') {
      return true;
    }

    // Check if user has specific class access
    return instituteAccess.classIds?.includes(classId) || false;
  }

  private hasSubjectAccess(user: any, instituteId: string, classId: string, subjectId: string): boolean {
    const instituteAccess = user.instituteAccess?.find(
      (access: any) => access.instituteId === instituteId
    );

    if (!instituteAccess) {
      return false;
    }

    // Admin users have access to all subjects
    if (instituteAccess.role === 'ADMIN' || instituteAccess.role === 'SUPER_ADMIN') {
      return true;
    }

    // For teachers, check if they teach this subject in this class
    if (user.userType === 'TEACHER') {
      // This would need to be enhanced based on your subject-teacher mapping
      return instituteAccess.subjectIds?.includes(subjectId) || false;
    }

    // For students, check if they're enrolled in this subject
    if (user.userType === 'STUDENT') {
      // This would need to be enhanced based on your student-subject enrollment
      return this.hasClassAccess(user, instituteId, classId);
    }

    return false;
  }

  private isInstituteAdmin(user: any, instituteId: string): boolean {
    const instituteAccess = user.instituteAccess?.find(
      (access: any) => access.instituteId === instituteId
    );

    return instituteAccess?.role === 'ADMIN' || instituteAccess?.role === 'SUPER_ADMIN';
  }

  private getRequest(): any {
    // This is a simplified way to get request context
    // In a real implementation, you might want to use REQUEST scoped providers
    // or Async Local Storage for better context management
    const { Request } = require('express');
    return Request.current || null;
  }
}

// Helper decorator to apply access control filtering to query parameters
export function ApplyAccessControlFilter() {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      // Apply filtering logic here if needed
      return method.apply(this, args);
    };
    return descriptor;
  };
}
