import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InstituteClassSubjectPayment, PaymentStatus } from '../entities/institute-class-subject-payment.entity';
import { InstituteClassSubjectPaymentSubmission, SubmissionStatus } from '../entities/institute-class-subject-payment-submission.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { JwtPayload } from '../../../common/interfaces/jwt-request.interface';
import { CreateInstituteClassSubjectPaymentDto } from '../dto/create-institute-class-subject-payment.dto';
import { CreateInstituteClassSubjectPaymentSubmissionDto, VerifyPaymentSubmissionDto } from '../dto/create-institute-class-subject-payment-submission.dto';
import { InstituteClassSubjectPaymentResponseDto, InstituteClassSubjectPaymentSubmissionResponseDto, PaymentCreationSuccessResponseDto, SubmissionCreationSuccessResponseDto, PaginatedPaymentsResponseDto, PaginatedSubmissionsResponseDto } from '../dto/institute-class-subject-payment-response.dto';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { UserManagementService } from '../../../common/services/cache-user-management.service';
import { UserType } from '../../user/enums/user-type.enum';
import { AsyncEmailService } from '../../../common/services/async-email.service';
import { getCurrentSriLankaTime } from '../../../common/utils/timezone.util';

@Injectable()
export class InstituteClassSubjectPaymentService {
  constructor(
    @InjectRepository(InstituteClassSubjectPayment)
    private readonly paymentRepository: Repository<InstituteClassSubjectPayment>,
    @InjectRepository(InstituteClassSubjectPaymentSubmission)
    private readonly submissionRepository: Repository<InstituteClassSubjectPaymentSubmission>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly cloudStorageService: CloudStorageService,
    private readonly userManagementService: UserManagementService,
    private readonly dataSource: DataSource,
    private readonly asyncEmailService: AsyncEmailService,
  ) {}

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
    const timestamp = getCurrentSriLankaTime();
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

    // Check if payment is still active
    if (payment.status !== PaymentStatus.ACTIVE) {
      throw new BadRequestException({
        success: false,
        message: 'Payment is no longer accepting submissions',
        error: 'PAYMENT_INACTIVE'
      });
    }

    // Check if last date has passed
    if (getCurrentSriLankaTime() > payment.lastDate) {
      throw new BadRequestException({
        success: false,
        message: 'Payment submission deadline has passed',
        error: 'PAYMENT_EXPIRED'
      });
    }

    // Validate user access to this payment
    this.validatePaymentAccessPermissions(user, payment.instituteId, payment.classId, payment.subjectId);

    // Check if user already submitted for this payment
    const existingSubmission = await this.submissionRepository.findOne({
      where: {
        paymentId,
        userId: user.s, // JWT v2 user ID
      },
    });

