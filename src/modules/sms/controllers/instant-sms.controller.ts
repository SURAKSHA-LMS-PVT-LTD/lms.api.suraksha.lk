import { Controller, Post, Get, Body, Param, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InstantSmsService } from '../services/instant-sms.service';
import { SendSingleSmsDto, SendInstantBulkSmsDto, TopupCreditsDto, InstantSmsResponseDto, InstantSmsCreditBalanceResponseDto } from '../dto/instant-sms.dto';
import { JwtRequest } from '../../../common/interfaces/jwt-request.interface';
import { JwtAuthGuard, FlexibleAccessGuard, RequireAnyOfRoles, UserType } from '../../../auth/guards';

/**
 * Instant SMS Controller
 * 
 * Endpoints for sending instant SMS (no scheduling)
 * - Send single SMS
 * - Send bulk SMS with filters
 * - Check credit balance
 * - Top up credits
 */
@ApiTags('Instant SMS')
@Controller('sms/instant')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InstantSmsController {
  constructor(private readonly smsService: InstantSmsService) {}

  @Post('send-single')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 🔒 SECURITY: 10 SMS per minute to prevent spam/abuse
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send single SMS instantly (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'SMS sending initiated', type: InstantSmsResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request - invalid phone number or insufficient credits' })
  async sendSingle(
    @Body() dto: SendSingleSmsDto,
    @Req() req: JwtRequest,
  ): Promise<InstantSmsResponseDto> {
    return this.smsService.sendSingleSms(dto, req.user.s);
  }

  @Post('send-bulk')
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // 🔒 SECURITY: 3 bulk SMS per minute (stricter due to mass sending)
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send bulk SMS instantly with user filtering (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Bulk SMS sending initiated', type: InstantSmsResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request - no recipients found or insufficient credits' })
  async sendBulk(
    @Body() dto: SendInstantBulkSmsDto,
    @Req() req: JwtRequest,
  ): Promise<InstantSmsResponseDto> {
    return this.smsService.sendBulkSms(dto, req.user.s);
  }

  @Get('credits/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get SMS credit balance for an institute (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Credit balance retrieved', type: InstantSmsCreditBalanceResponseDto })
  async getCreditBalance(@Param('instituteId') instituteId: string): Promise<InstantSmsCreditBalanceResponseDto> {
    return this.smsService.getCreditBalance(instituteId);
  }

  @Post('credits/topup')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Top up SMS credits for an institute (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Credits added successfully', type: InstantSmsCreditBalanceResponseDto })
  async topupCredits(@Body() dto: TopupCreditsDto): Promise<InstantSmsCreditBalanceResponseDto> {
    return this.smsService.topupCredits(dto.instituteId, dto.amount);
  }

  @Get('campaigns/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get SMS campaigns for an institute (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Campaigns retrieved' })
  async getCampaigns(@Param('instituteId') instituteId: string) {
    return this.smsService.getCampaigns(instituteId);
  }

  @Get('campaign/:campaignId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get SMS campaign details (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Campaign details retrieved' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  async getCampaign(@Param('campaignId') campaignId: string) {
    return this.smsService.getCampaign(campaignId);
  }
}
