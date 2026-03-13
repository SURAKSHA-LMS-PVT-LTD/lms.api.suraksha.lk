import {
  Injectable, Logger, NotFoundException, BadRequestException,
  ForbiddenException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere, DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AttendanceDeviceEntity } from '../entities/attendance-device.entity';
import { AttendanceDeviceConfigEntity } from '../entities/attendance-device-config.entity';
import { AttendanceDeviceEventBindingEntity } from '../entities/attendance-device-event-binding.entity';
import { AttendanceDeviceSessionEntity } from '../entities/attendance-device-session.entity';
import { AttendanceDeviceAuditLogEntity } from '../entities/attendance-device-audit-log.entity';
import {
  DeviceStatus, AllowedStatusMode, DeviceAuditAction, EventBindingStatus,
} from '../enums/device.enums';
import {
  CreateDeviceDto, UpdateDeviceDto, AssignDeviceDto,
  UpdateDeviceConfigDto, BindDeviceEventDto, DeviceQueryDto,
  DeviceHeartbeatDto, StartDeviceSessionDto,
} from '../dto/device.dto';

@Injectable()
export class AttendanceDeviceService {
  private readonly logger = new Logger(AttendanceDeviceService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(AttendanceDeviceEntity)
    private readonly deviceRepo: Repository<AttendanceDeviceEntity>,
    @InjectRepository(AttendanceDeviceConfigEntity)
    private readonly configRepo: Repository<AttendanceDeviceConfigEntity>,
    @InjectRepository(AttendanceDeviceEventBindingEntity)
    private readonly bindingRepo: Repository<AttendanceDeviceEventBindingEntity>,
    @InjectRepository(AttendanceDeviceSessionEntity)
    private readonly sessionRepo: Repository<AttendanceDeviceSessionEntity>,
    @InjectRepository(AttendanceDeviceAuditLogEntity)
    private readonly auditRepo: Repository<AttendanceDeviceAuditLogEntity>,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  //  DEVICE CRUD (System Admin)
  // ═══════════════════════════════════════════════════════════════════════════

  async createDevice(dto: CreateDeviceDto, performedBy: string): Promise<AttendanceDeviceEntity> {
    // Check uniqueness
    const existing = await this.deviceRepo.findOne({ where: { deviceUid: dto.deviceUid } });
    if (existing) {
      throw new ConflictException(`Device UID "${dto.deviceUid}" already registered`);
    }

    const device = this.deviceRepo.create({
      deviceUid: dto.deviceUid,
      deviceName: dto.deviceName,
      deviceType: dto.deviceType,
      instituteId: dto.instituteId || null,
      instituteName: dto.instituteName || null,
      description: dto.description || null,
      metadata: dto.metadata || null,
      assignedBy: dto.instituteId ? performedBy : null,
      assignedAt: dto.instituteId ? new Date() : null,
    });

    const saved = await this.deviceRepo.save(device);

    // Auto-create default config for the device
    const config = this.configRepo.create({ deviceId: saved.id });
    await this.configRepo.save(config);

    await this.audit(saved.id, DeviceAuditAction.CREATED, performedBy, { dto });
    return saved;
  }

  async updateDevice(
    deviceId: string,
    dto: UpdateDeviceDto,
    performedBy: string,
  ): Promise<AttendanceDeviceEntity> {
    const device = await this.getDeviceOrFail(deviceId);
    const before = { ...device };

    if (dto.deviceName !== undefined) device.deviceName = dto.deviceName;
    if (dto.deviceType !== undefined) device.deviceType = dto.deviceType;
    if (dto.description !== undefined) device.description = dto.description;
    if (dto.metadata !== undefined) device.metadata = dto.metadata;
    if (dto.firmwareVersion !== undefined) device.firmwareVersion = dto.firmwareVersion;

    const saved = await this.deviceRepo.save(device);
    await this.audit(deviceId, DeviceAuditAction.CONFIG_CHANGED, performedBy, { before, after: dto });
    return saved;
  }

  async deleteDevice(deviceId: string, performedBy: string): Promise<void> {
    const device = await this.getDeviceOrFail(deviceId);
    await this.audit(deviceId, DeviceAuditAction.DELETED, performedBy, { deviceUid: device.deviceUid });
    // Cascade cleanup
    await this.sessionRepo.delete({ deviceId });
    await this.bindingRepo.delete({ deviceId });
    await this.configRepo.delete({ deviceId });
    await this.deviceRepo.remove(device);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ASSIGN / UNASSIGN DEVICE (System Admin)
  // ═══════════════════════════════════════════════════════════════════════════

  async assignToInstitute(
    deviceId: string, dto: AssignDeviceDto, performedBy: string,
  ): Promise<AttendanceDeviceEntity> {
    const device = await this.getDeviceOrFail(deviceId);
    const prevInstitute = device.instituteId;

    device.instituteId = dto.instituteId;
    device.instituteName = dto.instituteName || null;
    device.assignedBy = performedBy;
    device.assignedAt = new Date();

    const saved = await this.deviceRepo.save(device);
    await this.audit(deviceId, DeviceAuditAction.ASSIGNED, performedBy, {
      previousInstituteId: prevInstitute,
      newInstituteId: dto.instituteId,
    });
    return saved;
  }

  async unassignFromInstitute(deviceId: string, performedBy: string): Promise<AttendanceDeviceEntity> {
    const device = await this.getDeviceOrFail(deviceId);
    const prevInstitute = device.instituteId;

    device.instituteId = null;
    device.instituteName = null;
    device.assignedBy = null;
    device.assignedAt = null;

    // Also deactivate any active event bindings
    await this.bindingRepo.update(
      { deviceId, isActive: 1 },
      { isActive: 0, status: EventBindingStatus.INACTIVE, unboundAt: new Date() },
    );

    const saved = await this.deviceRepo.save(device);
    await this.audit(deviceId, DeviceAuditAction.UNASSIGNED, performedBy, { previousInstituteId: prevInstitute });
    return saved;
  }

  async changeInstituteId(
    deviceId: string, newInstituteId: string, newInstituteName: string | null,
    performedBy: string,
  ): Promise<AttendanceDeviceEntity> {
    return this.assignToInstitute(deviceId, { instituteId: newInstituteId, instituteName: newInstituteName }, performedBy);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ENABLE / DISABLE / BLOCK
  // ═══════════════════════════════════════════════════════════════════════════

  async enableDevice(deviceId: string, performedBy: string): Promise<AttendanceDeviceEntity> {
    const device = await this.getDeviceOrFail(deviceId);
    device.isEnabled = 1;
    device.status = DeviceStatus.ACTIVE;
    const saved = await this.deviceRepo.save(device);
    await this.audit(deviceId, DeviceAuditAction.ENABLED, performedBy);
    return saved;
  }

  async disableDevice(deviceId: string, performedBy: string): Promise<AttendanceDeviceEntity> {
    const device = await this.getDeviceOrFail(deviceId);
    device.isEnabled = 0;
    device.status = DeviceStatus.INACTIVE;
    const saved = await this.deviceRepo.save(device);
    await this.audit(deviceId, DeviceAuditAction.DISABLED, performedBy);
    return saved;
  }

  async blockDevice(deviceId: string, performedBy: string, reason?: string): Promise<AttendanceDeviceEntity> {
    const device = await this.getDeviceOrFail(deviceId);
    device.isEnabled = 0;
    device.status = DeviceStatus.BLOCKED;
    const saved = await this.deviceRepo.save(device);
    await this.audit(deviceId, DeviceAuditAction.BLOCKED, performedBy, { reason });
    return saved;
  }

  async unblockDevice(deviceId: string, performedBy: string): Promise<AttendanceDeviceEntity> {
    const device = await this.getDeviceOrFail(deviceId);
    device.isEnabled = 1;
    device.status = DeviceStatus.ACTIVE;
    const saved = await this.deviceRepo.save(device);
    await this.audit(deviceId, DeviceAuditAction.UNBLOCKED, performedBy);
    return saved;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DEVICE CONFIG
  // ═══════════════════════════════════════════════════════════════════════════

  async getConfig(deviceId: string): Promise<AttendanceDeviceConfigEntity> {
    const config = await this.configRepo.findOne({ where: { deviceId } });
    if (!config) throw new NotFoundException('Device config not found');
    return config;
  }

  async updateConfig(
    deviceId: string,
    dto: UpdateDeviceConfigDto,
    performedBy: string,
    isSystemAdmin: boolean,
  ): Promise<AttendanceDeviceConfigEntity> {
    await this.getDeviceOrFail(deviceId); // ensure device exists
    let config = await this.configRepo.findOne({ where: { deviceId } });
    if (!config) {
      config = this.configRepo.create({ deviceId });
    }

    const before = { ...config };

    // Fields ANY admin can change
    if (dto.allowedStatusMode !== undefined) config.allowedStatusMode = dto.allowedStatusMode;
    if (dto.allowedStatusList !== undefined) config.allowedStatusList = dto.allowedStatusList;
    if (dto.autoStatus !== undefined) config.autoStatus = dto.autoStatus;
    if (dto.requireLocation !== undefined) config.requireLocation = dto.requireLocation;
    if (dto.requirePhoto !== undefined) config.requirePhoto = dto.requirePhoto;
    if (dto.operatingStartTime !== undefined) config.operatingStartTime = dto.operatingStartTime;
    if (dto.operatingEndTime !== undefined) config.operatingEndTime = dto.operatingEndTime;

    // Fields ONLY system admin can change
    if (isSystemAdmin) {
      if (dto.maxSessions !== undefined) config.maxSessions = dto.maxSessions;
      if (dto.rateLimitPerMinute !== undefined) config.rateLimitPerMinute = dto.rateLimitPerMinute;
      if (dto.rateLimitPerHour !== undefined) config.rateLimitPerHour = dto.rateLimitPerHour;
      if (dto.allowedIpRanges !== undefined) config.allowedIpRanges = dto.allowedIpRanges;
    }

    // Validate: ONLY mode must have at least one status in the list
    if (config.allowedStatusMode === AllowedStatusMode.ONLY) {
      if (!config.allowedStatusList || config.allowedStatusList.length === 0) {
        throw new BadRequestException(
          'allowedStatusList must contain at least one status when mode is ONLY',
        );
      }
    }

    const saved = await this.configRepo.save(config);
    await this.audit(deviceId, DeviceAuditAction.CONFIG_CHANGED, performedBy, { before, after: dto });
    return saved;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  EVENT BINDING
  // ═══════════════════════════════════════════════════════════════════════════

  async bindEvent(
    deviceId: string, dto: BindDeviceEventDto, performedBy: string,
  ): Promise<AttendanceDeviceEventBindingEntity> {
    await this.getDeviceOrFail(deviceId);

    // Deactivate any existing active binding for this device
    await this.bindingRepo.update(
      { deviceId, isActive: 1 },
      { isActive: 0, status: EventBindingStatus.INACTIVE, unboundAt: new Date() },
    );

    const binding = this.bindingRepo.create({
      deviceId,
      eventId: dto.eventId,
      eventName: dto.eventName || null,
      calendarDayId: dto.calendarDayId || null,
      statusOverride: dto.statusOverride || null,
      boundBy: performedBy,
      notes: dto.notes || null,
    });

    const saved = await this.bindingRepo.save(binding);
    await this.audit(deviceId, DeviceAuditAction.EVENT_BOUND, performedBy, {
      eventId: dto.eventId,
      eventName: dto.eventName,
      statusOverride: dto.statusOverride,
    });
    return saved;
  }

  async unbindEvent(deviceId: string, performedBy: string): Promise<void> {
    const active = await this.bindingRepo.findOne({ where: { deviceId, isActive: 1 } });
    if (!active) throw new NotFoundException('No active event binding for this device');

    active.isActive = 0;
    active.status = EventBindingStatus.INACTIVE;
    active.unboundAt = new Date();
    await this.bindingRepo.save(active);
    await this.audit(deviceId, DeviceAuditAction.EVENT_UNBOUND, performedBy, { eventId: active.eventId });
  }

  async getActiveBinding(deviceId: string): Promise<AttendanceDeviceEventBindingEntity | null> {
    return this.bindingRepo.findOne({ where: { deviceId, isActive: 1 } });
  }

  async getBindingHistory(deviceId: string): Promise<AttendanceDeviceEventBindingEntity[]> {
    return this.bindingRepo.find({
      where: { deviceId },
      order: { boundAt: 'DESC' },
      take: 50,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  async startSession(dto: StartDeviceSessionDto): Promise<AttendanceDeviceSessionEntity> {
    const device = await this.deviceRepo.findOne({ where: { deviceUid: dto.deviceUid } });
    if (!device) throw new NotFoundException(`Device not found: ${dto.deviceUid}`);
    if (!device.isEnabled || device.status === DeviceStatus.BLOCKED) {
      throw new ForbiddenException('Device is disabled or blocked');
    }

    const config = await this.configRepo.findOne({ where: { deviceId: device.id } });
    const maxSessions = config?.maxSessions ?? 1;

    // Count active sessions
    const activeCount = await this.sessionRepo.count({ where: { deviceId: device.id, isActive: 1 } });
    if (activeCount >= maxSessions) {
      throw new BadRequestException(
        `Max sessions (${maxSessions}) reached for this device. End an existing session first.`,
      );
    }

    const session = this.sessionRepo.create({
      deviceId: device.id,
      sessionToken: uuidv4(),
      userId: dto.userId || null,
      ipAddress: dto.ipAddress || null,
      userAgent: dto.userAgent || null,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h default
    });

    const saved = await this.sessionRepo.save(session);

    // Update heartbeat
    device.lastHeartbeatAt = new Date();
    device.ipAddress = dto.ipAddress || device.ipAddress;
    await this.deviceRepo.save(device);

    await this.audit(device.id, DeviceAuditAction.SESSION_STARTED, dto.userId || 'device', {
      sessionToken: saved.sessionToken,
    });

    return saved;
  }

  async endSession(sessionToken: string): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { sessionToken } });
    if (!session) throw new NotFoundException('Session not found');

    session.isActive = 0;
    session.endedAt = new Date();
    await this.sessionRepo.save(session);

    await this.audit(session.deviceId, DeviceAuditAction.SESSION_ENDED, session.userId || 'device', {
      sessionToken, marksCount: session.marksCount,
    });
  }

  async getActiveSessions(deviceId: string): Promise<AttendanceDeviceSessionEntity[]> {
    return this.sessionRepo.find({ where: { deviceId, isActive: 1 } });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DEVICE HEARTBEAT
  // ═══════════════════════════════════════════════════════════════════════════

  async heartbeat(dto: DeviceHeartbeatDto): Promise<{ status: string; isEnabled: boolean }> {
    const device = await this.deviceRepo.findOne({ where: { deviceUid: dto.deviceUid } });
    if (!device) throw new NotFoundException(`Device not found: ${dto.deviceUid}`);

    device.lastHeartbeatAt = new Date();
    if (dto.ipAddress) device.ipAddress = dto.ipAddress;
    if (dto.firmwareVersion) device.firmwareVersion = dto.firmwareVersion;
    await this.deviceRepo.save(device);

    return { status: device.status, isEnabled: !!device.isEnabled };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  QUERY / LIST
  // ═══════════════════════════════════════════════════════════════════════════

  async listDevices(query: DeviceQueryDto): Promise<{
    data: AttendanceDeviceEntity[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: FindOptionsWhere<AttendanceDeviceEntity> = {};

    if (query.instituteId) where.instituteId = query.instituteId;
    if (query.status) where.status = query.status;
    if (query.deviceType) where.deviceType = query.deviceType;
    if (query.isEnabled !== undefined) where.isEnabled = query.isEnabled ? 1 : 0;
    if (query.search) where.deviceName = Like(`%${query.search}%`);

    const [data, total] = await this.deviceRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getDeviceById(deviceId: string): Promise<AttendanceDeviceEntity> {
    return this.getDeviceOrFail(deviceId);
  }

  async getDeviceByUid(deviceUid: string): Promise<AttendanceDeviceEntity> {
    const device = await this.deviceRepo.findOne({ where: { deviceUid } });
    if (!device) throw new NotFoundException(`Device not found: ${deviceUid}`);
    return device;
  }

  async getDeviceWithConfig(deviceId: string): Promise<{
    device: AttendanceDeviceEntity;
    config: AttendanceDeviceConfigEntity | null;
    activeBinding: AttendanceDeviceEventBindingEntity | null;
    activeSessions: number;
  }> {
    const device = await this.getDeviceOrFail(deviceId);
    const [config, activeBinding, activeSessions] = await Promise.all([
      this.configRepo.findOne({ where: { deviceId } }),
      this.bindingRepo.findOne({ where: { deviceId, isActive: 1 } }),
      this.sessionRepo.count({ where: { deviceId, isActive: 1 } }),
    ]);
    return { device, config, activeBinding, activeSessions };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ATTENDANCE MARKING VALIDATION (called from attendance.service)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validates whether a device is allowed to mark attendance and returns
   * overrides (eventId, status) from bindings/config.
   *
   * Call this from the attendance marking flow if a `deviceUid` is supplied.
   */
  async validateDeviceForMarking(deviceUid: string): Promise<{
    allowed: boolean;
    deviceId: string;
    instituteId: string | null;
    eventId: number | null;
    statusOverride: string | null;
    error?: string;
  }> {
    const device = await this.deviceRepo.findOne({ where: { deviceUid } });
    if (!device) return { allowed: false, deviceId: '', instituteId: null, eventId: null, statusOverride: null, error: 'Device not registered' };

    if (!device.isEnabled || device.status === DeviceStatus.BLOCKED || device.status === DeviceStatus.INACTIVE) {
      return { allowed: false, deviceId: device.id, instituteId: device.instituteId, eventId: null, statusOverride: null, error: `Device is ${device.status}` };
    }

    const config = await this.configRepo.findOne({ where: { deviceId: device.id } });
    if (config?.allowedStatusMode === AllowedStatusMode.BLOCKED) {
      return { allowed: false, deviceId: device.id, instituteId: device.instituteId, eventId: null, statusOverride: null, error: 'Device is blocked from marking attendance' };
    }

    // Check operating hours
    if (config?.operatingStartTime && config?.operatingEndTime) {
      // Get current time string in HH:MM format for Sri Lanka — single step, no re-parse
      const currentTime = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit' });
      if (currentTime < config.operatingStartTime || currentTime > config.operatingEndTime) {
        return { allowed: false, deviceId: device.id, instituteId: device.instituteId, eventId: null, statusOverride: null, error: `Device only operates ${config.operatingStartTime}–${config.operatingEndTime}` };
      }
    }

    // Get active event binding
    const binding = await this.bindingRepo.findOne({ where: { deviceId: device.id, isActive: 1 } });

    // Update activity
    device.lastActivityAt = new Date();
    await this.deviceRepo.save(device);

    return {
      allowed: true,
      deviceId: device.id,
      instituteId: device.instituteId,
      eventId: binding?.eventId ?? null,
      statusOverride: binding?.statusOverride ?? config?.autoStatus ?? null,
    };
  }

  /**
   * Check if a given attendance status is allowed by this device's config.
   */
  async isStatusAllowed(deviceId: string, status: string): Promise<boolean> {
    const config = await this.configRepo.findOne({ where: { deviceId } });
    if (!config) return true; // No config = no restrictions

    switch (config.allowedStatusMode) {
      case AllowedStatusMode.ANY:
        return true;
      case AllowedStatusMode.BLOCKED:
        return false;
      case AllowedStatusMode.ONLY:
        return (config.allowedStatusList ?? []).includes(status.toLowerCase());
      default:
        return true;
    }
  }

  /**
   * Increment session mark count (called after successful attendance mark).
   */
  async incrementSessionMarks(sessionToken: string): Promise<void> {
    await this.sessionRepo.increment({ sessionToken, isActive: 1 }, 'marksCount', 1);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  AUDIT LOG
  // ═══════════════════════════════════════════════════════════════════════════

  async getAuditLog(deviceId: string, limit = 50): Promise<AttendanceDeviceAuditLogEntity[]> {
    return this.auditRepo.find({
      where: { deviceId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DASHBOARD / STATS (System Admin)
  // ═══════════════════════════════════════════════════════════════════════════

  async getSystemStats(): Promise<{
    totalDevices: number;
    activeDevices: number;
    blockedDevices: number;
    unassignedDevices: number;
    totalActiveSessions: number;
    devicesByType: Record<string, number>;
  }> {
    const [total, active, blocked, unassigned, sessions] = await Promise.all([
      this.deviceRepo.count(),
      this.deviceRepo.count({ where: { status: DeviceStatus.ACTIVE, isEnabled: 1 } }),
      this.deviceRepo.count({ where: { status: DeviceStatus.BLOCKED } }),
      this.deviceRepo.count({ where: { instituteId: null as any } }),
      this.sessionRepo.count({ where: { isActive: 1 } }),
    ]);

    // Group by type
    const typeResult = await this.dataSource.query(
      `SELECT device_type, COUNT(*) as cnt FROM attendance_devices GROUP BY device_type`,
    );
    const devicesByType: Record<string, number> = {};
    for (const row of typeResult) {
      devicesByType[row.device_type] = Number(row.cnt);
    }

    return { totalDevices: total, activeDevices: active, blockedDevices: blocked, unassignedDevices: unassigned, totalActiveSessions: sessions, devicesByType };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async getDeviceOrFail(deviceId: string): Promise<AttendanceDeviceEntity> {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId } });
    if (!device) throw new NotFoundException(`Device not found: ${deviceId}`);
    return device;
  }

  private async audit(
    deviceId: string, action: DeviceAuditAction, performedBy: string,
    details?: Record<string, any>, ipAddress?: string,
  ): Promise<void> {
    try {
      const log = this.auditRepo.create({ deviceId, action, performedBy, details: details || null, ipAddress: ipAddress || null });
      await this.auditRepo.save(log);
    } catch (err) {
      this.logger.warn(`Audit log write failed: ${err.message}`);
    }
  }
}
