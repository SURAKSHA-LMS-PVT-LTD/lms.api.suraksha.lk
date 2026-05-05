import {
  Controller, Post, Get, Patch,
  Param, Body, Query, Request,
  UseGuards, UsePipes, ValidationPipe,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteClassPaymentService } from '../services/institute-class-payment.service';
import { CreateInstituteClassPaymentSubmissionDto, VerifyClassPaymentSubmissionDto, AdminVerifyStudentClassPaymentDto } from '../dto/create-institute-class-payment-submission.dto';
import { SubmissionStatus } from '../entities/institute-class-payment-submission.entity';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';

@ApiTags('Institute Class Payment Submissions')
@Controller('institute-class-payment-submissions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InstituteClassPaymentSubmissionController {
  constructor(private readonly paymentService: InstituteClassPaymentService) { }

  /**
   * POST /institute-class-payment-submissions/payment/:paymentId/submit
   * Submit payment (Student/Parent)
   */
  @Post('payment/:paymentId/submit')
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ student: {}, parent: {} })
  @ApiOperation({ summary: 'Submit payment receipt (Student/Parent only)' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async submitPayment(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Body() dto: CreateInstituteClassPaymentSubmissionDto,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.submitPayment(paymentId, dto, dto.receiptUrl, req.user);
  }

  /**
   * POST /institute-class-payment-submissions/institute/:instituteId/class/:classId/payment/:paymentId/submit
   * Submit payment (Student/Parent) - full path variant for admin UI
   */
  @Post('institute/:instituteId/class/:classId/payment/:paymentId/submit')
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ student: {}, parent: {} })
  @ApiOperation({ summary: 'Submit payment receipt with institute/class context (Student/Parent only)' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async submitPaymentWithContext(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Body() dto: CreateInstituteClassPaymentSubmissionDto,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.submitPayment(paymentId, dto, dto.receiptUrl, req.user);
  }

  /**
   * GET /institute-class-payment-submissions/payment/:paymentId/submissions
   * Get all submissions for a payment
   */
  @Get('payment/:paymentId/submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ anyInstituteRole: true })
  @ApiOperation({ summary: 'Get all submissions for a payment' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getPaymentSubmissions(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getSubmissions(paymentId, page, limit, req.user);
  }

  /**
   * PATCH /institute-class-payment-submissions/submission/:submissionId/verify
   * Verify or reject a submission
   */
  @Patch('submission/:submissionId/verify')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true }, attendanceMarker: {} })
  @ApiOperation({ summary: 'Verify or reject a payment submission (Admin/Teacher)' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async verifySubmission(
    @Param('submissionId', ParseBigIntPipe) submissionId: string,
    @Body() dto: VerifyClassPaymentSubmissionDto,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.verifySubmission(submissionId, dto, req.user);
  }

  /**
   * GET /institute-class-payment-submissions/payment/:paymentId/my-status
   * Get my submission status for a payment
   */
  @Get('payment/:paymentId/my-status')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ student: {}, parent: {}, anyInstituteRole: true })
  @ApiOperation({ summary: 'Get my submission status for a payment' })
  async getMySubmissionStatus(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getMySubmissionStatus(paymentId, req.user);
  }

  /**
   * PATCH /institute-class-payment-submissions/submission/:submissionId/delete
   * Delete a pending submission (own submission only)
   */
  @Patch('submission/:submissionId/delete')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ student: {}, parent: {} })
  @ApiOperation({ summary: 'Delete unverified submission (creator only)' })
  async deleteSubmission(
    @Param('submissionId', ParseBigIntPipe) submissionId: string,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.deleteSubmission(submissionId, req.user);
  }

  /**
   * GET /institute-class-payment-submissions/institute/:instituteId/class/:classId/all-submissions
   * Get all submissions for a class (Admin/Teacher)
   */
  @Get('institute/:instituteId/class/:classId/all-submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true } })
  @ApiOperation({ summary: 'Get all submissions for a class (Admin/Teacher only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'] })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getAllSubmissions(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Request() req?: any,
  ) {
    return this.paymentService.getAllSubmissions(instituteId, classId, page, limit, req.user, status);
  }

  /**
   * GET /institute-class-payment-submissions/institute/:instituteId/student/:studentId/all-submissions
   * Get all class submissions for a student across all classes in the institute
   */
  @Get('institute/:instituteId/student/:studentId/all-submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: {}, attendanceMarker: {} })
  @ApiOperation({ summary: 'Get all class submissions for a student in an institute (Admin/Teacher only)' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getStudentAllClassSubmissions(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('studentId') studentId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Request() req?: any,
  ) {
    return this.paymentService.getStudentAllClassSubmissions(instituteId, studentId, limit, req.user);
  }

  /**
   * GET /institute-class-payment-submissions/institute/:instituteId/class/:classId/student/:studentId/submissions
   * Get all submissions for a student in a specific class
   */
  @Get('institute/:instituteId/class/:classId/student/:studentId/submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true }, attendanceMarker: {} })
  @ApiOperation({ summary: 'Get all submissions for a student in a specific class (Admin/Teacher)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getStudentClassSubmissions(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('studentId') studentId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Request() req?: any,
  ) {
    return this.paymentService.getStudentClassSubmissions(instituteId, classId, studentId, page, limit, req.user);
  }

  /**
   * GET /institute-class-payment-submissions/institute/:instituteId/class/:classId/stats
   * Get submission statistics for a class
   */
  @Get('institute/:instituteId/class/:classId/stats')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true } })
  @ApiOperation({ summary: 'Get submission statistics for a class (Admin/Teacher only)' })
  async getSubmissionStats(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getSubmissionStats(instituteId, classId, req.user);
  }

  /**
   * GET /institute-class-payment-submissions/institute/:instituteId/class/:classId/payment/:paymentId/submissions
   * Get all submissions for a class payment
   */
  @Get('institute/:instituteId/class/:classId/payment/:paymentId/submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true }, attendanceMarker: {} })
  @ApiOperation({ summary: 'Get all submissions for a class payment (Admin/Teacher)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getClassPaymentSubmissions(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getSubmissionsForClassPayment(instituteId, classId, paymentId, page, limit, req.user);
  }

  /**
   * GET /institute-class-payment-submissions/institute/:instituteId/class/:classId/payment/:paymentId/users/STUDENT
   * Get students with payment status for a specific class payment
   */
  @Get('institute/:instituteId/class/:classId/payment/:paymentId/users/STUDENT')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true }, attendanceMarker: {} })
  @ApiOperation({ summary: 'Get students with payment status for a class payment (Admin/Teacher)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getStudentsByInstituteClass(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getStudentsByInstituteClass(instituteId, classId, paymentId, page, limit, req.user);
  }

  /**
   * GET /institute-class-payment-submissions/institute/:instituteId/class/:classId/payment/:paymentId/students-details
   * Get students with payment details (alias for getStudentsByInstituteClass)
   */
  @Get('institute/:instituteId/class/:classId/payment/:paymentId/students-details')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true }, attendanceMarker: {} })
  @ApiOperation({ summary: 'Get students with payment details for a class payment (Admin/Teacher)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getStudentsWithPaymentDetails(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getStudentsByInstituteClass(instituteId, classId, paymentId, page, limit, req.user);
  }

  /**
   * GET /institute-class-payment-submissions/institute/:instituteId/class/:classId/my-submissions
   * Get current user's submissions for a specific class
   */
  @Get('institute/:instituteId/class/:classId/my-submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ student: {}, parent: {}, anyInstituteRole: true })
  @ApiOperation({ summary: 'Get my submissions for all payments in a class (Student/Parent)' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getMyClassSubmissions(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getMyClassSubmissions(instituteId, classId, req.user);
  }

  /**
   * POST /institute-class-payment-submissions/payment/:paymentId/student/:studentId/admin-verify
   * Admin manually verifies/records a payment for a specific student
   */
  @Post('payment/:paymentId/student/:studentId/admin-verify')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true }, attendanceMarker: {} })
  @ApiOperation({ summary: 'Admin/Teacher verifies/records payment for a specific student' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async adminVerifyStudentClassPayment(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Param('studentId', ParseBigIntPipe) studentId: string,
    @Body() dto: AdminVerifyStudentClassPaymentDto,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.adminVerifyStudentClassPayment(paymentId, studentId, dto, req.user);
  }

  /**
   * PATCH /institute-class-payment-submissions/institute/:instituteId/class/:classId/submission/:submissionId/verify
   * Verify a class payment submission
   */
  @Patch('institute/:instituteId/class/:classId/submission/:submissionId/verify')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true }, attendanceMarker: {} })
  @ApiOperation({ summary: 'Verify a class payment submission (Admin/Teacher)' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async verifyClassPaymentSubmission(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('submissionId', ParseBigIntPipe) submissionId: string,
    @Body() dto: VerifyClassPaymentSubmissionDto,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.verifySubmission(submissionId, dto, req.user);
  }

  /**
   * PATCH /institute-class-payment-submissions/institute/:instituteId/class/:classId/submission/:submissionId/reject
   * Reject a class payment submission
   */
  @Patch('institute/:instituteId/class/:classId/submission/:submissionId/reject')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({ global: [UserType.SUPERADMIN], instituteAdmin: true, teacher: { requireClass: true }, attendanceMarker: {} })
  @ApiOperation({ summary: 'Reject a class payment submission (Admin/Teacher)' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async rejectClassPaymentSubmission(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('submissionId', ParseBigIntPipe) submissionId: string,
    @Body() dto: { rejectionReason: string; notes?: string },
    @Request() req: JwtRequest,
  ) {
    const verifyDto: VerifyClassPaymentSubmissionDto = {
      status: SubmissionStatus.REJECTED,
      rejectionReason: dto.rejectionReason,
      notes: dto.notes,
    };
    return this.paymentService.verifySubmission(submissionId, verifyDto, req.user);
  }
}

