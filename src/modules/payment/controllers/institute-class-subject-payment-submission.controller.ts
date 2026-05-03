import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ParseBigIntPipe } from '../../../common/pipes/parse-bigint.pipe';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { DeprecatedGuard } from '../../../auth/guards/deprecated.guard';
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteClassSubjectPaymentService } from '../services/institute-class-subject-payment.service';
import { CreateInstituteClassSubjectPaymentSubmissionDto, VerifyPaymentSubmissionDto, AdminVerifyStudentCspPaymentDto } from '../dto/create-institute-class-subject-payment-submission.dto';
import { SubmissionCreationSuccessResponseDto, PaginatedSubmissionsResponseDto, PaymentSubmissionStatusResponseDto, UserSubmissionDetailsResponseDto } from '../dto/institute-class-subject-payment-response.dto';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';

/**
 * @deprecated Subject-level payment submissions are DISABLED.
 * All payment submissions are now handled via the class-level payments system.
 * This controller returns HTTP 410 Gone for all endpoints.
 */
@ApiTags('Institute Class Subject Payment Submissions [DEPRECATED]')
@Controller('institute-class-subject-payment-submissions')
@UseGuards(DeprecatedGuard, JwtAuthGuard)
@ApiBearerAuth()
export class InstituteClassSubjectPaymentSubmissionController {
  constructor(
    private readonly paymentService: InstituteClassSubjectPaymentService,
  ) {}

