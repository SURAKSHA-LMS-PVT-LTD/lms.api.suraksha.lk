import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { InstituteClassSubjectEntity } from '../entities/institute_class_subject.entity';
import { IInstituteClassSubjectRepository, IInstituteClassSubject, IInstituteClassSubjectStats, IInstituteClassSubjectWithRelations } from '../interfaces/institute-class-subject.interface';

@Injectable()
export class InstituteClassSubjectRepository implements IInstituteClassSubjectRepository {
  constructor(
    @InjectRepository(InstituteClassSubjectEntity)
    private readonly repository: Repository<InstituteClassSubjectEntity>,
  ) {}

  async findByInstituteAndClass(instituteId: string, classId: string): Promise<IInstituteClassSubject[]> {
    return this.repository
      .createQueryBuilder('ics')
      .select([
        'ics.instituteId',
        'ics.classId',
        'ics.subjectId',
        'ics.teacherId',
        'ics.isActive',
        'ics.createdAt',
        'ics.updatedAt',
        'subject.id',
        'subject.name',
        'subject.code',
        'subject.category',
        'subject.description'
      ])
      .leftJoin('ics.subject', 'subject')
      .where('ics.instituteId = :instituteId', { instituteId })
      .andWhere('ics.classId = :classId', { classId })
      .andWhere('ics.isActive = :isActive', { isActive: true })
      .orderBy('subject.name', 'ASC')
      .getMany();
  }

  async findByTeacher(teacherId: string): Promise<IInstituteClassSubject[]> {
    return this.repository
      .createQueryBuilder('ics')
      .select([
        'ics.instituteId',
        'ics.classId',
        'ics.subjectId',
        'ics.teacherId',
        'ics.isActive',
        'ics.createdAt',
        'ics.updatedAt',
        'subject.id',
        'subject.name',
        'subject.code',
        'subject.category'
      ])
      .leftJoin('ics.subject', 'subject')
      .where('ics.teacherId = :teacherId', { teacherId })
      .andWhere('ics.isActive = :isActive', { isActive: true })
      .orderBy('ics.createdAt', 'DESC')
      .getMany();
  }

  async findByInstituteAndTeacher(instituteId: string, teacherId: string): Promise<IInstituteClassSubject[]> {
    return this.repository
      .createQueryBuilder('ics')
      .select([
        'ics.instituteId',
        'ics.classId', 
        'ics.subjectId',
        'ics.teacherId',
        'ics.isActive',
        'ics.createdAt',
        'ics.updatedAt',
        'subject.id',
        'subject.name',
        'subject.code',
        'subject.category',
        'class.id',
        'class.name',
        'class.grade',
        'class.specialty',
        'class.classTeacherId'
      ])
      .leftJoin('ics.subject', 'subject')
      .leftJoin('ics.class', 'class')
      .where('ics.instituteId = :instituteId', { instituteId })
      .andWhere('ics.teacherId = :teacherId', { teacherId })
      .andWhere('ics.isActive = :isActive', { isActive: true })
      .orderBy('ics.createdAt', 'DESC')
      .getMany();
  }

  async findByInstituteClassAndTeacher(
    instituteId: string, 
    classId: string, 
    teacherId: string
  ): Promise<IInstituteClassSubject[]> {
    return this.repository
      .createQueryBuilder('ics')
      .select([
        'ics.instituteId',
        'ics.classId',
        'ics.subjectId', 
        'ics.teacherId',
        'ics.isActive',
        'ics.createdAt',
        'ics.updatedAt',
        // Complete subject details for SubjectResponseDto
        'subject.id',
        'subject.code',
        'subject.name',
        'subject.description',
        'subject.category',
        'subject.creditHours',
        'subject.isActive',
        'subject.subjectType',
        'subject.basketCategory',
        'subject.instituteId',
        'subject.imgUrl',
        'subject.createdAt',
        'subject.updatedAt'
      ])
      .leftJoin('ics.subject', 'subject')
      .where('ics.instituteId = :instituteId', { instituteId })
      .andWhere('ics.classId = :classId', { classId })
      .andWhere('ics.teacherId = :teacherId', { teacherId })
      .andWhere('ics.isActive = :isActive', { isActive: true })
      .orderBy('subject.name', 'ASC')
      .getMany();
  }

  async findByInstitute(instituteId: string): Promise<IInstituteClassSubject[]> {
    return this.repository
      .createQueryBuilder('ics')
      .select([
        'ics.instituteId',
        'ics.classId',
        'ics.subjectId',
        'ics.teacherId',
        'ics.isActive',
        'ics.createdAt',
        'ics.updatedAt',
        'subject.id',
        'subject.name',
        'subject.code',
        'subject.category'
      ])
      .leftJoin('ics.subject', 'subject')
      .where('ics.instituteId = :instituteId', { instituteId })
      .andWhere('ics.isActive = :isActive', { isActive: true })
      .orderBy('ics.createdAt', 'DESC')
      .getMany();
  }

  async findByInstituteClassAndSubject(
    instituteId: string, 
    classId: string, 
    subjectId: string
  ): Promise<IInstituteClassSubjectWithRelations | null> {
    return this.repository.findOne({
      where: { instituteId, classId, subjectId },
      relations: ['subject'],
    });
  }

  async existsByInstituteClassAndSubject(
    instituteId: string,
    classId: string,
    subjectId: string,
  ): Promise<boolean> {
    const count = await this.repository.count({
      where: { instituteId, classId, subjectId },
    });
    return count > 0;
  }

