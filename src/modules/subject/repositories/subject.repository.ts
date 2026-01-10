import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { SubjectEntity } from '../entities/subject.entity';
import { QuerySubjectDto } from '../dto/query-subject.dto';

@Injectable()
export class SubjectRepository {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly repository: Repository<SubjectEntity>,
  ) {}

  async create(subjectData: Partial<SubjectEntity>): Promise<SubjectEntity> {
    const subject = this.repository.create(subjectData);
    return this.repository.save(subject);
  }

  async findById(id: string): Promise<SubjectEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByCode(code: string): Promise<SubjectEntity | null> {
    return this.repository.findOne({ where: { code } });
  }

  async findAll(): Promise<SubjectEntity[]> {
    return this.repository.find({ order: { createdAt: 'DESC' } });
  }

  async findWithPagination(query: QuerySubjectDto): Promise<[SubjectEntity[], number]> {
    
    const queryBuilder = this.createQueryBuilder();
    
    this.applyFilters(queryBuilder, query);
    
    this.applySorting(queryBuilder, query);
    
    // If limit is explicitly set to -1 or 0, return all records without pagination
    if (query.limit === -1 || query.limit === 0) {
      const [subjects, total] = await queryBuilder.getManyAndCount();
      return [subjects, total];
    }
    
    this.applyPagination(queryBuilder, query);
    const [subjects, total] = await queryBuilder.getManyAndCount();
    return [subjects, total];
  }

  async update(id: string, updateData: Partial<SubjectEntity>): Promise<void> {
    await this.repository.update(id, updateData);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  async remove(subject: SubjectEntity): Promise<void> {
    await this.repository.remove(subject);
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async countActive(): Promise<number> {
    return this.repository.count({ where: { isActive: true } });
  }

  async countByInstitute(instituteId: string): Promise<number> {
    return this.repository.count({ where: { instituteId } });
  }

  async countActiveByInstitute(instituteId: string): Promise<number> {
    return this.repository.count({ where: { instituteId, isActive: true } });
  }

  async findByIdAndInstitute(id: string, instituteId: string): Promise<SubjectEntity | null> {
    return this.repository.findOne({ where: { id, instituteId } });
  }

  async findByCodeAndInstitute(code: string, instituteId: string): Promise<SubjectEntity | null> {
    return this.repository.findOne({ where: { code, instituteId } });
  }

  async getSubjectsByCategory(): Promise<{ category: string; count: number }[]> {
    const result = await this.repository
      .createQueryBuilder('subject')
      .select('subject.category as category, COUNT(*) as count')
      .where('subject.isActive = :isActive', { isActive: true })
      .groupBy('subject.category')
      .getRawMany();

    return result.map(item => ({
      category: item.category || 'Uncategorized',
      count: parseInt(item.count)
    }));
  }

  async getSubjectsByCategoryAndInstitute(instituteId: string): Promise<{ category: string; count: number }[]> {
    const result = await this.repository
      .createQueryBuilder('subject')
      .select('subject.category as category, COUNT(*) as count')
      .where('subject.isActive = :isActive', { isActive: true })
      .andWhere('subject.instituteId = :instituteId', { instituteId })
      .groupBy('subject.category')
      .getRawMany();

    return result.map(item => ({
      category: item.category || 'Uncategorized',
      count: parseInt(item.count)
    }));
  }

  private createQueryBuilder(): SelectQueryBuilder<SubjectEntity> {
    return this.repository.createQueryBuilder('subject');
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<SubjectEntity>, query: QuerySubjectDto): void {
    const { search, category, isActive, instituteId, classId, subjectId, subjectType, basketCategory } = query;

    // Basic subject filters
    if (search) {
      queryBuilder.andWhere(
        '(subject.code LIKE :search OR subject.name LIKE :search OR subject.description LIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (category) {
      queryBuilder.andWhere('subject.category LIKE :category', { category: `%${category}%` });
    }

    if (subjectType) {
      queryBuilder.andWhere('subject.subjectType = :subjectType', { subjectType });
    }

    if (basketCategory) {
      queryBuilder.andWhere('subject.basketCategory = :basketCategory', { basketCategory });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('subject.isActive = :isActive', { isActive });
    }

    // Filter by institute ID (direct filter on subject table)
    if (instituteId) {
      queryBuilder.andWhere('subject.instituteId = :instituteId', { instituteId });
    }

    // Filter by specific subject ID
    if (subjectId) {
      queryBuilder.andWhere('subject.id = :subjectId', { subjectId });
    }

    // Class filtering - join with institute_class_subjects table only if classId is provided
    if (classId) {
      // Join with the institute_class_subjects table to filter by class assignments
      queryBuilder
        .leftJoin('subject.classSubjects', 'classSubject')
        .andWhere('classSubject.isActive = :classSubjectActive', { classSubjectActive: true })
        .andWhere('classSubject.classId = :classId', { classId });

      // Ensure we get distinct subjects (avoid duplicates from multiple class assignments)
      queryBuilder.distinct(true);
    }
  }

  private applySorting(queryBuilder: SelectQueryBuilder<SubjectEntity>, query: QuerySubjectDto): void {
    const { sortBy, sortOrder } = query;
    const sortField = sortBy || 'createdAt';
    const order = sortOrder || 'DESC';
    queryBuilder.orderBy(`subject.${sortField}`, order);
  }

  private applyPagination(queryBuilder: SelectQueryBuilder<SubjectEntity>, query: QuerySubjectDto): void {
    const { page, limit } = query;
    const pageNumber = page ?? 1;
    const limitNumber = limit ?? 50; // Increased default limit from 10 to 50
    const skip = (pageNumber - 1) * limitNumber;
    queryBuilder.skip(skip).take(limitNumber);
  }
}
