import { Entity, PrimaryGeneratedColumn, Column, Index, Unique } from 'typeorm';

/**
 * Notification Read Entity
 * Simple tracking for which notifications a user has read
 * Lightweight - no relations, just IDs for fast queries
 */
@Entity('notification_reads')
@Unique('idx_notification_reads_unique', ['userId', 'notificationId'])
@Index('idx_notification_reads_user', ['userId'])
export class NotificationReadEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'notification_id', type: 'bigint' })
  notificationId: string;

  @Column({ name: 'read_at', type: 'timestamp' })
  readAt: Date;
}
