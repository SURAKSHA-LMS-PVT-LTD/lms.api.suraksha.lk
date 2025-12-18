import { PipeTransform, Injectable, BadRequestException, ForbiddenException, ExecutionContext } from '@nestjs/common';
import { CreateInstituteClassSubjectDto, BulkCreateInstituteClassSubjectDto } from '../dto/create-institute_class_subject.dto';
import { ArgumentMetadata } from '@nestjs/common';


// JWT validation utilities
function extractInstituteAccessFromJWT(user: any): string[] {
  const userInstituteIds: string[] = [];
  
  // Extract institute IDs based on JWT structure
  if (user?.ha) {
    // Hierarchical access (students/teachers): { instituteId: { classId: [subjectIds] } }
    userInstituteIds.push(...Object.keys(user.ha));
  } else if (user?.aa) {
    // Admin access (institute admins): { instituteId: 1|0 }
    userInstituteIds.push(...Object.keys(user.aa).filter(id => user.aa[id] === 1));
  }
  
  return userInstituteIds;
}

function validateJWTInstituteAccess(user: any, requestedInstituteId: string): boolean {
  // System admin has access everywhere
  if (user?.sd === 1) {
    return true;
  }
  
  const userInstituteIds = extractInstituteAccessFromJWT(user);
  return userInstituteIds.includes(requestedInstituteId);
}

function validateJWTClassAccess(user: any, requestedInstituteId: string, requestedClassId: string): boolean {
  // System admin has access everywhere
  if (user?.sd === 1) {
    return true;
  }
  
  // Check institute admin access
  if (user?.aa && user.aa[requestedInstituteId] === 1) {
    return true;
  }
  
  // Check teacher hierarchical access
  if (user?.ha && user.ha[requestedInstituteId] && user.ha[requestedInstituteId][requestedClassId]) {
    return true;
  }
  
  return false;
}

function getUserFromContext(metadata: ArgumentMetadata): any {
  // Get user from request context - this will be available from the JWT guard
  return null; // Will be injected via transform method parameter
}

@Injectable()
export class InstituteClassSubjectValidationPipe implements PipeTransform {
  transform(value: CreateInstituteClassSubjectDto, metadata: ArgumentMetadata) {
    // No validation needed - students can enroll in any subject
    // JWT-based authorization will be handled by the EnhancedRolesGuard
    // instituteId, classId, and subjectId are set from URL parameters in the controller
    return value;
  }
}

@Injectable()
export class BulkInstituteClassSubjectValidationPipe implements PipeTransform {
  transform(value: BulkCreateInstituteClassSubjectDto, metadata: ArgumentMetadata) {
    // No validation needed - students can enroll in any subjects
    // JWT-based authorization will be handled by the EnhancedRolesGuard
    // instituteId and classId are set from URL parameters in the controller
    return value;
  }
}

@Injectable()
export class InstituteClassSubjectParamsValidationPipe implements PipeTransform {
  transform(value: any) {
    if (value.instituteId && typeof value.instituteId !== 'string') {
      throw new BadRequestException('Institute ID must be a string');
    }

    if (value.classId && typeof value.classId !== 'string') {
      throw new BadRequestException('Class ID must be a string');
    }

    if (value.subjectId && typeof value.subjectId !== 'string') {
      throw new BadRequestException('Subject ID must be a string');
    }

    return value;
  }
}
