import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { InstituteCalendarDayEntity } from '../entities/institute-calendar-day.entity';
import { InstituteOperatingConfigEntity } from '../entities/institute-operating-config.entity';
import { InstituteCalendarEventEntity } from '../entities/institute-calendar-event.entity';
import { GenerateCalendarDto } from '../dto/calendar/generate-calendar.dto';
import { CreateOperatingConfigDto } from '../dto/calendar/create-operating-config.dto';
import { getCurrentSriLankaDate, getCurrentSriLankaTime } from '../../../common/utils/timezone.util';
import {
  CalendarDayType,
  CalendarDaySource,
  CalendarEventType,
} from '../enums/calendar-day-type.enum';

@Injectable()
export class InstituteCalendarService {
  private readonly logger = new Logger(InstituteCalendarService.name);

  constructor(
    @InjectRepository(InstituteCalendarDayEntity)
    private readonly calendarDayRepo: Repository<InstituteCalendarDayEntity>,
    @InjectRepository(InstituteOperatingConfigEntity)
    private readonly operatingConfigRepo: Repository<InstituteOperatingConfigEntity>,
    @InjectRepository(InstituteCalendarEventEntity)
    private readonly calendarEventRepo: Repository<InstituteCalendarEventEntity>,
  ) {}

  /**
   * Set operating config for institute (weekly template)
   */
  async setOperatingConfig(
    instituteId: string,
    configs: CreateOperatingConfigDto[],
  ): Promise<InstituteOperatingConfigEntity[]> {
    const academicYear = configs[0]?.academicYear;
    
    // Delete existing config for this year
    await this.operatingConfigRepo.delete({ instituteId, academicYear });

    // Create new configs
    const entities = configs.map((config) =>
      this.operatingConfigRepo.create({
        instituteId,
        ...config,
      }),
    );

    return this.operatingConfigRepo.save(entities);
  }

  /**
   * Get operating config for institute
   */
  async getOperatingConfig(
    instituteId: string,
    academicYear: string,
  ): Promise<InstituteOperatingConfigEntity[]> {
    return this.operatingConfigRepo.find({
      where: { instituteId, academicYear },
      order: { dayOfWeek: 'ASC' },
    });
  }

