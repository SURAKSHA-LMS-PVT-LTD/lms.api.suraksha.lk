import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CardPayment, PaymentUploadMethod } from '../entities/card-payment.entity';
import { UserIdCardOrder } from '../entities/user-id-card-order.entity';
import { SubmitPaymentDto, SubmitDrivePaymentDto } from '../dto/submit-payment.dto';
import { VerifyCardPaymentDto } from '../dto/verify-payment.dto';
import { PaymentResponseDto, PaginatedPaymentsResponseDto } from '../dto/response/payment-response.dto';
import { OrderStatus } from '../enums/order-status.enum';
import { now } from '../../../common/utils/timezone.util';

@Injectable()
export class CardPaymentService {
  constructor(
    @InjectRepository(CardPayment)
    private readonly paymentRepository: Repository<CardPayment>,
    @InjectRepository(UserIdCardOrder)
    private readonly orderRepository: Repository<UserIdCardOrder>,
    private readonly dataSource: DataSource,
  ) {}

  async submitPayment(
    orderId: string,
    userId: string,
    submitPaymentDto: SubmitPaymentDto,
  ): Promise<PaymentResponseDto> {
    return await this.dataSource.transaction(async (manager) => {
      // Lock the order row to prevent concurrent payment submissions
      const order = await manager.findOne(UserIdCardOrder, {
        where: { id: orderId, userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      // Check if payment already submitted (prevent duplicate submissions)
      const existingPayment = await manager.findOne(CardPayment, {
        where: { orderId, paymentStatus: 'PENDING' },
      });

      if (existingPayment) {
        throw new BadRequestException('Payment already submitted for this order');
      }

      // Check if order is in correct status
      if (order.orderStatus !== OrderStatus.PENDING_PAYMENT) {
        throw new BadRequestException(
          'Payment can only be submitted for orders in PENDING_PAYMENT status',
        );
      }

      // Create payment submission
      const timestamp = now();
      const payment = manager.create(CardPayment, {
        orderId,
        submissionUrl: submitPaymentDto.submissionUrl,
        paymentType: submitPaymentDto.paymentType,
        paymentAmount: submitPaymentDto.paymentAmount,
        paymentReference: submitPaymentDto.paymentReference,
        notes: submitPaymentDto.notes,
        paymentStatus: 'PENDING',
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const savedPayment = await manager.save(CardPayment, payment);

      // Update order status to PAYMENT_RECEIVED
      order.orderStatus = OrderStatus.PAYMENT_RECEIVED;
      order.paymentId = savedPayment.id;
      await manager.save(UserIdCardOrder, order);

      return this.toResponseDto(savedPayment);
    });
  }

  /**
   * Submit payment proof uploaded to Google Drive.
   * The user uploads directly to their own Drive
   * and provides the resulting file ID and view link.
   */
  async submitDrivePayment(
    orderId: string,
    userId: string,
    dto: SubmitDrivePaymentDto,
  ): Promise<PaymentResponseDto> {
    return await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(UserIdCardOrder, {
        where: { id: orderId, userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const existingPayment = await manager.findOne(CardPayment, {
        where: { orderId, paymentStatus: 'PENDING' },
      });

      if (existingPayment) {
        throw new BadRequestException('Payment already submitted for this order');
      }

      if (order.orderStatus !== OrderStatus.PENDING_PAYMENT) {
        throw new BadRequestException(
          'Payment can only be submitted for orders in PENDING_PAYMENT status',
        );
      }

      const timestamp = now();
      const payment = manager.create(CardPayment, {
        orderId,
        uploadMethod: PaymentUploadMethod.GOOGLE_DRIVE,
        driveFileId: dto.driveFileId,
        driveWebViewLink: dto.driveWebViewLink,
        driveFileName: dto.driveFileName,
        paymentType: dto.paymentType,
        paymentAmount: dto.paymentAmount,
        paymentReference: dto.paymentReference,
        notes: dto.notes,
        paymentStatus: 'PENDING',
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const savedPayment = await manager.save(CardPayment, payment);

      order.orderStatus = OrderStatus.PAYMENT_RECEIVED;
      order.paymentId = savedPayment.id;
      await manager.save(UserIdCardOrder, order);

      return this.toResponseDto(savedPayment);
    });
  }

  async getPaymentsByOrder(orderId: string, userId?: string): Promise<PaymentResponseDto[]> {
    const query = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.order', 'order')
      .leftJoinAndSelect('payment.verifier', 'verifier')
      .where('payment.orderId = :orderId', { orderId });

    if (userId) {
      query.andWhere('order.userId = :userId', { userId });
    }

    const payments = await query.orderBy('payment.createdAt', 'DESC').getMany();

    return payments.map(payment => this.toResponseDto(payment));
  }

  async getPaymentById(paymentId: string): Promise<PaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['order', 'verifier'],
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return this.toResponseDto(payment);
  }

  // Admin methods
  async getAllPayments(
    page: number = 1,
    limit: number = 10,
    paymentStatus?: string,
    orderId?: string,
  ): Promise<PaginatedPaymentsResponseDto> {
    const query = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.order', 'order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('payment.verifier', 'verifier');

    if (paymentStatus) {
      query.andWhere('payment.paymentStatus = :paymentStatus', { paymentStatus });
    }

    if (orderId) {
      query.andWhere('payment.orderId = :orderId', { orderId });
    }

    const [payments, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('payment.createdAt', 'DESC')
      .getManyAndCount();

    return {
      data: payments.map(payment => this.toResponseDto(payment)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async verifyPayment(
    paymentId: string,
    verifyPaymentDto: VerifyCardPaymentDto,
    adminUserId: string,
  ): Promise<PaymentResponseDto> {
    return await this.dataSource.transaction(async (manager) => {
      // Lock the payment row to prevent concurrent verification
      const payment = await manager.findOne(CardPayment, {
        where: { id: paymentId },
        relations: ['order'],
        lock: { mode: 'pessimistic_write' },
      });

      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      if (payment.paymentStatus !== 'PENDING') {
        throw new BadRequestException('Payment has already been processed');
      }

      // Update payment status
      payment.paymentStatus = verifyPaymentDto.paymentStatus;
      payment.verifiedBy = adminUserId;
      payment.verifiedAt = now();

      if (verifyPaymentDto.rejectionReason) {
        payment.rejectionReason = verifyPaymentDto.rejectionReason;
      }

      if (verifyPaymentDto.notes) {
        payment.notes = verifyPaymentDto.notes;
      }

      await manager.save(CardPayment, payment);

      // Update order status based on payment verification
      const order = payment.order;
      if (verifyPaymentDto.paymentStatus === 'VERIFIED') {
        order.orderStatus = OrderStatus.VERIFYING;
      } else if (verifyPaymentDto.paymentStatus === 'REJECTED') {
        order.orderStatus = OrderStatus.REJECTED;
        order.rejectedReason = verifyPaymentDto.rejectionReason;
      }

      await manager.save(UserIdCardOrder, order);

      // Fetch updated payment with relations
      const finalPayment = await manager.findOne(CardPayment, {
        where: { id: paymentId },
        relations: ['order', 'verifier'],
      });

      return this.toResponseDto(finalPayment);
    });
  }

  // Note: Payments cannot be deleted (audit trail requirement)
  async attemptDelete(paymentId: string): Promise<never> {
    throw new ForbiddenException(
      'Payment submissions cannot be deleted for audit compliance',
    );
  }

  private toResponseDto(payment: CardPayment): PaymentResponseDto {
    return {
      id: payment.id,
      orderId: payment.orderId,
      submissionUrl: payment.submissionUrl || undefined,
      uploadMethod: payment.uploadMethod || undefined,
      driveFileId: payment.driveFileId || undefined,
      driveWebViewLink: payment.driveWebViewLink || undefined,
      driveFileName: payment.driveFileName || undefined,
      paymentType: payment.paymentType,
      paymentAmount: Number(payment.paymentAmount),
      paymentReference: payment.paymentReference || undefined,
      paymentStatus: payment.paymentStatus,
      verifiedBy: payment.verifiedBy || undefined,
      verifiedAt: payment.verifiedAt || undefined,
      rejectionReason: payment.rejectionReason || undefined,
      notes: payment.notes || undefined,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      order: payment.order,
      verifier: payment.verifier,
    };
  }
}
