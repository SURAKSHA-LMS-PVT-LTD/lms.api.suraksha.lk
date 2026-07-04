import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'IsAfter', async: false })
export class IsAfterConstraint implements ValidatorConstraintInterface {
  validate(propertyValue: any, args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    const relatedValue = (args.object as any)[relatedPropertyName];

    // If either value is missing, we don't validate here (use @IsNotEmpty if required)
    if (!propertyValue || !relatedValue) {
      return true;
    }

    const valueDate = new Date(propertyValue);
    const relatedDate = new Date(relatedValue);

    // If either is an invalid date, we also don't validate here (use @IsDate or @IsDateString)
    if (isNaN(valueDate.getTime()) || isNaN(relatedDate.getTime())) {
      return true;
    }

    return valueDate.getTime() > relatedDate.getTime();
  }

  defaultMessage(args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    // Extracting user friendly property names (e.g. endTime -> end time)
    const propName = args.property.replace(/([A-Z])/g, ' $1').toLowerCase();
    const relatedPropName = relatedPropertyName.replace(/([A-Z])/g, ' $1').toLowerCase();
    
    return `${propName.charAt(0).toUpperCase() + propName.slice(1)} must be after ${relatedPropName}.`;
  }
}

export function IsAfter(property: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [property],
      validator: IsAfterConstraint,
    });
  };
}