    if (existingSubmission) {
      throw new BadRequestException({
        success: false,
        message: 'You have already submitted a payment for this request',
        error: 'DUPLICATE_SUBMISSION'
      });
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
    const timestamp = getCurrentSriLankaTime();
    const submission = this.submissionRepository.create({
      paymentId,
      userId: user.s,
      userType: user.u, // Use global UserType from JWT (USER, SUPER_ADMIN, etc.)
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

    // CRITICAL SECURITY: Only PENDING submissions can be processed
    // This prevents double-verification and ensures manual human review
    if (submission.status !== SubmissionStatus.PENDING) {
      throw new BadRequestException({
        success: false,
        message: 'Submission has already been processed',
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
    submission.verifiedAt = getCurrentSriLankaTime();
    submission.rejectionReason = verifyDto.rejectionReason;
    if (verifyDto.notes) {
      submission.notes = verifyDto.notes;
    }

    await this.submissionRepository.save(submission);

    // 🔄 CRITICAL FIX: Refresh user cache after payment verification (payment status affects user data)
    if (verifyDto.status === SubmissionStatus.VERIFIED) {
      try {
        await this.userManagementService.refreshUserCache(submission.userId);
      } catch (cacheError) {
        // Don't fail the verification if cache refresh fails
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
    // Access control will be handled by decorators
    return;
  }

  private validatePaymentAccessPermissions(user: JwtPayload, instituteId: string, classId: string, subjectId: string): void {
    // Access control will be handled by decorators
    return;
  }

  private validateTeacherAccess(user: JwtPayload, instituteId: string, classId: string, subjectId: string): boolean {
    // Check if teacher has institute access in JWT v2 format
    if (!user.i || !Array.isArray(user.i)) {
      return false;
    }

    // Find institute access and check class/subject permissions
    const instituteAccess = user.i.find(inst => inst.i === instituteId);
    if (!instituteAccess || !instituteAccess.c) {
      return false;
    }

    // Check if teacher has access to this class and subject
    const classAccess = instituteAccess.c.find(([cId]) => cId === classId);
    if (!classAccess) {
      return false;
    }

    // For now, simplified subject access check (can be enhanced based on business logic)
    return true;
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
    // Validate access permissions
    this.validatePaymentAccessPermissions(user, instituteId, classId, subjectId);

    const [payments, total] = await this.paymentRepository.findAndCount({
      where: {
        instituteId,
        classId,
        subjectId,
        status: PaymentStatus.ACTIVE,
      },
      relations: ['creator', 'submissions'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Filter to show only payments applicable to this user
    const responseData = payments.map(payment => this.mapPaymentToResponse(payment));

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
        canResubmit: submission.status === SubmissionStatus.REJECTED && submission.payment.isActive,
        paymentIsActive: submission.payment.isActive,
        isOverdue: submission.payment.lastDate < getCurrentSriLankaTime(),
      },
      
      // User actions available
      availableActions: {
        canView: true,
        canDownloadReceipt: !!submission.receiptUrl,
        canResubmit: submission.status === SubmissionStatus.REJECTED && submission.payment.isActive,
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
          canResubmit: submission.status === SubmissionStatus.REJECTED && submission.payment.isActive,
          paymentIsActive: submission.payment.isActive,
          isOverdue: submission.payment.lastDate < getCurrentSriLankaTime(),
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
          canResubmit: submission.status === SubmissionStatus.REJECTED && submission.payment.isActive,
          canAppeal: submission.status === SubmissionStatus.REJECTED && submission.payment.isActive,
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

    const whereCondition: any = {};
    
    // Add status filter if provided
    if (status && Object.values(SubmissionStatus).includes(status as SubmissionStatus)) {
      whereCondition.status = status;
    }

    const [submissions, total] = await this.submissionRepository.findAndCount({
      where: whereCondition,
      relations: ['payment'],
      order: { uploadedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Filter submissions for the specific institute/class/subject
    const filteredSubmissions = submissions.filter(s => 
      s.payment && 
      s.payment.instituteId === instituteId && 
      s.payment.classId === classId && 
      s.payment.subjectId === subjectId
    );

    const responseData = filteredSubmissions.map(submission => this.mapSubmissionToResponse(submission));

    return {
      data: responseData,
      total: filteredSubmissions.length,
      page,
      limit,
      totalPages: Math.ceil(filteredSubmissions.length / limit),
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

    const totalSubmissions = await this.submissionRepository.count({
      relations: ['payment'],
      where: {
        payment: {
          instituteId,
          classId,
          subjectId,
        },
      },
    });

    const verifiedSubmissions = await this.submissionRepository.count({
      relations: ['payment'],
      where: {
        status: SubmissionStatus.VERIFIED,
        payment: {
          instituteId,
          classId,
          subjectId,
        },
      },
    });

    const pendingSubmissions = await this.submissionRepository.count({
      relations: ['payment'],
      where: {
        status: SubmissionStatus.PENDING,
        payment: {
          instituteId,
          classId,
          subjectId,
        },
      },
    });

    const rejectedSubmissions = await this.submissionRepository.count({
      relations: ['payment'],
      where: {
        status: SubmissionStatus.REJECTED,
        payment: {
          instituteId,
          classId,
          subjectId,
        },
      },
    });

    return {
      totalSubmissions,
      verifiedSubmissions,
      pendingSubmissions,
      rejectedSubmissions,
      verificationRate: totalSubmissions > 0 ? (verifiedSubmissions / totalSubmissions * 100).toFixed(2) : '0.00',
    };
  }
}
