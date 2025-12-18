import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDate, IsBoolean, Min, Max, ValidateIf, registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Custom validator to check if a value is a valid Date object
 * This allows undefined/null but validates actual Date objects
 */
function IsValidDate(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isValidDate',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (value === null || value === undefined) {
            return true; // Allow null/undefined for optional fields
          }
          if (!(value instanceof Date)) {
            return false;
          }
          return !isNaN(value.getTime());
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid date`;
        }
      }
    });
  };
}
import { 
  INVALID_CLASS_NAME, 
  INVALID_CLASS_CODE, 
  INVALID_INSTITUTE_ID,
  INVALID_ACADEMIC_YEAR,
  INVALID_GRADE,
  INVALID_CLASS_SPECIALTY,
  INVALID_CLASS_TYPE,
  INVALID_CAPACITY
} from '../constants/institute-class.constants';
import { 
  TransformFormDataBoolean, 
  TransformFormDataNumber, 
  TransformFormDataDate 
} from '../../../../common/transformers/form-data.transformer';

export class CreateInstitueClassDto {
  @IsString()
  @IsNotEmpty({ message: INVALID_INSTITUTE_ID })
  instituteId: string;

  @IsString()
  @IsNotEmpty({ message: INVALID_CLASS_NAME })
  name: string;

  @IsString()
  @IsNotEmpty({ message: INVALID_CLASS_CODE })
  code: string;

  @IsOptional()
  @IsString()
  academicYear?: string;

  @IsOptional()
  @TransformFormDataNumber()
  @IsNumber()
  level?: number;

  @IsOptional()
  @TransformFormDataNumber()
  @IsNumber()
  @Min(1, { message: INVALID_GRADE })
  @Max(12, { message: INVALID_GRADE })
  grade?: number;

  @IsOptional()
  @IsString()
  specialty?: string;

  @IsString()
  @IsNotEmpty({ message: INVALID_CLASS_TYPE })
  classType: string;

  @IsOptional()
  @TransformFormDataNumber()
  @IsNumber()
  @Min(1, { message: INVALID_CAPACITY })
  capacity?: number;

  @IsOptionalBigIntId()
  classTeacherId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ 
    type: 'string',
    description: 'Class image URL from /upload/verify-and-publish endpoint. Accepts relative path or full URL.',
    example: 'institute-images/class-abc-123.jpg'
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @TransformFormDataBoolean()
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @TransformFormDataDate()
  @Type(() => Date)
  @IsValidDate({ message: 'startDate must be a valid date in format YYYY-MM-DD or ISO 8601' })
  startDate?: Date;

  @IsOptional()
  @TransformFormDataDate()
  @Type(() => Date)
  @IsValidDate({ message: 'endDate must be a valid date in format YYYY-MM-DD or ISO 8601' })
  endDate?: Date;

  // Self-enrollment fields
  @IsOptional()
  @IsString()
  enrollmentCode?: string;

  @IsOptional()
  @TransformFormDataBoolean()
  @IsBoolean()
  enrollmentEnabled?: boolean = false;

  @IsOptional()
  @TransformFormDataBoolean()
  @IsBoolean()
  requireTeacherVerification?: boolean = true;
}
