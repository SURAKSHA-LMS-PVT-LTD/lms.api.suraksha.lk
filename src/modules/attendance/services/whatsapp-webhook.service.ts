import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * WhatsApp session tracker — single responsibility, zero notification logic.
 *
 * Write path (hot — called on every inbound webhook):
 *   One INSERT … ON DUPLICATE KEY UPDATE on the PK (phone).
 *   user_id is resolved with a fast conditional: if the row already has a
 *   non-NULL user_id we skip the users lookup entirely by passing NULL in
 *   VALUES and relying on COALESCE(user_id, VALUES(user_id)) to keep the
 *   existing value. The SELECT runs only when user_id IS NULL (first reply
 *   from this number, or number not yet matched to a user).
 *
 *   WHY not a correlated subquery inside INSERT VALUES:
 *   MySQL evaluates VALUES(...) before COALESCE in ON DUPLICATE KEY UPDATE,
 *   so `(SELECT id FROM users WHERE phone_number = ?)` inside VALUES runs on
 *   EVERY upsert — even when user_id is already filled. That's a hidden SELECT
 *   on every "Thanks" tap from a known user. The explicit two-step avoids it:
 *     1. Try UPDATE only (no lookup needed if row exists with non-NULL user_id).
 *     2. If 0 rows updated (first reply): run the lookup and INSERT.
 *   Net: zero extra queries on the hot path after the first reply.
 *
 * Read path (admin only, not on hot path):
 *   listSessions uses a single queryRunner connection so SQL_CALC_FOUND_ROWS
 *   and FOUND_ROWS() are guaranteed to execute on the same connection.
 *   Promise.all with two ds.query() calls can use different pool connections
 *   causing FOUND_ROWS() to return 0 — fixed by using queryRunner.
 */
