import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
  HttpStatus,
  HttpException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { InstituteCalendarService } from './services/institute-calendar.service';
import { CalendarDayCacheService } from './services/calendar-day-cache.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { CreateOperatingConfigDto } from './dto/calendar/create-operating-config.dto';
import { BulkOperatingConfigDto } from './dto/calendar/bulk-operating-config.dto';
import { GenerateCalendarDto } from './dto/calendar/generate-calendar.dto';
import { CreateCalendarEventDto } from './dto/calendar/create-calendar-event.dto';
import { CalendarDayType } from './enums/calendar-day-type.enum';

/**
 * Institute Calendar Controller
 * 
 * Purpose: Manage institute calendars, operating schedules, special events
 * 
 * Architecture:
 * - Operating config (weekly template) → Calendar days (365/year) → Events (N per day)
 * - Calendar days = source of truth for "was this a working day?"
 * - Events = attendance tracking points (REGULAR_CLASS, EXAM, PARENTS_MEETING, etc.)
 * - Lazy creation: If day not found, auto-creates as REGULAR
 * 
 * Caching Strategy:
 * - getTodayCalendarDay uses in-memory cache (expires at midnight)
 * - Performance: ~0.01ms cache hit, ~3ms cache miss
 * - ✅ ARCH-003: Auto-invalidation on all write operations
 *
 * Security:
 * - ✅ SEC-003: All write endpoints require SUPERADMIN or INSTITUTE_ADMIN role
 * - ✅ SEC-002: Cache stats restricted to admins
 * 
 * Error Handling:
 * - ✅ ERR-001: Propagates NestJS HttpExceptions with correct status codes
 */
