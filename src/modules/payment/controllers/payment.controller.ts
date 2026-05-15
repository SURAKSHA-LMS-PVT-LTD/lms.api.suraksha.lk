import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { Controller, Post, Get, Patch, Param, Body, Query, UseGuards, Request, ParseIntPipe, DefaultValuePipe, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { PaymentService } from '../services/payment.service';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { VerifyInstitutePaymentDto } from '../dto/verify-payment.dto';
import { PaymentResponseDto, PaymentListResponseDto, PaymentVerificationResponseDto, PaymentCreationResponseDto } from '../dto/payment-response.dto';
import { PaymentStatus } from '../entities/payment.entity';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';

@ApiTags('Payment')
@Controller('payment')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
  ) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 🔒 SECURITY: 5 payment submissions per 15 minutes
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a new payment submission with receipt URL - accessible to any authenticated user' })
  @ApiResponse({ status: 201, description: 'Payment created successfully', type: PaymentCreationResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request - validation errors' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async createPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @Request() req: JwtRequest,
  ): Promise<PaymentCreationResponseDto> {
    const userId = req.user.s;
    
    return await this.paymentService.createPayment(userId, createPaymentDto, createPaymentDto.paymentSlipUrl);
  }

  @Get('my-payments')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user payments - accessible to any authenticated user' })
  @ApiResponse({ status: 200, description: 'User payments retrieved', type: PaymentListResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getUserPayments(
    @Request() req: JwtRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<PaymentListResponseDto> {
    const userId = req.user.s;
    return this.paymentService.getUserPayments(userId, page, limit);
  }

  @Get('my-status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user payment status - accessible to any authenticated user' })
  @ApiResponse({ status: 200, description: 'User payment status retrieved' })
  async getUserPaymentStatus(@Request() req: JwtRequest) {
    const userId = req.user.s;
    return this.paymentService.getUserCurrentPaymentStatus(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get payment by ID - user can access their own payment' })
  @ApiResponse({ status: 200, description: 'Payment retrieved', type: PaymentResponseDto })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async getPaymentById(
    @Param('id', ParseBigIntPipe) id: string,
    @Request() req: JwtRequest,
  ): Promise<PaymentResponseDto> {
    const userId = req.user.s; // User can only access their own payment
    return this.paymentService.getPaymentById(id, userId);
  }

  // =================== SYSTEM ADMIN ONLY ENDPOINTS ===================
  // Institute admins have their own separate payment system

  @Get()
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Get all payments (SUPERADMIN only) - System payment module' })
  @ApiResponse({ status: 200, description: 'All payments retrieved', type: PaymentListResponseDto })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'status', required: false, enum: PaymentStatus, description: 'Filter by status' })
  @ApiQuery({ name: 'month', required: false, type: String, description: 'Filter by payment month (YYYY-MM)' })
  async getAllPayments(
    @Request() req: JwtRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('status') status?: PaymentStatus,
    @Query('month') paymentMonth?: string,
  ): Promise<PaymentListResponseDto> {
    return this.paymentService.getAllPayments(page, limit, status, paymentMonth);
  }

  @Patch(':id/verify')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Verify payment (SUPERADMIN only) - System payment module' })
  @ApiResponse({ status: 200, description: 'Payment verified successfully', type: PaymentVerificationResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request - payment not in pending status' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async verifyPayment(
    @Param('id', ParseBigIntPipe) id: string,
    @Body() verifyPaymentDto: VerifyInstitutePaymentDto,
    @Request() req: JwtRequest,
  ): Promise<PaymentVerificationResponseDto> {
    const verifierId = req.user.s;
    return this.paymentService.verifyPayment(id, verifyPaymentDto, verifierId);
  }

  @Post('reset-monthly')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN] })
  @ApiOperation({ summary: 'Reset monthly payments (Admin only)' })
  @ApiResponse({ status: 200, description: 'Monthly payments reset successfully' })
  async resetMonthlyPayments(@Request() req: JwtRequest) {
    // Access control will be handled by decorators
    return this.paymentService.resetMonthlyPayments();
  }
}

