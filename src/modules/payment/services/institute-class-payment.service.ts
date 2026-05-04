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
        .filter(sub => sub.userId === user.s)
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

    const existingSubmission = await this.submissionRepository.findOne({ where: { paymentId, userId: user.s } });
    if (existingSubmission) {
      const allowResubmit = [SubmissionStatus.REJECTED, SubmissionStatus.HALF_VERIFIED, SubmissionStatus.QUARTER_VERIFIED].includes(existingSubmission.status);
      if (!allowResubmit) throw new BadRequestException({ success: false, message: 'You have already submitted a payment for this request', error: 'DUPLICATE_SUBMISSION' });
    }

    const submitter = await this.userRepository.findOne({ where: { id: user.s } });
    if (!submitter) throw new NotFoundException({ success: false, message: 'User not found', error: 'USER_NOT_FOUND' });

    const receiptUrl = dto.receiptUrl || file;
    if (typeof receiptUrl !== 'string') throw new BadRequestException({ success: false, message: 'File upload is deprecated. Use receiptUrl from /upload/verify-and-publish.', error: 'FILE_UPLOAD_DEPRECATED' });

    const timestamp = new Date();
    const submission = this.submissionRepository.create({
      paymentId,
      userId: user.s,
      userType: user.userType as any,
      username: `${submitter.firstName || ''} ${submitter.lastName || ''}`.trim(),
      paymentDate: new Date(dto.paymentDate),
      receiptUrl,
      receiptFilename: receiptUrl.split('/').pop() || 'receipt',
      transactionId: dto.transactionId,
      submittedAmount: dto.submittedAmount,
      notes: dto.notes,
      status: SubmissionStatus.PENDING,
      uploadedAt: timestamp,
      updatedAt: timestamp,
    });
    const saved = await this.submissionRepository.save(submission);
    return {
      success: true,
      message: 'Payment submission uploaded successfully',
      data: {
        submissionId: saved.id,
        status: saved.status,
        receiptFile: saved.receiptUrl ? this.cloudStorageService.getFullUrl(saved.receiptUrl) : null,
      },
    };
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

    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, instituteId, classId },
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
    const submission = await this.submissionRepository.findOne({ where: { paymentId, userId: user.s } });
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
    const qb = this.submissionRepository.createQueryBuilder('submission')
      .innerJoinAndSelect('submission.payment', 'payment')
      .where('payment.instituteId = :instituteId', { instituteId })
      .andWhere('payment.classId = :classId', { classId });

    if (status && Object.values(SubmissionStatus).includes(status as SubmissionStatus)) {
      qb.andWhere('submission.status = :status', { status });
    }
    qb.orderBy('submission.uploadedAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [submissions, total] = await qb.getManyAndCount();
    return { data: submissions.map(s => this.mapSubmissionToResponse(s)), total, page, limit, totalPages: Math.ceil(total / limit) };
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
    const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, instituteId);
    if (!hasAccess) throw new ForbiddenException({ success: false, message: 'You do not have access to this institute', error: 'NO_INSTITUTE_ACCESS' });

    const isAdmin = user.userType === UserType.SUPERADMIN || user.userType === UserType.ORGANIZATION_MANAGER ||
      user.u === 0 || user.u === 1 ||
      instituteRole === InstituteUserType.INSTITUTE_ADMIN || instituteRole === InstituteUserType.TEACHER || instituteRole === InstituteUserType.ATTENDANCE_MARKER;
    if (!isAdmin) throw new ForbiddenException({ success: false, message: 'Only admins and teachers can view the student payment list', error: 'INSUFFICIENT_PERMISSIONS' });

    const payment = await this.paymentRepository.findOne({ where: { id: paymentId, instituteId, classId } });
    if (!payment) throw new NotFoundException({ success: false, message: 'Payment not found for given institute/class', error: 'PAYMENT_NOT_FOUND' });

    const [enrollments, totalStudents] = await this.classStudentRepository.findAndCount({
      where: { instituteId, classId, isActive: true },
      relations: ['student', 'student.user'],
      order: { createdAt: 'DESC' } as any,
      skip: (page - 1) * limit,
      take: limit,
    });

    const enrolledUserIds = enrollments.map(e => e.studentUserId);
    const memberships = enrolledUserIds.length > 0
      ? await this.instituteUserRepository.find({ where: { userId: In(enrolledUserIds), instituteId } })
      : [];
    const membershipMap = new Map(memberships.map(m => [m.userId, m]));

    const submissions = await this.submissionRepository.find({ where: { paymentId } });
    const submissionMap = new Map(submissions.map(s => [s.userId, s]));

    const students = enrollments.map(enrollment => {
      const studentUserId = enrollment.studentUserId;
      const studentUser = enrollment.student?.user;
      const membership = membershipMap.get(studentUserId);
      const sub = submissionMap.get(studentUserId);
      const rawInstituteImage = membership?.instituteUserImageUrl || null;
      const rawGlobalImage = studentUser?.imageUrl || null;

      return {
        userId: studentUserId,
        nameWithInitials: studentUser ? (studentUser.nameWithInitials || `${studentUser.firstName || ''} ${studentUser.lastName || ''}`.trim()) : null,
        instituteStudentId: membership?.userIdByInstitute || null,
        cardId: membership?.instituteCardId || null,
        instituteUserImage: rawInstituteImage ? this.cloudStorageService.getFullUrl(rawInstituteImage) : (rawGlobalImage ? this.cloudStorageService.getFullUrl(rawGlobalImage) : null),
        paymentStatus: sub ? sub.status : 'NOT_SUBMITTED',
        submissionId: sub?.id || null,
        verifiedAt: sub?.verifiedAt ? (sub.verifiedAt instanceof Date ? sub.verifiedAt.toISOString() : sub.verifiedAt) : null,
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
        pagination: { currentPage: page, totalPages: Math.ceil(totalStudents / limit), totalItems: totalStudents, itemsPerPage: limit, hasNextPage: page < Math.ceil(totalStudents / limit), hasPreviousPage: page > 1 },
      },
    };
  }

  async adminVerifyStudentClassPayment(paymentId: string, studentId: string, dto: AdminVerifyStudentClassPaymentDto, user: JwtPayload) {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException({ success: false, message: 'Payment not found', error: 'PAYMENT_NOT_FOUND' });

    const { hasAccess, instituteRole } = await this.getUserInstituteRole(user, payment.instituteId);
    if (!hasAccess) throw new ForbiddenException({ success: false, message: 'You do not have access to this institute', error: 'NO_INSTITUTE_ACCESS' });

    const isAdmin = user.userType === UserType.SUPERADMIN || user.userType === UserType.ORGANIZATION_MANAGER || user.u === 0 || user.u === 1 ||
      instituteRole === InstituteUserType.INSTITUTE_ADMIN || instituteRole === InstituteUserType.TEACHER;
    if (!isAdmin) throw new ForbiddenException({ success: false, message: 'Only admins and teachers can manually verify student payments', error: 'INSUFFICIENT_PERMISSIONS' });

    const membership = await this.instituteUserRepository.findOne({ where: { userId: studentId, instituteId: payment.instituteId, status: InstituteUserStatus.ACTIVE } });
    if (!membership) throw new NotFoundException({ success: false, message: 'Student not found in this institute', error: 'STUDENT_NOT_FOUND' });

    const existingVerified = await this.submissionRepository.findOne({ where: { paymentId, userId: studentId, status: SubmissionStatus.VERIFIED } });
    if (existingVerified) throw new BadRequestException({ success: false, message: 'Student already has a verified payment for this request', error: 'ALREADY_VERIFIED', data: { existingSubmissionId: existingVerified.id } });

    const studentUser = await this.userRepository.findOne({ where: { id: studentId }, select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'userType'] });

    const timestamp = new Date();
    const submission = this.submissionRepository.create({
      paymentId,
      userId: studentId,
      userType: studentUser?.userType ?? UserType.USER,
      username: studentUser ? (studentUser.nameWithInitials || `${studentUser.firstName || ''} ${studentUser.lastName || ''}`.trim()) : studentId,
      paymentDate: new Date(dto.date),
      receiptUrl: '',
      receiptFilename: '',
      submittedAmount: dto.amount,
      status: dto.paymentTier === 'half' ? SubmissionStatus.HALF_VERIFIED : dto.paymentTier === 'quarter' ? SubmissionStatus.QUARTER_VERIFIED : SubmissionStatus.VERIFIED,
      verifiedBy: user.s,
      verifiedAt: timestamp,
      notes: dto.notes || null,
      uploadedAt: timestamp,
      updatedAt: timestamp,
    });
    const saved = await this.submissionRepository.save(submission);

    try { await this.userManagementService.refreshUserCache(studentId); } catch (e: any) {
      this.logger.warn(`Cache refresh failed after admin class payment verification for user ${studentId}: ${e.message}`);
    }

    return { success: true, message: 'Payment verified for student successfully', data: { submissionId: saved.id, paymentId, studentId, amount: dto.amount, status: saved.status, verifiedBy: user.s, verifiedAt: saved.verifiedAt, notes: saved.notes } };
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
}
