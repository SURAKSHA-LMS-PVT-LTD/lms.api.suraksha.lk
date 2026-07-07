import { Entity, Column, PrimaryGeneratedColumn, Index, CreateDateColumn } from 'typeorm';

/**
 * Daily pre-assignment of a single advertisement to a user.
 *
 * Why this exists (5000/sec hot path):
 *   Multi-factor ad matching is expensive (score + sort over up to 200 ads). Running it
 *   on every attendance scan does not scale. Instead a once-daily job (cron + manual button)
 *   computes the best ad per eligible user and writes one row here. At scan time the hot
 *   path does a single indexed `WHERE userId = ?` read — no scoring, no joins.
 *
 * Lifecycle:
 *   - The daily job TRUNCATEs this table and rebuilds it for "today".
 *   - `assignedDate` tags each row so a scan can ignore a stale row if the rebuild is mid-flight
 *     (a missing/stale row simply means "no ad" — never an error).
 *
 * Denormalization:
 *   The deliverable ad fields are snapshotted here so the hot path needs zero joins to the
 *   `advertisements` table for the *content*. The only write-time touch of `advertisements`
 *   is the atomic `currentSendings` cap-check at send time, and only when an ad is found.
 */
@Entity('daily_ad_assignments')
// One assignment per user — the hot-path lookup key. Unique so an upsert/rebuild is clean.
@Index('idx_daily_ad_user', ['userId'], { unique: true })
// Lets the cleanup/rebuild target "not today" rows cheaply.
@Index('idx_daily_ad_date', ['assignedDate'])
export class DailyAdAssignmentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  userId: string;

  @Column({ name: 'ad_id', type: 'varchar', length: 36 })
  adId: string;

  /** Local (Sri Lanka) date string YYYY-MM-DD the assignment is valid for. */
  @Column({ name: 'assigned_date', type: 'varchar', length: 10 })
  assignedDate: string;

  // ── Denormalized deliverable snapshot (no join needed on the hot path) ──
  @Column({ name: 'media_url', type: 'varchar', length: 500, nullable: true })
  mediaUrl?: string;

  @Column({ name: 'media_type', type: 'varchar', length: 20, nullable: true })
  mediaType?: string;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title?: string;

  @Column({ name: 'content', type: 'text', nullable: true })
  content?: string;

  @Column({ name: 'sending_url', type: 'varchar', length: 500, nullable: true })
  sendingUrl?: string;

  /** JSON array of SupportivePlatform values. */
  @Column({ name: 'supportive_platforms', type: 'json', nullable: true })
  supportivePlatforms?: string[];

  /** JSON array of SendingMode values. */
  @Column({ name: 'mode_of_sending', type: 'json', nullable: true })
  modeOfSending?: string[];

  @Column({ name: 'cascade_to_parents', type: 'boolean', default: false })
  cascadeToParents: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
