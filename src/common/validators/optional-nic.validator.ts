import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, registerDecorator, ValidationOptions } from 'class-validator';

@ValidatorConstraint({ name: 'isOptionalNic', async: false })
export class IsOptionalNicConstraint implements ValidatorConstraintInterface {
  validate(nic: any, args: ValidationArguments) {
    // If nic is undefined, null, or empty string, it's valid (optional)
    if (nic === undefined || nic === null || nic === '') {
      return true;
    }
    
    // If nic is provided, it should be a string with length between 10-20
    if (typeof nic === 'string') {
      return nic.length >= 10 && nic.length <= 20;
    }
    
    return false;
  }

  defaultMessage(args: ValidationArguments) {
    return 'NIC must be between 10 and 20 characters when provided, or can be left empty';
  }
}

export function IsOptionalNic(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsOptionalNicConstraint,
    });
  };
}
