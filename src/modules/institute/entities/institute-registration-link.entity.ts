import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * 🌐 PUBLIC REGISTRATION LINK
 *
 * A shareable, institute-scoped public form (served at /forms/:token) that lets people
 * self-register into an institute without an admin account. One link is created per
 * intended audience and fully governs what the public form does:
 *
 *  - `allowedUserTypes`     → which institute user types this link may create. If a single
 *                             type, the public form fixes it; if multiple, the form shows a
 *                             picker limited to this set. Server re-validates on register.
 *  - card auto-assignment   → governed by `autoAssignCard` + `cardScope`, and only honored
 *                             when the institute has the `smart-cards` feature enabled. The
 *                             `cardEmptyPoolBehavior` decides what happens when the pool is
 *                             empty at registration time (skip+flag vs. hard error).
 *  - enrollment             → `allowClassEnrollment` reveals a class selector; only when that
 *                             is on does `allowSubjectEnrollment` reveal per-class subjects.
 *                             Self-enrollments are created `pending` (awaiting admin), so no
 *                             enrollment keys are required.
 *  - verification           → phone (WhatsApp OTP) and email (emailed OTP) are required before
 *                             submit per `requirePhoneVerification` / `requireEmailVerification`.
 *  - `extraDataFields`      → JSON map of which optional profile columns the form collects.
 *  - `isActive`             → the disable switch. An inactive (or expired) link returns 410.
 */
@Entity('institute_registration_links')
@Index('idx_irl_token', ['token'], { unique: true })
@Index('idx_irl_institute', ['instituteId'])
export class InstituteRegistrationLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Public slug used in the URL: /forms/:token. Unguessable, unique. */
  @Column({ name: 'token', type: 'varchar', length: 40, unique: true })
  token: string;

  @Column({ name: 'institute_id', type: 'varchar', length: 36 })
  instituteId: string;

  /** Admin (institute_user) who created the link. */
  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdBy?: string | null;

  /** Human label shown to the admin in the link list (not public). */
  @Column({ name: 'label', type: 'varchar', length: 120, nullable: true })
  label?: string | null;

  /** Institute user types this link may create, e.g. ["STUDENT"] or ["STUDENT","TEACHER"]. */
  @Column({ name: 'allowed_user_types', type: 'json' })
  allowedUserTypes: string[];

  // ── Card auto-assignment ───────────────────────────────────────────────────
  @Column({ name: 'auto_assign_card', type: 'boolean', default: false })
  autoAssignCard: boolean;

  /** Which smart-card scope to auto-assign when autoAssignCard is on. */
  @Column({ name: 'card_scope', type: 'enum', enum: ['INSTITUTE', 'GLOBAL', 'BOTH'], default: 'INSTITUTE' })
  cardScope: 'INSTITUTE' | 'GLOBAL' | 'BOTH';

  /**
   * What to do if the card pool is empty at registration time:
   *  - 'skip'  → register the user anyway, assign no card, flag the registration as card-pending.
   *  - 'error' → fail the registration with a clear "no cards available" error.
   */
  @Column({ name: 'card_empty_pool_behavior', type: 'enum', enum: ['skip', 'error'], default: 'skip' })
  cardEmptyPoolBehavior: 'skip' | 'error';

  // ── Enrollment ─────────────────────────────────────────────────────────────
  @Column({ name: 'allow_class_enrollment', type: 'boolean', default: false })
  allowClassEnrollment: boolean;

  @Column({ name: 'allow_subject_enrollment', type: 'boolean', default: false })
  allowSubjectEnrollment: boolean;

  // ── Verification ───────────────────────────────────────────────────────────
  @Column({ name: 'require_phone_verification', type: 'boolean', default: true })
  requirePhoneVerification: boolean;

  @Column({ name: 'require_email_verification', type: 'boolean', default: true })
  requireEmailVerification: boolean;

  // ── Institute custom columns (userExtraDataSchema) per-link setting ─────────
  /**
   * Map of institute custom-column key → collection mode on THIS link:
   *   'off'      → not shown on the public form,
   *   'optional' → shown, may be left blank,
   *   'required' → shown and must be filled before submit.
   * Only institute custom columns (institute.userExtraDataSchema) are configurable —
   * core Suraksha fields keep their system-defined requiredness.
   */
  @Column({ name: 'extra_data_fields', type: 'json', nullable: true })
  extraDataFields?: Record<string, 'off' | 'optional' | 'required'> | null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date | null;

  /** How many successful self-registrations this link has produced (for the admin list). */
  @Column({ name: 'registration_count', type: 'int', unsigned: true, default: 0 })
  registrationCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
