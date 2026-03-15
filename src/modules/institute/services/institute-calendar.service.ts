import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { InstituteCalendarDayEntity } from '../entities/institute-calendar-day.entity';
import { InstituteOperatingConfigEntity } from '../entities/institute-operating-config.entity';
import { InstituteCalendarEventEntity } from '../entities/institute-calendar-event.entity';
import { InstituteClassCalendarEntity } from '../entities/institute-class-calendar.entity';
import { GenerateCalendarDto } from '../dto/calendar/generate-calendar.dto';
import { CreateOperatingConfigDto } from '../dto/calendar/create-operating-config.dto';
import { getCurrentSriLankaDate, getCurrentSriLankaTime } from '../../../common/utils/timezone.util';
import {
  CalendarDayType,
  CalendarDaySource,
  CalendarEventType,
  CalendarEventScope,
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
    @InjectRepository(InstituteClassCalendarEntity)
    private readonly classCalendarRepo: Repository<InstituteClassCalendarEntity>,
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

    // ✅ FIXED DATA-001: Check for existing calendar to prevent duplicate conflicts
    const existingDays = await this.calendarDayRepo.count({
      where: { instituteId, academicYear: dto.academicYear },
    });
    if (existingDays > 0) {
      throw new ConflictException(
        `Calendar already exists for academic year ${dto.academicYear} with ${existingDays} days. ` +
        `Delete the existing calendar first or use a different academic year.`,
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
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
        calendarDate: dateStr as any, // Use string to avoid timezone conversion on DATE column
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
          eventDate: dateStr as any, // Use string to avoid timezone conversion on DATE column
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
    // ✅ FIXED BUG-002: Use manual date formatting instead of toISOString() to avoid UTC date shift
    const dayIdMap = new Map(
      savedDays.map((d) => {
        const cd = d.calendarDate instanceof Date ? d.calendarDate : new Date(d.calendarDate);
        const key = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}-${String(cd.getDate()).padStart(2, '0')}`;
        return [key, d.id];
      }),
    );

    eventsToCreate.forEach((event) => {
      const ed = event.eventDate instanceof Date ? event.eventDate : new Date(event.eventDate);
      const dateStr = `${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')}`;
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

    // ✅ FIX: Use raw SQL for DATE column comparison to avoid timezone mismatch.
    // When mysql2 has timezone:'+05:30', `new Date('2026-03-03')` gets sent as
    // DATETIME '2026-03-03 05:30:00' via binary protocol. MySQL then promotes
    // the DATE column to '2026-03-03 00:00:00' for comparison → NOT EQUAL.
    // Using a raw query with string parameter avoids this issue entirely.
    let calendarDay = await this.calendarDayRepo
      .createQueryBuilder('d')
      .where('d.institute_id = :instituteId AND d.calendar_date = :dateStr', {
        instituteId,
        dateStr,
      })
      .getOne();

    if (!calendarDay) {
      // Lazy create: assume regular working day
      this.logger.log(
        `Lazy creating calendar day for ${dateStr} at institute ${instituteId}`,
      );

      try {
        calendarDay = await this.calendarDayRepo.save({
          instituteId,
          calendarDate: dateStr as any, // Send as string to avoid timezone conversion
          academicYear: dateStr.substring(0, 4),
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
          eventDate: dateStr as any, // Send as string to avoid timezone conversion
          isAllDay: true,
          isAttendanceTracked: true,
          isDefault: true,
        });
      } catch (error) {
        // ✅ FIX RACE CONDITION: If a concurrent request already created this calendar day,
        // we get a duplicate key error. Re-fetch the existing record instead of throwing.
        if (error.message?.includes('Duplicate entry') || error.code === 'ER_DUP_ENTRY' || error.errno === 1062) {
          this.logger.warn(
            `Race condition: calendar day for ${dateStr} at institute ${instituteId} was created by concurrent request. Re-fetching...`,
          );
          calendarDay = await this.calendarDayRepo
            .createQueryBuilder('d')
            .where('d.institute_id = :instituteId AND d.calendar_date = :dateStr', {
              instituteId,
              dateStr,
            })
            .getOne();
          if (!calendarDay) {
            throw new Error(
              `Failed to find calendar day for ${dateStr} at institute ${instituteId} after duplicate key error`,
            );
          }
        } else {
          throw error;
        }
      }
    }

    return calendarDay;
  }

  /**
   * Get calendar days in date range
   * ✅ FIXED BUG-004: Now accepts optional filters for academicYear, dayType, isAttendanceExpected
   * ✅ FIXED PERF-004: Added pagination with skip/take
   */
  async getCalendarDayByIdForInstitute(
    instituteId: string,
    calendarDayId: string,
  ): Promise<InstituteCalendarDayEntity | null> {
    return this.calendarDayRepo.findOne({
      where: { id: calendarDayId as any, instituteId },
    });
  }

  async getCalendarDays(
    instituteId: string,
    startDate?: Date,
    endDate?: Date,
    filters?: {
      academicYear?: string;
      dayType?: string;
      isAttendanceExpected?: boolean;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: InstituteCalendarDayEntity[]; total: number }> {
    const where: any = { instituteId };

    if (startDate && endDate) {
      where.calendarDate = Between(startDate, endDate);
    }
    if (filters?.academicYear) {
      where.academicYear = filters.academicYear;
    }
    if (filters?.dayType) {
      where.dayType = filters.dayType;
    }
    if (filters?.isAttendanceExpected !== undefined) {
      where.isAttendanceExpected = filters.isAttendanceExpected;
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 400; // Default to 400 (slightly > 365 days)
    const skip = (page - 1) * limit;

    const [data, total] = await this.calendarDayRepo.findAndCount({
      where,
      order: { calendarDate: 'ASC' },
      skip,
      take: limit,
    });

    return { data, total };
  }

  /**
   * Get all calendar days with their events for a given month (single JOIN query).
   *
   * This is the backbone of the month-view cache — one DB round-trip returns every
   * calendar day in the month with all events already embedded. All users of the
   * same institute see identical data, so the result can be cached indefinitely
   * until any write operation (create/update/delete event or day) invalidates it.
   */
  async getMonthCalendarWithEvents(
    instituteId: string,
    year: number,
    month: number,
  ): Promise<InstituteCalendarDayEntity[]> {
    const paddedMonth = String(month).padStart(2, '0');
    const startDate = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate(); // month is 1-based; this resolves to last day
    const endDate = `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`;

    return this.calendarDayRepo
      .createQueryBuilder('day')
      .leftJoinAndSelect('day.events', 'event')
      .where('day.instituteId = :instituteId', { instituteId })
      .andWhere('day.calendarDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .orderBy('day.calendarDate', 'ASC')
      .addOrderBy('event.isDefault', 'DESC')
      .addOrderBy('event.startTime', 'ASC')
      .getMany();
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

    // ✅ FIXED ERR-002: Validate event date matches the calendar day
    if (dto.eventDate) {
      const calendarDay = await this.calendarDayRepo.findOne({ where: { id: calendarDayId } });
      if (calendarDay) {
        const cdStr = calendarDay.calendarDate instanceof Date
          ? `${calendarDay.calendarDate.getFullYear()}-${String(calendarDay.calendarDate.getMonth() + 1).padStart(2, '0')}-${String(calendarDay.calendarDate.getDate()).padStart(2, '0')}`
          : String(calendarDay.calendarDate).split('T')[0];
        const eventDateStr = String(dto.eventDate).split('T')[0];
        if (cdStr !== eventDateStr) {
          throw new Error(
            `Event date (${eventDateStr}) doesn't match calendar day date (${cdStr}). ` +
            `The event date should match the calendar day it belongs to.`,
          );
        }
      }
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

  /**
   * ✅ FEAT-001: Update a calendar event
   */
  async updateCalendarEvent(
    instituteId: string,
    eventId: string,
    dto: Partial<InstituteCalendarEventEntity>,
  ): Promise<InstituteCalendarEventEntity> {
    const event = await this.calendarEventRepo.findOne({
      where: { id: eventId, instituteId },
    });

    if (!event) {
      throw new NotFoundException(`Calendar event ${eventId} not found for institute ${instituteId}`);
    }

    // If setting as default, unset any existing default for the same calendar day
    if (dto.isDefault === true && event.calendarDayId) {
      await this.calendarEventRepo.update(
        { calendarDayId: event.calendarDayId, isDefault: true },
        { isDefault: false },
      );
    }

    Object.assign(event, dto);
    return this.calendarEventRepo.save(event);
  }

  /**
   * ✅ FEAT-001: Delete a calendar event
   */
  async deleteCalendarEvent(
    instituteId: string,
    eventId: string,
  ): Promise<void> {
    const event = await this.calendarEventRepo.findOne({
      where: { id: eventId, instituteId },
    });

    if (!event) {
      throw new NotFoundException(`Calendar event ${eventId} not found for institute ${instituteId}`);
    }

    await this.calendarEventRepo.remove(event);
  }

  /**
   * ✅ FEAT-002: Update a calendar day (e.g., mark as holiday after generation)
   */
  async updateCalendarDay(
    instituteId: string,
    calendarDayId: string,
    dto: Partial<InstituteCalendarDayEntity>,
  ): Promise<InstituteCalendarDayEntity> {
    const day = await this.calendarDayRepo.findOne({
      where: { id: calendarDayId, instituteId },
    });

    if (!day) {
      throw new NotFoundException(`Calendar day ${calendarDayId} not found for institute ${instituteId}`);
    }

    Object.assign(day, dto);
    return this.calendarDayRepo.save(day);
  }

  /**
   * ✅ FEAT-002: Delete a calendar day (and its events)
   */
  async deleteCalendarDay(
    instituteId: string,
    calendarDayId: string,
  ): Promise<void> {
    const day = await this.calendarDayRepo.findOne({
      where: { id: calendarDayId, instituteId },
    });

    if (!day) {
      throw new NotFoundException(`Calendar day ${calendarDayId} not found for institute ${instituteId}`);
    }

    // Delete associated events first
    await this.calendarEventRepo.delete({ calendarDayId });
    await this.calendarDayRepo.remove(day);
  }

  /**
   * ✅ DATA-001: Delete entire calendar for an academic year (for regeneration)
   */
  async deleteCalendar(
    instituteId: string,
    academicYear: string,
  ): Promise<{ daysDeleted: number; eventsDeleted: number }> {
    const days = await this.calendarDayRepo.find({
      where: { instituteId, academicYear },
    });

    if (days.length === 0) {
      throw new NotFoundException(`No calendar found for academic year ${academicYear}`);
    }

    const dayIds = days.map(d => d.id);

    // Delete events for these calendar days
    let eventsDeleted = 0;
    for (const dayId of dayIds) {
      const result = await this.calendarEventRepo.delete({ calendarDayId: dayId });
      eventsDeleted += result.affected || 0;
    }

    // Delete the calendar days
    const daysResult = await this.calendarDayRepo.delete({ instituteId, academicYear });

    return {
      daysDeleted: daysResult.affected || 0,
      eventsDeleted,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CALENDAR EVENTS - LIST / QUERY
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get all calendar events for an institute with optional filters and pagination
   */
  async getCalendarEvents(
    instituteId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      eventType?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: InstituteCalendarEventEntity[]; total: number }> {
    const where: any = { instituteId };

    if (filters?.startDate && filters?.endDate) {
      where.eventDate = Between(filters.startDate, filters.endDate);
    }
    if (filters?.eventType) {
      where.eventType = filters.eventType;
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 100;
    const skip = (page - 1) * limit;

    const [data, total] = await this.calendarEventRepo.findAndCount({
      where,
      order: { eventDate: 'DESC', startTime: 'ASC' },
      skip,
      take: limit,
    });

    return { data, total };
  }

  /**
   * Get calendar events for a specific class within an institute
   * Filters events where targetScope is CLASS and targetClassIds contains the classId,
   * or targetScope is INSTITUTE (applies to all classes)
   */
  async getCalendarEventsForClass(
    instituteId: string,
    classId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      eventType?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: InstituteCalendarEventEntity[]; total: number }> {
    const qb = this.calendarEventRepo.createQueryBuilder('event')
      .where('event.instituteId = :instituteId', { instituteId })
      .andWhere(
        '(event.targetScope = :scopeInstitute OR (event.targetScope = :scopeClass AND JSON_CONTAINS(event.targetClassIds, :classIdJson)))',
        {
          scopeInstitute: 'INSTITUTE',
          scopeClass: 'CLASS',
          classIdJson: JSON.stringify(classId),
        },
      );

    if (filters?.startDate && filters?.endDate) {
      qb.andWhere('event.eventDate BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }
    if (filters?.eventType) {
      qb.andWhere('event.eventType = :eventType', { eventType: filters.eventType });
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 100;
    const skip = (page - 1) * limit;

    qb.orderBy('event.eventDate', 'DESC').addOrderBy('event.startTime', 'ASC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  /**
   * Get calendar events for a specific subject within a class and institute
   * Filters events where targetSubjectIds contains the subjectId
   */
  async getCalendarEventsForSubject(
    instituteId: string,
    classId: string,
    subjectId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      eventType?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: InstituteCalendarEventEntity[]; total: number }> {
    const qb = this.calendarEventRepo.createQueryBuilder('event')
      .where('event.instituteId = :instituteId', { instituteId })
      .andWhere(
        '(event.targetScope = :scopeInstitute OR ' +
        '(event.targetScope = :scopeClass AND JSON_CONTAINS(event.targetClassIds, :classIdJson)) OR ' +
        '(event.targetScope = :scopeSubject AND JSON_CONTAINS(event.targetSubjectIds, :subjectIdJson)))',
        {
          scopeInstitute: 'INSTITUTE',
          scopeClass: 'CLASS',
          scopeSubject: 'SUBJECT',
          classIdJson: JSON.stringify(classId),
          subjectIdJson: JSON.stringify(subjectId),
        },
      );

    if (filters?.startDate && filters?.endDate) {
      qb.andWhere('event.eventDate BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }
    if (filters?.eventType) {
      qb.andWhere('event.eventType = :eventType', { eventType: filters.eventType });
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 100;
    const skip = (page - 1) * limit;

    qb.orderBy('event.eventDate', 'DESC').addOrderBy('event.startTime', 'ASC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  /**
   * Get today's calendar for a specific class (with class-level overrides)
   */
  async getClassCalendarToday(
    instituteId: string,
    classId: string,
  ): Promise<{ day: InstituteCalendarDayEntity | null; classOverride: InstituteClassCalendarEntity | null; defaultEventId: string | null }> {
    const today = getCurrentSriLankaDate();

    // Get the institute-level calendar day
    const day = await this.calendarDayRepo.findOne({
      where: { instituteId, calendarDate: new Date(today) },
      relations: ['events'],
    });

    // Check for class-level override
    let classOverride: InstituteClassCalendarEntity | null = null;
    if (day) {
      classOverride = await this.classCalendarRepo.findOne({
        where: { instituteId, classId, calendarDayId: day.id },
      });
    }

    // Get default event (class-scoped if available, otherwise institute default)
    let defaultEventId: string | null = null;
    if (day) {
      // First try class-specific events
      const classEvent = await this.calendarEventRepo.findOne({
        where: {
          calendarDayId: day.id,
          isDefault: true,
          targetScope: CalendarEventScope.CLASS,
        },
      });
      if (classEvent) {
        defaultEventId = classEvent.id;
      } else {
        // Fall back to institute default event
        const defaultEvent = await this.calendarEventRepo.findOne({
          where: { calendarDayId: day.id, isDefault: true },
        });
        defaultEventId = defaultEvent?.id || null;
      }
    }

    return { day, classOverride, defaultEventId };
  }

  /**
   * Get today's calendar for a specific subject (events scoped to subject)
   */
  async getSubjectCalendarToday(
    instituteId: string,
    classId: string,
    subjectId: string,
  ): Promise<{ day: InstituteCalendarDayEntity | null; defaultEventId: string | null; subjectEvents: InstituteCalendarEventEntity[] }> {
    const today = getCurrentSriLankaDate();

    const day = await this.calendarDayRepo.findOne({
      where: { instituteId, calendarDate: new Date(today) },
      relations: ['events'],
    });

    let defaultEventId: string | null = null;
    let subjectEvents: InstituteCalendarEventEntity[] = [];

    if (day) {
      // Get events that target this subject
      const allEvents = await this.calendarEventRepo.find({
        where: { calendarDayId: day.id },
      });

      subjectEvents = allEvents.filter(event => {
        if (event.targetScope === CalendarEventScope.SUBJECT && event.targetSubjectIds) {
          return event.targetSubjectIds.includes(subjectId);
        }
        if (event.targetScope === CalendarEventScope.CLASS && event.targetClassIds) {
          return event.targetClassIds.includes(classId);
        }
        // Institute-level events apply to all
        return event.targetScope === CalendarEventScope.INSTITUTE || !event.targetScope;
      });

      const defaultEvent = subjectEvents.find(e => e.isDefault) || allEvents.find(e => e.isDefault);
      defaultEventId = defaultEvent?.id || null;
    }

    return { day, defaultEventId, subjectEvents };
  }

  /**
   * Get class calendar days (with class-level overrides merged)
   */
  async getClassCalendarDays(
    instituteId: string,
    classId: string,
    startDate?: Date,
    endDate?: Date,
    filters?: {
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: any[]; total: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 400;

    // Get institute-level calendar days
    const { data: instituteDays, total } = await this.getCalendarDays(
      instituteId,
      startDate,
      endDate,
      { page, limit },
    );

    // Get class-level overrides for these days
    const dayIds = instituteDays.map(d => d.id);
    let classOverrides: InstituteClassCalendarEntity[] = [];
    if (dayIds.length > 0) {
      classOverrides = await this.classCalendarRepo.find({
        where: {
          instituteId,
          classId,
          calendarDayId: In(dayIds),
        },
      });
    }

    const overrideMap = new Map(classOverrides.map(o => [o.calendarDayId, o]));

    // Merge institute days with class overrides
    const mergedDays = instituteDays.map(day => {
      const override = overrideMap.get(day.id);
      return {
        ...day,
        classOverride: override || null,
        effectiveDayType: override?.classDayType || day.dayType,
        effectiveIsAttendanceExpected: override?.isAttendanceExpected ?? day.isAttendanceExpected,
      };
    });

    return { data: mergedDays, total };
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
