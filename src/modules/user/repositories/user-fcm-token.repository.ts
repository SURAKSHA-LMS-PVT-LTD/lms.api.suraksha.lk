import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { UserFcmTokenEntity } from '../entities/user-fcm-token.entity';
import { CreateUserFcmTokenDto } from '../dto/create-user-fcm-token.dto';
import { UpdateUserFcmTokenDto } from '../dto/update-user-fcm-token.dto';
import { QueryUserFcmTokenDto } from '../dto/query-user-fcm-token.dto';
import { now, formatForMySQL } from '../../../common/utils/timezone.util';

@Injectable()
export class UserFcmTokenRepository {
  // Maximum devices per user (configurable)
  // Recommended: 5-10 devices per user (phone, tablet, web, desktop, etc.)
  private readonly MAX_DEVICES_PER_USER = 10;

  constructor(
    @InjectRepository(UserFcmTokenEntity)
    private readonly repository: Repository<UserFcmTokenEntity>,
  ) {}

  /**
   * Get the maximum number of devices allowed per user
   */
  getMaxDevicesPerUser(): number {
    return this.MAX_DEVICES_PER_USER;
  }

  async create(createDto: CreateUserFcmTokenDto): Promise<UserFcmTokenEntity> {
    const timestamp = now();
    const mysqlTimestamp = formatForMySQL(timestamp);
    
    // Check if user has reached device limit (only for new devices)
    const checkExistingToken = await this.findByUserAndDevice(createDto.userId, createDto.deviceId);
    if (!checkExistingToken) {
      const userDeviceCount = await this.repository.count({
        where: { userId: createDto.userId, isActive: true }
      });
      
      if (userDeviceCount >= this.MAX_DEVICES_PER_USER) {
        // Auto-remove oldest inactive device, or throw error
        await this.removeOldestDevice(createDto.userId);
      }
    }
    
    // Use upsert to handle duplicate userId + deviceId gracefully
    // This prevents race conditions when multiple requests come simultaneously
    const result = await this.repository
      .createQueryBuilder()
      .insert()
      .into(UserFcmTokenEntity)
      .values({
        userId: createDto.userId,
        fcmToken: createDto.fcmToken,
        deviceId: createDto.deviceId,
        deviceType: createDto.deviceType,
        deviceName: createDto.deviceName || null,
        appVersion: createDto.appVersion || null,
        osVersion: createDto.osVersion || null,
        isActive: createDto.isActive ?? true,
        isSynced: createDto.isSynced ?? false,
        createdAt: mysqlTimestamp as any,
        updatedAt: mysqlTimestamp as any,
      })
      .orUpdate(
        ['fcm_token', 'device_type', 'device_name', 'app_version', 'os_version', 'is_active', 'is_synced', 'updated_at'],
        ['user_id', 'device_id'] // Conflict target: the unique constraint columns
      )
      .execute();

    // Fetch and return the created/updated token
    const tokenId = result.identifiers[0]?.id || result.raw?.insertId;
    if (tokenId) {
      const token = await this.findOne(tokenId.toString());
      if (token) return token;
    }

    // Fallback: find by userId and deviceId if insert ID not available
    const upsertedToken = await this.findByUserAndDevice(createDto.userId, createDto.deviceId);
    if (upsertedToken) return upsertedToken;

    // This should never happen, but throw error if we can't find the token
    throw new Error('Failed to create or retrieve FCM token after upsert');
  }

  async findAll(queryDto: QueryUserFcmTokenDto): Promise<{ data: UserFcmTokenEntity[]; total: number }> {
    const queryBuilder = this.buildQueryBuilder(queryDto);
    
    const total = await queryBuilder.getCount();
    
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'DESC' } = queryDto;
    const skip = (page - 1) * limit;
    
