import { Injectable, BadRequestException, ForbiddenException, NotFoundException, Logger, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, DataSource } from 'typeorm';
import { FinanceService } from '../../finance/services/finance.service';
import { InstituteUserType } from '../../institute_mudules/institue_user/enums/institute-user-type.enum';
import { InstitutePayment, PaymentRequestStatus, PaymentTargetType } from '../entities/institute-payment.entity';
import { InstitutePaymentSubmission, SubmissionStatus, PaymentMethodType } from '../entities/institute-payment-submission.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteUserStatus } from '../../institute_mudules/institue_user/enums/institute-user-status.enum';
import { JwtPayload } from '../../../common/interfaces/jwt-request.interface';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { UserManagementService } from '../../../common/services/cache-user-management.service';
import { nowTimestamp, now } from '../../../common/utils/timezone.util';
import { 
  CreateInstitutePaymentDto, 
  UpdateInstitutePaymentDto,
  CreateInstitutePaymentSubmissionDto,
  VerifyInstitutePaymentSubmissionDto,
  GetInstitutePaymentsQueryDto,
  GetInstitutePaymentSubmissionsQueryDto,
  AdminVerifyStudentPaymentDto,
} from '../dto/institute-payment.dto';
import {
  transformInstitutePaymentToSecureResponse,
  transformInstitutePaymentSubmissionToSecureResponse,
  UserAccessLevel,
  PaginatedSecureInstitutePaymentsResponseDto,
  PaginatedSecureInstitutePaymentSubmissionsResponseDto
} from '../dto/secure-institute-payment-response.dto';

@Injectable()
export class InstitutePaymentService {
  private readonly logger = new Logger(InstitutePaymentService.name);

  constructor(
    @InjectRepository(InstitutePayment)
    private paymentRepository: Repository<InstitutePayment>,
    @InjectRepository(InstitutePaymentSubmission)
    private submissionRepository: Repository<InstitutePaymentSubmission>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(InstituteUserEntity)
    private instituteUserRepository: Repository<InstituteUserEntity>,
    private jwtService: JwtService,
    private readonly cloudStorageService: CloudStorageService,
    private readonly userManagementService: UserManagementService,
    private readonly dataSource: DataSource,
    @Optional() private readonly financeService?: FinanceService,
  ) {}

  /**
   * Extract user data from JWT token and validate institute membership
   * FIXED: Now actually checks InstituteUserEntity for membership
   */
  private async getUserFromJWT(user: JwtPayload, instituteId: string): Promise<{ user: JwtPayload, hasAccess: boolean, role: string, instituteRole?: string }> {
    try {
      // Get user entity from database using JWT ID
      const userEntity = await this.userRepository.findOne({
        where: { id: user.s },
        select: ['id', 'email', 'userType', 'isActive']
      });

      if (!userEntity || !userEntity.isActive) {
        return { user: null, hasAccess: false, role: null };
      }

      // Allow superadmins and org managers access without institute enrollment
      if (userEntity.userType === UserType.SUPERADMIN || userEntity.userType === UserType.ORGANIZATION_MANAGER || user.u === 0 || user.u === 1) {
        return {
          user: user,
          hasAccess: true,
          role: userEntity.userType,
          instituteRole: 'SUPERADMIN'
        };
      }

      // Validate institute membership from database for other users
      const instituteMembership = await this.instituteUserRepository.findOne({
        where: {
          userId: user.s,
          instituteId: instituteId,
          status: InstituteUserStatus.ACTIVE // Only active memberships
        }
      });

      // User must be enrolled in this institute
      if (!instituteMembership) {
        return { user: user, hasAccess: false, role: userEntity.userType };
      }

      return {
        user: user,
        hasAccess: true, // User is enrolled and active in this institute
        role: userEntity.userType,
        instituteRole: instituteMembership.instituteUserType  // e.g. INSTITUTE_ADMIN, TEACHER, STUDENT, PARENT
      };
    } catch (error) {
      this.logger.warn(`getUserFromJWT failed: ${error?.message}`);
      return { user: null, hasAccess: false, role: null };
    }
  }

  // Utility method to determine user access level for secure data filtering
  // Uses institute-level role (not system-level userType) to correctly determine access
  private getUserAccessLevel(user: JwtPayload, resourceUserId?: string, instituteRole?: string): UserAccessLevel {
    const role = user.userType;
    const userId = user.s;
    
    // System admin and organization manager have full admin access
    if (role === UserType.SUPERADMIN || role === UserType.ORGANIZATION_MANAGER || user.u === 0 || user.u === 1) {
      return UserAccessLevel.ADMIN;
    }
    
    // Institute-level admins and teachers get ADMIN access within the institute
    if (instituteRole === InstituteUserType.INSTITUTE_ADMIN || 
        instituteRole === InstituteUserType.TEACHER || 
        instituteRole === InstituteUserType.ATTENDANCE_MARKER) {
      return UserAccessLevel.ADMIN;
    }
    
    // If user is accessing their own resource
    if (resourceUserId && userId === resourceUserId) {
      return UserAccessLevel.OWNER;
    }
    
    return UserAccessLevel.USER;
  }

  // Check if an institute role is a "payer" role (receives payment requests)
  private isPayerRole(instituteRole?: string): boolean {
    return instituteRole === InstituteUserType.STUDENT || instituteRole === InstituteUserType.PARENT;
  }

  // Helper Methods - Only extract user ID from JWT, no access validation
  private async getUserEntity(user: JwtPayload): Promise<UserEntity> {
    if (!user || !user.s) {
      throw new ForbiddenException({
        success: false,
        message: 'Invalid authentication - user ID not found in JWT',
        error: 'INVALID_USER'
      });
    }

    // Get user from database to ensure it exists
    const userEntity = await this.userRepository.findOne({
      where: { id: user.s },
    });

    if (!userEntity) {
      throw new ForbiddenException({
        success: false,
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    return userEntity;
  }

  private extractUserIdFromJWT(user: JwtPayload): string {
    if (!user || !user.s) {
      throw new ForbiddenException({
        success: false,
        message: 'Invalid authentication - user ID not found in JWT',
        error: 'INVALID_USER'
      });
    }
    return user.s;
  }

  async createPayment(instituteId: string, createDto: CreateInstitutePaymentDto, user: JwtPayload) {
    // Access validation is handled at controller/decorator level
    // Service only extracts user ID from JWT token
    const userId = this.extractUserIdFromJWT(user);
    const userEntity = await this.getUserEntity(user);

    // Create real payment entity with security validation
    const timestamp = now();
    const payment = this.paymentRepository.create({
      instituteId,
      createdBy: userId,
      paymentType: createDto.paymentType,
      description: createDto.description,
      amount: createDto.amount,
      dueDate: new Date(createDto.dueDate),
      targetType: createDto.targetType,
      priority: createDto.priority,
      status: PaymentRequestStatus.ACTIVE,
      paymentInstructions: createDto.paymentInstructions,
      bankDetails: createDto.bankDetails,
      lateFeeAmount: createDto.lateFeeAmount,
      lateFeeAfterDays: createDto.lateFeeAfterDays,
      autoReminderEnabled: createDto.autoReminderEnabled ?? true,
      createdAt: timestamp,
      updatedAt: timestamp,
      reminderDaysBefore: createDto.reminderDaysBefore ?? 3,
      notes: createDto.notes,
      isActive: true
    });

    try {
      const savedPayment = await this.paymentRepository.save(payment);
      
      // Load payment with relationships for complete response
      const paymentWithRelations = await this.paymentRepository.findOne({
        where: { id: savedPayment.id },
        relations: ['creator', 'submissions']
      });

      const userAccessLevel = this.getUserAccessLevel(user);

      return {
        success: true,
        message: 'Institute payment created successfully - admin access verified',
        data: transformInstitutePaymentToSecureResponse(paymentWithRelations!, userAccessLevel, userId),
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Failed to create institute payment',
        error: 'DATABASE_ERROR',
        details: error.message
      });
    }
  }

  async getPayments(instituteId: string, queryDto: GetInstitutePaymentsQueryDto, user: JwtPayload): Promise<PaginatedSecureInstitutePaymentsResponseDto> {
    const { user: userEntity, hasAccess, role, instituteRole } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - you must be enrolled in this institute to view payments',
        error: 'ACCESS_DENIED'
      });
    }

    // Determine access level using institute role (not system-level userType)
    const userAccessLevel = this.getUserAccessLevel(user, undefined, instituteRole);
    
