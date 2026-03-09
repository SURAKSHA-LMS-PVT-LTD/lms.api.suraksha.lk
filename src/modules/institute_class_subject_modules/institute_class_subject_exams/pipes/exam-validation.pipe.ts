import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { EXAM_CONSTANTS } from '../constants/exam.constants';


@Injectable()
export class ExamValidationPipe implements PipeTransform {
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
      throw new BadRequestException({
        message: 'Validation failed',
        errors: errorMessages,
      });
    }

    // Additional business logic validations
    this.validateExamData(object);

    return value;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private validateExamData(dto: any) {
    // Validate exam timing
    if (dto.startTime && dto.endTime) {
      const startTime = new Date(dto.startTime);
      const endTime = new Date(dto.endTime);

      if (startTime >= endTime) {
        throw new BadRequestException('Start time must be before end time');
      }

      // Check if exam is not scheduled too far in the past
      const now = new Date();
      const timeDiff = startTime.getTime() - now.getTime();
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

      if (daysDiff < -1) { // Allow 1 day grace period for past exams
        throw new BadRequestException('Cannot schedule exams more than 1 day in the past');
      }

      // Check advance booking limit
      if (daysDiff > EXAM_CONSTANTS.TIME_CONSTRAINTS.ADVANCE_BOOKING_LIMIT) {
        throw new BadRequestException(
          `Cannot schedule exams more than ${EXAM_CONSTANTS.TIME_CONSTRAINTS.ADVANCE_BOOKING_LIMIT} days in advance`
        );
      }
    }

    // Validate duration
    if (dto.durationMinutes !== undefined) {
      if (dto.durationMinutes < EXAM_CONSTANTS.VALIDATION.MIN_DURATION) {
        throw new BadRequestException(
          `Exam duration must be at least ${EXAM_CONSTANTS.VALIDATION.MIN_DURATION} minutes`
        );
      }

      if (dto.durationMinutes > EXAM_CONSTANTS.VALIDATION.MAX_DURATION) {
        throw new BadRequestException(
          `Exam duration cannot exceed ${EXAM_CONSTANTS.VALIDATION.MAX_DURATION} minutes`
        );
      }
    }

    // Validate marks
    if (dto.totalMarks !== undefined) {
      if (dto.totalMarks < EXAM_CONSTANTS.VALIDATION.MIN_MARKS) {
        throw new BadRequestException(
          `Total marks must be at least ${EXAM_CONSTANTS.VALIDATION.MIN_MARKS}`
        );
      }

      if (dto.totalMarks > EXAM_CONSTANTS.VALIDATION.MAX_MARKS) {
        throw new BadRequestException(
          `Total marks cannot exceed ${EXAM_CONSTANTS.VALIDATION.MAX_MARKS}`
        );
      }
    }

    if (dto.passingMarks !== undefined && dto.totalMarks !== undefined) {
      if (dto.passingMarks > dto.totalMarks) {
        throw new BadRequestException('Passing marks cannot exceed total marks');
      }

      const passingPercentage = (dto.passingMarks / dto.totalMarks) * 100;
      if (passingPercentage < EXAM_CONSTANTS.VALIDATION.MIN_PASSING_PERCENTAGE ||
          passingPercentage > EXAM_CONSTANTS.VALIDATION.MAX_PASSING_PERCENTAGE) {
        throw new BadRequestException(
          `Passing percentage must be between ${EXAM_CONSTANTS.VALIDATION.MIN_PASSING_PERCENTAGE}% and ${EXAM_CONSTANTS.VALIDATION.MAX_PASSING_PERCENTAGE}%`
        );
      }
    }

    // Validate max attempts
    if (dto.maxAttempts !== undefined) {
      if (dto.maxAttempts < 1 || dto.maxAttempts > EXAM_CONSTANTS.VALIDATION.MAX_ATTEMPTS) {
        throw new BadRequestException(
          `Max attempts must be between 1 and ${EXAM_CONSTANTS.VALIDATION.MAX_ATTEMPTS}`
        );
      }
    }

    // Validate online exam requirements
    if (dto.examType === 'online') {
      if (!dto.examLink && !dto.venue) {
        throw new BadRequestException('Online exams must have either exam link or venue information');
      }
    }

    // Validate physical exam requirements
    if (dto.examType === 'physical' && !dto.venue) {
      throw new BadRequestException('Physical exams must have a venue');
    }

    // Validate URL formats if provided
    if (dto.examLink && !this.isValidUrl(dto.examLink)) {
      throw new BadRequestException('Invalid exam link format');
    }

    // Validate exam title
    if (dto.title && dto.title.trim().length < 3) {
      throw new BadRequestException('Exam title must be at least 3 characters long');
    }

    // Validate duration consistency with start/end time
    if (dto.startTime && dto.endTime && dto.durationMinutes) {
      const startTime = new Date(dto.startTime);
      const endTime = new Date(dto.endTime);
      const actualDuration = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
      
      if (Math.abs(actualDuration - dto.durationMinutes) > 5) { // 5 minute tolerance
        throw new BadRequestException('Duration must match the time difference between start and end time');
      }
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}