    queryBuilder
      .orderBy(`fcmToken.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    const data = await queryBuilder.getMany();
    
    return { data, total };
  }

  async findOne(id: string): Promise<UserFcmTokenEntity | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['user']
    });
  }

  async findByUserAndDevice(userId: string, deviceId: string): Promise<UserFcmTokenEntity | null> {
    return await this.repository.findOne({
      where: { userId, deviceId },
      relations: ['user']
    });
  }

  async findByToken(fcmToken: string): Promise<UserFcmTokenEntity | null> {
    return await this.repository.findOne({
      where: { fcmToken },
      relations: ['user']
    });
  }

  async findByUserId(userId: string): Promise<UserFcmTokenEntity[]> {
    return await this.repository.find({
      where: { userId, isActive: true },
      relations: ['user']
    });
  }

  async findActiveTokensByUserId(userId: string): Promise<UserFcmTokenEntity[]> {
    // Ensure userId is a string for consistent comparison with bigint column
    const userIdStr = String(userId);
    
    const tokens = await this.repository.find({
      where: { userId: userIdStr, isActive: true },
    });
    
    return tokens;
  }

  /**
   * Bulk fetch active tokens for multiple users (PERFORMANCE OPTIMIZED)
   * Returns all active tokens for the given user IDs in a single query
   */
  async findActiveTokensByUserIds(userIds: string[]): Promise<UserFcmTokenEntity[]> {
    if (userIds.length === 0) {
      return [];
    }

    // Ensure all userIds are strings
    const userIdStrs = userIds.map(id => String(id));
    
    const tokens = await this.repository
      .createQueryBuilder('token')
      .where('token.userId IN (:...userIds)', { userIds: userIdStrs })
      .andWhere('token.isActive = :isActive', { isActive: true })
      .getMany();
    
    return tokens;
  }

  async update(id: string, updateDto: UpdateUserFcmTokenDto): Promise<UserFcmTokenEntity | null> {
    await this.repository.update(id, updateDto);
    return await this.findOne(id);
  }

  async updateLastSeen(id: string): Promise<void> {
    await this.repository.update(id, { lastSeen: now() });
  }

  async updateLastNotificationSent(id: string): Promise<void> {
    await this.repository.update(id, { lastNotificationSent: now() });
  }

  async deactivateToken(id: string): Promise<void> {
    await this.repository.update(id, { isActive: false });
  }

  async deactivateAllUserTokens(userId: string): Promise<void> {
    await this.repository.update({ userId }, { isActive: false });
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async deleteByUserAndDevice(userId: string, deviceId: string): Promise<void> {
    await this.repository.delete({ userId, deviceId });
  }

  async cleanupInactiveTokens(daysOld: number = 30): Promise<number> {
    const cutoffDate = now();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(UserFcmTokenEntity)
      .where('isActive = :isActive', { isActive: false })
      .andWhere('updatedAt < :cutoffDate', { cutoffDate })
      .execute();
    
    return result.affected || 0;
  }

  /**
   * Get all unique user IDs that have active FCM tokens
   * Useful for sending broadcast notifications to all users
   */
  async getAllUserIdsWithActiveTokens(): Promise<string[]> {
    const results = await this.repository
      .createQueryBuilder('fcmToken')
      .select('DISTINCT fcmToken.userId', 'userId')
      .where('fcmToken.isActive = :isActive', { isActive: true })
      .getRawMany();
    
    return results.map(result => result.userId);
  }

  /**
   * Remove the oldest inactive device when user reaches device limit
   * Priority: Remove oldest inactive device first, then oldest active device
   */
  private async removeOldestDevice(userId: string): Promise<void> {
    // First, try to remove oldest inactive device
    const oldestInactive = await this.repository.findOne({
      where: { userId, isActive: false },
      order: { lastSeen: 'ASC', updatedAt: 'ASC' }
    });

    if (oldestInactive) {
      await this.repository.delete(oldestInactive.id);
      return;
    }

    // If no inactive devices, remove the oldest active device (least recently seen)
    const oldestActive = await this.repository.findOne({
      where: { userId, isActive: true },
      order: { lastSeen: 'ASC', updatedAt: 'ASC' }
    });

    if (oldestActive) {
      await this.repository.delete(oldestActive.id);
    }
  }

  private buildQueryBuilder(queryDto: QueryUserFcmTokenDto): SelectQueryBuilder<UserFcmTokenEntity> {
    const queryBuilder = this.repository
      .createQueryBuilder('fcmToken')
      .leftJoinAndSelect('fcmToken.user', 'user');

    if (queryDto.userId) {
      queryBuilder.andWhere('fcmToken.userId = :userId', { userId: queryDto.userId });
    }

    if (queryDto.deviceType) {
      queryBuilder.andWhere('fcmToken.deviceType = :deviceType', { deviceType: queryDto.deviceType });
    }

    if (queryDto.isActive !== undefined) {
      queryBuilder.andWhere('fcmToken.isActive = :isActive', { isActive: queryDto.isActive });
    }

    if (queryDto.isSynced !== undefined) {
      queryBuilder.andWhere('fcmToken.isSynced = :isSynced', { isSynced: queryDto.isSynced });
    }

    if (queryDto.search) {
      queryBuilder.andWhere(
        '(fcmToken.deviceId LIKE :search OR fcmToken.deviceName LIKE :search)',
        { search: `%${queryDto.search}%` }
      );
    }

    return queryBuilder;
  }
}