@ApiTags('Institute Calendar')
@Controller('institutes/:instituteId/calendar')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InstituteCalendarController {
  private readonly logger = new Logger(InstituteCalendarController.name);

  constructor(
    private readonly calendarService: InstituteCalendarService,
    private readonly cacheService: CalendarDayCacheService,
  ) {}

  // ── ERR-001 FIX: Rethrow HttpException with correct status, wrap unknowns ──
  private handleError(error: any, fallbackMsg: string): never {
    if (error instanceof HttpException) {
      throw error;
    }
    this.logger.error(`${fallbackMsg}: ${error.message}`, error.stack);
    throw new HttpException(
      { success: false, message: error.message || fallbackMsg },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  OPERATING CONFIG
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Set Operating Config - Define weekly schedule template (single day)
   * ✅ SEC-003: Requires SUPERADMIN or INSTITUTE_ADMIN
   * ✅ ARCH-003: Auto-invalidates cache
   */
  @Post('operating-config')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Set operating config (weekly schedule template)',
    description: 'Define which days institute operates and timings. Deletes old config and creates new.'
  })
  @ApiResponse({ status: 201, description: 'Operating config set successfully' })
  async setOperatingConfig(
    @Param('instituteId') instituteId: string,
    @Body() dto: CreateOperatingConfigDto,
  ) {
    try {
      await this.calendarService.setOperatingConfig(instituteId, [dto]);

      // ✅ ARCH-003: Auto-invalidate cache after config change
      this.cacheService.invalidate(instituteId);

      return {
        success: true,
        message: `Operating config set for institute ${instituteId}`,
      };
    } catch (error) {
      this.handleError(error, 'Failed to set operating config');
    }
  }

  /**
   * ✅ FEAT-006: Bulk Set Operating Config - Configure multiple days at once
   * 
   * Expected body: { "academicYear": "2026", "configs": [ { dayOfWeek, isOperating, startTime?, endTime? }, ... ] }
   */
  @Post('operating-config/bulk')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Set operating config for multiple days at once',
    description: 'Configure weekly schedule in a single request. Send { academicYear, configs: [...] } with up to 7 day configs (Mon-Sun).'
  })
  @ApiResponse({ status: 201, description: 'Bulk operating config set successfully' })
  async setOperatingConfigBulk(
    @Param('instituteId') instituteId: string,
    @Body() dto: BulkOperatingConfigDto,
  ) {
    try {
      // Merge academicYear from wrapper into each config item
      const configs: CreateOperatingConfigDto[] = dto.configs.map((c) => ({
        ...c,
        academicYear: dto.academicYear,
      }));

      await this.calendarService.setOperatingConfig(instituteId, configs);

      // ✅ ARCH-003: Auto-invalidate cache
      this.cacheService.invalidate(instituteId);

      return {
        success: true,
        message: `Operating config set for ${configs.length} day(s) at institute ${instituteId}`,
      };
    } catch (error) {
      this.handleError(error, 'Failed to set bulk operating config');
    }
  }

  /**
   * Get Operating Config - Retrieve weekly schedule
   */
  @Get('operating-config')
  @ApiOperation({ summary: 'Get operating config (weekly schedule)' })
  @ApiResponse({ status: 200, description: 'Operating config retrieved' })
  async getOperatingConfig(
    @Param('instituteId') instituteId: string,
    @Query('academicYear') academicYear?: string,
  ) {
    try {
      const config = await this.calendarService.getOperatingConfig(
        instituteId,
        academicYear || new Date().getFullYear().toString(),
      );
      return {
        success: true,
        data: config,
      };
    } catch (error) {
      this.handleError(error, 'Failed to get operating config');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CALENDAR GENERATION
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Generate Calendar - Auto-create 365 days + events from template
   * ✅ SEC-003: Requires SUPERADMIN or INSTITUTE_ADMIN
   * ✅ DATA-001: Rejects duplicate calendar (throws 409 Conflict)
   */
  @Post('generate')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Generate full year calendar',
    description: 'Auto-creates 365 calendar days + default REGULAR_CLASS events based on operating config. ' +
      'Fails if calendar already exists — delete first with DELETE /calendar/:academicYear.'
  })
  @ApiResponse({ status: 201, description: 'Calendar generated successfully' })
  @ApiResponse({ status: 409, description: 'Calendar already exists for this academic year' })
  async generateCalendar(
    @Param('instituteId') instituteId: string,
    @Body() dto: GenerateCalendarDto,
  ) {
    try {
      const result = await this.calendarService.generateCalendar(instituteId, dto);
      
      // ✅ ARCH-003: Auto-invalidate cache after generation
      this.cacheService.invalidate(instituteId);

      return {
        success: true,
        message: `Generated calendar for ${dto.academicYear}`,
        data: result,
      };
    } catch (error) {
      this.handleError(error, 'Failed to generate calendar');
    }
  }

  /**
   * ✅ DATA-001: Delete Calendar - Remove all days + events for an academic year (allows regeneration)
   */
  @Delete(':academicYear')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Delete calendar for an academic year',
    description: 'Deletes all calendar days and events for the specified academic year. Required before regenerating.'
  })
  @ApiParam({ name: 'academicYear', description: 'Academic year to delete (e.g. 2025)' })
  @ApiResponse({ status: 200, description: 'Calendar deleted successfully' })
  @ApiResponse({ status: 404, description: 'No calendar found for the academic year' })
  async deleteCalendar(
    @Param('instituteId') instituteId: string,
    @Param('academicYear') academicYear: string,
  ) {
    try {
      const result = await this.calendarService.deleteCalendar(instituteId, academicYear);

      // ✅ ARCH-003: Auto-invalidate cache
      this.cacheService.invalidate(instituteId);

      return {
        success: true,
        message: `Deleted calendar for academic year ${academicYear}`,
        data: result,
      };
    } catch (error) {
      this.handleError(error, 'Failed to delete calendar');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CALENDAR DAYS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get a single Calendar Day by ID - with its events
   */
  @Get('days/:calendarDayId')
  @ApiOperation({ summary: 'Get a specific calendar day by ID with its events' })
  @ApiParam({ name: 'calendarDayId', description: 'Calendar day ID' })
  @ApiResponse({ status: 200, description: 'Calendar day retrieved' })
  @ApiResponse({ status: 404, description: 'Calendar day not found' })
  async getCalendarDayById(
    @Param('instituteId') instituteId: string,
    @Param('calendarDayId') calendarDayId: string,
  ) {
    try {
      const day = await this.calendarService.getCalendarDayByIdForInstitute(instituteId, calendarDayId);
      if (!day) {
        return { success: false, message: `Calendar day ${calendarDayId} not found.`, data: null };
      }
      const events = await this.calendarService.getEventsForDay(calendarDayId);
      return { success: true, data: { ...day, events } };
    } catch (error) {
      this.handleError(error, `Failed to get calendar day ${calendarDayId}`);
    }
  }

  /**
   * Get Calendar Days - Query with filters + pagination
   * ✅ BUG-004 FIX: All filter params now passed to service
   * ✅ BUG-006 FIX: Date strings created with +05:30 offset (avoids UTC shift)
   * ✅ PERF-004 FIX: Paginated results with total count
   */
  @Get('days')
  @ApiOperation({ summary: 'List calendar days with filters (paginated)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'academicYear', required: false, description: 'Academic year' })
  @ApiQuery({ name: 'dayType', required: false, description: 'Day type: REGULAR, WEEKEND, PUBLIC_HOLIDAY, etc.' })
  @ApiQuery({ name: 'isAttendanceExpected', required: false, description: 'true/false' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page (default: 400)' })
  @ApiResponse({ status: 200, description: 'Calendar days retrieved' })
  async getCalendarDays(
    @Param('instituteId') instituteId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('academicYear') academicYear?: string,
    @Query('dayType') dayType?: string,
    @Query('isAttendanceExpected') isAttendanceExpected?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      // SECURITY: Validate date inputs to prevent injection
      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw new BadRequestException('Invalid startDate format. Use YYYY-MM-DD.');
      }
      if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new BadRequestException('Invalid endDate format. Use YYYY-MM-DD.');
      }

      // ✅ BUG-006 FIX: Append Sri Lanka offset to avoid UTC date shift
      const start = startDate ? new Date(startDate + 'T00:00:00+05:30') : undefined;
      const end = endDate ? new Date(endDate + 'T23:59:59+05:30') : undefined;
      const attendanceExpected = isAttendanceExpected === 'true' ? true 
                                 : isAttendanceExpected === 'false' ? false 
                                 : undefined;

      // ✅ BUG-004 FIX: Pass all filter params + ✅ PERF-004: Pagination
      const { data: days, total } = await this.calendarService.getCalendarDays(
        instituteId,
        start,
        end,
        {
          academicYear,
          dayType,
          isAttendanceExpected: attendanceExpected,
          page: page ? parseInt(page, 10) : 1,
          limit: limit ? parseInt(limit, 10) : 400,
        },
      );

      return {
        success: true,
        count: days.length,
        total,
        data: days,
      };
    } catch (error) {
      this.handleError(error, 'Failed to get calendar days');
    }
  }

  /**
   * Get Today's Calendar Day - Cached for performance
   */
  @Get('today')
  @ApiOperation({ 
    summary: "Get today's calendar day (cached)",
    description: 'Returns today\'s calendar day with events. Uses in-memory cache for sub-millisecond performance.'
  })
  @ApiResponse({ status: 200, description: 'Today\'s calendar day retrieved' })
  async getTodayCalendarDay(@Param('instituteId') instituteId: string) {
    try {
      const { day, defaultEventId } = await this.cacheService.getTodayCalendarDay(instituteId);

      if (!day) {
        return {
          success: false,
          message: 'No calendar day found for today. Calendar may need to be generated.',
          data: null,
        };
      }

      // Fetch all events for this day
      const events = await this.calendarService.getEventsForDay(String(day.id));

      return {
        success: true,
        data: {
          ...day,
          defaultEventId,
          events,
        },
      };
    } catch (error) {
      this.handleError(error, "Failed to get today's calendar day");
    }
  }

  /**
   * Get Calendar Day by Date - Returns day + all events for any date
   * Frontend uses this to show available events when marking attendance for a specific date.
   */
  @Get('date/:date')
  @ApiOperation({
    summary: 'Get calendar day and events for a specific date',
    description: 'Returns the calendar day, default event ID, and all events for the given date (YYYY-MM-DD). '
      + 'If no calendar day exists, one is lazy-created with a default REGULAR_CLASS event. '
      + 'Frontend should call this before marking attendance to display available events.',
  })
  @ApiParam({ name: 'date', description: 'Date in YYYY-MM-DD format' })
  @ApiResponse({ status: 200, description: 'Calendar day with events retrieved' })
  @ApiResponse({ status: 400, description: 'Invalid date format' })
  async getCalendarDayByDate(
    @Param('instituteId') instituteId: string,
    @Param('date') date: string,
  ) {
    try {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new BadRequestException('Invalid date format. Use YYYY-MM-DD.');
      }

      const { day, defaultEventId } = await this.cacheService.getCalendarDayForDate(instituteId, date);

      if (!day) {
        return {
          success: false,
          message: `No calendar day found for ${date}.`,
          data: null,
        };
      }

      // Fetch all events for this day so frontend can display event picker
      const events = await this.calendarService.getEventsForDay(String(day.id));

      return {
        success: true,
        data: {
          ...day,
          defaultEventId,
          events,
        },
      };
    } catch (error) {
      this.handleError(error, `Failed to get calendar day for ${date}`);
    }
  }

  /**
   * ✅ FEAT-002: Update Calendar Day (e.g., mark a regular day as holiday)
   */
  @Patch('days/:calendarDayId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Update a calendar day',
    description: 'Change day type (e.g., mark as holiday), update attendance expectation, title, etc.'
  })
  @ApiParam({ name: 'calendarDayId', description: 'Calendar day ID to update' })
  @ApiResponse({ status: 200, description: 'Calendar day updated' })
  @ApiResponse({ status: 404, description: 'Calendar day not found' })
  async updateCalendarDay(
    @Param('instituteId') instituteId: string,
    @Param('calendarDayId') calendarDayId: string,
    @Body() dto: { dayType?: CalendarDayType; title?: string; isAttendanceExpected?: boolean; startTime?: string; endTime?: string },
  ) {
    try {
      const day = await this.calendarService.updateCalendarDay(instituteId, calendarDayId, dto);

      // ✅ ARCH-003: Auto-invalidate cache
      this.cacheService.invalidate(instituteId);

      return {
        success: true,
        message: 'Calendar day updated successfully',
        data: day,
      };
    } catch (error) {
      this.handleError(error, 'Failed to update calendar day');
    }
  }

  /**
   * ✅ FEAT-002: Delete Calendar Day (and its events)
   */
  @Delete('days/:calendarDayId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Delete a calendar day and its events' })
  @ApiParam({ name: 'calendarDayId', description: 'Calendar day ID to delete' })
  @ApiResponse({ status: 200, description: 'Calendar day deleted' })
  @ApiResponse({ status: 404, description: 'Calendar day not found' })
  async deleteCalendarDay(
    @Param('instituteId') instituteId: string,
    @Param('calendarDayId') calendarDayId: string,
  ) {
    try {
      await this.calendarService.deleteCalendarDay(instituteId, calendarDayId);

      // ✅ ARCH-003: Auto-invalidate cache
      this.cacheService.invalidate(instituteId);

      return {
        success: true,
        message: 'Calendar day deleted successfully',
      };
    } catch (error) {
      this.handleError(error, 'Failed to delete calendar day');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CALENDAR EVENTS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create Calendar Event
   * ✅ SEC-003 FIX: Now requires SUPERADMIN or INSTITUTE_ADMIN
   */
  @Post('events')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Create calendar event',
    description: 'Add event to a calendar day. Can have multiple events per day.'
  })
  @ApiResponse({ status: 201, description: 'Event created successfully' })
  async createCalendarEvent(
    @Param('instituteId') instituteId: string,
    @Body() dto: CreateCalendarEventDto,
  ) {
    try {
      const event = await this.calendarService.createCalendarEvent(instituteId, dto);
      
      // ✅ ARCH-003: Auto-invalidate cache
      this.cacheService.invalidate(instituteId);

      return {
        success: true,
        message: 'Event created successfully',
        data: event,
      };
    } catch (error) {
      this.handleError(error, 'Failed to create calendar event');
    }
  }

  /**
   * ✅ FEAT-001: Update Calendar Event
   */
  @Patch('events/:eventId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Update a calendar event',
    description: 'Modify event title, time, status, isDefault flag, etc.'
  })
  @ApiParam({ name: 'eventId', description: 'Calendar event ID to update' })
  @ApiResponse({ status: 200, description: 'Event updated successfully' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async updateCalendarEvent(
    @Param('instituteId') instituteId: string,
    @Param('eventId') eventId: string,
    @Body() dto: Partial<CreateCalendarEventDto>,
  ) {
    try {
      const event = await this.calendarService.updateCalendarEvent(instituteId, eventId, dto as any);

      // ✅ ARCH-003: Auto-invalidate cache
      this.cacheService.invalidate(instituteId);

      return {
        success: true,
        message: 'Event updated successfully',
        data: event,
      };
    } catch (error) {
      this.handleError(error, 'Failed to update calendar event');
    }
  }

  /**
   * ✅ FEAT-001: Delete Calendar Event
   */
  @Delete('events/:eventId')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Delete a calendar event' })
  @ApiParam({ name: 'eventId', description: 'Calendar event ID to delete' })
  @ApiResponse({ status: 200, description: 'Event deleted successfully' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async deleteCalendarEvent(
    @Param('instituteId') instituteId: string,
    @Param('eventId') eventId: string,
  ) {
    try {
      await this.calendarService.deleteCalendarEvent(instituteId, eventId);

      // ✅ ARCH-003: Auto-invalidate cache
      this.cacheService.invalidate(instituteId);

      return {
        success: true,
        message: 'Event deleted successfully',
      };
    } catch (error) {
      this.handleError(error, 'Failed to delete calendar event');
    }
  }

  /**
   * Get Events for Day - Retrieve all events for a specific calendar day
   */
  @Get('days/:calendarDayId/events')
  @ApiOperation({ summary: 'Get events for a specific calendar day' })
  @ApiResponse({ status: 200, description: 'Events retrieved' })
  async getEventsForDay(
    @Param('instituteId') instituteId: string,
    @Param('calendarDayId') calendarDayId: string,
  ) {
    try {
      const events = await this.calendarService.getEventsForDay(calendarDayId);
      return {
        success: true,
        count: events.length,
        data: events,
      };
    } catch (error) {
      this.handleError(error, 'Failed to get events');
    }
  }

  /**
   * Get Default Event - Find the default event for a calendar day
   */
  @Get('days/:calendarDayId/default-event')
  @ApiOperation({ 
    summary: 'Get default event for a calendar day',
    description: 'Returns the default event (isDefault = true). Used when marking attendance without explicit event_id.'
  })
  @ApiResponse({ status: 200, description: 'Default event retrieved' })
  async getDefaultEventForDay(
    @Param('instituteId') instituteId: string,
    @Param('calendarDayId') calendarDayId: string,
  ) {
    try {
      const event = await this.calendarService.getDefaultEventForDay(calendarDayId);

      if (!event) {
        return {
          success: false,
          message: 'No default event found for this calendar day',
          data: null,
        };
      }

      return {
        success: true,
        data: event,
      };
    } catch (error) {
      this.handleError(error, 'Failed to get default event');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CALENDAR EVENTS - LIST ALL
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get All Calendar Events - Query events with pagination
   */
  @Get('events')
  @ApiOperation({
    summary: 'List all calendar events for the institute',
    description: 'Returns paginated calendar events. Filter by date range, event type, etc.',
  })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'eventType', required: false, description: 'Event type filter' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page (default: 100)' })
  @ApiResponse({ status: 200, description: 'Calendar events retrieved' })
  async getCalendarEvents(
    @Param('instituteId') instituteId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('eventType') eventType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw new BadRequestException('Invalid startDate format. Use YYYY-MM-DD.');
      }
      if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new BadRequestException('Invalid endDate format. Use YYYY-MM-DD.');
      }

      const start = startDate ? new Date(startDate + 'T00:00:00+05:30') : undefined;
      const end = endDate ? new Date(endDate + 'T23:59:59+05:30') : undefined;

      const { data: events, total } = await this.calendarService.getCalendarEvents(
        instituteId,
        {
          startDate: start,
          endDate: end,
          eventType,
          page: page ? parseInt(page, 10) : 1,
          limit: limit ? parseInt(limit, 10) : 100,
        },
      );

      return {
        success: true,
        count: events.length,
        total,
        data: events,
      };
    } catch (error) {
      this.handleError(error, 'Failed to get calendar events');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  MONTH VIEW
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get Month Calendar — all days + embedded events for a calendar month.
   *
   * Accessible by any institute user (SUPERADMIN, INSTITUTE_ADMIN, TEACHER,
   * STUDENT, PARENT…).  All users see the same data so results are served from
   * an in-memory cache keyed by month_<instituteId>_<year>_<mm>.  The cache
   * is automatically invalidated whenever any write operation (event / day
   * create, update, delete, generate, or delete-calendar) is performed.
   *
   * Response shape per day:
   *   { id, calendarDate, dayType, title, isAttendanceExpected, events: [...] }
   *
   * Events include full details (eventType, title, startTime, endTime,
   * isDefault, venue, status, …) so the frontend can render them visually.
   */
  @Get('month')
  @ApiOperation({
    summary: 'Get institute calendar for a specific month (with events)',
    description:
      'Returns every calendar day of the requested month with all events embedded. ' +
      'Results are served from an in-memory cache shared across all institute users — ' +
      'no DB call is made until the cache expires or a write operation invalidates it. ' +
      'Pass ?year=2026&month=3 to get March 2026.',
  })
  @ApiQuery({ name: 'year', required: false, description: 'Year (e.g. 2026). Defaults to current year.' })
  @ApiQuery({ name: 'month', required: false, description: 'Month 1–12 (e.g. 3 for March). Defaults to current month.' })
  @ApiResponse({ status: 200, description: 'Month calendar with events for each day' })
  @ApiResponse({ status: 400, description: 'Invalid year or month' })
  async getMonthCalendar(
    @Param('instituteId') instituteId: string,
    @Query('year') yearStr?: string,
    @Query('month') monthStr?: string,
  ) {
    try {
      // Resolve defaults from Sri Lanka "today"
      const todayParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: '2-digit',
      }).formatToParts(new Date());
      const defaultYear = parseInt(todayParts.find(p => p.type === 'year')!.value, 10);
      const defaultMonth = parseInt(todayParts.find(p => p.type === 'month')!.value, 10);

      const year = yearStr ? parseInt(yearStr, 10) : defaultYear;
      const month = monthStr ? parseInt(monthStr, 10) : defaultMonth;

      if (isNaN(year) || year < 2000 || year > 2100) {
        throw new BadRequestException('Invalid year. Must be between 2000 and 2100.');
      }
      if (isNaN(month) || month < 1 || month > 12) {
        throw new BadRequestException('Invalid month. Must be between 1 and 12.');
      }

      const days = await this.cacheService.getMonthCalendar(instituteId, year, month);

      return {
        success: true,
        data: {
          year,
          month,
          totalDays: days.length,
          days,
        },
      };
    } catch (error) {
      this.handleError(error, 'Failed to get month calendar');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CACHE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Invalidate Cache - Force cache refresh for an institute
   */
  @Post('cache/invalidate')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ 
    summary: 'Invalidate calendar cache',
    description: 'Clears cached calendar day for this institute.'
  })
  @ApiResponse({ status: 200, description: 'Cache invalidated' })
  async invalidateCache(@Param('instituteId') instituteId: string) {
    try {
      this.cacheService.invalidate(instituteId);
      return {
        success: true,
        message: `Cache invalidated for institute ${instituteId}`,
      };
    } catch (error) {
      this.handleError(error, 'Failed to invalidate cache');
    }
  }

  /**
   * Get Cache Stats - Diagnostics for cache performance
   * ✅ SEC-002 FIX: Restricted to SUPERADMIN / INSTITUTE_ADMIN
   */
  @Get('cache/stats')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get cache statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Cache stats retrieved' })
  getCacheStats() {
    try {
      const stats = this.cacheService.getStats();
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.handleError(error, 'Failed to get cache stats');
    }
  }
}
