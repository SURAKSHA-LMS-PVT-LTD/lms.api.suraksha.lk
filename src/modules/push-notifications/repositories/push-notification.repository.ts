import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In, DataSource } from 'typeorm';
import { PushNotificationEntity, NotificationScope, NotificationStatus } from '../entities/push-notification.entity';
import { NotificationReadEntity } from '../entities/notification-read.entity';
import { NotificationRecipientEntity, NotificationDeliveryStatus } from '../entities/notification-recipient.entity';
import { CreatePushNotificationDto } from '../dto/create-push-notification.dto';
import { QueryPushNotificationDto, QueryUserNotificationsDto } from '../dto/query-push-notification.dto';
import { now } from '../../../common/utils/timezone.util';

@Injectable()
export class PushNotificationRepository {
  private readonly logger = new Logger(PushNotificationRepository.name);

  constructor(
    @InjectRepository(PushNotificationEntity)
    private readonly repository: Repository<PushNotificationEntity>,
    @InjectRepository(NotificationReadEntity)
    private readonly readRepository: Repository<NotificationReadEntity>,
    @InjectRepository(NotificationRecipientEntity)
    private readonly recipientRepository: Repository<NotificationRecipientEntity>,
    private readonly dataSource: DataSource,
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
   * FIXED: Only returns notifications that were actually sent to this user
   * via the notification_recipients table — prevents new members from seeing old announcements.
   */
  async findByInstituteId(
    instituteId: string,
    queryDto: QueryUserNotificationsDto,
    userId: string
  ): Promise<{ data: PushNotificationEntity[]; total: number; unreadCount: number }> {
    const queryBuilder = this.repository
      .createQueryBuilder('notification')
      .select([
        'notification.id',
        'notification.title',
        'notification.body',
        'notification.imageUrl',
        'notification.icon',
        'notification.actionUrl',
        'notification.dataPayload',
        'notification.scope',
        'notification.priority',
        'notification.senderRole',
        'notification.sentAt',
        'notification.createdAt',
        'notification.updatedAt'
      ])
      .innerJoin(
        NotificationRecipientEntity,
        'recipient',
        'recipient.notificationId = notification.id AND recipient.userId = :userId',
        { userId }
      )
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
   * Find global/system notifications only — filtered by recipient table
   */
  async findSystemNotifications(
    queryDto: QueryUserNotificationsDto,
    userId: string
  ): Promise<{ data: PushNotificationEntity[]; total: number; unreadCount: number }> {
    const queryBuilder = this.repository
      .createQueryBuilder('notification')
      .select([
        'notification.id',
        'notification.title',
        'notification.body',
        'notification.imageUrl',
        'notification.icon',
        'notification.actionUrl',
        'notification.dataPayload',
        'notification.scope',
        'notification.priority',
        'notification.senderRole',
        'notification.sentAt',
        'notification.createdAt',
        'notification.updatedAt'
      ])
      .innerJoin(
        NotificationRecipientEntity,
        'recipient',
        'recipient.notificationId = notification.id AND recipient.userId = :userId',
        { userId }
      )
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
   * Mark notification(s) as DELIVERED for a user (app received the push)
   */
  async markDelivered(userId: string, notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;

    const timestamp = now();

    await this.recipientRepository
      .createQueryBuilder()
      .update(NotificationRecipientEntity)
      .set({ status: NotificationDeliveryStatus.DELIVERED, updatedAt: timestamp })
      .where('userId = :userId', { userId })
      .andWhere('notificationId IN (:...notificationIds)', { notificationIds })
      .andWhere('status = :sentStatus', { sentStatus: NotificationDeliveryStatus.SENT })
      .execute();
  }

  /**
   * Mark notification as read for a user — updates recipient row + legacy reads table
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const timestamp = now();

    // Update recipient row status to READ
    await this.recipientRepository
      .createQueryBuilder()
      .update(NotificationRecipientEntity)
      .set({ status: NotificationDeliveryStatus.READ, readAt: timestamp, updatedAt: timestamp })
      .where('notificationId = :notificationId AND userId = :userId', { notificationId, userId })
      .execute();

    // Also keep legacy notification_reads in sync for backward compatibility
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

      // Increment read count on notification
      await this.repository.increment({ id: notificationId }, 'readCount', 1);
    }
  }

  /**
   * Mark multiple notifications as read for a user
   */
  async markMultipleAsRead(userId: string, notificationIds: string[]): Promise<void> {
    if (notificationIds.length === 0) return;
    const timestamp = now();
    
    // Batch update recipient rows
    await this.recipientRepository
      .createQueryBuilder()
      .update(NotificationRecipientEntity)
      .set({ status: NotificationDeliveryStatus.READ, readAt: timestamp, updatedAt: timestamp })
      .where('userId = :userId AND notificationId IN (:...notificationIds)', { userId, notificationIds })
      .andWhere('status != :readStatus', { readStatus: NotificationDeliveryStatus.READ })
      .execute();

    // Legacy: sync notification_reads
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
   * Get read notification info for a user — returns Map<notificationId, readAt>
   */
  async getReadNotificationIds(userId: string, notificationIds: string[]): Promise<Map<string, Date | null>> {
    if (notificationIds.length === 0) return new Map();

    const reads = await this.recipientRepository.find({
      where: {
        userId,
        notificationId: In(notificationIds),
        status: NotificationDeliveryStatus.READ,
      },
      select: ['notificationId', 'readAt']
    });

    return new Map(reads.map(r => [r.notificationId, r.readAt ?? null]));
  }

  /**
   * Mark ALL unread notifications as READ for a user in a given institute.
   * Single UPDATE query — much more efficient than fetch-then-bulk-update.
   */
  async markAllAsReadForInstitute(userId: string, instituteId: string): Promise<number> {
    const timestamp = now();
    const result = await this.dataSource.query(
      `UPDATE notification_recipients nr
       INNER JOIN push_notifications n ON n.id = nr.notification_id
       SET nr.status = 'READ', nr.read_at = ?, nr.updated_at = ?
       WHERE nr.user_id = ?
         AND nr.status != 'READ'
         AND n.institute_id = ?
         AND n.status = 'SENT'`,
      [timestamp, timestamp, userId, instituteId],
    );
    return result?.affectedRows ?? 0;
  }

  /**
   * Mark ALL unread notifications as READ for a user across all scopes.
   */
  async markAllAsReadForUser(userId: string): Promise<number> {
    const timestamp = now();
    const result = await this.dataSource.query(
      `UPDATE notification_recipients nr
       INNER JOIN push_notifications n ON n.id = nr.notification_id
       SET nr.status = 'READ', nr.read_at = ?, nr.updated_at = ?
       WHERE nr.user_id = ?
         AND nr.status != 'READ'
         AND n.status = 'SENT'`,
      [timestamp, timestamp, userId],
    );
    return result?.affectedRows ?? 0;
  }

  /**
   * Get ALL notifications for a user across every scope and every institute.
   * Uses INNER JOIN on notification_recipients so only notifications actually
   * sent to this user are returned (prevents showing old/unrelated notifications).
   */
  async findAllForUser(
    userId: string,
    queryDto: QueryUserNotificationsDto,
  ): Promise<{ data: PushNotificationEntity[]; total: number; unreadCount: number }> {
    const qb = this.repository
      .createQueryBuilder('notification')
      .select([
        'notification.id',
        'notification.title',
        'notification.body',
        'notification.imageUrl',
        'notification.icon',
        'notification.actionUrl',
        'notification.dataPayload',
        'notification.scope',
        'notification.priority',
        'notification.senderRole',
        'notification.instituteId',
        'notification.classId',
        'notification.subjectId',
        'notification.sentAt',
        'notification.createdAt',
        'notification.updatedAt',
      ])
      .innerJoin(
        NotificationRecipientEntity,
        'recipient',
        'recipient.notificationId = notification.id AND recipient.userId = :userId',
        { userId },
      )
      .leftJoinAndSelect('notification.institute', 'institute')
      .leftJoinAndSelect('notification.class', 'class')
      .leftJoinAndSelect('notification.subject', 'subject')
      .where('notification.status = :status', { status: NotificationStatus.SENT });

    // Optional scope filter (e.g. GLOBAL only, or INSTITUTE only)
    if (queryDto.scope) {
      qb.andWhere('notification.scope = :scope', { scope: queryDto.scope });
    }

    // Optional institute filter
    if (queryDto.instituteId) {
      qb.andWhere('notification.instituteId = :instituteId', { instituteId: queryDto.instituteId });
    }

    // Optional read/unread filter
    if (queryDto.isRead === true) {
      qb.andWhere('recipient.status = :readStatus', { readStatus: NotificationDeliveryStatus.READ });
    } else if (queryDto.isRead === false) {
      qb.andWhere('recipient.status != :readStatus', { readStatus: NotificationDeliveryStatus.READ });
    }

    // Optional search
    if (queryDto.search) {
      qb.andWhere(
        '(notification.title LIKE :search OR notification.body LIKE :search)',
        { search: `%${queryDto.search}%` },
      );
    }

    const total = await qb.getCount();
    const unreadCount = await this.getUnreadCountAll(userId);

    const { page = 1, limit = 20 } = queryDto;
    qb.orderBy('notification.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const data = await qb.getMany();

    return { data, total, unreadCount };
  }

  /**
   * Total unread count across ALL scopes for a user (global badge count).
   */
  async getUnreadCountAll(userId: string): Promise<number> {
    return await this.recipientRepository
      .createQueryBuilder('r')
      .innerJoin(PushNotificationEntity, 'n', 'n.id = r.notificationId')
      .where('r.userId = :userId', { userId })
      .andWhere('r.status != :readStatus', { readStatus: NotificationDeliveryStatus.READ })
      .andWhere('n.status = :sentStatus', { sentStatus: NotificationStatus.SENT })
      .getCount();
  }

  /**
   * Get unread count for institute notifications — from recipient table
   * Only counts notifications this user was actually sent (not old ones before they joined)
   */
  async getUnreadCount(userId: string, instituteId: string): Promise<number> {
    const count = await this.recipientRepository
      .createQueryBuilder('r')
      .innerJoin(PushNotificationEntity, 'n', 'n.id = r.notificationId')
      .where('r.userId = :userId', { userId })
      .andWhere('r.status != :readStatus', { readStatus: NotificationDeliveryStatus.READ })
      .andWhere('n.instituteId = :instituteId', { instituteId })
      .andWhere('n.status = :sentStatus', { sentStatus: NotificationStatus.SENT })
      .getCount();

    return count;
  }

  /**
   * Get unread count for global notifications — from recipient table
   */
  async getUnreadCountGlobal(userId: string): Promise<number> {
    const count = await this.recipientRepository
      .createQueryBuilder('r')
      .innerJoin(PushNotificationEntity, 'n', 'n.id = r.notificationId')
      .where('r.userId = :userId', { userId })
      .andWhere('r.status != :readStatus', { readStatus: NotificationDeliveryStatus.READ })
      .andWhere('n.scope = :scope', { scope: NotificationScope.GLOBAL })
      .andWhere('n.status = :sentStatus', { sentStatus: NotificationStatus.SENT })
      .getCount();

    return count;
  }

  /**
   * Find scheduled notifications that are due (scheduledAt <= now)
   */
  async findDueScheduledNotifications(): Promise<PushNotificationEntity[]> {
    return await this.repository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.institute', 'institute')
      .leftJoinAndSelect('notification.class', 'class')
      .leftJoinAndSelect('notification.subject', 'subject')
      .where('notification.status = :status', { status: NotificationStatus.SCHEDULED })
      .andWhere('notification.scheduledAt <= :now', { now: now() })
      .andWhere('notification.senderRole != :systemRole', { systemRole: 'SYSTEM' })
      .getMany();
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

    // Exclude system-generated notifications (e.g. attendance) — only show admin-created ones
    queryBuilder.andWhere('notification.senderRole != :systemRole', { systemRole: 'SYSTEM' });

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

  // ════════════════════════════════════════════════════════════
  // RECIPIENT MANAGEMENT
  // ════════════════════════════════════════════════════════════

  /**
   * Batch-insert recipient rows for a notification.
   * Uses INSERT IGNORE to be idempotent (safe to call twice).
   * Processes in chunks of 500 to avoid query-size limits.
   */
  async recordRecipients(
    notificationId: string,
    userIds: string[],
    status: NotificationDeliveryStatus = NotificationDeliveryStatus.SENT,
  ): Promise<number> {
    if (userIds.length === 0) return 0;

    const timestamp = now();
    const CHUNK_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + CHUNK_SIZE);

      // Build VALUES placeholders
      const values = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params: any[] = [];
      for (const uid of chunk) {
        params.push(notificationId, uid, status, timestamp, timestamp);
      }

      try {
        const result = await this.dataSource.query(
          `INSERT IGNORE INTO notification_recipients 
            (notification_id, user_id, status, created_at, updated_at) 
           VALUES ${values}`,
          params,
        );
        inserted += result?.affectedRows ?? chunk.length;
      } catch (error) {
        this.logger.error(`Failed to record recipients chunk (offset ${i}): ${error.message}`);
      }
    }

    return inserted;
  }

  /**
   * Update recipient statuses for users whose FCM send failed.
   */
  async markRecipientsFailed(notificationId: string, failedUserIds: string[]): Promise<void> {
    if (failedUserIds.length === 0) return;

    await this.recipientRepository
      .createQueryBuilder()
      .update(NotificationRecipientEntity)
      .set({ status: NotificationDeliveryStatus.FAILED, updatedAt: now() })
      .where('notificationId = :notificationId', { notificationId })
      .andWhere('userId IN (:...failedUserIds)', { failedUserIds })
      .execute();
  }

  /**
   * Get delivery statistics for a notification.
   */
  async getRecipientStats(notificationId: string): Promise<{
    total: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  }> {
    const rows = await this.recipientRepository
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .where('r.notificationId = :notificationId', { notificationId })
      .groupBy('r.status')
      .getRawMany();

    const map: Record<string, number> = {};
    for (const row of rows) {
      map[row.status] = parseInt(row.cnt, 10);
    }

    return {
      total: Object.values(map).reduce((a, b) => a + b, 0),
      sent: map[NotificationDeliveryStatus.SENT] || 0,
      delivered: map[NotificationDeliveryStatus.DELIVERED] || 0,
      read: map[NotificationDeliveryStatus.READ] || 0,
      failed: map[NotificationDeliveryStatus.FAILED] || 0,
    };
  }
}
