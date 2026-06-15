import {
  Controller, Post, Get, Delete, Body, Param, Query, UseGuards,
  HttpException, HttpStatus, Logger, Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../auth/decorators/flexible-access.decorator';
import { UserType } from '../user/enums/user-type.enum';
import { AttendanceNotificationService } from '../attendance/services/attendance-notification.service';
import { WhatsAppBroadcastService, AudienceFilter } from './whatsapp-broadcast.service';

class PreviewDto {
  filter: AudienceFilter;
}

class SendDto {
  filter: AudienceFilter;
  message: string;                 // text body / caption (supports {placeholders})
  name?: string;
  templateId?: string;
  sessionOpenOnly?: boolean;       // only send to recipients with an open 24h window
  // Rich content (all optional — default is plain text):
  messageType?: 'text' | 'image' | 'video' | 'document' | 'audio' | 'interactive';
  mediaUrl?: string;               // for image/video/document/audio
  fileName?: string;               // for document
  interactive?: any;               // raw WhatsApp interactive object (buttons/list/flow JSON)
}

class TemplateDto {
  id?: string;
  name: string;
  description?: string;
  body: string;
  flowJson?: string;
  placeholders?: string[];
}

@ApiTags('Admin WhatsApp Broadcast')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, FlexibleAccessGuard)
@RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
@Controller('api/whatsapp/broadcast')
export class WhatsAppBroadcastController {
  private readonly logger = new Logger(WhatsAppBroadcastController.name);

  constructor(
    private readonly svc: WhatsAppBroadcastService,
    private readonly notifService: AttendanceNotificationService,
  ) {}

  /** Count the audience a filter resolves to (total + how many have a phone). */
  @Post('audience/preview')
  @ApiOperation({ summary: 'Preview audience count for a filter' })
  async preview(@Body() dto: PreviewDto) {
    if (!dto?.filter) throw new HttpException('filter is required', HttpStatus.BAD_REQUEST);
    const counts = await this.svc.countAudience(dto.filter);
    return { ...counts };
  }

  /** Resolve a small sample of the audience (for the UI preview list). */
  @Post('audience/sample')
  @ApiOperation({ summary: 'Resolve a sample of recipients for a filter' })
  async sample(@Body() dto: PreviewDto) {
    if (!dto?.filter) throw new HttpException('filter is required', HttpStatus.BAD_REQUEST);
    const rows = await this.svc.resolveAudience(dto.filter, 25);
    return { sample: rows.slice(0, 25), shown: Math.min(25, rows.length) };
  }