  /**
   * Submit payment receipt
   * POST /institute-class-subject-payment-submissions/payment/:paymentId/submit
   * Access: Students, Parents (own submissions only)
   */
  @Post('payment/:paymentId/submit')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 🔒 5 submissions per 15 minutes
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {},
    parent: {}
  })
  @ApiOperation({ summary: 'Submit payment receipt URL (Student/Parent only)' })
  @ApiParam({ name: 'paymentId', type: String, description: 'Payment ID' })
  @ApiResponse({ status: 201, description: 'Payment submitted successfully', type: SubmissionCreationSuccessResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request - validation errors' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiResponse({ status: 409, description: 'Duplicate submission' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        paymentDate: { type: 'string', format: 'date-time' },
        transactionId: { type: 'string' },
        submittedAmount: { type: 'number' },
        notes: { type: 'string' },
        receiptUrl: { type: 'string', description: 'Receipt URL from /upload/verify-and-publish' }
      },
      required: ['paymentDate', 'submittedAmount']
    }
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async submitPayment(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Body() createSubmissionDto: CreateInstituteClassSubjectPaymentSubmissionDto,
    @Request() req: JwtRequest,
  ): Promise<SubmissionCreationSuccessResponseDto> {
    return await this.paymentService.submitPayment(paymentId, createSubmissionDto, createSubmissionDto.receiptUrl, req.user);
  }

  /**
   * Get all submissions for a payment
   * GET /institute-class-subject-payment-submissions/payment/:paymentId/submissions
   * Access: Admin/Teacher (all submissions), Students/Parents (own submissions)
   */
  @Get('payment/:paymentId/submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get all submissions for a payment' })
  @ApiParam({ name: 'paymentId', type: String, description: 'Payment ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiResponse({ status: 200, description: 'Submissions retrieved successfully', type: PaginatedSubmissionsResponseDto })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getPaymentSubmissions(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ): Promise<PaginatedSubmissionsResponseDto> {
    return this.paymentService.getSubmissions(paymentId, page, limit, req.user);
  }

  /**
   * Verify or reject a payment submission
   * PATCH /institute-class-subject-payment-submissions/submission/:submissionId/verify
   * Access: Institute Admin, Teachers (with subject access), Attendance Marker
   */
  @Patch('submission/:submissionId/verify')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true },
    attendanceMarker: {}
  })
  @ApiOperation({ summary: 'Verify or reject a payment submission (Admin/Teacher/AttendanceMarker)' })
  @ApiParam({ name: 'submissionId', type: String, description: 'Submission ID' })
  @ApiResponse({ status: 200, description: 'Submission verified successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - submission already processed' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async verifySubmission(
    @Param('submissionId', ParseBigIntPipe) submissionId: string,
    @Body() verifyDto: VerifyPaymentSubmissionDto,
    @Request() req: JwtRequest,
  ): Promise<{ success: boolean; message: string }> {
    return this.paymentService.verifySubmission(submissionId, verifyDto, req.user);
  }

  /**
   * Get submission status for a payment
   * GET /institute-class-subject-payment-submissions/payment/:paymentId/my-status
   * Access: Students, Parents (own status only)
   */
  @Get('payment/:paymentId/my-status')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {},
    parent: {},
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get my submission status for a payment' })
  @ApiParam({ name: 'paymentId', type: String, description: 'Payment ID' })
  @ApiResponse({ status: 200, description: 'Submission status retrieved successfully', type: PaymentSubmissionStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  async getMySubmissionStatus(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Request() req: JwtRequest,
  ): Promise<PaymentSubmissionStatusResponseDto> {
    return this.paymentService.getMySubmissionStatus(paymentId, req.user);
  }

  /**
   * Get my submissions for an institute/class/subject
   * GET /institute-class-subject-payment-submissions/institute/:instituteId/class/:classId/subject/:subjectId/my-submissions
   * Access: Students, Parents (own submissions only)
   */
  @Get('institute/:instituteId/class/:classId/subject/:subjectId/my-submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {},
    parent: {},
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get my submissions for a specific institute/class/subject' })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiParam({ name: 'classId', type: String, description: 'Class ID' })
  @ApiParam({ name: 'subjectId', type: String, description: 'Subject ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10)' })
  @ApiResponse({ status: 200, description: 'My submissions retrieved successfully' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getMySubmissions(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getMySubmissions(instituteId, classId, subjectId, page, limit, req.user);
  }

  /**
   * Get submission details by ID
   * GET /institute-class-subject-payment-submissions/submission/:submissionId
   * Access: Admin/Teacher (any submission), Students/Parents (own submission)
   */
  @Get('submission/:submissionId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  @ApiOperation({ summary: 'Get submission details by ID' })
  @ApiParam({ name: 'submissionId', type: String, description: 'Submission ID' })
  @ApiResponse({ status: 200, description: 'Submission details retrieved successfully with comprehensive preview' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async getSubmissionById(
    @Param('submissionId', ParseBigIntPipe) submissionId: string,
    @Request() req: JwtRequest,
  ): Promise<any> {
    return this.paymentService.getSubmissionById(submissionId, req.user);
  }

  /**
   * Delete submission (before verification only)
   * DELETE /institute-class-subject-payment-submissions/submission/:submissionId
   * Access: Submission creator only (before verification)
   */
  @Patch('submission/:submissionId/delete')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {},
    parent: {}
  })
  @ApiOperation({ summary: 'Delete unverified submission (Creator only)' })
  @ApiParam({ name: 'submissionId', type: String, description: 'Submission ID' })
  @ApiResponse({ status: 200, description: 'Submission deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete verified submission' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - not submission creator' })
  async deleteSubmission(
    @Param('submissionId', ParseBigIntPipe) submissionId: string,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.deleteSubmission(submissionId, req.user);
  }

  /**
   * Get all submissions for an institute/class/subject (Admin/Teacher)
   * GET /institute-class-subject-payment-submissions/institute/:instituteId/class/:classId/subject/:subjectId/all-submissions
   * Access: Institute Admin, Teachers (with subject access)
   */
  @Get('institute/:instituteId/class/:classId/subject/:subjectId/all-submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ summary: 'Get all submissions for a specific institute/class/subject (Admin/Teacher only)' })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiParam({ name: 'classId', type: String, description: 'Class ID' })
  @ApiParam({ name: 'subjectId', type: String, description: 'Subject ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'status', required: false, type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'All submissions retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getAllSubmissions(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Request() req?: any,
  ) {
    return this.paymentService.getAllSubmissions(instituteId, classId, subjectId, page, limit, req.user, status);
  }

  /**
   * Get submission statistics
   * GET /institute-class-subject-payment-submissions/institute/:instituteId/class/:classId/subject/:subjectId/stats
   * Access: Institute Admin, Teachers (with subject access)
   */
  @Get('institute/:instituteId/class/:classId/subject/:subjectId/stats')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true }
  })
  @ApiOperation({ summary: 'Get submission statistics for institute/class/subject (Admin/Teacher only)' })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiParam({ name: 'classId', type: String, description: 'Class ID' })
  @ApiParam({ name: 'subjectId', type: String, description: 'Subject ID' })
  @ApiResponse({ status: 200, description: 'Submission statistics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async getSubmissionStats(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getSubmissionStats(instituteId, classId, subjectId, req.user);
  }

  /**
   * Get all students for a payment with their payment status (Admin/Teacher view)
   * GET /institute-class-subject-payment-submissions/payment/:paymentId/students
   * Access: Institute Admin, Teachers (with subject access), Attendance Marker
   */
  @Get('payment/:paymentId/students')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true },
    attendanceMarker: {}
  })
  @ApiOperation({ summary: 'Get all students with their payment status for a specific payment (Admin/Teacher/AttendanceMarker)' })
  @ApiParam({ name: 'paymentId', type: String, description: 'Payment ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'Students with payment status retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Payment not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  async getStudentsForPayment(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getStudentsForPayment(paymentId, page, limit, req.user);
  }

  /**
   * Get all STUDENT members for an institute/class/subject with their payment status
   * GET /institute/:instituteId/class/:classId/subject/:subjectId/payment-submissions/payment/:paymentId/users/STUDENT
   * Access: Institute Admin, Teachers, Attendance Marker
   */
  @Get('institute/:instituteId/class/:classId/subject/:subjectId/payment-submissions/payment/:paymentId/users/STUDENT')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true },
    attendanceMarker: {}
  })
  @ApiOperation({
    summary: 'Get STUDENT members with payment status for a specific payment (scoped by institute/class/subject)',
    description:
      'Returns all active STUDENT members of the institute with their payment submission status for the given payment. ' +
      'Includes nameWithInitials, userId, instituteStudentId, instituteUserImage, and verification details (status, verifiedAt, amount).',
  })
  @ApiParam({ name: 'instituteId', type: String, description: 'Institute ID' })
  @ApiParam({ name: 'classId', type: String, description: 'Class ID' })
  @ApiParam({ name: 'subjectId', type: String, description: 'Subject ID' })
  @ApiParam({ name: 'paymentId', type: String, description: 'Payment ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'Student list with payment status retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Payment not found for given institute/class/subject' })
  async getStudentsByInstituteClassSubject(
    @Param('instituteId', ParseBigIntPipe) instituteId: string,
    @Param('classId', ParseBigIntPipe) classId: string,
    @Param('subjectId', ParseBigIntPipe) subjectId: string,
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.getStudentsByInstituteClassSubject(
      instituteId, classId, subjectId, paymentId, page, limit, req.user,
    );
  }

  /**
   * Admin manually verifies/records a payment for a specific student (class-subject context)
   * POST /institute-class-subject-payment-submissions/payment/:paymentId/student/:studentId/admin-verify
   * Access: Institute Admin, Teachers (with subject access), Attendance Marker, Superadmin
   */
  @Post('payment/:paymentId/student/:studentId/admin-verify')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: { requireSubject: true },
    attendanceMarker: {}
  })
  @ApiOperation({ summary: 'Admin/Teacher/AttendanceMarker verifies/records payment for a specific student' })
  @ApiParam({ name: 'paymentId', type: String, description: 'Payment ID' })
  @ApiParam({ name: 'studentId', type: String, description: 'Student user ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['amount', 'date'],
      properties: {
        amount: { type: 'number', description: 'Payment amount' },
        date: { type: 'string', format: 'date-time', description: 'Payment date' },
        notes: { type: 'string', description: 'Optional notes from admin', maxLength: 500 }
      }
    }
  })
  @ApiResponse({ status: 201, description: 'Payment verified for student successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - student already has a verified payment' })
  @ApiResponse({ status: 404, description: 'Payment or student not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - insufficient permissions' })
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async adminVerifyStudentCspPayment(
    @Param('paymentId', ParseBigIntPipe) paymentId: string,
    @Param('studentId', ParseBigIntPipe) studentId: string,
    @Body() dto: AdminVerifyStudentCspPaymentDto,
    @Request() req: JwtRequest,
  ) {
    return this.paymentService.adminVerifyStudentCspPayment(paymentId, studentId, dto, req.user);
  }
}
