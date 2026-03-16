/**
 * 🔄 ATTENDANCE SYNC CONFIGURATION SERVICE
 * 
 * System-wide attendance sync settings. NOT per-institute.
 * 
 * Resolves with tiered priority:
 *   1. ENV variable: ATTENDANCE_SYNC_MODE (highest — deploy-time override)
 *   2. DB (system_config table): group=ATTENDANCE, key=SYNC_MODE (runtime changeable)
 *   3. Default: DYNAMO_FIRST
 * 
 * Uses the generic SystemConfigService for DB access + caching.
 * 
 * Config keys (group = "ATTENDANCE"):
 *   SYNC_MODE        → IMMEDIATE | DYNAMO_FIRST | BACKEND_SCHEDULE
 *   SYNC_CRON        → Cron expression for BACKEND_SCHEDULE (default: every 15 min)
 *   SYNC_BATCH_SIZE  → Records per sync batch (default: 500)
 *   SYNC_ENABLED     → true/false master switch
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttendanceSyncMode, AttendanceDbMode } from '../enums/attendance-sync-mode.enum';
import { SystemConfigService } from '../../../common/services/system-config.service';

/** Config group name in system_config table */
const CONFIG_GROUP = 'ATTENDANCE';

/** Config keys */
const KEYS = {
  SYNC_MODE: 'SYNC_MODE',
  SYNC_CRON: 'SYNC_CRON',
  SYNC_BATCH_SIZE: 'SYNC_BATCH_SIZE',
  SYNC_ENABLED: 'SYNC_ENABLED',
} as const;

@Injectable()
export class AttendanceSyncConfigService implements OnModuleInit {
  private readonly logger = new Logger(AttendanceSyncConfigService.name);

  /** ENV-level overrides (null = not set, fall through to DB/default) */
  private envSyncMode: AttendanceSyncMode | null = null;
  private envCron: string | null = null;
  private envBatchSize: number | null = null;
  private envEnabled: boolean | null = null;
  private envDbMode: AttendanceDbMode = AttendanceDbMode.BOTH;

