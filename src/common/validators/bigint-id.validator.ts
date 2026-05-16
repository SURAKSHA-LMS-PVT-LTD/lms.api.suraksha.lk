import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { validate as isUUID } from 'uuid';

/**
 * Validates that the string represents a valid ID — either a UUID (post-migration)
 * or a legacy positive numeric BigInt string (pre-migration).
 * Used in DTOs for institute_id, class_id, subject_id fields.
 */
export function IsBigIntId(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isBigIntId',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === null || value === undefined) {
            return false;
          }
          const stringValue = String(value).trim().toLowerCase();
          // Accept UUID (post-migration institutes, classes, subjects)
          if (isUUID(stringValue)) {
            return true;
          }
          // Accept legacy positive numeric BigInt (users, etc.)
          if (/^\d+$/.test(stringValue)) {
            try {
              return BigInt(stringValue) > 0n;
            } catch {
              return false;
            }
          }
          return false;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid BigInt ID (positive numeric string)`;
        },
      },
    });
  };
}

/**
 * Validates an optional ID field — either a UUID or a legacy positive numeric BigInt string.
 */
export function IsOptionalBigIntId(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isOptionalBigIntId',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (value === null || value === undefined || value === '') {
            return true;
          }
          const stringValue = String(value).trim().toLowerCase();
          if (isUUID(stringValue)) {
            return true;
          }
          if (/^\d+$/.test(stringValue)) {
            try {
              return BigInt(stringValue) > 0n;
            } catch {
              return false;
            }
          }
          return false;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid BigInt ID (positive numeric string) or empty`;
        },
      },
    });
  };
}
