import { UseGuards } from '@nestjs/common';
import { EnhancedAccessGuard } from '../guards/enhanced-access.guard';
import {
  AllowedAccessRole,
  EnhancedAccessRule,
  ENHANCED_ACCESS_RULES_KEY,
} from '../guards/enhanced-access.types';

function registerEnhancedRule(rule: EnhancedAccessRule): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const existing: EnhancedAccessRule[] =
      Reflect.getMetadata(ENHANCED_ACCESS_RULES_KEY, descriptor.value) || [];

    Reflect.defineMetadata(ENHANCED_ACCESS_RULES_KEY, [...existing, rule], descriptor.value);

    UseGuards(EnhancedAccessGuard)(target, propertyKey, descriptor);
  };
}

export function SystemAdmin(): MethodDecorator {
  return registerEnhancedRule({ type: 'SYSTEM_ADMIN' });
}

export function InstituteAdmin(
  instituteParam: string,
  allowAttendanceMarker: boolean = true
): MethodDecorator {
  return registerEnhancedRule({
    type: 'INSTITUTE_ADMIN',
    instituteParam,
    allowAttendanceMarker,
  });
}

export function ValidateParentAccess(studentParam: string): MethodDecorator {
  return registerEnhancedRule({
    type: 'PARENT_ACCESS',
    studentParam,
  });
}

export function ValidateStudentAccess(
  instituteParam: string,
  classParam?: string,
  subjectParam?: string
): MethodDecorator {
  return registerEnhancedRule({
    type: 'USER_TYPE_ACCESS',
    instituteParam,
    classParam,
    subjectParam,
    allowedRoles: ['STUDENT'],
  });
}

export function UserTypeAccess(
  instituteParam?: string,
  userIdParam?: string,
  classParam?: string,
  subjectParam?: string,
  allowedRoles: AllowedAccessRole[] = ['TEACHER', 'PARENT', 'STUDENT']
): MethodDecorator {
  return registerEnhancedRule({
    type: 'USER_TYPE_ACCESS',
    instituteParam,
    userIdParam,
    classParam,
    subjectParam,
    allowedRoles,
  });
}
