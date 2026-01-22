import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { UserFcmTokenRepository } from '../repositories/user-fcm-token.repository';
import { CreateUserFcmTokenDto } from '../dto/create-user-fcm-token.dto';
import { UpdateUserFcmTokenDto } from '../dto/update-user-fcm-token.dto';
import { QueryUserFcmTokenDto } from '../dto/query-user-fcm-token.dto';
import { UserFcmTokenResponseDto } from '../dto/user-fcm-token-response.dto';
import { PaginatedUserFcmTokenResponseDto } from '../dto/paginated-user-fcm-token-response.dto';
import { UserFcmTokenEntity } from '../entities/user-fcm-token.entity';
import { plainToClass } from 'class-transformer';

@Injectable()
export class UserFcmTokenService {
  constructor(
    private readonly fcmTokenRepository: UserFcmTokenRepository,
  ) {}

  async create(createDto: CreateUserFcmTokenDto): Promise<UserFcmTokenResponseDto> {
    // Repository now handles upsert automatically (INSERT ... ON DUPLICATE KEY UPDATE)
    // This prevents race conditions and duplicate key errors
    const fcmToken = await this.fcmTokenRepository.create(createDto);

    return plainToClass(UserFcmTokenResponseDto, fcmToken, {
      excludeExtraneousValues: true,
    });
  }

  async findAll(queryDto: QueryUserFcmTokenDto): Promise<PaginatedUserFcmTokenResponseDto> {
    const { data, total } = await this.fcmTokenRepository.findAll(queryDto);
    
    const { page = 1, limit = 10 } = queryDto;
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    const transformedData = data.map(token =>
      plainToClass(UserFcmTokenResponseDto, token, {
        excludeExtraneousValues: true,
      })
    );

    return {
      data: transformedData,
      total,
      page,
      limit,
      totalPages,
      hasNext,
      hasPrev,
    };
  }

  async findOne(id: string): Promise<UserFcmTokenResponseDto> {
    const fcmToken = await this.fcmTokenRepository.findOne(id);
    
    if (!fcmToken) {
      throw new NotFoundException(`FCM token with ID ${id} not found`);
    }

    return plainToClass(UserFcmTokenResponseDto, fcmToken, {
      excludeExtraneousValues: true,
    });
  }

  async findByUserId(userId: string): Promise<UserFcmTokenResponseDto[]> {
    const fcmTokens = await this.fcmTokenRepository.findByUserId(userId);
    
    return fcmTokens.map(token =>
      plainToClass(UserFcmTokenResponseDto, token, {
        excludeExtraneousValues: true,
      })
    );
  }

  async findActiveTokensByUserId(userId: string): Promise<UserFcmTokenResponseDto[]> {
    const fcmTokens = await this.fcmTokenRepository.findActiveTokensByUserId(userId);
    
    return fcmTokens.map(token =>
      plainToClass(UserFcmTokenResponseDto, token, {
        excludeExtraneousValues: true,
      })
    );
  }

  async update(id: string, updateDto: UpdateUserFcmTokenDto): Promise<UserFcmTokenResponseDto> {
    const fcmToken = await this.fcmTokenRepository.findOne(id);
    
    if (!fcmToken) {
      throw new NotFoundException(`FCM token with ID ${id} not found`);
    }

    // Parse date strings if provided
    const processedUpdateDto = { ...updateDto };
    if (processedUpdateDto.lastSeen) {
      processedUpdateDto.lastSeen = new Date(processedUpdateDto.lastSeen).toISOString();
    }
    if (processedUpdateDto.lastNotificationSent) {
      processedUpdateDto.lastNotificationSent = new Date(processedUpdateDto.lastNotificationSent).toISOString();
    }

    const updatedToken = await this.fcmTokenRepository.update(id, processedUpdateDto);
    
    if (!updatedToken) {
      throw new BadRequestException('Failed to update FCM token');
    }

    return plainToClass(UserFcmTokenResponseDto, updatedToken, {
      excludeExtraneousValues: true,
    });
  }

  async updateLastSeen(id: string): Promise<void> {
    const fcmToken = await this.fcmTokenRepository.findOne(id);
    
    if (!fcmToken) {
      throw new NotFoundException(`FCM token with ID ${id} not found`);
    }

    await this.fcmTokenRepository.updateLastSeen(id);
  }

  async updateLastNotificationSent(id: string): Promise<void> {
    const fcmToken = await this.fcmTokenRepository.findOne(id);
    
    if (!fcmToken) {
      throw new NotFoundException(`FCM token with ID ${id} not found`);
    }

    await this.fcmTokenRepository.updateLastNotificationSent(id);
  }

  async deactivateToken(id: string): Promise<void> {
    const fcmToken = await this.fcmTokenRepository.findOne(id);
    
    if (!fcmToken) {
      throw new NotFoundException(`FCM token with ID ${id} not found`);
    }

    await this.fcmTokenRepository.deactivateToken(id);
  }

  async deactivateAllUserTokens(userId: string): Promise<void> {
    await this.fcmTokenRepository.deactivateAllUserTokens(userId);
  }

  async remove(id: string): Promise<void> {
    const fcmToken = await this.fcmTokenRepository.findOne(id);
    
    if (!fcmToken) {
      throw new NotFoundException(`FCM token with ID ${id} not found`);
    }

    await this.fcmTokenRepository.delete(id);
  }

  async removeByUserAndDevice(userId: string, deviceId: string): Promise<void> {
    const fcmToken = await this.fcmTokenRepository.findByUserAndDevice(userId, deviceId);
    
    if (!fcmToken) {
      throw new NotFoundException(`FCM token for user ${userId} and device ${deviceId} not found`);
    }

    await this.fcmTokenRepository.deleteByUserAndDevice(userId, deviceId);
  }

  async cleanupInactiveTokens(daysOld: number = 30): Promise<{ deletedCount: number }> {
    const deletedCount = await this.fcmTokenRepository.cleanupInactiveTokens(daysOld);
    return { deletedCount };
  }

  // Utility method to check if user has active tokens
  async hasActiveTokens(userId: string): Promise<boolean> {
    const activeTokens = await this.fcmTokenRepository.findActiveTokensByUserId(userId);
    return activeTokens.length > 0;
  }

  // Utility method to get token count by user
  async getTokenCountByUser(userId: string): Promise<{ total: number; active: number; inactive: number }> {
    const allTokens = await this.fcmTokenRepository.findByUserId(userId);
    const activeTokens = allTokens.filter(token => token.isActive);
    const inactiveTokens = allTokens.filter(token => !token.isActive);

    return {
      total: allTokens.length,
      active: activeTokens.length,
      inactive: inactiveTokens.length,
    };
  }
}
