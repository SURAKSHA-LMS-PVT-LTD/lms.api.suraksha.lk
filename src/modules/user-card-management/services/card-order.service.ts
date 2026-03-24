import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { UserIdCardOrder } from '../entities/user-id-card-order.entity';
import { Card } from '../entities/card.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { UserImageEntity, ImageScope } from '../../user/entities/user-image.entity';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { UpdateCardStatusDto } from '../dto/update-card-status.dto';
import { AssignRfidDto } from '../dto/assign-rfid.dto';
import { OrderResponseDto, PaginatedOrdersResponseDto } from '../dto/response/order-response.dto';
import { OrderStatus } from '../enums/order-status.enum';
import { CardStatus } from '../enums/card-status.enum';
import { CardType } from '../enums/card-type.enum';
import { now } from '../../../common/utils/timezone.util';
import { ImageVerificationStatus } from '../../institute_mudules/institue_user/enums/image-verification-status.enum';
import { StudentEntity } from '../../student/entities/student.entity';
import { CardDeliveryRecipient } from '../enums/card-delivery-recipient.enum';

@Injectable()
export class CardOrderService {
  constructor(
    @InjectRepository(UserIdCardOrder)
    private readonly orderRepository: Repository<UserIdCardOrder>,
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserImageEntity)
    private readonly userImageRepository: Repository<UserImageEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // Valid card status transitions that a USER can perform
  private readonly ALLOWED_USER_STATUS_TRANSITIONS: Record<string, CardStatus[]> = {
    [CardStatus.ACTIVE]: [CardStatus.DEACTIVATED, CardStatus.LOST, CardStatus.DAMAGED],
    [CardStatus.DEACTIVATED]: [CardStatus.ACTIVE],
  };