  /**
   * Generate full year calendar based on operating config
   * 
   * TIMEZONE: All dates use Sri Lankan timezone (Asia/Colombo, UTC+5:30)
   * - TypeORM connection configured with timezone: '+05:30'
   * - Calendar dates represent Sri Lankan local dates
   * - Cache expiry calculated using Sri Lankan midnight
   */
  async generateCalendar(
    instituteId: string,
    dto: GenerateCalendarDto,
  ): Promise<{ daysCreated: number; eventsCreated: number }> {
    this.logger.log(
      `Generating calendar for institute ${instituteId}, year ${dto.academicYear}`,
    );

    // Get operating config
    const operatingConfig = await this.getOperatingConfig(
      instituteId,
      dto.academicYear,
    );

    if (operatingConfig.length === 0) {
      throw new NotFoundException(
        'Operating config not found. Please set up weekly schedule first.',
      );
    }

    // Build lookup map: dayOfWeek -> config
    const configMap = new Map(
      operatingConfig.map((c) => [c.dayOfWeek, c]),
    );

    // Parse date range
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    // Build holiday lookup
    const holidayMap = new Map(
      (dto.publicHolidays || []).map((h) => [h.date, h.title]),
    );

    // Build term break lookup
    const termBreaks = dto.termBreaks || [];

    const daysToCreate: Partial<InstituteCalendarDayEntity>[] = [];
    const eventsToCreate: Partial<InstituteCalendarEventEntity>[] = [];

    // Iterate through each date
    for (
      let date = new Date(startDate);
      date <= endDate;
      date.setDate(date.getDate() + 1)
    ) {
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay(); // ISO: Mon=1, Sun=7

      const config = configMap.get(dayOfWeek);

      let dayType: CalendarDayType;
      let title: string | null = null;
      let isAttendanceExpected = true;

      // Determine day type
      if (holidayMap.has(dateStr)) {
        dayType = CalendarDayType.PUBLIC_HOLIDAY;
        title = holidayMap.get(dateStr);
        isAttendanceExpected = false;
      } else if (this.isInTermBreak(dateStr, termBreaks)) {
        dayType = CalendarDayType.INSTITUTE_HOLIDAY;
        title = this.getTermBreakTitle(dateStr, termBreaks);
        isAttendanceExpected = false;
      } else if (!config || !config.isOperating) {
        dayType = CalendarDayType.WEEKEND;
        title = this.getDayName(dayOfWeek);
        isAttendanceExpected = false;
      } else {
        dayType = CalendarDayType.REGULAR;
        title = null;
        isAttendanceExpected = true;
      }

      // Create calendar day
      const calendarDay: Partial<InstituteCalendarDayEntity> = {
        instituteId,
        calendarDate: new Date(dateStr),
        academicYear: dto.academicYear,
        dayType,
        title,
        isAttendanceExpected,
        source: CalendarDaySource.AUTO_GENERATED,
        startTime: config?.startTime || null,
        endTime: config?.endTime || null,
      };

      daysToCreate.push(calendarDay);

      // Auto-create REGULAR_CLASS event for regular days
      if (dayType === CalendarDayType.REGULAR) {
        eventsToCreate.push({
          instituteId,
          eventType: CalendarEventType.REGULAR_CLASS,
          title: 'Regular Classes',
          description: 'Normal class schedule',
          eventDate: new Date(dateStr),
          startTime: config?.startTime || null,
          endTime: config?.endTime || null,
          isAllDay: true,
          isAttendanceTracked: true,
          isDefault: true, // This is the default event for the day
          targetUserTypes: null, // All users
        });
      }
    }

    // Bulk insert (handle upsert via ON DUPLICATE KEY UPDATE in production)
    const savedDays = await this.calendarDayRepo.save(daysToCreate);

    // Link events to calendar days
    const dayIdMap = new Map(
      savedDays.map((d) => [
        d.calendarDate.toISOString().split('T')[0],
        d.id,
      ]),
    );

    eventsToCreate.forEach((event) => {
      const dateStr = (event.eventDate as Date).toISOString().split('T')[0];
      event.calendarDayId = dayIdMap.get(dateStr) || null;
    });

    const savedEvents = await this.calendarEventRepo.save(eventsToCreate);

    this.logger.log(
      `Calendar generated: ${savedDays.length} days, ${savedEvents.length} events`,
    );

    return {
      daysCreated: savedDays.length,
      eventsCreated: savedEvents.length,
    };
  }

  /**
   * Get calendar day for a specific date (with lazy creation)
   * 
   * TIMEZONE: Accepts date string (YYYY-MM-DD) or Date object
   * - Prefer passing date strings to avoid timezone conversion issues
   * - When a Date object is passed, it's converted via toISOString which gives UTC date
   * - For Sri Lanka correctness, always pass the Sri Lanka date string
   */
  async getOrCreateCalendarDay(
    instituteId: string,
    date: Date | string,
  ): Promise<InstituteCalendarDayEntity> {
    // ✅ FIXED: Accept string dates to avoid UTC vs Sri Lanka timezone issues
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

    let calendarDay = await this.calendarDayRepo.findOne({
      where: { instituteId, calendarDate: new Date(dateStr) },
    });

    if (!calendarDay) {
      // Lazy create: assume regular working day
      this.logger.log(
        `Lazy creating calendar day for ${dateStr} at institute ${instituteId}`,
      );

      calendarDay = await this.calendarDayRepo.save({
        instituteId,
        calendarDate: new Date(dateStr),
        academicYear: new Date(dateStr).getFullYear().toString(),
        dayType: CalendarDayType.REGULAR,
        isAttendanceExpected: true,
        source: CalendarDaySource.AUTO_GENERATED,
      });

      // Also create default REGULAR_CLASS event
      await this.calendarEventRepo.save({
        instituteId,
        calendarDayId: calendarDay.id,
        eventType: CalendarEventType.REGULAR_CLASS,
        title: 'Regular Classes',
        eventDate: new Date(dateStr),
        isAllDay: true,
        isAttendanceTracked: true,
        isDefault: true,
      });
    }

    return calendarDay;
  }

