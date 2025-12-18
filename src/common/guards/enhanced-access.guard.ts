import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EnhancedInstituteAccessEntry, GLOBAL_INSTITUTE_ACCESS_FLAG } from '../../auth/interfaces/enhanced-jwt-payload.interface';
import { EnhancedAccessRule, ENHANCED_ACCESS_RULES_KEY, AllowedAccessRole } from './enhanced-access.types';
import { UserType } from '../../modules/user/enums/user-type.enum';

@Injectable()
export class EnhancedAccessGuard implements CanActivate {
  private readonly logger = new Logger(EnhancedAccessGuard.name);

  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const rules = this.reflector.get<EnhancedAccessRule[]>(ENHANCED_ACCESS_RULES_KEY, handler) || [];

    // When no enhanced rules are registered, allow the request to continue.
    if (!rules.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    let lastFailure: string | undefined;

    for (const rule of rules) {
      const { passed, reason } = this.evaluateRule(rule, request, user);
      if (passed) {
        return true;
      }
      if (reason) {
        lastFailure = reason;
      }
    }

    throw new ForbiddenException(lastFailure || 'Access denied');
  }

  private evaluateRule(
    rule: EnhancedAccessRule,
    request: any,
    user: any
  ): { passed: boolean; reason?: string } {
    switch (rule.type) {
      case 'SYSTEM_ADMIN':
        return this.isSystemAdmin(user)
          ? { passed: true }
          : { passed: false, reason: 'Requires system administrator or organization manager access' };

      case 'INSTITUTE_ADMIN': {
        const instituteId = this.getValueFromRequest(request, rule.instituteParam);
        if (!instituteId) {
          return { passed: false, reason: `Missing institute parameter "${rule.instituteParam}"` };
        }

        if (this.hasGlobalAccess(user) || this.hasRoleForInstitute(user, instituteId, ['INSTITUTE_ADMIN'])) {
          return { passed: true };
        }

        if ((rule.allowAttendanceMarker ?? true) && this.hasRoleForInstitute(user, instituteId, ['ATTENDANCE_MARKER'])) {
          return { passed: true };
        }

        return {
          passed: false,
          reason: `User lacks institute administrator privileges for institute ${instituteId}`,
        };
      }

      case 'PARENT_ACCESS': {
        const studentId = this.getValueFromRequest(request, rule.studentParam);
        if (!studentId) {
          return { passed: false, reason: `Missing student parameter "${rule.studentParam}"` };
        }

        if (this.hasGlobalAccess(user) || this.hasChild(user, studentId)) {
          return { passed: true };
        }

        return {
          passed: false,
          reason: `User is not authorized as parent/guardian for student ${studentId}`,
        };
      }

      case 'USER_TYPE_ACCESS': {
        const instituteId = rule.instituteParam ? this.getValueFromRequest(request, rule.instituteParam) : undefined;
        const targetUserId = rule.userIdParam ? this.getValueFromRequest(request, rule.userIdParam) : undefined;
        const classId = rule.classParam ? this.getValueFromRequest(request, rule.classParam) : undefined;
        const subjectId = rule.subjectParam ? this.getValueFromRequest(request, rule.subjectParam) : undefined;
        const defaultRoles: AllowedAccessRole[] = ['TEACHER', 'PARENT', 'STUDENT'];
        const allowedRoles = rule.allowedRoles && rule.allowedRoles.length ? rule.allowedRoles : defaultRoles;

        for (const allowedRole of allowedRoles) {
          if (this.checkRoleAccess(user, allowedRole, { instituteId, targetUserId, classId, subjectId })) {
            return { passed: true };
          }
        }

        return {
          passed: false,
          reason: `User lacks required roles (${allowedRoles.join(', ')}) for requested resource`,
        };
      }

      default:
        return { passed: false, reason: 'Unsupported access rule' };
    }
  }

  private checkRoleAccess(
    user: any,
    role: AllowedAccessRole,
    params: {
      instituteId?: string;
      targetUserId?: string;
      classId?: string;
      subjectId?: string;
    }
  ): boolean {
    switch (role) {
      case 'SYSTEM_ADMIN':
        return this.isSystemAdmin(user);
      case 'INSTITUTE_ADMIN':
        return !!params.instituteId && this.hasRoleForInstitute(user, params.instituteId, ['INSTITUTE_ADMIN']);
      case 'ATTENDANCE_MARKER':
        return !!params.instituteId && this.hasRoleForInstitute(user, params.instituteId, ['ATTENDANCE_MARKER']);
      case 'TEACHER':
        if (!params.instituteId) {
          return false;
        }
        return this.hasClassAndSubjectAccess(user, params.instituteId, 'TEACHER', params.classId, params.subjectId);
      case 'STUDENT':
        if (!params.instituteId) {
          return false;
        }
        return this.hasClassAndSubjectAccess(user, params.instituteId, 'STUDENT', params.classId, params.subjectId);
      case 'PARENT':
        return !!params.targetUserId && this.hasChild(user, params.targetUserId);
      default:
        return false;
    }
  }

