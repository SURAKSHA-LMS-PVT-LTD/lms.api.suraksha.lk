import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserType } from '../enums/user-type.enum';
import {
  UserPublicResponseDto,
  UserSummaryResponseDto,
  UserDetailResponseDto,
  UserOwnProfileResponseDto,
  UserAdminResponseDto
} from '../dto/secure-user-response.dto';
import { formatDate } from '../../../common/validators/date-format.validator';
import { now } from '../../../common/utils/timezone.util';

@Injectable()
export class OptimizedUserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  /**
   * Helper function to convert UserEntity to DTO-compatible format
   */
  private entityToDto(user: UserEntity): any {
    return {
      ...user,
      dateOfBirth: user.dateOfBirth ? formatDate(user.dateOfBirth) : undefined,
    };
  }

  /**
   * Get public user profile - minimal data, no authentication required
   */
  async findPublic(id: string): Promise<UserPublicResponseDto> {
    const user = await this.userRepository.findOne({
      select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl'],
      where: { id, isActive: true }
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return new UserPublicResponseDto(this.entityToDto(user));
  }

  /**
   * Search users with summary information for authenticated users
   */
  async findSummary(query: {
    search?: string;
    userType?: UserType;
    page?: number;
    limit?: number;
  }): Promise<{
    data: UserSummaryResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      search,
      userType,
      page = 1,
      limit = 10
    } = query;

    const where: FindOptionsWhere<UserEntity> = {
      isActive: true
    };

    if (search) {
      // Search by name or email
      where.firstName = Like(`%${search}%`);
      // Note: For better search, you might want to use a more complex query
    }

    if (userType) {
      where.userType = userType;
    }

    // Optimized query - only fetch required fields
    const [data, total] = await this.userRepository.findAndCount({
      select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'email', 'userType', 'imageUrl'],
      where,
      order: { firstName: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const responseData = data.map(user => new UserSummaryResponseDto(this.entityToDto(user)));
    return { data: responseData, total, page, limit };
  }

  /**
   * Get detailed user information for authorized viewers
   */
  async findDetail(id: string, requestingUserId: string, requestingUserType: UserType): Promise<UserDetailResponseDto> {
    // Only admins or the user themselves can view detailed info
    // Access control will be handled by decorators

    const user = await this.userRepository.findOne({
      select: [
        'id', 'firstName', 'lastName', 'nameWithInitials', 'email', 
        'userType', 'dateOfBirth', 'gender', 'imageUrl'
      ],
      where: { id, isActive: true }
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return new UserDetailResponseDto(this.entityToDto(user));
  }

  /**
   * Get user's own complete profile
   */
  async findOwnProfile(id: string): Promise<UserOwnProfileResponseDto> {
    const user = await this.userRepository.findOne({
      select: [
        'id', 'firstName', 'lastName', 'nameWithInitials', 'email', 'userType',
        'dateOfBirth', 'gender', 'imageUrl', 'city', 'country'
      ],
      where: { id, isActive: true }
    });

    if (!user) {
      throw new NotFoundException(`User profile not found`);
    }

    return new UserOwnProfileResponseDto(this.entityToDto(user));
  }

  /**
   * Get complete user information for administrators only
   */
  async findAdmin(id: string, requestingUserType: UserType): Promise<UserAdminResponseDto> {
    // Access control will be handled by decorators

    const user = await this.userRepository.findOne({
      where: { id }
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return new UserAdminResponseDto(this.entityToDto(user));
  }

  /**
   * Get users for dropdown/selection (minimal data)
   */
  async findForDropdown(userType?: UserType): Promise<{ id: string; name: string; email: string }[]> {
    const where: FindOptionsWhere<UserEntity> = {
      isActive: true
    };

    if (userType) {
      where.userType = userType;
    }

    const users = await this.userRepository.find({
      select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'email'],
      where,
      order: { firstName: 'ASC' },
      take: 500,
    });

    return users.map(user => ({
      id: user.id,
      name: `${user.firstName} ${user.lastName || ''}`.trim(),
      nameWithInitials: user.nameWithInitials || undefined,
      email: user.email || ''
    }));
  }

  /**
   * Get teachers for dropdown
   */
  async findTeachersForDropdown(): Promise<{ id: string; name: string; email: string }[]> {
    return this.findForDropdown(UserType.USER);
  }

  /**
   * Get students for dropdown
   */
  async findStudentsForDropdown(): Promise<{ id: string; name: string; email: string }[]> {
    return this.findForDropdown(UserType.USER_WITHOUT_PARENT);
  }

  /**
   * Check if user exists and is active (for validation)
   */
  async exists(id: string): Promise<boolean> {
    const count = await this.userRepository.count({
      where: { id, isActive: true }
    });
    return count > 0;
  }

  /**
   * Find user by email (for authentication - minimal data)
   */
  async findByEmail(email: string): Promise<{
    id: string;
    email: string;
    password: string;
    userType: UserType;
    isActive: boolean;
  } | null> {
    const user = await this.userRepository.findOne({
      select: ['id', 'email', 'password', 'userType', 'isActive'],
      where: { email }
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email!,
      password: user.password!,
      userType: user.userType!,
      isActive: user.isActive
    };
  }

  /**
   * Update user's last login
   */
  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.update(
      { id },
      { updatedAt: now() }
    );
  }

  /**
   * Get user statistics (admin only)
   */
  async getStatistics(userType: UserType): Promise<{
    total: number;
    active: number;
    inactive: number;
    byType: Record<string, number>;
  }> {
    // Access control will be handled by decorators

    const [total, active] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { isActive: true } })
    ]);

    // Get counts by user type
    const typeStats = await this.userRepository
      .createQueryBuilder('user')
      .select('user.userType', 'userType')
      .addSelect('COUNT(*)', 'count')
      .where('user.isActive = :isActive', { isActive: true })
      .groupBy('user.userType')
      .getRawMany();

    const byType = typeStats.reduce((acc, stat) => {
      acc[stat.userType] = parseInt(stat.count);
      return acc;
    }, {} as Record<string, number>);

    return {
      total,
      active,
      inactive: total - active,
      byType
    };
  }

  /**
   * Search users with advanced filters (admin only)
   */
  async searchUsers(
    filters: {
      search?: string;
      userType?: UserType;
      isActive?: boolean;
      city?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
    pagination: {
      page: number;
      limit: number;
    },
    requestingUserType: UserType
  ): Promise<{
    data: UserAdminResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Access control will be handled by decorators

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    // Apply filters
    if (filters.search) {
      queryBuilder.andWhere(
        '(user.firstName LIKE :search OR user.lastName LIKE :search OR user.email LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.userType) {
      queryBuilder.andWhere('user.userType = :userType', { userType: filters.userType });
    }

    if (typeof filters.isActive === 'boolean') {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive: filters.isActive });
    }

    if (filters.city) {
      queryBuilder.andWhere('user.city = :city', { city: filters.city });
    }

    if (filters.dateFrom) {
      queryBuilder.andWhere('user.createdAt >= :dateFrom', { dateFrom: filters.dateFrom });
    }

    if (filters.dateTo) {
      queryBuilder.andWhere('user.createdAt <= :dateTo', { dateTo: filters.dateTo });
    }

    // Apply pagination
    queryBuilder
      .skip((pagination.page - 1) * pagination.limit)
      .take(pagination.limit)
      .orderBy('user.createdAt', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    const responseData = data.map(user => new UserAdminResponseDto(this.entityToDto(user)));
    return {
      data: responseData,
      total,
      page: pagination.page,
      limit: pagination.limit
    };
  }

  /**
   * Bulk update user status (admin only)
   */
  async bulkUpdateStatus(
    userIds: string[],
    isActive: boolean,
    requestingUserType: UserType
  ): Promise<{ updated: number }> {
    // Access control will be handled by decorators

    const result = await this.userRepository.update(
      { id: { $in: userIds } as any },
      { isActive }
    );

    return { updated: result.affected || 0 };
  }
}
