import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InstituteClassStudentEntity } from '../entities/institute_class_student.entity';
import { 
  IInstituteClassStudentRepository,
  IInstituteClassStudentCriteria,
  ICreateInstituteClassStudent,
  IUpdateInstituteClassStudent,
  IBulkCreateInstituteClassStudent,
  IBulkDeleteCriteria,
  IFindAllOptions 
} from '../interfaces/institute-class-student.interface';
import { INSTITUTE_CLASS_STUDENT_CONSTANTS } from '../constants/institute-class-student.constants';

@Injectable()
export class InstituteClassStudentRepository implements IInstituteClassStudentRepository {
  constructor(
    @InjectRepository(InstituteClassStudentEntity)
    private readonly repository: Repository<InstituteClassStudentEntity>,
  ) {}

  // High-performance method to get students in a class with minimal data
  async getStudentsInClass(classId: string, options: { skip?: number; take?: number; activeOnly?: boolean } = {}): Promise<any[]> {
    const queryBuilder = this.repository.createQueryBuilder('ics')
      .select([
        'ics.studentUserId',
        'ics.isActive',
        'ics.createdAt',
        'u.firstName',
        'u.lastName',
        'u.email',
        'u.phoneNumber',
        's.studentId'
      ])
      .innerJoin('ics.student', 's')
      .innerJoin('s.user', 'u')
      .where('ics.classId = :classId', { classId });

    if (options.activeOnly !== false) {
      queryBuilder.andWhere('ics.isActive = true');
    }

    if (options.skip) {
      queryBuilder.skip(options.skip);
    }

    if (options.take) {
      queryBuilder.take(options.take);
    }

    return await queryBuilder.getRawMany();
  }

  // High-performance method to get classes enrolled by a student
  async getStudentClasses(studentUserId: string, options: { skip?: number; take?: number; activeOnly?: boolean } = {}): Promise<any[]> {
    const queryBuilder = this.repository.createQueryBuilder('ics')
      .select([
        'ics.classId as ics_institute_class_id',
        'ics.isActive as ics_is_active',
        'ics.createdAt as ics_created_at',
        'ics.isVerified as is_verified',
        'ics.createdAt as enrolled_date',
        'c.description as c_description',
        'c.name as className',
        'c.code as classCode',
        'c.grade as grade',
        'c.classTeacherId as teacher_id',
        'c.specialty as specialty',
        'c.academicYear as academic_year',
        'c.startDate as start_date',
        'c.endDate as end_date',
        'c.isActive as classIsActive',
        'c.imageUrl as imageUrl'
      ])
      .innerJoin('ics.class', 'c')
      .where('ics.studentUserId = :studentUserId', { studentUserId });

    if (options.activeOnly !== false) {
      queryBuilder.andWhere('ics.isActive = true AND c.isActive = true');
    }

    if (options.skip) {
      queryBuilder.skip(options.skip);
    }

    if (options.take) {
      queryBuilder.take(options.take);
    }

    return await queryBuilder.getRawMany();
  }

  // Ultra-optimized with advanced filtering: Get student classes with specific filters
  async getStudentClassesWithFilters(
    studentUserId: string, 
    filters: { 
      skip?: number; 
      take?: number; 
      activeOnly?: boolean;
      instituteId?: string;
      verifiedOnly?: boolean;
      enrollmentMethod?: string;
    } = {}
  ): Promise<any> {
    const queryBuilder = this.repository.createQueryBuilder('ics')
      .select([
        'ics.studentUserId',
        'ics.instituteId', 
        'ics.classId',
        'ics.isActive',
        'ics.isVerified',
        'ics.createdAt as enrolledAt',
        'ics.enrollmentMethod',
        'ics.verifiedBy',
        'ics.verifiedAt',
        'c.name as className',
        'c.description as classDescription',
        'c.code as classCode',
        'c.grade as grade',
        'c.classTeacherId as teacher_id',
        'c.specialty as specialty',
        'c.academicYear as academic_year',
        'c.startDate as start_date',
        'c.endDate as end_date',
        'i.name as instituteName',
        'i.code as instituteCode',
        // Add enrollment status as derived field
        `CASE 
          WHEN ics.isVerified = true THEN 'verified'
          WHEN ics.isVerified = false THEN 'pending'
          ELSE 'unknown'
        END as enrollmentStatus`,
        // Add access permission flag
        `CASE 
          WHEN ics.isVerified = true AND ics.isActive = true THEN true
          ELSE false
        END as hasAccess`
      ])
      .innerJoin('ics.class', 'c')
      .innerJoin('ics.institute', 'i')
      .where('ics.studentUserId = :studentUserId', { studentUserId });

    // Apply base filters
    if (filters.activeOnly) {
      queryBuilder.andWhere('ics.isActive = :isActive', { isActive: true });
    }

    // UPDATED: verifiedOnly now optional - by default show all (verified + pending)
    if (filters.verifiedOnly === true) {
      queryBuilder.andWhere('ics.isVerified = :isVerified', { isVerified: true });
    } else if (filters.verifiedOnly === false) {
      queryBuilder.andWhere('ics.isVerified = :isVerified', { isVerified: false });
    }
    // If verifiedOnly is undefined, show all enrollments (verified + unverified)

    // Apply advanced filters
    if (filters.instituteId) {
      queryBuilder.andWhere('ics.instituteId = :instituteId', { instituteId: filters.instituteId });
    }

    if (filters.enrollmentMethod) {
      queryBuilder.andWhere('ics.enrollmentMethod = :enrollmentMethod', { enrollmentMethod: filters.enrollmentMethod });
    }

    // Pagination
    if (filters.skip) {
      queryBuilder.skip(filters.skip);
    }

    if (filters.take) {
      queryBuilder.take(filters.take);
    }

    // Optimized ordering
    queryBuilder.orderBy('ics.createdAt', 'DESC')
             .addOrderBy('c.name', 'ASC');

    const [results, total] = await Promise.all([
      queryBuilder.getRawMany(),
      queryBuilder.getCount()
    ]);
    
    // Return structured response with metadata
    return {
      data: results,
      pagination: {
        page: filters.skip ? Math.floor(filters.skip / (filters.take || 10)) + 1 : 1,
        limit: filters.take || 10,
        total,
        totalPages: Math.ceil(total / (filters.take || 10))
      },
      filters: {
        instituteId: filters.instituteId,
        verifiedOnly: filters.verifiedOnly,
        enrollmentMethod: filters.enrollmentMethod,
        activeOnly: filters.activeOnly
      }
    };
  }

