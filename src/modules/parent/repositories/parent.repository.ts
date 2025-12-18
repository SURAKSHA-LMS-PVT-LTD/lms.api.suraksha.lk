import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, FindManyOptions, SelectQueryBuilder } from 'typeorm';
import { ParentEntity } from '../entities/parent.entity';
import { Occupation } from '../../user/enums/occupation.enum';
import { IParentRepository, ParentFilters, ParentQueryOptions } from '../interfaces/parent.interface';
import { PARENT_CONSTANTS } from '../constants/parent.constants';

@Injectable()
export class ParentRepository implements IParentRepository {
  constructor(
    @InjectRepository(ParentEntity)
    private readonly repository: Repository<ParentEntity>,
  ) {}

  create(parent: Partial<ParentEntity>): ParentEntity {
    return this.repository.create(parent);
  }

  async save(parent: ParentEntity): Promise<ParentEntity> {
    return this.repository.save(parent);
  }

  async findOne(options: FindManyOptions<ParentEntity>): Promise<ParentEntity | null> {
    return this.repository.findOne(options);
  }

  async findOneBy(criteria: FindOptionsWhere<ParentEntity>): Promise<ParentEntity | null> {
    return this.repository.findOneBy(criteria);
  }

  async find(options?: FindManyOptions<ParentEntity>): Promise<ParentEntity[]> {
    return this.repository.find(options);
  }

  async findAndCount(options?: FindManyOptions<ParentEntity>): Promise<[ParentEntity[], number]> {
    return this.repository.findAndCount(options);
  }

  async update(criteria: FindOptionsWhere<ParentEntity>, partialEntity: Partial<ParentEntity>): Promise<any> {
    return this.repository.update(criteria, partialEntity);
  }

  async delete(criteria: FindOptionsWhere<ParentEntity>): Promise<any> {
    return this.repository.delete(criteria);
  }

  async softDelete(criteria: FindOptionsWhere<ParentEntity>): Promise<any> {
    return this.repository.softDelete(criteria);
  }

  async restore(criteria: FindOptionsWhere<ParentEntity>): Promise<any> {
    return this.repository.restore(criteria);
  }

  // Custom methods
  async findByEmail(email: string): Promise<ParentEntity | null> {
    return this.repository.findOne({
      where: { user: { email } },
      relations: ['user'],
    });
  }

  async findByUserId(userId: string): Promise<ParentEntity | null> {
    return this.repository.findOne({
      where: { userId },
      relations: ['user'],
    });
  }

  async findWithRelations(id: string): Promise<ParentEntity | null> {
    return this.repository.findOne({
      where: { userId: id },
      relations: ['user'],
    });
  }

  async findWithFilters(filters: ParentFilters): Promise<[ParentEntity[], number]> {
    const queryBuilder = this.createFilteredQuery(filters);
    return queryBuilder.getManyAndCount();
  }

  async countByFilters(filters: Partial<ParentFilters>): Promise<number> {
    const queryBuilder = this.createFilteredQuery(filters);
    return queryBuilder.getCount();
  }

  async findActiveParents(): Promise<ParentEntity[]> {
    return this.repository.find({
      where: { isActive: true },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findParentsByEducationLevel(educationLevel: string): Promise<ParentEntity[]> {
    return this.repository.find({
      where: { educationLevel },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findParentsByOccupation(occupation: Occupation): Promise<ParentEntity[]> {
    return this.repository.find({
      where: { occupation },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async searchParents(searchTerm: string, limit: number = 10): Promise<ParentEntity[]> {
    return this.repository
      .createQueryBuilder('parent')
      .leftJoinAndSelect('parent.user', 'user')
      .where('user.firstName LIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .orWhere('user.lastName LIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .orWhere('user.email LIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .orWhere('parent.occupation LIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .orWhere('parent.workplace LIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .orderBy('user.firstName', 'ASC')
      .limit(limit)
      .getMany();
  }

  async getParentStats(): Promise<any> {
    const totalQuery = this.repository.createQueryBuilder('parent');
    const activeQuery = this.repository.createQueryBuilder('parent').where('parent.isActive = :isActive', { isActive: true });
    
    const genderQuery = this.repository
      .createQueryBuilder('parent')
      .leftJoin('parent.user', 'user')
      .select('user.gender, COUNT(*) as count')
      .groupBy('user.gender');

    const educationQuery = this.repository
      .createQueryBuilder('parent')
      .select('parent.educationLevel, COUNT(*) as count')
      .where('parent.educationLevel IS NOT NULL')
      .groupBy('parent.educationLevel');

    const occupationQuery = this.repository
      .createQueryBuilder('parent')
      .select('parent.occupation, COUNT(*) as count')
      .where('parent.occupation IS NOT NULL')
      .groupBy('parent.occupation');

    const [total, active, genderStats, educationStats, occupationStats] = await Promise.all([
      totalQuery.getCount(),
      activeQuery.getCount(),
      genderQuery.getRawMany(),
      educationQuery.getRawMany(),
      occupationQuery.getRawMany(),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      genderStats: genderStats.reduce((acc, item) => {
        acc[item.gender || 'unknown'] = parseInt(item.count);
        return acc;
      }, {}),
      educationStats: educationStats.reduce((acc, item) => {
        acc[item.educationLevel] = parseInt(item.count);
        return acc;
      }, {}),
      occupationStats: occupationStats.reduce((acc, item) => {
        acc[item.occupation] = parseInt(item.count);
        return acc;
      }, {}),
    };
  }

  private createFilteredQuery(filters: Partial<ParentFilters>): SelectQueryBuilder<ParentEntity> {
    const queryBuilder = this.repository
      .createQueryBuilder('parent')
      .leftJoinAndSelect('parent.user', 'user');

    // Apply filters
    if (filters.search) {
      queryBuilder.andWhere(
        '(user.firstName LIKE :search OR user.lastName LIKE :search OR user.email LIKE :search OR parent.occupation LIKE :search OR parent.workplace LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('parent.isActive = :isActive', { isActive: filters.isActive });
    }

    if (filters.educationLevel) {
      queryBuilder.andWhere('parent.educationLevel = :educationLevel', { educationLevel: filters.educationLevel });
    }

    if (filters.gender) {
      queryBuilder.andWhere('user.gender = :gender', { gender: filters.gender });
    }

    if (filters.occupation) {
      queryBuilder.andWhere('parent.occupation LIKE :occupation', { occupation: `%${filters.occupation}%` });
    }

    // Apply sorting
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'DESC';
    
    if (sortBy.includes('.')) {
      queryBuilder.orderBy(sortBy, sortOrder);
    } else {
      queryBuilder.orderBy(`parent.${sortBy}`, sortOrder);
    }

    // Apply pagination
    if (filters.page && filters.limit) {
      const skip = (filters.page - 1) * filters.limit;
      queryBuilder.skip(skip).take(filters.limit);
    }

    return queryBuilder;
  }

  async checkEmailExists(email: string, excludeUserId?: string): Promise<boolean> {
    const queryBuilder = this.repository
      .createQueryBuilder('parent')
      .leftJoin('parent.user', 'user')
      .where('user.email = :email', { email });

    if (excludeUserId) {
      queryBuilder.andWhere('parent.userId != :excludeUserId', { excludeUserId });
    }

    const count = await queryBuilder.getCount();
    return count > 0;
  }
}
