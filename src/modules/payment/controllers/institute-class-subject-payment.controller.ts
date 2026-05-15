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
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UseInterceptors } from '@nestjs/common';
import { SerializeDatesInterceptor } from '../interceptors/serialize-dates.interceptor';
import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { ParseIdPipe } from '../../../common/pipes/parse-id.pipe';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { DeprecatedGuard } from '../../../auth/guards/deprecated.guard';
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteClassSubjectPaymentService } from '../services/institute-class-subject-payment.service';
import { CreateInstituteClassSubjectPaymentDto } from '../dto/create-institute-class-subject-payment.dto';
import { PaymentCreationSuccessResponseDto, PaginatedPaymentsResponseDto, InstituteClassSubjectPaymentResponseDto } from '../dto/institute-class-subject-payment-response.dto';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';

/**
 * @deprecated Subject-level payments are DISABLED.
 * All subject enrollment payment tracking is now handled via the class-level payments system.
 * This controller returns HTTP 410 Gone for all endpoints.
 */
@ApiTags('Institute Class Subject Payments [DEPRECATED]')
@Controller('institute-class-subject-payments')
@UseGuards(DeprecatedGuard, JwtAuthGuard)
@ApiBearerAuth()
@UseInterceptors(SerializeDatesInterceptor)
export class InstituteClassSubjectPaymentController {
  constructor(
    private readonly paymentService: InstituteClassSubjectPaymentService,
  ) {}

