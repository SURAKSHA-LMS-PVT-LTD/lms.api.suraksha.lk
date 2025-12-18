import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

/**
 * Validates that the string represents a valid BigInt ID
 * Used in DTOs for BigInt ID fields
 */
export function IsBigIntId(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isBigIntId',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (value === null || value === undefined) {
            return false;
          }
          
          // Convert to string if it's a number
          const stringValue = String(value);
          
          // Check if it's a valid numeric string
          if (!/^\d+$/.test(stringValue)) {
            return false;
          }

          try {
            const bigIntValue = BigInt(stringValue);
            // Must be positive
            return bigIntValue > 0;
          } catch (error) {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid BigInt ID (positive numeric string)`;
        },
      },
    });
  };
}

/**
 * Validates that the string represents a valid optional BigInt ID
 * Used in DTOs for optional BigInt ID fields
 */
export function IsOptionalBigIntId(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isOptionalBigIntId',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (value === null || value === undefined || value === '') {
            return true; // Optional field can be empty
          }
          
          // Convert to string if it's a number
          const stringValue = String(value);
          
          // Check if it's a valid numeric string
          if (!/^\d+$/.test(stringValue)) {
            return false;
          }

          try {
            const bigIntValue = BigInt(stringValue);
            // Must be positive
            return bigIntValue > 0;
          } catch (error) {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid BigInt ID (positive numeric string) or empty`;
        },
      },
    });
  };
}
