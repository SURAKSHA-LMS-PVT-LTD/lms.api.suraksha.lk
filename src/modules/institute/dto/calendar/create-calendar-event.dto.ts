import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CalendarEventType,
  CalendarEventStatus,
  CalendarEventScope,
  AttendanceOpenTo,
} from '../../enums/calendar-day-type.enum';

export class CreateCalendarEventDto {
  @ApiProperty({ description: 'Calendar day ID this event belongs to' })
  @IsOptional()
  @IsString()
  calendarDayId?: string;

  @ApiPropertyOptional({ description: 'Calendar date in YYYY-MM-DD format (used to look up calendarDayId if not provided)' })
  @IsOptional()
  @IsDateString()
  calendarDate?: string;

  @ApiProperty({ enum: CalendarEventType, description: 'Type of event' })
  @IsEnum(CalendarEventType)
  eventType: CalendarEventType;

  @ApiProperty({ description: 'Event title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Event description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Event date in YYYY-MM-DD format' })
  @IsDateString()
  eventDate: string;

  @ApiPropertyOptional({ description: 'Start time in HH:MM format' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ description: 'End time in HH:MM format' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Is this an all-day event?' })
  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @ApiPropertyOptional({ description: 'Should attendance be tracked for this event?' })
  @IsOptional()
  @IsBoolean()
  isAttendanceTracked?: boolean;

  @ApiPropertyOptional({ description: 'Is this the default event for the day?' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    description: 'Target user types (for reporting)',
    type: [String],
    example: ['STUDENT', 'TEACHER'],
  })
  @IsOptional()
  targetUserTypes?: string[];

  @ApiPropertyOptional({ enum: AttendanceOpenTo })
  @IsOptional()
  @IsEnum(AttendanceOpenTo)
  attendanceOpenTo?: AttendanceOpenTo;

  @ApiPropertyOptional({ enum: CalendarEventScope })
  @IsOptional()
  @IsEnum(CalendarEventScope)
  targetScope?: CalendarEventScope;

  @ApiPropertyOptional({ description: 'Target class IDs', type: [String] })
  @IsOptional()
  targetClassIds?: string[];

  @ApiPropertyOptional({ description: 'Target subject IDs', type: [String] })
  @IsOptional()
  targetSubjectIds?: string[];

  @ApiPropertyOptional({ description: 'Event venue' })
  @IsOptional()
  @IsString()
  venue?: string;

  @ApiPropertyOptional({ description: 'Meeting link for virtual events' })
  @IsOptional()
  @IsString()
  meetingLink?: string;

  @ApiPropertyOptional({ enum: CalendarEventStatus })
  @IsOptional()
  @IsEnum(CalendarEventStatus)
  status?: CalendarEventStatus;

  @ApiPropertyOptional({ description: 'Maximum participants' })
  @IsOptional()
  maxParticipants?: number;

  @ApiPropertyOptional({ description: 'Is attendance mandatory?' })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
