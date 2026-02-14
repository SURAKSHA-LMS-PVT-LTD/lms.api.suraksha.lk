import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';
import { SubjectEntity } from '../../subject/entities/subject.entity';
import { UserEntity } from '../../user/entities/user.entity';

/**
 * Target user type for push notifications
 */
export enum NotificationTargetUserType {
  ALL = 'ALL',
  STUDENTS = 'STUDENTS',
  TEACHERS = 'TEACHERS',
  PARENTS = 'PARENTS',
  ATTENDANCE_MARKERS = 'ATTENDANCE_MARKERS',
  INSTITUTE_ADMINS = 'INSTITUTE_ADMINS',
  SYSTEM_ADMINS = 'SYSTEM_ADMINS',                         // Users with SUPERADMIN user type
  
  // Advanced filters for global notifications (based on user.user_type)
  USERS_WITHOUT_INSTITUTE = 'USERS_WITHOUT_INSTITUTE',     // Users not enrolled in any institute
  USERS_WITHOUT_PARENT = 'USERS_WITHOUT_PARENT',           // Users with USER_WITHOUT_PARENT type (cannot be assigned as parent)
  USERS_WITHOUT_STUDENT = 'USERS_WITHOUT_STUDENT',         // Users with USER_WITHOUT_STUDENT type (cannot play student role)
  VERIFIED_USERS_ONLY = 'VERIFIED_USERS_ONLY',             // Only email-verified users (isEmailVerified = true)
  UNVERIFIED_USERS_ONLY = 'UNVERIFIED_USERS_ONLY'          // Only unverified users (isEmailVerified = false)
}

/**
 * Notification scope/level
 */
export enum NotificationScope {
  GLOBAL = 'GLOBAL',           // System-wide (super admin only)
  INSTITUTE = 'INSTITUTE',      // Institute-wide
  CLASS = 'CLASS',              // Class-specific
  SUBJECT = 'SUBJECT'           // Subject-specific
}

/**
 * Notification priority
 */
export enum NotificationPriority {
  HIGH = 'HIGH',
  NORMAL = 'NORMAL',
  LOW = 'LOW'
}

/**
 * Notification status
 */
export enum NotificationStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

/**
 * Push Notification Entity
 * Stores all push notifications created by admins, teachers, or system
 */
@Entity('push_notifications')
@Index('idx_push_notifications_institute', ['instituteId', 'status'])
@Index('idx_push_notifications_scope', ['scope', 'status'])
@Index('idx_push_notifications_created', ['createdAt'])
@Index('idx_push_notifications_scheduled', ['scheduledAt', 'status'])
@Index('idx_push_notifications_sender', ['senderId'])
export class PushNotificationEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  // Notification content
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl?: string;

  @Column({ name: 'icon', type: 'varchar', length: 100, nullable: true })
  icon?: string;

  @Column({ name: 'action_url', type: 'varchar', length: 500, nullable: true, comment: 'Deep link or URL when notification is clicked' })
  actionUrl?: string;

  // Additional data payload for the notification
  @Column({ name: 'data_payload', type: 'json', nullable: true, comment: 'Additional data to send with the notification' })
  dataPayload?: Record<string, string>;

  // Notification scope and targeting
  @Column({ type: 'enum', enum: NotificationScope, default: NotificationScope.INSTITUTE })
  scope: NotificationScope;

  @Column({ name: 'target_user_types', type: 'json', comment: 'Array of target user types' })
  targetUserTypes: NotificationTargetUserType[];

  // Institute relation (null for global notifications)
  @Column({ name: 'institute_id', type: 'bigint', nullable: true })
  instituteId?: string;

  @ManyToOne(() => InstituteEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'institute_id' }])
  institute?: InstituteEntity;

  // Class relation (for class-scope notifications)
  @Column({ name: 'class_id', type: 'bigint', nullable: true })
  classId?: string;

  @ManyToOne(() => InstituteClassEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'class_id' }])
  class?: InstituteClassEntity;

  // Subject relation (for subject-scope notifications)
  @Column({ name: 'subject_id', type: 'bigint', nullable: true })
  subjectId?: string;

  @ManyToOne(() => SubjectEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'subject_id' }])
  subject?: SubjectEntity;

  // Notification settings
  @Column({ type: 'enum', enum: NotificationPriority, default: NotificationPriority.NORMAL })
  priority: NotificationPriority;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.DRAFT })
  status: NotificationStatus;

  @Column({ name: 'collapse_key', type: 'varchar', length: 100, nullable: true, comment: 'FCM collapse key for grouping' })
  collapseKey?: string;

  @Column({ name: 'time_to_live', type: 'int', default: 86400, comment: 'TTL in seconds (default 24 hours)' })
  timeToLive: number;

  // Scheduling
  @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true, comment: 'When to send the notification (null for immediate)' })
  scheduledAt?: Date;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt?: Date;

  // Sender information
  @Column({ name: 'sender_id', type: 'bigint', nullable: true })
  senderId?: string;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'sender_id' }])
  sender?: UserEntity;

  @Column({ name: 'sender_role', type: 'varchar', length: 50, comment: 'Role of sender when notification was created' })
  senderRole: string;

  // Statistics
  @Column({ name: 'total_recipients', type: 'int', default: 0 })
  totalRecipients: number;

  @Column({ name: 'sent_count', type: 'int', default: 0 })
  sentCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  @Column({ name: 'read_count', type: 'int', default: 0 })
  readCount: number;

  // Timestamps
  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
