import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { AttendanceNotificationService } from './services/attendance-notification.service';
import { WhatsAppWebhookService } from './services/whatsapp-webhook.service';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

class SendBulkWhatsAppDto {
  userIds: string[];
  message: string;
  instituteId?: string;
  attendanceDate?: string; // YYYY-MM-DD — fetch today's attendees for this institute
  sessionOpen?: boolean;   // if true, only send to users with open session
}

class SessionStatusDto {
  phones: string[];
}

@ApiTags('Admin WhatsApp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
@Controller('api/attendance/admin/whatsapp')
export class AdminWhatsAppController {
  private readonly logger = new Logger(AdminWhatsAppController.name);

  constructor(
    private readonly notifService: AttendanceNotificationService,
    private readonly webhookService: WhatsAppWebhookService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Check session window open/closed for a list of phone numbers */
  @Post('session-status')
  @ApiOperation({ summary: 'Check WhatsApp session window for phone numbers' })
  async getSessionStatus(@Body() dto: SessionStatusDto) {
    const phones = (dto.phones || []).filter(Boolean);
    // Single batch query against whatsapp_contact_sessions — no N+1.
    const openSet = await this.webhookService.getOpenSessions(phones);
    const result = phones.map(phone => ({
      phone,
      sessionOpen: openSet.has(phone),
    }));
    return { results: result };
  }

  /**
   * Fetch users attending today (or given date) for an institute.
   * Returns user IDs + phone numbers + names so the frontend can display them.
   */
  @Get('attendance-users')
  @ApiOperation({ summary: 'Get users who attended on a given date for an institute' })
  async getAttendanceUsers(
    @Query('instituteId') instituteId: string,
    @Query('date') date: string,
    @Query('page') page = '1',
    @Query('limit') limit = '200',
  ) {
    if (!instituteId || !date) {
      throw new HttpException('instituteId and date are required', HttpStatus.BAD_REQUEST);
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(500, Math.max(1, parseInt(limit, 10) || 200));
    const offset = (p - 1) * l;

    const rows: any[] = await this.dataSource.query(
      `SELECT DISTINCT
         u.id           AS userId,
         u.first_name   AS firstName,
         u.last_name    AS lastName,
         u.phone_number AS phone,
         u.language     AS language,
         iu.user_id_institue AS instituteUserId
       FROM attendance_records ar
       JOIN users u ON u.id = ar.student_id
       LEFT JOIN institute_user iu ON iu.user_id = u.id AND iu.institute_id = ?
       WHERE ar.institute_id = ?
         AND ar.date = ?
       ORDER BY u.first_name
       LIMIT ? OFFSET ?`,
      [instituteId, instituteId, date, l, offset],
    );

    const countRow: any[] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT ar.student_id) AS total
       FROM attendance_records ar
       WHERE ar.institute_id = ?
         AND ar.date = ?`,
      [instituteId, date],
    );

    const total = Number(countRow[0]?.total || 0);
    const openSet = await this.webhookService.getOpenSessions(
      rows.map(r => r.phone).filter(Boolean),
    );
    const users = rows.map(r => ({
      userId: r.userId,
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      language: r.language ?? null,
      instituteUserId: r.instituteUserId,
      sessionOpen: r.phone ? openSet.has(r.phone) : null,
    }));

    return { users, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  /**
   * Fetch all users in an institute (for manual selection).
   */
  @Get('institute-users')
  @ApiOperation({ summary: 'Get all users in an institute for WhatsApp targeting' })
  async getInstituteUsers(
    @Query('instituteId') instituteId: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    if (!instituteId) {
      throw new HttpException('instituteId is required', HttpStatus.BAD_REQUEST);
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (p - 1) * l;

    const searchClause = search
      ? `AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone_number LIKE ?)`
      : '';
    const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

    const rows: any[] = await this.dataSource.query(
      `SELECT
         u.id           AS userId,
         u.first_name   AS firstName,
         u.last_name    AS lastName,
         u.phone_number AS phone,
         u.language     AS language,
         iu.user_id_institue AS instituteUserId,
         iu.institute_user_type AS userType
       FROM institute_user iu
       JOIN users u ON u.id = iu.user_id
       WHERE iu.institute_id = ?
         ${searchClause}
       ORDER BY u.first_name
       LIMIT ? OFFSET ?`,
      [instituteId, ...searchParams, l, offset],
    );

    const countRow: any[] = await this.dataSource.query(
      `SELECT COUNT(*) AS total
       FROM institute_user iu
       JOIN users u ON u.id = iu.user_id
       WHERE iu.institute_id = ?
         ${searchClause}`,
      [instituteId, ...searchParams],
    );

    const total = Number(countRow[0]?.total || 0);
    const openSet = await this.webhookService.getOpenSessions(
      rows.map(r => r.phone).filter(Boolean),
    );
    const users = rows.map(r => ({
      userId: r.userId,
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      language: r.language ?? null,
      instituteUserId: r.instituteUserId,
      userType: r.userType,
      sessionOpen: r.phone ? openSet.has(r.phone) : null,
    }));

    return { users, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  /**
   * Get all institutes (for the institute picker).
   */
  @Get('institutes')
  @ApiOperation({ summary: 'List all institutes for WhatsApp targeting' })
  async getInstitutes(
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '100',
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
    const offset = (p - 1) * l;

    const searchClause = search ? `WHERE i.name LIKE ?` : '';
    const searchParams = search ? [`%${search}%`] : [];

    const rows: any[] = await this.dataSource.query(
      `SELECT i.id, i.name FROM institutes i ${searchClause} ORDER BY i.name LIMIT ? OFFSET ?`,
      [...searchParams, l, offset],
    );

    return { institutes: rows };
  }

  /**
   * Send WhatsApp session messages to a list of user IDs.
   * Resolves phone numbers from DB, checks session window, sends.
   */
  @Post('send-bulk')
  @ApiOperation({ summary: 'Send WhatsApp session messages to selected users' })
  async sendBulk(@Body() dto: SendBulkWhatsAppDto) {
    const { userIds, message, sessionOpen } = dto;

    if (!message?.trim()) {
      throw new HttpException('message is required', HttpStatus.BAD_REQUEST);
    }

    if (!userIds?.length) {
      throw new HttpException('userIds must not be empty', HttpStatus.BAD_REQUEST);
    }

    if (userIds.length > 500) {
      throw new HttpException('Cannot send to more than 500 users at once', HttpStatus.BAD_REQUEST);
    }

    // Resolve phone numbers for given user IDs
    const placeholders = userIds.map(() => '?').join(',');
    const rows: any[] = await this.dataSource.query(
      `SELECT id AS userId, first_name AS firstName, last_name AS lastName, phone_number AS phone
       FROM users
       WHERE id IN (${placeholders}) AND phone_number IS NOT NULL`,
      userIds,
    );

    const results: Array<{
      userId: string;
      name: string;
      phone: string;
      status: 'sent' | 'skipped_no_phone' | 'skipped_closed_session' | 'failed';
      deliveryId?: string;
      error?: string;
    }> = [];

    // Users with no phone
    const phoneMap = new Map(rows.map(r => [r.userId, r]));
    for (const uid of userIds) {
      if (!phoneMap.has(uid)) {
        results.push({ userId: uid, name: '', phone: '', status: 'skipped_no_phone' });
      }
    }

    // Resolve open-session windows for all candidate phones in ONE batch query
    // (only needed when the caller asked to gate on the session window).
    const openSet = sessionOpen
      ? await this.webhookService.getOpenSessions(rows.map(r => r.phone).filter(Boolean))
      : null;

    // Send to those with phones (and an open session, if gating is on)
    const sendQueue = openSet ? rows.filter(r => openSet.has(r.phone)) : rows;

    // Skipped due to closed session
    if (openSet) {
      for (const r of rows) {
        if (!openSet.has(r.phone)) {
          results.push({
            userId: r.userId,
            name: `${r.firstName || ''} ${r.lastName || ''}`.trim(),
            phone: r.phone,
            status: 'skipped_closed_session',
          });
        }
      }
    }

    // Send messages with rate limiting (Meta allows ~80/min burst)
    const BATCH_SIZE = 10;
    for (let i = 0; i < sendQueue.length; i += BATCH_SIZE) {
      const batch = sendQueue.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async r => {
          try {
            const res = await this.sendOneMessage(r.phone, message);
            if (res.success) {
              // No session write on outbound — sessions are created only when a
              // user replies (see WhatsAppWebhookService.handleInbound).
              results.push({
                userId: r.userId,
                name: `${r.firstName || ''} ${r.lastName || ''}`.trim(),
                phone: r.phone,
                status: 'sent',
                deliveryId: res.deliveryId,
              });
            } else {
              results.push({
                userId: r.userId,
                name: `${r.firstName || ''} ${r.lastName || ''}`.trim(),
                phone: r.phone,
                status: 'failed',
                error: res.error,
              });
            }
          } catch (err: any) {
            results.push({
              userId: r.userId,
              name: `${r.firstName || ''} ${r.lastName || ''}`.trim(),
              phone: r.phone,
              status: 'failed',
              error: err.message,
            });
          }
        }),
      );
      // Brief pause between batches
      if (i + BATCH_SIZE < sendQueue.length) {
        await new Promise(res => setTimeout(res, 200));
      }
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status.startsWith('skipped')).length;

    return {
      summary: { sent, failed, skipped, total: userIds.length },
      results,
    };
  }

  /**
   * Delivery analytics — per-institute, per-date-range, optionally per-ad.
   *
   * Returns aggregated counts proving ad delivery to advertisers:
   *   sent        — API accepted the message (success=1)
   *   delivered   — reached device (wa_delivered_at IS NOT NULL)
   *   read        — recipient opened message (wa_read_at IS NOT NULL)
   *   failed      — permanent send failure (wa_failed_at IS NOT NULL)
   *   pending     — sent but not yet delivered (sent but wa_delivered_at IS NULL and wa_failed_at IS NULL)
   *   deliveryRate — delivered / sent (%)
   *   readRate    — read / delivered (%)
   *
   * Groups by institute_id so a SUPERADMIN can compare across all institutes.
   * Optionally filter by adId to prove per-campaign delivery.
   *
   * Always bounded by a date window — defaults to the last 90 days and is
   * capped at MAX_SPAN_DAYS — so a query can never trigger an unbounded
   * full-table aggregate scan (especially under groupBy=day).
   */
  @Get('delivery-stats')
  @ApiOperation({ summary: 'WhatsApp attendance delivery/read analytics for system admin' })
  async getDeliveryStats(
    @Query('instituteId') instituteId?: string,
    @Query('dateFrom')    dateFrom?: string,
    @Query('dateTo')      dateTo?: string,
    @Query('adId')        adId?: string,
    @Query('groupBy')     groupBy?: string, // 'institute' | 'day' | 'ad'
  ) {
    const MAX_SPAN_DAYS = 366;
    const DEFAULT_SPAN_DAYS = 90;
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Validate YYYY-MM-DD; reject anything else (defence-in-depth even though
    // values are parameterized) and resolve a bounded [from, toExclusive) window.
    const isValidDate = (s?: string): boolean =>
      !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime());

    const to = isValidDate(dateTo) ? new Date(dateTo!) : new Date();
    let from = isValidDate(dateFrom)
      ? new Date(dateFrom!)
      : new Date(to.getTime() - DEFAULT_SPAN_DAYS * DAY_MS);

    if (from > to) {
      throw new HttpException('dateFrom must be on or before dateTo', HttpStatus.BAD_REQUEST);
    }
    // Cap the span so groupBy=day can never return an unbounded series.
    if (to.getTime() - from.getTime() > MAX_SPAN_DAYS * DAY_MS) {
      from = new Date(to.getTime() - MAX_SPAN_DAYS * DAY_MS);
    }

    const fromStr = from.toISOString().slice(0, 10);
    const toExclusiveStr = new Date(to.getTime() + DAY_MS).toISOString().slice(0, 10);

    const conditions: string[] = [
      `channel = 'whatsapp'`,
      `sent_at >= ?`,
      `sent_at < ?`,
    ];
    const params: any[] = [fromStr, toExclusiveStr];

    if (instituteId) {
      conditions.push(`institute_id = ?`);
      params.push(instituteId);
    }
    if (adId) {
      conditions.push(`ad_id = ?`);
      params.push(adId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // Determine GROUP BY axis
    const validGroupBy = ['institute', 'day', 'ad'];
    const groupAxis = validGroupBy.includes(groupBy ?? '') ? groupBy : 'institute';

    let selectGroup: string;
    let groupClause: string;
    switch (groupAxis) {
      case 'day':
        selectGroup = `DATE(sent_at) AS groupKey`;
        groupClause = `GROUP BY DATE(sent_at)`;
        break;
      case 'ad':
        selectGroup = `COALESCE(ad_id, '—') AS groupKey`;
        groupClause = `GROUP BY ad_id`;
        break;
      default:
        selectGroup = `institute_id AS groupKey`;
        groupClause = `GROUP BY institute_id`;
    }

    const rows: any[] = await this.dataSource.query(
      `SELECT
         ${selectGroup},
         COUNT(*)                                       AS sent,
         SUM(wa_delivered_at IS NOT NULL)               AS delivered,
         SUM(wa_read_at IS NOT NULL)                    AS \`read\`,
         SUM(wa_failed_at IS NOT NULL)                  AS failed,
         SUM(success = 1 AND wa_delivered_at IS NULL
             AND wa_failed_at IS NULL)                  AS pending,
         ROUND(
           SUM(wa_delivered_at IS NOT NULL) * 100.0
           / NULLIF(COUNT(*), 0), 1)                   AS deliveryRate,
         ROUND(
           SUM(wa_read_at IS NOT NULL) * 100.0
           / NULLIF(SUM(wa_delivered_at IS NOT NULL), 0), 1) AS readRate
       FROM attendance_notification_deliveries
       ${where}
       ${groupClause}
       ORDER BY sent DESC`,
      params,
    );

    // Enrich institute-grouped rows with names — one batch query, no N+1.
    let labelMap = new Map<string, string>();
    if (groupAxis === 'institute' && rows.length) {
      const ids = rows.map(r => r.groupKey).filter(Boolean);
      if (ids.length) {
        const ph = ids.map(() => '?').join(',');
        const nameRows: any[] = await this.dataSource.query(
          `SELECT id, name FROM institutes WHERE id IN (${ph})`,
          ids,
        );
        labelMap = new Map(nameRows.map(n => [String(n.id), n.name]));
      }
    }

    // Totals row across all groups
    const totals = rows.reduce(
      (acc, r) => ({
        sent:       acc.sent      + Number(r.sent),
        delivered:  acc.delivered + Number(r.delivered),
        read:       acc.read      + Number(r.read),
        failed:     acc.failed    + Number(r.failed),
        pending:    acc.pending   + Number(r.pending),
      }),
      { sent: 0, delivered: 0, read: 0, failed: 0, pending: 0 },
    );

    return {
      groupBy: groupAxis,
      window: { from: fromStr, to: to.toISOString().slice(0, 10) },
      rows: rows.map(r => ({
        groupKey:     r.groupKey,
        label:        groupAxis === 'institute' ? (labelMap.get(String(r.groupKey)) ?? r.groupKey) : r.groupKey,
        sent:         Number(r.sent),
        delivered:    Number(r.delivered),
        read:         Number(r.read),
        failed:       Number(r.failed),
        pending:      Number(r.pending),
        deliveryRate: r.deliveryRate !== null ? Number(r.deliveryRate) : null,
        readRate:     r.readRate     !== null ? Number(r.readRate)     : null,
      })),
      totals: {
        ...totals,
        deliveryRate: totals.sent   ? Math.round(totals.delivered * 100 / totals.sent) : null,
        readRate:     totals.delivered ? Math.round(totals.read  * 100 / totals.delivered) : null,
      },
    };
  }

  private async sendOneMessage(
    phone: string,
    message: string,
  ): Promise<{ success: boolean; deliveryId?: string; error?: string }> {
    try {
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

      if (!phoneNumberId || !accessToken) {
        return { success: false, error: 'WhatsApp credentials not configured' };
      }

      const body = {
        messaging_product: 'whatsapp',
        to: phone.replace('+', ''),
        type: 'text',
        text: { body: message },
      };

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      const result = await response.json();
      if (response.ok && result.messages) {
        return { success: true, deliveryId: result.messages[0]?.id };
      }
      return { success: false, error: result.error?.message || 'Send failed' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
