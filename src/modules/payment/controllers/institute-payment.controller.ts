import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { InstitutePaymentService } from '../services/institute-payment.service';
import { InputValidationService } from '../../../common/services/input-validation.service';
import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';
import {
  CreateInstitutePaymentDto,
  UpdateInstitutePaymentDto,
  GetInstitutePaymentsQueryDto,
} from '../dto/institute-payment.dto';

@ApiTags('Institute Payments')
@Controller('institute-payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InstitutePaymentController {
  constructor(
    private readonly institutePaymentService: InstitutePaymentService,
    private readonly inputValidationService: InputValidationService,
  ) {}

  /**
   * Create a new institute payment request
   * POST /institute-payments/institute/:instituteId/payments
   * Access: Institute Admin only
   */
  @Post('institute/:instituteId/payments')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 🔒 10 payment creations per minute
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Create a new institute payment request (Admin only)' })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiResponse({ status: 201, description: 'Payment created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation errors' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @UsePipes(new ValidationPipe({ 
    transform: true, 
    whitelist: true, 
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true }
  }))
  async createPayment(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Body() createDto: CreateInstitutePaymentDto,
    @Request() req: JwtRequest,
  ) {
    // Validate and sanitize instituteId
    const sanitizedInstituteId = this.inputValidationService.sanitizeId(instituteId);
    
    // Additional DTO validation
    const validatedDto = await this.inputValidationService.validateAndSanitizeDto(createDto, CreateInstitutePaymentDto);
    
    return this.institutePaymentService.createPayment(sanitizedInstituteId, validatedDto, req.user);
  }

  /**
   * Get all institute payments with filtering and pagination
   * GET /institute-payments/institute/:instituteId/payments
   * Access: All enrolled members (Students, Teachers, Parents, Admins)
   */
  @Get('institute/:instituteId/payments')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get all institute payments with filtering and pagination' })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE', 'EXPIRED'], description: 'Payment status' })
  @ApiResponse({ status: 200, description: 'Payments retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @UsePipes(new ValidationPipe({ 
    transform: true, 
    whitelist: true, 
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true }
  }))
  async getPayments(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Query() queryDto: GetInstitutePaymentsQueryDto,
    @Request() req: JwtRequest,
  ) {
    // Validate and sanitize instituteId
    const sanitizedInstituteId = this.inputValidationService.sanitizeId(instituteId);
    
    // Validate pagination parameters
    const { page, limit } = this.inputValidationService.sanitizePaginationParams(queryDto.page, queryDto.limit);
    queryDto.page = page;
    queryDto.limit = limit;
    
    return this.institutePaymentService.getPayments(sanitizedInstituteId, queryDto, req.user);
  }

  /**
   * Get my applicable payments (for students/parents/teachers)
   * GET /institute-payments/institute/:instituteId/my-payments
   * Access: Enrolled Students, Parents, Teachers, or any institute member
   */
  @Get('institute/:instituteId/my-payments')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getMyApplicablePayments(
    @Param('instituteId') instituteId: string,
    @Query() queryDto: GetInstitutePaymentsQueryDto,
    @Request() req: JwtRequest,
  ) {
    return this.institutePaymentService.getMyApplicablePayments(instituteId, queryDto, req.user);
  }

  /**
   * Get specific payment details
   * GET /institute-payments/institute/:instituteId/payments/:paymentId
   * Access: All enrolled members (data filtered based on role)
   */
  @Get('institute/:instituteId/payments/:paymentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  async getPaymentById(
    @Param('instituteId') instituteId: string,
    @Param('paymentId') paymentId: string,
    @Request() req: JwtRequest,
  ) {
    return this.institutePaymentService.getPaymentById(instituteId, paymentId, req.user);
  }

  /**
   * Update payment details
   * PATCH /institute-payments/institute/:instituteId/payments/:paymentId
   * Access: Institute Admin only
   */
  @Patch('institute/:instituteId/payments/:paymentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async updatePayment(
    @Param('instituteId') instituteId: string,
    @Param('paymentId') paymentId: string,
    @Body() updateDto: UpdateInstitutePaymentDto,
    @Request() req: JwtRequest,
  ) {
    return this.institutePaymentService.updatePayment(instituteId, paymentId, updateDto, req.user);
  }

  /**
   * Get payment statistics for institute
   * GET /institute-payments/institute/:instituteId/stats
   * Access: Institute Admin only
   */
  @Get('institute/:instituteId/stats')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  async getPaymentStats(
    @Param('instituteId') instituteId: string,
    @Request() req: JwtRequest,
  ) {
    return this.institutePaymentService.getPaymentStatistics(instituteId, req.user);
  }

  /**
   * Get my payment summary (for enrolled members)
   * GET /institute-payments/institute/:instituteId/my-summary
   * Access: All enrolled members (Students, Teachers, Parents, Admins)
   */
  @Get('institute/:instituteId/my-summary')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  async getMyPaymentSummary(
    @Param('instituteId') instituteId: string,
    @Request() req: JwtRequest,
  ) {
    return this.institutePaymentService.getMyPaymentSummary(instituteId, req.user);
  }
}