  /**
   * Get calendar days in date range
   */
  async getCalendarDays(
    instituteId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<InstituteCalendarDayEntity[]> {
    return this.calendarDayRepo.find({
      where: {
        instituteId,
        calendarDate: Between(startDate, endDate),
      },
      order: { calendarDate: 'ASC' },
    });
  }

  /**
   * Get events for a specific calendar day
   */
  async getEventsForDay(
    calendarDayId: string,
  ): Promise<InstituteCalendarEventEntity[]> {
    return this.calendarEventRepo.find({
      where: { calendarDayId },
      order: { isDefault: 'DESC', startTime: 'ASC' },
    });
  }

  /**
   * Get default event for a calendar day
   */
  async getDefaultEventForDay(
    calendarDayId: string,
  ): Promise<InstituteCalendarEventEntity | null> {
    return this.calendarEventRepo.findOne({
      where: { calendarDayId, isDefault: true },
    });
  }

  /**
   * Create a calendar event
   */
  async createCalendarEvent(
    instituteId: string,
    dto: any,
  ): Promise<InstituteCalendarEventEntity> {
    // If calendarDate is provided, look up calendar_day_id
    let calendarDayId = dto.calendarDayId;
    
    if (!calendarDayId && dto.calendarDate) {
      const calendarDay = await this.calendarDayRepo.findOne({
        where: { instituteId, calendarDate: dto.calendarDate },
      });
      if (!calendarDay) {
        throw new NotFoundException(
          `Calendar day not found for ${dto.calendarDate}. Please generate calendar first.`,
        );
      }
      calendarDayId = calendarDay.id;
    }

    if (!calendarDayId) {
      throw new Error('Either calendarDayId or calendarDate must be provided');
    }

    // If isDefault is true, unset any existing default events for this calendar day
    if (dto.isDefault) {
      await this.calendarEventRepo.update(
        { calendarDayId, isDefault: true },
        { isDefault: false },
      );
    }

    const event = this.calendarEventRepo.create({
      instituteId,
      calendarDayId,
      eventType: dto.eventType,
      title: dto.title || dto.eventName,
      description: dto.description || dto.eventDescription,
      eventDate: new Date(dto.eventDate || dto.calendarDate),
      startTime: dto.startTime,
      endTime: dto.endTime,
      isAttendanceTracked: dto.isAttendanceTracked ?? true,
      isDefault: dto.isDefault ?? false,
      status: dto.status,
      targetScope: dto.targetScope || dto.eventScope,
      targetUserTypes: dto.targetUserTypes,
      attendanceOpenTo: dto.attendanceOpenTo,
      targetClassIds: dto.targetClassIds,
      targetSubjectIds: dto.targetSubjectIds,
      venue: dto.venue || dto.location,
      notes: dto.notes || dto.remarks,
      createdBy: dto.createdBy,
    });

    return this.calendarEventRepo.save(event);
  }

  // Helper methods
  private isInTermBreak(
    dateStr: string,
    termBreaks: { startDate: string; endDate: string; title: string }[],
  ): boolean {
    return termBreaks.some(
      (tb) => dateStr >= tb.startDate && dateStr <= tb.endDate,
    );
  }

  private getTermBreakTitle(
    dateStr: string,
    termBreaks: { startDate: string; endDate: string; title: string }[],
  ): string {
    const termBreak = termBreaks.find(
      (tb) => dateStr >= tb.startDate && dateStr <= tb.endDate,
    );
    return termBreak?.title || 'Term Break';
  }

  private getDayName(dayOfWeek: number): string {
    const days = [
      '',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ];
    return days[dayOfWeek];
  }
}
