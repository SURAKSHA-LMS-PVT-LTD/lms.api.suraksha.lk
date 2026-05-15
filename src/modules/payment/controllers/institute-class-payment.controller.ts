import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Request,
  UseGuards, UsePipes, ValidationPipe,
  ParseIntPipe, DefaultValuePipe, UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SerializeDatesInterceptor } from '../interceptors/serialize-dates.interceptor';
import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteClassPaymentService } from '../services/institute-class-payment.service';
import { CreateInstituteClassPaymentDto } from '../dto/create-institute-class-payment.dto';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';

@ApiTags('Institute Class Payments')
@Controller('institute-class-payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@UseInterceptors(SerializeDatesInterceptor)
export class InstituteClassPaymentController {
  constructor(private readonly paymentService: InstituteClassPaymentService) {}

  /**
   * POST /institute-class-payments/institute/:instituteId/class/:classId
   * Create a class-level payment request (Admin/Teacher)
   */
  @Post('institute/:instituteId/class/:classId')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true } })
  @ApiOperation({ summary: 'Create a new class-level payment request (Admin/Teacher only)' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async createPayment(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('classId', ParseIdPipe) classId: string,
    @Body() dto: CreateInstituteClassPaymentDto,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.createPayment(instituteId, classId, dto, req.user);
  }

  /**
   * GET /institute-class-payments/institute/:instituteId/class/:classId
   * Get all active payments for a class (all members)
   */
  @Get('institute/:instituteId/class/:classId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all payments for a class' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getPayments(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('classId', ParseIdPipe) classId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getPayments(instituteId, classId, page, limit, req.user);
  }

  /**
   * GET /institute-class-payments/institute/:instituteId/class/:classId/my-payments
   * Get student/parent's applicable payments for the class (inlined submissions)
   */
  @Get('institute/:instituteId/class/:classId/my-payments')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ student: {}, parent: {}, teacher: {}, anyInstituteRole: true })
  @ApiOperation({ summary: 'Get my applicable payments for this class (with inline submissions)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getMyApplicablePayments(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('classId', ParseIdPipe) classId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getMyApplicablePayments(instituteId, classId, page, limit, req.user);
  }

  /**
   * GET /institute-class-payments/payment/:paymentId
   * Get payment by ID
   */
  @Get('payment/:paymentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get payment by ID' })
  async getPaymentById(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getPaymentById(paymentId, req.user);
  }

  /**
   * PATCH /institute-class-payments/payment/:paymentId
   * Update a class payment
   */
  @Patch('payment/:paymentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true } })
  @ApiOperation({ summary: 'Update class payment (Admin/Creator only)' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async updatePayment(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Body() updateDto: Partial<CreateInstituteClassPaymentDto>,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.updatePayment(paymentId, updateDto, req.user);
  }

  /**
   * DELETE /institute-class-payments/payment/:paymentId
   * Soft delete a class payment (no submissions allowed)
   */
  @Delete('payment/:paymentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true } })
  @ApiOperation({ summary: 'Soft delete class payment (Admin/Creator only, no submissions allowed)' })
  async deletePayment(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.softDeletePayment(paymentId, req.user);
  }
}

