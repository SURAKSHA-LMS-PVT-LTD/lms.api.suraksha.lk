import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Account Deletion Request Entity
 * 
 * Tracks user-initiated account deletion requests.
 * 
 * Flow:
 * 1. Authenticated user clicks "Delete Account" in profile
 * 2. Account is deactivated immediately (isActive = false)
 * 3. Deletion request is logged with scheduled_deletion_date = now + 30 days
 * 4. Cron job runs daily and permanently deletes accounts past their scheduled date
 * 5. User can cancel within the 30-day grace period by contacting support
 */
export enum DeletionRequestStatus {
  PENDING = 'PENDING',       // Account deactivated, awaiting permanent deletion
  CANCELLED = 'CANCELLED',   // User/admin cancelled the deletion
  COMPLETED = 'COMPLETED',   // Account permanently deleted
}

@Entity('account_deletion_requests')
@Index('idx_deletion_status_scheduled', ['status', 'scheduledDeletionDate'])
@Index('idx_deletion_user_id', ['userId'])
export class AccountDeletionRequestEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** The user who requested deletion */
  @Column({ name: 'user_id', type: 'bigint', unique: true })
  userId: string;

  /** Reason for deletion (optional) */
  @Column({ name: 'reason', type: 'varchar', length: 500, nullable: true })
  reason?: string;

  /** Current status of the request */
  @Column({ name: 'status', type: 'enum', enum: DeletionRequestStatus, default: DeletionRequestStatus.PENDING })
  status: DeletionRequestStatus;

  /** Date when the account will be permanently deleted */
  @Column({ name: 'scheduled_deletion_date', type: 'timestamp' })
  scheduledDeletionDate: Date;

  /** IP address of the requester */
  @Column({ name: 'requester_ip', type: 'varchar', length: 45, nullable: true })
  requesterIp?: string;

  /** Admin who cancelled this request (if cancelled) */
  @Column({ name: 'cancelled_by', type: 'bigint', nullable: true })
  cancelledBy?: string;

  /** Date when deletion was actually completed */
  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