  async getStats(instituteId?: string): Promise<IInstituteClassSubjectStats> {
    const queryBuilder = this.repository.createQueryBuilder('ics');
    
    if (instituteId) {
      queryBuilder.where('ics.instituteId = :instituteId', { instituteId });
    }

    const [totalSubjects, activeSubjects, inactiveSubjects, subjectsWithTeachers] = await Promise.all([
      queryBuilder.getCount(),
      queryBuilder.andWhere('ics.isActive = :isActive', { isActive: true }).getCount(),
      queryBuilder.andWhere('ics.isActive = :isActive', { isActive: false }).getCount(),
      queryBuilder.andWhere('ics.teacherId IS NOT NULL').getCount(),
    ]);

    return {
      totalSubjects,
      activeSubjects,
      inactiveSubjects,
      subjectsWithTeachers,
      subjectsWithoutTeachers: totalSubjects - subjectsWithTeachers,
    };
  }

  async findOneWithRelations(instituteId: string, classId: string, subjectId: string): Promise<InstituteClassSubjectEntity | null> {
    return this.repository
      .createQueryBuilder('ics')
      .select([
        'ics.instituteId',
        'ics.classId',
        'ics.subjectId',
        'ics.teacherId',
        'ics.isActive',
        'ics.enrollmentEnabled',
        'ics.enrollmentKey',
        'ics.createdAt',
        'ics.updatedAt',
        'subject.id',
        'subject.name',
        'subject.code',
        'subject.category',
        'subject.description',
        // Teacher details
        'teacher.id',
        'teacher.firstName',
        'teacher.lastName',
        'teacher.nameWithInitials',
        'teacher.email',
        'teacher.imageUrl'
      ])
      .leftJoin('ics.subject', 'subject')
      .leftJoin('ics.teacher', 'teacher')
      .where('ics.instituteId = :instituteId', { instituteId })
      .andWhere('ics.classId = :classId', { classId })
      .andWhere('ics.subjectId = :subjectId', { subjectId })
      .getOne();
  }

  async create(data: Partial<InstituteClassSubjectEntity>): Promise<InstituteClassSubjectEntity> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  // Optimized create method that doesn't return the full entity
  async createOptimized(data: Partial<InstituteClassSubjectEntity>): Promise<void> {
    const entity = this.repository.create(data);
    await this.repository.save(entity);
  }

  async update(
    instituteId: string,
    classId: string,
    subjectId: string,
    data: Partial<InstituteClassSubjectEntity>,
  ): Promise<InstituteClassSubjectEntity> {
    // Log the update operation for debugging

    const updateResult = await this.repository.update(
      { 
        instituteId: instituteId,
        classId: classId,
        subjectId: subjectId
      },
      data,
    );

    const updated = await this.findOneWithRelations(instituteId, classId, subjectId);
    if (!updated) {
      throw new NotFoundException('Institute class subject not found');
    }
    
    return updated;
  }

  async delete(instituteId: string, classId: string, subjectId: string): Promise<void> {
    const result = await this.repository.delete({ instituteId, classId, subjectId });
    if (result.affected === 0) {
      throw new NotFoundException('Institute class subject not found');
    }
  }

  async findWithPagination(
    page: number,
    limit: number,
    filters: any = {},
  ): Promise<{ data: InstituteClassSubjectEntity[]; total: number }> {
    const queryBuilder = this.repository.createQueryBuilder('ics')
      .leftJoinAndSelect('ics.subject', 'subject')
      .leftJoinAndSelect('ics.teacher', 'teacher')
      .select([
        'ics.instituteId',
        'ics.classId',
        'ics.subjectId',
        'ics.teacherId',
        'ics.isActive',
        'ics.createdAt',
        'ics.updatedAt',
        // Complete subject details for SubjectResponseDto
        'subject.id',
        'subject.code',
        'subject.name',
        'subject.description',
        'subject.category',
        'subject.creditHours',
        'subject.isActive',
        'subject.subjectType',
        'subject.basketCategory',
        'subject.instituteId',
        'subject.imgUrl',
        'subject.createdAt',
        'subject.updatedAt',
        // Teacher details
        'teacher.id',
        'teacher.firstName',
        'teacher.lastName',
        'teacher.nameWithInitials',
        'teacher.email',
        'teacher.imageUrl'
      ]);

    // Apply filters
    if (filters.instituteId) {
      queryBuilder.andWhere('ics.instituteId = :instituteId', { instituteId: filters.instituteId });
    }

    if (filters.classId) {
      queryBuilder.andWhere('ics.classId = :classId', { classId: filters.classId });
    }

    if (filters.subjectId) {
      queryBuilder.andWhere('ics.subjectId = :subjectId', { subjectId: filters.subjectId });
    }

    if (filters.teacherId) {
      queryBuilder.andWhere('ics.teacherId = :teacherId', { teacherId: filters.teacherId });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('ics.isActive = :isActive', { isActive: filters.isActive });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(subject.name LIKE :search OR subject.code LIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    // Apply sorting
    if (filters.sortBy) {
      queryBuilder.orderBy(`ics.${filters.sortBy}`, filters.sortOrder || 'ASC');
    } else {
      queryBuilder.orderBy('ics.createdAt', 'DESC');
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    queryBuilder.skip(offset).take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return { data, total };
  }
}