  /**
   * Create a new payment request
   * POST /institute-class-subject-payments/institute/:instituteId/class/:classId/subject/:subjectId
   * Access: Institute Admin, Teachers (with subject access)
   */
  @Post('institute/:instituteId/class/:classId/subject/:subjectId')
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 🔒 10 payment creations per minute
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ summary: 'Create a new payment request (Admin/Teacher only)' })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiParam({ name: 'classId', type: String, description: 'Class ID' })
  @ApiParam({ name: 'subjectId', type: String, description: 'Subject ID' })
  @ApiResponse({ status: 201, description: 'Payment created successfully', type: PaymentCreationSuccessResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })


  @UsePipes(new ValidationPipe({ transform: true }))
  async createPayment(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('classId', ParseIdPipe) classId: string,
    @Param('subjectId', ParseIdPipe) subjectId: string,
    @Body() createPaymentDto: CreateInstituteClassSubjectPaymentDto,
    @Request() req: JwtRequest,
  ): Promise<PaymentCreationSuccessResponseDto> {
    return this.paymentService.createPayment(instituteId, classId, subjectId, createPaymentDto, req.user);
  }

  /**
   * Get all payments for a specific institute/class/subject
   * GET /institute-class-subject-payments/institute/:instituteId/class/:classId/subject/:subjectId
   * Access: All enrolled members (Students, Teachers, Parents, Admins)
   */
  @Get('institute/:instituteId/class/:classId/subject/:subjectId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get all payments for a specific institute/class/subject' })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiParam({ name: 'classId', type: String, description: 'Class ID' })
  @ApiParam({ name: 'subjectId', type: String, description: 'Subject ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiResponse({ status: 200, description: 'Payments retrieved successfully', type: PaginatedPaymentsResponseDto })


  @UsePipes(new ValidationPipe({ transform: true }))
  async getPayments(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('classId', ParseIdPipe) classId: string,
    @Param('subjectId', ParseIdPipe) subjectId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ): Promise<PaginatedPaymentsResponseDto> {
    return this.paymentService.getPayments(instituteId, classId, subjectId, page, limit, req.user);
  }

  /**
   * Get my applicable payments for a specific subject
   * GET /institute-class-subject-payments/institute/:instituteId/class/:classId/subject/:subjectId/my-payments
   * Access: Enrolled Students, Parents, Teachers
   */
  @Get('institute/:instituteId/class/:classId/subject/:subjectId/my-payments')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {},
    parent: {},
    teacher: {},
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get my applicable payments for this subject' })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiParam({ name: 'classId', type: String, description: 'Class ID' })
  @ApiParam({ name: 'subjectId', type: String, description: 'Subject ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiResponse({ status: 200, description: 'My applicable payments retrieved successfully' })


  @UsePipes(new ValidationPipe({ transform: true }))
  async getMyApplicablePayments(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('classId', ParseIdPipe) classId: string,
    @Param('subjectId', ParseIdPipe) subjectId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getMyApplicablePayments(instituteId, classId, subjectId, page, limit, req.user);
  }

  /**
   * Get payment by ID
   * GET /institute-class-subject-payments/payment/:paymentId
   * Access: All enrolled members (data filtered based on role)
   */
  @Get('payment/:paymentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get payment by ID' })
  @ApiParam({ name: 'paymentId', type: String, description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'Payment retrieved successfully', type: InstituteClassSubjectPaymentResponseDto })
  @ApiResponse({ status: 404, description: 'Payment not found' })

  async getPaymentById(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Request() req: JwtRequest,
  ): Promise<InstituteClassSubjectPaymentResponseDto> {
    return this.paymentService.getPaymentById(paymentId, req.user);
  }

  /**
   * Update payment details
   * PATCH /institute-class-subject-payments/payment/:paymentId
   * Access: Institute Admin, Payment Creator (Teacher)
   */
  @Patch('payment/:paymentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ summary: 'Update payment details (Admin/Creator only)' })
  @ApiParam({ name: 'paymentId', type: String, description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'Payment updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })

  @UsePipes(new ValidationPipe({ transform: true }))
  async updatePayment(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Body() updateDto: Partial<CreateInstituteClassSubjectPaymentDto>,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.updatePayment(paymentId, updateDto, req.user);
  }

  /**
   * Get all payments for an institute class (Admin/Teacher only)
   * GET /institute-class-subject-payments/institute/:instituteId/class/:classId
   * Access: Institute Admin, Class Teachers
   */
  @Get('institute/:instituteId/class/:classId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireClass: true }
  })
  @ApiOperation({ summary: 'Get all payments for an institute class (Admin/Teacher only)' })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiParam({ name: 'classId', type: String, description: 'Class ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiResponse({ status: 200, description: 'Class payments retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async getClassPayments(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('classId', ParseIdPipe) classId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getClassPayments(instituteId, classId, page, limit, req.user);
  }

  /**
   * Get all payments for an institute (Admin only)
   * GET /institute-class-subject-payments/institute/:instituteId
   * Access: Institute Admin only
   */
  @Get('institute/:instituteId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true
  })
  @ApiOperation({ summary: 'Get all payments for an institute (Admin only)' })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiResponse({ status: 200, description: 'Institute payments retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async getInstitutePayments(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getInstitutePayments(instituteId, page, limit, req.user);
  }

  /**
   * Get enrolled users for payment submissions
   * GET /institute-class-subject-payments/institute/:instituteId/class/:classId/subject/:subjectId/users
   * Access: Institute Admin, Teachers
   */
  @Get('institute/:instituteId/class/:classId/subject/:subjectId/users')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ summary: 'Get enrolled users for payment submissions' })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiParam({ name: 'classId', type: String, description: 'Class ID' })
  @ApiParam({ name: 'subjectId', type: String, description: 'Subject ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 32)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async getEnrolledUsers(
    @Param('instituteId', ParseIdPipe) instituteId: string,
    @Param('classId', ParseIdPipe) classId: string,
    @Param('subjectId', ParseIdPipe) subjectId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(32), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getEnrolledUsers(instituteId, classId, subjectId, page, limit, req.user);
  }

  /**
   * Soft delete a class-subject payment (only if no submissions exist)
   * DELETE /institute-class-subject-payments/payment/:paymentId
   * Access: Institute Admin, Payment Creator (Teacher)
   */
  @Delete('payment/:paymentId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true },
  })
  @ApiOperation({
    summary: 'Soft delete class-subject payment (Admin/Creator only, no submissions allowed)',
    description: 'Deactivates a payment request. Only allowed if there are zero submissions. This is a soft delete — the record is preserved but marked inactive.',
  })
  @ApiParam({ name: 'paymentId', type: String, description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'Payment deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete — submissions exist' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async deletePayment(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.softDeletePayment(paymentId, req.user);
  }
}

