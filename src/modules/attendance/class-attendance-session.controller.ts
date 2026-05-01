import {
  Controller, Get, Post, Patch, Delete, Put,
  Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { ClassAttendanceSessionService } from './services/class-attendance-session.service';
import {
  CreateSessionGroupDto,
  UpdateSessionGroupDto,
  CreateSessionDto,
  UpdateSessionDto,
  CloseSessionDto,
  MarkSessionAttendanceDto,
  BulkMarkSessionAttendanceDto,
  GetSessionsQueryDto,
  GetSessionGridQueryDto,
} from './dto/class-attendance-session.dto';

const ROLES = {
  global: [UserType.SUPERADMIN],
  instituteAdmin: true,
  teacher: true,
  attendanceMarker: true,
};

@ApiTags('Class Attendance Sessions')
@Controller('api/attendance/institute/:instituteId/class/:classId/sessions')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
export class ClassAttendanceSessionController {
  constructor(private readonly svc: ClassAttendanceSessionService) {}

  // ─────────────────────────────────────────────────────────────
  // SESSION GROUPS
  // ─────────────────────────────────────────────────────────────

  @Post('groups')
  @RequireAnyOfRoles(ROLES)
  @ApiOperation({ summary: 'Create a session group for a class' })
  createGroup(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Body() dto: CreateSessionGroupDto,
    @Req() req: any,
  ) {
    const userId = req.user?.s ?? req.user?.sub;
    return this.svc.createSessionGroup(instituteId, classId, dto, userId);
  }

  @Get('groups')
  @RequireAnyOfRoles({ ...ROLES, student: true })
  @ApiOperation({ summary: 'List session groups for a class' })
  getGroups(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
  ) {
    return this.svc.getSessionGroups(instituteId, classId);
  }

  @Patch('groups/:groupId')
  @RequireAnyOfRoles(ROLES)
  @ApiOperation({ summary: 'Update a session group' })
  updateGroup(
    @Param('instituteId') instituteId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateSessionGroupDto,
  ) {
    return this.svc.updateSessionGroup(groupId, instituteId, dto);
  }

  @Delete('groups/:groupId')
  @RequireAnyOfRoles(ROLES)
  @ApiOperation({ summary: 'Soft-delete a session group' })
  deleteGroup(
    @Param('instituteId') instituteId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.svc.deleteSessionGroup(groupId, instituteId);
  }

  // ─────────────────────────────────────────────────────────────
  // SESSIONS
  // ─────────────────────────────────────────────────────────────

  @Post()
  @RequireAnyOfRoles(ROLES)
  @ApiOperation({ summary: 'Create a new attendance session' })
  createSession(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Body() dto: CreateSessionDto,
    @Req() req: any,
  ) {
    const userId = req.user?.s ?? req.user?.sub;
    return this.svc.createSession(instituteId, classId, dto, userId);
  }

  @Get()
  @RequireAnyOfRoles({ ...ROLES, student: true })
  @ApiOperation({ summary: 'List sessions for a class' })
  getSessions(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Query() query: GetSessionsQueryDto,
  ) {
    return this.svc.getSessions(instituteId, classId, query);
  }

  @Get('grid')
  @RequireAnyOfRoles(ROLES)
  @ApiOperation({ summary: 'Multi-session grid view: sessions × students' })
  getGrid(
    @Param('instituteId') instituteId: string,
    @Param('classId') classId: string,
    @Query() query: GetSessionGridQueryDto,
  ) {
    return this.svc.getSessionGrid(instituteId, classId, query);
  }

  @Get(':sessionId')
  @RequireAnyOfRoles({ ...ROLES, student: true })
  @ApiOperation({ summary: 'Get session detail with all students and their attendance status' })
  getSessionDetail(
    @Param('instituteId') instituteId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.svc.getSessionDetail(sessionId, instituteId);
  }

  @Patch(':sessionId')
  @RequireAnyOfRoles(ROLES)
  @ApiOperation({ summary: 'Update session name, time, or group assignment' })
  updateSession(
    @Param('instituteId') instituteId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.svc.updateSession(sessionId, instituteId, dto);
  }

  @Post(':sessionId/mark')
  @RequireAnyOfRoles(ROLES)
  @ApiOperation({ summary: 'Mark attendance for one student in a session' })
  mark(
    @Param('instituteId') instituteId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: MarkSessionAttendanceDto,
    @Req() req: any,
  ) {
    const userId = req.user?.s ?? req.user?.sub;
    return this.svc.markAttendanceInSession(sessionId, instituteId, dto, userId);
  }

  @Post(':sessionId/mark-bulk')
  @RequireAnyOfRoles(ROLES)
  @ApiOperation({ summary: 'Bulk mark attendance for multiple students in a session' })
  bulkMark(
    @Param('instituteId') instituteId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: BulkMarkSessionAttendanceDto,
    @Req() req: any,
  ) {
    const userId = req.user?.s ?? req.user?.sub;
    return this.svc.bulkMarkAttendanceInSession(sessionId, instituteId, dto, userId);
  }

  @Post(':sessionId/close')
  @RequireAnyOfRoles(ROLES)
  @ApiOperation({ summary: 'Close a session (optionally mark all un-marked as absent)' })
  closeSession(
    @Param('instituteId') instituteId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: CloseSessionDto,
    @Req() req: any,
  ) {
    const userId = req.user?.s ?? req.user?.sub;
    return this.svc.closeSession(sessionId, instituteId, dto, userId);
  }
}
