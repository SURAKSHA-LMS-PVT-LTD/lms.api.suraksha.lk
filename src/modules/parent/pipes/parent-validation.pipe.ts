import { Injectable, PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateParentDto } from '../dto/create-parent.dto';
import { UpdateParentDto } from '../dto/update-parent.dto';
import { QueryParentDto } from '../dto/query-parent.dto';
import { PARENT_CONSTANTS } from '../constants/parent.constants';

@Injectable()
export class ParentValidationPipe implements PipeTransform {
  async transform(value: any, metadata: ArgumentMetadata) {
    if (!value) {
      throw new BadRequestException('Validation failed: No data provided');
    }

    if (metadata.type !== 'body') {
      return value;
    }

    const { metatype } = metadata;
    if (!metatype || !this.shouldValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype, value);
    const errors = await validate(object);

    if (errors.length > 0) {
      const errorMessages = this.formatErrors(errors);
      throw new BadRequestException({
        message: 'Validation failed',
        errors: errorMessages,
      });
    }

    return object;
  }

  private shouldValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private formatErrors(errors: ValidationError[]): string[] {
    return errors.map(error => {
      const constraints = error.constraints;
      return Object.values(constraints).join(', ');
    });
  }
}

@Injectable()
export class ParentEmailValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value && value.user && value.user.email) {
      const email = value.user.email.toLowerCase().trim();
      
      if (!PARENT_CONSTANTS.PATTERNS.EMAIL.test(email)) {
        throw new BadRequestException('Invalid email format');
      }
      
      value.user.email = email;
    }
    
    return value;
  }
}

@Injectable()
export class ParentPhoneValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value && value.user && value.user.phone) {
      const phone = value.user.phone.replace(/\s+/g, '');
      
      if (!PARENT_CONSTANTS.PATTERNS.PHONE.test(phone)) {
        throw new BadRequestException('Invalid phone number format');
      }
      
      value.user.phone = phone;
    }

    if (value && value.workPhone) {
      const workPhone = value.workPhone.replace(/\s+/g, '');
      
      if (!PARENT_CONSTANTS.PATTERNS.PHONE.test(workPhone)) {
        throw new BadRequestException('Invalid work phone number format');
      }
      
      value.workPhone = workPhone;
    }
    
    return value;
  }
}

@Injectable()
export class ParentQueryValidationPipe implements PipeTransform {
  transform(value: QueryParentDto, metadata: ArgumentMetadata) {
    if (metadata.type !== 'query') {
      return value;
    }

    // Convert string values to appropriate types
    if (value.page) {
      const page = parseInt(value.page.toString(), 10);
      if (isNaN(page) || page < 1) {
        throw new BadRequestException('Page must be a positive number');
      }
      value.page = page;
    }

    if (value.limit) {
      const limit = parseInt(value.limit.toString(), 10);
      if (isNaN(limit) || limit < 1 || limit > PARENT_CONSTANTS.DEFAULTS.MAX_PAGE_SIZE) {
        throw new BadRequestException(`Limit must be between 1 and ${PARENT_CONSTANTS.DEFAULTS.MAX_PAGE_SIZE}`);
      }
      value.limit = limit;
    }

    if (value.isActive !== undefined) {
      if (typeof value.isActive === 'string') {
        value.isActive = (value.isActive as string).toLowerCase() === 'true';
      }
    }

    // Validate education level if provided
    if (value.educationLevel && !Object.values(PARENT_CONSTANTS.EDUCATION_LEVEL).includes(value.educationLevel as any)) {
      throw new BadRequestException('Invalid education level value');
    }

    // Validate sort order
    if (value.sortOrder && !['ASC', 'DESC'].includes(value.sortOrder)) {
      throw new BadRequestException('Sort order must be ASC or DESC');
    }

    return value;
  }
}

@Injectable()
export class ParentBulkValidationPipe implements PipeTransform {
  async transform(value: any[], metadata: ArgumentMetadata) {
    if (!Array.isArray(value)) {
      throw new BadRequestException('Bulk data must be an array');
    }

    if (value.length === 0) {
      throw new BadRequestException('Bulk data cannot be empty');
    }

    if (value.length > 100) {
      throw new BadRequestException('Bulk operations are limited to 100 items per request');
    }

    const validationPromises = value.map(async (item, index) => {
      try {
        const object = plainToInstance(CreateParentDto, item);
        const errors = await validate(object);
        
        if (errors.length > 0) {
          const errorMessages = errors.map(error => 
            Object.values(error.constraints || {}).join(', ')
          );
          return {
            index,
            errors: errorMessages,
            data: item,
          };
        }
        
        return null;
      } catch (error) {
        return {
          index,
          errors: [error.message],
          data: item,
        };
      }
    });

    const validationResults = await Promise.all(validationPromises);
    const errors = validationResults.filter(result => result !== null);

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Bulk validation failed',
        errors,
      });
    }

    return value;
  }
}

@Injectable()
export class ParentOccupationValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value && value.occupation) {
      const occupation = value.occupation.trim();
      
      if (occupation.length > PARENT_CONSTANTS.VALIDATION.OCCUPATION_MAX_LENGTH) {
        throw new BadRequestException(`Occupation must not exceed ${PARENT_CONSTANTS.VALIDATION.OCCUPATION_MAX_LENGTH} characters`);
      }
      
      value.occupation = occupation;
    }

    if (value && value.workplace) {
      const workplace = value.workplace.trim();
      
      if (workplace.length > PARENT_CONSTANTS.VALIDATION.WORKPLACE_MAX_LENGTH) {
        throw new BadRequestException(`Workplace must not exceed ${PARENT_CONSTANTS.VALIDATION.WORKPLACE_MAX_LENGTH} characters`);
      }
      
      value.workplace = workplace;
    }
    
    return value;
  }
}

@Injectable()
export class ParentEducationValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value && value.educationLevel) {
      const educationLevel = value.educationLevel.toLowerCase();
      
      if (!Object.values(PARENT_CONSTANTS.EDUCATION_LEVEL).includes(educationLevel as any)) {
        throw new BadRequestException(
          `Invalid education level. Allowed values: ${Object.values(PARENT_CONSTANTS.EDUCATION_LEVEL).join(', ')}`
        );
      }
      
      value.educationLevel = educationLevel;
    }
    
    return value;
  }
}

@Injectable()
export class ParentGenderValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value && value.user && value.user.gender) {
      const gender = value.user.gender.toLowerCase();
      
      if (!Object.values(PARENT_CONSTANTS.GENDER).includes(gender as any)) {
        throw new BadRequestException(
          `Invalid gender. Allowed values: ${Object.values(PARENT_CONSTANTS.GENDER).join(', ')}`
        );
      }
      
      value.user.gender = gender;
    }
    
    return value;
  }
}
