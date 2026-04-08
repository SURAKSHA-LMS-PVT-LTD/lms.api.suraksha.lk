import {
  Controller,
  Get,
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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';

/**
 * Institute Class Subject Calendar Controller
 * 
 * Subject-scoped calendar endpoints:
 * - GET /institutes/:instituteId/class/:classId/subject/:subjectId/calendar/today
 * - GET /institutes/:instituteId/class/:classId/subject/:subjectId/calendar/events
 * - GET /institutes/:instituteId/class/:classId/subject/:subjectId/calendar/days
 */
@ApiTags('Institute Class Subject Calendar')
@Controller('institutes/:instituteId/class/:classId/subject/:subjectId/calendar')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@RequireAnyOfRoles({ global: [UserType.SUPERADMIN], anyInstituteRole: true })
@ApiBearerAuth()
export class InstituteClassSubjectCalendarController {
  private readonly logger = new Logger(InstituteClassSubjectCalendarController.name);

  constructor(
    private readonly calendarService: InstituteCalendarService,
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
    summary: "Get today's calendar day for a specific subject",
    description: 'Returns today\'s calendar day with events filtered to the subject scope.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiResponse({ status: 200, description: "Today's subject calendar day retrieved" })
  async getTodayCalendarDay(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
  ) {
    try {
      const { day, defaultEventId, subjectEvents } = await this.calendarService.getSubjectCalendarToday(
        instituteId,
        classId,
        subjectId,
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
          defaultEventId,
          subjectEvents,
        },
      };
    } catch (error) {
      this.handleError(error, "Failed to get today's subject calendar day");
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  EVENTS
  // ═══════════════════════════════════════════════════════════════════

  @Get('events')
  @ApiOperation({
    summary: 'List calendar events scoped to a specific subject',
    description: 'Returns events that target the entire institute, the class, OR specifically this subject.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'eventType', required: false, description: 'Event type filter' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page (default: 100)' })
  @ApiResponse({ status: 200, description: 'Subject calendar events retrieved' })
  async getCalendarEvents(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
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

      const { data: events, total } = await this.calendarService.getCalendarEventsForSubject(
        instituteId,
        classId,
        subjectId,
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
      this.handleError(error, 'Failed to get subject calendar events');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DAYS
  // ═══════════════════════════════════════════════════════════════════

  @Get('days')
  @ApiOperation({
    summary: 'List calendar days with subject context',
    description: 'Returns institute calendar days with class overrides. Subject context is used for event filtering.',
  })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'classId', description: 'Class ID' })
  @ApiParam({ name: 'subjectId', description: 'Subject ID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Results per page (default: 400)' })
  @ApiResponse({ status: 200, description: 'Subject calendar days retrieved' })
  async getCalendarDays(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
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

      // Use class calendar days (subject inherits class-level overrides)
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
        subjectId,
        data: days,
      };
    } catch (error) {
      this.handleError(error, 'Failed to get subject calendar days');
    }
  }
}
