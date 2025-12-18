import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserType } from '../enums/user-type.enum';

@Injectable()
export class UserRepository extends Repository<UserEntity> {
  constructor(private dataSource: DataSource) {
    super(UserEntity, dataSource.createEntityManager());
  }

  async findByEmailOrNic(email?: string, nic?: string): Promise<UserEntity | null> {
    const queryBuilder = this.createQueryBuilder('user');
    
    if (email && nic) {
      queryBuilder.where('user.email = :email OR user.nic = :nic', { email, nic });
    } else if (email) {
      queryBuilder.where('user.email = :email', { email });
    } else if (nic) {
      queryBuilder.where('user.nic = :nic', { nic });
    } else {
      return null;
    }

    return await queryBuilder.getOne();
  }

  async findActiveUsers(): Promise<UserEntity[]> {
    return await this.find({ where: { isActive: true } });
  }

  async findUsersByLocation(city?: string, district?: string, province?: string): Promise<UserEntity[]> {
    const queryBuilder = this.createQueryBuilder('user');
    
    if (city) queryBuilder.andWhere('user.city = :city', { city });
    if (district) queryBuilder.andWhere('user.district = :district', { district });
    if (province) queryBuilder.andWhere('user.province = :province', { province });
    
    return await queryBuilder.getMany();
  }

  async searchUsers(searchTerm: string): Promise<UserEntity[]> {
    return await this.createQueryBuilder('user')
      .where('user.firstName LIKE :search', { search: `%${searchTerm}%` })
      .orWhere('user.lastName LIKE :search', { search: `%${searchTerm}%` })
      .orWhere('user.email LIKE :search', { search: `%${searchTerm}%` })
      .getMany();
  }

  async getUserStats(): Promise<{ total: number; active: number; inactive: number; byType: Record<string, number> }> {
    const total = await this.count();
    const active = await this.count({ where: { isActive: true } });
    const inactive = total - active;

    const byTypeQuery = await this.createQueryBuilder('user')
      .select('user.userType', 'userType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.userType')
      .getRawMany();

    const byType = byTypeQuery.reduce((acc, item) => {
      acc[item.userType || 'unknown'] = parseInt(item.count);
      return acc;
    }, {});

    return { total, active, inactive, byType };
  }
}
