import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index,
} from 'typeorm';
import { DeviceAuditAction } from '../enums/device.enums';

/**
 * Immutable audit trail for every device management action.
 * Rows are INSERT-only — never edited.
 */
@Entity('attendance_device_audit_log')
@Index('IDX_AUDIT_DEVICE', ['deviceId'])
@Index('IDX_AUDIT_ACTION', ['action'])
@Index('IDX_AUDIT_USER', ['performedBy'])
@Index('IDX_AUDIT_CREATED', ['createdAt'])
export class AttendanceDeviceAuditLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'device_id', type: 'bigint' })
  deviceId: string;

  @Column({ name: 'action', type: 'enum', enum: DeviceAuditAction })
  action: DeviceAuditAction;

  @Column({ name: 'performed_by', type: 'varchar', length: 36 })
  performedBy: string;

  /** JSON blob with before/after values, extra context */
  @Column({ name: 'details', type: 'json', nullable: true })
  details: Record<string, any> | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
