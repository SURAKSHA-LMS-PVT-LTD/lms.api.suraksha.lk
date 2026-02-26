import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, Req,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { AttendanceDeviceService } from '../services/attendance-device.service';
import {
  CreateDeviceDto, UpdateDeviceDto, AssignDeviceDto,
  UpdateDeviceConfigDto, BindDeviceEventDto, DeviceQueryDto,
} from '../dto/device.dto';

@ApiTags('System Admin - Attendance Devices')
@ApiBearerAuth()
@Controller('api/admin/attendance-devices')
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
export class SystemAdminDeviceController {
  constructor(private readonly deviceService: AttendanceDeviceService) {}

  // ═══════════════════════════════════════════════════════════════════════
  //  DEVICE CRUD
  // ═══════════════════════════════════════════════════════════════════════

  @Post()
  @ApiOperation({ summary: 'Register a new device' })
  @ApiResponse({ status: 201, description: 'Device created' })
  async createDevice(@Body() dto: CreateDeviceDto, @Req() req: any) {
    return this.deviceService.createDevice(dto, req.user?.userId || req.user?.sub);
  }

  @Patch(':deviceId')
  @ApiOperation({ summary: 'Update device details' })
  @ApiParam({ name: 'deviceId', description: 'Device ID' })
  async updateDevice(
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdateDeviceDto,
    @Req() req: any,
  ) {
    return this.deviceService.updateDevice(deviceId, dto, req.user?.userId || req.user?.sub);
  }

  @Delete(':deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a device permanently' })
  @ApiParam({ name: 'deviceId', description: 'Device ID' })
  async deleteDevice(@Param('deviceId') deviceId: string, @Req() req: any) {
    return this.deviceService.deleteDevice(deviceId, req.user?.userId || req.user?.sub);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  ASSIGN / UNASSIGN
  // ═══════════════════════════════════════════════════════════════════════

  @Post(':deviceId/assign')
  @ApiOperation({ summary: 'Assign device to an institute' })
  @ApiParam({ name: 'deviceId', description: 'Device ID' })
  async assignDevice(
    @Param('deviceId') deviceId: string,
    @Body() dto: AssignDeviceDto,
    @Req() req: any,
  ) {
    return this.deviceService.assignToInstitute(deviceId, dto, req.user?.userId || req.user?.sub);
  }

  @Post(':deviceId/unassign')
  @ApiOperation({ summary: 'Unassign device from its institute' })
  @ApiParam({ name: 'deviceId', description: 'Device ID' })
  async unassignDevice(@Param('deviceId') deviceId: string, @Req() req: any) {
    return this.deviceService.unassignFromInstitute(deviceId, req.user?.userId || req.user?.sub);
  }

  @Post(':deviceId/change-institute')
  @ApiOperation({ summary: 'Change institute assignment (shortcut for reassign)' })
  @ApiParam({ name: 'deviceId', description: 'Device ID' })
  async changeInstitute(
    @Param('deviceId') deviceId: string,
    @Body() dto: AssignDeviceDto,
    @Req() req: any,
  ) {
    return this.deviceService.changeInstituteId(
      deviceId, dto.instituteId, dto.instituteName || null, req.user?.userId || req.user?.sub,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  ENABLE / DISABLE / BLOCK
  // ═══════════════════════════════════════════════════════════════════════

  @Post(':deviceId/enable')
  @ApiOperation({ summary: 'Enable a device' })
  async enableDevice(@Param('deviceId') deviceId: string, @Req() req: any) {
    return this.deviceService.enableDevice(deviceId, req.user?.userId || req.user?.sub);
  }

  @Post(':deviceId/disable')
  @ApiOperation({ summary: 'Disable a device' })
  async disableDevice(@Param('deviceId') deviceId: string, @Req() req: any) {
    return this.deviceService.disableDevice(deviceId, req.user?.userId || req.user?.sub);
  }

  @Post(':deviceId/block')
  @ApiOperation({ summary: 'Block a device (prevents all operations)' })
  async blockDevice(
    @Param('deviceId') deviceId: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.deviceService.blockDevice(deviceId, req.user?.userId || req.user?.sub, reason);
  }

  @Post(':deviceId/unblock')
  @ApiOperation({ summary: 'Unblock a device' })
  async unblockDevice(@Param('deviceId') deviceId: string, @Req() req: any) {
    return this.deviceService.unblockDevice(deviceId, req.user?.userId || req.user?.sub);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CONFIG (System admin can change ALL config fields)
  // ═══════════════════════════════════════════════════════════════════════

  @Get(':deviceId/config')
  @ApiOperation({ summary: 'Get device configuration' })
  async getConfig(@Param('deviceId') deviceId: string) {
    return this.deviceService.getConfig(deviceId);
  }

  @Patch(':deviceId/config')
  @ApiOperation({ summary: 'Update device configuration (all fields)' })
  async updateConfig(
    @Param('deviceId') deviceId: string,
    @Body() dto: UpdateDeviceConfigDto,
    @Req() req: any,
  ) {
    return this.deviceService.updateConfig(deviceId, dto, req.user?.userId || req.user?.sub, true);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  EVENT BINDING
  // ═══════════════════════════════════════════════════════════════════════

  @Post(':deviceId/bind-event')
  @ApiOperation({ summary: 'Bind device to an event (deactivates previous binding)' })
  async bindEvent(
    @Param('deviceId') deviceId: string,
    @Body() dto: BindDeviceEventDto,
    @Req() req: any,
  ) {
    return this.deviceService.bindEvent(deviceId, dto, req.user?.userId || req.user?.sub);
  }

  @Post(':deviceId/unbind-event')
  @ApiOperation({ summary: 'Unbind device from current event' })
  async unbindEvent(@Param('deviceId') deviceId: string, @Req() req: any) {
    return this.deviceService.unbindEvent(deviceId, req.user?.userId || req.user?.sub);
  }

  @Get(':deviceId/bindings')
  @ApiOperation({ summary: 'Get binding history for a device' })
  async getBindings(@Param('deviceId') deviceId: string) {
    return this.deviceService.getBindingHistory(deviceId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  QUERY / LISTING
  // ═══════════════════════════════════════════════════════════════════════

  @Get()
  @ApiOperation({ summary: 'List all devices (all institutes)' })
  async listDevices(@Query() query: DeviceQueryDto) {
    return this.deviceService.listDevices(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get system-wide device statistics' })
  async getStats() {
    return this.deviceService.getSystemStats();
  }

  @Get(':deviceId')
  @ApiOperation({ summary: 'Get device with config, binding, sessions' })
  async getDevice(@Param('deviceId') deviceId: string) {
    return this.deviceService.getDeviceWithConfig(deviceId);
  }

  @Get(':deviceId/audit')
  @ApiOperation({ summary: 'Get audit log for a device' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of log entries (default 50)' })
  async getAuditLog(
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: number,
  ) {
    return this.deviceService.getAuditLog(deviceId, limit ?? 50);
  }

  @Get(':deviceId/sessions')
  @ApiOperation({ summary: 'Get active sessions for a device' })
  async getSessions(@Param('deviceId') deviceId: string) {
    return this.deviceService.getActiveSessions(deviceId);
  }
}