  // Ultra-optimized enrolled classes method - single join with institute_class only
  async getStudentEnrolledClassesWithFilters(
    studentUserId: string, 
    filters: { 
      skip?: number; 
      take?: number; 
      activeOnly?: boolean;
      instituteId?: string;
      verifiedOnly?: boolean;
      enrollmentMethod?: string;
    } = {}
  ): Promise<any> {
    const queryBuilder = this.repository.createQueryBuilder('ics')
      .select([
        'ics.classId as ics_institute_class_id',
        'ics.isActive as ics_is_active',
        'ics.createdAt as ics_created_at',
        'ics.isVerified as is_verified',
        'ics.createdAt as enrolled_date',
        'ics.enrollmentMethod as enrollment_method',
        'c.description as c_description',
        'c.name as className',
        'c.code as classCode',
        'c.grade as grade',
        'c.classTeacherId as teacher_id',
        'c.specialty as specialty',
        'c.academicYear as academic_year',
        'c.startDate as start_date',
        'c.endDate as end_date',
        'c.isActive as classIsActive',
        'c.imageUrl as imageUrl'
      ])
      .innerJoin('ics.class', 'c') // Only join with institute_class table
      .where('ics.studentUserId = :studentUserId', { studentUserId });

    // Apply base filters
    if (filters.activeOnly) {
      queryBuilder.andWhere('ics.isActive = true AND c.isActive = true');
    }

    if (filters.verifiedOnly) {
      queryBuilder.andWhere('ics.isVerified = true');
    }

    // Apply advanced filters
    if (filters.instituteId) {
      queryBuilder.andWhere('ics.instituteId = :instituteId', { instituteId: filters.instituteId });
    }

    if (filters.enrollmentMethod) {
      queryBuilder.andWhere('ics.enrollmentMethod = :enrollmentMethod', { enrollmentMethod: filters.enrollmentMethod });
    }

    // Pagination
    if (filters.skip) {
      queryBuilder.skip(filters.skip);
    }

    if (filters.take) {
      queryBuilder.take(filters.take);
    }

    // Optimized ordering
    queryBuilder.orderBy('ics.createdAt', 'DESC')
             .addOrderBy('c.name', 'ASC');

    return await queryBuilder.getRawMany();
  }

  // Optimized exists check
  async exists(criteria: IInstituteClassStudentCriteria): Promise<boolean> {
    const queryBuilder = this.repository.createQueryBuilder('ics')
      .select('1')
      .where('ics.instituteId = :instituteId', { instituteId: criteria.instituteId })
      .andWhere('ics.classId = :classId', { classId: criteria.classId })
      .andWhere('ics.studentUserId = :studentUserId', { studentUserId: criteria.studentUserId });

    const result = await queryBuilder.getRawOne();
    return !!result;
  }

