import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { CreateInstitueLectureDto } from '../dto/create-institue_lecture.dto';
import { RescheduleLectureDto } from '../dto/reschedule-lecture.dto';

/** Format a Date as a readable UTC string for error messages, e.g. "Mar 10, 2026 at 06:25 AM UTC" */
function fmt(d: Date): string {
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }) + ' UTC';
}

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
      throw new BadRequestException({
        message: 'Invalid start time',
        actionHint: 'The start time could not be understood. Please send a valid ISO 8601 date string, e.g. "2026-03-15T09:00:00.000Z".',
        field: 'startTime',
      });
    }

    if (isNaN(endTime.getTime())) {
      throw new BadRequestException({
        message: 'Invalid end time',
        actionHint: 'The end time could not be understood. Please send a valid ISO 8601 date string, e.g. "2026-03-15T11:00:00.000Z".',
        field: 'endTime',
      });
    }

    // Check if end time is after start time
    if (endTime <= startTime) {
      throw new BadRequestException({
        message: 'End time must be after start time',
        actionHint: `Your end time (${fmt(endTime)}) is not after your start time (${fmt(startTime)}). Please set the end time to a later point than when the lecture begins.`,
        field: 'endTime',
      });
    }

    // Prevent lectures longer than 24 hours
    const durationInHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    if (durationInHours > 24) {
      throw new BadRequestException({
        message: 'Lecture duration is too long',
        actionHint: `Your lecture is currently set to run for ${durationInHours.toFixed(1)} hours, which exceeds the 24-hour maximum. Please shorten the end time.`,
        durationHours: parseFloat(durationInHours.toFixed(2)),
        maxDurationHours: 24,
      });
    }

    // Prevent lectures shorter than 5 minutes
    const durationInMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
    if (durationInMinutes < 5) {
      throw new BadRequestException({
        message: 'Lecture duration is too short',
        actionHint: `Your lecture is only ${Math.round(durationInMinutes)} minute(s) long. Please set the end time so the lecture lasts at least 5 minutes.`,
        durationMinutes: parseFloat(durationInMinutes.toFixed(2)),
        minDurationMinutes: 5,
      });
    }

    // Prevent scheduling lectures in the past (only for create, not reschedule)
    if (value instanceof CreateInstitueLectureDto) {
      const now = new Date();
      if (startTime < now) {
        throw new BadRequestException({
          message: 'Start time is in the past',
          actionHint: `The start time you selected (${fmt(startTime)}) has already passed — the current server time is ${fmt(now)}. Please choose a future date and time. If the date looks correct on your device, check that your device clock is accurate.`,
          submittedStartTime: startTime.toISOString(),
          serverTime: now.toISOString(),
          field: 'startTime',
        });
      }
    }

    // Update the values with the Date objects
    value.startTime = startTime;
    value.endTime = endTime;

    return value;
  }
}
