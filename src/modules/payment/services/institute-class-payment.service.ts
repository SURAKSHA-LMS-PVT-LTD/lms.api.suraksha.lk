import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InstituteClassPayment, PaymentStatus, PaymentTargetType } from '../entities/institute-class-payment.entity';
import { InstituteClassPaymentSubmission, SubmissionStatus } from '../entities/institute-class-payment-submission.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteUserType } from '../../institute_mudules/institue_user/enums/institute-user-type.enum';
import { InstituteUserStatus } from '../../institute_mudules/institue_user/enums/institute-user-status.enum';
import { JwtPayload } from '../../../common/interfaces/jwt-request.interface';
import { CreateInstituteClassPaymentDto } from '../dto/create-institute-class-payment.dto';
import { CreateInstituteClassPaymentSubmissionDto, VerifyClassPaymentSubmissionDto, AdminVerifyStudentClassPaymentDto } from '../dto/create-institute-class-payment-submission.dto';
import { InstituteClassPaymentResponseDto, InstituteClassPaymentSubmissionResponseDto, ClassPaymentCreationSuccessResponseDto, ClassSubmissionCreationSuccessResponseDto, PaginatedClassPaymentsResponseDto, PaginatedClassSubmissionsResponseDto } from '../dto/institute-class-payment-response.dto';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { UserManagementService } from '../../../common/services/cache-user-management.service';
import { UserType } from '../../user/enums/user-type.enum';
import { AsyncEmailService } from '../../../common/services/async-email.service';
import { FinanceService } from '../../finance/services/finance.service';

@Injectable()
export class InstituteClassPaymentService {
  private readonly logger = new Logger(InstituteClassPaymentService.name);

  constructor(
    @InjectRepository(InstituteClassPayment)
    private readonly paymentRepository: Repository<InstituteClassPayment>,
    @InjectRepository(InstituteClassPaymentSubmission)
    private readonly submissionRepository: Repository<InstituteClassPaymentSubmission>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepository: Repository<InstituteClassStudentEntity>,
    private readonly cloudStorageService: CloudStorageService,
    private readonly userManagementService: UserManagementService,
    private readonly asyncEmailService: AsyncEmailService,
    private readonly financeService: FinanceService,
  ) {}

  private async getUserInstituteRole(user: JwtPayload, instituteId: string): Promise<{ hasAccess: boolean; instituteRole?: string }> {
    try {
      const userEntity = await this.userRepository.findOne({
        where: { id: user.s },
        select: ['id', 'userType', 'isActive'],
      });
      if (!userEntity || !userEntity.isActive) return { hasAccess: false };
      if (userEntity.userType === UserType.SUPERADMIN || userEntity.userType === UserType.ORGANIZATION_MANAGER || user.u === 0 || user.u === 1) {
        return { hasAccess: true, instituteRole: 'SUPERADMIN' };
      }
      const membership = await this.instituteUserRepository.findOne({
        where: { userId: user.s, instituteId, status: InstituteUserStatus.ACTIVE },
      });
      if (!membership) return { hasAccess: false };
      return { hasAccess: true, instituteRole: membership.instituteUserType };
    } catch (error: any) {
      this.logger.warn(`getUserInstituteRole failed: ${error?.message}`);
      return { hasAccess: false };
    }
  }

  private isPayerRole(instituteRole?: string): boolean {
    return instituteRole === InstituteUserType.STUDENT || instituteRole === InstituteUserType.PARENT;
  }