  // Optimized count
  async count(criteria: Partial<IInstituteClassStudentCriteria> = {}): Promise<number> {
    const queryBuilder = this.repository.createQueryBuilder('ics');

    if (criteria.instituteId) {
      queryBuilder.andWhere('ics.instituteId = :instituteId', { instituteId: criteria.instituteId });
    }

    if (criteria.classId) {
      queryBuilder.andWhere('ics.classId = :classId', { classId: criteria.classId });
    }

    if (criteria.studentUserId) {
      queryBuilder.andWhere('ics.studentUserId = :studentUserId', { studentUserId: criteria.studentUserId });
    }

    return await queryBuilder.getCount();
  }

  async findAll(options: IFindAllOptions = {}): Promise<InstituteClassStudentEntity[]> {
    const queryBuilder = this.repository.createQueryBuilder('ics');
    
    if (options.withRelations || options.relations) {
      const relations = options.relations || INSTITUTE_CLASS_STUDENT_CONSTANTS.RELATIONS.ALL;
      
      // Load base relations first
      const baseRelations = relations.filter(rel => !rel.includes('.'));
      baseRelations.forEach(relation => {
        queryBuilder.leftJoinAndSelect(`ics.${relation}`, relation);
      });
      
      // Load nested relations
      const nestedRelations = relations.filter(rel => rel.includes('.'));
      nestedRelations.forEach(relation => {
        const alias = relation.replace('.', '_'); // student.user -> student_user
        queryBuilder.leftJoinAndSelect(relation, alias);
      });
    }

    if (options.where) {
      queryBuilder.where(options.where);
    }

    if (options.order) {
      queryBuilder.orderBy(options.order);
    }

    if (options.skip) {
      queryBuilder.skip(options.skip);
    }

    if (options.take) {
      queryBuilder.take(options.take);
    }

    return await queryBuilder.getMany();
  }

  async findOne(criteria: IInstituteClassStudentCriteria): Promise<InstituteClassStudentEntity | null> {
    return await this.repository.findOne({
      where: {
        instituteId: criteria.instituteId,
        classId: criteria.classId,
        studentUserId: criteria.studentUserId,
      },
      relations: ['institute', 'class', 'student'],
    });
  }

  async create(data: ICreateInstituteClassStudent): Promise<InstituteClassStudentEntity> {
    const entity = this.repository.create({
      ...data,
      isActive: data.isActive ?? INSTITUTE_CLASS_STUDENT_CONSTANTS.DEFAULTS.IS_ACTIVE,
      isVerified: true, // Admin/teacher assignments are auto-verified
    });
    return await this.repository.save(entity);
  }

  async update(
    criteria: IInstituteClassStudentCriteria,
    data: IUpdateInstituteClassStudent,
  ): Promise<InstituteClassStudentEntity> {
    await this.repository.update(
      {
        instituteId: criteria.instituteId,
        classId: criteria.classId,
        studentUserId: criteria.studentUserId,
      },
      data,
    );
    
    const updated = await this.findOne(criteria);
    if (!updated) {
      throw new Error(INSTITUTE_CLASS_STUDENT_CONSTANTS.ERRORS.NOT_FOUND);
    }
    return updated;
  }

  async delete(criteria: IInstituteClassStudentCriteria): Promise<boolean> {
    const result = await this.repository.delete({
      instituteId: criteria.instituteId,
      classId: criteria.classId,
      studentUserId: criteria.studentUserId,
    });
    return result.affected! > 0;
  }

  async bulkCreate(data: IBulkCreateInstituteClassStudent): Promise<InstituteClassStudentEntity[]> {
    const entities = data.studentUserIds.map(studentUserId => 
      this.repository.create({
        instituteId: data.instituteId,
        classId: data.classId,
        studentUserId,
        isActive: data.isActive ?? INSTITUTE_CLASS_STUDENT_CONSTANTS.DEFAULTS.IS_ACTIVE,
        isVerified: true, // Admin/teacher assignments are auto-verified
      })
    );
    return await this.repository.save(entities);
  }

  async bulkDelete(criteria: IBulkDeleteCriteria): Promise<boolean> {
    const deleteConditions: any = {
      instituteId: criteria.instituteId,
    };

    if (criteria.classId) {
      deleteConditions.classId = criteria.classId;
    }

    if (criteria.studentUserIds && criteria.studentUserIds.length > 0) {
      deleteConditions.studentUserId = In(criteria.studentUserIds);
    }

    const result = await this.repository.delete(deleteConditions);
    return result.affected! > 0;
  }

  async findByInstitute(
    instituteId: string,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassStudentEntity[]> {
    return await this.findAll({
      ...options,
      where: { ...options.where, instituteId },
    });
  }

  async findByClass(
    classId: string,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassStudentEntity[]> {
    return await this.findAll({
      ...options,
      where: { ...options.where, classId },
    });
  }

  async findByStudent(
    studentUserId: string,
    options: IFindAllOptions = {}
  ): Promise<InstituteClassStudentEntity[]> {
    return await this.findAll({
      ...options,
      where: { ...options.where, studentUserId },
    });
  }
}
