import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, FindManyOptions, SelectQueryBuilder } from 'typeorm';
import { StudentEntity } from '../entities/student.entity';
import { IStudentRepository, StudentFilters, StudentQueryOptions } from '../interfaces/student.interface';
import { STUDENT_CONSTANTS } from '../constants/student.constants';
import { sanitizeSortField, sanitizeSortOrder } from '@common/utils/query-sanitizer.util';

@Injectable()
export class StudentRepository implements IStudentRepository {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly repository: Repository<StudentEntity>,
  ) {}

  create(student: Partial<StudentEntity>): StudentEntity {
    return this.repository.create(student);
  }

  async save(student: StudentEntity): Promise<StudentEntity> {
    return this.repository.save(student);
  }

  async findOne(options: FindManyOptions<StudentEntity>): Promise<StudentEntity | null> {
    return this.repository.findOne(options);
  }

  async findOneBy(criteria: FindOptionsWhere<StudentEntity>): Promise<StudentEntity | null> {
    return this.repository.findOneBy(criteria);
  }

  async find(options?: FindManyOptions<StudentEntity>): Promise<StudentEntity[]> {
    return this.repository.find(options);
  }

  async findAndCount(options?: FindManyOptions<StudentEntity>): Promise<[StudentEntity[], number]> {
    return this.repository.findAndCount(options);
  }

  async update(criteria: FindOptionsWhere<StudentEntity>, partialEntity: Partial<StudentEntity>): Promise<any> {
    return this.repository.update(criteria, partialEntity);
  }

  async delete(criteria: FindOptionsWhere<StudentEntity>): Promise<any> {
    return this.repository.delete(criteria);
  }

  async softDelete(criteria: FindOptionsWhere<StudentEntity>): Promise<any> {
    return this.repository.softDelete(criteria);
  }

  async restore(criteria: FindOptionsWhere<StudentEntity>): Promise<any> {
    return this.repository.restore(criteria);
  }

  // Custom methods
  async findByEmail(email: string): Promise<StudentEntity | null> {
    return this.repository.findOne({
      where: { user: { email } },
      relations: ['user', 'father', 'mother', 'guardian'],
    });
  }

  async findByAdmissionNumber(admissionNumber: string): Promise<StudentEntity | null> {
    return this.repository.findOneBy({ studentId: admissionNumber });
  }

  async findByUserId(userId: string): Promise<StudentEntity | null> {
    return this.repository.findOne({
      where: { userId },
      relations: ['user', 'father', 'mother', 'guardian'],
    });
  }

  async findWithRelations(id: string): Promise<StudentEntity | null> {
    return this.repository.findOne({
      where: { userId: id },
      relations: [
        'user',
        'father',
        'father.user',
        'mother',
        'mother.user',
        'guardian',
        'guardian.user',
      ],
    });
  }

  async findWithFilters(filters: StudentFilters): Promise<[StudentEntity[], number]> {
    const queryBuilder = this.createFilteredQuery(filters);
    return queryBuilder.getManyAndCount();
  }

  async countByFilters(filters: Partial<StudentFilters>): Promise<number> {
    const queryBuilder = this.createFilteredQuery(filters);
    return queryBuilder.getCount();
  }

  async findActiveStudents(): Promise<StudentEntity[]> {
    return this.repository.find({
      where: { isActive: true },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findStudentsByParent(parentId: string): Promise<StudentEntity[]> {
    return this.repository.find({
      where: [
        { fatherId: parentId },
        { motherId: parentId },
        { guardianId: parentId },
      ],
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async searchStudents(searchTerm: string, limit: number = 10): Promise<StudentEntity[]> {
    return this.repository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .where('user.firstName LIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .orWhere('user.lastName LIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .orWhere('user.email LIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .orWhere('student.studentId LIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .orderBy('user.firstName', 'ASC')
      .limit(limit)
      .getMany();
  }

  async getStudentStats(): Promise<any> {
    const totalQuery = this.repository.createQueryBuilder('student');
    const activeQuery = this.repository.createQueryBuilder('student').where('student.isActive = :isActive', { isActive: true });
    const genderQuery = this.repository
      .createQueryBuilder('student')
      .leftJoin('student.user', 'user')
      .select('user.gender, COUNT(*) as count')
      .groupBy('user.gender');

    const bloodGroupQuery = this.repository
      .createQueryBuilder('student')
      .select('student.bloodGroup, COUNT(*) as count')
      .where('student.bloodGroup IS NOT NULL')
      .groupBy('student.bloodGroup');

    const [total, active, genderStats, bloodGroupStats] = await Promise.all([
      totalQuery.getCount(),
      activeQuery.getCount(),
      genderQuery.getRawMany(),
      bloodGroupQuery.getRawMany(),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      genderStats: genderStats.reduce((acc, item) => {
        acc[item.gender || 'unknown'] = parseInt(item.count);
        return acc;
      }, {}),
      bloodGroupStats: bloodGroupStats.reduce((acc, item) => {
        acc[item.bloodGroup] = parseInt(item.count);
        return acc;
      }, {}),
    };
  }

  private createFilteredQuery(filters: Partial<StudentFilters>): SelectQueryBuilder<StudentEntity> {
    const queryBuilder = this.repository
      .createQueryBuilder('student')
      .leftJoinAndSelect('student.user', 'user')
      .leftJoinAndSelect('student.father', 'father')
      .leftJoinAndSelect('father.user', 'fatherUser')
      .leftJoinAndSelect('student.mother', 'mother')
      .leftJoinAndSelect('mother.user', 'motherUser')
      .leftJoinAndSelect('student.guardian', 'guardian')
      .leftJoinAndSelect('guardian.user', 'guardianUser');

    // Apply filters
    if (filters.search) {
      queryBuilder.andWhere(
        '(user.firstName LIKE :search OR user.lastName LIKE :search OR user.email LIKE :search OR student.studentId LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('student.isActive = :isActive', { isActive: filters.isActive });
    }

    if (filters.bloodGroup) {
      queryBuilder.andWhere('student.bloodGroup = :bloodGroup', { bloodGroup: filters.bloodGroup });
    }

    if (filters.gender) {
      queryBuilder.andWhere('user.gender = :gender', { gender: filters.gender });
    }

    if (filters.parentId) {
      queryBuilder.andWhere(
        '(student.fatherId = :parentId OR student.motherId = :parentId OR student.guardianId = :parentId)',
        { parentId: filters.parentId }
      );
    }

    // Apply sorting (SQL injection safe — allowlist validated)
    const validSortFields = ['createdAt', 'updatedAt', 'studentId', 'bloodGroup', 'isActive'] as const;
    const sortBy = sanitizeSortField(filters.sortBy, validSortFields, 'createdAt');
    const sortOrder = sanitizeSortOrder(filters.sortOrder);
    queryBuilder.orderBy(`student.${sortBy}`, sortOrder);

    // Apply pagination
    if (filters.page && filters.limit) {
      const skip = (filters.page - 1) * filters.limit;
      queryBuilder.skip(skip).take(filters.limit);
    }

    return queryBuilder;
  }

  async checkEmailExists(email: string, excludeUserId?: string): Promise<boolean> {
    const queryBuilder = this.repository
      .createQueryBuilder('student')
      .leftJoin('student.user', 'user')
      .where('user.email = :email', { email });

    if (excludeUserId) {
      queryBuilder.andWhere('student.userId != :excludeUserId', { excludeUserId });
    }

    const count = await queryBuilder.getCount();
    return count > 0;
  }

  async checkAdmissionNumberExists(admissionNumber: string, excludeUserId?: string): Promise<boolean> {
    const queryBuilder = this.repository
      .createQueryBuilder('student')
      .where('student.studentId = :admissionNumber', { admissionNumber });

    if (excludeUserId) {
      queryBuilder.andWhere('student.userId != :excludeUserId', { excludeUserId });
    }

    const count = await queryBuilder.getCount();
    return count > 0;
  }
}
