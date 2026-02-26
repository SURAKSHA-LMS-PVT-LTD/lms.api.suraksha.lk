import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  Index,
} from 'typeorm';
import { EventBindingStatus } from '../enums/device.enums';

/**
 * Binds a device → calendar event so that ALL attendance marked
 * from this device is automatically tagged to that event.
 *
 * Only ONE active binding per device at a time.
 *
 * Use case:
 *   Institute admin ties "Front Gate RFID" to "Parents Meeting (event #42)".
 *   Every card swipe on that reader → attendanceRecord.eventId = 42.
 *   When event ends, admin unbinds (or binds next event).
 */
@Entity('attendance_device_event_bindings')
@Index('IDX_BINDING_DEVICE', ['deviceId'])
@Index('IDX_BINDING_ACTIVE', ['deviceId', 'isActive'])
@Index('IDX_BINDING_EVENT', ['eventId'])
export class AttendanceDeviceEventBindingEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'device_id', type: 'bigint' })
  deviceId: string;

  /** Calendar event ID (FK → institute_calendar_events.id) */
  @Column({ name: 'event_id', type: 'int', nullable: true })
  eventId: number | null;

  /** Denormalised for display — avoids extra JOIN on read */
  @Column({ name: 'event_name', type: 'varchar', length: 255, nullable: true })
  eventName: string | null;

  @Column({ name: 'calendar_day_id', type: 'int', nullable: true })
  calendarDayId: number | null;

  /** Who created this binding */
  @Column({ name: 'bound_by', type: 'varchar', length: 36 })
  boundBy: string;

  @Column({ name: 'is_active', type: 'tinyint', width: 1, default: 1 })
  isActive: number;

  @Column({ name: 'status', type: 'enum', enum: EventBindingStatus, default: EventBindingStatus.ACTIVE })
  status: EventBindingStatus;

  /** Attendance status override — if set, device marks ONLY this status for the bound event */
  @Column({ name: 'status_override', type: 'varchar', length: 32, nullable: true })
  statusOverride: string | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'bound_at' })
  boundAt: Date;

  /** When the binding was deactivated */
  @Column({ name: 'unbound_at', type: 'timestamp', nullable: true })
  unboundAt: Date | null;
}
