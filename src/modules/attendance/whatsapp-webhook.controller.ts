import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Req,
  Res,
  Logger,
  HttpCode,
  HttpStatus,
  UseGuards,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { WhatsAppWebhookService } from './services/whatsapp-webhook.service';
import { WhatsAppMenuService } from './services/whatsapp-menu.service';

/**
 * WhatsApp Cloud API webhook receiver.
 *
 * Route layout:
 *   GET  /api/whatsapp/webhook          — Meta challenge-response (public, no auth)
 *   POST /api/whatsapp/webhook          — inbound events, HMAC-SHA256 verified (public)
 *   GET  /api/whatsapp/webhook/sessions — admin session list (SUPERADMIN only)
 *
 * Security design:
 *   • rawBody: true in NestFactory.create() — NestJS captures the raw Buffer
 *     on every request before JSON.parse(). Accessed via req.rawBody (NestJS built-in).
 *   • HMAC-SHA256 via crypto.timingSafeEqual — constant-time compare prevents
 *     timing oracle. Length checked first (different-length → instant false, no throw).
 *   • Always returns 200 to Meta — non-200 triggers exponential retry storms.
 *   • Payload walking never stores message content, only session timestamps.
 *
 * Performance design:
 *   • processPayload extracts all (phone, buttonId) pairs first, then fires
 *     all handleInbound calls with Promise.all — parallel upserts on the PK,
 *     no serial await chain.
 *   • processPayload is fire-and-forget from receive() — the HTTP 200 is sent
 *     immediately, DB writes happen concurrently without blocking Meta's timeout.
 */