  private getValueFromRequest(request: any, key?: string): string | undefined {
    if (!key) {
      return undefined;
    }

    if (request.params && request.params[key] !== undefined) {
      return this.normalizeId(request.params[key]);
    }

    if (request.query && request.query[key] !== undefined) {
      return this.normalizeId(request.query[key]);
    }

    if (request.body && request.body[key] !== undefined) {
      return this.normalizeId(request.body[key]);
    }

    return undefined;
  }

  private hasRoleForInstitute(user: any, instituteId: string, roles: AllowedAccessRole[]): boolean {
    if (this.hasGlobalAccess(user)) {
      return true;
    }

    const entries = this.getInstituteAccessEntries(user);
    const targetInstitute = entries.find(
      (entry) => this.normalizeId(entry.i) === this.normalizeId(instituteId),
    );

    if (!targetInstitute) {
      return false;
    }

    // Convert bitmask to role tokens
    const roleTokens: string[] = [];
    if (targetInstitute.r & 8) roleTokens.push('IA'); // Institute Admin
    if (targetInstitute.r & 4) roleTokens.push('TE'); // Teacher  
    if (targetInstitute.r & 2) roleTokens.push('ST'); // Student
    if (targetInstitute.r & 1) roleTokens.push('AM'); // Attendance Marker

    return roles.some((role) => roleTokens.includes(this.mapRoleToToken(role)));
  }

  private hasClassAndSubjectAccess(
    user: any,
    instituteId: string,
    role: 'TEACHER' | 'STUDENT',
    classId?: string,
    subjectId?: string,
  ): boolean {
    if (!this.hasRoleForInstitute(user, instituteId, [role])) {
      return false;
    }

    if (!classId) {
      return true; // Role on institute is enough when no class constraint
    }

    const entries = this.getInstituteAccessEntries(user);
    const instituteEntry = entries.find(
      (entry) => this.normalizeId(entry.i) === this.normalizeId(instituteId),
    );

    if (!instituteEntry || !instituteEntry.c?.length) {
      return false;
    }

    const targetClass = instituteEntry.c.find(
      (cls) => this.normalizeId(cls[0]) === this.normalizeId(classId),
    );

    if (!targetClass) {
      return false;
    }

    if (!subjectId) {
      return true;
    }

    // Check subject access using bitmask
    if (targetClass.length === 1) {
      // No subject bitmask, has access to all subjects in class
      return true;
    }
    
    if (targetClass.length >= 2) {
      const subjectBitmask = targetClass[1];
      const subjectNum = Number(subjectId);
      if (subjectNum > 0 && subjectNum <= 30) {
        return (subjectBitmask & (1 << (subjectNum - 1))) !== 0;
      }
    }
    
    return false;
  }

  private hasChild(user: any, studentUserId: string): boolean {
    if (this.hasGlobalAccess(user)) {
      return true;
    }

    const children = this.getChildrenAccess(user);
    return children.includes(this.normalizeId(studentUserId));
  }

  private getInstituteAccessEntries(user: any): EnhancedInstituteAccessEntry[] {
    const entries = user.enhancedInstituteAccess || user.instituteAccess || [];
    return Array.isArray(entries) ? entries : [];
  }

  private getChildrenAccess(user: any): string[] {
    const children = user.enhancedChildrenAccess || user.childrenAccess || user.ca || [];
    if (!Array.isArray(children)) {
      return [];
    }
    return children.map((id) => this.normalizeId(id));
  }

  private hasGlobalAccess(user: any): boolean {
    if (user.hasGlobalInstituteAccess) {
      return true;
    }

    const compactType = (user.ut || '').toUpperCase();
    if (compactType === 'SA' || compactType === 'OM') {
      return true;
    }

    const userType = (user.userType || '').toString().toUpperCase();
    if (userType === UserType.SUPERADMIN || userType === 'SUPER_ADMIN' || userType === UserType.ORGANIZATION_MANAGER) {
      return true;
    }

    const payload = user.jwtPayload;
    if (payload && typeof payload.ia === 'number') {
      return payload.ia === GLOBAL_INSTITUTE_ACCESS_FLAG;
    }

    return false;
  }

  private isSystemAdmin(user: any): boolean {
    const compactType = (user.ut || '').toUpperCase();
    if (compactType === 'SA' || compactType === 'OM') {
      return true;
    }

    const userType = (user.userType || '').toString().toUpperCase();
    return userType === UserType.SUPERADMIN || userType === 'SUPER_ADMIN' || userType === UserType.ORGANIZATION_MANAGER;
  }

  private mapRoleToToken(role: AllowedAccessRole): string {
    const roleMap: Record<AllowedAccessRole, string> = {
      SYSTEM_ADMIN: 'SA',
      INSTITUTE_ADMIN: 'IA',
      ATTENDANCE_MARKER: 'AM',
      TEACHER: 'TE',
      STUDENT: 'ST',
      PARENT: 'PA',
    };
    return roleMap[role];
  }

  private normalizeId(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).trim();
  }
}