  async createOrder(userId: string, createOrderDto: CreateOrderDto): Promise<OrderResponseDto> {
    // ── Image verification gate ──────────────────────────────────────────────
    // A verified profile image is required before a physical ID card can be ordered.
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'imageUrl', 'imageVerificationStatus'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check for a verified image: either the user.imageUrl is set (VERIFIED global)
    // or at least one user_images record is VERIFIED.
    const hasVerifiedImage =
      user.imageUrl && user.imageVerificationStatus === ImageVerificationStatus.VERIFIED;

    if (!hasVerifiedImage) {
      // Allow if any verified image exists in user_images table
      const verifiedImage = await this.userImageRepository.findOne({
        where: { userId, status: ImageVerificationStatus.VERIFIED },
      });
      if (!verifiedImage) {
        throw new BadRequestException(
          'A verified profile image is required before ordering an ID card. ' +
          'Please upload an image and wait for system admin approval.',
        );
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Find the card (lock row for stock decrement)
      const card = await queryRunner.manager
        .createQueryBuilder(Card, 'card')
        .setLock('pessimistic_write')
        .where('card.id = :id AND card.isActive = true', { id: createOrderDto.cardId })
        .getOne();

      if (!card) {
        
        throw new NotFoundException('Card not found or not available');
      }

      if (card.quantityAvailable <= 0) {
        throw new BadRequestException('Card is out of stock');
      }

      // Check if user already has a pending order for this card (prevent duplicates)
      const existingPendingOrder = await queryRunner.manager.findOne(UserIdCardOrder, {
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

      // Decrement stock
      card.quantityAvailable -= 1;
      await queryRunner.manager.save(card);

      // Calculate expiry date using Sri Lanka timezone
      const expiryDate = now();
      expiryDate.setDate(expiryDate.getDate() + card.validityDays);

      // Auto-populate delivery address/phone from parent if deliveryRecipientType specified
      let deliveryAddress = createOrderDto.deliveryAddress;
      let contactPhone = createOrderDto.contactPhone;

      if (createOrderDto.deliveryRecipientType && createOrderDto.deliveryRecipientType !== CardDeliveryRecipient.SELF) {
        const student = await queryRunner.manager.findOne(StudentEntity, {
          where: { userId, isActive: true },
        });

        if (student) {
          let parentUserId: string | undefined;
          if (createOrderDto.deliveryRecipientType === CardDeliveryRecipient.FATHER) {
            parentUserId = student.fatherId;
          } else if (createOrderDto.deliveryRecipientType === CardDeliveryRecipient.MOTHER) {
            parentUserId = student.motherId;
          } else if (createOrderDto.deliveryRecipientType === CardDeliveryRecipient.GUARDIAN) {
            parentUserId = student.guardianId;
          }

          if (parentUserId) {
            const parentUser = await queryRunner.manager.findOne(UserEntity, {
              where: { id: parentUserId, isActive: true },
              select: ['id', 'phoneNumber', 'addressLine1', 'addressLine2', 'city', 'district', 'province', 'postalCode'],
            });

            if (parentUser) {
              if (!deliveryAddress) {
                const addrParts = [parentUser.addressLine1, parentUser.addressLine2, parentUser.city, parentUser.district, parentUser.province, parentUser.postalCode].filter(Boolean);
                deliveryAddress = addrParts.join(', ') || undefined;
              }
              if (!contactPhone && parentUser.phoneNumber) {
                contactPhone = parentUser.phoneNumber;
              }
            }
          }
        }
      }

      // Ensure delivery address and contact phone are provided
      if (!deliveryAddress || !contactPhone) {
        throw new BadRequestException('Delivery address and contact phone are required. Please provide them or select a delivery recipient with valid address.');
      }

      // Create order
      const timestamp = now();
      const order = queryRunner.manager.create(UserIdCardOrder, {
        userId,
        cardId: card.id,
        cardType: card.cardType,
        cardExpiryDate: expiryDate,
        deliveryAddress,
        contactPhone,
        notes: createOrderDto.notes,
        status: CardStatus.INACTIVE,
        orderDate: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        orderStatus: OrderStatus.PENDING_PAYMENT,
      });

      const savedOrder = await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();

      // Populate relations after commit
      const populatedOrder = await this.orderRepository.findOne({
        where: { id: savedOrder.id },
        relations: ['card', 'user'],
      });

      return this.toResponseDto(populatedOrder);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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

    // Validate status transition for user-facing changes
    const allowedTransitions = this.ALLOWED_USER_STATUS_TRANSITIONS[order.status];
    if (!allowedTransitions || !allowedTransitions.includes(updateCardStatusDto.status)) {
      throw new BadRequestException(
        `Cannot change card status from ${order.status} to ${updateCardStatusDto.status}. ` +
        `Allowed transitions: ${allowedTransitions?.join(', ') || 'none'}`,
      );
    }

    // Update status
    order.status = updateCardStatusDto.status;
    order.updatedAt = now();

    if (updateCardStatusDto.status === CardStatus.ACTIVE && !order.activatedAt) {
      order.activatedAt = now();
    }

    if (updateCardStatusDto.status === CardStatus.DEACTIVATED && !order.deactivatedAt) {
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
      order.updatedAt = now();

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
      order.updatedAt = now();
      
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
        // ✅ Sync RFID card status & expiry to user entity
        user.rfidCardStatus = CardStatus.ACTIVE;
        user.rfidExpiryDate = order.cardExpiryDate;
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
      order.updatedAt = now();

      // Handle status changes
      if (updateCardStatusDto.status === CardStatus.ACTIVE) {
        // Activating card - update user.rfid if RFID is assigned
        order.activatedAt = now();
        
        if (order.rfidNumber) {
          const user = await queryRunner.manager.findOne(UserEntity, {
            where: { id: order.userId },
          });

          if (user) {
            // ✅ Sync based on card type: NFC → rfid fields, PVC/TEMPORARY → normal card fields
            if (order.cardType === CardType.NFC) {
              user.rfid = order.rfidNumber;
              user.rfidCardStatus = CardStatus.ACTIVE;
              user.rfidExpiryDate = order.cardExpiryDate;
            } else {
              // PVC or TEMPORARY → normal card
              user.cardId = order.rfidNumber;
              user.cardStatus = CardStatus.ACTIVE;
              user.cardExpiryDate = order.cardExpiryDate;
            }
            await queryRunner.manager.save(user);
          }
        }
      } else {
        // Deactivating card (LOST, DAMAGED, DEACTIVATED, REPLACED, etc.)
        order.deactivatedAt = now();
        
        // Remove user card fields if this card's RFID is currently in user table
        if (order.rfidNumber) {
          const user = await queryRunner.manager.findOne(UserEntity, {
            where: { id: order.userId },
          });

          if (user) {
            // ✅ Clear based on card type - independent deactivation
            if (order.cardType === CardType.NFC && user.rfid === order.rfidNumber) {
              user.rfid = null;
              user.rfidCardStatus = updateCardStatusDto.status;
              await queryRunner.manager.save(user);
            } else if (order.cardType !== CardType.NFC && user.cardId === order.rfidNumber) {
              user.cardId = null;
              user.cardStatus = updateCardStatusDto.status;
              await queryRunner.manager.save(user);
            }
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

      // ✅ Also handle old normal card replacement if new card is PVC/TEMPORARY
      if (order.cardType !== CardType.NFC && user.cardId) {
        const oldNormalCardOrder = await queryRunner.manager.findOne(UserIdCardOrder, {
          where: { userId, rfidNumber: user.cardId, status: CardStatus.ACTIVE },
        });
        if (oldNormalCardOrder && oldNormalCardOrder.id !== orderId) {
          oldNormalCardOrder.status = CardStatus.REPLACED;
          oldNormalCardOrder.deactivatedAt = now();
          await queryRunner.manager.save(oldNormalCardOrder);
        }
      }

      // Activate the new card
      order.status = CardStatus.ACTIVE;
      order.activatedAt = now();
      order.updatedAt = now();
      await queryRunner.manager.save(order);

      // ✅ Update user fields based on card type (NFC → rfid fields, PVC/TEMPORARY → normal card fields)
      if (order.cardType === CardType.NFC) {
        user.rfid = order.rfidNumber;
        user.rfidCardStatus = CardStatus.ACTIVE;
        user.rfidExpiryDate = order.cardExpiryDate;
      } else {
        // PVC or TEMPORARY → normal card fields
        user.cardId = order.rfidNumber;
        user.cardStatus = CardStatus.ACTIVE;
        user.cardExpiryDate = order.cardExpiryDate;
      }
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

  /**
   * Cancel a card order.
   *
   * Rules:
   * - Only the owning user may cancel.
   * - Only orders in PENDING_PAYMENT status can be cancelled (no payment submitted yet).
   * - Stock is restored atomically inside a transaction.
   */
  async cancelOrder(orderId: string, userId: string): Promise<OrderResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the order row to prevent concurrent modifications
      const order = await queryRunner.manager
        .createQueryBuilder(UserIdCardOrder, 'order')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('order.card', 'card')
        .where('order.id = :orderId AND order.userId = :userId', { orderId, userId })
        .getOne();

      if (!order) {
        throw new NotFoundException('Order not found or does not belong to you');
      }

      if (order.orderStatus !== OrderStatus.PENDING_PAYMENT) {
        throw new BadRequestException(
          `Only orders in PENDING_PAYMENT status can be cancelled. Current status: ${order.orderStatus}`,
        );
      }

      // Restore stock
      const card = await queryRunner.manager
        .createQueryBuilder(Card, 'card')
        .setLock('pessimistic_write')
        .where('card.id = :id', { id: order.cardId })
        .getOne();

      if (card) {
        card.quantityAvailable += 1;
        await queryRunner.manager.save(card);
      }

      // Cancel the order
      order.orderStatus = OrderStatus.CANCELLED;
      order.updatedAt = now();
      await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();

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

  async getStatistics(dateFrom?: Date, dateTo?: Date): Promise<any> {
    // Use SQL aggregation instead of loading all orders into memory
    const baseQuery = this.orderRepository.createQueryBuilder('order');

    if (dateFrom) {
      baseQuery.andWhere('order.orderDate >= :dateFrom', { dateFrom });
    }

    if (dateTo) {
      baseQuery.andWhere('order.orderDate <= :dateTo', { dateTo });
    }

    // Total count
    const totalOrders = await baseQuery.getCount();

    // Status breakdown via SQL GROUP BY
    const statusBreakdownRaw = await baseQuery
      .clone()
      .select('order.orderStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('order.orderStatus')
      .getRawMany();

    const statusBreakdown = statusBreakdownRaw.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {} as Record<string, number>);

    // Card type breakdown via SQL GROUP BY
    const cardTypeBreakdownRaw = await baseQuery
      .clone()
      .select('order.cardType', 'cardType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('order.cardType')
      .getRawMany();

    const cardTypeBreakdown = cardTypeBreakdownRaw.reduce((acc, row) => {
      acc[row.cardType] = parseInt(row.count, 10);
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
