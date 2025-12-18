import { Injectable, CanActivate, ExecutionContext, Logger, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserType } from '../../modules/user/enums/user-type.enum';
import { 
  VALIDATE_ENHANCED_ACCESS_KEY,
  VALIDATE_INSTITUTE_ADMIN_KEY, 
  VALIDATE_GLOBAL_OR_INSTITUTE_KEY,
  EnhancedAccessValidation,
  InstituteAdminValidation,
  GlobalOrInstituteValidation
} from '../decorators/enhanced-validation.decorators';
import { 
  EnhancedJwtPayload, 
  EnhancedInstituteAccessEntry,
  GLOBAL_INSTITUTE_ACCESS_FLAG,
  ROLE_BITMASKS,
  COMPACT_TO_USER_TYPE,
  CompactClassAccess
} from '../../auth/interfaces/enhanced-jwt-payload.interface';

@Injectable() 
export class EnhancedValidationGuard implements CanActivate {
  private readonly logger = new Logger(EnhancedValidationGuard.name);

  constructor(private reflector: Reflector) {}

  private fromCompactUserType(compactType: number): UserType {
    const typeStr = COMPACT_TO_USER_TYPE[compactType as keyof typeof COMPACT_TO_USER_TYPE];
    return UserType[typeStr as keyof typeof UserType] || UserType.USER;
  }

  private hasRole(roleBitmask: number, role: keyof typeof ROLE_BITMASKS): boolean {
    return (roleBitmask & ROLE_BITMASKS[role]) !== 0;
  }

  private subjectInBitmask(subjectId: number, bitmask: number): boolean {
    if (subjectId <= 0 || subjectId > 30) return false;
    return (bitmask & (1 << (subjectId - 1))) !== 0;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.error('No user found in request - ensure JWT guard is applied first');
      throw new UnauthorizedException('Authentication required');
    }

    // Check for enhanced access validation
    const enhancedValidation = this.reflector.get<EnhancedAccessValidation>(
      VALIDATE_ENHANCED_ACCESS_KEY,
      context.getHandler()
    );

    if (enhancedValidation) {
      return await this.validateEnhancedAccess(request, user, enhancedValidation);
    }

    // Check for institute admin validation
    const instituteAdminValidation = this.reflector.get<InstituteAdminValidation>(
      VALIDATE_INSTITUTE_ADMIN_KEY,
      context.getHandler()
    );

    if (instituteAdminValidation) {
      return await this.validateInstituteAdmin(request, user, instituteAdminValidation);
    }

    // Check for global or institute validation  
    const globalOrInstituteValidation = this.reflector.get<GlobalOrInstituteValidation>(
      VALIDATE_GLOBAL_OR_INSTITUTE_KEY,
      context.getHandler()
    );

    if (globalOrInstituteValidation) {
      return await this.validateGlobalOrInstitute(request, user, globalOrInstituteValidation);
    }

