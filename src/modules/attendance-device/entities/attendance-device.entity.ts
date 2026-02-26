import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index, OneToOne, OneToMany,
} from 'typeorm';
import { DeviceType, DeviceStatus } from '../enums/device.enums';

@Entity('attendance_devices')
@Index('IDX_DEVICE_UID', ['deviceUid'], { unique: true })
@Index('IDX_DEVICE_INSTITUTE', ['instituteId'])
@Index('IDX_DEVICE_STATUS', ['status'])
@Index('IDX_DEVICE_ENABLED', ['isEnabled'])
export class AttendanceDeviceEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  /** Hardware/software unique identifier (e.g. Android device ID, serial number) */
  @Column({ name: 'device_uid', type: 'varchar', length: 128, unique: true })
  deviceUid: string;

  /** Human-readable name: "Front Gate Tablet", "Room 201 RFID" */
  @Column({ name: 'device_name', type: 'varchar', length: 255 })
  deviceName: string;

  @Column({ name: 'device_type', type: 'enum', enum: DeviceType, default: DeviceType.TABLET })
  deviceType: DeviceType;

  /** Assigned institute (nullable = unassigned/pool device) */
  @Column({ name: 'institute_id', type: 'varchar', length: 36, nullable: true })
  instituteId: string | null;

  @Column({ name: 'institute_name', type: 'varchar', length: 255, nullable: true })
  instituteName: string | null;

  @Column({ name: 'is_enabled', type: 'tinyint', width: 1, default: 1 })
  isEnabled: number;

  @Column({ name: 'status', type: 'enum', enum: DeviceStatus, default: DeviceStatus.ACTIVE })
  status: DeviceStatus;

  /** Who assigned this device to the institute */
  @Column({ name: 'assigned_by', type: 'varchar', length: 36, nullable: true })
  assignedBy: string | null;

  @Column({ name: 'assigned_at', type: 'timestamp', nullable: true })
  assignedAt: Date | null;

  /** Last health check-in from the device */
  @Column({ name: 'last_heartbeat_at', type: 'timestamp', nullable: true })
  lastHeartbeatAt: Date | null;

  /** Last attendance mark made via this device */
  @Column({ name: 'last_activity_at', type: 'timestamp', nullable: true })
  lastActivityAt: Date | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'firmware_version', type: 'varchar', length: 64, nullable: true })
  firmwareVersion: string | null;

  /** Free-form JSON for extra device metadata */
  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
