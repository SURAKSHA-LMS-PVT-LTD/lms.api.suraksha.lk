import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateInstituteClassSubjectLectureDto } from '../dto/create-institute_class_subject_lecture.dto';
import { UpdateInstituteClassSubjectLectureDto } from '../dto/update-institute-class-subject-lecture.dto';

@Injectable()
export class LectureValidationPipe implements PipeTransform {
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
    if (object instanceof CreateInstituteClassSubjectLectureDto || 
        object instanceof UpdateInstituteClassSubjectLectureDto) {
      this.validateLectureData(object);
    }

    return value;
  }

  private toValidate(metatype: Function): boolean {
    const types: Function[] = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype);
  }

  private validateLectureData(dto: CreateInstituteClassSubjectLectureDto | UpdateInstituteClassSubjectLectureDto) {
    // Validate lecture timing
    if (dto.startTime && dto.endTime) {
      const startTime = new Date(dto.startTime);
      const endTime = new Date(dto.endTime);

      if (startTime >= endTime) {
        throw new BadRequestException('Start time must be before end time');
      }

      // Check minimum duration (30 minutes)
      const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
      if (durationMinutes < 30) {
        throw new BadRequestException('Lecture duration must be at least 30 minutes');
      }

      // Check maximum duration (8 hours)
      if (durationMinutes > 480) {
        throw new BadRequestException('Lecture duration cannot exceed 8 hours');
      }

      // Check if lecture is not in the past (for creation)
      if (dto instanceof CreateInstituteClassSubjectLectureDto) {
        const now = new Date();
        if (startTime < now) {
          throw new BadRequestException('Cannot schedule lectures in the past');
        }
      }
    }

    // Validate online lecture requirements
    if ((dto as CreateInstituteClassSubjectLectureDto).lectureType === 'online') {
      if (!dto.meetingLink && !dto.meetingId) {
        throw new BadRequestException('Online lectures must have either meeting link or meeting ID');
      }
    }

    // Validate physical lecture requirements
    if ((dto as CreateInstituteClassSubjectLectureDto).lectureType === 'physical' && !dto.venue) {
      throw new BadRequestException('Physical lectures must have a venue');
    }

    // Validate participant limits
    if (dto.maxParticipants !== undefined && dto.maxParticipants < 1) {
      throw new BadRequestException('Maximum participants must be at least 1');
    }

    // Validate URL formats if provided
    if (dto.meetingLink && !this.isValidUrl(dto.meetingLink)) {
      throw new BadRequestException('Invalid meeting link format');
    }

    if (dto.recordingUrl && !this.isValidUrl(dto.recordingUrl)) {
      throw new BadRequestException('Invalid recording URL format');
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
