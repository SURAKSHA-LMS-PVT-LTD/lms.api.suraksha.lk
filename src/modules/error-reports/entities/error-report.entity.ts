import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';

export enum ErrorReportKind {
  REACT_BOUNDARY  = 'REACT_BOUNDARY',   // Caught by React ErrorBoundary
  API_5XX         = 'API_5XX',           // 5xx response from backend
  API_CLIENT      = 'API_CLIENT',        // Non-5xx unhandled API errors (403/404 etc)
  UNHANDLED_JS    = 'UNHANDLED_JS',      // window.onerror / unhandledrejection
}

export enum ErrorReportStatus {
  NEW      = 'NEW',       // Just received, not yet looked at
  VIEWED   = 'VIEWED',    // Admin opened the report
  FIXING   = 'FIXING',    // Assigned / being worked on
  FIXED    = 'FIXED',     // Resolved
  IGNORED  = 'IGNORED',   // Intentionally dismissed (known issue / user error)
}

@Entity('error_reports')
@Index('idx_error_reports_status', ['status'])
@Index('idx_error_reports_kind', ['kind'])
@Index('idx_error_reports_user', ['userId'])
@Index('idx_error_reports_created', ['createdAt'])
@Index('idx_error_reports_request_id', ['requestId'])
export class ErrorReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Classification ──────────────────────────────────────────────────────────
  @Column({ type: 'enum', enum: ErrorReportKind, default: ErrorReportKind.REACT_BOUNDARY })
  kind: ErrorReportKind;

  @Column({ type: 'enum', enum: ErrorReportStatus, default: ErrorReportStatus.NEW })
  status: ErrorReportStatus;

  // ── Error details ───────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 500 })
  errorMessage: string;

  @Column({ type: 'text', nullable: true })
  errorStack: string | null;

  @Column({ type: 'text', nullable: true })
  componentStack: string | null;

  /** HTTP status code for API errors */
  @Column({ type: 'int', nullable: true })
  httpStatus: number | null;

  /** Backend requestId (from ApiError.requestId) — for cross-referencing server logs */
  @Column({ type: 'varchar', length: 100, nullable: true })
  requestId: string | null;

  /** The URL/endpoint that failed */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  apiPath: string | null;

  // ── Context ─────────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 2000 })
  pageUrl: string;

  @Column({ type: 'varchar', length: 500 })
  userAgent: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  appVersion: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  platform: string | null;

  /** JSON snapshot: { instituteId, instituteName, userRole } */
  @Column({ type: 'json', nullable: true })
  context: Record<string, any> | null;

  // ── Screenshot ──────────────────────────────────────────────────────────────
  /** base64 JPEG data-url (≤ ~200 KB after 0.5× scale) stored inline */
  @Column({ type: 'mediumtext', nullable: true })
  screenshotDataUrl: string | null;

  // ── Reporter ────────────────────────────────────────────────────────────────
  @Column({ type: 'bigint', nullable: true })
  userId: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity | null;

  // ── Admin resolution ────────────────────────────────────────────────────────
  @Column({ type: 'text', nullable: true })
  adminNote: string | null;

  @Column({ type: 'bigint', nullable: true })
  resolvedByUserId: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by_user_id' })
  resolvedBy: UserEntity | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  // ── Timestamps ──────────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
