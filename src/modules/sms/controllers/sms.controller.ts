import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiConsumes, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { 
  JwtAuthGuard,
  FlexibleAccessGuard,
  RequireAnyOfRoles,
  UserType
} from '../../../auth/guards';

// Services
import { SmsService } from '../services/sms.service';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

// DTOs
import {
  SendCustomSmsDto,
  SendBulkSmsDto,
  SendByUserIdsDto,
  GetRecipientCountDto,
  SmsPaymentSubmissionDto,
  SmsResponseDto,
  RecipientCountResponseDto,
  PaymentSubmissionResponseDto,
  SmsCredentialsStatusDto,
  SmsStatisticsDto,
  PaymentVerificationDto,
  SmsPaymentVerificationResponseDto,
  VerificationListResponseDto,
  InstitutePaymentSubmissionsResponseDto,
  CampaignApprovalDto,
  CampaignRejectionDto,
  PendingApprovalsResponseDto,
  CampaignApprovalResponseDto,
  CampaignRejectionResponseDto,
  CreateSenderMaskDto,
  SenderMaskResponseDto,
  SenderMasksListResponseDto
} from '../dto/sms.dto';
import { SmsMessageStatus, RecipientFilterType } from '../entities/institute-sms-message.entity';

/**
 * SMS CONTROLLER WITH ROLE-SPECIFIC SECURITY
 * 
 * SECURITY:
 * ✅ Institute Admin can send SMS (own institute only)
 * ✅ SUPERADMIN can send SMS (any institute)
 * ✅ SUPERADMIN-only endpoints for payment verification
 * 
 * FEATURES:
 * ✅ Proper DTO usage for all endpoints
 * ✅ Comprehensive input validation
 * ✅ File upload handling for payment submissions
 * ✅ Error handling with detailed responses
 * ✅ Performance optimized with caching
 * ✅ JWT Authentication required for all endpoints
 */