  /**
   * Send a broadcast to everyone matching the filter. The filter (not a stale
   * client list) defines the audience, so the count the admin saw is what gets
   * sent. Each message has its {placeholders} substituted per recipient.
   */
  @Post('send')
  @ApiOperation({ summary: 'Send a WhatsApp broadcast to a filtered audience' })
  async send(@Body() dto: SendDto, @Request() req: any) {
    if (!dto?.message?.trim()) throw new HttpException('message is required', HttpStatus.BAD_REQUEST);
    if (!dto?.filter) throw new HttpException('filter is required', HttpStatus.BAD_REQUEST);

    const counts = await this.svc.countAudience(dto.filter);
    const recipients = await this.svc.resolveAudience(dto.filter);

    if (recipients.length === 0) {
      throw new HttpException('No recipients with a phone number matched the filter', HttpStatus.BAD_REQUEST);
    }
    if (recipients.length > 5000) {
      throw new HttpException('Audience exceeds 5000. Narrow the filter.', HttpStatus.BAD_REQUEST);
    }

    let sent = 0, failed = 0, skippedClosed = 0, openSession = 0;

    // Pre-count open sessions for reporting (the stub currently returns true).
    for (const r of recipients) {
      if (r.phone && this.notifService.isWhatsAppSessionOpen(r.phone)) openSession++;
    }

    const sendQueue = dto.sessionOpenOnly
      ? recipients.filter(r => r.phone && this.notifService.isWhatsAppSessionOpen(r.phone))
      : recipients;
    skippedClosed = recipients.length - sendQueue.length;

    const BATCH = 10;
    for (let i = 0; i < sendQueue.length; i += BATCH) {
      const batch = sendQueue.slice(i, i + BATCH);
      await Promise.all(batch.map(async (r) => {
        try {
          const body = this.svc.renderBody(dto.message, r);
          // Substitute placeholders inside any interactive object too.
          const interactive = dto.interactive
            ? JSON.parse(this.svc.renderBody(JSON.stringify(dto.interactive), r))
            : undefined;
          const res = await this.sendOneMessage(r.phone!, {
            type: dto.messageType || 'text',
            body,
            mediaUrl: dto.mediaUrl,
            fileName: dto.fileName,
            interactive,
          });
          if (res.success) {
            this.notifService.markWhatsAppInteraction(r.phone!);
            sent++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }));
      if (i + BATCH < sendQueue.length) await new Promise(res => setTimeout(res, 200));
    }

    const status = failed === 0 ? 'COMPLETED' : sent === 0 ? 'FAILED' : 'PARTIAL';

    const campaign = await this.svc.recordCampaign({
      name: dto.name,
      body: dto.message,
      templateId: dto.templateId,
      filterSnapshot: dto.filter as any,
      totalMatched: counts.total,
      totalTargeted: sendQueue.length,
      sentCount: sent,
      failedCount: failed,
      skippedNoPhone: counts.total - counts.withPhone,
      skippedClosedSession: skippedClosed,
      openSessionCount: openSession,
      status: status as any,
      createdBy: req?.user?.s,
    });

    return {
      campaignId: campaign.id,
      summary: {
        matched: counts.total,
        withPhone: counts.withPhone,
        openSession,
        targeted: sendQueue.length,
        sent,
        failed,
        skippedClosedSession: skippedClosed,
        skippedNoPhone: counts.total - counts.withPhone,
        status,
      },
    };
  }

  // ── Templates ──
  @Get('templates')
  @ApiOperation({ summary: 'List message/flow templates' })
  listTemplates() {
    return this.svc.listTemplates();
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create or update a template' })
  saveTemplate(@Body() dto: TemplateDto, @Request() req: any) {
    return this.svc.saveTemplate(dto, req?.user?.s);
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Soft-delete a template' })
  deleteTemplate(@Param('id') id: string) {
    return this.svc.deleteTemplate(id);
  }

  // ── Campaign history ──
  @Get('campaigns')
  @ApiOperation({ summary: 'List past broadcast campaigns' })
  listCampaigns(@Query('limit') limit = '50') {
    return this.svc.listCampaigns(parseInt(limit, 10) || 50);
  }

  /**
   * Send one WhatsApp session message of any supported type.
   * Builds the right Graph API payload for text / image / video / document /
   * audio / interactive (buttons, list, or a flow JSON object).
   */
  private async sendOneMessage(
    phone: string,
    content: {
      type: 'text' | 'image' | 'video' | 'document' | 'audio' | 'interactive';
      body: string;            // text body or media caption
      mediaUrl?: string;
      fileName?: string;
      interactive?: any;
    },
  ): Promise<{ success: boolean; deliveryId?: string; error?: string }> {
    try {
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
      if (!phoneNumberId || !accessToken) {
        return { success: false, error: 'WhatsApp credentials not configured' };
      }

      const to = phone.replace('+', '');
      const payload: any = { messaging_product: 'whatsapp', to, type: content.type };

      switch (content.type) {
        case 'image':
          if (!content.mediaUrl) return { success: false, error: 'mediaUrl required for image' };
          payload.image = { link: content.mediaUrl, caption: content.body || undefined };
          break;
        case 'video':
          if (!content.mediaUrl) return { success: false, error: 'mediaUrl required for video' };
          payload.video = { link: content.mediaUrl, caption: content.body || undefined };
          break;
        case 'audio':
          if (!content.mediaUrl) return { success: false, error: 'mediaUrl required for audio' };
          payload.audio = { link: content.mediaUrl };
          break;
        case 'document':
          if (!content.mediaUrl) return { success: false, error: 'mediaUrl required for document' };
          payload.document = {
            link: content.mediaUrl,
            caption: content.body || undefined,
            filename: content.fileName || 'document',
          };
          break;
        case 'interactive':
          if (!content.interactive) return { success: false, error: 'interactive object required' };
          payload.interactive = content.interactive;
          break;
        case 'text':
        default:
          payload.type = 'text';
          payload.text = { body: content.body };
          break;
      }

      const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (response.ok && result.messages) return { success: true, deliveryId: result.messages[0]?.id };
      return { success: false, error: result.error?.message || 'Send failed' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
