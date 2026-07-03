import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import * as crypto from 'crypto';
import {
  UserOtpEntity,
  OtpType,
  OtpPurpose,
  OtpDeliveryMethod,
} from '../../modules/user/entities/user-otp.entity';
import { now, nowTimestamp } from '../utils/timezone.util';

/**
 * Shared "reverse-OTP via WhatsApp" mechanics.
 *
 * Reverse-OTP flow: the server generates a code and returns a wa.me deep
 * link with the code pre-filled as the message text. The user taps the
 * link and sends that message themselves — no message is sent BY us, so
 * this never costs anything and never depends on the WhatsApp Business
 * template/session-window rules that outbound sends do.
 *
 * This service centralizes the three pieces every caller previously
 * duplicated:
 *   1. buildOtpLink(code)         — the wa.me deep link (ONE canonical
 *      message format, used both when generating the link and when
 *      parsing it back out of an inbound message).
 *   2. createPendingOtp(...)      — invalidate old pending rows for the
 *      same key + create a fresh UserOtpEntity row.
 *   3. confirmFromInboundText(...) — called by the WhatsApp webhook for
 *      every inbound text message; extracts the code, finds the newest
 *      matching pending row across ANY purpose/caller, marks it verified.
 *
 * Callers keep their own purpose-specific logic (conflict checks, which
 * contact to use, daily-limit policy, response shape) — this service only
 * owns the parts that must behave identically everywhere so the inbound
 * webhook has exactly one contract to satisfy.
 */
@Injectable()
export class WhatsAppOtpService {
  private readonly logger = new Logger(WhatsAppOtpService.name);

  constructor(
    @InjectRepository(UserOtpEntity)
    private readonly otpRepository: Repository<UserOtpEntity>,
  ) {}

  /** Generate a 6-digit numeric OTP code. */
  generateOtpCode(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /**
   * Build the wa.me deep link the user taps/scans to send the OTP to us.
   * ONE canonical message format — confirmFromInboundText() below relies on
   * every producer using this same builder so the code is always extractable.
   */
  buildOtpLink(otpCode: string): string {
    const businessNumber = (process.env.WHATSAPP_BUSINESS_NUMBER || '').replace(/[^\d]/g, '');
    const text = encodeURIComponent(`OTP ${otpCode}`);
    return `https://wa.me/${businessNumber}?text=${text}`;
  }

  /** Throws if WhatsApp verification isn't configured on this server. */
  assertConfigured(): void {
    if (!process.env.WHATSAPP_BUSINESS_NUMBER) {
      throw new BadRequestException('WhatsApp verification is not configured on this server.');
    }
  }

  /**
   * Invalidate any still-pending WHATSAPP rows for this key (expire them
   * immediately) and create a fresh pending row. Returns the new code + link.
   */
  async createPendingOtp(params: {
    userId?: string;
    email?: string;
    phoneNumber?: string;
    otpType: OtpType;
    otpPurpose: OtpPurpose;
    expiryMinutes: number;
    ipAddress?: string;
  }): Promise<{ otpCode: string; waLink: string; expiresAt: Date }> {
    const { userId, email, phoneNumber, otpType, otpPurpose, expiryMinutes, ipAddress } = params;

    // Invalidate previous pending rows sharing the same identity + purpose.
    await this.otpRepository.update(
      {
        ...(userId ? { userId } : {}),
        ...(email ? { email } : {}),
        ...(phoneNumber ? { phoneNumber } : {}),
        otpPurpose,
        deliveryMethod: OtpDeliveryMethod.WHATSAPP,
        isVerified: false,
        expiresAt: MoreThan(now()),
      },
      { expiresAt: now() },
    );

    const otpCode = this.generateOtpCode();
    const expiresAt = new Date(nowTimestamp() + expiryMinutes * 60 * 1000);
    const createdDate = now().toISOString().slice(0, 10);

    await this.otpRepository.save(
      this.otpRepository.create({
        userId,
        email,
        phoneNumber,
        otpCode,
        otpType,
        otpPurpose,
        deliveryMethod: OtpDeliveryMethod.WHATSAPP,
        expiresAt,
        createdAt: now(),
        createdDate,
        ipAddress,
      }),
    );

    return { otpCode, waLink: this.buildOtpLink(otpCode), expiresAt };
  }

  /**
   * One-shot status check for a "Next"/poll click. Matches the newest
   * WHATSAPP row for the given key (+ optional purpose filter).
   */
  async getStatus(params: {
    userId?: string;
    email?: string;
    phoneNumber?: string;
    otpPurpose?: OtpPurpose;
  }): Promise<{ verified: boolean; expired: boolean; otpId?: string }> {
    const { userId, email, phoneNumber, otpPurpose } = params;
    const otp = await this.otpRepository.findOne({
      where: {
        ...(userId ? { userId } : {}),
        ...(email ? { email } : {}),
        ...(phoneNumber ? { phoneNumber } : {}),
        ...(otpPurpose ? { otpPurpose } : {}),
        deliveryMethod: OtpDeliveryMethod.WHATSAPP,
      },
      order: { createdAt: 'DESC' },
    });

    if (!otp) return { verified: false, expired: false };
    const expired = !otp.isVerified && otp.expiresAt.getTime() <= nowTimestamp();
    return { verified: otp.isVerified, expired, otpId: otp.isVerified ? String(otp.id) : undefined };
  }

  /**
   * Called by the WhatsApp inbound webhook for every plain-text message.
   * Extracts a 6-digit code from the text and, if a matching pending
   * WHATSAPP row exists (any purpose, any caller), marks it verified.
   *
   * Deliberately does NOT gate on sender phone == otp.phoneNumber: for
   * phone-CHANGE / registration flows the number being verified may not yet
   * have WhatsApp on it, so the code itself (shown only to the session that
   * requested it) is the actual secret. The sender's number is still
   * recorded on waSenderPhone for audit.
   *
   * Never throws — the webhook must always return 200 to Meta regardless
   * of whether this message turned out to be an OTP confirmation.
   */
  async confirmFromInboundText(senderPhone: string | null, text: string | null | undefined): Promise<void> {
    if (!text) return;
    const match = text.match(/\b(\d{6})\b/);
    if (!match) return;
    const otpCode = match[1];

    try {
      const otp = await this.otpRepository.findOne({
        where: {
          otpCode,
          deliveryMethod: OtpDeliveryMethod.WHATSAPP,
          isVerified: false,
          expiresAt: MoreThan(now()),
        },
        order: { createdAt: 'DESC' },
      });
      if (!otp) return;

      await this.otpRepository.update(otp.id, {
        isVerified: true,
        verifiedAt: now(),
        waSenderPhone: senderPhone ?? undefined,
      });
      this.logger.log(`[WA] Reverse-OTP confirmed: otpId=${otp.id}, purpose=${otp.otpPurpose}`);
    } catch (err) {
      this.logger.error(`[WA] Reverse-OTP confirm failed: ${(err as Error).message}`);
    }
  }
}