    try {
      // Build query - use leftJoinAndSelect for reliable entity hydration
      const queryBuilder = this.paymentRepository.createQueryBuilder('payment')
        .leftJoinAndSelect('payment.creator', 'creator')
        .leftJoinAndSelect('payment.submissions', 'submissions')
        .leftJoinAndSelect('submissions.submitter', 'submitter')
        .where('payment.instituteId = :instituteId', { instituteId })
        .andWhere('payment.isActive = :isActive', { isActive: true });

      // Apply filters based on query parameters
      if (queryDto.status) {
        queryBuilder.andWhere('payment.status = :status', { status: queryDto.status });
      }

      if (queryDto.search) {
        queryBuilder.andWhere('(payment.paymentType LIKE :search OR payment.description LIKE :search)', { 
          search: `%${queryDto.search}%` 
        });
      }

      if (queryDto.priority) {
        queryBuilder.andWhere('payment.priority = :priority', { priority: queryDto.priority });
      }

      if (queryDto.targetType) {
        queryBuilder.andWhere('payment.targetType = :targetType', { targetType: queryDto.targetType });
      }

      // Date range filtering
      if (queryDto.dueDateFrom) {
        queryBuilder.andWhere('payment.dueDate >= :dueDateFrom', { 
          dueDateFrom: new Date(queryDto.dueDateFrom) 
        });
      }

      if (queryDto.dueDateTo) {
        queryBuilder.andWhere('payment.dueDate <= :dueDateTo', { 
          dueDateTo: new Date(queryDto.dueDateTo) 
        });
      }

      // For non-admin users, filter by target type based on INSTITUTE role (not system userType)
      if (userAccessLevel !== UserAccessLevel.ADMIN) {
        if (instituteRole === InstituteUserType.STUDENT) {
          queryBuilder.andWhere('payment.targetType IN (:...studentTargets)', { studentTargets: ['STUDENTS', 'BOTH'] });
        } else if (instituteRole === InstituteUserType.PARENT) {
          queryBuilder.andWhere('payment.targetType IN (:...parentTargets)', { parentTargets: ['PARENTS', 'BOTH'] });
        }
      }

      // Apply sorting - default by dueDate DESC
      queryBuilder.orderBy('payment.dueDate', 'DESC');
      queryBuilder.addOrderBy('payment.createdAt', 'DESC');

      // Apply pagination
      const page = Math.max(1, queryDto.page || 1);
      const limit = Math.min(50, Math.max(1, queryDto.limit || 10)); // Max 50 per page for security
      const offset = (page - 1) * limit;

      queryBuilder.skip(offset).take(limit);

      // Use getManyAndCount for reliable results (getCount ignores skip/take automatically)
      const [payments, totalCount] = await queryBuilder.getManyAndCount();

      // For admins: batch-load institute membership to get instituteUserId per student
      let membershipMap = new Map<string, string | null>();
      if (userAccessLevel === UserAccessLevel.ADMIN) {
        const allSubmitterIds = [...new Set(
          payments.flatMap(p => (p.submissions || []).map(s => s.submittedBy).filter(Boolean))
        )];
        if (allSubmitterIds.length > 0) {
          const memberships = await this.instituteUserRepository.find({
            where: { userId: In(allSubmitterIds), instituteId },
            select: ['userId', 'userIdByInstitute'],
          });
          memberships.forEach(m => membershipMap.set(m.userId, m.userIdByInstitute || null));
        }
      }

      // Transform payments with role-based security filtering
      const securePayments = payments.map(payment => {
        const base = transformInstitutePaymentToSecureResponse(payment, userAccessLevel, user.s);
        if (userAccessLevel === UserAccessLevel.ADMIN && payment.submissions?.length) {
          base.submissions = payment.submissions.map(sub => ({
            uuid: sub.submittedBy,
            nameWithInitials: sub.submitter
              ? (sub.submitter.nameWithInitials || `${sub.submitter.firstName || ''} ${sub.submitter.lastName || ''}`.trim())
              : null,
            image: sub.submitter?.imageUrl ? this.cloudStorageService.getFullUrl(sub.submitter.imageUrl) : null,
            instituteUserId: membershipMap.get(sub.submittedBy) ?? null,
            status: sub.status,
            amount: parseFloat(String(sub.paymentAmount || 0)),
            date: sub.verifiedAt || sub.paymentDate || sub.createdAt,
            note: sub.notes || null,
          }));
        }
        // For non-admin users (students/parents): include their own submissions per payment
        if (userAccessLevel !== UserAccessLevel.ADMIN && payment.submissions?.length) {
          const userSubs = payment.submissions
            .filter(sub => sub.submittedBy === user.s)
            .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
          if (userSubs.length > 0) {
            const latest = userSubs[0];
            base.mySubmissionStatus = latest.status;
            base.mySubmissionId = latest.id;
            base.hasSubmitted = true;
            base.mySubmissions = userSubs.map(sub => ({
              id: sub.id,
              paymentAmount: parseFloat(String(sub.paymentAmount || 0)),
              paymentMethod: sub.paymentMethod,
              transactionReference: sub.transactionReference,
              paymentDate: sub.paymentDate?.toISOString() || null,
              status: sub.status,
              verifiedAt: sub.verifiedAt?.toISOString() || null,
              rejectionReason: sub.rejectionReason,
              paymentRemarks: sub.paymentRemarks || sub.notes || null,
              lateFeeApplied: parseFloat(String(sub.lateFeeApplied || 0)),
              totalAmountPaid: parseFloat(String(sub.totalAmountPaid || 0)),
              receiptFileUrl: sub.receiptFileUrl,
              receiptFileName: sub.receiptFileName,
              createdAt: sub.createdAt?.toISOString() || null,
              canResubmit: [
                SubmissionStatus.REJECTED,
                SubmissionStatus.HALF_VERIFIED,
                SubmissionStatus.QUARTER_VERIFIED,
              ].includes(sub.status) && payment.isActive,
              daysSinceSubmission: sub.createdAt ? Math.floor((nowTimestamp() - sub.createdAt.getTime()) / (24 * 60 * 60 * 1000)) : null,
            }));
          } else {
            base.mySubmissionStatus = null;
            base.mySubmissionId = null;
            base.hasSubmitted = false;
            base.mySubmissions = [];
          }
        }
        return base;
      });

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / limit);

