import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Not, DataSource } from 'typeorm';
import { PaymentEntity, PaymentStatus } from '../entities/payment.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { SubscriptionPlan } from '../../user/enums/subscription-plan.enum';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { VerifyInstitutePaymentDto } from '../dto/verify-payment.dto';
import { PaymentResponseDto, PaymentListResponseDto, PaymentVerificationResponseDto, PaymentCreationResponseDto } from '../dto/payment-response.dto';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { ConfigService } from '@nestjs/config';
import { UserManagementService } from '../../../common/services/cache-user-management.service';
import { AsyncEmailService } from '../../../common/services/async-email.service';
import { getCurrentSriLankaTime, nowTimestamp, formatSriLankaDateTime } from '../../../common/utils/timezone.util';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly cloudStorageService: CloudStorageService,
    private readonly configService: ConfigService,
    private readonly userManagementService: UserManagementService,
    private readonly asyncEmailService: AsyncEmailService,
  ) {}

  async createPayment(
    userId: string,
    createPaymentDto: CreatePaymentDto,
    file?: string,
  ): Promise<PaymentCreationResponseDto> {
    // Validate user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        success: false,
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }

    // Validate payment month format
    if (!this.validatePaymentMonth(createPaymentDto.paymentMonth)) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid payment month format. Use YYYY-MM',
        error: 'INVALID_PAYMENT_MONTH'
      });
    }

    // Check if payment already exists for this month
    const existingPayment = await this.paymentRepository.findOne({
      where: {
        userId,
        paymentMonth: createPaymentDto.paymentMonth,
        status: PaymentStatus.PENDING,
      },
    });

    if (existingPayment) {
      throw new BadRequestException({
        success: false,
        message: `Payment for month ${createPaymentDto.paymentMonth} already exists and is pending verification`,
        error: 'DUPLICATE_PAYMENT'
      });
    }

    // File validation is done at upload service level
    // No need to validate here as file is now a URL string

    // Create payment entity
    const timestamp = new Date(); // real UTC — MySQL2 timezone:'+05:30' stores as Sri Lanka time
    const payment = this.paymentRepository.create({
      userId,
      paymentAmount: createPaymentDto.paymentAmount,
      paymentMethod: createPaymentDto.paymentMethod,
      paymentReference: createPaymentDto.paymentReference,
      paymentDate: new Date(createPaymentDto.paymentDate),
      paymentMonth: createPaymentDto.paymentMonth,
      notes: createPaymentDto.notes,
      targetPlan: createPaymentDto.targetPlan,
      quantity: createPaymentDto.quantity ?? 1,
      status: PaymentStatus.PENDING,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // ✅ Handle paymentSlipUrl from DTO or file parameter (backward compatibility)
    const paymentSlipUrl = createPaymentDto.paymentSlipUrl || file;
    
    if (paymentSlipUrl) {
      if (typeof paymentSlipUrl === 'string') {
        // URL from /upload/verify-and-publish or DTO
        payment.paymentSlipUrl = paymentSlipUrl;
        payment.paymentSlipFilename = paymentSlipUrl.split('/').pop() || 'receipt';
      } else {
        throw new BadRequestException({
          success: false,
          message: 'File upload is deprecated. Use paymentSlipUrl from /upload/verify-and-publish.',
          error: 'FILE_UPLOAD_DEPRECATED'
        });
      }
    }

    const savedPayment = await this.paymentRepository.save(payment);
    
    // Convert relative path to full URL if path exists
    let uploadedFileUrl: string | null = null;
    if (savedPayment.paymentSlipFilename) {
      uploadedFileUrl = this.cloudStorageService.getFullUrl(savedPayment.paymentSlipFilename);
    }

    // 📧 Send payment submission email notification (fire-and-forget)
    try {
      const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User';
      const submittedAt = formatSriLankaDateTime(new Date(), { // new Date() = real UTC; formatSriLankaDateTime applies Asia/Colombo correctly
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      this.asyncEmailService.sendPaymentSubmissionEmailAsync({
        userEmail: user.email,
        userName: userName,
        submissionId: savedPayment.id,
        requestedCredits: 0,
        paymentAmount: savedPayment.paymentAmount,
        paymentMethod: createPaymentDto.paymentMethod,
        paymentReference: createPaymentDto.paymentReference || savedPayment.id,
        submissionNotes: createPaymentDto.notes || '',
        submittedAt: submittedAt,
      });
    } catch (emailError) {
      // Log error but don't block payment submission
      console.error('Failed to send payment submission email:', emailError);
    }
    
    // Return success response with minimal data
    return {
      success: true,
      message: 'Payment submitted successfully',
      data: {
        paymentId: savedPayment.id,
        status: savedPayment.status,
        uploadedFile: uploadedFileUrl
      }
    };
  }

  /**
   * Comprehensive file validation
   */
  private async validateUploadedFile(file: any): Promise<void> {
    // Check file size
    if (file.size > 5 * 1024 * 1024) { // 5MB
      throw new BadRequestException({
        success: false,
        message: 'File too large. Maximum size allowed is 5MB',
        error: 'FILE_TOO_LARGE'
      });
    }

    // Use the file upload service validation
    // Note: The validation is already done in multer fileFilter, but we add extra layer here
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid file type. Only PDF, JPG, JPEG, PNG files are allowed',
        error: 'INVALID_FILE_TYPE'
      });
    }
  }

  async getPaymentById(id: string, userId?: string): Promise<PaymentResponseDto> {
    const where: any = { id };
    if (userId) {
      where.userId = userId;
    }

    const payment = await this.paymentRepository.findOne({ 
      where,
      relations: ['user', 'verifier']
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return this.mapToResponseDto(payment);
  }

  async getUserPayments(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaymentListResponseDto> {
    const [payments, total] = await this.paymentRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['verifier'],
    });

    return {
      payments: payments.map(payment => this.mapToResponseDto(payment)),
      total,
      page,
      limit,
    };
  }

  async getAllPayments(
    page: number = 1,
    limit: number = 10,
    status?: PaymentStatus,
    paymentMonth?: string,
  ): Promise<PaymentListResponseDto> {
    const where: any = {};
    
    if (status) {
      where.status = status;
    }
    
    if (paymentMonth) {
      where.paymentMonth = paymentMonth;
    }

    const [payments, total] = await this.paymentRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['user', 'verifier'],
    });

    return {
      payments: payments.map(payment => this.mapToResponseDto(payment)),
      total,
      page,
      limit,
    };
  }

  async verifyPayment(
    paymentId: string,
    verifyPaymentDto: VerifyInstitutePaymentDto,
    verifierId: string,
  ): Promise<PaymentVerificationResponseDto> {
    // Use database transaction for secure payment verification process
    return await this.dataSource.transaction(async (manager) => {
      // Find payment with user details within transaction
      const payment = await manager.findOne(PaymentEntity, {
        where: { id: paymentId },
        relations: ['user'],
        lock: { mode: 'pessimistic_write' }, // Lock row for update
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException('Payment is not in pending status');
      }

      if (!payment.user) {
        throw new NotFoundException('User associated with payment not found');
      }

      // Set default values
      const paymentValidityDays = verifyPaymentDto.paymentValidityDays || 30;
      const subscriptionPlan = verifyPaymentDto.subscriptionPlan || SubscriptionPlan.PRO_WHATSAPP;
      const newStatus = verifyPaymentDto.status || PaymentStatus.VERIFIED;

      // Update payment record
      await manager.update(PaymentEntity, paymentId, {
        status: newStatus,
        verifiedBy: verifierId,
        verifiedAt: new Date(), // real UTC — MySQL2 timezone:'+05:30' stores as Sri Lanka time
        rejectionReason: verifyPaymentDto.rejectionReason,
        notes: verifyPaymentDto.notes || payment.notes,
      });

      let expirationDate: Date | undefined;

      // If payment is verified, update user subscription and expiration
      if (newStatus === PaymentStatus.VERIFIED) {
        // Calculate expiration date using timestamp arithmetic
        const currentTimeMs = nowTimestamp();
        const validityMs = paymentValidityDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
        expirationDate = new Date(currentTimeMs + validityMs);

        // CRITICAL: Update user subscription within the same transaction
        await manager.update(UserEntity, payment.userId, {
          subscriptionPlan: subscriptionPlan,
          paymentExpiresAt: expirationDate,
          updatedAt: new Date(), // real UTC — MySQL2 timezone:'+05:30' stores as Sri Lanka time
        });

        // ✅ MANDATORY: Get updated user data after subscription update for cache refresh
        const updatedUser = await manager.findOne(UserEntity, {
          where: { id: payment.userId }
        });

        // 🔄 CRITICAL FIX: Refresh user cache after subscription plan update
        // This is exactly what the user pointed out - payment updates must refresh cache
        if (newStatus === PaymentStatus.VERIFIED && updatedUser) {
          try {
            await this.userManagementService.refreshUserCache(updatedUser.id);
          } catch (cacheError) {
            this.logger.warn(`Cache refresh failed after payment verification for user ${updatedUser.id}: ${cacheError.message}`);
          }
        }
      }

      // Get updated payment record
      const updatedPayment = await manager.findOne(PaymentEntity, {
        where: { id: paymentId },
        relations: ['user', 'verifier'],
      });

      // 📧 Send email notification based on payment status (fire-and-forget)
      try {
        const userName = `${payment.user.firstName || ''} ${payment.user.lastName || ''}`.trim() || 'User';
        const verifiedAt = formatSriLankaDateTime(new Date(), { // new Date() = real UTC; formatSriLankaDateTime applies Asia/Colombo correctly
          year: 'numeric', 
          month: 'short', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        if (newStatus === PaymentStatus.VERIFIED) {
          // Payment Approved Email
          this.asyncEmailService.sendPaymentApprovedEmailAsync({
            userEmail: payment.user.email,
            userName: userName,
            submissionId: paymentId,
            creditsGranted: paymentValidityDays,
            verifiedAt: verifiedAt,
            adminNotes: verifyPaymentDto.notes || `Payment verified successfully. Subscription plan updated to ${subscriptionPlan} for ${paymentValidityDays} days.`,
          });
        } else if (newStatus === PaymentStatus.REJECTED) {
          // Payment Rejected Email
          this.asyncEmailService.sendPaymentRejectedEmailAsync({
            userEmail: payment.user.email,
            userName: userName,
            submissionId: paymentId,
            rejectionReason: verifyPaymentDto.rejectionReason || 'Payment verification failed',
            verifiedAt: verifiedAt,
            adminNotes: verifyPaymentDto.notes || '',
          });
        }
      } catch (emailError) {
        // Log error but don't block payment verification
        console.error('Failed to send payment verification email:', emailError);
      }

      return {
        success: true,
        message: newStatus === PaymentStatus.VERIFIED 
          ? `Payment verified successfully. User subscription updated to ${subscriptionPlan} for ${paymentValidityDays} days.`
          : `Payment status updated to ${newStatus}.`,
        payment: this.mapToResponseDto(updatedPayment!),
        subscriptionPlan: newStatus === PaymentStatus.VERIFIED ? subscriptionPlan : undefined,
        paymentExpiresAt: expirationDate,
        paymentValidityDays: newStatus === PaymentStatus.VERIFIED ? paymentValidityDays : undefined,
      };
    });
  }

  async getUserCurrentPaymentStatus(userId: string): Promise<{
    isPaid: boolean;
    currentMonth: string;
    paymentExpiresAt?: Date;
    latestPayment?: PaymentResponseDto;
    subscriptionPlan?: string;
  }> {
    const currentMonth = this.getCurrentPaymentMonth();
    
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const latestPayment = await this.paymentRepository.findOne({
      where: {
        userId,
        paymentMonth: currentMonth,
        status: PaymentStatus.VERIFIED,
      },
      order: { createdAt: 'DESC' },
    });

    // Check if user has a paid subscription plan (not FREE)
    const hasPaidSubscription = user.subscriptionPlan !== 'FREE';

    return {
      isPaid: hasPaidSubscription && (!user.paymentExpiresAt || user.paymentExpiresAt > new Date()),
      currentMonth,
      paymentExpiresAt: user.paymentExpiresAt,
      subscriptionPlan: user.subscriptionPlan,
      latestPayment: latestPayment ? this.mapToResponseDto(latestPayment) : undefined,
    };
  }

  async resetMonthlyPayments(): Promise<{ resetCount: number }> {
    // This method should be called monthly via a cron job
    // Reset payment expiration for users with paid subscription plans
    const result = await this.userRepository.update(
      { subscriptionPlan: Not(SubscriptionPlan.FREE) },
      { 
        paymentExpiresAt: undefined,
      }
    );

    return { resetCount: result.affected || 0 };
  }

  private async updateUserPaymentStatus(
    userId: string, 
    paymentMonth: string, 
    subscriptionPlan?: SubscriptionPlan,
    validityDays: number = 30
  ): Promise<void> {
    // Calculate expiration date using timestamp arithmetic
    const currentTimeMs = nowTimestamp();
    const validityMs = validityDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    const expirationDate = new Date(currentTimeMs + validityMs);
    
    const updateData: any = {
      paymentExpiresAt: expirationDate,
    };

    // If a subscription plan is provided, update it
    if (subscriptionPlan && subscriptionPlan !== SubscriptionPlan.FREE) {
      updateData.subscriptionPlan = subscriptionPlan;
    }
    
    await this.userRepository.update(userId, updateData);

    // 🔄 CRITICAL FIX: Refresh user cache after payment status update
    try {
      await this.userManagementService.refreshUserCache(userId);
    } catch (cacheError) {
      this.logger.warn(`Cache refresh failed after payment update for user ${userId}: ${cacheError.message}`);
    }
  }

  private getNextMonth(currentMonth: string): string {
    const [year, month] = currentMonth.split('-').map(Number);
    const nextDate = new Date(year, month, 1); // month is 0-indexed, so this gives us next month
    return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
  }

  private mapToResponseDto(payment: PaymentEntity): PaymentResponseDto {
    return {
      id: payment.id,
      userId: payment.userId,
      paymentAmount: payment.paymentAmount,
      paymentMethod: payment.paymentMethod,
      paymentReference: payment.paymentReference,
      // ✅ OOP: Transform relative path to full URL for response
      paymentSlipUrl: payment.paymentSlipUrl ? this.cloudStorageService.getFullUrl(payment.paymentSlipUrl) : undefined,
      paymentSlipFilename: payment.paymentSlipFilename,
      status: payment.status,
      paymentDate: payment.paymentDate instanceof Date ? payment.paymentDate.toISOString() : payment.paymentDate,
      paymentMonth: payment.paymentMonth,
      verifiedBy: payment.verifiedBy,
      verifiedAt: payment.verifiedAt instanceof Date ? payment.verifiedAt.toISOString() : payment.verifiedAt,
      rejectionReason: payment.rejectionReason,
      notes: payment.notes,
      targetPlan: payment.targetPlan,
      quantity: payment.quantity,
      createdAt: payment.createdAt instanceof Date ? payment.createdAt.toISOString() : payment.createdAt,
      updatedAt: payment.updatedAt instanceof Date ? payment.updatedAt.toISOString() : payment.updatedAt,
    };
  }

  /**
   * Validate payment month format (YYYY-MM)
   */
  private validatePaymentMonth(paymentMonth: string): boolean {
    const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
    return monthPattern.test(paymentMonth);
  }

  /**
   * Get current payment month in YYYY-MM format
   */
  private getCurrentPaymentMonth(): string {
    const nowDate = new Date();
    const year = nowDate.getFullYear();
    const month = String(nowDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }
}
