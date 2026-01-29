import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { INVALID_TIME_RANGE } from '../constants/institute-lecture.constants';
import { CreateInstitueLectureDto } from '../dto/create-institue_lecture.dto';
import { RescheduleLectureDto } from '../dto/reschedule-lecture.dto';
import { getCurrentSriLankaTime } from '../../../../common/utils/timezone.util';

@Injectable()
export class LectureTimePipe implements PipeTransform {
  transform(value: CreateInstitueLectureDto | RescheduleLectureDto, metadata: ArgumentMetadata) {
    if (!value.startTime || !value.endTime) {
      return value;
    }

    // Convert to Date objects if they are strings
    const startTime = new Date(value.startTime);
    const endTime = new Date(value.endTime);

    // Validate that dates are valid
    if (isNaN(startTime.getTime())) {
      throw new BadRequestException('Invalid start time format. Please provide a valid ISO 8601 date string.');
    }

    if (isNaN(endTime.getTime())) {
      throw new BadRequestException('Invalid end time format. Please provide a valid ISO 8601 date string.');
    }

    // Check if end time is after start time
    if (endTime <= startTime) {
      throw new BadRequestException(INVALID_TIME_RANGE || 'End time must be after start time');
    }

    // Prevent lectures longer than 24 hours
    const durationInHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    if (durationInHours > 24) {
      throw new BadRequestException('Lecture duration cannot exceed 24 hours');
    }

    // Prevent lectures shorter than 5 minutes
    const durationInMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
    if (durationInMinutes < 5) {
      throw new BadRequestException('Lecture duration must be at least 5 minutes');
    }

    // Prevent scheduling lectures in the past (only for create, not update)
    if (value instanceof CreateInstitueLectureDto) {
      const now = getCurrentSriLankaTime();
      if (startTime < now) {
        throw new BadRequestException('Cannot schedule lectures in the past');
      }
    }

    // Update the values with the Date objects
    value.startTime = startTime;
    value.endTime = endTime;

    return value;
  }
}