@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  private static readonly SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  // ─── Hot path: inbound message ────────────────────────────────────────────

  /**
   * Upsert session state for one inbound message.
   *
   * Fast path (existing row, user_id already set):
   *   → Single UPDATE on PK. No SELECT. ~0.1 ms.
   *
   * Slow path (first reply from this number, or user_id was NULL):
   *   → One SELECT on users.phone_number (indexed) + one INSERT.
   *   → Happens at most once per phone number lifetime.
   */
  async handleInbound(rawPhone: string, buttonPayloadId?: string | null): Promise<void> {
    // Normalize through the single shared normalizer so the PK we write here
    // matches what isSessionOpen() looks up later (see WhatsAppWebhookService.normalisePhone).
    const phone = WhatsAppWebhookService.normalisePhone(rawPhone);
    if (!phone) return;

    const isThanks = buttonPayloadId === 'attendance_thanks' ? 1 : 0;
    const now = new Date();
    const expires = new Date(now.getTime() + WhatsAppWebhookService.SESSION_TTL_MS);

    // Attempt UPDATE first — no lookup needed if row already exists.
    const updated: any = await this.ds.query(
      `UPDATE whatsapp_contact_sessions SET
         last_reply_at      = ?,
         session_expires_at = ?,
         thanks_count       = thanks_count + ?,
         total_replies      = total_replies + 1
       WHERE phone = ?`,
      [now, expires, isThanks, phone],
    );

    // affectedRows = 0 means this is the first reply from this number.
    if (updated?.affectedRows === 0) {
      // Resolve user_id once — phone_number is indexed, sub-ms.
      const userRows: any[] = await this.ds.query(
        `SELECT id FROM users WHERE phone_number = ? LIMIT 1`,
        [phone],
      );
      const userId: string | null = userRows[0]?.id ?? null;

      // INSERT, but tolerate a concurrent race (another pod handling the same
      // number's first reply simultaneously) via ON DUPLICATE KEY UPDATE.
      await this.ds.query(
        `INSERT INTO whatsapp_contact_sessions
           (phone, user_id, first_reply_at, last_reply_at, session_expires_at,
            thanks_count, total_replies)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           last_reply_at      = VALUES(last_reply_at),
           session_expires_at = VALUES(session_expires_at),
           thanks_count       = thanks_count + VALUES(thanks_count),
           total_replies      = total_replies + 1,
           user_id            = COALESCE(user_id, VALUES(user_id))`,
        [phone, userId, now, now, expires, isThanks],
      );
    }

    if (isThanks) this.logger.debug(`[WA] Thanks from ${this.mask(phone)}`);
  }

  // ─── Hot path: Meta delivery/read/failed statuses ────────────────────────

  /**
   * Process a batch of Meta "statuses" events and update wa_* timestamp columns.
   *
   * Each status event contains the wamid that Meta returned when we sent the
   * message. We stored that id as provider_message_id. The unique index
   * UQ_AND_wamid makes each UPDATE a single-row indexed write — O(1).
   *
   * All updates run in parallel via Promise.all — no serial await chain.
   * Any individual failure is logged but does not abort the batch.
   *
   * Meta sends each status event exactly once (no dedup guarantee) and DOES NOT
   * guarantee ordering between batches, so each UPDATE is written so the four
   * states stay mutually consistent regardless of arrival order:
   *
   *   • delivered/read are only applied when the message has NOT failed
   *     (a delivered/read message cannot also be "failed").
   *   • failed is only applied when the message was NOT already delivered/read
   *     (a message that reached the device cannot retroactively "fail").
   *   • read implies delivered: a "read" event also backfills wa_delivered_at if
   *     the delivered event was lost or arrives later.
   *   • each column's own `IS NULL` guard keeps the FIRST timestamp on duplicates.
   *
   * Net effect: delivered/failed are mutually exclusive, so analytics can never
   * double-count one message as both delivered and failed.
   */
  async handleStatuses(
    statuses: Array<{ id: string; status: string; timestamp: string }>,
  ): Promise<void> {
    if (!statuses.length) return;

    const tasks = statuses.map(s => this.applyStatus(s));
    await Promise.all(tasks);
  }

  private async applyStatus(s: { id: string; status: string; timestamp: string }): Promise<void> {
    const wamid = s.id;
    if (!wamid) return;

    // Convert Unix timestamp string to Date; fall back to NOW on missing/garbage
    // timestamp so a real status event is never silently dropped.
    const parsed = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();
    const ts = isNaN(parsed.getTime()) ? new Date() : parsed;

    let sql: string;
    switch (s.status) {
      case 'delivered':
        // Set only if not yet delivered AND not failed (delivered wins over a
        // not-yet-arrived failed, but never coexists with an existing failed).
        sql = `UPDATE attendance_notification_deliveries
                 SET wa_delivered_at = ?
               WHERE provider_message_id = ?
                 AND wa_delivered_at IS NULL
                 AND wa_failed_at IS NULL`;
        break;
      case 'read':
        // read implies delivered — backfill wa_delivered_at if it was missed,
        // and clear any spurious failure since the recipient demonstrably read it.
        sql = `UPDATE attendance_notification_deliveries
                 SET wa_read_at = ?,
                     wa_delivered_at = COALESCE(wa_delivered_at, ?),
                     wa_failed_at = NULL
               WHERE provider_message_id = ?
                 AND wa_read_at IS NULL`;
        break;
      case 'failed':
        // Set only if the message never reached the device (not delivered, not read).
        sql = `UPDATE attendance_notification_deliveries
                 SET wa_failed_at = ?
               WHERE provider_message_id = ?
                 AND wa_failed_at IS NULL
                 AND wa_delivered_at IS NULL
                 AND wa_read_at IS NULL`;
        break;
      default:
        // "sent" events are a no-op (we already recorded success=1 when we sent).
        return;
    }

    const params = s.status === 'read' ? [ts, ts, wamid] : [ts, wamid];

    try {
      await this.ds.query(sql, params);
    } catch (err: any) {
      this.logger.error(`[WA Status] Failed to apply status=${s.status} wamid=${wamid}: ${err.message}`);
    }
  }

  // ─── Session window query ─────────────────────────────────────────────────

  /** True when this number's 24h free-messaging window is open. */
  async isSessionOpen(phone: string): Promise<boolean> {
    const norm = WhatsAppWebhookService.normalisePhone(phone);
    if (!norm) return false;
    const rows: any[] = await this.ds.query(
      `SELECT 1 FROM whatsapp_contact_sessions
       WHERE phone = ? AND session_expires_at > NOW() LIMIT 1`,
      [norm],
    );
    return rows.length > 0;
  }

  /**
   * Batch session-window check — one query for many phones (avoids N+1).
   * Returns a Set of the ORIGINAL input phone strings whose window is open,
   * so callers can match results back to their own (un-normalized) values.
   */
  async getOpenSessions(phones: string[]): Promise<Set<string>> {
    const open = new Set<string>();
    if (!phones?.length) return open;

    // Map normalized → original(s); skip phones that fail normalization.
    const byNorm = new Map<string, string[]>();
    for (const original of phones) {
      const norm = WhatsAppWebhookService.normalisePhone(original);
      if (!norm) continue;
      const list = byNorm.get(norm);
      if (list) list.push(original);
      else byNorm.set(norm, [original]);
    }
    if (byNorm.size === 0) return open;

    const normKeys = [...byNorm.keys()];
    const placeholders = normKeys.map(() => '?').join(',');
    const rows: any[] = await this.ds.query(
      `SELECT phone FROM whatsapp_contact_sessions
       WHERE phone IN (${placeholders}) AND session_expires_at > NOW()`,
      normKeys,
    );

    for (const r of rows) {
      const originals = byNorm.get(r.phone) ?? [];
      for (const o of originals) open.add(o);
    }
    return open;
  }

  // ─── Admin read ───────────────────────────────────────────────────────────

  /**
   * Uses a dedicated queryRunner so SQL_CALC_FOUND_ROWS and FOUND_ROWS()
   * execute on the SAME connection — pool.query() may route them to different
   * connections, returning FOUND_ROWS() = 0.
   */
  async listSessions(opts: {
    page: number;
    limit: number;
    sessionOpen?: boolean;
  }): Promise<{ rows: SessionRow[]; total: number }> {
    const { page, limit, sessionOpen } = opts;
    const offset = (page - 1) * limit;

    const where =
      sessionOpen === true  ? 'WHERE wcs.session_expires_at > NOW()' :
      sessionOpen === false ? 'WHERE wcs.session_expires_at <= NOW()' :
      '';

    const qr = this.ds.createQueryRunner();
    await qr.connect();
    try {
      const rows: SessionRow[] = await qr.query(
        `SELECT SQL_CALC_FOUND_ROWS
           wcs.phone,
           wcs.user_id            AS userId,
           u.first_name           AS firstName,
           u.last_name            AS lastName,
           wcs.first_reply_at     AS firstReplyAt,
           wcs.last_reply_at      AS lastReplyAt,
           wcs.session_expires_at AS sessionExpiresAt,
           wcs.thanks_count       AS thanksCount,
           wcs.total_replies      AS totalReplies,
           (wcs.session_expires_at > NOW()) AS sessionOpen
         FROM whatsapp_contact_sessions wcs
         LEFT JOIN users u ON u.id = wcs.user_id
         ${where}
         ORDER BY wcs.last_reply_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset],
      );

      const [{ total }] = await qr.query('SELECT FOUND_ROWS() AS total');
      return { rows, total: Number(total) };
    } finally {
      await qr.release();
    }
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────

  /**
   * THE single phone normalizer for WhatsApp contact sessions.
   *
   * Both the write path (handleInbound stores this as the PK) and every read
   * path (isSessionOpen / getOpenSessions) MUST funnel through this so a lookup
   * keyed on a `+94…`/spaced number resolves to the same digits-only PK that was
   * written. Strips all non-digits; rejects implausible lengths.
   */
  static normalisePhone(phone: string): string | null {
    const n = (phone ?? '').replace(/\D/g, '');
    return n.length >= 7 && n.length <= 15 ? n : null;
  }

  private mask(phone: string): string {
    return phone.length <= 4 ? '****' : `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
  }
}

export interface SessionRow {
  phone: string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  firstReplyAt: string;
  lastReplyAt: string;
  sessionExpiresAt: string;
  thanksCount: number;
  totalReplies: number;
  sessionOpen: boolean;
}
