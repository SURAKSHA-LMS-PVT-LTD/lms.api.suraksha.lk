import {
  Controller, Get, Post, Patch, Param, Body, Query, Req,
  UseGuards, HttpCode, HttpStatus, ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { AttendanceDeviceService } from '../services/attendance-device.service';
import {
  UpdateDeviceDto, UpdateDeviceConfigDto, BindDeviceEventDto,
  DeviceQueryDto, DeviceHeartbeatDto, StartDeviceSessionDto,
} from '../dto/device.dto';

@ApiTags('Institute Admin - Attendance Devices')
@ApiBearerAuth()
@Controller('api/institute/:instituteId/devices')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
export class InstituteDeviceController {
  constructor(private readonly deviceService: AttendanceDeviceService) {}

  // ═══════════════════════════════════════════════════════════════════════
  //  LIST / VIEW (scoped to own institute)
  // ═══════════════════════════════════════════════════════════════════════

  @Get()
  @ApiOperation({ summary: 'List devices assigned to this institute' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  async listDevices(
    @Param('instituteId') instituteId: string,
    @Query() query: DeviceQueryDto,
  ) {
    // Force institute scope
    query.instituteId = instituteId;
    return this.deviceService.listDevices(query);
  }

  @Get(':deviceId')
  @ApiOperation({ summary: 'Get device details with config and active binding' })
  @ApiParam({ name: 'instituteId', description: 'Institute ID' })
  @ApiParam({ name: 'deviceId', description: 'Device ID' })
  async getDevice(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
  ) {
    const result = await this.deviceService.getDeviceWithConfig(deviceId);
    // Verify device belongs to this institute
    if (result.device.instituteId !== instituteId) {
      throw new ForbiddenException('Device does not belong to this institute');
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  UPDATE (limited fields)
  // ═══════════════════════════════════════════════════════════════════════

  @Patch(':deviceId')
  @ApiOperation({ summary: 'Update device details (limited to name, description)' })
  async updateDevice(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdateDeviceDto,
    @Req() req: any,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    // Institute admins cannot change device type
    const limitedDto: UpdateDeviceDto = {
      deviceName: dto.deviceName,
      description: dto.description,
    };
    return this.deviceService.updateDevice(deviceId, limitedDto, req.user?.userId || req.user?.sub);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  ENABLE / DISABLE (institute admin can toggle their own devices)
  // ═══════════════════════════════════════════════════════════════════════

  @Post(':deviceId/enable')
  @ApiOperation({ summary: 'Enable a device' })
  async enableDevice(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
    @Req() req: any,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    return this.deviceService.enableDevice(deviceId, req.user?.userId || req.user?.sub);
  }

  @Post(':deviceId/disable')
  @ApiOperation({ summary: 'Disable a device' })
  async disableDevice(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
    @Req() req: any,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    return this.deviceService.disableDevice(deviceId, req.user?.userId || req.user?.sub);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CONFIG (institute admin can only change status mode / operating hours)
  // ═══════════════════════════════════════════════════════════════════════

  @Get(':deviceId/config')
  @ApiOperation({ summary: 'Get device configuration' })
  async getConfig(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    return this.deviceService.getConfig(deviceId);
  }

  @Patch(':deviceId/config')
  @ApiOperation({ summary: 'Update device config (status mode, operating hours only)' })
  async updateConfig(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdateDeviceConfigDto,
    @Req() req: any,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    // Institute admin: pass isSystemAdmin=false so rate limits / sessions are ignored
    const limitedDto: UpdateDeviceConfigDto = {
      allowedStatusMode: dto.allowedStatusMode,
      allowedStatusList: dto.allowedStatusList,
      autoStatus: dto.autoStatus,
      requireLocation: dto.requireLocation,
      requirePhoto: dto.requirePhoto,
      operatingStartTime: dto.operatingStartTime,
      operatingEndTime: dto.operatingEndTime,
    };
    return this.deviceService.updateConfig(deviceId, limitedDto, req.user?.userId || req.user?.sub, false);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  EVENT BINDING
  // ═══════════════════════════════════════════════════════════════════════

  @Post(':deviceId/bind-event')
  @ApiOperation({ summary: 'Bind device to an event (all marks go to this event)' })
  async bindEvent(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: BindDeviceEventDto,
    @Req() req: any,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    return this.deviceService.bindEvent(deviceId, dto, req.user?.userId || req.user?.sub);
  }

  @Post(':deviceId/unbind-event')
  @ApiOperation({ summary: 'Unbind device from current event' })
  async unbindEvent(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
    @Req() req: any,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    return this.deviceService.unbindEvent(deviceId, req.user?.userId || req.user?.sub);
  }

  @Get(':deviceId/active-binding')
  @ApiOperation({ summary: 'Get current active event binding' })
  async getActiveBinding(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    return this.deviceService.getActiveBinding(deviceId);
  }

  @Get(':deviceId/bindings')
  @ApiOperation({ summary: 'Get event binding history' })
  async getBindings(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    return this.deviceService.getBindingHistory(deviceId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SESSIONS
  // ═══════════════════════════════════════════════════════════════════════

  @Post(':deviceId/sessions/start')
  @ApiOperation({ summary: 'Start a new session on the device' })
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async startSession(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
    @Body() dto: StartDeviceSessionDto,
    @Req() req: any,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    return this.deviceService.startSession(dto);
  }

  @Post(':deviceId/sessions/:sessionToken/end')
  @ApiOperation({ summary: 'End an active session' })
  async endSession(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
    @Param('sessionToken') sessionToken: string,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    return this.deviceService.endSession(sessionToken);
  }

  @Get(':deviceId/sessions')
  @ApiOperation({ summary: 'List active sessions' })
  async getSessions(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    return this.deviceService.getActiveSessions(deviceId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HEARTBEAT (called from device itself)
  // ═══════════════════════════════════════════════════════════════════════

  @Post('heartbeat')
  @ApiOperation({ summary: 'Device heartbeat ping' })
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async heartbeat(@Body() dto: DeviceHeartbeatDto) {
    return this.deviceService.heartbeat(dto);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  AUDIT
  // ═══════════════════════════════════════════════════════════════════════

  @Get(':deviceId/audit')
  @ApiOperation({ summary: 'Get audit log for a device' })
  async getAuditLog(
    @Param('instituteId') instituteId: string,
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: number,
  ) {
    await this.ensureDeviceBelongsToInstitute(deviceId, instituteId);
    return this.deviceService.getAuditLog(deviceId, limit ?? 50);
  }

  // ─── Helper ──────────────────────────────────────────────────────────

  private async ensureDeviceBelongsToInstitute(deviceId: string, instituteId: string): Promise<void> {
    const device = await this.deviceService.getDeviceById(deviceId);
    if (device.instituteId !== instituteId) {
      throw new ForbiddenException('Device does not belong to this institute');
    }
  }
}
