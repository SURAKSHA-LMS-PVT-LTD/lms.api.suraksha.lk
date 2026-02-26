import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Tracks active sessions on a device.
 * Enforces max_sessions from config.
 */
@Entity('attendance_device_sessions')
@Index('IDX_SESSION_DEVICE', ['deviceId'])
@Index('IDX_SESSION_TOKEN', ['sessionToken'], { unique: true })
@Index('IDX_SESSION_ACTIVE', ['deviceId', 'isActive'])
export class AttendanceDeviceSessionEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'device_id', type: 'bigint' })
  deviceId: string;

  @Column({ name: 'session_token', type: 'varchar', length: 128, unique: true })
  sessionToken: string;

  /** User who started the session (e.g. institute admin logged in on device) */
  @Column({ name: 'user_id', type: 'varchar', length: 36, nullable: true })
  userId: string | null;

  @Column({ name: 'is_active', type: 'tinyint', width: 1, default: 1 })
  isActive: number;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  /** Attendance marks counted in this session */
  @Column({ name: 'marks_count', type: 'int', default: 0 })
  marksCount: number;

  @CreateDateColumn({ name: 'started_at' })
  startedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'ended_at', type: 'timestamp', nullable: true })
  endedAt: Date | null;
}
