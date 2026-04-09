import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { FlexibleAccessGuard } from '../../../auth/guards/flexible-access.guard';
import { RequireAnyOfRoles } from '../../../auth/decorators/flexible-access.decorator';
import { UserType } from '../../user/enums/user-type.enum';
import { InstitutePaymentService } from '../services/institute-payment.service';
import { JwtRequest } from '@common/interfaces/jwt-request.interface';
import {
  CreateInstitutePaymentSubmissionDto,
  VerifyInstitutePaymentSubmissionDto,
  GetInstitutePaymentSubmissionsQueryDto,
} from '../dto/institute-payment.dto';

@Controller('institute-payment-submissions')
@UseGuards(JwtAuthGuard)
export class InstitutePaymentSubmissionController {
  constructor(private readonly institutePaymentService: InstitutePaymentService) {}

  /**
   * Submit a payment for a specific payment request
   * POST /institute-payment-submissions/institute/:instituteId/payment/:paymentId/submit
   * Access: Students, Parents (enrolled members)
   */
  @Post('institute/:instituteId/payment/:paymentId/submit')
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 🔒 5 submissions per 15 minutes
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {},
    parent: {},
    anyInstituteRole: true
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        paymentAmount: { type: 'number' },
        paymentMethod: { type: 'string' },
        transactionReference: { type: 'string' },
        paymentDate: { type: 'string' },
        paymentRemarks: { type: 'string' },
        receiptUrl: { type: 'string', description: 'Receipt URL from /upload/verify-and-publish' },
        lateFeeApplied: { type: 'number' }
      }
    }
  })


  @UsePipes(new ValidationPipe({ 
    transform: true, 
    whitelist: true, 
    transformOptions: { enableImplicitConversion: true }
  }))
  async submitPayment(
    @Param('instituteId') instituteId: string,
    @Param('paymentId') paymentId: string,
    @Body() createSubmissionDto: CreateInstitutePaymentSubmissionDto,
    @Request() req: JwtRequest,
  ) {
    return this.institutePaymentService.submitPayment(
      instituteId,
      paymentId,
      createSubmissionDto,
      req.user
    );
  }

  /**
   * Get all payment submissions for a specific payment (Admin and Teachers)
   * GET /institute-payment-submissions/institute/:instituteId/payment/:paymentId/submissions
   * Access: Institute Admin, Teachers (with institute access)
   * 
   * Query Parameters:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 10, max: 100)
   * - status: Filter by submission status (PENDING, VERIFIED, REJECTED)
   * - paymentMethod: Filter by payment method (BANK_TRANSFER, ONLINE_PAYMENT, etc.)
   * - paymentDateFrom: Filter submissions from this payment date (YYYY-MM-DD)
   * - paymentDateTo: Filter submissions to this payment date (YYYY-MM-DD)
   * - submissionDateFrom: Filter by submission created date from (YYYY-MM-DD)
   * - submissionDateTo: Filter by submission created date to (YYYY-MM-DD)
   * - verificationDateFrom: Filter by verification date from (YYYY-MM-DD)
   * - verificationDateTo: Filter by verification date to (YYYY-MM-DD)
   * - amountFrom: Filter by minimum amount
   * - amountTo: Filter by maximum amount
   * - search: Search in transaction reference, payment remarks, or notes
   * - studentId: Filter by specific student ID
   * - studentName: Filter by student name (partial match)
   * - sortBy: Sort field (paymentDate, submissionDate, verificationDate, amount, status, studentName)
   * - sortOrder: Sort direction (ASC, DESC)
   * - hasLateFee: Filter submissions with/without late fees (true/false)
   * - hasAttachment: Filter submissions with/without file attachments (true/false)
   */
  @Get('institute/:instituteId/payment/:paymentId/submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getPaymentSubmissions(
    @Param('instituteId') instituteId: string,
    @Param('paymentId') paymentId: string,
    @Query() queryDto: GetInstitutePaymentSubmissionsQueryDto,
    @Request() req: JwtRequest,
  ) {
    return this.institutePaymentService.getPaymentSubmissions(
      instituteId,
      paymentId,
      queryDto,
      req.user
    );
  }

  /**
   * Get my payment submissions
   * GET /institute-payment-submissions/institute/:instituteId/my-submissions
   * Access: Students, Parents (enrolled members)
   */
  @Get('institute/:instituteId/my-submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    student: {},
    parent: {},
    anyInstituteRole: true
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getMySubmissions(
    @Param('instituteId') instituteId: string,
    @Query() queryDto: GetInstitutePaymentSubmissionsQueryDto,
    @Request() req: JwtRequest,
  ) {
    return this.institutePaymentService.getMySubmissions(instituteId, queryDto, req.user);
  }

  /**
   * Get student payment submissions (for parents, admins, and teachers)
   * GET /institute-payment-submissions/institute/:instituteId/student/:studentId/submissions
   * Access: Parents (their students), Institute Admin, Teachers
   */
  @Get('institute/:instituteId/student/:studentId/submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {},
    parent: { requireStudent: true }
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getStudentSubmissions(
    @Param('instituteId') instituteId: string,
    @Param('studentId') studentId: string,
    @Query() queryDto: GetInstitutePaymentSubmissionsQueryDto,
    @Request() req: JwtRequest,
  ) {
    return this.institutePaymentService.getStudentSubmissions(
      instituteId,
      studentId,
      queryDto,
      req.user
    );
  }

  /**
   * Verify a payment submission (Admin and Teachers)
   * PATCH /institute-payment-submissions/institute/:instituteId/submission/:submissionId/verify
   * Access: Institute Admin, Teachers (with institute access)
   * 
   * Request Body:
   * - status: "VERIFIED" | "REJECTED" (required)
   * - rejectionReason: string (required if status is REJECTED)
   * - notes: string (optional admin notes)
   */
  @Patch('institute/:instituteId/submission/:submissionId/verify')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async verifySubmission(
    @Param('instituteId') instituteId: string,
    @Param('submissionId') submissionId: string,
    @Body() verifyDto: VerifyInstitutePaymentSubmissionDto,
    @Request() req: JwtRequest,
  ) {
    // Extract paymentId from the submission - we need to get it from the database
    // The service will handle the paymentId validation internally
    return this.institutePaymentService.verifySubmission(
      instituteId,
      'auto-detected', // Service will get this from submission
      submissionId,
      verifyDto,
      req.user
    );
  }

  /**
   * Get specific submission details
   * GET /institute-payment-submissions/institute/:instituteId/submission/:submissionId
   * Access: Submitter (owner), Parents (their student's), Institute Admin, Teachers
   */
  @Get('institute/:instituteId/submission/:submissionId')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    anyInstituteRole: true
  })
  async getSubmissionById(
    @Param('instituteId') instituteId: string,
    @Param('submissionId') submissionId: string,
    @Request() req: JwtRequest,
  ) {
    return this.institutePaymentService.getSubmissionById(instituteId, submissionId, req.user);
  }

  /**
   * Get pending submissions for review (Admin and Teachers)
   * GET /institute-payment-submissions/institute/:instituteId/pending-submissions
   * Access: Institute Admin, Teachers (with institute access)
   */
  @Get('institute/:instituteId/pending-submissions')
  @UseGuards(FlexibleAccessGuard)
  @RequireAnyOfRoles({
    global: [UserType.SUPERADMIN],
    instituteAdmin: true,
    teacher: {}
  })
  @UsePipes(new ValidationPipe({ transform: true }))
  async getPendingSubmissions(
    @Param('instituteId') instituteId: string,
    @Query() queryDto: GetInstitutePaymentSubmissionsQueryDto,
    @Request() req: JwtRequest,
  ) {
    return this.institutePaymentService.getPendingSubmissions(instituteId, queryDto, req.user);
  }
}