    // No validation metadata found - allow access
    return true;
  }

  /**
   * 🚀 MAIN VALIDATION: Enhanced access using V2 JWT comprehensive data
   */
  private async validateEnhancedAccess(
    request: any,
    user: EnhancedJwtPayload,
    validation: EnhancedAccessValidation
  ): Promise<boolean> {
    try {
      
      // Extract user type and check global access first
      const userType = this.fromCompactUserType(user.u);
      const allowedGlobalTypes = validation.allowedGlobalUserTypes || [];
      
      // PATH 1: Global access (SUPERADMIN, ORGANIZATION_MANAGER)  
      if (allowedGlobalTypes.includes(userType)) {
        return true;
      }

      // PATH 2: Institute access validation
      if (validation.instituteIdParam) {
        const instituteId = this.extractParam(request, validation.instituteIdParam);
        
        if (instituteId && await this.validateInstituteAccess(user, instituteId, validation, request)) {
          return true;
        }
      }

      // PATH 3: Parent access through children
      if (validation.allowParentAccess && validation.studentIdParam) {
        const studentId = this.extractParam(request, validation.studentIdParam);
        
        if (studentId && await this.validateParentAccess(user, studentId)) {
          return true;
        }
      }

      const message = validation.customMessage || 'Enhanced access validation failed';
      this.logger.warn(`❌ ${message} for user ${user.s}`);
      throw new ForbiddenException(message);
      
    } catch (error) {
      this.logger.error(`💥 Enhanced validation error:`, error.message);
      throw new ForbiddenException(error.message);
    }
  }

  /**
   * 🎯 INSTITUTE ADMIN: Specific validation for institute admin role
   */
  private async validateInstituteAdmin(
    request: any,
    user: EnhancedJwtPayload,
    validation: InstituteAdminValidation
  ): Promise<boolean> {
    try {
      
      const userType = this.fromCompactUserType(user.u);
      
      // Check global access if allowed
      if (validation.allowGlobalAccess && 
          (userType === UserType.SUPERADMIN || userType === UserType.ORGANIZATION_MANAGER)) {
        return true;
      }

      // Check institute admin role for specific institute
      if (validation.instituteIdParam) {
        const instituteId = this.extractParam(request, validation.instituteIdParam);
        
        if (instituteId && this.hasInstituteRole(user, instituteId, ['IA'])) {
          return true;
        }
      }

      const message = validation.customMessage || 'Institute administrator access required';
      this.logger.warn(`❌ ${message} for user ${user.s}`);
      throw new ForbiddenException(message);
      
    } catch (error) {
      this.logger.error(`💥 Institute admin validation error:`, error.message);
      throw new ForbiddenException(error.message);
    }
  }

  /**
   * ⚡ HYBRID: Global OR institute access validation
   */
  private async validateGlobalOrInstitute(
    request: any,
    user: EnhancedJwtPayload,
    validation: GlobalOrInstituteValidation
  ): Promise<boolean> {
    try {
      
      const userType = this.fromCompactUserType(user.u);
      const allowedGlobalTypes = validation.allowedGlobalUserTypes || 
                                [UserType.SUPERADMIN, UserType.ORGANIZATION_MANAGER];
      
      // PATH 1: Global access
      if (allowedGlobalTypes.includes(userType)) {
        return true;
      }

      // PATH 2: Institute access  
      if (validation.instituteIdParam) {
        const instituteId = this.extractParam(request, validation.instituteIdParam);
        const allowedRoles = validation.allowedInstituteRoles || ['IA'];
        
        if (instituteId && this.hasInstituteRole(user, instituteId, allowedRoles)) {
          return true;
        }
      }

      const message = validation.customMessage || 'Global or institute access required';
      this.logger.warn(`❌ ${message} for user ${user.s}`);
      throw new ForbiddenException(message);
      
    } catch (error) {
      this.logger.error(`💥 Global or institute validation error:`, error.message);
      throw new ForbiddenException(error.message);
    }
  }

  /**
   * 🏫 Validate institute-level access from JWT payload
   */
  private async validateInstituteAccess(
    user: EnhancedJwtPayload,
    instituteId: string,
    validation: EnhancedAccessValidation,
    request?: any
  ): Promise<boolean> {
    // Check if user has global institute access
    if (user.i === GLOBAL_INSTITUTE_ACCESS_FLAG) {
      return true;
    }

    // Check specific institute access
    const allowedRoles = validation.allowedInstituteRoles || ['IA', 'TE', 'ST'];
    
    if (!this.hasInstituteRole(user, instituteId, allowedRoles)) {
      return false;
    }

    // Additional class/subject validation if required
    if (validation.requireClassAccess && validation.classIdParam) {
      const classId = this.extractParam(request, validation.classIdParam);
      if (classId && !this.hasClassAccess(user, instituteId, classId)) {
        this.logger.warn(`❌ Class access required for class ${classId}`);
        return false;
      }
    }

    if (validation.requireSubjectAccess && validation.subjectIdParam) {
      const subjectId = this.extractParam(request, validation.subjectIdParam);
      if (subjectId && !this.hasSubjectAccess(user, instituteId, validation.classIdParam, subjectId)) {
        this.logger.warn(`❌ Subject access required for subject ${subjectId}`);
        return false;
      }
    }

    return true;
  }

  /**
   * 👨‍👩‍👧‍👦 Validate parent access through children
   */
  private async validateParentAccess(user: EnhancedJwtPayload, studentId: string): Promise<boolean> {
    if (!user.c || user.c.length === 0) {
      this.logger.warn(`❌ User ${user.s} has no children access data`);
      return false;
    }

    if (user.c.includes(studentId)) {
      return true;
    }

    this.logger.warn(`❌ User ${user.s} is not parent of student ${studentId}`);
    return false;
  }

  /**
   * 🔍 Check if user has specific institute role (supports multiple entries per institute)
   */
  private hasInstituteRole(user: EnhancedJwtPayload, instituteId: string, allowedRoles: string[]): boolean {
    // Global access
    if (user.i === GLOBAL_INSTITUTE_ACCESS_FLAG) {
      return true;
    }
    
    // Check specific institute access - supports multiple entries for same institute
    if (Array.isArray(user.i)) {
      // Find all entries for this institute
      const entries = user.i.filter(entry => entry.i === instituteId);
      for (const entry of entries) {
        // Check if any allowed role matches the bitmask
        if (allowedRoles.some(role => this.hasRole(entry.r, role as keyof typeof ROLE_BITMASKS))) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 📚 Check if user has access to specific class
   */
  private hasClassAccess(user: EnhancedJwtPayload, instituteId: string, classId: string): boolean {
    if (user.i === GLOBAL_INSTITUTE_ACCESS_FLAG) {
      return true;
    }

    if (Array.isArray(user.i)) {
      const instituteAccess = user.i.find(entry => entry.i === instituteId);
      
      if (instituteAccess?.c) {
        return instituteAccess.c.some(cls => cls[0] === classId);
      }
    }

    return false;
  }

  /**
   * 📖 Check if user has access to specific subject
   */
  private hasSubjectAccess(
    user: EnhancedJwtPayload, 
    instituteId: string, 
    classIdParam: string, 
    subjectId: string
  ): boolean {
    if (user.i === GLOBAL_INSTITUTE_ACCESS_FLAG) {
      return true;
    }

    if (Array.isArray(user.i)) {
      const instituteAccess = user.i.find(entry => entry.i === instituteId);
      
      if (instituteAccess?.c) {
        // Find the class and check subject access using bitmask
        const classAccess = instituteAccess.c.find(cls => {
          // If classIdParam is provided, match against it, otherwise check all classes
          return classIdParam ? cls[0] === classIdParam : true;
        });
        
        if (classAccess) {
          // If no subject bitmask specified, access to all subjects in class
          if (classAccess.length === 1) {
            return true;
          }
          // Check specific subject access using bitmask
          if (classAccess.length >= 2) {
            const subjectBitmask = classAccess[1];
            return this.subjectInBitmask(Number(subjectId), subjectBitmask);
          }
        }
      }
    }

    return false;
  }

  /**
   * 🔧 Extract parameter from request (params, query, body)
   */
  private extractParam(request: any, paramName: string): string | null {
    // Check route parameters first
    if (request.params?.[paramName]) {
      return request.params[paramName];
    }

    // Check query parameters
    if (request.query?.[paramName]) {
      return request.query[paramName];
    }

    // Check request body
    if (request.body?.[paramName]) {
      return request.body[paramName];
    }

    return null;
  }
}
