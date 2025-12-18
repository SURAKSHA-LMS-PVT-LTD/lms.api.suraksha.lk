import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In, LessThan } from 'typeorm';
import { InstitutePayment, PaymentRequestStatus, PaymentTargetType } from '../entities/institute-payment.entity';
import { InstitutePaymentSubmission, SubmissionStatus } from '../entities/institute-payment-submission.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteUserStatus } from '../../institute_mudules/institue_user/enums/institute-user-status.enum';
import { JwtPayload } from '../../../common/interfaces/jwt-request.interface';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { UserManagementService } from '../../../common/services/cache-user-management.service';
import { 
  CreateInstitutePaymentDto, 
  UpdateInstitutePaymentDto,
  CreateInstitutePaymentSubmissionDto,
  VerifyInstitutePaymentSubmissionDto,
  GetInstitutePaymentsQueryDto,
  GetInstitutePaymentSubmissionsQueryDto
} from '../dto/institute-payment.dto';
import {
  transformInstitutePaymentToSecureResponse,
  transformInstitutePaymentSubmissionToSecureResponse,
  UserAccessLevel,
  PaginatedSecureInstitutePaymentsResponseDto,
  PaginatedSecureInstitutePaymentSubmissionsResponseDto
} from '../dto/secure-institute-payment-response.dto';

// Minimal JWT token utility functions - validation is handled by decorators
function extractUserIdFromToken(token: string, jwtService: JwtService): string | null {
  try {
    const payload = jwtService.decode(token) as JwtPayload;
    return payload?.s || null; // 's' is the user ID in JWT v2
  } catch (error) {
    return null;
  }
}

function extractUserRoleFromToken(token: string, jwtService: JwtService): UserType | null {
  try {
    const payload = jwtService.decode(token) as JwtPayload;
    if (!payload?.u) return null;
    return payload.u; // 'u' is the user type in JWT v2
  } catch (error) {
    return null;
  }
}