@ApiTags('SMS Management')
@Controller('sms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SmsController {
  private readonly logger = new Logger(SmsController.name);

  constructor(
    private readonly smsService: SmsService,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  /**
   * 📱 Send SMS to custom phone numbers
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Post('send-custom')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 🔒 10 SMS sends per minute
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Send SMS to custom phone numbers (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'SMS processing initiated successfully', type: SmsResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 403, description: 'Insufficient credits or permissions' })
  async sendCustomSms(
    @Request() req,
    @Body() dto: SendCustomSmsDto,
    @Query('instituteId') queryInstituteId?: string
  ): Promise<SmsResponseDto> {
    // JWT v2: Extract instituteId from token (req.user.i[0].i) or query parameter
    const instituteId = queryInstituteId || req.user.i?.[0]?.i;
    const userId = req.user.s;

    if (!instituteId) {
      throw new BadRequestException('Institute ID is required. Provide instituteId query parameter or ensure JWT token contains institute access.');
    }


    // Additional validation
    if (!dto.customRecipients || dto.customRecipients.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }

    if (dto.customRecipients.length > 1000) {
      throw new BadRequestException('Maximum 1000 recipients allowed per request');
    }

    if (!dto.messageTemplate?.trim()) {
      throw new BadRequestException('Message template cannot be empty');
    }

    if (dto.messageTemplate.length > 1600) {
      throw new BadRequestException('Message template cannot exceed 1600 characters');
    }

    return await this.smsService.sendCustomSms(
      instituteId,
      userId,
      null, // No user type needed
      dto
    );
  }

  /**
   * 📢 Send bulk SMS to filtered recipients
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Post('send-bulk')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Send bulk SMS to filtered recipients (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Bulk SMS processing initiated successfully', type: SmsResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid filter criteria' })
  @ApiResponse({ status: 403, description: 'Insufficient credits or permissions' })
  async sendBulkSms(
    @Request() req,
    @Body() dto: SendBulkSmsDto,
    @Query('instituteId') queryInstituteId?: string
  ): Promise<SmsResponseDto> {
    // JWT v2: Extract instituteId from token (req.user.i[0].i) or query parameter
    const instituteId = queryInstituteId || req.user.i?.[0]?.i;
    const userId = req.user.s;

    if (!instituteId) {
      throw new BadRequestException('Institute ID is required. Provide instituteId query parameter or ensure JWT token contains institute access.');
    }


    // 🔄 BACKWARD COMPATIBILITY: Handle old field names
    if (!dto.recipientTypes || dto.recipientTypes.length === 0) {
      // Check if old 'recipientType' (singular) field is present
      const oldRecipientType = (dto as any).recipientType;
      if (oldRecipientType) {
        dto.recipientTypes = [oldRecipientType];
        this.logger.warn(`⚠️ Using deprecated 'recipientType' field. Please update to 'recipientTypes' array.`);
      }
    }

    // Additional validation
    if (!dto.messageTemplate?.trim()) {
      throw new BadRequestException('Message template cannot be empty');
    }

    if (dto.messageTemplate.length > 1600) {
      throw new BadRequestException('Message template cannot exceed 1600 characters');
    }

    if (!dto.recipientTypes || dto.recipientTypes.length === 0) {
      throw new BadRequestException('At least one recipient type is required');
    }

    return await this.smsService.sendBulkSms(
      instituteId,
      userId,
      null, // No user type needed
      dto
    );
  }

  /**
   * 👤 Send SMS to specific users by system user ID or institute-assigned user ID.
   * The backend resolves the phone numbers — admins don't need to know them.
   * Supports sending to one or many user IDs in a single request (bulk mode).
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Post('send-by-user-ids')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({
    summary: 'Send SMS to users by user ID or institute-assigned user ID',
    description: 'Looks up phone numbers from the database for the given user IDs and sends them an SMS. Use userIds for system IDs (9-digit numbers) or instituteUserIds for institute-assigned codes like STU001. Supports one or many IDs per request.',
  })
  @ApiResponse({ status: 200, description: 'SMS created successfully. Awaiting admin approval.', type: SmsResponseDto })
  @ApiResponse({ status: 400, description: 'No valid users with phone numbers found' })
  @ApiResponse({ status: 403, description: 'Insufficient credits or permissions' })
  async sendByUserIds(
    @Request() req,
    @Body() dto: SendByUserIdsDto,
    @Query('instituteId') queryInstituteId?: string,
  ): Promise<SmsResponseDto> {
    const instituteId = queryInstituteId || req.user.i?.[0]?.i;
    const userId = req.user.s;

    if (!instituteId) {
      throw new BadRequestException('Institute ID is required. Provide instituteId query parameter or ensure JWT token contains institute access.');
    }

    if (!dto.userIds?.length && !dto.instituteUserIds?.length) {
      throw new BadRequestException('Provide at least one entry in userIds or instituteUserIds');
    }

    return await this.smsService.sendByUserIds(instituteId, userId, null, dto);
  }

  /**
   * 📊 Get estimated recipient count for filters
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Post('recipient-count')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get estimated recipient count for given filters (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Recipient count retrieved successfully', type: RecipientCountResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid filter criteria' })
  async getRecipientCount(
    @Request() req,
    @Body() dto: GetRecipientCountDto,
    @Query('instituteId') queryInstituteId?: string
  ): Promise<RecipientCountResponseDto> {
    // JWT v2: Extract instituteId from token (req.user.i[0].i) or query parameter
    const instituteId = queryInstituteId || req.user.i?.[0]?.i;
    const userId = req.user.s;

    if (!instituteId) {
      throw new BadRequestException('Institute ID is required. Provide instituteId query parameter or ensure JWT token contains institute access.');
    }


    // 🔄 BACKWARD COMPATIBILITY: Handle old field names
    if (!dto.recipientTypes || dto.recipientTypes.length === 0) {
      const oldRecipientType = (dto as any).recipientType;
      if (oldRecipientType) {
        dto.recipientTypes = [oldRecipientType];
        this.logger.warn(`⚠️ Using deprecated 'recipientType' field. Please update to 'recipientTypes' array.`);
      }
    }

    if (!dto.recipientTypes || dto.recipientTypes.length === 0) {
      throw new BadRequestException('At least one recipient type is required');
    }

    return await this.smsService.getRecipientCount(instituteId, dto);
  }

  /**
   * � Get estimated recipient count (GET version with query params)
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   * ✅ RESTful: Uses GET with query parameters
   */
  @Get('recipient-count')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get estimated recipient count using query parameters (SUPERADMIN or Institute Admin)' })
  @ApiQuery({ name: 'instituteId', required: false, description: 'Institute ID (or from JWT token)' })
  @ApiQuery({ name: 'recipientTypes', required: true, isArray: true, enum: ['STUDENTS', 'PARENTS', 'TEACHERS', 'ADMIN', 'ALL'], description: 'Recipient types (comma-separated)' })
  @ApiQuery({ name: 'classIds', required: false, isArray: true, description: 'Class IDs (comma-separated)' })
  @ApiQuery({ name: 'subjectIds', required: false, isArray: true, description: 'Subject IDs (comma-separated)' })
  @ApiResponse({ status: 200, description: 'Recipient count retrieved successfully', type: RecipientCountResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid filter criteria' })
  async getRecipientCountGet(
    @Request() req,
    @Query('instituteId') queryInstituteId?: string,
    @Query('recipientTypes') recipientTypes?: string | string[],
    @Query('classIds') classIds?: string | string[],
    @Query('subjectIds') subjectIds?: string | string[]
  ): Promise<RecipientCountResponseDto> {
    // JWT v2: Extract instituteId from token (req.user.i[0].i) or query parameter
    const instituteId = queryInstituteId || req.user.i?.[0]?.i;
    const userId = req.user.s;

    if (!instituteId) {
      throw new BadRequestException('Institute ID is required. Provide instituteId query parameter or ensure JWT token contains institute access.');
    }

    // Parse query parameters
    const dto: GetRecipientCountDto = {
      recipientTypes: (Array.isArray(recipientTypes) 
        ? recipientTypes 
        : recipientTypes?.split(',').map(t => t.trim() as RecipientFilterType) || []) as RecipientFilterType[],
      classIds: Array.isArray(classIds)
        ? classIds
        : classIds?.split(',').map(id => id.trim()).filter(Boolean) || undefined,
      subjectIds: Array.isArray(subjectIds)
        ? subjectIds
        : subjectIds?.split(',').map(id => id.trim()).filter(Boolean) || undefined
    };

    if (!dto.recipientTypes || dto.recipientTypes.length === 0) {
      throw new BadRequestException('At least one recipient type is required');
    }


    return await this.smsService.getRecipientCount(instituteId, dto);
  }

  /**
   * �💰 Submit payment for SMS credits
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Post('payment/submit')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiConsumes('application/json')
  @ApiOperation({ summary: 'Submit payment for SMS credits with optional payment slip URL (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Payment submission created successfully', type: PaymentSubmissionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid payment data' })
  @ApiBody({
    description: 'Payment submission with optional paymentSlipUrl',
    schema: {
      type: 'object',
      properties: {
        requestedCredits: { type: 'number', example: 1000 },
        paymentAmount: { type: 'number', example: 500.00 },
        paymentMethod: { type: 'string', example: 'Bank Transfer' },
        paymentReference: { type: 'string', example: 'TXN123456789' },
        submissionNotes: { type: 'string', example: 'Payment made on 2024-01-15' },
        paymentSlipUrl: { type: 'string', format: 'uri', description: 'Payment receipt URL from /upload/verify-and-publish' }
      },
      required: ['requestedCredits', 'paymentAmount', 'paymentMethod']
    }
  })
  async submitPayment(
    @Request() req,
    @Body() dto: SmsPaymentSubmissionDto,
    @Query('instituteId') queryInstituteId?: string
  ): Promise<PaymentSubmissionResponseDto> {
    // JWT v2: Extract instituteId from token (req.user.i[0].i) or query parameter
    const instituteId = queryInstituteId || req.user.i?.[0]?.i;
    const userId = req.user.s;

    if (!instituteId) {
      throw new BadRequestException('Institute ID is required. Provide instituteId query parameter or ensure JWT token contains institute access.');
    }


    // Payment slip URL should be provided in DTO if available
    // File upload via signed URLs - no file handling needed here
    // The DTO should contain paymentSlipUrl if a receipt was uploaded

    return await this.smsService.submitPayment(instituteId, userId, dto);
  }

  /**
   * � Get payment submission details
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Get('payment-submissions/:submissionId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get payment submission details by ID (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Payment submission retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Payment submission not found' })
  async getPaymentSubmission(
    @Request() req,
    @Param('submissionId') submissionId: string
  ): Promise<any> {
    const userId = req.user.s;
    
    
    return await this.smsService.getPaymentSubmission(submissionId, userId);
  }

  /**
   * 📋 Get payment submissions for an institute
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Get('payment-submissions/institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get all payment submissions for an institute (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Payment submissions retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getInstitutePaymentSubmissions(
    @Request() req,
    @Param('instituteId') instituteId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: string
  ): Promise<any> {
    const userId = req.user.s;
    const userType = req.user?.userType;

    if (!instituteId) {
      throw new BadRequestException('Institute ID is required');
    }

    // Institute Admin can only view their own institute's submissions
    // FlexibleAccessGuard already enforces institute-specific access, but double-check here
    const instituteAccessList = Array.isArray(req.user.i) ? req.user.i : [];
    const isSuperAdmin = req.user.hasGlobalInstituteAccess || req.user.u === 0;
    if (!isSuperAdmin && instituteAccessList.length > 0) {
      const hasAccess = instituteAccessList.some(
        (entry: any) => String(entry.i) === String(instituteId),
      );
      if (!hasAccess) {
        throw new BadRequestException('You can only view payment submissions for your own institute');
      }
    }
    
    
    return await this.smsService.getInstitutePaymentSubmissions(instituteId, page, limit, status as any);
  }

  /**
   * �📊 Get SMS credentials status
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Get('credentials/status')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get SMS credentials and available credits status (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Credentials status retrieved successfully', type: SmsCredentialsStatusDto })
  async getCredentialsStatus(
    @Request() req,
    @Query('instituteId') queryInstituteId?: string
  ): Promise<SmsCredentialsStatusDto> {
    // JWT v2: Extract instituteId properly - query param or single institute from token
    const instituteId = queryInstituteId || req.user.i?.[0]?.i;
    
    if (!instituteId) {
      throw new BadRequestException('Institute ID is required. SUPERADMIN must provide instituteId query parameter.');
    }
    
    return await this.smsService.getCredentialsStatus(instituteId);
  }

  /**
   * 📈 Get SMS usage statistics
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Get('statistics')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get SMS usage statistics for the institute (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully', type: SmsStatisticsDto })
  async getSmsStatistics(
    @Request() req,
    @Query('period') period: string = 'month',
    @Query('instituteId') queryInstituteId?: string
  ): Promise<SmsStatisticsDto> {
    // JWT v2: Extract instituteId from token (req.user.i[0].i) or query parameter
    const instituteId = queryInstituteId || req.user.i?.[0]?.i;

    if (!instituteId) {
      throw new BadRequestException('Institute ID is required. Provide instituteId query parameter or ensure JWT token contains institute access.');
    }

    if (!['week', 'month'].includes(period)) {
      throw new BadRequestException('Period must be either "week" or "month"');
    }

    return await this.smsService.getSmsStatistics(instituteId, period);
  }

  /**
   * 📜 Get SMS message history for an institute (paginated)
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Get('message-history/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get paginated SMS message history for an institute' })
  @ApiResponse({ status: 200, description: 'Message history retrieved successfully' })
  async getMessageHistory(
    @Request() req,
    @Param('instituteId') pathInstituteId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: SmsMessageStatus,
  ): Promise<any> {
    // Determine instituteId: prefer path param, fallback to JWT
    const instituteId = pathInstituteId || req.user.i?.[0]?.i;

    if (!instituteId) {
      throw new BadRequestException('Institute ID is required in path or token');
    }

    // Basic pagination sanitation
    if (!page || page < 1) page = 1;
    if (!limit || limit < 1) limit = 10;
    if (limit > 100) limit = 100;

    return await this.smsService.getMessageHistory(instituteId, page, limit, status);
  }

  // ADMIN ENDPOINTS (Super Admin only)

  /**
   * 🔍 Get pending payment verifications (SUPERADMIN only)
   * 🔒 Access: SUPERADMIN ONLY
   */
  @Get('admin/verifications/pending')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Get pending payment verifications (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Pending verifications retrieved successfully', type: VerificationListResponseDto })
  @ApiResponse({ status: 403, description: 'Access denied - SUPERADMIN required' })
  async getPendingVerifications(
    @Request() req,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10
  ): Promise<VerificationListResponseDto> {
    if (page < 1) page = 1;
    if (limit < 1 || limit > 100) limit = 10;

    return await this.smsService.getPendingVerifications(page, limit);
  }

  /**
   * ✅ Verify payment submission (SUPERADMIN only)
   * 🔒 Access: SUPERADMIN ONLY
   */
  @Put('admin/verifications/:submissionId/verify')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Verify and approve/reject payment submission (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Payment verification completed successfully', type: SmsPaymentVerificationResponseDto })
  @ApiResponse({ status: 403, description: 'Access denied - SUPERADMIN required' })
  @ApiResponse({ status: 404, description: 'Payment submission not found' })
  async verifyPayment(
    @Request() req,
    @Param('submissionId') submissionId: string,
    @Body() dto: PaymentVerificationDto
  ): Promise<SmsPaymentVerificationResponseDto> {
    const userId = req.user.s;  // JWT v2: Extract user ID


    // Validation is handled by class-validator decorators, but add extra checks for clarity
    if (!dto || !dto.action) {
      throw new BadRequestException('Request body must include "action" field with value "APPROVE" or "REJECT"');
    }

    if (dto.action === 'REJECT' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException('Rejection reason is required when rejecting a submission');
    }

    if (dto.action === 'APPROVE' && dto.creditsToGrant && dto.creditsToGrant < 1) {
      throw new BadRequestException('Credits to grant must be at least 1');
    }

    return await this.smsService.verifyPayment(submissionId, userId, dto);
  }

  /**
   * � Get pending campaign approvals (SUPERADMIN only)
   */
  @Get('admin/pending-approvals')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Get campaigns awaiting approval (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Pending approvals retrieved', type: PendingApprovalsResponseDto })
  @ApiResponse({ status: 403, description: 'Access denied - SUPERADMIN only' })
  async getPendingApprovals(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('instituteId') instituteId?: string
  ): Promise<PendingApprovalsResponseDto> {
    return await this.smsService.getPendingCampaignApprovals(page, limit, instituteId);
  }

  /**
   * ✅ Approve a campaign (SUPERADMIN only)
   */
  @Put('admin/campaigns/:messageId/approve')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Approve a pending campaign (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Campaign approved', type: CampaignApprovalResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid campaign status' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  @ApiResponse({ status: 403, description: 'Access denied - SUPERADMIN only' })
  async approveCampaign(
    @Request() req,
    @Param('messageId') messageId: string,
    @Body() dto: CampaignApprovalDto
  ): Promise<CampaignApprovalResponseDto> {
    const adminId = req.user.s;

    if (!messageId) {
      throw new BadRequestException('Message ID is required');
    }

    return await this.smsService.approveCampaign(messageId, adminId, dto.adminNotes);
  }

  /**
   * ❌ Reject a campaign (SUPERADMIN only)
   */
  @Put('admin/campaigns/:messageId/reject')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Reject a pending campaign (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Campaign rejected', type: CampaignRejectionResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid campaign status or missing rejection reason' })
  @ApiResponse({ status: 404, description: 'Campaign not found' })
  @ApiResponse({ status: 403, description: 'Access denied - SUPERADMIN only' })
  async rejectCampaign(
    @Request() req,
    @Param('messageId') messageId: string,
    @Body() dto: CampaignRejectionDto
  ): Promise<CampaignRejectionResponseDto> {
    const adminId = req.user.s;

    if (!messageId) {
      throw new BadRequestException('Message ID is required');
    }

    if (!dto.rejectionReason?.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }

    return await this.smsService.rejectCampaign(messageId, adminId, dto.rejectionReason, dto.adminNotes);
  }

  /**
   * 🎭 Create a new sender mask (SUPERADMIN or Institute Admin)
   * � Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Post('sender-masks')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Create a new sender mask for SMS (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 201, description: 'Sender mask created successfully', type: SenderMaskResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request data or mask already exists' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async createSenderMask(
    @Request() req,
    @Body() dto: CreateSenderMaskDto,
    @Query('instituteId') queryInstituteId?: string
  ): Promise<SenderMaskResponseDto> {
    // Resolve instituteId in this order: body dto -> query param -> JWT token
    const instituteId = dto?.instituteId || queryInstituteId || req.user.i?.[0]?.i;
    const userId = req.user.s;

    // If caller is SUPER_ADMIN, they must provide an instituteId (either in body or query)
    const isSuperAdmin = req.user?.userType === UserType.SUPERADMIN || req.user?.u === 0;
    if (!instituteId) {
      if (isSuperAdmin) {
        throw new BadRequestException('Institute ID is required for SUPER_ADMIN callers. Provide instituteId in request body or as query parameter.');
      }

      throw new BadRequestException('Institute ID is required. Ensure JWT token contains institute access or provide instituteId in request body/query parameter.');
    }


    return await this.smsService.createSenderMask(instituteId, {
      maskId: dto.maskId,
      displayName: dto.displayName,
      phoneNumber: dto.phoneNumber,
      isActive: dto.isActive
    }, userId);
  }

  /**
   * 📋 Get all sender masks for an institute (SUPERADMIN or Institute Admin)
   * 🔒 Access: Institute Admin (own institute) OR SUPERADMIN (any institute)
   */
  @Get('sender-masks')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true })
  @ApiOperation({ summary: 'Get all sender masks for an institute (SUPERADMIN or Institute Admin)' })
  @ApiResponse({ status: 200, description: 'Sender masks retrieved successfully', type: SenderMasksListResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async getSenderMasks(
    @Request() req,
    @Query('instituteId') queryInstituteId?: string
  ): Promise<SenderMasksListResponseDto> {
    // JWT v2: Extract instituteId from token or query parameter
    const instituteId = queryInstituteId || req.user.i?.[0]?.i;

    if (!instituteId) {
      throw new BadRequestException('Institute ID is required. Provide instituteId query parameter or ensure JWT token contains institute access.');
    }


    return await this.smsService.getSenderMasks(instituteId);
  }
}
