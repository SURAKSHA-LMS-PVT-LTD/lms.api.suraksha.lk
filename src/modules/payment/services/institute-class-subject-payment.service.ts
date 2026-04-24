import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { InstituteClassSubjectPayment, PaymentStatus, PaymentTargetType } from '../entities/institute-class-subject-payment.entity';
import { InstituteClassSubjectPaymentSubmission, SubmissionStatus } from '../entities/institute-class-subject-payment-submission.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassSubjectStudent } from '../../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteUserType } from '../../institute_mudules/institue_user/enums/institute-user-type.enum';
import { InstituteUserStatus } from '../../institute_mudules/institue_user/enums/institute-user-status.enum';
import { JwtPayload } from '../../../common/interfaces/jwt-request.interface';
import { CreateInstituteClassSubjectPaymentDto } from '../dto/create-institute-class-subject-payment.dto';
import { CreateInstituteClassSubjectPaymentSubmissionDto, VerifyPaymentSubmissionDto, AdminVerifyStudentCspPaymentDto } from '../dto/create-institute-class-subject-payment-submission.dto';
import { InstituteClassSubjectPaymentResponseDto, InstituteClassSubjectPaymentSubmissionResponseDto, PaymentCreationSuccessResponseDto, SubmissionCreationSuccessResponseDto, PaginatedPaymentsResponseDto, PaginatedSubmissionsResponseDto } from '../dto/institute-class-subject-payment-response.dto';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { UserManagementService } from '../../../common/services/cache-user-management.service';
import { UserType } from '../../user/enums/user-type.enum';
import { AsyncEmailService } from '../../../common/services/async-email.service';
import { getCurrentSriLankaTime } from '../../../common/utils/timezone.util';

@Injectable()
export class InstituteClassSubjectPaymentService {
  private readonly logger = new Logger(InstituteClassSubjectPaymentService.name);

  constructor(
    @InjectRepository(InstituteClassSubjectPayment)
    private readonly paymentRepository: Repository<InstituteClassSubjectPayment>,
    @InjectRepository(InstituteClassSubjectPaymentSubmission)
    private readonly submissionRepository: Repository<InstituteClassSubjectPaymentSubmission>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(InstituteClassSubjectStudent)
    private readonly classSubjectStudentRepository: Repository<InstituteClassSubjectStudent>,
    private readonly cloudStorageService: CloudStorageService,
    private readonly userManagementService: UserManagementService,
    private readonly dataSource: DataSource,
    private readonly asyncEmailService: AsyncEmailService,
  ) {}

  /**
   * Resolve the user's institute-level role from the database.
   * Returns instituteRole (STUDENT, PARENT, TEACHER, INSTITUTE_ADMIN, etc.)
   */
  private async getUserInstituteRole(user: JwtPayload, instituteId: string): Promise<{ hasAccess: boolean; instituteRole?: string }> {
    try {
      const userEntity = await this.userRepository.findOne({
        where: { id: user.s },
        select: ['id', 'userType', 'isActive'],
      });
      if (!userEntity || !userEntity.isActive) {
        return { hasAccess: false };
      }
      // Superadmins and org managers bypass institute enrollment
      if (userEntity.userType === UserType.SUPERADMIN || userEntity.userType === UserType.ORGANIZATION_MANAGER || user.u === 0 || user.u === 1) {
        return { hasAccess: true, instituteRole: 'SUPERADMIN' };
      }
      const membership = await this.instituteUserRepository.findOne({
        where: { userId: user.s, instituteId, status: InstituteUserStatus.ACTIVE },
      });
      if (!membership) {
        return { hasAccess: false };
      }
      return { hasAccess: true, instituteRole: membership.instituteUserType };
    } catch (error: any) {
      this.logger.warn(`getUserInstituteRole failed: ${error?.message}`);
      return { hasAccess: false };
    }
  }

  /**
   * Returns true if the institute role is a payer (STUDENT or PARENT).
   * Admins, teachers, and other staff roles are NOT payers.
   */
  private isPayerRole(instituteRole?: string): boolean {
    return instituteRole === InstituteUserType.STUDENT || instituteRole === InstituteUserType.PARENT;
  }

