import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { UserIdCardOrder } from '../entities/user-id-card-order.entity';
import { Card } from '../entities/card.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { UpdateCardStatusDto } from '../dto/update-card-status.dto';
import { AssignRfidDto } from '../dto/assign-rfid.dto';
import { OrderResponseDto, PaginatedOrdersResponseDto } from '../dto/response/order-response.dto';
import { OrderStatus } from '../enums/order-status.enum';
import { CardStatus } from '../enums/card-status.enum';
import { now, getExpiryDate } from '../../../common/utils/timezone.util';

@Injectable()
export class CardOrderService {
  constructor(
    @InjectRepository(UserIdCardOrder)
    private readonly orderRepository: Repository<UserIdCardOrder>,
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async createOrder(userId: string, createOrderDto: CreateOrderDto): Promise<OrderResponseDto> {
    // Find the card
    const card = await this.cardRepository.findOne({
      where: { id: createOrderDto.cardId, isActive: true },
    });

    if (!card) {
      throw new NotFoundException('Card not found or not available');
    }

    if (card.quantityAvailable <= 0) {
      throw new BadRequestException('Card is out of stock');
    }

    // Check if user already has a pending order for this card (prevent duplicates)
    const existingPendingOrder = await this.orderRepository.findOne({
      where: {
        userId,
        cardId: card.id,
        orderStatus: In([OrderStatus.PENDING_PAYMENT, OrderStatus.PAYMENT_RECEIVED]),
      },
    });

    if (existingPendingOrder) {
      throw new ConflictException(
        'You already have a pending order for this card. Please complete or cancel the existing order first.',
      );
    }

    // Calculate expiry date using Sri Lanka timezone
    const expiryDate = now();
    expiryDate.setDate(expiryDate.getDate() + card.validityDays);

    // Create order
    const order = this.orderRepository.create({
      userId,
      cardId: card.id,
      cardType: card.cardType,
      cardExpiryDate: expiryDate,
      deliveryAddress: createOrderDto.deliveryAddress,
      contactPhone: createOrderDto.contactPhone,
      notes: createOrderDto.notes,
      status: CardStatus.INACTIVE,
      orderStatus: OrderStatus.PENDING_PAYMENT,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Populate relations
    const populatedOrder = await this.orderRepository.findOne({
      where: { id: savedOrder.id },
      relations: ['card', 'user'],
    });

    return this.toResponseDto(populatedOrder);
  }

  async getMyOrders(
    userId: string,
    page: number = 1,
    limit: number = 10,
    orderStatus?: OrderStatus,
  ): Promise<PaginatedOrdersResponseDto> {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.card', 'card')
      .leftJoinAndSelect('order.payments', 'payments')
      .where('order.userId = :userId', { userId });

    if (orderStatus) {
      query.andWhere('order.orderStatus = :orderStatus', { orderStatus });
    }

    const [orders, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('order.orderDate', 'DESC')
      .getManyAndCount();

    return {
      data: orders.map(order => this.toResponseDto(order)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getMyCards(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedOrdersResponseDto> {
    // Get ALL cards with any status (ACTIVE, DEACTIVATED, LOST, DAMAGED, EXPIRED, REPLACED, etc.)
    const query = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.card', 'card')
      .where('order.userId = :userId', { userId })
      .andWhere('order.orderStatus = :orderStatus', {
        orderStatus: OrderStatus.DELIVERED,
      });

    const [orders, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('order.activatedAt', 'DESC')
      .getManyAndCount();

    return {
      data: orders.map(order => this.toResponseDto(order)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOrderById(orderId: string, userId?: string): Promise<OrderResponseDto> {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.card', 'card')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.payments', 'payments')
      .where('order.id = :orderId', { orderId });

    if (userId) {
      query.andWhere('order.userId = :userId', { userId });
    }

    const order = await query.getOne();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.toResponseDto(order);
  }

  async updateCardStatus(
    orderId: string,
    userId: string,
    updateCardStatusDto: UpdateCardStatusDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId, userId },
      relations: ['card'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Update status
    order.status = updateCardStatusDto.status;

    if (updateCardStatusDto.status === CardStatus.ACTIVE && !order.activatedAt) {
      order.activatedAt = now();
    }

    if (updateCardStatusDto.status === CardStatus.DEACTIVATED) {
      order.deactivatedAt = now();
    }

    const updatedOrder = await this.orderRepository.save(order);

    return this.toResponseDto(updatedOrder);
  }

  // Admin methods
  async getAllOrders(
    page: number = 1,
    limit: number = 10,
    filters?: {
      orderStatus?: OrderStatus;
      userId?: string;
      cardType?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
  ): Promise<PaginatedOrdersResponseDto> {
    const query = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.card', 'card')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.payments', 'payments');

    if (filters?.orderStatus) {
      query.andWhere('order.orderStatus = :orderStatus', {
        orderStatus: filters.orderStatus,
      });
    }

    if (filters?.userId) {
      query.andWhere('order.userId = :userId', { userId: filters.userId });
    }

    if (filters?.cardType) {
      query.andWhere('order.cardType = :cardType', { cardType: filters.cardType });
    }

    if (filters?.dateFrom) {
      query.andWhere('order.orderDate >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters?.dateTo) {
      query.andWhere('order.orderDate <= :dateTo', { dateTo: filters.dateTo });
    }

    const [orders, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('order.orderDate', 'DESC')
      .getManyAndCount();

    return {
      data: orders.map(order => this.toResponseDto(order)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateOrderStatus(
    orderId: string,
    updateOrderStatusDto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOne(UserIdCardOrder, {
        where: { id: orderId },
        relations: ['card'],
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      // Update order status
      order.orderStatus = updateOrderStatusDto.orderStatus;

      if (updateOrderStatusDto.trackingNumber) {
        order.trackingNumber = updateOrderStatusDto.trackingNumber;
      }

      if (updateOrderStatusDto.rejectedReason) {
        order.rejectedReason = updateOrderStatusDto.rejectedReason;
      }

      if (updateOrderStatusDto.orderStatus === OrderStatus.DELIVERED) {
        order.deliveredAt = now();
      }

      const updatedOrder = await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();

      // Fetch updated order with relations
      const finalOrder = await this.orderRepository.findOne({
        where: { id: orderId },
        relations: ['card'],
      });

      return this.toResponseDto(finalOrder);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async assignRfid(orderId: string, assignRfidDto: AssignRfidDto): Promise<OrderResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Check if RFID already exists
      const existingOrder = await queryRunner.manager.findOne(UserIdCardOrder, {
        where: { rfidNumber: assignRfidDto.rfidNumber },
      });

      if (existingOrder) {
        throw new ConflictException('RFID number already assigned to another order');
      }

      // Get the order
      const order = await queryRunner.manager.findOne(UserIdCardOrder, {
        where: { id: orderId },
        relations: ['user'],
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      // Assign RFID to order
      order.rfidNumber = assignRfidDto.rfidNumber;
      
      // Activate the card (change status from INACTIVE to ACTIVE)
      if (order.status === CardStatus.INACTIVE) {
        order.status = CardStatus.ACTIVE;
        order.activatedAt = now();
      }
      
      await queryRunner.manager.save(order);

      // Auto-update user's rfid column when card becomes ACTIVE
      const user = await queryRunner.manager.findOne(UserEntity, {
        where: { id: order.userId },
      });

      if (user) {
        user.rfid = assignRfidDto.rfidNumber;
        await queryRunner.manager.save(user);
      }

      await queryRunner.commitTransaction();

      // Fetch updated order with relations
      const updatedOrder = await this.orderRepository.findOne({
        where: { id: orderId },
        relations: ['card', 'user'],
      });

      return this.toResponseDto(updatedOrder);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateCardStatusByAdmin(
    orderId: string,
    updateCardStatusDto: UpdateCardStatusDto,
  ): Promise<OrderResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await queryRunner.manager.findOne(UserIdCardOrder, {
        where: { id: orderId },
        relations: ['card'],
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const previousStatus = order.status;
      order.status = updateCardStatusDto.status;

      // Handle status changes
      if (updateCardStatusDto.status === CardStatus.ACTIVE) {
        // Activating card - update user.rfid if RFID is assigned
        order.activatedAt = now();
        
        if (order.rfidNumber) {
          const user = await queryRunner.manager.findOne(UserEntity, {
            where: { id: order.userId },
          });

          if (user) {
            user.rfid = order.rfidNumber;
            await queryRunner.manager.save(user);
          }
        }
      } else {
        // Deactivating card (LOST, DAMAGED, DEACTIVATED, REPLACED, etc.)
        order.deactivatedAt = now();
        
        // Remove user.rfid if this card's RFID is currently in user table
        if (order.rfidNumber) {
          const user = await queryRunner.manager.findOne(UserEntity, {
            where: { id: order.userId, rfid: order.rfidNumber },
          });

          if (user) {
            user.rfid = null;
            await queryRunner.manager.save(user);
          }
        }
      }

      const updatedOrder = await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();

      return this.toResponseDto(updatedOrder);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async activateMyCard(userId: string, orderId: string): Promise<OrderResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get the card order to activate
      const order = await queryRunner.manager.findOne(UserIdCardOrder, {
        where: { id: orderId, userId },
        relations: ['card'],
      });

      if (!order) {
        throw new NotFoundException('Card order not found or does not belong to you');
      }

      // Check if card can be activated by user
      if (order.status === CardStatus.REPLACED) {
        throw new BadRequestException('Card has been replaced and cannot be activated');
      }

      if (order.status !== CardStatus.INACTIVE) {
        throw new BadRequestException(`Card is already ${order.status.toLowerCase()}`);
      }

      if (!order.rfidNumber) {
        throw new BadRequestException('Card does not have an RFID assigned yet. Please contact admin.');
      }

      if (order.orderStatus !== OrderStatus.DELIVERED) {
        throw new BadRequestException('Card must be delivered before activation');
      }

      // Get current user
      const user = await queryRunner.manager.findOne(UserEntity, {
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check if user has an existing active RFID
      if (user.rfid) {
        // Find the old card order
        const oldCardOrder = await queryRunner.manager.findOne(UserIdCardOrder, {
          where: { userId, rfidNumber: user.rfid },
          relations: ['card'],
        });

        if (oldCardOrder) {
          // Check if old card is TEMPORARY type
          if (oldCardOrder.card.cardType === 'TEMPORARY') {
            // For TEMPORARY cards, just replace the RFID (no status change needed)
            // The temporary card stays as-is, we just update user.rfid to new card
          } else {
            // For NFC/PVC cards, mark old card as REPLACED
            oldCardOrder.status = CardStatus.REPLACED;
            oldCardOrder.deactivatedAt = now();
            await queryRunner.manager.save(oldCardOrder);
          }
        }
      }

      // Activate the new card
      order.status = CardStatus.ACTIVE;
      order.activatedAt = now();
      await queryRunner.manager.save(order);

      // Update user.rfid to new card's RFID
      user.rfid = order.rfidNumber;
      await queryRunner.manager.save(user);

      await queryRunner.commitTransaction();

      // Fetch updated order with relations
      const updatedOrder = await this.orderRepository.findOne({
        where: { id: orderId },
        relations: ['card'],
      });

      return this.toResponseDto(updatedOrder);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getStatistics(dateFrom?: Date, dateTo?: Date): Promise<any> {
    const query = this.orderRepository.createQueryBuilder('order');

    if (dateFrom) {
      query.andWhere('order.orderDate >= :dateFrom', { dateFrom });
    }

    if (dateTo) {
      query.andWhere('order.orderDate <= :dateTo', { dateTo });
    }

    const orders = await query.getMany();

    const totalOrders = orders.length;
    const statusBreakdown = orders.reduce((acc, order) => {
      acc[order.orderStatus] = (acc[order.orderStatus] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const cardTypeBreakdown = orders.reduce((acc, order) => {
      acc[order.cardType] = (acc[order.cardType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalOrders,
      statusBreakdown,
      cardTypeBreakdown,
      dateRange: { from: dateFrom, to: dateTo },
    };
  }

  private toResponseDto(order: UserIdCardOrder): OrderResponseDto {
    return {
      id: order.id,
      userId: order.userId,
      cardId: order.cardId,
      cardType: order.cardType,
      paymentId: order.paymentId || undefined,
      cardExpiryDate: order.cardExpiryDate,
      status: order.status,
      orderStatus: order.orderStatus,
      rejectedReason: order.rejectedReason || undefined,
      orderDate: order.orderDate,
      deliveryAddress: order.deliveryAddress,
      contactPhone: order.contactPhone,
      notes: order.notes || undefined,
      trackingNumber: order.trackingNumber || undefined,
      rfidNumber: order.rfidNumber || undefined,
      deliveredAt: order.deliveredAt || undefined,
      activatedAt: order.activatedAt || undefined,
      deactivatedAt: order.deactivatedAt || undefined,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      card: order.card,
      user: order.user,
      payments: order.payments,
    };
  }
}
