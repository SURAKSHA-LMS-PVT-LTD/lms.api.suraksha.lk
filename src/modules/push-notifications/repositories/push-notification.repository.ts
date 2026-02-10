import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In } from 'typeorm';
import { PushNotificationEntity, NotificationScope, NotificationStatus } from '../entities/push-notification.entity';
import { NotificationReadEntity } from '../entities/notification-read.entity';
import { CreatePushNotificationDto } from '../dto/create-push-notification.dto';
import { QueryPushNotificationDto, QueryUserNotificationsDto } from '../dto/query-push-notification.dto';
import { now } from '../../../common/utils/timezone.util';

@Injectable()
export class PushNotificationRepository {
  constructor(
    @InjectRepository(PushNotificationEntity)
    private readonly repository: Repository<PushNotificationEntity>,
    @InjectRepository(NotificationReadEntity)
    private readonly readRepository: Repository<NotificationReadEntity>,
  ) {}

  /**
   * Create a new push notification
   */
  async create(createDto: CreatePushNotificationDto, senderId: string, senderRole: string): Promise<PushNotificationEntity> {
    const timestamp = now();
    const notification = this.repository.create({
      ...createDto,
      senderId,
      senderRole,
      status: createDto.scheduledAt ? NotificationStatus.SCHEDULED : NotificationStatus.DRAFT,
      scheduledAt: createDto.scheduledAt ? new Date(createDto.scheduledAt) : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return await this.repository.save(notification);
  }

  /**
   * Find all notifications with filters (admin)
   */
  async findAll(queryDto: QueryPushNotificationDto): Promise<{ data: PushNotificationEntity[]; total: number }> {
    const queryBuilder = this.buildAdminQueryBuilder(queryDto);
    
    const total = await queryBuilder.getCount();
    
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC' } = queryDto;
    const skip = (page - 1) * limit;
    
    queryBuilder
      .orderBy(`notification.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    const data = await queryBuilder.getMany();
    
    return { data, total };
  }

  /**
   * Find notifications for a specific institute (user view)
   * Includes all notifications for that institute (institute-wide, class, subject level)
   */
  async findByInstituteId(
    instituteId: string,
    queryDto: QueryUserNotificationsDto,
    userId: string
  ): Promise<{ data: PushNotificationEntity[]; total: number; unreadCount: number }> {
    const queryBuilder = this.repository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.institute', 'institute')
      .leftJoinAndSelect('notification.class', 'class')
      .leftJoinAndSelect('notification.subject', 'subject')
      .where('notification.instituteId = :instituteId', { instituteId })
      .andWhere('notification.status = :status', { status: NotificationStatus.SENT });

    if (queryDto.search) {
      queryBuilder.andWhere(
        '(notification.title LIKE :search OR notification.body LIKE :search)',
        { search: `%${queryDto.search}%` }
      );
    }

    const total = await queryBuilder.getCount();

    const { page = 1, limit = 20 } = queryDto;
    const skip = (page - 1) * limit;

    queryBuilder
      .orderBy('notification.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const data = await queryBuilder.getMany();

    // Get unread count for this user
    const unreadCount = await this.getUnreadCount(userId, instituteId);

    return { data, total, unreadCount };
  }

  /**
   * Find global/system notifications only (no institute-specific)
   */
  async findSystemNotifications(
    queryDto: QueryUserNotificationsDto,
    userId: string
  ): Promise<{ data: PushNotificationEntity[]; total: number; unreadCount: number }> {
    const queryBuilder = this.repository
      .createQueryBuilder('notification')
      .where('notification.scope = :scope', { scope: NotificationScope.GLOBAL })
      .andWhere('notification.status = :status', { status: NotificationStatus.SENT });

    if (queryDto.search) {
      queryBuilder.andWhere(
        '(notification.title LIKE :search OR notification.body LIKE :search)',
        { search: `%${queryDto.search}%` }
      );
    }

    const total = await queryBuilder.getCount();

    const { page = 1, limit = 20 } = queryDto;
    const skip = (page - 1) * limit;

    queryBuilder
      .orderBy('notification.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const data = await queryBuilder.getMany();

    // Get unread count for global notifications
    const unreadCount = await this.getUnreadCountGlobal(userId);

    return { data, total, unreadCount };
  }

  /**
   * Find notification by ID
   */
  async findOne(id: string): Promise<PushNotificationEntity | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['institute', 'class', 'subject', 'sender']
    });
  }

  /**
   * Update notification
   */
  async update(id: string, updateData: Partial<PushNotificationEntity>): Promise<PushNotificationEntity | null> {
    await this.repository.update(id, {
      ...updateData,
      updatedAt: now()
    });
    return await this.findOne(id);
  }

  /**
   * Update notification status
   */
  async updateStatus(id: string, status: NotificationStatus): Promise<void> {
    const updateData: Partial<PushNotificationEntity> = {
      status,
      updatedAt: now()
    };
    
    if (status === NotificationStatus.SENT) {
      updateData.sentAt = now();
    }

    await this.repository.update(id, updateData);
  }

  /**
   * Update notification statistics
   */
  async updateStats(id: string, stats: { totalRecipients?: number; sentCount?: number; failedCount?: number }): Promise<void> {
    await this.repository.update(id, {
      ...stats,
      updatedAt: now()
    });
  }

  /**
   * Delete notification
   */
  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  /**
   * Mark notification as read for a user
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const existing = await this.readRepository.findOne({
      where: { userId, notificationId }
    });

    if (!existing) {
      const read = this.readRepository.create({
        userId,
        notificationId,
        readAt: now()
      });
      await this.readRepository.save(read);

      // Increment read count on notification
      await this.repository.increment({ id: notificationId }, 'readCount', 1);
    }
  }

  /**
   * Mark multiple notifications as read for a user
   */
  async markMultipleAsRead(userId: string, notificationIds: string[]): Promise<void> {
    const timestamp = now();
    
    for (const notificationId of notificationIds) {
      const existing = await this.readRepository.findOne({
        where: { userId, notificationId }
      });

      if (!existing) {
        const read = this.readRepository.create({
          userId,
          notificationId,
          readAt: timestamp
        });
        await this.readRepository.save(read);
        await this.repository.increment({ id: notificationId }, 'readCount', 1);
      }
    }
  }

  /**
   * Get read notification IDs for a user
   */
  async getReadNotificationIds(userId: string, notificationIds: string[]): Promise<Set<string>> {
    if (notificationIds.length === 0) return new Set();

    const reads = await this.readRepository.find({
      where: {
        userId,
        notificationId: In(notificationIds)
      },
      select: ['notificationId']
    });

    return new Set(reads.map(r => r.notificationId));
  }

  /**
   * Get unread count for institute notifications
   */
  async getUnreadCount(userId: string, instituteId: string): Promise<number> {
    const totalQuery = this.repository
      .createQueryBuilder('notification')
      .where('notification.instituteId = :instituteId', { instituteId })
      .andWhere('notification.status = :status', { status: NotificationStatus.SENT });

    const totalNotifications = await totalQuery.getCount();

    const readCount = await this.readRepository
      .createQueryBuilder('read')
      .innerJoin(PushNotificationEntity, 'notification', 'notification.id = read.notificationId')
      .where('read.userId = :userId', { userId })
      .andWhere('notification.instituteId = :instituteId', { instituteId })
      .andWhere('notification.status = :status', { status: NotificationStatus.SENT })
      .getCount();

    return totalNotifications - readCount;
  }

  /**
   * Get unread count for global notifications
   */
  async getUnreadCountGlobal(userId: string): Promise<number> {
    const totalQuery = this.repository
      .createQueryBuilder('notification')
      .where('notification.scope = :scope', { scope: NotificationScope.GLOBAL })
      .andWhere('notification.status = :status', { status: NotificationStatus.SENT });

    const totalNotifications = await totalQuery.getCount();

    const readCount = await this.readRepository
      .createQueryBuilder('read')
      .innerJoin(PushNotificationEntity, 'notification', 'notification.id = read.notificationId')
      .where('read.userId = :userId', { userId })
      .andWhere('notification.scope = :scope', { scope: NotificationScope.GLOBAL })
      .andWhere('notification.status = :status', { status: NotificationStatus.SENT })
      .getCount();

    return totalNotifications - readCount;
  }

  /**
   * Find scheduled notifications that are due
   */
  async findDueScheduledNotifications(): Promise<PushNotificationEntity[]> {
    return await this.repository.find({
      where: {
        status: NotificationStatus.SCHEDULED
      },
      relations: ['institute', 'class', 'subject']
    });
  }

  /**
   * Build query builder for admin queries
   */
  private buildAdminQueryBuilder(queryDto: QueryPushNotificationDto): SelectQueryBuilder<PushNotificationEntity> {
    const queryBuilder = this.repository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.institute', 'institute')
      .leftJoinAndSelect('notification.class', 'class')
      .leftJoinAndSelect('notification.subject', 'subject')
      .leftJoinAndSelect('notification.sender', 'sender');

    if (queryDto.instituteId) {
      queryBuilder.andWhere('notification.instituteId = :instituteId', { instituteId: queryDto.instituteId });
    }

    if (queryDto.classId) {
      queryBuilder.andWhere('notification.classId = :classId', { classId: queryDto.classId });
    }

    if (queryDto.subjectId) {
      queryBuilder.andWhere('notification.subjectId = :subjectId', { subjectId: queryDto.subjectId });
    }

    if (queryDto.scope) {
      queryBuilder.andWhere('notification.scope = :scope', { scope: queryDto.scope });
    }

    if (queryDto.status) {
      queryBuilder.andWhere('notification.status = :status', { status: queryDto.status });
    }

    if (queryDto.priority) {
      queryBuilder.andWhere('notification.priority = :priority', { priority: queryDto.priority });
    }

    if (queryDto.senderId) {
      queryBuilder.andWhere('notification.senderId = :senderId', { senderId: queryDto.senderId });
    }

    if (queryDto.search) {
      queryBuilder.andWhere(
        '(notification.title LIKE :search OR notification.body LIKE :search)',
        { search: `%${queryDto.search}%` }
      );
    }

    if (queryDto.dateFrom) {
      queryBuilder.andWhere('notification.createdAt >= :dateFrom', { dateFrom: new Date(queryDto.dateFrom) });
    }

    if (queryDto.dateTo) {
      queryBuilder.andWhere('notification.createdAt <= :dateTo', { dateTo: new Date(queryDto.dateTo) });
    }

    return queryBuilder;
  }
}
