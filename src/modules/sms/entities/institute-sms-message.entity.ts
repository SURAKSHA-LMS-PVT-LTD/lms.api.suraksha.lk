import { Entity, PrimaryGeneratedColumn, Column,  ManyToOne, JoinColumn, Index } from 'typeorm';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { UserEntity } from '../../user/entities/user.entity';

export enum SmsMessageStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',  // ⏳ Waiting for admin approval
  APPROVED = 'APPROVED',                          // ✅ Admin approved, API call initiated
  REJECTED = 'REJECTED',                          // ❌ Admin rejected
  SENT = 'SENT',                                  // ✅ SMS Lenz confirmed all sent
  PARTIALLY_SENT = 'PARTIALLY_SENT',             // ⚠️ SMS Lenz: some sent, some failed
  FAILED = 'FAILED'                              // ❌ SMS Lenz: all failed or API error
}

export enum SmsMessageType {
  CUSTOM_NUMBERS = 'CUSTOM_NUMBERS',
  BULK_INSTITUTE_USERS = 'BULK_INSTITUTE_USERS',
  CLASS_BASED = 'CLASS_BASED',
  SUBJECT_BASED = 'SUBJECT_BASED',
  USER_TYPE_BASED = 'USER_TYPE_BASED',
  SPECIFIC_USERS = 'SPECIFIC_USERS'
}

export enum RecipientFilterType {
  CUSTOM = 'CUSTOM',
  STUDENTS = 'STUDENTS',
  TEACHERS = 'TEACHERS',
  PARENTS = 'PARENTS',
  ADMIN = 'ADMIN',
  ALL = 'ALL'
}

@Entity('institute_sms_messages')
// 🎯 REAL QUERY-BASED INDEXES - Based on actual codebase queries (Nov 2024)
// Pending approval queue: sms.service.ts line 949, 955
@Index('idx_sms_messages_pending', ['status', 'createdAt'])
// Institute SMS history: sms.service.ts line 549, 550
@Index('idx_sms_messages_institute_date', ['instituteId', 'createdAt'])
// Status filtering
@Index('idx_sms_messages_status', ['status'])
// User's sent messages
@Index('idx_sms_messages_sent_by', ['sentBy'])
// Scheduled messages
@Index('idx_sms_messages_scheduled', ['scheduledAt'])
export class InstituteSmsMessageEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'institute_id', type: 'bigint' })
  instituteId: string;

  @Column({ name: 'sent_by', type: 'bigint', nullable: true })
  sentBy?: string;

  @Column({ name: 'message_type', type: 'enum', enum: SmsMessageType })
  messageType: SmsMessageType;

  @Column({ name: 'recipient_filter_type', type: 'enum', enum: RecipientFilterType })
  recipientFilterType: RecipientFilterType;

  @Column({ name: 'message_template', type: 'text' })
  messageTemplate: string; // Contains {{name}}, {{firstName}}, {{lastName}} tags

  @Column({ name: 'processed_message_sample', type: 'text', nullable: true })
  processedMessageSample?: string; // Sample of processed message for preview

  @Column({ name: 'total_recipients', type: 'int' })
  totalRecipients: number;

  @Column({ name: 'successful_sends', type: 'int', default: 0 })
  successfulSends: number;

  @Column({ name: 'failed_sends', type: 'int', default: 0 })
  failedSends: number;

  @Column({ name: 'credits_used', type: 'int' })
  creditsUsed: number;

  @Column({ type: 'enum', enum: SmsMessageStatus, default: SmsMessageStatus.PENDING_VERIFICATION })
  status: SmsMessageStatus;

  @Column({ name: 'mask_id_used', type: 'varchar', length: 100, nullable: true })
  maskIdUsed?: string;

  @Column({ name: 'sender_name', type: 'varchar', length: 100, nullable: true })
  senderName?: string;

  @Column({ name: 'filter_criteria', type: 'json', nullable: true })
  filterCriteria?: {
    classIds?: string[];
    subjectIds?: string[];
    recipientTypes?: string[]; // Array of recipient filter types (STUDENTS, PARENTS, TEACHERS, etc.)
    userTypes?: string[]; // Deprecated - use recipientTypes
    userIds?: string[];
    customNumbers?: {
      number?: string;
      name?: string;
      phoneNumber?: string;
    }[];
  };

  @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'approved_by', type: 'bigint', nullable: true })
  approvedBy?: string;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'delivery_report', type: 'json', nullable: true })
  deliveryReport?: {
    delivered: number;
    failed: number;
    pending: number;
    details?: any[];
  };

  @Column({ name: 'notification_logged', type: 'boolean', default: false })
  notificationLogged: boolean; // Track if logged to InstituteNotifications

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => InstituteEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'institute_id' })
  institute: InstituteEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sent_by' })
  sender?: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approver?: UserEntity;
}
