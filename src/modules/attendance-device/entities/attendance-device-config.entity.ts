import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index,
} from 'typeorm';
import { AllowedStatusMode } from '../enums/device.enums';

/**
 * Per-device configuration — rate limits, session caps, allowed statuses.
 * Both system admin and institute admin can update (system admin can change all fields).
 */
@Entity('attendance_device_config')
@Index('UQ_DEVICE_CONFIG', ['deviceId'], { unique: true })
export class AttendanceDeviceConfigEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  /** FK → attendance_devices.id */
  @Column({ name: 'device_id', type: 'bigint', unique: true })
  deviceId: string;

  // ─── Session limits ─────────────────────────────────────────────────────────
  /** Maximum simultaneous sessions for this device (system admin only) */
  @Column({ name: 'max_sessions', type: 'int', default: 1 })
  maxSessions: number;

  // ─── Rate limits ────────────────────────────────────────────────────────────
  /** Max attendance marks per minute */
  @Column({ name: 'rate_limit_per_minute', type: 'int', default: 30 })
  rateLimitPerMinute: number;

  /** Max attendance marks per hour */
  @Column({ name: 'rate_limit_per_hour', type: 'int', default: 500 })
  rateLimitPerHour: number;

  // ─── Allowed statuses ───────────────────────────────────────────────────────
  /**
   * ANY     → device can mark any status
   * BLOCKED → device is blocked from marking
   * ONLY    → only statuses in allowedStatusList are permitted
   */
  @Column({ name: 'allowed_status_mode', type: 'enum', enum: AllowedStatusMode, default: AllowedStatusMode.ANY })
  allowedStatusMode: AllowedStatusMode;

  /**
   * JSON array of allowed status strings when mode = ONLY:
   * e.g. ["present","late"]
   */
  @Column({ name: 'allowed_status_list', type: 'json', nullable: true })
  allowedStatusList: string[] | null;

  /** If set, device always marks this status (overrides student selection) */
  @Column({ name: 'auto_status', type: 'varchar', length: 32, nullable: true })
  autoStatus: string | null;

  // ─── Additional constraints ────────────────────────────────────────────────
  @Column({ name: 'require_location', type: 'tinyint', width: 1, default: 0 })
  requireLocation: number;

  @Column({ name: 'require_photo', type: 'tinyint', width: 1, default: 0 })
  requirePhoto: number;

  /** IP whitelist — JSON array; null = no restriction */
  @Column({ name: 'allowed_ip_ranges', type: 'json', nullable: true })
  allowedIpRanges: string[] | null;

  /** Operating hours: start time (HH:mm) — null = 24/7 */
  @Column({ name: 'operating_start_time', type: 'varchar', length: 5, nullable: true })
  operatingStartTime: string | null;

  /** Operating hours: end time (HH:mm) */
  @Column({ name: 'operating_end_time', type: 'varchar', length: 5, nullable: true })
  operatingEndTime: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
