import {
  Controller,
  Get,
  Post,
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
import { GenerateCalendarDto } from './dto/calendar/generate-calendar.dto';

/**
 * Institute Class Calendar Controller
 * 
 * Class-scoped calendar endpoints:
 * - GET  /institutes/:instituteId/class/:classId/calendar/today
 * - POST /institutes/:instituteId/class/:classId/calendar/generate
 * - GET  /institutes/:instituteId/class/:classId/calendar/events
 * - GET  /institutes/:instituteId/class/:classId/calendar/days
 */
@ApiTags('Institute Class Calendar')
@Controller('institutes/:instituteId/class/:classId/calendar')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InstituteClassCalendarController {
  private readonly logger = new Logger(InstituteClassCalendarController.name);

  constructor(
    private readonly calendarService: InstituteCalendarService,
    private readonly cacheService: CalendarDayCacheService,
  ) {}

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
  //  TODAY
  // ═══════════════════════════════════════════════════════════════════

  @Get('today')
  @ApiOperation({
    summary: "Get today's calendar day for a specific class",
    description: 'Returns today\'s calendar day with class-level overrides and events scoped to the class.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiResponse({ status: 200, description: "Today's class calendar day retrieved" })
  async getTodayCalendarDay(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
  ) {
    try {
      const { day, classOverride, defaultEventId } = await this.calendarService.getClassCalendarToday(
        instituteId,
        classId,
      );

      if (!day) {
        return {
          success: false,
          message: 'No calendar day found for today. Calendar may need to be generated.',
          data: null,
        };
      }

      return {
        success: true,
        data: {
          ...day,
          classOverride,
          effectiveDayType: classOverride?.classDayType || day.dayType,
          effectiveIsAttendanceExpected: classOverride?.isAttendanceExpected ?? day.isAttendanceExpected,
          defaultEventId,
        },
      };
    } catch (error) {
      this.handleError(error, "Failed to get today's class calendar day");
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  GENERATE
  // ═══════════════════════════════════════════════════════════════════

  @Post('generate')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Generate full year calendar for the institute (class context)',
    description: 'Generates the institute-level calendar. Class-level overrides can be added separately. ' +
      'This delegates to the institute calendar generate to ensure the base calendar exists.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID (for context)' })
  @ApiResponse({ status: 201, description: 'Calendar generated successfully' })
  @ApiResponse({ status: 409, description: 'Calendar already exists for this academic year' })
  async generateCalendar(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Body() dto: GenerateCalendarDto,
  ) {
    try {
      // Generate base institute calendar (class overrides are added separately)
      const result = await this.calendarService.generateCalendar(instituteId, dto);
      this.cacheService.invalidate(instituteId);

      return {
        success: true,
        message: `Generated calendar for ${dto.academicYear} (institute ${instituteId}, class context: ${classId})`,
        data: result,
      };
    } catch (error) {
      this.handleError(error, 'Failed to generate calendar');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  EVENTS
  // ═══════════════════════════════════════════════════════════════════

  @Get('events')
  @ApiOperation({
    summary: 'List calendar events scoped to a specific class',
    description: 'Returns events that target the entire institute OR specifically target this class.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'eventType', required: false, description: 'Event type filter' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page (default: 100)' })
  @ApiResponse({ status: 200, description: 'Class calendar events retrieved' })
  async getCalendarEvents(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
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

      const { data: events, total } = await this.calendarService.getCalendarEventsForClass(
        instituteId,
        classId,
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
      this.handleError(error, 'Failed to get class calendar events');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DAYS
  // ═══════════════════════════════════════════════════════════════════

  @Get('days')
  @ApiOperation({
    summary: 'List calendar days with class-level overrides merged',
    description: 'Returns institute calendar days with any class-specific overrides (e.g. class holidays, merged classes).',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page (default: 400)' })
  @ApiResponse({ status: 200, description: 'Class calendar days retrieved' })
  async getCalendarDays(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
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

      const { data: days, total } = await this.calendarService.getClassCalendarDays(
        instituteId,
        classId,
        start,
        end,
        {
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
      this.handleError(error, 'Failed to get class calendar days');
    }
  }
}