      return {
        success: true,
        message: `Retrieved ${securePayments.length} institute payments with security filtering applied`,
        data: {
          payments: securePayments,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: totalCount,
            itemsPerPage: limit,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1
          }
        }
      };
    } catch (error) {
      this.logger.error(`[getPayments] Error for institute=${instituteId}: ${error.message}`, error.stack);
      throw new BadRequestException({
        success: false,
        message: 'Failed to retrieve institute payments',
        error: 'DATABASE_ERROR',
        details: error.message
      });
    }
  }

  async getMyApplicablePayments(instituteId: string, queryDto: GetInstitutePaymentsQueryDto, user: JwtPayload) {
    const { user: userEntity, hasAccess, role, instituteRole } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - you must be enrolled in this institute',
        error: 'ACCESS_DENIED'
      });
    }

    // Only payer roles (STUDENT, PARENT) can view "my applicable payments"
    // INSTITUTE_ADMIN, TEACHER, ATTENDANCE_MARKER are not payment recipients
    if (!this.isPayerRole(instituteRole)) {
      return {
        success: true,
        message: 'This endpoint is for students and parents. Admins/teachers should use the payments list endpoint.',
        data: {
          payments: [],
          userRole: instituteRole,
          instituteId,
          totalApplicable: 0,
          pendingPayments: 0,
          pagination: {
            currentPage: queryDto.page || 1,
            totalPages: 0,
            totalItems: 0,
            itemsPerPage: queryDto.limit || 10,
            hasNextPage: false,
            hasPreviousPage: false,
          }
        },
      };
    }

    const userAccessLevel = this.getUserAccessLevel(user, undefined, instituteRole);
    
    try {
      const whereConditions: any = {
        instituteId,
        isActive: true,
        status: PaymentRequestStatus.ACTIVE,
      };

      // Filter by target type based on INSTITUTE role (not system userType)
      if (instituteRole === InstituteUserType.STUDENT) {
        whereConditions.targetType = In([PaymentTargetType.STUDENTS, PaymentTargetType.BOTH]);
      } else if (instituteRole === InstituteUserType.PARENT) {
        whereConditions.targetType = In([PaymentTargetType.PARENTS, PaymentTargetType.BOTH]);
      }

      const page = Math.max(1, queryDto.page || 1);
      const limit = Math.min(50, Math.max(1, queryDto.limit || 20));

      // Query payments - only load submissions for the current user, not all submitters/verifiers
      const payments = await this.paymentRepository.find({
        where: whereConditions,
        relations: ['creator', 'submissions'],
        order: { 
          dueDate: 'ASC',
          createdAt: 'DESC'
        },
        take: limit,
        skip: (page - 1) * limit,
      });

      // Get user's submission status for each payment
      const paymentsWithSubmissionStatus = payments.map(payment => {
        // Find user's submission for this payment
        const userSubmission = payment.submissions?.find(
          submission => submission.submittedBy === user.s
        );

        // Transform to secure response format
        const securePayment = transformInstitutePaymentToSecureResponse(payment, userAccessLevel, user.s);
        
        return {
          ...securePayment,
          isApplicableToUser: true,
          mySubmissionStatus: userSubmission?.status || null,
          mySubmissionId: userSubmission?.id || null,
          hasSubmitted: !!userSubmission,
          submissionDate: userSubmission?.createdAt || null,
        };
      });

      const securePayments = paymentsWithSubmissionStatus;

    return {
      success: true,
      message: `Your applicable payments retrieved - ${instituteRole?.toLowerCase() || 'user'} specific view`,
      data: {
        payments: securePayments,
        userRole: instituteRole,
        instituteId,
        totalApplicable: securePayments.length,
        pendingPayments: securePayments.filter(p => !p.mySubmissionStatus || p.mySubmissionStatus === 'PENDING').length,
        pagination: {
          currentPage: page,
          totalPages: 1,
          totalItems: securePayments.length,
          itemsPerPage: limit,
          hasNextPage: false,
          hasPreviousPage: false,
        }
      },
    };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Failed to fetch applicable payments',
        error: error.message,
      });
    }
  }

  async getPaymentById(instituteId: string, paymentId: string, user: JwtPayload) {
    const { user: userEntity, hasAccess, role, instituteRole } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - sensitive data protection',
        error: 'ACCESS_DENIED'
      });
    }

    const userAccessLevel = this.getUserAccessLevel(user, undefined, instituteRole);

    try {
      // Find payment with security validation
      const payment = await this.paymentRepository.findOne({
        where: { 
          id: paymentId, 
          instituteId,
          isActive: true
        },
        relations: ['creator', 'submissions']
      });

      if (!payment) {
        throw new NotFoundException({
          success: false,
          message: 'Payment not found or access denied',
          error: 'PAYMENT_NOT_FOUND'
        });
      }

      // Apply role-based filtering for non-admin users using INSTITUTE role
      if (userAccessLevel !== UserAccessLevel.ADMIN) {
        if (instituteRole === InstituteUserType.STUDENT && 
            !['STUDENTS', 'BOTH'].includes(payment.targetType)) {
          throw new ForbiddenException({
            success: false,
            message: 'Access denied - payment not applicable to your role',
            error: 'ROLE_BASED_ACCESS_DENIED'
          });
        }
        if (instituteRole === InstituteUserType.PARENT && 
            !['PARENTS', 'BOTH'].includes(payment.targetType)) {
          throw new ForbiddenException({
            success: false,
            message: 'Access denied - payment not applicable to your role',
            error: 'ROLE_BASED_ACCESS_DENIED'
          });
        }
      }

      return {
        success: true,
        message: 'Payment details retrieved - sensitive data filtered based on user role',
        data: transformInstitutePaymentToSecureResponse(payment, userAccessLevel, user.s),
      };
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        message: 'Failed to retrieve payment details',
        error: 'DATABASE_ERROR',
        details: error.message
      });
    }
  }

  async updatePayment(instituteId: string, paymentId: string, updateDto: UpdateInstitutePaymentDto, user: JwtPayload) {
    const { user: userEntity, hasAccess, role, instituteRole } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - insufficient permissions',
        error: 'ACCESS_DENIED'
      });
    }

    try {
      // Find existing payment with security validation
      const existingPayment = await this.paymentRepository.findOne({
        where: { 
          id: paymentId, 
          instituteId,
          isActive: true 
        },
        relations: ['submissions']
      });

      if (!existingPayment) {
        throw new NotFoundException({
          success: false,
          message: 'Payment not found or already deleted',
          error: 'PAYMENT_NOT_FOUND'
        });
      }

      // Validate business rules before updating
      if (existingPayment.status === PaymentRequestStatus.COMPLETED) {
        throw new BadRequestException({
          success: false,
          message: 'Cannot modify completed payments',
          error: 'PAYMENT_ALREADY_COMPLETED'
        });
      }

      // If there are submissions, restrict certain updates
      if (existingPayment.submissions?.length > 0) {
        if (updateDto.amount && updateDto.amount !== existingPayment.amount) {
          throw new BadRequestException({
            success: false,
            message: 'Cannot change payment amount when submissions exist. Consider creating a new payment request.',
            error: 'AMOUNT_CHANGE_RESTRICTED'
          });
        }
      }

      // Update payment with validation
      const updatedPayment = await this.paymentRepository.save({
        ...existingPayment,
        ...updateDto,
        id: paymentId, // Ensure ID doesn't change
        instituteId, // Ensure institute ID doesn't change
        updatedAt: now()
      });

      // Load updated payment with relations
      const paymentWithRelations = await this.paymentRepository.findOne({
        where: { id: paymentId },
        relations: ['creator', 'submissions']
      });

      const userAccessLevel = this.getUserAccessLevel(user, undefined, instituteRole);

      return {
        success: true,
        message: 'Payment updated successfully - admin access verified',
        data: transformInstitutePaymentToSecureResponse(paymentWithRelations!, userAccessLevel, user.s)
      };
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        message: 'Failed to update payment',
        error: 'DATABASE_ERROR',
        details: error.message
      });
    }
  }

  async getPaymentStatistics(instituteId: string, user: JwtPayload) {
    const { hasAccess } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - insufficient permissions',
        error: 'ACCESS_DENIED'
      });
    }

    try {
      // Consolidated payment stats in a single query instead of 4 separate count queries
      const paymentStats = await this.paymentRepository
        .createQueryBuilder('p')
        .select('COUNT(*)', 'totalPayments')
        .addSelect(`SUM(CASE WHEN p.status = :active AND p.isActive = true THEN 1 ELSE 0 END)`, 'activePayments')
        .addSelect(`SUM(CASE WHEN p.status = :completed THEN 1 ELSE 0 END)`, 'completedPayments')
        .addSelect(`SUM(CASE WHEN p.dueDate < :now AND p.status = :active THEN 1 ELSE 0 END)`, 'expiredPayments')
        .where('p.instituteId = :instituteId', { instituteId })
        .setParameter('active', PaymentRequestStatus.ACTIVE)
        .setParameter('completed', PaymentRequestStatus.COMPLETED)
        .setParameter('now', now())
        .getRawOne();

      // Consolidated submission stats in a single query instead of 4 count + 2 find queries
      const submissionStats = await this.submissionRepository
        .createQueryBuilder('s')
        .leftJoin('s.payment', 'p')
        .select('COUNT(*)', 'totalSubmissions')
        .addSelect(`SUM(CASE WHEN s.status = 'PENDING' THEN 1 ELSE 0 END)`, 'pendingSubmissions')
        .addSelect(`SUM(CASE WHEN s.status = 'VERIFIED' THEN 1 ELSE 0 END)`, 'verifiedSubmissions')
        .addSelect(`SUM(CASE WHEN s.status = 'REJECTED' THEN 1 ELSE 0 END)`, 'rejectedSubmissions')
        .addSelect(`SUM(CASE WHEN s.status = 'VERIFIED' THEN s.paymentAmount ELSE 0 END)`, 'totalAmountCollected')
        .addSelect(`SUM(CASE WHEN s.status = 'PENDING' THEN s.paymentAmount ELSE 0 END)`, 'pendingAmount')
        .where('p.instituteId = :instituteId', { instituteId })
        .getRawOne();

      // Get latest verification and top submitters in parallel
      const [lastVerification, topSubmittersQuery] = await Promise.all([
        this.submissionRepository.findOne({
          relations: ['payment', 'verifier'],
          where: { payment: { instituteId }, status: SubmissionStatus.VERIFIED },
          order: { verifiedAt: 'DESC' }
        }),
        this.submissionRepository
          .createQueryBuilder('submission')
          .leftJoin('submission.payment', 'payment')
          .select('submission.submittedBy', 'studentId')
          .addSelect('COUNT(submission.id)', 'submissions')
          .addSelect('SUM(submission.paymentAmount)', 'totalAmount')
          .where('payment.instituteId = :instituteId', { instituteId })
          .andWhere('submission.status = :status', { status: SubmissionStatus.VERIFIED })
          .groupBy('submission.submittedBy')
          .orderBy('COUNT(submission.id)', 'DESC')
          .limit(5)
          .getRawMany()
      ]);

      return {
        success: true,
        message: 'Payment statistics retrieved',
        data: {
          totalPayments: parseInt(paymentStats.totalPayments) || 0,
          activePayments: parseInt(paymentStats.activePayments) || 0,
          completedPayments: parseInt(paymentStats.completedPayments) || 0,
          expiredPayments: parseInt(paymentStats.expiredPayments) || 0,
          totalSubmissions: parseInt(submissionStats.totalSubmissions) || 0,
          pendingSubmissions: parseInt(submissionStats.pendingSubmissions) || 0,
          verifiedSubmissions: parseInt(submissionStats.verifiedSubmissions) || 0,
          rejectedSubmissions: parseInt(submissionStats.rejectedSubmissions) || 0,
          totalAmountCollected: parseFloat(submissionStats.totalAmountCollected) || 0,
          pendingAmount: parseFloat(submissionStats.pendingAmount) || 0,
          lastVerificationBy: lastVerification?.verifier?.id || null,
          lastVerificationAt: lastVerification?.verifiedAt || null,
          topSubmitters: topSubmittersQuery.map(item => ({
            studentId: item.studentId,
            submissions: parseInt(item.submissions),
            totalAmount: parseFloat(item.totalAmount) || 0
          }))
        }
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Failed to fetch payment statistics',
        error: error.message,
      });
    }
  }

  async getMyPaymentSummary(instituteId: string, user: JwtPayload) {
    const { user: userEntity, hasAccess, role, instituteRole } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - you must be enrolled in this institute',
        error: 'ACCESS_DENIED'
      });
    }

    // Only payer roles (STUDENT, PARENT) have a payment summary
    if (!this.isPayerRole(instituteRole)) {
      return {
        success: true,
        message: 'Payment summary not applicable for admin/teacher roles',
        data: {
          instituteId,
          userRole: instituteRole,
          totalApplicablePayments: 0,
          pendingPayments: 0,
          completedPayments: 0,
          totalAmountDue: 0,
          totalAmountPaid: 0,
          nextDueDate: null,
          upcomingPayments: []
        }
      };
    }

    try {
      const whereConditions: any = {
        instituteId,
        isActive: true,
        status: PaymentRequestStatus.ACTIVE,
      };

      // Filter by target type based on INSTITUTE role
      if (instituteRole === InstituteUserType.STUDENT) {
        whereConditions.targetType = In([PaymentTargetType.STUDENTS, PaymentTargetType.BOTH]);
      } else if (instituteRole === InstituteUserType.PARENT) {
        whereConditions.targetType = In([PaymentTargetType.PARENTS, PaymentTargetType.BOTH]);
      }

      // Get all applicable payments
      const applicablePayments = await this.paymentRepository.find({
        where: whereConditions,
        relations: ['submissions'],
      });

      // Get user's submissions
      const userSubmissions = await this.submissionRepository.find({
        relations: ['payment'],
        where: {
          submittedBy: user.s,
          payment: { instituteId }
        }
      });

      // Calculate user's payment statistics
      const totalApplicablePayments = applicablePayments.length;
      
      const userSubmissionsByPayment = userSubmissions.reduce((acc, submission) => {
        acc[submission.paymentId] = submission;
        return acc;
      }, {});

      const pendingPayments = applicablePayments.filter(payment => {
        const userSubmission = userSubmissionsByPayment[payment.id];
        return !userSubmission || userSubmission.status === SubmissionStatus.PENDING;
      }).length;

      const completedPayments = userSubmissions.filter(
        submission => submission.status === SubmissionStatus.VERIFIED
      ).length;

      // Calculate amounts
      const totalAmountDue = applicablePayments
        .filter(payment => {
          const userSubmission = userSubmissionsByPayment[payment.id];
          return !userSubmission || userSubmission.status !== SubmissionStatus.VERIFIED;
        })
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

      const totalAmountPaid = userSubmissions
        .filter(submission => submission.status === SubmissionStatus.VERIFIED)
        .reduce((sum, submission) => sum + Number(submission.paymentAmount || 0), 0);

      // Get next due date
      const upcomingPayments = applicablePayments
        .filter(payment => {
          const userSubmission = userSubmissionsByPayment[payment.id];
          return (!userSubmission || userSubmission.status !== SubmissionStatus.VERIFIED) && 
                 payment.dueDate > now();
        })
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 3)
        .map(payment => ({
          id: payment.id,
          paymentType: payment.paymentType,
          amount: payment.amount,
          dueDate: payment.dueDate,
          priority: payment.priority
        }));

      const nextDueDate = upcomingPayments.length > 0 ? upcomingPayments[0].dueDate : null;

      return {
        success: true,
        message: `Payment summary retrieved for ${instituteRole?.toLowerCase() || 'user'}`,

        data: {
          instituteId,
          userRole: instituteRole,
          totalApplicablePayments,
          pendingPayments,
          completedPayments,
          totalAmountDue,
          totalAmountPaid,
          nextDueDate,
          upcomingPayments
        }
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Failed to fetch payment summary',
        error: error.message,
      });
    }
  }

  async submitPayment(
    instituteId: string, 
    paymentId: string, 
    createSubmissionDto: CreateInstitutePaymentSubmissionDto, 
    user: JwtPayload
  ) {
    const { user: userEntity, hasAccess, role, instituteRole } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied',
        error: 'ACCESS_DENIED'
      });
    }

    // Only payer roles (STUDENT, PARENT) can submit payments
    if (!this.isPayerRole(instituteRole)) {
      throw new ForbiddenException({
        success: false,
        message: 'Only students and parents can submit payments',
        error: 'NOT_A_PAYER_ROLE'
      });
    }

    try {
      // Wrap in transaction to prevent duplicate submission race condition
      const savedSubmission = await this.dataSource.transaction(async (manager) => {
        // Verify the payment exists and is active
        const payment = await manager.findOne(InstitutePayment, {
          where: { 
            id: paymentId, 
            instituteId,
            isActive: true,
            status: PaymentRequestStatus.ACTIVE
          },
          lock: { mode: 'pessimistic_read' },
        });

        if (!payment) {
          throw new NotFoundException({
            success: false,
            message: 'Payment not found or not accepting submissions',
            error: 'PAYMENT_NOT_FOUND'
          });
        }

        // Check if user already has a pending submission for this payment (inside transaction)
        const existingSubmission = await manager.findOne(InstitutePaymentSubmission, {
          where: { 
            paymentId, 
            submittedBy: user.s,
            status: SubmissionStatus.PENDING
          }
        });

        if (existingSubmission) {
          throw new BadRequestException({
            success: false,
            message: 'You already have a pending submission for this payment',
            error: 'DUPLICATE_SUBMISSION'
          });
        }

        // Calculate late fee if applicable
        let lateFeeApplied = 0;
        const currentTimeMs = nowTimestamp();
        const dueDateMs = payment.dueDate.getTime();
        const msPerDay = 24 * 60 * 60 * 1000;
        const daysOverdue = Math.floor((currentTimeMs - dueDateMs) / msPerDay);
        
        if (payment.lateFeeAmount && payment.lateFeeAfterDays && daysOverdue > payment.lateFeeAfterDays) {
          lateFeeApplied = payment.lateFeeAmount;
        }

        // Use receipt URL from DTO (uploaded via /upload/verify-and-publish)
        const receiptFileUrl = createSubmissionDto.receiptUrl;
        const receiptFileName = receiptFileUrl ? receiptFileUrl.split('/').pop() : undefined;

        // Create submission - ALWAYS defaults to PENDING - NEVER auto-verified
        const timestamp = now();
        const submission = manager.create(InstitutePaymentSubmission, {
          paymentId,
          submittedBy: user.s,
          paymentAmount: createSubmissionDto.paymentAmount,
          paymentMethod: createSubmissionDto.paymentMethod,
          transactionReference: createSubmissionDto.transactionReference,
          paymentDate: new Date(createSubmissionDto.paymentDate),
          receiptFileUrl,
          receiptFileName,
          receiptFileSize: undefined,
          receiptFileType: undefined,
          status: SubmissionStatus.PENDING, // ALWAYS PENDING - never auto-verified
          lateFeeApplied,
          totalAmountPaid: createSubmissionDto.paymentAmount + lateFeeApplied,
          paymentRemarks: createSubmissionDto.paymentRemarks,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        return await manager.save(InstitutePaymentSubmission, submission);
      });

      // Load submission with relations for response
      const submissionWithRelations = await this.submissionRepository.findOne({
        where: { id: savedSubmission.id },
        relations: ['payment', 'submitter']
      });

      const userAccessLevel = this.getUserAccessLevel(user, undefined, instituteRole);

      return {
        success: true,
        message: 'Payment submitted successfully - verification details hidden for security',
        data: transformInstitutePaymentSubmissionToSecureResponse(submissionWithRelations!, userAccessLevel, user.s, false, this.cloudStorageService),
      };
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        message: 'Failed to submit payment',
        error: 'DATABASE_ERROR',
        details: error.message
      });
    }
  }

  async getPaymentSubmissions(instituteId: string, paymentId: string, queryDto: GetInstitutePaymentSubmissionsQueryDto, user: JwtPayload) {
    const { user: userEntity, hasAccess, role, instituteRole } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied',
        error: 'ACCESS_DENIED'
      });
    }

    // Build the query - use leftJoinAndSelect for reliable entity hydration
    const queryBuilder = this.submissionRepository.createQueryBuilder('submission')
      .leftJoinAndSelect('submission.submitter', 'submitter')
      .leftJoinAndSelect('submission.payment', 'payment')
      .where('submission.paymentId = :paymentId', { paymentId })
      .andWhere('payment.instituteId = :instituteId', { instituteId });

    // Apply filters
    if (queryDto.status) {
      queryBuilder.andWhere('submission.status = :status', { status: queryDto.status });
    }

    if (queryDto.paymentMethod) {
      queryBuilder.andWhere('submission.paymentMethod = :paymentMethod', { paymentMethod: queryDto.paymentMethod });
    }

    // Date range filters
    if (queryDto.paymentDateFrom) {
      queryBuilder.andWhere('submission.paymentDate >= :paymentDateFrom', { paymentDateFrom: new Date(queryDto.paymentDateFrom) });
    }

    if (queryDto.paymentDateTo) {
      queryBuilder.andWhere('submission.paymentDate <= :paymentDateTo', { paymentDateTo: new Date(queryDto.paymentDateTo) });
    }

    if (queryDto.submissionDateFrom) {
      queryBuilder.andWhere('submission.createdAt >= :submissionDateFrom', { submissionDateFrom: new Date(queryDto.submissionDateFrom) });
    }

    if (queryDto.submissionDateTo) {
      queryBuilder.andWhere('submission.createdAt <= :submissionDateTo', { submissionDateTo: new Date(queryDto.submissionDateTo) });
    }

    if (queryDto.verificationDateFrom) {
      queryBuilder.andWhere('submission.verifiedAt >= :verificationDateFrom', { verificationDateFrom: new Date(queryDto.verificationDateFrom) });
    }

    if (queryDto.verificationDateTo) {
      queryBuilder.andWhere('submission.verifiedAt <= :verificationDateTo', { verificationDateTo: new Date(queryDto.verificationDateTo) });
    }

    // Amount range filters
    if (queryDto.amountFrom !== undefined) {
      queryBuilder.andWhere('submission.totalAmountPaid >= :amountFrom', { amountFrom: queryDto.amountFrom });
    }

    if (queryDto.amountTo !== undefined) {
      queryBuilder.andWhere('submission.totalAmountPaid <= :amountTo', { amountTo: queryDto.amountTo });
    }

    // Student filters
    if (queryDto.studentId) {
      queryBuilder.andWhere('submission.submittedBy = :studentId', { studentId: queryDto.studentId });
    }

    if (queryDto.studentName) {
      queryBuilder.andWhere('(LOWER(submitter.firstName) LIKE LOWER(:studentName) OR LOWER(submitter.lastName) LIKE LOWER(:studentName) OR LOWER(CONCAT(submitter.firstName, \' \', submitter.lastName)) LIKE LOWER(:studentName))', 
        { studentName: `%${queryDto.studentName}%` });
    }

    // Text search
    if (queryDto.search) {
      queryBuilder.andWhere('(submission.transactionReference LIKE :search OR submission.paymentRemarks LIKE :search OR submission.notes LIKE :search)', 
        { search: `%${queryDto.search}%` });
    }

    // Special filters
    if (queryDto.hasLateFee !== undefined) {
      if (queryDto.hasLateFee) {
        queryBuilder.andWhere('submission.lateFeeApplied > 0');
      } else {
        queryBuilder.andWhere('(submission.lateFeeApplied = 0 OR submission.lateFeeApplied IS NULL)');
      }
    }

    if (queryDto.hasAttachment !== undefined) {
      if (queryDto.hasAttachment) {
        queryBuilder.andWhere('submission.receiptFileUrl IS NOT NULL');
      } else {
        queryBuilder.andWhere('submission.receiptFileUrl IS NULL');
      }
    }

    // Sorting
    const sortMapping = {
      paymentDate: 'submission.paymentDate',
      submissionDate: 'submission.createdAt',
      verificationDate: 'submission.verifiedAt',
      amount: 'submission.totalAmountPaid',
      status: 'submission.status',
      studentName: 'submitter.firstName'
    };

    const sortField = sortMapping[queryDto.sortBy || 'submissionDate'] || 'submission.createdAt';
    const sortOrder = queryDto.sortOrder || 'DESC';
    queryBuilder.orderBy(sortField, sortOrder);

    // Add secondary sort for consistency
    if (queryDto.sortBy !== 'submissionDate') {
      queryBuilder.addOrderBy('submission.createdAt', 'DESC');
    }

    // Pagination
    const page = queryDto.page || 1;
    const limit = queryDto.limit || 10;
    const skip = (page - 1) * limit;

    // Use getManyAndCount to avoid duplicating all filter logic in a separate count query
    const [submissions, totalCount] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPages = Math.ceil(totalCount / limit);

    // Get summary counts in a single query instead of 3 separate count + 1 sum queries
    const summaryResult = await this.submissionRepository
      .createQueryBuilder('s')
      .select(`SUM(CASE WHEN s.status = 'PENDING' THEN 1 ELSE 0 END)`, 'pendingCount')
      .addSelect(`SUM(CASE WHEN s.status = 'VERIFIED' THEN 1 ELSE 0 END)`, 'verifiedCount')
      .addSelect(`SUM(CASE WHEN s.status = 'REJECTED' THEN 1 ELSE 0 END)`, 'rejectedCount')
      .addSelect(`SUM(CASE WHEN s.status = 'VERIFIED' THEN s.totalAmountPaid ELSE 0 END)`, 'totalVerifiedAmount')
      .where('s.paymentId = :paymentId', { paymentId })
      .getRawOne();

    // Transform submissions for clean frontend response (remove sensitive/empty data)
    const cleanSubmissions = this.transformSubmissionsForFrontend(submissions);

    return {
      success: true,
      message: 'Payment submissions retrieved successfully',
      data: {
        submissions: cleanSubmissions,
        paymentId,
        instituteId,
        ...this.buildFilterResponse(queryDto),
        sorting: {
          sortBy: queryDto.sortBy || 'submissionDate',
          sortOrder: queryDto.sortOrder || 'DESC'
        },
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          startItem: skip + 1,
          endItem: Math.min(skip + limit, totalCount)
        },
        summary: {
          totalSubmissions: totalCount,
          pendingCount: parseInt(summaryResult?.pendingCount) || 0,
          verifiedCount: parseInt(summaryResult?.verifiedCount) || 0,
          rejectedCount: parseInt(summaryResult?.rejectedCount) || 0,
          totalVerifiedAmount: parseFloat(summaryResult?.totalVerifiedAmount) || 0
        }
      }
    };
  }

  // Helper method to transform submissions for frontend (remove sensitive/empty data)
  private transformSubmissionsForFrontend(submissions: any[]): any[] {
    return submissions.map(sub => {
      // Build base submission object with only necessary fields
      const cleanSub: any = {
        id: sub.id,
        paymentAmount: parseFloat(sub.paymentAmount),
        paymentMethod: sub.paymentMethod,
        paymentDate: sub.paymentDate?.toISOString(),
        status: sub.status,
        totalAmount: parseFloat(sub.totalAmountPaid),
        studentName: sub.submitter ? (sub.submitter.nameWithInitials || `${sub.submitter.firstName} ${sub.submitter.lastName}`.trim()) : null,
        userId: sub.submitter?.id || null
      };

      // Only add fields if they have meaningful values (avoid null/empty)
      if (sub.transactionReference?.trim()) {
        cleanSub.transactionRef = sub.transactionReference.trim();
      }

      if (sub.paymentRemarks?.trim()) {
        cleanSub.remarks = sub.paymentRemarks.trim();
      }

      if (sub.rejectionReason?.trim()) {
        cleanSub.rejectionReason = sub.rejectionReason.trim();
      }

      if (sub.lateFeeApplied && parseFloat(sub.lateFeeApplied) > 0) {
        cleanSub.lateFee = parseFloat(sub.lateFeeApplied);
      }

      // Only include attachment info if file exists (boolean flag only)
      if (sub.receiptFileUrl?.trim()) {
        cleanSub.hasAttachment = true;
        // Only provide download URL, not internal file details
        cleanSub.receiptUrl = sub.receiptFileUrl.trim();
      } else {
        cleanSub.hasAttachment = false;
      }

      return cleanSub;
    });
  }

  // Helper method to build filter response (only include applied filters)
  private buildFilterResponse(queryDto: GetInstitutePaymentSubmissionsQueryDto): any {
    const response: any = {};

    // Only include filters that were actually applied
    if (queryDto.status) response.status = queryDto.status;
    if (queryDto.paymentMethod) response.paymentMethod = queryDto.paymentMethod;
    if (queryDto.search) response.searchTerm = queryDto.search;

    // Date ranges - only include if specified
    const dateRanges: any = {};
    if (queryDto.paymentDateFrom || queryDto.paymentDateTo) {
      dateRanges.paymentDate = {};
      if (queryDto.paymentDateFrom) dateRanges.paymentDate.from = queryDto.paymentDateFrom;
      if (queryDto.paymentDateTo) dateRanges.paymentDate.to = queryDto.paymentDateTo;
    }
    if (queryDto.amountFrom !== undefined || queryDto.amountTo !== undefined) {
      dateRanges.amount = {};
      if (queryDto.amountFrom !== undefined) dateRanges.amount.from = queryDto.amountFrom;
      if (queryDto.amountTo !== undefined) dateRanges.amount.to = queryDto.amountTo;
    }
    if (Object.keys(dateRanges).length > 0) response.ranges = dateRanges;

    // Special filters - only include if specified
    if (queryDto.hasLateFee !== undefined) response.hasLateFee = queryDto.hasLateFee;
    if (queryDto.hasAttachment !== undefined) response.hasAttachment = queryDto.hasAttachment;
    if (queryDto.studentName) response.studentSearch = queryDto.studentName;

    return Object.keys(response).length > 0 ? { filters: response } : {};
  }

  async verifySubmission(
    instituteId: string, 
    paymentId: string,
    submissionId: string, 
    verifyDto: VerifyInstitutePaymentSubmissionDto, 
    user: JwtPayload
  ) {
    const { user: userEntity, hasAccess, role, instituteRole } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied to this institute',
        error: 'INSTITUTE_ACCESS_DENIED'
      });
    }

    // Find the submission with relations
    const submission = await this.submissionRepository
      .createQueryBuilder('submission')
      .leftJoinAndSelect('submission.payment', 'payment')
      .leftJoinAndSelect('submission.submitter', 'submitter')
      .where('submission.id = :submissionId', { submissionId })
      .getOne();

    if (!submission) {
      throw new NotFoundException({
        success: false,
        message: 'Submission not found',
        error: 'SUBMISSION_NOT_FOUND'
      });
    }

    // Verify that the payment belongs to the specified institute
    if (submission.payment.instituteId !== instituteId) {
      throw new ForbiddenException({
        success: false,
        message: 'Payment does not belong to the specified institute. Access denied.',
        error: 'INSTITUTE_PAYMENT_MISMATCH'
      });
    }

    // Check if submission is already fully processed
    const processableStatuses = ['PENDING', 'HALF_VERIFIED', 'QUARTER_VERIFIED'];
    if (!processableStatuses.includes(submission.status)) {
      throw new BadRequestException({
        success: false,
        message: `Submission has already been fully processed`,
        error: 'SUBMISSION_ALREADY_PROCESSED',
        data: {
          currentStatus: submission.status,
          verifiedBy: submission.verifiedBy,
          verifiedAt: submission.verifiedAt,
          rejectionReason: submission.rejectionReason
        }
      });
    }

    // Validate rejection reason if status is REJECTED
    if (verifyDto.status === 'REJECTED' && (!verifyDto.rejectionReason || verifyDto.rejectionReason.trim().length === 0)) {
      throw new BadRequestException({
        success: false,
        message: 'Rejection reason is required when rejecting a submission',
        error: 'REJECTION_REASON_REQUIRED'
      });
    }

    // Update submission atomically with pessimistic lock to prevent concurrent verification
    const currentTime = now();

    const updatedSubmission = await this.dataSource.transaction(async (manager) => {
      // Re-fetch with lock inside transaction to prevent race condition
      const lockedSubmission = await manager.findOne(InstitutePaymentSubmission, {
        where: { id: submissionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedSubmission || !['PENDING', 'HALF_VERIFIED', 'QUARTER_VERIFIED'].includes(lockedSubmission.status)) {
        throw new BadRequestException({
          success: false,
          message: `Submission is already ${lockedSubmission?.status?.toLowerCase() || 'processed'}`,
          error: 'SUBMISSION_ALREADY_PROCESSED',
        });
      }

      lockedSubmission.status = verifyDto.status as any;
      lockedSubmission.verifiedBy = user.s;
      lockedSubmission.verifiedAt = currentTime;
      lockedSubmission.rejectionReason = verifyDto.status === 'REJECTED' ? verifyDto.rejectionReason : null;
      lockedSubmission.notes = verifyDto.notes || null;
      lockedSubmission.updatedAt = currentTime;

      return await manager.save(InstitutePaymentSubmission, lockedSubmission);
    });

    // 🔄 CRITICAL FIX: Refresh user cache after payment verification (payment status affects user data)
    if (verifyDto.status === 'VERIFIED') {
      try {
        await this.userManagementService.refreshUserCache(submission.submittedBy);
      } catch (cacheError) {
        this.logger.warn(`Cache refresh failed after payment verification for user ${submission.submittedBy}: ${cacheError.message}`);
      }
    }

    // Return clean response with minimal necessary data
    const responseData: any = {
      id: updatedSubmission.id,
      status: updatedSubmission.status,
      verifierName: (userEntity as any).nameWithInitials || `${(userEntity as any).firstName} ${(userEntity as any).lastName}`.trim(),
      verificationDate: updatedSubmission.verifiedAt?.toISOString() || null
    };

    // Only include rejection reason if submission was rejected
    if (verifyDto.status === 'REJECTED' && updatedSubmission.rejectionReason) {
      responseData.rejectionReason = updatedSubmission.rejectionReason;
    }

    // Only include admin notes if they exist
    if (updatedSubmission.notes?.trim()) {
      responseData.adminNotes = updatedSubmission.notes.trim();
    }

    return {
      success: true,
      message: `Submission ${verifyDto.status.toLowerCase()} successfully by ${instituteRole || role}`,
      data: responseData
    };
  }

  async getMySubmissions(instituteId: string, queryDto: GetInstitutePaymentSubmissionsQueryDto, user: JwtPayload) {
    const { user: userEntity, hasAccess, role, instituteRole } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied',
        error: 'ACCESS_DENIED'
      });
    }

    // Access control will be handled by decorators

    try {
      // REAL DATABASE QUERY - Get user's submissions with payment details
      const queryBuilder = this.submissionRepository.createQueryBuilder('submission')
        .leftJoinAndSelect('submission.payment', 'payment')
        .where('payment.instituteId = :instituteId', { instituteId })
        .andWhere('submission.submittedBy = :userId', { userId: user.s })
        .andWhere('payment.isActive = :isActive', { isActive: true });

      // Apply filters if provided
      if (queryDto.status) {
        queryBuilder.andWhere('submission.status = :status', { status: queryDto.status });
      }

      if (queryDto.paymentMethod) {
        queryBuilder.andWhere('submission.paymentMethod = :paymentMethod', { paymentMethod: queryDto.paymentMethod });
      }

      if (queryDto.paymentDateFrom) {
        queryBuilder.andWhere('submission.paymentDate >= :paymentDateFrom', { 
          paymentDateFrom: new Date(queryDto.paymentDateFrom) 
        });
      }

      if (queryDto.paymentDateTo) {
        queryBuilder.andWhere('submission.paymentDate <= :paymentDateTo', { 
          paymentDateTo: new Date(queryDto.paymentDateTo) 
        });
      }

      // Apply sorting - most recent submissions first
      queryBuilder.orderBy('submission.createdAt', 'DESC');

      // Apply pagination
      const page = Math.max(1, queryDto.page || 1);
      const limit = Math.min(50, Math.max(1, queryDto.limit || 10));
      const offset = (page - 1) * limit;
      queryBuilder.skip(offset).take(limit);

      // Get total count using a separate simpler query to avoid distinctAlias issues
      const countQueryBuilder = this.submissionRepository.createQueryBuilder('submission')
        .leftJoin('submission.payment', 'payment')
        .where('payment.instituteId = :instituteId', { instituteId })
        .andWhere('submission.submittedBy = :userId', { userId: user.s })
        .andWhere('payment.isActive = :isActive', { isActive: true });

      // Apply same filters to count query
      if (queryDto.status) {
        countQueryBuilder.andWhere('submission.status = :status', { status: queryDto.status });
      }

      if (queryDto.paymentMethod) {
        countQueryBuilder.andWhere('submission.paymentMethod = :paymentMethod', { paymentMethod: queryDto.paymentMethod });
      }

      if (queryDto.paymentDateFrom) {
        countQueryBuilder.andWhere('submission.paymentDate >= :paymentDateFrom', { 
          paymentDateFrom: new Date(queryDto.paymentDateFrom) 
        });
      }

      if (queryDto.paymentDateTo) {
        countQueryBuilder.andWhere('submission.paymentDate <= :paymentDateTo', { 
          paymentDateTo: new Date(queryDto.paymentDateTo) 
        });
      }

      // Execute queries separately to avoid MySQL distinctAlias errors
      const totalCount = await countQueryBuilder.getCount();
      const submissions = await queryBuilder.getMany();

      // Transform DATABASE results to expected DTO structure (optimized response)
      const secureSubmissions = submissions.map(submission => ({
        id: submission.id,
        paymentId: submission.paymentId,
        paymentType: submission.payment.paymentType,
        description: submission.payment.description,
        dueDate: submission.payment.dueDate?.toISOString() || null,
        priority: submission.payment.priority,
        paymentAmount: parseFloat(submission.paymentAmount.toString()),
        paymentMethod: submission.paymentMethod,
        transactionReference: submission.transactionReference,
        paymentDate: submission.paymentDate?.toISOString() || null,
        status: submission.status,
        verifiedAt: submission.verifiedAt?.toISOString() || null,
        rejectionReason: submission.rejectionReason,
        lateFeeApplied: parseFloat(submission.lateFeeApplied.toString()),
        totalAmountPaid: parseFloat(submission.totalAmountPaid.toString()),
        receiptFileName: submission.receiptFileName || null,
        receiptFileUrl: submission.receiptFileUrl || null,
        receiptFileSize: submission.receiptFileSize ? parseInt(submission.receiptFileSize.toString()) : null,
        receiptFileType: submission.receiptFileType || null,
        paymentRemarks: submission.paymentRemarks || submission.notes || null,
        createdAt: submission.createdAt?.toISOString() || null,
        // Minimal additional fields
        canResubmit: [
          SubmissionStatus.REJECTED,
          SubmissionStatus.HALF_VERIFIED,
          SubmissionStatus.QUARTER_VERIFIED,
        ].includes(submission.status) && submission.payment.isActive,
        canDelete: submission.status === SubmissionStatus.PENDING,
        daysSinceSubmission: Math.floor((nowTimestamp() - submission.createdAt.getTime()) / (24 * 60 * 60 * 1000))
      }));

      // Calculate pagination and summary from DATABASE results with proper numeric aggregation
      const totalPages = Math.ceil(totalCount / limit);
      
      // Fix numeric aggregations to handle decimal string values properly
      const totalAmountSubmitted = submissions.reduce((sum, s) => sum + parseFloat(s.totalAmountPaid.toString()), 0);
      const totalAmountVerified = submissions
        .filter(s => s.status === SubmissionStatus.VERIFIED)
        .reduce((sum, s) => sum + parseFloat(s.totalAmountPaid.toString()), 0);
      const totalLateFees = submissions.reduce((sum, s) => sum + parseFloat(s.lateFeeApplied.toString()), 0);
      
      return {
        success: true,
        message: `Retrieved ${secureSubmissions.length} submissions from DATABASE`,
        data: {
          submissions: secureSubmissions,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: totalCount,
            itemsPerPage: limit,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1
          },
          summary: {
            totalSubmissions: totalCount,
            byStatus: {
              pending: submissions.filter(s => s.status === SubmissionStatus.PENDING).length,
              verified: submissions.filter(s => s.status === SubmissionStatus.VERIFIED).length,
              rejected: submissions.filter(s => s.status === SubmissionStatus.REJECTED).length
            },
            totalAmountSubmitted: Math.round(totalAmountSubmitted * 100) / 100, // Round to 2 decimal places
            totalAmountVerified: Math.round(totalAmountVerified * 100) / 100,
            totalLateFees: Math.round(totalLateFees * 100) / 100
          }
        }
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Failed to retrieve submissions from database',
        error: 'DATABASE_ERROR',
        details: error.message
      });
    }
  }

  async getSubmissionById(instituteId: string, submissionId: string, user: JwtPayload) {
    const { user: userEntity, hasAccess, role, instituteRole } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied',
        error: 'ACCESS_DENIED'
      });
    }

    const userAccessLevel = this.getUserAccessLevel(user, undefined, instituteRole);

    try {
      // Get real submission from database
      const submission = await this.submissionRepository.findOne({
        where: { id: submissionId },
        relations: ['payment', 'submitter', 'verifier']
      });

      if (!submission) {
        throw new NotFoundException({
          success: false,
          message: 'Submission not found',
          error: 'SUBMISSION_NOT_FOUND'
        });
      }

      // Verify institute access
      if (submission.payment.instituteId !== instituteId) {
        throw new ForbiddenException({
          success: false,
          message: 'Submission does not belong to this institute',
          error: 'ACCESS_DENIED'
        });
      }

      // Check user access to this specific submission
      const isOwner = submission.submittedBy === user.s;
      const isAdmin = userAccessLevel === UserAccessLevel.ADMIN;
      
      if (!isOwner && !isAdmin) {
        throw new ForbiddenException({
          success: false,
          message: 'You can only view your own submissions',
          error: 'ACCESS_DENIED'
        });
      }

      // Transform based on user access level
      const secureSubmission = transformInstitutePaymentSubmissionToSecureResponse(
        submission as any, 
        userAccessLevel, 
        user.s, 
        true, // Include payment details
        this.cloudStorageService // ✅ Pass CloudStorageService for URL transformation
      );

      // Add additional contextual information
      const enrichedSubmission = {
        ...secureSubmission,
        // Add submission timeline for context
        timeline: [
          {
            status: 'SUBMITTED',
            timestamp: submission.createdAt?.toISOString() || null,
            description: 'Payment submission received'
          },
          ...(submission.status === SubmissionStatus.VERIFIED && submission.verifiedAt ? [{
            status: 'VERIFIED',
            timestamp: submission.verifiedAt?.toISOString() || null,
            description: 'Payment verified and approved'
          }] : []),
          ...(submission.status === SubmissionStatus.REJECTED && submission.verifiedAt ? [{
            status: 'REJECTED',
            timestamp: submission.verifiedAt?.toISOString() || null,
            description: 'Payment submission rejected'
          }] : [])
        ],
        // Add actionable information
        actions: {
          canView: true,
          canDownloadReceipt: !!submission.receiptFileUrl,
          canResubmit: [
            SubmissionStatus.REJECTED,
            SubmissionStatus.HALF_VERIFIED,
            SubmissionStatus.QUARTER_VERIFIED,
          ].includes(submission.status) && submission.payment.isActive,
          canDelete: submission.status === SubmissionStatus.PENDING && (userAccessLevel === UserAccessLevel.ADMIN || submission.submittedBy === user.s),
          canVerify: userAccessLevel === UserAccessLevel.ADMIN && [
            SubmissionStatus.PENDING,
            SubmissionStatus.HALF_VERIFIED,
            SubmissionStatus.QUARTER_VERIFIED,
          ].includes(submission.status)
        },
        // Add payment context
        paymentContext: {
          paymentIsActive: submission.payment.isActive,
          paymentStatus: submission.payment.status,
          daysSinceDue: Math.floor((nowTimestamp() - submission.payment.dueDate.getTime()) / (24 * 60 * 60 * 1000)),
          daysSinceSubmission: Math.floor((nowTimestamp() - submission.createdAt.getTime()) / (24 * 60 * 60 * 1000))
        }
      };

      return {
        success: true,
        message: `Submission details retrieved successfully - ${role.toLowerCase()} view`,
        data: enrichedSubmission
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException({
        success: false,
        message: 'Failed to fetch submission details',
        error: error.message,
      });
    }
  }

  async getStudentSubmissions(instituteId: string, studentId: string, queryDto: GetInstitutePaymentSubmissionsQueryDto, user: JwtPayload) {
    const { user: userEntity, hasAccess, role, instituteRole } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied',
        error: 'ACCESS_DENIED'
      });
    }

    const userAccessLevel = this.getUserAccessLevel(user, undefined, instituteRole);

    try {
      // Get real student submissions from database
      const submissions = await this.submissionRepository.find({
        where: { 
          submittedBy: studentId,
          payment: { instituteId }
        },
        relations: ['payment', 'submitter', 'verifier'],
        order: { createdAt: 'DESC' },
        take: queryDto.limit || 10,
        skip: ((queryDto.page || 1) - 1) * (queryDto.limit || 10),
      });

      // Get total count for pagination
      const totalSubmissions = await this.submissionRepository.count({
        where: { 
          submittedBy: studentId,
          payment: { instituteId }
        },
        relations: ['payment']
      });

      const secureSubmissions = submissions.map(sub => 
        transformInstitutePaymentSubmissionToSecureResponse(sub as any, userAccessLevel, user.s, true, this.cloudStorageService)
      );

      const totalPages = Math.ceil(totalSubmissions / (queryDto.limit || 10));
      const currentPage = queryDto.page || 1;

      return {
        success: true,
        message: `Student submissions retrieved - ${instituteRole === InstituteUserType.PARENT ? 'parent view (verification details hidden)' : 'admin view (full details)'}`,
        data: {
          submissions: secureSubmissions,
          pagination: {
            currentPage,
            totalPages,
            totalItems: totalSubmissions,
            itemsPerPage: queryDto.limit || 10,
            hasNextPage: currentPage < totalPages,
            hasPreviousPage: currentPage > 1,
          }
        }
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Failed to fetch student submissions',
        error: error.message,
      });
    }
  }

  /**
   * Get pending submissions for review (Admin and Teacher view)
   * Returns submissions with PENDING status across all payments for this institute,
   * ordered by oldest first so reviewers process the backlog efficiently.
   */
  async getPendingSubmissions(instituteId: string, queryDto: GetInstitutePaymentSubmissionsQueryDto, user: JwtPayload) {
    // Validate institute access
    const { hasAccess, instituteRole } = await this.getUserFromJWT(user, instituteId);
    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'You do not have access to this institute',
        error: 'NO_INSTITUTE_ACCESS',
      });
    }

    const page = queryDto.page || 1;
    const limit = Math.min(queryDto.limit || 10, 100);

    try {
      const qb = this.submissionRepository.createQueryBuilder('sub')
        .innerJoinAndSelect('sub.payment', 'payment')
        .leftJoinAndSelect('sub.submitter', 'submitter')
        .where('payment.instituteId = :instituteId', { instituteId })
        .andWhere('sub.status = :status', { status: SubmissionStatus.PENDING });

      // Optional search filter
      if (queryDto.search) {
        qb.andWhere('(sub.transactionReference LIKE :search OR sub.paymentRemarks LIKE :search OR submitter.firstName LIKE :search OR submitter.lastName LIKE :search)', {
          search: `%${queryDto.search}%`,
        });
      }

      // Oldest first so reviewers clear the backlog
      qb.orderBy('sub.createdAt', 'ASC')
        .skip((page - 1) * limit)
        .take(limit);

      const [submissions, totalPending] = await qb.getManyAndCount();

      const totalPages = Math.ceil(totalPending / limit);

      const secureSubmissions = submissions.map(sub => ({
        submissionId: sub.id,
        paymentId: sub.paymentId,
        paymentType: sub.payment?.paymentType,
        paymentDescription: sub.payment?.description,
        paymentAmount: sub.payment?.amount ? parseFloat(String(sub.payment.amount)) : null,
        submittedBy: sub.submittedBy,
        submitterName: sub.submitter
          ? (sub.submitter.nameWithInitials || `${sub.submitter.firstName || ''} ${sub.submitter.lastName || ''}`.trim())
          : null,
        paymentAmountSubmitted: sub.paymentAmount ? parseFloat(String(sub.paymentAmount)) : null,
        paymentMethod: sub.paymentMethod,
        paymentDate: sub.paymentDate,
        transactionReference: sub.transactionReference,
        hasAttachment: !!sub.receiptFileUrl,
        receiptUrl: sub.receiptFileUrl?.trim() || null,
        lateFeeApplied: sub.lateFeeApplied ? parseFloat(String(sub.lateFeeApplied)) : 0,
        paymentRemarks: sub.paymentRemarks,
        submittedAt: sub.createdAt,
      }));

      return {
        success: true,
        message: 'Pending submissions retrieved successfully',
        data: {
          submissions: secureSubmissions,
          totalPending,
          userRole: user.u,
          instituteId,
          pagination: {
            currentPage: page,
            totalPages,
            totalItems: totalPending,
            itemsPerPage: limit,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        },
      };
    } catch (error) {
      throw new BadRequestException({
        success: false,
        message: 'Failed to fetch pending submissions',
        error: error.message,
      });
    }
  }

  /**
   * Search for a student by ID within an institute and return their details + payment history.
   * Access: Institute Admin, Teachers, Superadmin only.
   */
  async searchStudentInInstitute(instituteId: string, studentId: string, user: JwtPayload, paymentId?: string) {
    const { hasAccess, instituteRole } = await this.getUserFromJWT(user, instituteId);
    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - you must be enrolled in this institute',
        error: 'ACCESS_DENIED',
      });
    }

    const userAccessLevel = this.getUserAccessLevel(user, undefined, instituteRole);
    if (userAccessLevel !== UserAccessLevel.ADMIN) {
      throw new ForbiddenException({
        success: false,
        message: 'Only admins and teachers can search students',
        error: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Find the student's membership in this institute — accept system userId OR institute-assigned userIdByInstitute
    const membership = await this.instituteUserRepository.findOne({
      where: [
        { userId: studentId, instituteId },
        { userIdByInstitute: studentId, instituteId },
      ] as any,
    });

    if (!membership) {
      throw new NotFoundException({
        success: false,
        message: 'Student not found in this institute',
        error: 'STUDENT_NOT_FOUND',
      });
    }

    // Resolve the canonical user UUID (membership may have been found via userIdByInstitute)
    const resolvedUserId = membership.userId;

    // Get user details
    const student = await this.userRepository.findOne({
      where: { id: resolvedUserId },
      select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'email', 'phoneNumber', 'isActive', 'imageUrl'],
    });

    if (!student) {
      throw new NotFoundException({
        success: false,
        message: 'Student user record not found',
        error: 'USER_NOT_FOUND',
      });
    }

    // Get payment submissions for this student - filter by paymentId if provided
    const submissionWhere: any = { submittedBy: resolvedUserId, payment: { instituteId } };
    if (paymentId) {
      submissionWhere.paymentId = paymentId;
    }
    const submissions = await this.submissionRepository.find({
      where: submissionWhere,
      relations: ['payment'],
      order: { createdAt: 'DESC' },
      take: paymentId ? undefined : 20,
    });

    // If paymentId provided, also fetch the payment details
    let paymentDetails: any = null;
    if (paymentId) {
      const payment = await this.paymentRepository.findOne({
        where: { id: paymentId, instituteId },
      });
      if (payment) {
        paymentDetails = {
          id: payment.id,
          paymentType: payment.paymentType,
          description: payment.description,
          amount: parseFloat(String(payment.amount)),
          dueDate: payment.dueDate || null,
          status: payment.status,
        };
      }
    }

    return {
      success: true,
      message: 'Student found successfully',
      student: {
        uuid: student.id,
        nameWithInitials: student.nameWithInitials || `${student.firstName || ''} ${student.lastName || ''}`.trim(),
        imageUrl: student.imageUrl ? this.cloudStorageService.getFullUrl(student.imageUrl) : null,
        studentInstituteImageUrl: membership.instituteUserImageUrl ? this.cloudStorageService.getFullUrl(membership.instituteUserImageUrl) : null,
        instituteUserId: membership.userIdByInstitute || null,
        instituteUserType: membership.instituteUserType || null,
      },
      ...(paymentDetails && { payment: paymentDetails }),
      paymentHistory: submissions.map(sub => ({
        status: sub.status,
        amount: parseFloat(String(sub.paymentAmount || 0)),
        date: sub.verifiedAt || sub.paymentDate || sub.createdAt,
        note: sub.notes || null,
      })),
    };
  }

  /**
   * Admin manually verifies/records a payment for a specific student in an institute.
   * Creates a VERIFIED submission directly on behalf of the student.
   * Access: Institute Admin, Superadmin only.
   */
  async adminVerifyStudentPayment(
    instituteId: string,
    paymentId: string,
    studentId: string,
    dto: AdminVerifyStudentPaymentDto,
    user: JwtPayload,
  ) {
    const { hasAccess, instituteRole } = await this.getUserFromJWT(user, instituteId);
    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - you must be enrolled in this institute',
        error: 'ACCESS_DENIED',
      });
    }

    const userAccessLevel = this.getUserAccessLevel(user, undefined, instituteRole);
    if (userAccessLevel !== UserAccessLevel.ADMIN) {
      throw new ForbiddenException({
        success: false,
        message: 'Only admins can manually verify student payments',
        error: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Verify the payment exists and belongs to this institute
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, instituteId, isActive: true },
    });
    if (!payment) {
      throw new NotFoundException({
        success: false,
        message: 'Payment not found or not active',
        error: 'PAYMENT_NOT_FOUND',
      });
    }

    // Verify the student is an active member of this institute
    const membership = await this.instituteUserRepository.findOne({
      where: { userId: studentId, instituteId, status: InstituteUserStatus.ACTIVE },
    });
    if (!membership) {
      throw new NotFoundException({
        success: false,
        message: 'Student not found in this institute',
        error: 'STUDENT_NOT_FOUND',
      });
    }

    // Check if student already has a verified submission for this payment
    const existingVerified = await this.submissionRepository.findOne({
      where: { paymentId, submittedBy: studentId, status: SubmissionStatus.VERIFIED },
    });
    if (existingVerified) {
      throw new BadRequestException({
        success: false,
        message: 'Student already has a verified payment for this payment request',
        error: 'ALREADY_VERIFIED',
        data: { existingSubmissionId: existingVerified.id },
      });
    }

    // Fetch acting user name (collector) for ledger record
    const actingUser = await this.userRepository.findOne({
      where: { id: user.s },
      select: ['id', 'nameWithInitials'],
    });
    const actingUserName = actingUser?.nameWithInitials || String(user.s);

    // Fetch student name and institute user ID for ledger record
    const studentUser = await this.userRepository.findOne({
      where: { id: studentId },
      select: ['id', 'nameWithInitials'],
    });
    const studentName = studentUser?.nameWithInitials || studentId;
    const instituteUserId = membership.userIdByInstitute || null;

    // Create and save the verified submission
    const timestamp = now();
    const submission = this.submissionRepository.create({
      paymentId,
      submittedBy: studentId,
      paymentAmount: dto.amount,
      paymentMethod: PaymentMethodType.CASH_DEPOSIT,
      paymentDate: new Date(dto.date),
      status: dto.paymentTier === 'half'
        ? SubmissionStatus.HALF_VERIFIED
        : dto.paymentTier === 'quarter'
        ? SubmissionStatus.QUARTER_VERIFIED
        : SubmissionStatus.VERIFIED,
      verifiedBy: user.s,
      verifiedAt: timestamp,
      notes: dto.notes || null,
      totalAmountPaid: dto.amount,
      lateFeeApplied: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const savedSubmission = await this.submissionRepository.save(submission);

    // Refresh user cache after verification
    try {
      await this.userManagementService.refreshUserCache(studentId);
    } catch (cacheError) {
      this.logger.warn(`Cache refresh failed after admin payment verification for user ${studentId}: ${cacheError.message}`);
    }

    // Record to finance ledger if targetAccountId provided
    if (dto.targetAccountId && savedSubmission.status === SubmissionStatus.VERIFIED && this.financeService) {
      try {
        await this.financeService.recordInstitutePaymentCollect({
          paymentAmount: dto.amount,
          targetAccountId: dto.targetAccountId,
          referenceId: paymentId,
          studentId,
          studentName: instituteUserId ? `${studentName} [${instituteUserId}]` : studentName,
          description: `Institute payment: ${payment.description ?? payment.paymentType}`,
          notes: dto.notes,
          userId: String(user.s),
          createdByName: actingUserName,
          instituteId,
        });
      } catch (fe: any) {
        this.logger.warn(`Finance ledger failed for institute payment admin-verify ${paymentId}: ${fe.message}`);
      }
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
   * Soft delete an institute payment request.
   * Only allowed for institute admins when no submissions exist.
   * Sets isActive=false and status=INACTIVE instead of hard deleting.
   */
  async softDeletePayment(
    instituteId: string,
    paymentId: string,
    user: JwtPayload,
  ): Promise<{ success: boolean; message: string }> {
    // Validate access
    const { hasAccess, instituteRole } = await this.getUserFromJWT(user, instituteId);
    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - not enrolled in this institute',
        error: 'ACCESS_DENIED',
      });
    }

    // Only admins can delete payments
    const accessLevel = this.getUserAccessLevel(user, undefined, instituteRole);
    if (accessLevel !== UserAccessLevel.ADMIN) {
      throw new ForbiddenException({
        success: false,
        message: 'Only institute admins can delete payment requests',
        error: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    // Find payment with submissions count
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, instituteId, isActive: true },
      relations: ['submissions'],
    });

    if (!payment) {
      throw new NotFoundException({
        success: false,
        message: 'Payment not found or already deleted',
        error: 'PAYMENT_NOT_FOUND',
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
    const timestamp = now();
    await this.paymentRepository.update(paymentId, {
      isActive: false,
      status: PaymentRequestStatus.INACTIVE,
      updatedAt: timestamp,
    });

    this.logger.log(`Payment ${paymentId} soft-deleted by user ${user.s} in institute ${instituteId}`);

    return {
      success: true,
      message: 'Payment deleted successfully',
    };
  }
}