  constructor(
    private readonly configService: ConfigService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  onModuleInit() {
    // ── Read ENV overrides once at startup ──
    const envMode = this.configService.get<string>('ATTENDANCE_SYNC_MODE');
    if (envMode && Object.values(AttendanceSyncMode).includes(envMode as AttendanceSyncMode)) {
      this.envSyncMode = envMode as AttendanceSyncMode;
    } else if (envMode) {
      this.logger.warn(
        `⚠️ Invalid ATTENDANCE_SYNC_MODE="${envMode}". Valid: ${Object.values(AttendanceSyncMode).join(', ')}`,
      );
    }

    // ── Read ATTENDANCE_DB_MODE ──
    const envDbMode = this.configService.get<string>('ATTENDANCE_DB_MODE');
    if (envDbMode && Object.values(AttendanceDbMode).includes(envDbMode as AttendanceDbMode)) {
      this.envDbMode = envDbMode as AttendanceDbMode;
    } else if (envDbMode) {
      this.logger.warn(
        `⚠️ Invalid ATTENDANCE_DB_MODE="${envDbMode}". Valid: ${Object.values(AttendanceDbMode).join(', ')}. Defaulting to "both".`,
      );
    }

    const envCron = this.configService.get<string>('ATTENDANCE_SYNC_CRON');
    if (envCron) this.envCron = envCron;

    const envBatch = this.configService.get<string>('ATTENDANCE_SYNC_BATCH_SIZE');
    if (envBatch) this.envBatchSize = parseInt(envBatch, 10) || null;

    const envEnabled = this.configService.get<string>('ATTENDANCE_SYNC_ENABLED');
    if (envEnabled !== undefined && envEnabled !== null) {
      this.envEnabled = envEnabled === 'true' || envEnabled === '1';
    }

    this.logger.log(
      `🔄 Attendance config: ` +
      `dbMode=${this.envDbMode}, ` +
      `syncMode=${this.envSyncMode ?? '(from DB/default)'}, ` +
      `cron=${this.envCron ?? '(from DB/default)'}, ` +
      `batch=${this.envBatchSize ?? '(from DB/default)'}, ` +
      `enabled=${this.envEnabled ?? '(from DB/default)'}`,
    );
  }

  // ═══════════════════════════════════════════════════════════
  // GETTERS — ENV → DB → default
  // ═══════════════════════════════════════════════════════════

  /**
   * Get the current sync mode.
   * Priority: ENV → system_config DB → DYNAMO_FIRST
   */
  async getSyncMode(): Promise<AttendanceSyncMode> {
    if (this.envSyncMode) return this.envSyncMode;

    const dbVal = await this.systemConfigService.get(
      CONFIG_GROUP,
      KEYS.SYNC_MODE,
      AttendanceSyncMode.DYNAMO_FIRST,
    );

    if (Object.values(AttendanceSyncMode).includes(dbVal as AttendanceSyncMode)) {
      return dbVal as AttendanceSyncMode;
    }

    return AttendanceSyncMode.DYNAMO_FIRST;
  }

  /**
   * Synchronous cache-only read for hot path (no DB query).
   */
  getSyncModeSync(): AttendanceSyncMode {
    if (this.envSyncMode) return this.envSyncMode;

    const dbVal = this.systemConfigService.getSync(
      CONFIG_GROUP,
      KEYS.SYNC_MODE,
      AttendanceSyncMode.DYNAMO_FIRST,
    );

    if (Object.values(AttendanceSyncMode).includes(dbVal as AttendanceSyncMode)) {
      return dbVal as AttendanceSyncMode;
    }

    return AttendanceSyncMode.DYNAMO_FIRST;
  }

  /**
   * Get the current database mode (both | only_mysql).
   * Read from ENV at startup — not runtime-changeable.
   */
  getDbMode(): AttendanceDbMode {
    return this.envDbMode;
  }

  /**
   * Convenience check: is the system in MySQL-only mode?
   */
  isMysqlOnly(): boolean {
    return this.envDbMode === AttendanceDbMode.MYSQL_ONLY;
  }

  /**
   * Is sync enabled at all? (master switch)
   */
  async isSyncEnabled(): Promise<boolean> {
    if (this.envEnabled !== null) return this.envEnabled;
    return this.systemConfigService.getBoolean(CONFIG_GROUP, KEYS.SYNC_ENABLED, true);
  }

  /**
   * Cron expression for BACKEND_SCHEDULE mode.
   */
  async getCronExpression(): Promise<string> {
    if (this.envCron) return this.envCron;
    return this.systemConfigService.get(CONFIG_GROUP, KEYS.SYNC_CRON, '0 */15 * * * *');
  }

  /**
   * Batch size for BACKEND_SCHEDULE mode.
   */
  async getBatchSize(): Promise<number> {
    if (this.envBatchSize) return this.envBatchSize;
    return this.systemConfigService.getNumber(CONFIG_GROUP, KEYS.SYNC_BATCH_SIZE, 500);
  }

  // ═══════════════════════════════════════════════════════════
  // SETTERS — write to system_config DB table (runtime change)
  // ═══════════════════════════════════════════════════════════

  /**
   * Update sync mode at runtime (persisted to DB, takes effect immediately via cache).
   * Note: If ATTENDANCE_SYNC_MODE is set in ENV, that always wins over DB.
   */
  async setSyncMode(mode: AttendanceSyncMode, updatedBy?: string): Promise<void> {
    await this.systemConfigService.set(CONFIG_GROUP, KEYS.SYNC_MODE, mode, updatedBy, {
      description: 'Attendance DynamoDB→MySQL sync mode: IMMEDIATE | DYNAMO_FIRST | BACKEND_SCHEDULE',
      valueType: 'ENUM',
    });
    this.logger.log(`🔄 Sync mode changed to ${mode}${updatedBy ? ` by ${updatedBy}` : ''}`);
  }

  async setCronExpression(cron: string, updatedBy?: string): Promise<void> {
    await this.systemConfigService.set(CONFIG_GROUP, KEYS.SYNC_CRON, cron, updatedBy, {
      description: 'Cron expression for BACKEND_SCHEDULE sync (e.g. "0 */15 * * * *" = every 15 min)',
      valueType: 'STRING',
    });
  }

  async setBatchSize(size: number, updatedBy?: string): Promise<void> {
    await this.systemConfigService.set(CONFIG_GROUP, KEYS.SYNC_BATCH_SIZE, String(size), updatedBy, {
      description: 'Records per sync batch for BACKEND_SCHEDULE mode',
      valueType: 'NUMBER',
    });
  }

  async setEnabled(enabled: boolean, updatedBy?: string): Promise<void> {
    await this.systemConfigService.set(CONFIG_GROUP, KEYS.SYNC_ENABLED, String(enabled), updatedBy, {
      description: 'Master switch for attendance DynamoDB→MySQL sync',
      valueType: 'BOOLEAN',
    });
  }
}
