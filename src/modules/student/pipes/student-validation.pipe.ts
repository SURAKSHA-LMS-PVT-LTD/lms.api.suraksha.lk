import { Injectable, PipeTransform, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateStudentDto } from '../dto/create-student.dto';
import { UpdateStudentDto } from '../dto/update-student.dto';
import { QueryStudentDto } from '../dto/query-student.dto';
import { STUDENT_CONSTANTS } from '../constants/student.constants';

@Injectable()
export class StudentValidationPipe implements PipeTransform {
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
export class StudentEmailValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value && value.user && value.user.email) {
      const email = value.user.email.toLowerCase().trim();
      
      if (!STUDENT_CONSTANTS.PATTERNS.EMAIL.test(email)) {
        throw new BadRequestException('Invalid email format');
      }
      
      value.user.email = email;
    }
    
    return value;
  }
}

@Injectable()
export class StudentPhoneValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value && value.user && value.user.phone) {
      const phone = value.user.phone.replace(/\s+/g, '');
      
      if (!STUDENT_CONSTANTS.PATTERNS.PHONE.test(phone)) {
        throw new BadRequestException('Invalid phone number format');
      }
      
      value.user.phone = phone;
    }
    
    return value;
  }
}

@Injectable()
export class StudentAdmissionNumberValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value && value.admissionNumber) {
      const admissionNumber = value.admissionNumber.toUpperCase().trim();
      
      if (!STUDENT_CONSTANTS.PATTERNS.ADMISSION_NUMBER.test(admissionNumber)) {
        throw new BadRequestException('Invalid admission number format. Use alphanumeric characters only (3-20 length)');
      }
      
      value.admissionNumber = admissionNumber;
    }
    
    return value;
  }
}

@Injectable()
export class StudentQueryValidationPipe implements PipeTransform {
  transform(value: QueryStudentDto, metadata: ArgumentMetadata) {
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
      if (isNaN(limit) || limit < 1 || limit > STUDENT_CONSTANTS.DEFAULTS.MAX_PAGE_SIZE) {
        throw new BadRequestException(`Limit must be between 1 and ${STUDENT_CONSTANTS.DEFAULTS.MAX_PAGE_SIZE}`);
      }
      value.limit = limit;
    }

    if (value.isActive !== undefined) {
      if (typeof value.isActive === 'string') {
        value.isActive = (value.isActive as string).toLowerCase() === 'true';
      }
    }

    // Validate blood group if provided
    if (value.bloodGroup && !STUDENT_CONSTANTS.BLOOD_GROUPS.includes(value.bloodGroup as any)) {
      throw new BadRequestException('Invalid blood group value');
    }

    // Validate sort order
    if (value.sortOrder && !['ASC', 'DESC'].includes(value.sortOrder)) {
      throw new BadRequestException('Sort order must be ASC or DESC');
    }

    return value;
  }
}

@Injectable()
export class StudentBulkValidationPipe implements PipeTransform {
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
        const object = plainToInstance(CreateStudentDto, item);
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
export class StudentParentValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value && (value.fatherId || value.motherId || value.guardianId)) {
      // Ensure at least one parent ID is provided when creating a student
      const hasParent = value.fatherId || value.motherId || value.guardianId;
      
      if (!hasParent) {
        throw new BadRequestException('At least one parent (father, mother, or guardian) must be specified');
      }

      // Validate parent IDs format (should be valid numbers/strings)
      const parentIds = [value.fatherId, value.motherId, value.guardianId].filter(Boolean);
      
      for (const parentId of parentIds) {
        if (typeof parentId !== 'string' && typeof parentId !== 'number') {
          throw new BadRequestException('Parent ID must be a valid string or number');
        }
      }
    }
    
    return value;
  }
}

@Injectable()
export class StudentBloodGroupValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value && value.bloodGroup) {
      const bloodGroup = value.bloodGroup.toUpperCase().trim();
      
      if (!STUDENT_CONSTANTS.BLOOD_GROUPS.includes(bloodGroup)) {
        throw new BadRequestException(
          `Invalid blood group. Allowed values: ${STUDENT_CONSTANTS.BLOOD_GROUPS.join(', ')}`
        );
      }
      
      value.bloodGroup = bloodGroup;
    }
    
    return value;
  }
}