  async createPayment(
    instituteId: string,
    classId: string,
    subjectId: string,
    createPaymentDto: CreateInstituteClassSubjectPaymentDto,
    user: JwtPayload,
  ): Promise<PaymentCreationSuccessResponseDto> {
    // Validate access permissions
    this.validatePaymentCreationAccess(user, instituteId, classId, subjectId);

    // Validate user exists
    const creator = await this.userRepository.findOne({ where: { id: user.s } }); // JWT v2 user ID
    if (!creator) {
      throw new NotFoundException({
        success: false,
        message: 'Creator user not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Create payment
    const timestamp = new Date(); // real UTC — MySQL2 timezone:'+05:30' stores as Sri Lanka time
    const payment = this.paymentRepository.create({
      instituteId,
      classId,
      subjectId,
      createdBy: user.s,
      title: createPaymentDto.title,
      description: createPaymentDto.description,
      targetType: createPaymentDto.targetType,
      priority: createPaymentDto.priority,
      amount: createPaymentDto.amount,
      documentUrl: createPaymentDto.documentUrl,
      lastDate: new Date(createPaymentDto.lastDate),
      notes: createPaymentDto.notes,
      bankName: createPaymentDto.bankName,
      accountHolderName: createPaymentDto.accountHolderName,
      accountHolderNumber: createPaymentDto.accountHolderNumber,
      status: PaymentStatus.ACTIVE,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    return {
      success: true,
      message: 'Payment created successfully',
      data: {
        paymentId: savedPayment.id,
        status: savedPayment.status,
      },
    };
  }

  async getPayments(
    instituteId: string,
    classId: string,
    subjectId: string,
    page: number = 1,
    limit: number = 10,
    user: JwtPayload,
  ): Promise<PaginatedPaymentsResponseDto> {
    // Validate access permissions
    this.validatePaymentAccessPermissions(user, instituteId, classId, subjectId);

    const [payments, total] = await this.paymentRepository.findAndCount({
      where: {
        instituteId,
        classId,
        subjectId,
        isActive: true, // Only show active payments
      },
      relations: ['creator', 'submissions'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const responseData = payments.map(payment => this.mapPaymentToResponse(payment));

    return {
      data: responseData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPaymentById(
    paymentId: string,
    user: JwtPayload,
  ): Promise<InstituteClassSubjectPaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['creator', 'submissions'],
    });

    if (!payment) {
      throw new NotFoundException({
        success: false,
        message: 'Payment not found',
        error: 'PAYMENT_NOT_FOUND'
      });
    }

    // Validate access permissions
    this.validatePaymentAccessPermissions(user, payment.instituteId, payment.classId, payment.subjectId);

    return this.mapPaymentToResponse(payment);
  }

  async submitPayment(
    paymentId: string,
    createSubmissionDto: CreateInstituteClassSubjectPaymentSubmissionDto,
    file: string,
    user: JwtPayload,
  ): Promise<SubmissionCreationSuccessResponseDto> {
    // Find payment
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException({
        success: false,
        message: 'Payment not found',
        error: 'PAYMENT_NOT_FOUND'
      });
    }

    // FIXED: Only payer roles (STUDENT/PARENT) can submit payments
    const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, payment.instituteId);
    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to this institute',
        error: 'NO_INSTITUTE_ACCESS',
      });
    }
    if (!this.isPayerRole(instituteRole)) {
      throw new ForbiddenException({
        success: false,
        message: 'Only students and parents can submit payments',
        error: 'NOT_A_PAYER_ROLE',
      });
    }

    // FIXED: Check targetType matches the user's role
    if (instituteRole === InstituteUserType.STUDENT && payment.targetType === PaymentTargetType.PARENTS) {
      throw new ForbiddenException({
        success: false,
        message: 'This payment is targeted at parents only',
        error: 'PAYMENT_TARGET_MISMATCH',
      });
    }
    if (instituteRole === InstituteUserType.PARENT && payment.targetType === PaymentTargetType.STUDENTS) {
      throw new ForbiddenException({
        success: false,
        message: 'This payment is targeted at students only',
        error: 'PAYMENT_TARGET_MISMATCH',
      });
    }

    // Check if payment is still active
    if (payment.status !== PaymentStatus.ACTIVE) {
      throw new BadRequestException({
        success: false,
        message: 'Payment is no longer accepting submissions',
        error: 'PAYMENT_INACTIVE'
      });
    }

    // Check if last date has passed
    if (new Date() > payment.lastDate) {
      throw new BadRequestException({
        success: false,
        message: 'Payment submission deadline has passed',
        error: 'PAYMENT_EXPIRED'
      });
    }

    // Check if user already submitted for this payment
    const existingSubmission = await this.submissionRepository.findOne({
      where: {
        paymentId,
        userId: user.s, // JWT v2 user ID
      },
    });

    if (existingSubmission) {
      // Allow re-submission only if the existing submission is a partial payment (student pays remaining balance)
      const allowResubmit = [
        SubmissionStatus.REJECTED,
        SubmissionStatus.HALF_VERIFIED,
        SubmissionStatus.QUARTER_VERIFIED,
      ].includes(existingSubmission.status);
      if (!allowResubmit) {
        throw new BadRequestException({
          success: false,
          message: 'You have already submitted a payment for this request',
          error: 'DUPLICATE_SUBMISSION'
        });
      }
    }

    // Get user details and institute user type
    const submitter = await this.userRepository.findOne({ where: { id: user.s } });
    if (!submitter) {
      throw new NotFoundException({
        success: false,
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // ✅ Handle receiptUrl from DTO or file parameter (backward compatibility)
    const receiptUrl = createSubmissionDto.receiptUrl || file;
    
    let uploadResult: { url: string; key?: string };
    if (typeof receiptUrl === 'string') {
      // URL from /upload/verify-and-publish or DTO
      uploadResult = { url: receiptUrl };
    } else {
      throw new BadRequestException({
        success: false,
        message: 'File upload is deprecated. Use receiptUrl from /upload/verify-and-publish.',
        error: 'FILE_UPLOAD_DEPRECATED'
      });
    }

    // Create submission - ALWAYS defaults to PENDING status
    // IMPORTANT: Submissions can NEVER be auto-verified - they must be manually verified by humans
    const timestamp = new Date(); // real UTC — MySQL2 timezone:'+05:30' stores as Sri Lanka time
    const submission = this.submissionRepository.create({
      paymentId,
      userId: user.s,
      userType: user.userType as any, // Use DB string UserType (e.g. 'USER', 'SUPER_ADMIN')
      username: `${submitter.firstName || ''} ${submitter.lastName || ''}`.trim(),
      paymentDate: new Date(createSubmissionDto.paymentDate),
      receiptUrl: uploadResult.url, // Relative path or full URL stored directly
      receiptFilename: uploadResult.url.split('/').pop() || 'receipt',
      transactionId: createSubmissionDto.transactionId,
      submittedAmount: createSubmissionDto.submittedAmount,
      notes: createSubmissionDto.notes,
      status: SubmissionStatus.PENDING, // ALWAYS PENDING - never auto-verified
      uploadedAt: timestamp,
      updatedAt: timestamp,
    });

    const savedSubmission = await this.submissionRepository.save(submission);

    // Convert relative path to full URL if path exists
    let receiptFileUrl: string | null = null;
    if (savedSubmission.receiptUrl) {
      receiptFileUrl = this.cloudStorageService.getFullUrl(savedSubmission.receiptUrl);
    }

    return {
      success: true,
      message: 'Payment submission uploaded successfully',
      data: {
        submissionId: savedSubmission.id,
        status: savedSubmission.status,
        receiptFile: receiptFileUrl,
      },
    };
  }

  async getSubmissions(
    paymentId: string,
    page: number = 1,
    limit: number = 10,
    user: JwtPayload,
  ): Promise<PaginatedSubmissionsResponseDto> {
    // Find payment to validate access
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException({
        success: false,
        message: 'Payment not found',
        error: 'PAYMENT_NOT_FOUND'
      });
    }

    // Validate access permissions
    this.validatePaymentAccessPermissions(user, payment.instituteId, payment.classId, payment.subjectId);

    const [submissions, total] = await this.submissionRepository.findAndCount({
      where: { paymentId },
      relations: ['user', 'verifier'],
      order: { uploadedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const responseData = submissions.map(submission => this.mapSubmissionToResponse(submission));

    return {
      data: responseData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async verifySubmission(
    submissionId: string,
    verifyDto: VerifyPaymentSubmissionDto,
    user: JwtPayload,
  ): Promise<{ success: boolean; message: string }> {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['payment'],
    });

    if (!submission) {
      throw new NotFoundException({
        success: false,
        message: 'Submission not found',
        error: 'SUBMISSION_NOT_FOUND'
      });
    }

    // Validate access permissions
    this.validatePaymentCreationAccess(user, submission.payment.instituteId, submission.payment.classId, submission.payment.subjectId);

    // CRITICAL SECURITY: Only PENDING and partially-verified submissions can be (re-)processed
    // PENDING = initial review; HALF_VERIFIED/QUARTER_VERIFIED = admin can complete or change tier
    const processableStatuses = [SubmissionStatus.PENDING, SubmissionStatus.HALF_VERIFIED, SubmissionStatus.QUARTER_VERIFIED];
    if (!processableStatuses.includes(submission.status)) {
      throw new BadRequestException({
        success: false,
        message: 'Submission has already been fully processed',
        error: 'SUBMISSION_ALREADY_PROCESSED'
      });
    }

    // Validate rejection reason if rejecting
    if (verifyDto.status === SubmissionStatus.REJECTED && !verifyDto.rejectionReason?.trim()) {
      throw new BadRequestException({
        success: false,
        message: 'Rejection reason is required when rejecting a submission',
        error: 'REJECTION_REASON_REQUIRED'
      });
    }

    // Update submission
    submission.status = verifyDto.status;
    submission.verifiedBy = user.s;
    submission.verifiedAt = new Date(); // real UTC — MySQL2 timezone:'+05:30' stores as Sri Lanka time
    submission.rejectionReason = verifyDto.rejectionReason;
    if (verifyDto.notes) {
      submission.notes = verifyDto.notes;
    }

    await this.submissionRepository.save(submission);

    // � ENROLLMENT PAYMENT GATING: If this submission is linked to a student enrollment, update enrollment status
    if (verifyDto.status === SubmissionStatus.VERIFIED || verifyDto.status === SubmissionStatus.REJECTED) {
      try {
        const linkedEnrollment = await this.classSubjectStudentRepository.findOne({
          where: { enrollmentPaymentId: submissionId },
        });

        if (linkedEnrollment) {
          if (verifyDto.status === SubmissionStatus.VERIFIED) {
            // Payment approved → activate enrollment
            linkedEnrollment.verificationStatus = 'verified';
            linkedEnrollment.verifiedBy = user.s;
            linkedEnrollment.verifiedAt = new Date();
            linkedEnrollment.rejectionReason = null;
            this.logger.log(`Enrollment activated for student ${linkedEnrollment.studentId} in subject ${linkedEnrollment.subjectId} after payment verification`);
          } else {
            // Payment rejected → mark enrollment as payment_rejected so student can resubmit
            linkedEnrollment.verificationStatus = 'payment_rejected' as any;
            linkedEnrollment.rejectionReason = verifyDto.rejectionReason || 'Payment slip rejected';
            linkedEnrollment.enrollmentPaymentId = null; // Clear so they can submit again
            this.logger.log(`Enrollment payment rejected for student ${linkedEnrollment.studentId} in subject ${linkedEnrollment.subjectId}`);
          }
          linkedEnrollment.updatedAt = new Date();
          await this.classSubjectStudentRepository.save(linkedEnrollment);
        }
      } catch (enrollmentError: any) {
        this.logger.warn(`Failed to update enrollment status after payment verification: ${enrollmentError.message}`);
      }
    }

    // �🔄 CRITICAL FIX: Refresh user cache after payment verification (payment status affects user data)
    if (verifyDto.status === SubmissionStatus.VERIFIED) {
      try {
        await this.userManagementService.refreshUserCache(submission.userId);
      } catch (cacheError: any) {
        this.logger.warn(`Cache refresh failed after payment verification for user ${submission.userId}: ${cacheError.message}`);
      }
    }

    const statusText = verifyDto.status === SubmissionStatus.VERIFIED ? 'verified' : 
                      verifyDto.status === SubmissionStatus.REJECTED ? 'rejected' : 'updated';

    return {
      success: true,
      message: `Payment submission ${statusText} successfully`,
    };
  }

  private validatePaymentCreationAccess(user: JwtPayload, instituteId: string, classId: string, subjectId: string): void {
    // Access control is handled by controller-level guards (@RequireAnyOfRoles)
    // Service-level institute role checks use getUserInstituteRole() where needed
    return;
  }

  private validatePaymentAccessPermissions(user: JwtPayload, instituteId: string, classId: string, subjectId: string): void {
    // Access control is handled by controller-level guards (@RequireAnyOfRoles)
    // Service-level institute role checks use getUserInstituteRole() where needed
    return;
  }

  private mapPaymentToResponse(payment: InstituteClassSubjectPayment): InstituteClassSubjectPaymentResponseDto {
    return {
      id: payment.id,
      instituteId: payment.instituteId,
      classId: payment.classId,
      subjectId: payment.subjectId,
      createdBy: payment.createdBy,
      title: payment.title,
      description: payment.description,
      targetType: payment.targetType,
      priority: payment.priority,
      amount: payment.amount,
      // ✅ OOP: Transform relative path to full URL for response
      documentUrl: payment.documentUrl ? this.cloudStorageService.getFullUrl(payment.documentUrl) : undefined,
      lastDate: payment.lastDate,
      status: payment.status,
      notes: payment.notes,
      bankName: payment.bankName,
      accountHolderName: payment.accountHolderName,
      accountHolderNumber: payment.accountHolderNumber,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      submissionsCount: payment.submissions?.length || 0,
      verifiedSubmissionsCount: payment.submissions?.filter(s => s.status === SubmissionStatus.VERIFIED).length || 0,
      pendingSubmissionsCount: payment.submissions?.filter(s => s.status === SubmissionStatus.PENDING).length || 0,
    };
  }

  private mapSubmissionToResponse(submission: InstituteClassSubjectPaymentSubmission): InstituteClassSubjectPaymentSubmissionResponseDto {
    return {
      id: submission.id,
      paymentId: submission.paymentId,
      userId: submission.userId,
      userType: submission.userType,
      username: submission.username,
      paymentDate: submission.paymentDate ? (submission.paymentDate instanceof Date ? submission.paymentDate.toISOString() : submission.paymentDate) : null,
      // ✅ OOP: Transform relative path to full URL for response
      receiptUrl: submission.receiptUrl ? this.cloudStorageService.getFullUrl(submission.receiptUrl) : undefined,
      receiptFilename: submission.receiptFilename,
      transactionId: submission.transactionId,
      submittedAmount: submission.submittedAmount,
      status: submission.status,
      verifiedBy: submission.verifiedBy,
      verifiedAt: submission.verifiedAt ? (submission.verifiedAt instanceof Date ? submission.verifiedAt.toISOString() : submission.verifiedAt) : null,
      rejectionReason: submission.rejectionReason,
      notes: submission.notes,
      uploadedAt: submission.uploadedAt ? (submission.uploadedAt instanceof Date ? submission.uploadedAt.toISOString() : submission.uploadedAt) : null,
      updatedAt: submission.updatedAt ? (submission.updatedAt instanceof Date ? submission.updatedAt.toISOString() : submission.updatedAt) : null,
    };
  }

  private getPaymentMonthFromDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  // Additional methods for separated controllers

  async getMyApplicablePayments(
    instituteId: string,
    classId: string,
    subjectId: string,
    page: number = 1,
    limit: number = 10,
    user: JwtPayload,
  ) {
    // FIXED: Resolve institute role and filter by targetType
    const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, instituteId);
    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to this institute',
        error: 'NO_INSTITUTE_ACCESS',
      });
    }

    // Non-payer roles (ADMIN, TEACHER) don't have "applicable" payments — return empty
    if (!this.isPayerRole(instituteRole) && instituteRole !== 'SUPERADMIN') {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    // Build where clause with targetType filter
    const whereConditions: any[] = [];
    if (instituteRole === InstituteUserType.STUDENT || instituteRole === 'SUPERADMIN') {
      whereConditions.push({
        instituteId, classId, subjectId,
        status: PaymentStatus.ACTIVE,
        targetType: PaymentTargetType.STUDENTS,
      });
    }
    if (instituteRole === InstituteUserType.PARENT || instituteRole === 'SUPERADMIN') {
      whereConditions.push({
        instituteId, classId, subjectId,
        status: PaymentStatus.ACTIVE,
        targetType: PaymentTargetType.PARENTS,
      });
    }

    const [payments, total] = await this.paymentRepository.findAndCount({
      where: whereConditions,
      relations: ['creator', 'submissions'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const now = Date.now();
    const responseData = payments.map(payment => {
      const base: any = this.mapPaymentToResponse(payment);

      // Inline this user's own submissions so the frontend needs no extra call
      const userSubs = (payment.submissions || [])
        .filter(sub => sub.userId === user.s)
        .sort((a, b) => {
          const aT = a.uploadedAt instanceof Date ? a.uploadedAt.getTime() : new Date(a.uploadedAt || 0).getTime();
          const bT = b.uploadedAt instanceof Date ? b.uploadedAt.getTime() : new Date(b.uploadedAt || 0).getTime();
          return bT - aT; // newest first
        });

      if (userSubs.length > 0) {
        const latest = userSubs[0];
        base.mySubmissionStatus = latest.status;
        base.mySubmissionId = latest.id;
        base.hasSubmitted = true;
        base.mySubmissions = userSubs.map(sub => ({
          id: sub.id,
          paymentId: sub.paymentId,
          submittedAmount: sub.submittedAmount,
          transactionId: sub.transactionId,
          paymentDate: sub.paymentDate instanceof Date ? sub.paymentDate.toISOString() : sub.paymentDate || null,
          status: sub.status,
          verifiedAt: sub.verifiedAt instanceof Date ? sub.verifiedAt.toISOString() : sub.verifiedAt || null,
          rejectionReason: sub.rejectionReason,
          notes: sub.notes,
          receiptUrl: sub.receiptUrl ? this.cloudStorageService.getFullUrl(sub.receiptUrl) : null,
          receiptFilename: sub.receiptFilename,
          uploadedAt: sub.uploadedAt instanceof Date ? sub.uploadedAt.toISOString() : sub.uploadedAt || null,
          canResubmit: [
            SubmissionStatus.REJECTED,
            SubmissionStatus.HALF_VERIFIED,
            SubmissionStatus.QUARTER_VERIFIED,
          ].includes(sub.status) && payment.status === PaymentStatus.ACTIVE,
          daysSinceSubmission: sub.uploadedAt
            ? Math.floor((now - (sub.uploadedAt instanceof Date ? sub.uploadedAt.getTime() : new Date(sub.uploadedAt || 0).getTime())) / 86400000)
            : null,
        }));
      } else {
        base.mySubmissionStatus = null;
        base.mySubmissionId = null;
        base.hasSubmitted = false;
        base.mySubmissions = [];
      }

      return base;
    });

    return {
      data: responseData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updatePayment(
    paymentId: string,
    updateDto: Partial<CreateInstituteClassSubjectPaymentDto>,
    user: JwtPayload,
  ) {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException({
        success: false,
        message: 'Payment not found',
        error: 'PAYMENT_NOT_FOUND'
      });
    }

    // Validate permissions (Admin or creator)
    this.validatePaymentCreationAccess(user, payment.instituteId, payment.classId, payment.subjectId);
    
    // Access control will be handled by decorators

    // Update payment
    Object.assign(payment, updateDto);
    if (updateDto.lastDate) {
      payment.lastDate = new Date(updateDto.lastDate);
    }
    
    await this.paymentRepository.save(payment);

    return {
      success: true,
      message: 'Payment updated successfully',
    };
  }

  async getClassPayments(
    instituteId: string,
    classId: string,
    page: number = 1,
    limit: number = 10,
    user: JwtPayload,
  ) {
    // Access control will be handled by decorators

    const [payments, total] = await this.paymentRepository.findAndCount({
      where: {
        instituteId,
        classId,
        isActive: true, // Only show active payments
      },
      relations: ['creator', 'submissions'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const responseData = payments.map(payment => this.mapPaymentToResponse(payment));

    return {
      data: responseData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getInstitutePayments(
    instituteId: string,
    page: number = 1,
    limit: number = 10,
    user: JwtPayload,
  ) {
    // Access control will be handled by decorators

    // Institute access is already validated by JWT decorators at controller level

    const [payments, total] = await this.paymentRepository.findAndCount({
      where: {
        instituteId,
        isActive: true, // Only show active payments
      },
      relations: ['creator', 'submissions'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const responseData = payments.map(payment => this.mapPaymentToResponse(payment));

    return {
      data: responseData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getEnrolledUsers(
    instituteId: string,
    classId: string,
    subjectId: string,
    page: number = 1,
    limit: number = 32,
    user: JwtPayload,
  ) {
    // Validate permissions (Admin or teacher with subject access)
    this.validatePaymentCreationAccess(user, instituteId, classId, subjectId);

    // This is a placeholder implementation
    // In a real application, this would integrate with the enrollment service
    return {
      message: 'Enrolled users endpoint - to be implemented with student enrollment service integration',
      params: { instituteId, classId, subjectId, page, limit }
    };
  }

  async getMySubmissionStatus(
    paymentId: string,
    user: JwtPayload,
  ) {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException({
        success: false,
        message: 'Payment not found',
        error: 'PAYMENT_NOT_FOUND'
      });
    }

    // Validate access permissions
    this.validatePaymentAccessPermissions(user, payment.instituteId, payment.classId, payment.subjectId);

    const submission = await this.submissionRepository.findOne({
      where: {
        paymentId,
        userId: user.s,
      },
    });

    return {
      hasSubmission: !!submission,
      submission: submission ? this.mapSubmissionToResponse(submission) : null,
      payment: this.mapPaymentToResponse(payment),
    };
  }

  async getMySubmissions(
    instituteId: string,
    classId: string,
    subjectId: string,
    page: number = 1,
    limit: number = 10,
    user: JwtPayload,
  ) {
    // Validate access permissions
    this.validatePaymentAccessPermissions(user, instituteId, classId, subjectId);

    // Query submissions with optimized joins - specific column selection for performance
    // User should see ALL their submissions with complete preview information
    const queryBuilder = this.submissionRepository.createQueryBuilder('submission')
      .leftJoin('submission.payment', 'payment')
      .leftJoin('payment.creator', 'paymentCreator')
      .leftJoin('submission.verifier', 'verifier')
      .select([
        'submission.id',
        'submission.paymentId',
        'submission.userId',
        'submission.receiptUrl',
        'submission.receiptFilename',
        'submission.transactionId',
        'submission.submittedAmount',
        'submission.paymentDate',
        'submission.uploadedAt',
        'submission.status',
        'submission.verifiedBy',
        'submission.verifiedAt',
        'submission.rejectionReason',
        'submission.notes',
        'submission.updatedAt'
      ])
      .addSelect([
        'payment.id',
        'payment.title',
        'payment.description',
        'payment.amount',
        'payment.lastDate',
        'payment.status',
        'payment.isActive',
        'payment.priority',
        'payment.targetType'
      ])
      .addSelect([
        'paymentCreator.id',
        'paymentCreator.firstName',
        'paymentCreator.lastName',
        'paymentCreator.email'
      ])
      .addSelect([
        'verifier.id',
        'verifier.firstName',
        'verifier.lastName',
        'verifier.email'
      ])
      .where('submission.userId = :userId', { userId: user.s })
      .andWhere('payment.instituteId = :instituteId', { instituteId })
      .andWhere('payment.classId = :classId', { classId })
      .andWhere('payment.subjectId = :subjectId', { subjectId })
      .orderBy('submission.uploadedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [submissions, total] = await queryBuilder.getManyAndCount();

    // Enhanced response with comprehensive submission preview
    const responseData = submissions.map(submission => ({
      // Core submission information
      ...this.mapSubmissionToResponse(submission),
      
      // Enhanced payment preview information
      paymentPreview: {
        id: submission.payment.id,
        title: submission.payment.title,
        description: submission.payment.description,
        amount: Number(submission.payment.amount),
        lastDate: submission.payment.lastDate,
        status: submission.payment.status,
        isActive: submission.payment.isActive,
        priority: submission.payment.priority,
        targetType: submission.payment.targetType,
        createdBy: submission.payment.creator ? {
          id: submission.payment.createdBy,
          name: `${submission.payment.creator.firstName || ''} ${submission.payment.creator.lastName || ''}`.trim()
        } : null,
        createdAt: submission.payment.createdAt,
      },
      
      // Submission preview details
      submissionPreview: {
        receiptPreview: {
          filename: submission.receiptFilename,
          // ✅ OOP: Transform relative path to full URL for response
          url: submission.receiptUrl ? this.cloudStorageService.getFullUrl(submission.receiptUrl) : undefined,
          canView: true, // User can always view their own receipts
        },
        submissionSummary: {
          submittedAmount: Number(submission.submittedAmount),
          transactionReference: submission.transactionId,
          paymentMethod: 'ONLINE', // You may want to add this field to the entity
          submissionDate: submission.uploadedAt,
          processingTime: submission.verifiedAt ? 
            Math.ceil((submission.verifiedAt.getTime() - submission.uploadedAt.getTime()) / (1000 * 60 * 60 * 24)) : null,
        },
        verificationPreview: submission.verifiedAt ? {
          status: submission.status,
          verifiedAt: submission.verifiedAt,
          verifierName: submission.verifier ? 
            `${submission.verifier.firstName || ''} ${submission.verifier.lastName || ''}`.trim() : 'System',
          processingDays: Math.ceil((submission.verifiedAt.getTime() - submission.uploadedAt.getTime()) / (1000 * 60 * 60 * 24)),
          hasRejectionReason: !!submission.rejectionReason,
          rejectionPreview: submission.rejectionReason ? submission.rejectionReason.substring(0, 100) : null,
        } : null,
      },
      
      // Status indicators for preview
      statusIndicators: {
        isPending: submission.status === SubmissionStatus.PENDING,
        isVerified: submission.status === SubmissionStatus.VERIFIED,
        isRejected: submission.status === SubmissionStatus.REJECTED,
        canResubmit: [
            SubmissionStatus.REJECTED,
            SubmissionStatus.HALF_VERIFIED,
            SubmissionStatus.QUARTER_VERIFIED,
          ].includes(submission.status) && submission.payment.isActive,
        paymentIsActive: submission.payment.isActive,
        isOverdue: submission.payment.lastDate < new Date(),
      },
      
      // User actions available
      availableActions: {
        canView: true,
        canDownloadReceipt: !!submission.receiptUrl,
        canResubmit: [
            SubmissionStatus.REJECTED,
            SubmissionStatus.HALF_VERIFIED,
            SubmissionStatus.QUARTER_VERIFIED,
          ].includes(submission.status) && submission.payment.isActive,
        canDelete: submission.status === SubmissionStatus.PENDING, // Can only delete pending submissions
      }
    }));

    // Calculate summary statistics for user preview
    const submissionSummary = {
      total,
      byStatus: {
        pending: submissions.filter(s => s.status === SubmissionStatus.PENDING).length,
        verified: submissions.filter(s => s.status === SubmissionStatus.VERIFIED).length,
        rejected: submissions.filter(s => s.status === SubmissionStatus.REJECTED).length,
      },
      byPaymentStatus: {
        activePayments: submissions.filter(s => s.payment.isActive).length,
        inactivePayments: submissions.filter(s => !s.payment.isActive).length,
      },
      totalAmountSubmitted: submissions.reduce((sum, s) => sum + Number(s.submittedAmount), 0),
      latestSubmission: submissions.length > 0 ? submissions[0].uploadedAt : null,
    };

    return {
      success: true,
      message: `Retrieved ${responseData.length} submissions with comprehensive preview data`,
      data: responseData,
      summary: submissionSummary,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPreviousPage: page > 1,
      },
    };
  }

  async getSubmissionById(
    submissionId: string,
    user: JwtPayload,
  ) {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['payment', 'payment.creator', 'verifier'],
    });

    if (!submission) {
      throw new NotFoundException({
        success: false,
        message: 'Submission not found',
        error: 'SUBMISSION_NOT_FOUND'
      });
    }

    // Access control will be handled by decorators

    // Return comprehensive submission preview with detailed information
    return {
      success: true,
      message: 'Submission details retrieved with comprehensive preview',
      data: {
        // Core submission data
        ...this.mapSubmissionToResponse(submission),
        
        // Detailed payment information
        paymentDetails: {
          id: submission.payment.id,
          title: submission.payment.title,
          description: submission.payment.description,
          amount: Number(submission.payment.amount),
          lastDate: submission.payment.lastDate,
          status: submission.payment.status,
          isActive: submission.payment.isActive,
          priority: submission.payment.priority,
          targetType: submission.payment.targetType,
          // ✅ OOP: Transform relative path to full URL for response
          documentUrl: submission.payment.documentUrl ? this.cloudStorageService.getFullUrl(submission.payment.documentUrl) : undefined,
          notes: submission.payment.notes,
          createdBy: submission.payment.creator ? {
            id: submission.payment.createdBy,
            name: `${submission.payment.creator.firstName || ''} ${submission.payment.creator.lastName || ''}`.trim()
          } : null,
          createdAt: submission.payment.createdAt,
          updatedAt: submission.payment.updatedAt,
        },
        
        // Detailed submission information
        submissionDetails: {
          receiptDetails: {
            filename: submission.receiptFilename,
            // ✅ OOP: Transform relative path to full URL for response
            url: submission.receiptUrl ? this.cloudStorageService.getFullUrl(submission.receiptUrl) : undefined,
            canView: true,
            canDownload: true,
            uploadedAt: submission.uploadedAt,
            fileSize: null, // Add file size if available
          },
          transactionDetails: {
            submittedAmount: Number(submission.submittedAmount),
            transactionId: submission.transactionId,
            paymentDate: submission.paymentDate,
            submissionDate: submission.uploadedAt,
            notes: submission.notes,
          },
          processingDetails: {
            status: submission.status,
            submittedAt: submission.uploadedAt,
            lastUpdated: submission.updatedAt,
            processingTime: submission.verifiedAt ? 
              Math.ceil((submission.verifiedAt.getTime() - submission.uploadedAt.getTime()) / (1000 * 60 * 60 * 24)) : null,
            verificationDetails: submission.verifiedAt ? {
              verifiedAt: submission.verifiedAt,
              verifiedBy: submission.verifier ? 
                `${submission.verifier.firstName || ''} ${submission.verifier.lastName || ''}`.trim() : 'System',
              verificationNotes: submission.rejectionReason || 'Approved',
            } : null,
          }
        },
        
        // Status and action indicators
        statusInfo: {
          current: submission.status,
          isPending: submission.status === SubmissionStatus.PENDING,
          isVerified: submission.status === SubmissionStatus.VERIFIED,
          isRejected: submission.status === SubmissionStatus.REJECTED,
          canResubmit: [
              SubmissionStatus.REJECTED,
              SubmissionStatus.HALF_VERIFIED,
              SubmissionStatus.QUARTER_VERIFIED,
            ].includes(submission.status) && submission.payment.isActive,
          paymentIsActive: submission.payment.isActive,
          isOverdue: submission.payment.lastDate < new Date(),
          timeline: [
            {
              status: 'Submitted',
              date: submission.uploadedAt,
              description: `Payment submission uploaded`,
              isCompleted: true,
            },
            ...(submission.verifiedAt ? [{
              status: submission.status === SubmissionStatus.VERIFIED ? 'Approved' : 'Rejected',
              date: submission.verifiedAt,
              description: submission.status === SubmissionStatus.VERIFIED ? 
                'Payment verified and approved' : 
                `Payment rejected: ${submission.rejectionReason || 'No reason provided'}`,
              isCompleted: true,
            }] : [{
              status: 'Under Review',
              date: null,
              description: 'Submission is being reviewed by admin',
              isCompleted: false,
            }])
          ]
        },
        
        // Available user actions
        availableActions: {
          canView: true,
          canDownloadReceipt: !!submission.receiptUrl,
          canEdit: submission.status === SubmissionStatus.PENDING,
          canDelete: submission.status === SubmissionStatus.PENDING && user.s === submission.userId,
          canResubmit: [
              SubmissionStatus.REJECTED,
              SubmissionStatus.HALF_VERIFIED,
              SubmissionStatus.QUARTER_VERIFIED,
            ].includes(submission.status) && submission.payment.isActive,
          canAppeal: [
              SubmissionStatus.REJECTED,
              SubmissionStatus.HALF_VERIFIED,
              SubmissionStatus.QUARTER_VERIFIED,
            ].includes(submission.status) && submission.payment.isActive,
        }
      }
    };
  }

  async deleteSubmission(
    submissionId: string,
    user: JwtPayload,
  ) {
    const submission = await this.submissionRepository.findOne({
      where: { id: submissionId },
      relations: ['payment'],
    });

    if (!submission) {
      throw new NotFoundException({
        success: false,
        message: 'Submission not found',
        error: 'SUBMISSION_NOT_FOUND'
      });
    }

    // Only the creator can delete their own submission
    if (submission.userId !== user.s) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied: You can only delete your own submissions',
        error: 'SUBMISSION_DELETE_DENIED'
      });
    }

    // Cannot delete verified submissions
    if (submission.status === SubmissionStatus.VERIFIED) {
      throw new BadRequestException({
        success: false,
        message: 'Cannot delete verified submission',
        error: 'VERIFIED_SUBMISSION_DELETE_DENIED'
      });
    }

    await this.submissionRepository.delete(submissionId);

    return {
      success: true,
      message: 'Submission deleted successfully',
    };
  }

  async getAllSubmissions(
    instituteId: string,
    classId: string,
    subjectId: string,
    page: number = 1,
    limit: number = 20,
    user: JwtPayload,
    status?: string,
  ) {
    // Validate permissions (Admin or teacher with subject access)
    this.validatePaymentCreationAccess(user, instituteId, classId, subjectId);

    // FIXED: Filter at DB level using a join to payment, instead of fetching ALL submissions then filtering in-memory
    const qb = this.submissionRepository.createQueryBuilder('submission')
      .innerJoinAndSelect('submission.payment', 'payment')
      .where('payment.instituteId = :instituteId', { instituteId })
      .andWhere('payment.classId = :classId', { classId })
      .andWhere('payment.subjectId = :subjectId', { subjectId });

    if (status && Object.values(SubmissionStatus).includes(status as SubmissionStatus)) {
      qb.andWhere('submission.status = :status', { status });
    }

    qb.orderBy('submission.uploadedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [submissions, total] = await qb.getManyAndCount();

    const responseData = submissions.map(submission => this.mapSubmissionToResponse(submission));

    return {
      data: responseData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSubmissionStats(
    instituteId: string,
    classId: string,
    subjectId: string,
    user: JwtPayload,
  ) {
    // Validate permissions (Admin or teacher with subject access)
    this.validatePaymentCreationAccess(user, instituteId, classId, subjectId);

    // OPTIMIZED: Single aggregation query instead of 4 separate COUNT queries
    const stats = await this.submissionRepository.createQueryBuilder('submission')
      .innerJoin('submission.payment', 'payment')
      .select('COUNT(*)', 'totalSubmissions')
      .addSelect(`SUM(CASE WHEN submission.status = '${SubmissionStatus.VERIFIED}' THEN 1 ELSE 0 END)`, 'verifiedSubmissions')
      .addSelect(`SUM(CASE WHEN submission.status = '${SubmissionStatus.PENDING}' THEN 1 ELSE 0 END)`, 'pendingSubmissions')
      .addSelect(`SUM(CASE WHEN submission.status = '${SubmissionStatus.REJECTED}' THEN 1 ELSE 0 END)`, 'rejectedSubmissions')
      .where('payment.instituteId = :instituteId', { instituteId })
      .andWhere('payment.classId = :classId', { classId })
      .andWhere('payment.subjectId = :subjectId', { subjectId })
      .getRawOne();

    const total = parseInt(stats.totalSubmissions) || 0;
    const verified = parseInt(stats.verifiedSubmissions) || 0;
    const pending = parseInt(stats.pendingSubmissions) || 0;
    const rejected = parseInt(stats.rejectedSubmissions) || 0;

    return {
      totalSubmissions: total,
      verifiedSubmissions: verified,
      pendingSubmissions: pending,
      rejectedSubmissions: rejected,
      verificationRate: total > 0 ? (verified / total * 100).toFixed(2) : '0.00',
    };
  }

  /**
   * Get all students enrolled in the class/subject of a given payment,
   * along with their payment submission status for that payment.
   * Access: Institute Admin, Teachers (with subject access), Superadmin.
   */
  async getStudentsForPayment(
    paymentId: string,
    page: number = 1,
    limit: number = 20,
    user: JwtPayload,
  ) {
    // Load the payment to resolve institute/class/subject context
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException({
        success: false,
        message: 'Payment not found',
        error: 'PAYMENT_NOT_FOUND',
      });
    }

    // Validate caller has access (admin/teacher level)
    const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, payment.instituteId);
    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to this institute',
        error: 'NO_INSTITUTE_ACCESS',
      });
    }

    const isAdmin = user.userType === UserType.SUPERADMIN ||
      user.userType === UserType.ORGANIZATION_MANAGER ||
      user.u === 0 || user.u === 1 ||
      instituteRole === InstituteUserType.INSTITUTE_ADMIN ||
      instituteRole === InstituteUserType.TEACHER;

    if (!isAdmin) {
      throw new ForbiddenException({
        success: false,
        message: 'Only admins and teachers can view the student payment list',
        error: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Find all students enrolled in this class/subject (using institute-level enrollment)
    const [memberships, totalStudents] = await this.instituteUserRepository.findAndCount({
      where: { instituteId: payment.instituteId, status: InstituteUserStatus.ACTIVE },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Get all existing submissions for this payment
    const submissions = await this.submissionRepository.find({
      where: { paymentId },
    });
    const submissionMap = new Map(submissions.map(s => [s.userId, s]));

    const studentList = memberships.map(membership => {
      const sub = submissionMap.get(membership.userId);
      const rawImageUrl = membership.user?.imageUrl || null;
      return {
        userId: membership.userId,
        name: membership.user
          ? (membership.user.nameWithInitials || `${membership.user.firstName || ''} ${membership.user.lastName || ''}`.trim())
          : null,
        email: membership.user?.email || null,
        phoneNumber: membership.user?.phoneNumber || null,
        profileImage: rawImageUrl ? this.cloudStorageService.getFullUrl(rawImageUrl) : null,
        instituteRole: membership.instituteUserType,
        instituteStudentId: membership.userIdByInstitute,
        cardId: membership.instituteCardId,
        paymentStatus: sub ? sub.status : 'NOT_SUBMITTED',
        submissionId: sub?.id || null,
        submittedAmount: sub ? parseFloat(String(sub.submittedAmount)) : null,
        paymentDate: sub?.paymentDate || null,
        verifiedAt: sub?.verifiedAt || null,
        notes: sub?.notes || null,
      };
    });

    return {
      success: true,
      message: 'Student payment list retrieved successfully',
      data: {
        paymentId,
        paymentTitle: payment.title,
        paymentAmount: parseFloat(String(payment.amount)),
        students: studentList,
        summary: {
          total: totalStudents,
          verified: submissions.filter(s => s.status === SubmissionStatus.VERIFIED).length,
          pending: submissions.filter(s => s.status === SubmissionStatus.PENDING).length,
          rejected: submissions.filter(s => s.status === SubmissionStatus.REJECTED).length,
          notSubmitted: totalStudents - submissions.length > 0 ? totalStudents - submissions.length : 0,
        },
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalStudents / limit),
          totalItems: totalStudents,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(totalStudents / limit),
          hasPreviousPage: page > 1,
        },
      },
    };
  }

  /**
   * Get students enrolled in a specific institute/class/subject for a given payment,
   * scoped by route params (no need to look up payment first).
   * Returns rich user details: nameWithInitials, userId, instituteStudentId,
   * instituteUserImageUrl and the student's submission status for that payment.
   */
  async getStudentsByInstituteClassSubject(
    instituteId: string,
    classId: string,
    subjectId: string,
    paymentId: string,
    page: number = 1,
    limit: number = 20,
    user: JwtPayload,
  ) {
    // Validate caller has admin/teacher access
    const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, instituteId);
    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to this institute',
        error: 'NO_INSTITUTE_ACCESS',
      });
    }

    const isAdmin =
      user.userType === UserType.SUPERADMIN ||
      user.userType === UserType.ORGANIZATION_MANAGER ||
      user.u === 0 || user.u === 1 ||
      instituteRole === InstituteUserType.INSTITUTE_ADMIN ||
      instituteRole === InstituteUserType.TEACHER ||
      instituteRole === InstituteUserType.ATTENDANCE_MARKER;

    if (!isAdmin) {
      throw new ForbiddenException({
        success: false,
        message: 'Only admins, teachers and attendance markers can view the student payment list',
        error: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Verify the payment actually belongs to the given institute/class/subject
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, instituteId, classId, subjectId },
    });
    if (!payment) {
      throw new NotFoundException({
        success: false,
        message: 'Payment not found for the given institute/class/subject combination',
        error: 'PAYMENT_NOT_FOUND',
      });
    }

    // Students enrolled in this specific class/subject
    const [enrollments, totalStudents] = await this.classSubjectStudentRepository.findAndCount({
      where: {
        instituteId,
        classId,
        subjectId,
        isActive: true,
        verificationStatus: 'verified',
      },
      relations: ['student'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Batch-load institute membership info for institute-scoped fields
    const enrolledUserIds = enrollments.map(e => e.studentId);
    const memberships = enrolledUserIds.length > 0
      ? await this.instituteUserRepository.find({
          where: { userId: In(enrolledUserIds), instituteId },
        })
      : [];
    const membershipMap = new Map(memberships.map(m => [m.userId, m]));

    // Fetch all submissions for this payment in one query
    const submissions = await this.submissionRepository.find({ where: { paymentId } });
    const submissionMap = new Map(submissions.map(s => [s.userId, s]));

    const students = enrollments.map(enrollment => {
      const user = enrollment.student;
      const membership = membershipMap.get(enrollment.studentId);
      const sub = submissionMap.get(enrollment.studentId);
      const rawInstituteImage = membership?.instituteUserImageUrl || null;
      const rawGlobalImage = user?.imageUrl || null;

      return {
        // Identity
        userId: enrollment.studentId,
        nameWithInitials: user
          ? (user.nameWithInitials || `${user.firstName || ''} ${user.lastName || ''}`.trim())
          : null,
        // Institute-scoped details
        instituteStudentId: membership?.userIdByInstitute || null,
        cardId: membership?.instituteCardId || null,
        instituteUserImage: rawInstituteImage
          ? this.cloudStorageService.getFullUrl(rawInstituteImage)
          : (rawGlobalImage ? this.cloudStorageService.getFullUrl(rawGlobalImage) : null),
        // Payment submission
        paymentStatus: sub ? sub.status : 'NOT_SUBMITTED',
        submissionId: sub?.id || null,
        verifiedAt: sub?.verifiedAt
          ? (sub.verifiedAt instanceof Date ? sub.verifiedAt.toISOString() : sub.verifiedAt)
          : null,
        amount: sub ? parseFloat(String(sub.submittedAmount)) : null,
      };
    });

    return {
      success: true,
      data: {
        paymentId,
        paymentTitle: payment.title,
        paymentAmount: parseFloat(String(payment.amount)),
        students,
        summary: {
          total: totalStudents,
          verified: submissions.filter(s => s.status === SubmissionStatus.VERIFIED).length,
          pending: submissions.filter(s => s.status === SubmissionStatus.PENDING).length,
          rejected: submissions.filter(s => s.status === SubmissionStatus.REJECTED).length,
          notSubmitted: Math.max(totalStudents - submissions.length, 0),
        },
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalStudents / limit),
          totalItems: totalStudents,
          itemsPerPage: limit,
          hasNextPage: page < Math.ceil(totalStudents / limit),
          hasPreviousPage: page > 1,
        },
      },
    };
  }

  /**
   * Admin manually verifies/records a payment for a specific student in a class-subject payment.
   * Creates a VERIFIED submission directly on behalf of the student.
   * Access: Institute Admin, Teachers (with subject access), Superadmin.
   */
  async adminVerifyStudentCspPayment(
    paymentId: string,
    studentId: string,
    dto: AdminVerifyStudentCspPaymentDto,
    user: JwtPayload,
  ) {
    // Load payment
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException({
        success: false,
        message: 'Payment not found',
        error: 'PAYMENT_NOT_FOUND',
      });
    }

    // Validate caller has admin/teacher access to this institute
    const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, payment.instituteId);
    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to this institute',
        error: 'NO_INSTITUTE_ACCESS',
      });
    }

    const isAdmin = user.userType === UserType.SUPERADMIN ||
      user.userType === UserType.ORGANIZATION_MANAGER ||
      user.u === 0 || user.u === 1 ||
      instituteRole === InstituteUserType.INSTITUTE_ADMIN ||
      instituteRole === InstituteUserType.TEACHER;

    if (!isAdmin) {
      throw new ForbiddenException({
        success: false,
        message: 'Only admins and teachers can manually verify student payments',
        error: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Verify student is enrolled in the institute
    const membership = await this.instituteUserRepository.findOne({
      where: { userId: studentId, instituteId: payment.instituteId, status: InstituteUserStatus.ACTIVE },
    });
    if (!membership) {
      throw new NotFoundException({
        success: false,
        message: 'Student not found in this institute',
        error: 'STUDENT_NOT_FOUND',
      });
    }

    // Check if the student already has a VERIFIED submission for this payment
    const existingVerified = await this.submissionRepository.findOne({
      where: { paymentId, userId: studentId, status: SubmissionStatus.VERIFIED },
    });
    if (existingVerified) {
      throw new BadRequestException({
        success: false,
        message: 'Student already has a verified payment for this payment request',
        error: 'ALREADY_VERIFIED',
        data: { existingSubmissionId: existingVerified.id },
      });
    }

    // Get user details for the username and userType fields
    const studentUser = await this.userRepository.findOne({
      where: { id: studentId },
      select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'userType'],
    });

    const timestamp = new Date(); // real UTC
    const submission = this.submissionRepository.create({
      paymentId,
      userId: studentId,
      userType: studentUser?.userType ?? UserType.USER,
      username: studentUser
        ? (studentUser.nameWithInitials || `${studentUser.firstName || ''} ${studentUser.lastName || ''}`.trim())
        : studentId,
      paymentDate: new Date(dto.date),
      receiptUrl: '',
      receiptFilename: '',
      submittedAmount: dto.amount,
      status: dto.paymentTier === 'half'
        ? SubmissionStatus.HALF_VERIFIED
        : dto.paymentTier === 'quarter'
        ? SubmissionStatus.QUARTER_VERIFIED
        : SubmissionStatus.VERIFIED,
      verifiedBy: user.s,
      verifiedAt: timestamp,
      notes: dto.notes || null,
      uploadedAt: timestamp,
      updatedAt: timestamp,
    });

    const savedSubmission = await this.submissionRepository.save(submission);

    // Refresh user cache
    try {
      await this.userManagementService.refreshUserCache(studentId);
    } catch (cacheError: any) {
      this.logger.warn(`Cache refresh failed after admin CSP payment verification for user ${studentId}: ${cacheError.message}`);
    }

    return {
      success: true,
      message: 'Payment verified for student successfully',
      data: {
        submissionId: savedSubmission.id,
        paymentId,
        studentId,
        amount: dto.amount,
        status: savedSubmission.status,
        verifiedBy: user.s,
        verifiedAt: savedSubmission.verifiedAt,
        notes: savedSubmission.notes,
      },
    };
  }

  /**
   * Soft delete a class-subject payment request.
   * Only allowed for institute admins / teachers (with subject access) when no submissions exist.
   * Sets isActive=false and status=INACTIVE instead of hard deleting.
   */
  async softDeletePayment(
    paymentId: string,
    user: JwtPayload,
  ): Promise<{ success: boolean; message: string }> {
    // Find payment with submissions
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, isActive: true },
      relations: ['submissions'],
    });

    if (!payment) {
      throw new NotFoundException({
        success: false,
        message: 'Payment not found or already deleted',
        error: 'PAYMENT_NOT_FOUND',
      });
    }

    // Validate institute access and admin role
    const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, payment.instituteId);
    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - not enrolled in this institute',
        error: 'ACCESS_DENIED',
      });
    }

    // Only admins and teachers (creator) can delete
    const isAdmin = instituteRole === 'SUPERADMIN' ||
      instituteRole === InstituteUserType.INSTITUTE_ADMIN;
    const isCreator = payment.createdBy === user.s;

    if (!isAdmin && !isCreator) {
      throw new ForbiddenException({
        success: false,
        message: 'Only institute admins or the payment creator can delete payment requests',
        error: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Block deletion if any submissions exist
    if (payment.submissions && payment.submissions.length > 0) {
      throw new BadRequestException({
        success: false,
        message: `Cannot delete this payment because it has ${payment.submissions.length} submission(s). Remove or process all submissions first.`,
        error: 'PAYMENT_HAS_SUBMISSIONS',
      });
    }

    // Soft delete: deactivate and set status to INACTIVE
    const timestamp = new Date();
    await this.paymentRepository.update(paymentId, {
      isActive: false,
      status: PaymentStatus.INACTIVE,
      updatedAt: timestamp,
    });

    this.logger.log(`Class-subject payment ${paymentId} soft-deleted by user ${user.s}`);

    return {
      success: true,
      message: 'Payment deleted successfully',
    };
  }
}
