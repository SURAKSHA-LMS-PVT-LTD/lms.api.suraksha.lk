import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { UserType } from '../../modules/user/enums/user-type.enum';

/**
 * Allowed user types for public user creation
 * 
 * SUPERADMIN and ORGANIZATION_MANAGER cannot be created via normal user creation endpoints
 * These are system-level roles that must be created through special admin processes
 */
const ALLOWED_USER_CREATION_TYPES = [
  UserType.USER,
  UserType.USER_WITHOUT_PARENT,
  UserType.USER_WITHOUT_STUDENT
];

/**
 * Custom validator to restrict user type during creation
 * 
 * Only allows:
 * - USER: Can play any role + can be parent
 * - USER_WITHOUT_PARENT: Can play any role except parent
 * - USER_WITHOUT_STUDENT: Can only be parent, not student
 * 
 * Blocks:
 * - SUPERADMIN: System admin (cannot be created publicly)
 * - ORGANIZATION_MANAGER: Org admin (cannot be created publicly)
 */
export function IsAllowedUserType(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isAllowedUserType',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (!value) return false;
          return ALLOWED_USER_CREATION_TYPES.includes(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `User type must be one of: USER, USER_WITHOUT_PARENT, USER_WITHOUT_STUDENT. SUPERADMIN and ORGANIZATION_MANAGER cannot be created through this endpoint.`;
        }
      }
    });
  };
}

/**
 * Get list of allowed user types for creation
 */
export function getAllowedUserCreationTypes(): UserType[] {
  return [...ALLOWED_USER_CREATION_TYPES];
}

/**
 * Check if a user type is allowed for creation
 */
export function isUserTypeAllowedForCreation(userType: UserType): boolean {
  return ALLOWED_USER_CREATION_TYPES.includes(userType);
}
