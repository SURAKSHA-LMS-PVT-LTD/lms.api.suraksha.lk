import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { SmartCardType, SmartCardScope, SmartCardStatus } from '../enums/smart-card.enums';

/**
 * Pre-printed smart card inventory.
 *
 * The system admin bulk-creates these (range / list / CSV), assigns them down to an
 * institute and optionally to a class, and finally they get assigned to a user — at
 * which point `card_id` is written to `user.rfid` (GLOBAL) or
 * `institute_user.institute_card_id` (INSTITUTE).
 *
 * `assigned_user_id IS NULL && status = AVAILABLE` ⇒ the card is in the free pool.
 * Detailed who-held-what history lives in `smart_card_assignments`.
 */
@Entity('smart_cards')
// Free-pool / count lookups by scope
@Index('idx_smart_cards_scope_status', ['scope', 'status'])
// Institute's pool + counts
@Index('idx_smart_cards_institute_status', ['instituteId', 'status'])
// Class pool
@Index('idx_smart_cards_class_status', ['classId', 'status'])
// Validate a typed card value is unique within a scope
@Index('idx_smart_cards_scope_cardid', ['scope', 'cardId'], { unique: true })
export class SmartCardEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** Human-facing label, e.g. "NFC Card 001". */
  @Column({ name: 'card_name', type: 'varchar', length: 100 })
  cardName: string;

  /** The actual printed value handed to the user (≤30 chars to fit user.rfid). */
  @Column({ name: 'card_id', type: 'varchar', length: 30 })
  cardId: string;

  @Column({ name: 'card_type', type: 'enum', enum: SmartCardType })
  cardType: SmartCardType;

  @Column({ name: 'scope', type: 'enum', enum: SmartCardScope })
  scope: SmartCardScope;

  @Column({ name: 'status', type: 'enum', enum: SmartCardStatus, default: SmartCardStatus.AVAILABLE })
  status: SmartCardStatus;

  /** Institute this card has been allocated to (NULL until assigned to an institute). */
  @Column({ name: 'institute_id', type: 'varchar', length: 36, nullable: true })
  instituteId?: string | null;

  /** Class this card has been allocated to within the institute (optional). */
  @Column({ name: 'class_id', type: 'varchar', length: 36, nullable: true })
  classId?: string | null;

  /** Current holder (NULL = not held by a user). */
  @Column({ name: 'assigned_user_id', type: 'bigint', nullable: true })
  assignedUserId?: string | null;

  @Column({ name: 'assigned_at', type: 'timestamp', nullable: true })
  assignedAt?: Date | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
