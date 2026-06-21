import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

/**
 * Per-user smart-card assignment history.
 *
 * One row per (card → user) hand-off. Re-assigning a user a new card deactivates the
 * old active row (`is_active=0`, `revoked_at` set), frees its card back to AVAILABLE,
 * and inserts a fresh active row — so a freed card returns to the pool and can never be
 * double-assigned. At most one `is_active=1` row should exist per card.
 */
@Entity('smart_card_assignments')
@Index('idx_sca_card_active', ['smartCardId', 'isActive'])
@Index('idx_sca_user_active', ['userId', 'isActive'])
@Index('idx_sca_institute', ['instituteId'])
export class SmartCardAssignmentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'smart_card_id', type: 'bigint' })
  smartCardId: string;

  /** Snapshot of the card value at assignment time (for history even if the card row changes). */
  @Column({ name: 'card_value', type: 'varchar', length: 30 })
  cardValue: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  @Column({ name: 'class_id', type: 'varchar', length: 36, nullable: true })
  classId?: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'assigned_by', type: 'bigint', nullable: true })
  assignedBy?: string | null;

  @Column({ name: 'assigned_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  assignedAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'revoke_reason', type: 'varchar', length: 255, nullable: true })
  revokeReason?: string | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
