import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CardPayment } from '../entities/card-payment.entity';
import { UserIdCardOrder } from '../entities/user-id-card-order.entity';
import { SubmitPaymentDto } from '../dto/submit-payment.dto';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';
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
  ) {}

  async submitPayment(
    orderId: string,
    userId: string,
    submitPaymentDto: SubmitPaymentDto,
  ): Promise<PaymentResponseDto> {
    // Verify order belongs to user
    const order = await this.orderRepository.findOne({
      where: { id: orderId, userId },
      relations: ['payments'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check if payment already submitted (prevent duplicate submissions)
    const existingPayment = await this.paymentRepository.findOne({
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
    const payment = this.paymentRepository.create({
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

    const savedPayment = await this.paymentRepository.save(payment);

    // Update order status to PAYMENT_RECEIVED
    order.orderStatus = OrderStatus.PAYMENT_RECEIVED;
    order.paymentId = savedPayment.id;
    await this.orderRepository.save(order);

    return this.toResponseDto(savedPayment);
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
    verifyPaymentDto: VerifyPaymentDto,
    adminUserId: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['order'],
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

    const updatedPayment = await this.paymentRepository.save(payment);

    // Update order status based on payment verification
    const order = payment.order;
    if (verifyPaymentDto.paymentStatus === 'VERIFIED') {
      order.orderStatus = OrderStatus.VERIFYING;
    } else if (verifyPaymentDto.paymentStatus === 'REJECTED') {
      order.orderStatus = OrderStatus.REJECTED;
      order.rejectedReason = verifyPaymentDto.rejectionReason;
    }

    await this.orderRepository.save(order);

    // Fetch updated payment with relations
    const finalPayment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['order', 'verifier'],
    });

    return this.toResponseDto(finalPayment);
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