@ApiTags('WhatsApp Webhook')
@Controller('api/whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly webhookService: WhatsAppWebhookService,
    private readonly menuService: WhatsAppMenuService,
  ) {}

  // ─── Meta webhook verification (public GET) ───────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Meta webhook verification challenge' })
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? '';
    if (mode === 'subscribe' && token === expected && challenge) {
      this.logger.log('[WA Webhook] Verification accepted');
      res.status(200).send(challenge);
    } else {
      this.logger.warn('[WA Webhook] Verification failed — token mismatch or missing challenge');
      res.status(403).send('Forbidden');
    }
  }

  // ─── Inbound events (public POST, HMAC-verified) ──────────────────────────

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive WhatsApp inbound messages and status updates' })
  receive(@Req() req: RawBodyRequest<Request>, @Body() body: unknown): string {
    // Verify HMAC first — before any processing.
    // We still return 200 on failure to prevent Meta retry storms, but we drop the payload.
    if (!this.verifyHmac(req)) {
      this.logger.warn('[WA Webhook] HMAC check failed — payload dropped');
      return 'OK';
    }

    // Fire-and-forget — 200 goes to Meta immediately; DB upserts run concurrently.
    // Errors are swallowed here to guarantee we never return non-200 to Meta.
    this.processPayload(body as Record<string, any>).catch((err: Error) =>
      this.logger.error(`[WA Webhook] Processing error: ${err.message}`),
    );

    return 'OK';
  }

  // ─── Admin: list contact sessions (SUPERADMIN) ────────────────────────────

  @Get('sessions')
  @UseGuards(JwtAuthGuard, FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List WhatsApp contact sessions (admin)' })
  async listSessions(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
    @Query('sessionOpen') sessionOpen?: string,
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const open =
      sessionOpen === 'true'  ? true  :
      sessionOpen === 'false' ? false : undefined;

    const { rows, total } = await this.webhookService.listSessions({ page: p, limit: l, sessionOpen: open });
    return { sessions: rows, total, page: p, limit: l, totalPages: Math.ceil(total / l) };
  }

  // ─── Private: HMAC-SHA256 verification ────────────────────────────────────

  private verifyHmac(req: RawBodyRequest<Request>): boolean {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) {
      // Fail CLOSED in production — a missing secret must never accept
      // unauthenticated payloads (forged delivery/read timestamps, forged
      // inbound sessions). Only the explicit dev flag may bypass HMAC locally.
      const allowUnverified =
        process.env.NODE_ENV !== 'production' &&
        process.env.WHATSAPP_WEBHOOK_ALLOW_UNVERIFIED === 'true';
      if (allowUnverified) {
        this.logger.warn('[WA Webhook] WHATSAPP_APP_SECRET not set — HMAC bypassed (dev override)');
        return true;
      }
      this.logger.error('[WA Webhook] WHATSAPP_APP_SECRET not set — rejecting payload (fail-closed)');
      return false;
    }

    const sigHeader = req.headers['x-hub-signature-256'];
    const signature = typeof sigHeader === 'string' ? sigHeader : undefined;
    if (!signature) return false;

    // NestJS rawBody: true (set in NestFactory.create) captures the raw Buffer.
    const raw = req.rawBody;
    if (!raw || raw.length === 0) {
      this.logger.warn('[WA Webhook] rawBody unavailable — ensure rawBody:true in NestFactory.create()');
      return false;
    }

    const expected = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;

    // timingSafeEqual requires equal-length buffers — length check first.
    // Different lengths → not equal (no timing leak needed; lengths are public).
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length) return false;

    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  // ─── Private: payload walking ─────────────────────────────────────────────

  private async processPayload(payload: Record<string, any>): Promise<void> {
    const inboundTasks: Array<Promise<void>> = [];
    const allStatuses: Array<{ id: string; status: string; timestamp: string }> = [];

    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};

        // ── Inbound messages ──────────────────────────────────────────────
        for (const msg of (value.messages ?? []) as any[]) {
          const phone = this.extractPhone(msg?.from);
          if (!phone) continue;

          // An interactive reply can be a button tap (Thanks) or a list-row tap
          // (menu selection). Extract whichever id is present.
          const interactiveId = this.extractInteractiveId(msg);

          // 1) Always upsert the contact session (records the reply / Thanks).
          inboundTasks.push(this.webhookService.handleInbound(phone, interactiveId));

          // 2) Conversational menu: any inbound that is NOT the Thanks button
          //    gets a reply — either the tailored menu (free text like "hi"),
          //    or the requested attendance (a tapped menu row).
          if (interactiveId !== 'attendance_thanks') {
            const menuActionId = WhatsAppMenuService.isMenuAction(interactiveId)
              ? interactiveId
              : null;
            inboundTasks.push(this.menuService.handleConversation(phone, menuActionId));
          }
        }

        // ── Delivery/read/failed status events ────────────────────────────
        for (const s of (value.statuses ?? []) as any[]) {
          if (s?.id && s?.status) {
            allStatuses.push({ id: s.id, status: s.status, timestamp: s.timestamp ?? '' });
          }
        }
      }
    }

    // Run both classes of work in parallel — no inter-dependency.
    const tasks: Array<Promise<void>> = [...inboundTasks];
    if (allStatuses.length > 0) {
      tasks.push(this.webhookService.handleStatuses(allStatuses));
    }

    if (tasks.length > 0) await Promise.all(tasks);
  }

  private extractPhone(from: unknown): string | null {
    if (typeof from !== 'string') return null;
    const n = from.replace(/\D/g, '');
    return n.length >= 7 && n.length <= 15 ? n : null;
  }

  /**
   * Pull the action id from an interactive reply.
   *   • button_reply → e.g. "attendance_thanks"
   *   • list_reply   → e.g. "att_self" / "att_child:<userId>"
   * Returns null for plain text / media / non-interactive messages.
   */
  private extractInteractiveId(msg: any): string | null {
    if (msg?.type !== 'interactive') return null;
    const i = msg.interactive;
    if (i?.type === 'button_reply') return i.button_reply?.id ?? null;
    if (i?.type === 'list_reply')   return i.list_reply?.id ?? null;
    return null;
  }
}
