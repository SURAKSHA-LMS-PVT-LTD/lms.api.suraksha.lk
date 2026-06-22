import {
  Controller, Get, Post, Body, Param, Query, Ip, UseGuards, Logger, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../../common/decorators/public.decorator';
import { InstituteSelfRegistrationService, PublicRegistrationPayload } from './services/institute-self-registration.service';
import { UserOtpService } from '../user/services/user-otp.service';

/**
 * 🌐 PUBLIC REGISTRATION FORM CONTROLLER  (served under /public/forms)
 *
 * No auth — access is governed entirely by the unguessable link token. The institute
 * is always derived from the token server-side. Aggressively rate-limited.
 *
 * Phone verification is reverse-WhatsApp ONLY (the user sends a code from their own
 * WhatsApp; we never send an SMS/OTP outbound). Email uses an emailed code.
 */
@ApiTags('Public Registration Forms')
@Controller('public/forms')
@Public()
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class PublicRegistrationController {
  private readonly logger = new Logger(PublicRegistrationController.name);

  constructor(
    private readonly selfRegService: InstituteSelfRegistrationService,
    private readonly otpService: UserOtpService,
  ) {}

  // ── Form config ────────────────────────────────────────────────────────────

  @Get(':token')
  @ApiOperation({ summary: 'Get public registration form config (branding, toggles, classes/subjects)' })
  @ApiParam({ name: 'token' })
  async getConfig(@Param('token') token: string) {
    return this.selfRegService.getPublicFormConfig(token);
  }

  // ── Phone verification (reverse WhatsApp — never sends SMS) ───────────────────

  @Post(':token/verify/phone/request')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Request a reverse-WhatsApp OTP link for phone verification' })
  async requestPhone(
    @Param('token') token: string,
    @Body() body: { phoneNumber: string },
    @Ip() ip: string,
  ) {
    // Validate the token is live before issuing anything.
    await this.selfRegService.getPublicFormConfig(token);
    if (!body?.phoneNumber) throw new BadRequestException('phoneNumber is required');
    return this.otpService.requestRegistrationPhoneOtpWhatsApp(body.phoneNumber, ip);
  }

  @Get(':token/verify/phone/status')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Poll whether the reverse-WhatsApp phone OTP has been confirmed' })
  async phoneStatus(
    @Param('token') token: string,
    @Query('phoneNumber') phoneNumber: string,
  ) {
    if (!phoneNumber) throw new BadRequestException('phoneNumber is required');
    return this.otpService.getRegistrationPhoneOtpStatus(phoneNumber);
  }

  // ── Email verification (emailed code) ────────────────────────────────────────

  @Post(':token/verify/email/request')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Request an emailed OTP for email verification' })
  async requestEmail(
    @Param('token') token: string,
    @Body() body: { email: string },
    @Ip() ip: string,
  ) {
    await this.selfRegService.getPublicFormConfig(token);
    if (!body?.email) throw new BadRequestException('email is required');
    return this.otpService.requestRegistrationEmailOtp(body.email, ip);
  }

  @Post(':token/verify/email/confirm')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Confirm the emailed OTP code' })
  async confirmEmail(
    @Param('token') token: string,
    @Body() body: { email: string; code: string },
  ) {
    if (!body?.email || !body?.code) throw new BadRequestException('email and code are required');
    return this.otpService.verifyEmailOtp(body.email.trim().toLowerCase(), body.code);
  }

  // ── Existing-account lookup (after both verifications) ────────────────────────

  @Post(':token/existing/lookup')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'After OTP claim, return which profile fields are missing for an existing account' })
  async lookupExisting(
    @Param('token') token: string,
    @Body() body: { phoneNumber?: string; email?: string },
  ) {
    return this.selfRegService.lookupExistingForClaim(token, body);
  }

  @Post(':token/parent/lookup')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'After OTP-verifying a parent contact, prefill that parent if an account exists' })
  async lookupParent(
    @Param('token') token: string,
    @Body() body: { phoneNumber?: string; email?: string },
  ) {
    return this.selfRegService.lookupParentContact(token, body);
  }

  // ── Register / claim ─────────────────────────────────────────────────────────

  @Post(':token/register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Submit the public registration (creates a new user OR claims an existing account)' })
  async register(
    @Param('token') token: string,
    @Body() body: PublicRegistrationPayload,
    @Ip() ip: string,
  ) {
    return this.selfRegService.register(token, body, ip);
  }
}
