import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { UserFcmTokenEntity } from '../entities/user-fcm-token.entity';
import { CreateUserFcmTokenDto } from '../dto/create-user-fcm-token.dto';
import { UpdateUserFcmTokenDto } from '../dto/update-user-fcm-token.dto';
import { QueryUserFcmTokenDto } from '../dto/query-user-fcm-token.dto';
import { now } from '../../../common/utils/timezone.util';

@Injectable()
export class UserFcmTokenRepository {
  constructor(
    @InjectRepository(UserFcmTokenEntity)
    private readonly repository: Repository<UserFcmTokenEntity>,
  ) {}

  async create(createDto: CreateUserFcmTokenDto): Promise<UserFcmTokenEntity> {
    const fcmToken = this.repository.create(createDto);
    return await this.repository.save(fcmToken);
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
    return await this.repository.find({
      where: { userId, isActive: true },
      relations: ['user']
    });
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
        '(fcmToken.deviceId ILIKE :search OR fcmToken.deviceName ILIKE :search)',
        { search: `%${queryDto.search}%` }
      );
    }

    return queryBuilder;
  }
}
