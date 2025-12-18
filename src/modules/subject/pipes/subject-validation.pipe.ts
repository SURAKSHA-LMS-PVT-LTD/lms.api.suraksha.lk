import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { SUBJECT_CONSTANTS } from '../constants/subject.constants';

@Injectable()
export class SubjectValidationPipe implements PipeTransform {
  async transform<T>(value: T, { metatype }: ArgumentMetadata) {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToClass(metatype, value);
    const errors = await validate(object);

    if (errors.length > 0) {
      const errorMessages = errors.map(error => {
        return Object.values(error.constraints || {}).join(', ');
      });
      throw new BadRequestException(`Validation failed: ${errorMessages.join('; ')}`);
    }

    return object;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }
}

@Injectable()
export class SubjectCodeValidationPipe implements PipeTransform {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!value) {
      throw new BadRequestException('Subject code is required');
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('Subject code must be a string');
    }

    const trimmedValue = value.trim().toUpperCase();

    if (trimmedValue.length < SUBJECT_CONSTANTS.CODE.MIN_LENGTH || 
        trimmedValue.length > SUBJECT_CONSTANTS.CODE.MAX_LENGTH) {
      throw new BadRequestException(
        `Subject code must be between ${SUBJECT_CONSTANTS.CODE.MIN_LENGTH} and ${SUBJECT_CONSTANTS.CODE.MAX_LENGTH} characters`
      );
    }

    // Validate format (alphanumeric with optional hyphens/underscores)
    const codePattern = /^[A-Z0-9_-]+$/;
    if (!codePattern.test(trimmedValue)) {
      throw new BadRequestException('Subject code can only contain letters, numbers, hyphens, and underscores');
    }

    return trimmedValue;
  }
}
