import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

/**
 * Delivery status for individual notification recipients
 */
export enum NotificationDeliveryStatus {
  /** Notification was targeted to this user and persisted */
  SENT = 'SENT',
  /** FCM confirmed delivery to the device */
  DELIVERED = 'DELIVERED',
  /** User opened / viewed the notification */
  READ = 'READ',
  /** FCM send failed (no token, expired token, etc.) */
  FAILED = 'FAILED',
}

/**
 * Notification Recipient Entity
 *
 * Tracks per-user delivery status for every push notification.
 * A row is created at **send time** for every targeted user,
 * meaning users who join the institute *after* the notification
 * was sent will never have a row and therefore never see it.
 *
 * Design choices for optimisation:
 *  - Composite unique index (notification_id, user_id) prevents duplicates
 *  - Covering index on (user_id, status, notification_id) for fast "my unread" queries
 *  - No FK relations — IDs only — to keep writes fast during bulk inserts
 *  - Batch INSERT IGNORE when recording recipients (idempotent)
 */
@Entity('notification_recipients')
@Unique('uq_notification_recipient', ['notificationId', 'userId'])
@Index('idx_nr_user_status', ['userId', 'status', 'notificationId'])
@Index('idx_nr_notification', ['notificationId'])
@Index('idx_nr_user_created', ['userId', 'createdAt'])
export class NotificationRecipientEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'notification_id', type: 'bigint' })
  notificationId: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: NotificationDeliveryStatus,
    default: NotificationDeliveryStatus.SENT,
  })
  status: NotificationDeliveryStatus;

  /** When the notification was targeted to this user (≈ send time) */
  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  /** Last status change (DELIVERED / READ) */
  @Column({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt?: Date;

  /** When the user opened the notification */
  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt?: Date;
}