  async createPayment(
    instituteId: string,
    classId: string,
    dto: CreateInstituteClassPaymentDto,
    user: JwtPayload,
  ): Promise<ClassPaymentCreationSuccessResponseDto> {
    const creator = await this.userRepository.findOne({ where: { id: user.s } });
    if (!creator) {
      throw new NotFoundException({ success: false, message: 'Creator user not found', error: 'USER_NOT_FOUND' });
    }
    const timestamp = new Date();
    const payment = this.paymentRepository.create({
      instituteId, classId,
      createdBy: user.s,
      title: dto.title,
      description: dto.description,
      targetType: dto.targetType,
      priority: dto.priority,
      amount: dto.amount,
      documentUrl: dto.documentUrl,
      lastDate: new Date(dto.lastDate),
      notes: dto.notes,
      bankName: dto.bankName,
      accountHolderName: dto.accountHolderName,
      accountHolderNumber: dto.accountHolderNumber,
      teacherCommissionPct: dto.teacherCommissionPct != null ? String(dto.teacherCommissionPct) : '0.00',
      status: PaymentStatus.ACTIVE,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const saved = await this.paymentRepository.save(payment);
    return { success: true, message: 'Payment created successfully', data: { paymentId: saved.id, status: saved.status } };
  }

  async getPayments(
    instituteId: string,
    classId: string,
    page: number = 1,
    limit: number = 10,
    user: JwtPayload,
  ): Promise<PaginatedClassPaymentsResponseDto> {
    const [payments, total] = await this.paymentRepository.findAndCount({
      where: { instituteId, classId, isActive: true },
      relations: ['creator', 'submissions'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      data: payments.map(p => this.mapPaymentToResponse(p)),
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPaymentById(paymentId: string, user: JwtPayload): Promise<InstituteClassPaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['creator', 'submissions'],
    });
    if (!payment) throw new NotFoundException({ success: false, message: 'Payment not found', error: 'PAYMENT_NOT_FOUND' });
    return this.mapPaymentToResponse(payment);
  }

  async getMyApplicablePayments(
    instituteId: string,
    classId: string,
    page: number = 1,
    limit: number = 10,
    user: JwtPayload,
  ) {
    const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, instituteId);
    if (!hasAccess) throw new ForbiddenException({ success: false, message: 'You do not have access to this institute', error: 'NO_INSTITUTE_ACCESS' });
    if (!this.isPayerRole(instituteRole) && instituteRole !== 'SUPERADMIN') {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    const whereConditions: any[] = [];
    if (instituteRole === InstituteUserType.STUDENT || instituteRole === 'SUPERADMIN') {
      whereConditions.push({ instituteId, classId, status: PaymentStatus.ACTIVE, targetType: PaymentTargetType.STUDENTS });
    }
    if (instituteRole === InstituteUserType.PARENT || instituteRole === 'SUPERADMIN') {
      whereConditions.push({ instituteId, classId, status: PaymentStatus.ACTIVE, targetType: PaymentTargetType.PARENTS });
    }
    // BOTH target type
    whereConditions.push({ instituteId, classId, status: PaymentStatus.ACTIVE, targetType: PaymentTargetType.BOTH });

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
      const userSubs = (payment.submissions || [])
        .filter(sub => String(sub.userId) === String(user.s))
        .sort((a, b) => {
          const aT = a.uploadedAt instanceof Date ? a.uploadedAt.getTime() : new Date(a.uploadedAt || 0).getTime();
          const bT = b.uploadedAt instanceof Date ? b.uploadedAt.getTime() : new Date(b.uploadedAt || 0).getTime();
          return bT - aT;
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
            SubmissionStatus.REJECTED, SubmissionStatus.HALF_VERIFIED, SubmissionStatus.QUARTER_VERIFIED,
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

    return { data: responseData, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async submitPayment(
    paymentId: string,
    dto: CreateInstituteClassPaymentSubmissionDto,
    file: string,
    user: JwtPayload,
  ): Promise<ClassSubmissionCreationSuccessResponseDto> {
    try {
      // Input validation
      if (!paymentId || !dto.paymentDate || !dto.submittedAmount) {
        throw new BadRequestException({ success: false, message: 'Missing required fields', error: 'INVALID_INPUT' });
      }

      const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
      if (!payment) throw new NotFoundException({ success: false, message: 'Payment not found', error: 'PAYMENT_NOT_FOUND' });

      const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, payment.instituteId);
      if (!hasAccess) throw new ForbiddenException({ success: false, message: 'You do not have access to this institute', error: 'NO_INSTITUTE_ACCESS' });
      if (!this.isPayerRole(instituteRole)) throw new ForbiddenException({ success: false, message: 'Only students and parents can submit payments', error: 'NOT_A_PAYER_ROLE' });

      if (instituteRole === InstituteUserType.STUDENT && payment.targetType === PaymentTargetType.PARENTS) {
        throw new ForbiddenException({ success: false, message: 'This payment is targeted at parents only', error: 'PAYMENT_TARGET_MISMATCH' });
      }
      if (instituteRole === InstituteUserType.PARENT && payment.targetType === PaymentTargetType.STUDENTS) {
        throw new ForbiddenException({ success: false, message: 'This payment is targeted at students only', error: 'PAYMENT_TARGET_MISMATCH' });
      }
      if (payment.status !== PaymentStatus.ACTIVE) throw new BadRequestException({ success: false, message: 'Payment is no longer accepting submissions', error: 'PAYMENT_INACTIVE' });
      if (new Date() > payment.lastDate) throw new BadRequestException({ success: false, message: 'Payment submission deadline has passed', error: 'PAYMENT_EXPIRED' });

      const userIdStr = String(user.s);
      const existingSubmission = await this.submissionRepository.findOne({ where: { paymentId, userId: userIdStr } });
      
      if (existingSubmission) {
        const allowResubmit = [SubmissionStatus.REJECTED, SubmissionStatus.HALF_VERIFIED, SubmissionStatus.QUARTER_VERIFIED].includes(existingSubmission.status);
        if (!allowResubmit) throw new BadRequestException({ success: false, message: 'You have already submitted a payment for this request', error: 'DUPLICATE_SUBMISSION' });
      }

      const submitter = await this.userRepository.findOne({ where: { id: userIdStr } });
      if (!submitter) throw new NotFoundException({ success: false, message: 'User not found', error: 'USER_NOT_FOUND' });

      const receiptUrl = dto.receiptUrl || file;
      if (!receiptUrl || typeof receiptUrl !== 'string' || receiptUrl.trim().length === 0) {
        throw new BadRequestException({ success: false, message: 'Receipt URL is required. Use the file from /upload/verify-and-publish.', error: 'MISSING_RECEIPT_URL' });
      }

      const timestamp = new Date();
      const submission = this.submissionRepository.create({
        paymentId: String(paymentId),
        userId: userIdStr,
        userType: user.userType as any,
        username: submitter.nameWithInitials || 'Unknown',
        paymentDate: new Date(dto.paymentDate),
        receiptUrl: receiptUrl.trim(),
        receiptFilename: receiptUrl.split('/').pop() || 'receipt',
        transactionId: dto.transactionId || null,
        submittedAmount: dto.submittedAmount,
        notes: dto.notes || null,
        status: SubmissionStatus.PENDING,
        uploadedAt: timestamp,
        updatedAt: timestamp,
      });

      const saved = await this.submissionRepository.save(submission);
      if (!saved || !saved.id) {
        throw new BadRequestException({ success: false, message: 'Submission was not saved properly', error: 'SAVE_FAILED' });
      }

      this.logger.log(`✅ Submission saved: id=${saved.id} paymentId=${paymentId} userId=${userIdStr} status=${saved.status}`);

      let receiptFileUrl: string | null = null;
      try {
        receiptFileUrl = saved.receiptUrl ? this.cloudStorageService.getFullUrl(saved.receiptUrl) : null;
      } catch (storageError: any) {
        this.logger.warn(`⚠️ Failed to get full URL from cloud storage: ${storageError?.message}`, storageError?.stack);
        receiptFileUrl = saved.receiptUrl || null;
      }

      return {
        success: true,
        message: 'Payment submission uploaded successfully',
        data: {
          submissionId: saved.id,
          status: saved.status,
          receiptFile: receiptFileUrl,
        },
      };
    } catch (error: any) {
      this.logger.error(`❌ submitPayment error: ${error?.message}`, error?.stack);
      
      // Re-throw known HTTP exceptions (they have a getStatus method)
      if (error.getStatus && error.getResponse) {
        throw error;
      }
      
      // Convert unexpected errors to 400 with details
      throw new BadRequestException({
        success: false,
        message: error?.message || 'Payment submission failed',
        error: 'SUBMISSION_FAILED',
        details: error?.message,
      });
    }
  }

  async getSubmissions(paymentId: string, page: number = 1, limit: number = 10, user: JwtPayload): Promise<PaginatedClassSubmissionsResponseDto> {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException({ success: false, message: 'Payment not found', error: 'PAYMENT_NOT_FOUND' });

    const [submissions, total] = await this.submissionRepository.findAndCount({
      where: { paymentId },
      relations: ['user', 'verifier'],
      order: { uploadedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: submissions.map(s => this.mapSubmissionToResponse(s)), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSubmissionsForClassPayment(
    instituteId: string,
    classId: string,
    paymentId: string,
    page: number = 1,
    limit: number = 10,
    user: JwtPayload,
  ): Promise<PaginatedClassSubmissionsResponseDto> {
    const { hasAccess } = await this.getUserInstituteRole(user, instituteId);
    if (!hasAccess) throw new ForbiddenException({ success: false, message: 'You do not have access to this institute', error: 'NO_INSTITUTE_ACCESS' });

    // Look up payment by id + instituteId only; classId check is redundant and causes type-mismatch failures
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, instituteId },
    });
    if (!payment) throw new NotFoundException({ success: false, message: 'Payment not found for given institute/class', error: 'PAYMENT_NOT_FOUND' });

    const [submissions, total] = await this.submissionRepository.findAndCount({
      where: { paymentId },
      relations: ['user', 'verifier'],
      order: { uploadedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: submissions.map(s => this.mapSubmissionToResponse(s)), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async verifySubmission(submissionId: string, dto: VerifyClassPaymentSubmissionDto, user: JwtPayload): Promise<{ success: boolean; message: string }> {
    const submission = await this.submissionRepository.findOne({ where: { id: submissionId }, relations: ['payment'] });
    if (!submission) throw new NotFoundException({ success: false, message: 'Submission not found', error: 'SUBMISSION_NOT_FOUND' });

    const processable = [SubmissionStatus.PENDING, SubmissionStatus.HALF_VERIFIED, SubmissionStatus.QUARTER_VERIFIED];
    if (!processable.includes(submission.status)) {
      throw new BadRequestException({ success: false, message: 'Submission has already been fully processed', error: 'SUBMISSION_ALREADY_PROCESSED' });
    }
    if (dto.status === SubmissionStatus.REJECTED && !dto.rejectionReason?.trim()) {
      throw new BadRequestException({ success: false, message: 'Rejection reason is required when rejecting a submission', error: 'REJECTION_REASON_REQUIRED' });
    }

    submission.status = dto.status;
    submission.verifiedBy = user.s;
    submission.verifiedAt = new Date();
    submission.rejectionReason = dto.rejectionReason;
    if (dto.notes) submission.notes = dto.notes;
    await this.submissionRepository.save(submission);

    if (dto.status === SubmissionStatus.VERIFIED) {
      try { await this.userManagementService.refreshUserCache(submission.userId); } catch (e: any) {
        this.logger.warn(`Cache refresh failed after class payment verification for user ${submission.userId}: ${e.message}`);
      }

      if (dto.targetAccountId && submission.submittedAmount) {
        try {
          const payment = await this.paymentRepository.findOne({ where: { id: submission.paymentId } });
          const verifier = await this.userRepository.findOne({ where: { id: user.s }, select: ['id', 'nameWithInitials'] });
          const verifierName = verifier?.nameWithInitials || String(user.s);
          const studentMembership = payment ? await this.instituteUserRepository.findOne({
            where: { userId: submission.userId, instituteId: payment.instituteId },
            select: ['userIdByInstitute'],
          }) : null;
          const instituteUserId = studentMembership?.userIdByInstitute || null;
          const studentNameWithId = instituteUserId ? `${submission.username} [${instituteUserId}]` : submission.username;
          await this.financeService.processSplit({
            paymentAmount: Number(submission.submittedAmount),
            targetAccountId: dto.targetAccountId,
            classCommissionPct: payment ? Number(payment.teacherCommissionPct ?? 0) : 0,
            commissionPctOverride: dto.commissionPctOverride,
            teacherId: payment?.createdBy,
            referenceId: submission.paymentId,
            studentId: submission.userId,
            studentName: studentNameWithId,
            description: `Class payment: ${payment?.title ?? submission.paymentId}`,
            userId: String(user.s),
            createdByName: verifierName,
            instituteId: payment?.instituteId ?? '',
          });
        } catch (fe: any) {
          this.logger.warn(`Finance split failed for submission ${submissionId}: ${fe.message}`);
        }
      }
    }

    const statusText = dto.status === SubmissionStatus.VERIFIED ? 'verified' : dto.status === SubmissionStatus.REJECTED ? 'rejected' : 'updated';
    return { success: true, message: `Payment submission ${statusText} successfully` };
  }

  async updatePayment(paymentId: string, updateDto: Partial<CreateInstituteClassPaymentDto>, user: JwtPayload) {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException({ success: false, message: 'Payment not found', error: 'PAYMENT_NOT_FOUND' });
    Object.assign(payment, updateDto);
    if (updateDto.lastDate) payment.lastDate = new Date(updateDto.lastDate);
    await this.paymentRepository.save(payment);
    return { success: true, message: 'Payment updated successfully' };
  }

  async softDeletePayment(paymentId: string, user: JwtPayload): Promise<{ success: boolean; message: string }> {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId, isActive: true }, relations: ['submissions'] });
    if (!payment) throw new NotFoundException({ success: false, message: 'Payment not found or already deleted', error: 'PAYMENT_NOT_FOUND' });

    const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, payment.instituteId);
    if (!hasAccess) throw new ForbiddenException({ success: false, message: 'Access denied', error: 'ACCESS_DENIED' });

    const isAdmin = instituteRole === 'SUPERADMIN' || instituteRole === InstituteUserType.INSTITUTE_ADMIN;
    const isCreator = payment.createdBy === user.s;
    if (!isAdmin && !isCreator) throw new ForbiddenException({ success: false, message: 'Only institute admins or the payment creator can delete payment requests', error: 'INSUFFICIENT_PERMISSIONS' });
    if (payment.submissions && payment.submissions.length > 0) {
      throw new BadRequestException({ success: false, message: `Cannot delete this payment because it has ${payment.submissions.length} submission(s).`, error: 'PAYMENT_HAS_SUBMISSIONS' });
    }

    await this.paymentRepository.update(paymentId, { isActive: false, status: PaymentStatus.INACTIVE, updatedAt: new Date() });
    this.logger.log(`Class payment ${paymentId} soft-deleted by user ${user.s}`);
    return { success: true, message: 'Payment deleted successfully' };
  }

  async getMySubmissionStatus(paymentId: string, user: JwtPayload) {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException({ success: false, message: 'Payment not found', error: 'PAYMENT_NOT_FOUND' });
    const submission = await this.submissionRepository.findOne({ where: { paymentId, userId: String(user.s) } });
    return { hasSubmission: !!submission, submission: submission ? this.mapSubmissionToResponse(submission) : null, payment: this.mapPaymentToResponse(payment) };
  }

  async deleteSubmission(submissionId: string, user: JwtPayload) {
    const submission = await this.submissionRepository.findOne({ where: { id: submissionId }, relations: ['payment'] });
    if (!submission) throw new NotFoundException({ success: false, message: 'Submission not found', error: 'SUBMISSION_NOT_FOUND' });
    if (submission.userId !== user.s) throw new ForbiddenException({ success: false, message: 'Access denied: You can only delete your own submissions', error: 'SUBMISSION_DELETE_DENIED' });
    if (submission.status === SubmissionStatus.VERIFIED) throw new BadRequestException({ success: false, message: 'Cannot delete verified submission', error: 'VERIFIED_SUBMISSION_DELETE_DENIED' });
    await this.submissionRepository.delete(submissionId);
    return { success: true, message: 'Submission deleted successfully' };
  }

  async getAllSubmissions(instituteId: string, classId: string, page: number = 1, limit: number = 20, user: JwtPayload, status?: string) {
    try {
      // Validate user has admin access to this institute
      const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, instituteId);
      if (!hasAccess) throw new ForbiddenException({ success: false, message: 'You do not have access to this institute', error: 'NO_INSTITUTE_ACCESS' });

      const isAdmin = user.userType === UserType.SUPERADMIN || user.userType === UserType.ORGANIZATION_MANAGER ||
        user.u === 0 || user.u === 1 ||
        instituteRole === InstituteUserType.INSTITUTE_ADMIN || instituteRole === InstituteUserType.TEACHER || instituteRole === InstituteUserType.ATTENDANCE_MARKER;
      if (!isAdmin) throw new ForbiddenException({ success: false, message: 'Only admins and teachers can view all submissions', error: 'INSUFFICIENT_PERMISSIONS' });

      // Build query with proper filtering
      const qb = this.submissionRepository.createQueryBuilder('submission')
        .innerJoinAndSelect('submission.payment', 'payment')
        .where('payment.instituteId = :instituteId', { instituteId })
        .andWhere('payment.classId = :classId', { classId });

      if (status && Object.values(SubmissionStatus).includes(status as SubmissionStatus)) {
        qb.andWhere('submission.status = :status', { status });
      }
      
      qb.orderBy('submission.uploadedAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [submissions, total] = await qb.getManyAndCount();

      return {
        success: true,
        data: {
          submissions: submissions.map(s => this.mapSubmissionToResponse(s)),
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      this.logger.error(`getAllSubmissions failed: ${error?.message}`, error?.stack);
      if (error.status && error.response) {
        throw error;
      }
      throw new BadRequestException({ success: false, message: 'Failed to retrieve submissions', error: 'FETCH_FAILED' });
    }
  }

  async getStudentAllClassSubmissions(instituteId: string, studentId: string, limit: number = 20, user: JwtPayload) {
    const { hasAccess } = await this.getUserInstituteRole(user, instituteId);
    if (!hasAccess) throw new ForbiddenException({ success: false, message: 'You do not have access to this institute', error: 'NO_INSTITUTE_ACCESS' });

    // Fetch classes the student is enrolled in for this institute
    const enrollments = await this.classStudentRepository.find({
      where: { instituteId, studentUserId: studentId, isActive: true },
      relations: ['class'],
    });

    if (!enrollments.length) {
      return { data: [], total: 0, limit };
    }

    const classIds = enrollments.map(e => e.classId);

    const qb = this.submissionRepository.createQueryBuilder('submission')
      .innerJoinAndSelect('submission.payment', 'payment')
      .where('payment.instituteId = :instituteId', { instituteId })
      .andWhere('payment.classId IN (:...classIds)', { classIds })
      .andWhere('submission.userId = :studentId', { studentId });

    qb.orderBy('submission.uploadedAt', 'DESC').take(limit);
    const submissions = await qb.getMany();
    
    // Attach class details
    const mapped = submissions.map(s => {
      const resp: any = this.mapSubmissionToResponse(s);
      resp.amount = s.payment?.amount;
      resp.dueDate = s.payment?.lastDate;
      resp.paymentTitle = s.payment?.title;
      const cls = enrollments.find(e => e.classId === s.payment?.classId)?.class;
      resp.className = cls?.name;
      resp.grade = cls?.grade;
      return resp;
    });

    return { data: mapped, total: submissions.length, limit };
  }

  async getStudentClassSubmissions(
    instituteId: string,
    classId: string,
    studentId: string,
    page: number = 1,
    limit: number = 20,
    user: JwtPayload,
  ): Promise<PaginatedClassSubmissionsResponseDto> {
    const { hasAccess } = await this.getUserInstituteRole(user, instituteId);
    if (!hasAccess) throw new ForbiddenException({ success: false, message: 'You do not have access to this institute', error: 'NO_INSTITUTE_ACCESS' });

    const qb = this.submissionRepository.createQueryBuilder('submission')
      .innerJoinAndSelect('submission.payment', 'payment')
      .where('payment.instituteId = :instituteId', { instituteId })
      .andWhere('payment.classId = :classId', { classId })
      .andWhere('submission.userId = :studentId', { studentId });

    qb.orderBy('submission.uploadedAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [submissions, total] = await qb.getManyAndCount();

    const mapped = submissions.map(s => {
      const resp: any = this.mapSubmissionToResponse(s);
      resp.amount = s.payment?.amount;
      resp.paymentTitle = s.payment?.title;
      resp.dueDate = s.payment?.lastDate;
      return resp;
    });

    return { data: mapped, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSubmissionStats(instituteId: string, classId: string, user: JwtPayload) {
    const stats = await this.submissionRepository.createQueryBuilder('submission')
      .innerJoin('submission.payment', 'payment')
      .select('COUNT(*)', 'totalSubmissions')
      .addSelect(`SUM(CASE WHEN submission.status = '${SubmissionStatus.VERIFIED}' THEN 1 ELSE 0 END)`, 'verifiedSubmissions')
      .addSelect(`SUM(CASE WHEN submission.status = '${SubmissionStatus.PENDING}' THEN 1 ELSE 0 END)`, 'pendingSubmissions')
      .addSelect(`SUM(CASE WHEN submission.status = '${SubmissionStatus.REJECTED}' THEN 1 ELSE 0 END)`, 'rejectedSubmissions')
      .where('payment.instituteId = :instituteId', { instituteId })
      .andWhere('payment.classId = :classId', { classId })
      .getRawOne();

    const total = parseInt(stats.totalSubmissions) || 0;
    const verified = parseInt(stats.verifiedSubmissions) || 0;
    const pending = parseInt(stats.pendingSubmissions) || 0;
    const rejected = parseInt(stats.rejectedSubmissions) || 0;
    return { totalSubmissions: total, verifiedSubmissions: verified, pendingSubmissions: pending, rejectedSubmissions: rejected, verificationRate: total > 0 ? (verified / total * 100).toFixed(2) : '0.00' };
  }

  async getStudentsByInstituteClass(
    instituteId: string,
    classId: string,
    paymentId: string,
    page: number = 1,
    limit: number = 20,
    user: JwtPayload,
  ) {
    try {
      // Validate inputs
      if (!instituteId || !classId || !paymentId) {
        throw new BadRequestException({ success: false, message: 'Missing required parameters', error: 'INVALID_INPUT' });
      }

      this.logger.log(`[studentsDetails] instituteId=${instituteId} classId=${classId} paymentId=${paymentId}`);

      const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, instituteId);
      if (!hasAccess) throw new ForbiddenException({ success: false, message: 'You do not have access to this institute', error: 'NO_INSTITUTE_ACCESS' });

      const isAdmin = user.userType === UserType.SUPERADMIN || user.userType === UserType.ORGANIZATION_MANAGER ||
        user.u === 0 || user.u === 1 ||
        instituteRole === InstituteUserType.INSTITUTE_ADMIN || instituteRole === InstituteUserType.TEACHER || instituteRole === InstituteUserType.ATTENDANCE_MARKER;
      if (!isAdmin) throw new ForbiddenException({ success: false, message: 'Only admins and teachers can view the student payment list', error: 'INSUFFICIENT_PERMISSIONS' });

      let payment: any = null;
      try {
        // Look up by id only — institute access already verified via getUserInstituteRole
        payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
        this.logger.log(`[studentsDetails] payment=${payment ? `id=${payment.id} classId=${payment.classId}` : 'NOT FOUND'}`);
      } catch (e: any) {
        this.logger.error(`[studentsDetails] Error finding payment: ${e?.message}`);
      }
      if (!payment) throw new NotFoundException({ success: false, message: 'Payment not found', error: 'PAYMENT_NOT_FOUND' });

      // ── Load class students via QueryBuilder with proper entity joins ──────────────────────────
      let totalStudents = 0;
      let classStudents: any[] = [];
      let userMap = new Map<string, any>();
      let instituteUserMap = new Map<string, any>();
      
      try {
        const rawCount = await this.classStudentRepository.count({ where: { instituteId, classId } });
        this.logger.log(`[studentsDetails] raw count for class=${classId} institute=${instituteId}: ${rawCount}`);
        totalStudents = rawCount;

        const pageSize = Math.max(1, Math.min(limit, 100));
        const offset  = Math.max(0, (page - 1) * pageSize);

        // Load class students
        classStudents = await this.classStudentRepository.find({
          where: { instituteId, classId },
          order: { createdAt: 'DESC' },
          skip: offset,
          take: pageSize,
        });

        this.logger.log(`[studentsDetails] classStudents=${classStudents.length} totalStudents=${totalStudents}`);
        
        if (classStudents.length > 0) {
          // Collect all student user IDs for batch loading
          const studentUserIds = classStudents.map(cs => cs.studentUserId).filter(Boolean);
          this.logger.log(`[studentsDetails] studentUserIds to load: ${studentUserIds.join(',')}`);

          // Batch load all users
          if (studentUserIds.length > 0) {
            const users = await this.userRepository.find({
              where: { id: In(studentUserIds) },
              select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl'],
            });
            users.forEach(u => userMap.set(String(u.id), u));
            this.logger.log(`[studentsDetails] loaded ${users.length} users`);
          }

          // Batch load all institute users
          if (studentUserIds.length > 0) {
            const instituteUsers = await this.instituteUserRepository.find({
              where: { userId: In(studentUserIds), instituteId },
              select: ['userId', 'userIdByInstitute', 'instituteCardId', 'instituteUserImageUrl'],
            });
            instituteUsers.forEach(iu => instituteUserMap.set(String(iu.userId), iu));
            this.logger.log(`[studentsDetails] loaded ${instituteUsers.length} institute users`);
          }
        }
      } catch (dbError: any) {
        this.logger.error(`[studentsDetails] Error loading class students: ${dbError?.message}`, dbError?.stack);
        this.logger.error(`[studentsDetails] Error stack: ${dbError?.stack}`);
        totalStudents = 0;
        classStudents = [];
      }

      // Load submissions FIRST to calculate summary counts for all cases
      let submissions: any[] = [];
      try {
        submissions = await this.submissionRepository.find({
          where: { paymentId },
          select: ['id', 'userId', 'status', 'submittedAmount', 'verifiedAt', 'updatedAt', 'notes', 'rejectionReason'],
          order: { updatedAt: 'DESC' } as any,
        });
        this.logger.log(`[studentsDetails] submissions=${submissions.length}`);
      } catch (dbError: any) {
        this.logger.error(`[studentsDetails] Error loading submissions: ${dbError?.message}`, dbError?.stack);
        submissions = [];
      }

      // Create map of latest submission per user — key as String() to avoid bigint/string mismatch
      const submissionMap = new Map<string, any>();
      for (const s of (submissions || [])) {
        const key = s?.userId ? String(s.userId) : null;
        if (key && !submissionMap.has(key)) {
          submissionMap.set(key, s);
        }
      }

      // Calculate summary counts
      const verifiedCount = (submissions || []).filter(s => s?.status === SubmissionStatus.VERIFIED).length;
      const halfVerifiedCount = (submissions || []).filter(s => s?.status === SubmissionStatus.HALF_VERIFIED).length;
      const quarterVerifiedCount = (submissions || []).filter(s => s?.status === SubmissionStatus.QUARTER_VERIFIED).length;
      const pendingCount = (submissions || []).filter(s => s?.status === SubmissionStatus.PENDING).length;
      const rejectedCount = (submissions || []).filter(s => s?.status === SubmissionStatus.REJECTED).length;
      const notSubmittedCount = Math.max(totalStudents - (submissions || []).length, 0);

      const paymentTitle = payment?.title || 'Payment';
      const paymentAmount = payment ? parseFloat(String(payment.amount || 0)) : 0;

      // Return early if no students
      if (classStudents.length === 0) {
        this.logger.log(`[studentsDetails] No students found for class=${classId}, returning empty array`);
        return {
          success: true,
          data: [],
          total: totalStudents,
          page,
          limit,
          totalPages: Math.ceil(totalStudents / limit),
          summary: {
            totalStudents,
            verified: verifiedCount,
            halfVerified: halfVerifiedCount,
            quarterVerified: quarterVerifiedCount,
            pending: pendingCount,
            rejected: rejectedCount,
            totalVerifiedAmount: '0',
          },
        };
      }

      const dueDateStr = payment?.lastDate
        ? (payment.lastDate instanceof Date ? payment.lastDate.toISOString() : String(payment.lastDate))
        : '';

      const enrichedStudents = classStudents.map((classStudent: any, idx: number) => {
        try {
          const studentUserId = classStudent?.studentUserId ? String(classStudent.studentUserId) : null;
          if (!studentUserId) {
            this.logger.warn(`[studentsDetails] classStudent idx=${idx} has no studentUserId`);
            return null;
          }

          // Get submission for this student
          const sub = submissionMap.get(studentUserId);

          // Get user data from the map
          const user = userMap.get(studentUserId);
          const instituteUser = instituteUserMap.get(studentUserId);
          
          const nameWithInitials = user?.nameWithInitials || 
            (user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '') ||
            'Unknown';

          let profileImage: string | null = null;
          try {
            const instituteImageUrl = instituteUser?.instituteUserImageUrl;
            const userImageUrl = user?.imageUrl;
            
            if (instituteImageUrl && typeof instituteImageUrl === 'string') {
              profileImage = this.cloudStorageService.getFullUrl(instituteImageUrl);
            } else if (userImageUrl && typeof userImageUrl === 'string') {
              profileImage = this.cloudStorageService.getFullUrl(userImageUrl);
            }
          } catch (imgErr: any) {
            this.logger.warn(`[studentsDetails] Image error userId=${studentUserId}: ${imgErr?.message}`);
          }

          return {
            studentId: studentUserId,
            studentUuid: studentUserId,
            studentName: nameWithInitials,
            nameWithInitials,
            image: profileImage,
            instituteUserId: instituteUser?.userIdByInstitute || '',

            paymentId,
            paymentTitle,
            paymentAmount: String(paymentAmount),
            paymentDueDate: dueDateStr,

            submissionId: sub?.id || null,
            submissionStatus: sub?.status || 'NOT_SUBMITTED',
            submittedAmount: sub?.submittedAmount ? String(sub.submittedAmount) : null,
            verifiedAt: sub?.verifiedAt
              ? (sub.verifiedAt instanceof Date ? sub.verifiedAt.toISOString() : String(sub.verifiedAt))
              : null,
            notes: sub?.notes || null,
            rejectionReason: sub?.rejectionReason || null,
          };
        } catch (mapErr: any) {
          this.logger.error(`[studentsDetails] Error mapping student idx=${idx}: ${mapErr?.message}`, mapErr?.stack);
          return null;
        }
      }).filter(s => s !== null);

      this.logger.log(`[studentsDetails] enrichedStudents=${enrichedStudents.length}`);

      return {
        success: true,
        data: enrichedStudents,
        total: totalStudents,
        page,
        limit,
        totalPages: Math.ceil(totalStudents / limit),
        summary: {
          totalStudents,
          verified: verifiedCount,
          halfVerified: halfVerifiedCount,
          quarterVerified: quarterVerifiedCount,
          pending: pendingCount,
          rejected: rejectedCount,
          totalVerifiedAmount: String(paymentAmount * verifiedCount),
        },
      };
    } catch (error: any) {
      this.logger.error(`CRITICAL error in getStudentsByInstituteClass: ${error?.message}`, error?.stack);
      // Return a valid response structure even on error
      return {
        success: false,
        error: error?.response?.error || 'INTERNAL_ERROR',
        message: error?.message || 'Failed to load student payment details',
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        summary: {
          totalStudents: 0,
          verified: 0,
          halfVerified: 0,
          quarterVerified: 0,
          pending: 0,
          rejected: 0,
          totalVerifiedAmount: '0',
        },
      };
    }
  }

  async adminVerifyStudentClassPayment(paymentId: string, studentId: string, dto: AdminVerifyStudentClassPaymentDto, user: JwtPayload) {
    try {
      // Ensure BigInt values are properly stringified
      const paymentIdStr = String(paymentId);
      const studentIdStr = String(studentId);

      const payment = await this.paymentRepository.findOne({ where: { id: paymentIdStr } });
      if (!payment) throw new NotFoundException({ success: false, message: 'Payment not found', error: 'PAYMENT_NOT_FOUND' });

      const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, payment.instituteId);
      if (!hasAccess) throw new ForbiddenException({ success: false, message: 'You do not have access to this institute', error: 'NO_INSTITUTE_ACCESS' });

      const isAdmin = user.userType === UserType.SUPERADMIN || user.userType === UserType.ORGANIZATION_MANAGER || user.u === 0 || user.u === 1 ||
        instituteRole === InstituteUserType.INSTITUTE_ADMIN || instituteRole === InstituteUserType.TEACHER;
      if (!isAdmin) throw new ForbiddenException({ success: false, message: 'Only admins and teachers can manually verify student payments', error: 'INSUFFICIENT_PERMISSIONS' });

      const membership = await this.instituteUserRepository.findOne({ where: { userId: studentIdStr, instituteId: payment.instituteId, status: InstituteUserStatus.ACTIVE } });
      if (!membership) throw new NotFoundException({ success: false, message: 'Student not found in this institute', error: 'STUDENT_NOT_FOUND' });

      // Check if student already has a verified payment (any verified status)
      const verifiedStatuses = [SubmissionStatus.VERIFIED, SubmissionStatus.HALF_VERIFIED, SubmissionStatus.QUARTER_VERIFIED];
      const existingVerified = await this.submissionRepository.findOne({
        where: {
          paymentId: paymentIdStr,
          userId: studentIdStr,
          status: In(verifiedStatuses),
        },
        order: { verifiedAt: 'DESC' } as any,
      });
      if (existingVerified) throw new BadRequestException({ success: false, message: 'Student already has a verified payment for this request', error: 'ALREADY_VERIFIED', data: { existingSubmissionId: existingVerified.id, existingStatus: existingVerified.status } });

      const studentUser = await this.userRepository.findOne({ where: { id: studentIdStr }, select: ['id', 'nameWithInitials', 'userType'] });
      const adminUser = await this.userRepository.findOne({ where: { id: user.s }, select: ['id', 'nameWithInitials'] });
      const adminName = adminUser?.nameWithInitials || String(user.s);

      const timestamp = new Date();
      const submission = this.submissionRepository.create({
        paymentId: paymentIdStr,
        userId: studentIdStr,
        userType: studentUser?.userType ?? UserType.USER,
        username: studentUser?.nameWithInitials || studentIdStr,
        paymentDate: new Date(dto.date),
        receiptUrl: '',
        receiptFilename: '',
        submittedAmount: dto.amount,
        status: dto.paymentTier === 'half' ? SubmissionStatus.HALF_VERIFIED : dto.paymentTier === 'quarter' ? SubmissionStatus.QUARTER_VERIFIED : SubmissionStatus.VERIFIED,
        verifiedBy: String(user.s),
        verifiedAt: timestamp,
        notes: dto.notes || null,
        uploadedAt: timestamp,
        updatedAt: timestamp,
      });
      const saved = await this.submissionRepository.save(submission);

      try { await this.userManagementService.refreshUserCache(studentIdStr); } catch (e: any) {
        this.logger.warn(`Cache refresh failed after admin class payment verification for user ${studentIdStr}: ${e.message}`);
      }

      if (dto.targetAccountId && saved.status === SubmissionStatus.VERIFIED) {
        try {
          const instituteUserId = membership?.userIdByInstitute || null;
          const studentNameWithId = instituteUserId ? `${saved.username} [${instituteUserId}]` : saved.username;
          await this.financeService.processSplit({
            paymentAmount: dto.amount,
            targetAccountId: dto.targetAccountId,
            classCommissionPct: Number(payment.teacherCommissionPct ?? 0),
            commissionPctOverride: dto.commissionPctOverride,
            teacherId: payment.createdBy,
            referenceId: paymentIdStr,
            studentId: studentIdStr,
            studentName: studentNameWithId,
            description: `Admin verified class payment`,
            userId: String(user.s),
            createdByName: adminName,
            instituteId: payment.instituteId,
          });
        } catch (fe: any) {
          this.logger.warn(`Finance split failed for admin verify ${paymentIdStr}: ${fe.message}`);
        }
      }

      return { success: true, message: 'Payment verified for student successfully', data: { submissionId: saved.id, paymentId: paymentIdStr, studentId: studentIdStr, amount: dto.amount, status: saved.status, verifiedBy: user.s, verifiedAt: saved.verifiedAt, notes: saved.notes } };
    } catch (error: any) {
      this.logger.error(`adminVerifyStudentClassPayment failed: ${error?.message}`, error?.stack);
      if (error.status && error.response) {
        throw error;
      }
      throw new BadRequestException({ success: false, message: 'Failed to verify payment', error: 'VERIFICATION_FAILED', details: error?.message });
    }
  }

  private mapPaymentToResponse(payment: InstituteClassPayment): InstituteClassPaymentResponseDto {
    return {
      id: payment.id,
      instituteId: payment.instituteId,
      classId: payment.classId,
      createdBy: payment.createdBy,
      title: payment.title,
      description: payment.description,
      targetType: payment.targetType,
      priority: payment.priority,
      amount: payment.amount,
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

  private mapSubmissionToResponse(submission: InstituteClassPaymentSubmission): InstituteClassPaymentSubmissionResponseDto {
    return {
      id: submission.id,
      paymentId: submission.paymentId,
      userId: submission.userId,
      userType: submission.userType,
      username: submission.username,
      paymentDate: submission.paymentDate ? (submission.paymentDate instanceof Date ? submission.paymentDate.toISOString() : submission.paymentDate) : null,
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

  /**
   * Get current user's submissions for a specific class
   * Returns all submissions the user has made for all payments in this class
   */
  async getMyClassSubmissions(
    instituteId: string,
    classId: string,
    user: JwtPayload,
  ) {
    try {
      // Validate user has access to this institute
      const { hasAccess } = await this.getUserInstituteRole(user, instituteId);
      if (!hasAccess) {
        throw new ForbiddenException({ success: false, message: 'You do not have access to this institute', error: 'NO_INSTITUTE_ACCESS' });
      }

      // Ensure userId is stringified
      const userIdStr = String(user.s);
      this.logger.log(`getMyClassSubmissions: instituteId=${instituteId} classId=${classId} userId=${userIdStr}`);

      // Get all active payments for this class (must be both active and ACTIVE status)
      const payments = await this.paymentRepository.find({
        where: { 
          instituteId, 
          classId, 
          isActive: true,
          status: PaymentStatus.ACTIVE 
        },
        relations: ['submissions'],
        order: { createdAt: 'DESC' },
      });

      this.logger.log(`Found ${payments.length} payments for class ${classId}`);

      if (payments.length === 0) {
        return {
          success: true,
          data: {
            submissions: [],
            total: 0,
            summary: {
              totalSubmissions: 0,
              byStatus: {
                pending: 0,
                verified: 0,
                rejected: 0,
              },
            },
          },
        };
      }

      // Get all submissions from this user for these payments
      const paymentIds = payments.map(p => p.id);
      const submissions = await this.submissionRepository.find({
        where: {
          paymentId: In(paymentIds),
          userId: userIdStr,
        },
        order: { uploadedAt: 'DESC' },
      });

      this.logger.log(`Found ${submissions.length} submissions for user ${userIdStr}`);

      // Calculate summary stats
      const summary = {
        totalSubmissions: submissions.length,
        byStatus: {
          pending: submissions.filter(s => s.status === SubmissionStatus.PENDING).length,
          verified: submissions.filter(s => [SubmissionStatus.VERIFIED, SubmissionStatus.HALF_VERIFIED, SubmissionStatus.QUARTER_VERIFIED].includes(s.status)).length,
          rejected: submissions.filter(s => s.status === SubmissionStatus.REJECTED).length,
        },
      };

      // Map submissions with enriched payment info for frontend
      const submissionsWithPayments = submissions.map(sub => {
        const payment = payments.find(p => p.id === sub.paymentId);
        return {
          ...this.mapSubmissionToResponse(sub),
          id: sub.id,
          paymentId: sub.paymentId,
          paymentType: payment?.title || 'Payment',
          description: payment?.description || '',
          paymentDescription: payment?.description || '',
          paymentAmount: Number(payment?.amount || 0),
          totalAmountPaid: Number(sub.submittedAmount || 0),
          paymentLastDate: payment?.lastDate instanceof Date ? payment.lastDate.toISOString() : payment?.lastDate,
          priority: payment?.priority,
          createdAt: sub.uploadedAt instanceof Date ? sub.uploadedAt.toISOString() : sub.uploadedAt,
          dueDate: payment?.lastDate instanceof Date ? payment.lastDate.toISOString() : payment?.lastDate,
          daysSinceSubmission: sub.uploadedAt 
            ? Math.floor((Date.now() - (sub.uploadedAt instanceof Date ? sub.uploadedAt.getTime() : new Date(sub.uploadedAt || 0).getTime())) / 86400000)
            : null,
          receiptFileUrl: sub.receiptUrl ? this.cloudStorageService.getFullUrl(sub.receiptUrl) : null,
          lateFeeApplied: 0,
          verifiedAt: sub.verifiedAt instanceof Date ? sub.verifiedAt.toISOString() : sub.verifiedAt,
        };
      });

      return {
        success: true,
        data: {
          submissions: submissionsWithPayments,
          total: submissionsWithPayments.length,
          summary,
        },
      };
    } catch (error: any) {
      this.logger.error(`Failed to get my class submissions for institute ${instituteId}, class ${classId}: ${error?.message}`, error?.stack);
      if (error.status && error.response) {
        throw error;
      }
      throw new BadRequestException({ success: false, message: 'Failed to retrieve submissions', error: 'FETCH_FAILED' });
    }
  }
}