@Injectable()
export class InstitutePaymentService {
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
  ) {}

  /**
   * Extract user data from JWT token and validate institute membership
   * FIXED: Now actually checks InstituteUserEntity for membership
   */
  private async getUserFromJWT(user: JwtPayload, instituteId: string): Promise<{ user: JwtPayload, hasAccess: boolean, role: string }> {
    try {
      // Get user entity from database using JWT ID
      const userEntity = await this.userRepository.findOne({
        where: { id: user.s },
        select: ['id', 'email', 'userType', 'isActive']
      });

      if (!userEntity || !userEntity.isActive) {
        return { user: null, hasAccess: false, role: null };
      }

      // FIXED: Actually validate institute membership from database
      const instituteMembership = await this.instituteUserRepository.findOne({
        where: {
          userId: user.s,
          instituteId: instituteId,
          status: InstituteUserStatus.ACTIVE // Only active memberships
        }
      });

      // User must be enrolled in this institute
      if (!instituteMembership) {
        return { user: userEntity as any, hasAccess: false, role: userEntity.userType };
      }

      return {
        user: userEntity as any,
        hasAccess: true, // User is enrolled and active in this institute
        role: userEntity.userType
      };
    } catch (error) {
      return { user: null, hasAccess: false, role: null };
    }
  }

  // Utility method to determine user access level for secure data filtering
  private getUserAccessLevel(user: JwtPayload, resourceUserId?: string): UserAccessLevel {
    const role = user.u;
    const userId = user.s;
    
    // System admin and organization manager have full admin access
    if (role === UserType.SUPERADMIN || role === UserType.ORGANIZATION_MANAGER) {
      return UserAccessLevel.ADMIN;
    }
    
    // If user is accessing their own resource
    if (resourceUserId && userId === resourceUserId) {
      return UserAccessLevel.OWNER;
    }
    
    // All flexible user types have regular user access
    // (USER, USER_WITHOUT_PARENT, USER_WITHOUT_STUDENT)
    return UserAccessLevel.USER;
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
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - you must be enrolled in this institute to view payments',
        error: 'ACCESS_DENIED'
      });
    }

    // All enrolled members can view institute payments, but with different data levels
    const userAccessLevel = this.getUserAccessLevel(userEntity);
    
    try {
      // Build secure query with proper filtering and optimized column selection
      const queryBuilder = this.paymentRepository.createQueryBuilder('payment')
        .select([
          'payment.id',
          'payment.instituteId',
          'payment.paymentType',
          'payment.description',
          'payment.amount',
          'payment.status',
          'payment.dueDate',
          'payment.createdBy',
          'payment.isActive',
          'payment.createdAt'
        ])
        .leftJoin('payment.creator', 'creator')
        .addSelect([
          'creator.id',
          'creator.firstName',
          'creator.lastName',
          'creator.email'
        ])
        .leftJoin('payment.submissions', 'submissions')
        .addSelect([
          'submissions.id',
          'submissions.paymentId',
          'submissions.submittedBy',
          'submissions.status',
          'submissions.createdAt'
        ])
        .where('payment.instituteId = :instituteId', { instituteId })
        .andWhere('payment.isActive = :isActive', { isActive: true }); // Only show active payments

      // Apply filters based on query parameters
      if (queryDto.status) {
        queryBuilder.andWhere('payment.status = :status', { status: queryDto.status });
      }

      if (queryDto.search) {
        queryBuilder.andWhere('(payment.paymentType ILIKE :search OR payment.description ILIKE :search)', { 
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

      // For non-admin users, apply additional filtering based on target type and role
      if (userAccessLevel !== UserAccessLevel.ADMIN) {
        const targetFilters = [];
        
        if (role === UserType.USER_WITHOUT_PARENT) {
          targetFilters.push('payment.targetType = :studentTarget', 'payment.targetType = :bothTarget');
          queryBuilder.setParameter('studentTarget', 'STUDENTS');
          queryBuilder.setParameter('bothTarget', 'BOTH');
        } else if (role === UserType.USER_WITHOUT_STUDENT) {
          targetFilters.push('payment.targetType = :parentTarget', 'payment.targetType = :bothTarget');
          queryBuilder.setParameter('parentTarget', 'PARENTS');
          queryBuilder.setParameter('bothTarget', 'BOTH');
        }

        if (targetFilters.length > 0) {
          queryBuilder.andWhere(`(${targetFilters.join(' OR ')})`);
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

      // Get total count for pagination
      const totalCount = await queryBuilder.getCount();
      const payments = await queryBuilder.getMany();

      // Transform payments with role-based security filtering
      const securePayments = payments.map(payment => 
        transformInstitutePaymentToSecureResponse(payment, userAccessLevel, user.s)
      );

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
      throw new BadRequestException({
        success: false,
        message: 'Failed to retrieve institute payments',
        error: 'DATABASE_ERROR',
        details: error.message
      });
    }
  }

  async getMyApplicablePayments(instituteId: string, queryDto: GetInstitutePaymentsQueryDto, user: JwtPayload) {
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - you must be enrolled in this institute',
        error: 'ACCESS_DENIED'
      });
    }

    // Access control will be handled by decorators
    
    const userAccessLevel = this.getUserAccessLevel(userEntity);
    
    // Get real payments from database instead of mock data
    try {
      const whereConditions: any = {
        instituteId,
        isActive: true,
        status: PaymentRequestStatus.ACTIVE,
      };

      // Filter by target type based on user role
      if (role === UserType.USER_WITHOUT_PARENT) {
        whereConditions.targetType = In([PaymentTargetType.STUDENTS, PaymentTargetType.BOTH]);
      } else if (role === UserType.USER_WITHOUT_STUDENT) {
        whereConditions.targetType = In([PaymentTargetType.PARENTS, PaymentTargetType.BOTH]);
      } else if (role === UserType.USER) {
        // Flexible users can see all payment types
        whereConditions.targetType = In([PaymentTargetType.STUDENTS, PaymentTargetType.PARENTS, PaymentTargetType.BOTH]);
      }

      // Query payments with submissions to get user's submission status
      const payments = await this.paymentRepository.find({
        where: whereConditions,
        relations: ['creator', 'submissions', 'submissions.submitter', 'submissions.verifier'],
        order: { 
          dueDate: 'ASC',
          createdAt: 'DESC'
        },
        take: queryDto.limit || 20,
        skip: ((queryDto.page || 1) - 1) * (queryDto.limit || 20),
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
      message: `Your applicable payments retrieved - ${role.toLowerCase()} specific view`,
      data: {
        payments: securePayments,
        userRole: role,
        instituteId,
        totalApplicable: securePayments.length,
        pendingPayments: securePayments.filter(p => !p.mySubmissionStatus || p.mySubmissionStatus === 'PENDING').length,
        pagination: {
          currentPage: queryDto.page || 1,
          totalPages: 1,
          totalItems: securePayments.length,
          itemsPerPage: queryDto.limit || 10,
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
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - sensitive data protection',
        error: 'ACCESS_DENIED'
      });
    }

    const userAccessLevel = this.getUserAccessLevel(userEntity);

    try {
      // Find payment with security validation
      const payment = await this.paymentRepository.findOne({
        where: { 
          id: paymentId, 
          instituteId,
          isActive: true // Only active payments
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

      // Apply role-based filtering for non-admin users
      if (userAccessLevel !== UserAccessLevel.ADMIN) {
        // Students can only see payments targeted to them
        if (role === UserType.USER_WITHOUT_PARENT && 
            !['STUDENTS', 'BOTH'].includes(payment.targetType)) {
          throw new ForbiddenException({
            success: false,
            message: 'Access denied - payment not applicable to your role',
            error: 'ROLE_BASED_ACCESS_DENIED'
          });
        }
        // Parents can only see payments targeted to parents or both
        if (role === UserType.USER_WITHOUT_STUDENT && 
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
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

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
        updatedAt: new Date()
      });

      // Load updated payment with relations
      const paymentWithRelations = await this.paymentRepository.findOne({
        where: { id: paymentId },
        relations: ['creator', 'submissions']
      });

      const userAccessLevel = this.getUserAccessLevel(userEntity);

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
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - insufficient permissions',
        error: 'ACCESS_DENIED'
      });
    }

    try {
      // Get real payment statistics from database
      const totalPayments = await this.paymentRepository.count({
        where: { instituteId }
      });

      const activePayments = await this.paymentRepository.count({
        where: { 
          instituteId,
          status: PaymentRequestStatus.ACTIVE,
          isActive: true
        }
      });

      const completedPayments = await this.paymentRepository.count({
        where: { 
          instituteId,
          status: PaymentRequestStatus.COMPLETED
        }
      });

      const expiredPayments = await this.paymentRepository.count({
        where: { 
          instituteId,
          dueDate: LessThan(new Date()),
          status: PaymentRequestStatus.ACTIVE
        }
      });

      // Get submission statistics
      const totalSubmissions = await this.submissionRepository.count({
        relations: ['payment'],
        where: {
          payment: { instituteId }
        }
      });

      const pendingSubmissions = await this.submissionRepository.count({
        relations: ['payment'],
        where: {
          payment: { instituteId },
          status: SubmissionStatus.PENDING
        }
      });

      const verifiedSubmissions = await this.submissionRepository.count({
        relations: ['payment'],
        where: {
          payment: { instituteId },
          status: SubmissionStatus.VERIFIED
        }
      });

      const rejectedSubmissions = await this.submissionRepository.count({
        relations: ['payment'],
        where: {
          payment: { instituteId },
          status: SubmissionStatus.REJECTED
        }
      });

      // Calculate total amounts
      const verifiedSubmissionsWithAmounts = await this.submissionRepository.find({
        relations: ['payment'],
        where: {
          payment: { instituteId },
          status: SubmissionStatus.VERIFIED
        },
        select: ['paymentAmount']
      });

      const totalAmountCollected = verifiedSubmissionsWithAmounts.reduce(
        (sum, submission) => sum + Number(submission.paymentAmount || 0), 0
      );

      const pendingSubmissionsWithAmounts = await this.submissionRepository.find({
        relations: ['payment'],
        where: {
          payment: { instituteId },
          status: SubmissionStatus.PENDING
        },
        select: ['paymentAmount']
      });

      const pendingAmount = pendingSubmissionsWithAmounts.reduce(
        (sum, submission) => sum + Number(submission.paymentAmount || 0), 0
      );

      // Get latest verification info
      const lastVerification = await this.submissionRepository.findOne({
        relations: ['payment', 'verifier'],
        where: {
          payment: { instituteId },
          status: SubmissionStatus.VERIFIED
        },
        order: { verifiedAt: 'DESC' }
      });

      // Get top submitters
      const topSubmittersQuery = await this.submissionRepository
        .createQueryBuilder('submission')
        .leftJoin('submission.payment', 'payment')
        .leftJoin('submission.submitter', 'submitter')
        .select('submission.submittedBy', 'studentId')
        .addSelect('COUNT(submission.id)', 'submissions')
        .addSelect('SUM(submission.paymentAmount)', 'totalAmount')
        .where('payment.instituteId = :instituteId', { instituteId })
        .andWhere('submission.status = :status', { status: SubmissionStatus.VERIFIED })
        .groupBy('submission.submittedBy')
        .orderBy('COUNT(submission.id)', 'DESC')
        .limit(5)
        .getRawMany();

      return {
        success: true,
        message: 'Payment statistics retrieved - administrator access verified',
        data: {
          totalPayments,
          activePayments,
          completedPayments,
          expiredPayments,
          totalSubmissions,
          pendingSubmissions,
          verifiedSubmissions,
          rejectedSubmissions,
          totalAmountCollected,
          pendingAmount,
          // Admin-only sensitive data
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
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied - you must be enrolled in this institute',
        error: 'ACCESS_DENIED'
      });
    }

    // Access control will be handled by decorators

    try {
      // Get user's payment summary from real database
      const whereConditions: any = {
        instituteId,
        isActive: true,
        status: PaymentRequestStatus.ACTIVE,
      };

      // Filter by target type based on user role
      if (role === UserType.USER_WITHOUT_PARENT) {
        whereConditions.targetType = In([PaymentTargetType.STUDENTS, PaymentTargetType.BOTH]);
      } else if (role === UserType.USER_WITHOUT_STUDENT) {
        whereConditions.targetType = In([PaymentTargetType.PARENTS, PaymentTargetType.BOTH]);
      } else if (role === UserType.USER) {
        whereConditions.targetType = In([PaymentTargetType.STUDENTS, PaymentTargetType.PARENTS, PaymentTargetType.BOTH]);
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
                 payment.dueDate > new Date();
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
        message: `Payment summary retrieved for ${role.toLowerCase()}`,
        data: {
          instituteId,
          userRole: role,
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
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied',
        error: 'ACCESS_DENIED'
      });
    }

    // Access control will be handled by decorators

    try {
      // Verify the payment exists and is active
      const payment = await this.paymentRepository.findOne({
        where: { 
          id: paymentId, 
          instituteId,
          isActive: true,
          status: PaymentRequestStatus.ACTIVE
        }
      });

      if (!payment) {
        throw new NotFoundException({
          success: false,
          message: 'Payment not found or not accepting submissions',
          error: 'PAYMENT_NOT_FOUND'
        });
      }

      // Check if user already has a pending submission for this payment
      const existingSubmission = await this.submissionRepository.findOne({
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
      const now = new Date();
      const daysOverdue = Math.floor((now.getTime() - payment.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (payment.lateFeeAmount && payment.lateFeeAfterDays && daysOverdue > payment.lateFeeAfterDays) {
        lateFeeApplied = payment.lateFeeAmount;
      }

      // Use receipt URL from DTO (uploaded via /upload/verify-and-publish)
      const receiptFileUrl = createSubmissionDto.receiptUrl;
      const receiptFileName = receiptFileUrl ? receiptFileUrl.split('/').pop() : undefined;

      // Create submission - ALWAYS defaults to PENDING - NEVER auto-verified
      const submission = this.submissionRepository.create({
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
        paymentRemarks: createSubmissionDto.paymentRemarks
      });

      const savedSubmission = await this.submissionRepository.save(submission);

      // Load submission with relations for response
      const submissionWithRelations = await this.submissionRepository.findOne({
        where: { id: savedSubmission.id },
        relations: ['payment', 'submitter']
      });

      const userAccessLevel = this.getUserAccessLevel(userEntity);

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
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied',
        error: 'ACCESS_DENIED'
      });
    }

    // Access control will be handled by decorators

    const userAccessLevel = UserAccessLevel.ADMIN;

    // Build the query with selective fields only (avoid SELECT *)
    const queryBuilder = this.submissionRepository.createQueryBuilder('submission')
      .select([
        'submission.id',
        'submission.paymentId',
        'submission.paymentAmount',
        'submission.paymentMethod',
        'submission.transactionReference',
        'submission.paymentDate',
        'submission.status',
        'submission.rejectionReason',
        'submission.paymentRemarks',
        'submission.lateFeeApplied',
        'submission.totalAmountPaid',
        'submission.receiptFileUrl',
        'submission.createdAt',
        'submission.verifiedAt'
      ])
      .leftJoin('submission.submitter', 'submitter')
      .addSelect([
        'submitter.id',
        'submitter.firstName',
        'submitter.lastName'
      ])
      .leftJoin('submission.payment', 'payment')
      .addSelect(['payment.id', 'payment.instituteId'])
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
      queryBuilder.andWhere('(submission.transactionReference ILIKE :search OR submission.paymentRemarks ILIKE :search OR submission.notes ILIKE :search)', 
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

    // Get total count using a simpler query to avoid distinctAlias issues
    const countQueryBuilder = this.submissionRepository.createQueryBuilder('submission')
      .leftJoin('submission.payment', 'payment')
      .where('submission.paymentId = :paymentId', { paymentId })
      .andWhere('payment.instituteId = :instituteId', { instituteId });

    // Apply the same filters for count as the main query
    if (queryDto.status) {
      countQueryBuilder.andWhere('submission.status = :status', { status: queryDto.status });
    }

    if (queryDto.paymentMethod) {
      countQueryBuilder.andWhere('submission.paymentMethod = :paymentMethod', { paymentMethod: queryDto.paymentMethod });
    }

    if (queryDto.paymentDateFrom) {
      countQueryBuilder.andWhere('submission.paymentDate >= :paymentDateFrom', { paymentDateFrom: new Date(queryDto.paymentDateFrom) });
    }

    if (queryDto.paymentDateTo) {
      countQueryBuilder.andWhere('submission.paymentDate <= :paymentDateTo', { paymentDateTo: new Date(queryDto.paymentDateTo) });
    }

    if (queryDto.submissionDateFrom) {
      countQueryBuilder.andWhere('submission.createdAt >= :submissionDateFrom', { submissionDateFrom: new Date(queryDto.submissionDateFrom) });
    }

    if (queryDto.submissionDateTo) {
      countQueryBuilder.andWhere('submission.createdAt <= :submissionDateTo', { submissionDateTo: new Date(queryDto.submissionDateTo) });
    }

    if (queryDto.verificationDateFrom) {
      countQueryBuilder.andWhere('submission.verifiedAt >= :verificationDateFrom', { verificationDateFrom: new Date(queryDto.verificationDateFrom) });
    }

    if (queryDto.verificationDateTo) {
      countQueryBuilder.andWhere('submission.verifiedAt <= :verificationDateTo', { verificationDateTo: new Date(queryDto.verificationDateTo) });
    }

    if (queryDto.amountFrom !== undefined) {
      countQueryBuilder.andWhere('submission.totalAmountPaid >= :amountFrom', { amountFrom: queryDto.amountFrom });
    }

    if (queryDto.amountTo !== undefined) {
      countQueryBuilder.andWhere('submission.totalAmountPaid <= :amountTo', { amountTo: queryDto.amountTo });
    }

    if (queryDto.studentId) {
      countQueryBuilder.andWhere('submission.submittedBy = :studentId', { studentId: queryDto.studentId });
    }

    if (queryDto.search) {
      countQueryBuilder.andWhere('(submission.transactionReference ILIKE :search OR submission.paymentRemarks ILIKE :search OR submission.notes ILIKE :search)', 
        { search: `%${queryDto.search}%` });
    }

    if (queryDto.hasLateFee !== undefined) {
      if (queryDto.hasLateFee) {
        countQueryBuilder.andWhere('submission.lateFeeApplied > 0');
      } else {
        countQueryBuilder.andWhere('(submission.lateFeeApplied = 0 OR submission.lateFeeApplied IS NULL)');
      }
    }

    if (queryDto.hasAttachment !== undefined) {
      if (queryDto.hasAttachment) {
        countQueryBuilder.andWhere('submission.receiptFileUrl IS NOT NULL');
      } else {
        countQueryBuilder.andWhere('submission.receiptFileUrl IS NULL');
      }
    }

    // For student name filter, need to join submitter in count query too
    if (queryDto.studentName) {
      countQueryBuilder.leftJoin('submission.submitter', 'submitter')
        .andWhere('(LOWER(submitter.firstName) LIKE LOWER(:studentName) OR LOWER(submitter.lastName) LIKE LOWER(:studentName) OR LOWER(CONCAT(submitter.firstName, \' \', submitter.lastName)) LIKE LOWER(:studentName))', 
        { studentName: `%${queryDto.studentName}%` });
    }

    // Get total count using the simplified query
    const totalCount = await countQueryBuilder.getCount();

    // Get paginated results
    const submissions = await queryBuilder
      .skip(skip)
      .take(limit)
      .getMany();

    const totalPages = Math.ceil(totalCount / limit);

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
          pendingCount: await this.getSubmissionCountByStatus(paymentId, 'PENDING'),
          verifiedCount: await this.getSubmissionCountByStatus(paymentId, 'VERIFIED'),
          rejectedCount: await this.getSubmissionCountByStatus(paymentId, 'REJECTED'),
          totalVerifiedAmount: await this.getTotalSubmissionAmount(paymentId)
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
        studentName: sub.submitter ? `${sub.submitter.firstName} ${sub.submitter.lastName}`.trim() : null,
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

  // Helper method to get submission count by status
  private async getSubmissionCountByStatus(paymentId: string, status: string): Promise<number> {
    return await this.submissionRepository.count({
      where: { paymentId, status: status as any }
    });
  }

  // Helper method to get total submission amount
  private async getTotalSubmissionAmount(paymentId: string): Promise<number> {
    const result = await this.submissionRepository
      .createQueryBuilder('submission')
      .select('SUM(submission.totalAmountPaid)', 'total')
      .where('submission.paymentId = :paymentId', { paymentId })
      .andWhere('submission.status IN (:...statuses)', { statuses: ['VERIFIED'] })
      .getRawOne();
    
    return parseFloat(result?.total || '0');
  }

  async verifySubmission(
    instituteId: string, 
    paymentId: string, // This will be ignored and auto-detected from submission
    submissionId: string, 
    verifyDto: VerifyInstitutePaymentSubmissionDto, 
    user: JwtPayload
  ) {
    // Validate institute access and admin permissions
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied to this institute',
        error: 'INSTITUTE_ACCESS_DENIED'
      });
    }

    // Access control will be handled by decorators

    // Find the submission with only necessary fields (avoid SELECT *)
    const submission = await this.submissionRepository
      .createQueryBuilder('submission')
      .select([
        'submission.id',
        'submission.paymentId', 
        'submission.status',
        'submission.paymentAmount',
        'submission.totalAmountPaid',
        'submission.paymentMethod',
        'submission.submittedBy'
      ])
      .leftJoin('submission.payment', 'payment')
      .addSelect(['payment.instituteId'])
      .leftJoin('submission.submitter', 'submitter')
      .addSelect(['submitter.firstName', 'submitter.lastName'])
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

    // Check if submission is already verified or rejected
    if (submission.status !== 'PENDING') {
      throw new BadRequestException({
        success: false,
        message: `Submission is already ${submission.status.toLowerCase()}`,
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

    // Update submission with verification details
    const now = new Date();
    submission.status = verifyDto.status as any;
    submission.verifiedBy = user.s;
    submission.verifiedAt = now;
    submission.rejectionReason = verifyDto.status === 'REJECTED' ? verifyDto.rejectionReason : null;
    submission.notes = verifyDto.notes || null;
    submission.updatedAt = now;

    // Save the updated submission
    const updatedSubmission = await this.submissionRepository.save(submission);

    // 🔄 CRITICAL FIX: Refresh user cache after payment verification (payment status affects user data)
    if (verifyDto.status === 'VERIFIED') {
      try {
        await this.userManagementService.refreshUserCache(submission.submittedBy);
      } catch (cacheError) {
        // Don't fail the verification if cache refresh fails
      }
    }

    // Return clean response with minimal necessary data
    const responseData: any = {
      id: updatedSubmission.id,
      status: updatedSubmission.status,
      verifierName: `${(userEntity as any).firstName} ${(userEntity as any).lastName}`,
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
      message: `Submission ${verifyDto.status.toLowerCase()} successfully by ${role}`,
      data: responseData
    };
  }

  async getMySubmissions(instituteId: string, queryDto: GetInstitutePaymentSubmissionsQueryDto, user: JwtPayload) {
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

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
        .select([
          'submission.id',
          'submission.paymentId', 
          'submission.paymentAmount',
          'submission.paymentMethod',
          'submission.transactionReference',
          'submission.paymentDate',
          'submission.status',
          'submission.verifiedAt',
          'submission.rejectionReason',
          'submission.lateFeeApplied',
          'submission.totalAmountPaid',
          'submission.receiptFileName',
          'submission.receiptFileUrl',
          'submission.receiptFileSize',
          'submission.receiptFileType',
          'submission.paymentRemarks',
          'submission.createdAt'
        ])
        .leftJoin('submission.payment', 'payment')
        .addSelect([
          'payment.id',
          'payment.paymentType',
          'payment.description',
          'payment.amount',
          'payment.dueDate',
          'payment.targetType',
          'payment.priority',
          'payment.status',
          'payment.isActive'
        ])
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
        paymentRemarks: submission.paymentRemarks,
        createdAt: submission.createdAt?.toISOString() || null,
        // Minimal additional fields
        canResubmit: submission.status === SubmissionStatus.REJECTED && submission.payment.isActive,
        canDelete: submission.status === SubmissionStatus.PENDING,
        daysSinceSubmission: Math.floor((new Date().getTime() - submission.createdAt.getTime()) / (1000 * 60 * 60 * 24))
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
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied',
        error: 'ACCESS_DENIED'
      });
    }

    const userAccessLevel = this.getUserAccessLevel(userEntity);

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
          canResubmit: submission.status === SubmissionStatus.REJECTED && submission.payment.isActive,
          canDelete: submission.status === SubmissionStatus.PENDING && (userAccessLevel === UserAccessLevel.ADMIN || submission.submittedBy === user.s),
          canVerify: userAccessLevel === UserAccessLevel.ADMIN && submission.status === SubmissionStatus.PENDING
        },
        // Add payment context
        paymentContext: {
          paymentIsActive: submission.payment.isActive,
          paymentStatus: submission.payment.status,
          daysSinceDue: Math.floor((new Date().getTime() - submission.payment.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
          daysSinceSubmission: Math.floor((new Date().getTime() - submission.createdAt.getTime()) / (1000 * 60 * 60 * 24))
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
    const { user: userEntity, hasAccess, role } = await this.getUserFromJWT(user, instituteId);

    if (!hasAccess) {
      throw new ForbiddenException({
        success: false,
        message: 'Access denied',
        error: 'ACCESS_DENIED'
      });
    }

    // Access control will be handled by decorators

    // For parents, validate they have access to this specific student
    // (In real implementation, check parent-student relationship)

    const userAccessLevel = this.getUserAccessLevel(userEntity);

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
        message: `Student submissions retrieved - ${role === UserType.USER_WITHOUT_STUDENT ? 'parent view (verification details hidden)' : 'admin view (full details)'}`,
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
}
