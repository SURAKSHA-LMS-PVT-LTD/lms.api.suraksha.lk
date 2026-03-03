/**
 * 🔄 ATTENDANCE SYNC MODE
 * 
 * Controls how attendance data flows from DynamoDB (primary) to MySQL (reporting/calendar).
 * 
 * Configurable via:
 *   1. ENV variable: ATTENDANCE_SYNC_MODE (highest priority)
 *   2. Database: attendance_sync_config table (cached, per-institute override)
 *   3. Default: DYNAMO_FIRST
 * 
 * ENV: ATTENDANCE_SYNC_MODE=IMMEDIATE | DYNAMO_FIRST | BACKEND_SCHEDULE
 * ENV: ATTENDANCE_SYNC_CRON=0 *\/15 * * * *   (for BACKEND_SCHEDULE — cron expression, default every 15 min)
 * ENV: ATTENDANCE_SYNC_BATCH_SIZE=500           (for BACKEND_SCHEDULE — records per sync batch)
 */
export enum AttendanceSyncMode {
  /**
   * IMMEDIATE: Write to both DynamoDB AND MySQL in the same request.
   * ✅ Strongest consistency — MySQL is always up-to-date
   * ❌ Slower response time (~50-100ms extra per mark)
   * ❌ If MySQL write fails, DynamoDB record still exists (logged, retried)
   * 
   * Best for: Small institutes, critical reporting needs
   */
  IMMEDIATE = 'IMMEDIATE',

  /**
   * DYNAMO_FIRST: Write to DynamoDB first (response sent), then async fire-and-forget to MySQL.
   * ✅ Fast response time — DynamoDB write returns immediately
   * ✅ MySQL is updated within seconds (non-blocking)
   * ❌ Brief window where MySQL may lag behind DynamoDB
   * 
   * Best for: Most institutes, balanced performance + consistency
   */
  DYNAMO_FIRST = 'DYNAMO_FIRST',

  /**
   * BACKEND_SCHEDULE: Write to DynamoDB only. A scheduled cron job bulk-syncs to MySQL.
   * ✅ Fastest response time — only DynamoDB write
   * ✅ MySQL writes are batched (efficient, lower DB load)
   * ❌ MySQL may be minutes behind (configurable schedule)
   * 
   * Best for: High-volume institutes, analytics can tolerate delay
   * Schedule controlled by: ATTENDANCE_SYNC_CRON env var
   */
  BACKEND_SCHEDULE = 'BACKEND_SCHEDULE',
}

/**
 * Status of a sync operation for audit/tracking
 */
export enum AttendanceSyncStatus {
  PENDING = 'PENDING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}
