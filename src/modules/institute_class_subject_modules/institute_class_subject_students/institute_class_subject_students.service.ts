import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In } from 'typeorm';
import { getCurrentSriLankaTime, getCurrentSriLankaISO } from '../../../common/utils/timezone.util';
import { CreateInstituteClassSubjectStudentDto } from './dto/create-institute_class_subject_student.dto';
import { UpdateInstituteClassSubjectStudentDto } from './dto/update-institute_class_subject_student.dto';
import { QueryInstituteClassSubjectStudentDto, BulkEnrollStudentsDto } from './dto/query-institute_class_subject_student.dto';
import { InstituteClassSubjectStudentResponseDto } from './dto/institute_class_subject_student-response.dto';
import { SubjectParentResponseDto, SubjectParentQueryDto, PaginatedSubjectParentResponseDto } from './dto/subject-parent-response.dto';
import { SelfEnrollDto, SelfEnrollResponseDto } from './dto/self-enroll.dto';
import { TeacherAssignStudentsDto, TeacherAssignResponseDto } from './dto/teacher-assign.dto';
import { UpdateEnrollmentSettingsDto, EnrollmentSettingsResponseDto } from './dto/enrollment-settings.dto';
import { InstituteClassSubjectStudent } from './entities/institute_class_subject_student.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { SubjectEntity } from '../../subject/entities/subject.entity';
import { SubjectResponseDto } from '../../subject/dto/subject-response.dto';
import { InstituteClassSubjectEntity } from '../../institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { maskPhoneNumber } from '../../../common/utils/phone-mask.util';
import { UserType } from '../../user/enums/user-type.enum';
import { UserManagementService } from '../../../common/services/cache-user-management.service';
import * as crypto from 'crypto';

@Injectable()
export class InstituteClassSubjectStudentsService {
  constructor(
    @InjectRepository(InstituteClassSubjectStudent)
    private readonly studentRepository: Repository<InstituteClassSubjectStudent>,
    @InjectRepository(StudentEntity)
    private readonly studentEntityRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepository: Repository<SubjectEntity>,
    @InjectRepository(InstituteClassSubjectEntity)
    private readonly classSubjectRepository: Repository<InstituteClassSubjectEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepository: Repository<InstituteClassStudentEntity>,
    private readonly userManagementService: UserManagementService,
  ) {}

  async create(createDto: CreateInstituteClassSubjectStudentDto): Promise<InstituteClassSubjectStudentResponseDto> {
    try {
      // Check if the student is already enrolled in this class subject
      const existingEnrollment = await this.studentRepository.findOne({
        where: {
          instituteId: createDto.instituteId,
          classId: createDto.classId,
          subjectId: createDto.subjectId,
          studentId: createDto.studentId,
        },
      });

      if (existingEnrollment) {
        throw new ConflictException('Student is already enrolled in this class subject');
      }

      const timestamp = getCurrentSriLankaISO();
      const studentData = {
        instituteId: createDto.instituteId,
        classId: createDto.classId,
        subjectId: createDto.subjectId,
        studentId: createDto.studentId,
        isActive: createDto.isActive ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const student = this.studentRepository.create(studentData);
      const savedStudent = await this.studentRepository.save(student);

      // Refresh student cache after subject enrollment
      await this.userManagementService.refreshUserCache(createDto.studentId);

      return InstituteClassSubjectStudentResponseDto.fromEntity(savedStudent);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(`Failed to enroll student: ${error.message}`);
    }
  }

  async findAll(queryDto: QueryInstituteClassSubjectStudentDto): Promise<PaginatedResponseDto<InstituteClassSubjectStudentResponseDto>> {
    const { page = 1, limit = 10, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.studentRepository
      .createQueryBuilder('enrollment')
      .leftJoin('enrollment.student', 'student')
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email',
        'student.isActive'
      ]);

    this.applyFilters(queryBuilder, filters);

    const [enrollments, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('enrollment.createdAt', 'DESC')
      .getManyAndCount();

    const enrollmentDtos = enrollments.map(enrollment => 
      InstituteClassSubjectStudentResponseDto.fromEntity(enrollment)
    );

    return new PaginatedResponseDto(enrollmentDtos, page, limit, total);
  }

  async findOne(instituteId: string, classId: string, subjectId: string, studentId: string): Promise<InstituteClassSubjectStudentResponseDto> {
    const enrollment = await this.studentRepository
      .createQueryBuilder('enrollment')
      .leftJoin('enrollment.student', 'student')
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email',
        'student.isActive'
      ])
      .where('enrollment.instituteId = :instituteId', { instituteId })
      .andWhere('enrollment.classId = :classId', { classId })
      .andWhere('enrollment.subjectId = :subjectId', { subjectId })
      .andWhere('enrollment.studentId = :studentId', { studentId })
      .getOne();

    if (!enrollment) {
      throw new NotFoundException(`Student enrollment not found`);
    }

    return InstituteClassSubjectStudentResponseDto.fromEntity(enrollment);
  }

  async findOneWithDetails(instituteId: string, classId: string, subjectId: string, studentId: string): Promise<any> {
    const enrollment = await this.studentRepository
      .createQueryBuilder('enrollment')
      .select([
        'enrollment.id',
        'enrollment.instituteId',
        'enrollment.classId',
        'enrollment.subjectId',
        'enrollment.studentId',
        'enrollment.enrollmentDate',
        'enrollment.isActive'
      ])
      .leftJoin('enrollment.institute', 'institute')
      .addSelect([
        'institute.id',
        'institute.name'
      ])
      .leftJoin('enrollment.class', 'class')
      .addSelect([
        'class.id',
        'class.name'
      ])
      .leftJoin('enrollment.subject', 'subject')
      .addSelect([
        'subject.id',
        'subject.name'
      ])
      .leftJoin('enrollment.student', 'student')
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email'
      ])
      .where('enrollment.instituteId = :instituteId', { instituteId })
      .andWhere('enrollment.classId = :classId', { classId })
      .andWhere('enrollment.subjectId = :subjectId', { subjectId })
      .andWhere('enrollment.studentId = :studentId', { studentId })
      .getOne();

    if (!enrollment) {
      throw new NotFoundException(`Student enrollment not found`);
    }

    return enrollment; // Return full entity with all relations
  }

  async update(instituteId: string, classId: string, subjectId: string, studentId: string, updateDto: UpdateInstituteClassSubjectStudentDto): Promise<InstituteClassSubjectStudentResponseDto> {
    const enrollment = await this.studentRepository.findOne({
      where: {
        instituteId,
        classId,
        subjectId,
        studentId,
      },
    });
    
    if (!enrollment) {
      throw new NotFoundException(`Student enrollment not found`);
    }

    try {
      const updateData: any = {};
      
      if (updateDto.isActive !== undefined) updateData.isActive = updateDto.isActive;

      await this.studentRepository.update(
        { instituteId, classId, subjectId, studentId },
        updateData
      );
      
      return await this.findOne(instituteId, classId, subjectId, studentId);
    } catch (error) {
      throw new BadRequestException(`Failed to update student enrollment: ${error.message}`);
    }
  }

  async remove(instituteId: string, classId: string, subjectId: string, studentId: string): Promise<void> {
    const enrollment = await this.studentRepository.findOne({
      where: {
        instituteId,
        classId,
        subjectId,
        studentId,
      },
    });
    
    if (!enrollment) {
      throw new NotFoundException(`Student enrollment not found`);
    }

    await this.studentRepository.delete({
      instituteId,
      classId,
      subjectId,
      studentId,
    });

    // Refresh student cache after removing subject enrollment
    await this.userManagementService.refreshUserCache(studentId);
  }

  async bulkEnroll(bulkDto: BulkEnrollStudentsDto, user: any): Promise<InstituteClassSubjectStudentResponseDto[]> {
    try {
      // Determine enrollment method based on user role for backend tracking
      let enrollmentMethod: 'teacher_assigned' | 'self_enrolled' = 'teacher_assigned';
      
      // Access control will be handled by decorators
      enrollmentMethod = 'teacher_assigned'; // Keep the enum value valid

      const timestamp = getCurrentSriLankaISO();
      const enrollments = bulkDto.studentIds.map(studentId => {
        const enrollmentData = {
          instituteId: bulkDto.instituteId,
          classId: bulkDto.classId,
          subjectId: bulkDto.subjectId,
          studentId: studentId,
          isActive: bulkDto.isActive ?? true,
          enrollmentMethod: enrollmentMethod,
          enrolledBy: user.userId, // Track who performed the enrollment (from JWT)
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        return this.studentRepository.create(enrollmentData);
      });

      const savedEnrollments = await this.studentRepository.save(enrollments);

      // Refresh cache for all enrolled students
      for (const studentId of bulkDto.studentIds) {
        await this.userManagementService.refreshUserCache(studentId);
      }
      
      // Return standard response without exposing internal tracking fields
      return savedEnrollments.map(enrollment => 
        InstituteClassSubjectStudentResponseDto.fromEntity(enrollment)
      );
    } catch (error) {
      throw new BadRequestException(`Failed to bulk enroll students: ${error.message}`);
    }
  }

  // Get students in a specific class subject (teacher's view)
  async getStudentsInClassSubject(instituteId: string, classId: string, subjectId: string): Promise<InstituteClassSubjectStudentResponseDto[]> {
    const enrollments = await this.studentRepository
      .createQueryBuilder('enrollment')
      .select([
        'enrollment.id',
        'enrollment.instituteId',
        'enrollment.classId',
        'enrollment.subjectId',
        'enrollment.studentId',
        'enrollment.enrollmentDate',
        'enrollment.isActive'
      ])
      .leftJoin('enrollment.student', 'student')
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email'
      ])
      .where('enrollment.instituteId = :instituteId', { instituteId })
      .andWhere('enrollment.classId = :classId', { classId })
      .andWhere('enrollment.subjectId = :subjectId', { subjectId })
      .andWhere('enrollment.isActive = :isActive', { isActive: true })
      .orderBy('enrollment.createdAt', 'ASC')
      .getMany();

    return enrollments.map(enrollment => InstituteClassSubjectStudentResponseDto.fromEntity(enrollment));
  }

  // Get class subjects for a specific student (student's view)
  async getClassSubjectsForStudent(studentId: string): Promise<InstituteClassSubjectStudentResponseDto[]> {
    const enrollments = await this.studentRepository
      .createQueryBuilder('enrollment')
      .select([
        'enrollment.id',
        'enrollment.instituteId',
        'enrollment.classId',
        'enrollment.subjectId',
        'enrollment.studentId',
        'enrollment.enrollmentDate',
        'enrollment.isActive'
      ])
      .leftJoin('enrollment.student', 'student')
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email'
      ])
      .where('enrollment.studentId = :studentId', { studentId })
      .andWhere('enrollment.isActive = :isActive', { isActive: true })
      .orderBy('enrollment.createdAt', 'ASC')
      .getMany();

    return enrollments.map(enrollment => InstituteClassSubjectStudentResponseDto.fromEntity(enrollment));
  }

  async findAllRaw(): Promise<any[]> {
    return await this.studentRepository
      .createQueryBuilder('enrollment')
      .select([
        'enrollment.id',
        'enrollment.instituteId',
        'enrollment.classId',
        'enrollment.subjectId',
        'enrollment.studentId',
        'enrollment.enrollmentDate',
        'enrollment.isActive'
      ])
      .leftJoin('enrollment.institute', 'institute')
      .addSelect([
        'institute.id',
        'institute.name'
      ])
      .leftJoin('enrollment.class', 'class')
      .addSelect([
        'class.id',
        'class.name'
      ])
      .leftJoin('enrollment.subject', 'subject')
      .addSelect([
        'subject.id',
        'subject.name'
      ])
      .leftJoin('enrollment.student', 'student')
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email'
      ])
      .getMany();
  }

  async getStats(): Promise<any> {
    const total = await this.studentRepository.count();
    const active = await this.studentRepository.count({ where: { isActive: true } });
    
    const enrollmentsByInstitute = await this.studentRepository
      .createQueryBuilder('enrollment')
      .select('enrollment.instituteId', 'instituteId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('enrollment.instituteId')
      .getRawMany();

    return {
      total,
      active,
      inactive: total - active,
      byInstitute: enrollmentsByInstitute,
    };
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<InstituteClassSubjectStudent>, filters: any): void {
    if (filters.instituteId) {
      queryBuilder.andWhere('enrollment.instituteId = :instituteId', { instituteId: filters.instituteId });
    }

    if (filters.classId) {
      queryBuilder.andWhere('enrollment.classId = :classId', { classId: filters.classId });
    }

    if (filters.subjectId) {
      queryBuilder.andWhere('enrollment.subjectId = :subjectId', { subjectId: filters.subjectId });
    }

    if (filters.studentId) {
      queryBuilder.andWhere('enrollment.studentId = :studentId', { studentId: filters.studentId });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('enrollment.isActive = :isActive', { isActive: filters.isActive });
    }
  }

  // New methods for secure API endpoints

  /**
   * Get classes and subjects that a student is enrolled in
   * Returns class and subject details with joins to related tables
   * Used by the class/:classId/student/:studentId endpoint
   */
  async getStudentClassSubjects(instituteId: string, classId: string, studentId: string, page: number = 1, limit: number = 10): Promise<{ data: any[], total: number, page: number, limit: number }> {
    try {
      // Enhanced query with complete subject information for SubjectResponseDto
      const query = `
        SELECT 
          enrollment.institute_id as "instituteId",
          enrollment.class_id as "classId", 
          enrollment.subject_id as "subjectId",
          
          -- Get teacher and class status from institute_class_subjects (LEFT JOIN to include enrollments without teacher assignment)
          ics.teacher_id as "teacherId",
          ics.is_active as "classSubjectActive",
          
          -- Complete subject details for SubjectResponseDto
          subj.id as "subjectId",
          subj.code as "subjectCode",
          subj.name as "subjectName",
          subj.description as "subjectDescription",
          subj.category as "subjectCategory",
          subj.credit_hours as "creditHours",
          subj.is_active as "subjectIsActive",
          subj.subject_type as "subjectType",
          subj.basket_category as "basketCategory",
          subj.institute_id as "instituteId",
          subj.img_url as "imgUrl",
          subj.created_at as "subjectCreatedAt",
          subj.updated_at as "subjectUpdatedAt"
          
        FROM institute_class_subject_students enrollment
        LEFT JOIN institute_class_subjects ics ON (
          enrollment.institute_id = ics.institute_id AND 
          enrollment.class_id = ics.class_id AND 
          enrollment.subject_id = ics.subject_id
          AND ics.is_active = true
        )
        INNER JOIN subjects subj ON enrollment.subject_id = subj.id
        WHERE enrollment.institute_id = ?
        AND enrollment.class_id = ? 
        AND enrollment.student_id = ? 
        AND enrollment.is_active = true
      `;

      // Optimized count query with same joins for consistency
      const countQuery = `
        SELECT COUNT(*) as total
        FROM institute_class_subject_students enrollment
        LEFT JOIN institute_class_subjects ics ON (
          enrollment.institute_id = ics.institute_id AND 
          enrollment.class_id = ics.class_id AND 
          enrollment.subject_id = ics.subject_id
          AND ics.is_active = true
        )
        WHERE enrollment.institute_id = ?
        AND enrollment.class_id = ? 
        AND enrollment.student_id = ? 
        AND enrollment.is_active = true
      `;

      const countResult = await this.studentRepository.query(countQuery, [instituteId, classId, studentId]);
      const total = parseInt(countResult[0].total);

      // Apply pagination
      const offset = (page - 1) * limit;
      const paginatedQuery = query + ` LIMIT ? OFFSET ?`;
      const result = await this.studentRepository.query(paginatedQuery, [instituteId, classId, studentId, limit, offset]);

      // Return data with complete SubjectResponseDto structure
      const data = result.map((row: any) => ({
        instituteId: row.instituteId,
        classId: row.classId,
        subjectId: row.subjectId,
        teacherId: row.teacherId,
        classSubjectActive: Boolean(row.classSubjectActive),
        
        // Complete subject details using SubjectResponseDto structure
        subject: new SubjectResponseDto({
          id: row.subjectId,
          code: row.subjectCode,
          name: row.subjectName,
          description: row.subjectDescription,
          category: row.subjectCategory,
          creditHours: row.creditHours,
          isActive: Boolean(row.subjectIsActive),
          subjectType: row.subjectType,
          basketCategory: row.basketCategory,
          instituteId: row.instituteId,
          imgUrl: row.imgUrl,
          createdAt: row.subjectCreatedAt,
          updatedAt: row.subjectUpdatedAt
        })
      }));

      return {
        data,
        total,
        page,
        limit
      };
    } catch (error) {
      throw new BadRequestException(`Failed to get student class subjects: ${error.message}`);
    }
  }

  /**
   * Get teacher assigned class subjects with detailed information
   * Returns class and subject details with joins to related tables
   */
  async getTeacherClassSubjects(classId: string, teacherId: string, page: number = 1, limit: number = 10): Promise<{ data: any[], total: number, page: number, limit: number }> {
    try {
      // Count total records first
      const countQuery = `
        SELECT COUNT(*) as total
        FROM institute_class_subjects ics
        WHERE ics.class_id = ? 
        AND ics.teacher_id = ? 
        AND ics.is_active = true
      `;

      const countResult = await this.studentRepository.query(countQuery, [classId, teacherId]);
      const total = parseInt(countResult[0].total);

      // Optimized query with minimal data selection (no teacher JOIN)
      const query = `
        SELECT 
          ics.institute_id as "instituteId",
          ics.class_id as "classId", 
          ics.subject_id as "subjectId",
          ics.teacher_id as "teacherId",
          ics.is_active as "isActive",
          ics.created_at as "assignedAt",
          
          -- Subject details only (no teacher details)
          subj.name as "subjectName",
          subj.code as "subjectCode",
          subj.category as "subjectCategory",
          subj.description as "subjectDescription"
          
        FROM institute_class_subjects ics
        LEFT JOIN subjects subj ON ics.subject_id = subj.id
        WHERE ics.class_id = ? 
        AND ics.teacher_id = ? 
        AND ics.is_active = true
        LIMIT ? OFFSET ?
      `;

      const offset = (page - 1) * limit;
      const result = await this.studentRepository.query(query, [classId, teacherId, limit, offset]);

      // Return assignment data with required teacher fields (no teacher details JOIN)
      const data = result.map((row: any) => ({
        instituteId: row.instituteId,
        classId: row.classId,
        subjectId: row.subjectId,
        teacherId: row.teacherId,
        isActive: row.isActive,
        assignedAt: row.assignedAt,
        
        // Subject details only (no teacher details)
        subject: {
          id: row.subjectId,
          name: row.subjectName,
          code: row.subjectCode,
          category: row.subjectCategory,
          description: row.subjectDescription
        }
      }));

      return {
        data,
        total,
        page,
        limit
      };
    } catch (error) {
      throw new BadRequestException(`Failed to get teacher class subjects: ${error.message}`);
    }
  }

  /**
   * Get parents of students enrolled in class subjects with secure queries
   * Implements pagination, filtering, and security measures to avoid attacks
   * Uses specific field selection to avoid SELECT * queries
   */
  async getSubjectParents(queryDto: SubjectParentQueryDto): Promise<PaginatedSubjectParentResponseDto> {
    try {
      // Validate and sanitize pagination parameters
      const page = Math.max(1, queryDto.page || 1);
      const limit = Math.min(100, Math.max(1, queryDto.limit || 10)); // Max 100 items for security
      const skip = (page - 1) * limit;

      // Build secure query with specific field selection (avoid SELECT *)
      const queryBuilder = this.studentEntityRepository.createQueryBuilder('student')
        .leftJoin('student.user', 'student_user')
        .leftJoin('student.fatherParent', 'father_parent')
        .leftJoin('father_parent.user', 'father_user')
        .leftJoin('student.motherParent', 'mother_parent')
        .leftJoin('mother_parent.user', 'mother_user')
        .leftJoin('student.guardianParent', 'guardian_parent')
        .leftJoin('guardian_parent.user', 'guardian_user')
        .leftJoin(InstituteClassSubjectStudent, 'subject_enrollment', 
          'subject_enrollment.studentId = student.userId')
        .leftJoin(SubjectEntity, 'subject', 'subject.id = subject_enrollment.subjectId')
        .where('subject_enrollment.isActive = :isActive', { isActive: true })
        .select([
          // Student info - specific fields only
          'student.userId as student_user_id',
          'student_user.firstName as student_first_name',
          'student_user.lastName as student_last_name', 
          'student_user.email as student_email',
          'student_user.phoneNumber as student_phone',
          
          // Subject info - specific fields only
          'subject.id as subject_id',
          'subject.name as subject_name',
          'subject.code as subject_code',
          
          // Father info - specific fields only
          'father_parent.userId as father_user_id',
          'father_parent.occupation as father_occupation',
          'father_parent.workplace as father_workplace',
          'father_user.firstName as father_first_name',
          'father_user.lastName as father_last_name',
          'father_user.email as father_email',
          'father_user.phoneNumber as father_phone',
          'father_user.imageUrl as father_image',
          'father_user.gender as father_gender',
          
          // Mother info - specific fields only  
          'mother_parent.userId as mother_user_id',
          'mother_parent.occupation as mother_occupation',
          'mother_parent.workplace as mother_workplace',
          'mother_user.firstName as mother_first_name',
          'mother_user.lastName as mother_last_name',
          'mother_user.email as mother_email',
          'mother_user.phoneNumber as mother_phone',
          'mother_user.imageUrl as mother_image',
          'mother_user.gender as mother_gender',
          
          // Guardian info - specific fields only
          'guardian_parent.userId as guardian_user_id',
          'guardian_parent.occupation as guardian_occupation', 
          'guardian_parent.workplace as guardian_workplace',
          'guardian_user.firstName as guardian_first_name',
          'guardian_user.lastName as guardian_last_name',
          'guardian_user.email as guardian_email',
          'guardian_user.phoneNumber as guardian_phone',
          'guardian_user.imageUrl as guardian_image',
          'guardian_user.gender as guardian_gender'
        ]);

      // Apply secure filtering with parameter binding to prevent SQL injection
      if (queryDto.studentId) {
        queryBuilder.andWhere('student.userId = :studentId', { 
          studentId: queryDto.studentId.toString().replace(/[^\d]/g, '') // Sanitize numeric input
        });
      }

      if (queryDto.studentName) {
        const sanitizedStudentName = queryDto.studentName.replace(/[<>'"]/g, ''); // Basic XSS prevention
        queryBuilder.andWhere(
          '(student_user.firstName LIKE :studentName OR student_user.lastName LIKE :studentName)',
          { studentName: `%${sanitizedStudentName}%` }
        );
      }

      if (queryDto.parentName) {
        const sanitizedParentName = queryDto.parentName.replace(/[<>'"]/g, ''); // Basic XSS prevention
        queryBuilder.andWhere(`
          (father_user.firstName LIKE :parentName OR father_user.lastName LIKE :parentName OR
           mother_user.firstName LIKE :parentName OR mother_user.lastName LIKE :parentName OR
           guardian_user.firstName LIKE :parentName OR guardian_user.lastName LIKE :parentName)
        `, { parentName: `%${sanitizedParentName}%` });
      }

      // Get total count for pagination - secure count query
      const totalQuery = queryBuilder.clone();
      const totalResult = await totalQuery.getRawMany();
      const total = totalResult.length;

      // Apply pagination to main query
      const results = await queryBuilder
        .skip(skip)
        .take(limit)
        .getRawMany();

      // Transform results to parent-centric format - each parent gets separate entry
      const parents: SubjectParentResponseDto[] = [];

      results.forEach((row: any) => {
        const student = {
          userId: row.student_user_id,
          firstName: row.student_first_name,
          lastName: row.student_last_name,
          email: row.student_email,
          phoneNumber: maskPhoneNumber(row.student_phone)
        };

        const subject = {
          id: row.subject_id,
          name: row.subject_name,
          code: row.subject_code
        };

        // Add father if exists
        if (row.father_user_id) {
          const father = {
            userId: row.father_user_id,
            firstName: row.father_first_name,
            lastName: row.father_last_name,
            email: row.father_email,
            phoneNumber: maskPhoneNumber(row.father_phone),
            imageUrl: row.father_image,
            gender: row.father_gender,
            occupation: row.father_occupation,
            workplace: row.father_workplace
          };

          // Apply relationship filter if specified
          if (!queryDto.relationship || queryDto.relationship === 'father') {
            parents.push(new SubjectParentResponseDto(father, student, subject, 'father'));
          }
        }

        // Add mother if exists  
        if (row.mother_user_id) {
          const mother = {
            userId: row.mother_user_id,
            firstName: row.mother_first_name,
            lastName: row.mother_last_name,
            email: row.mother_email,
            phoneNumber: maskPhoneNumber(row.mother_phone),
            imageUrl: row.mother_image,
            gender: row.mother_gender,
            occupation: row.mother_occupation,
            workplace: row.mother_workplace
          };

          // Apply relationship filter if specified
          if (!queryDto.relationship || queryDto.relationship === 'mother') {
            parents.push(new SubjectParentResponseDto(mother, student, subject, 'mother'));
          }
        }

        // Add guardian if exists
        if (row.guardian_user_id) {
          const guardian = {
            userId: row.guardian_user_id,
            firstName: row.guardian_first_name,
            lastName: row.guardian_last_name,
            email: row.guardian_email,
            phoneNumber: maskPhoneNumber(row.guardian_phone),
            imageUrl: row.guardian_image,
            gender: row.guardian_gender,
            occupation: row.guardian_occupation,
            workplace: row.guardian_workplace
          };

          // Apply relationship filter if specified
          if (!queryDto.relationship || queryDto.relationship === 'guardian') {
            parents.push(new SubjectParentResponseDto(guardian, student, subject, 'guardian'));
          }
        }
      });

      // Calculate final pagination metadata based on transformed results
      const totalPages = Math.ceil(total / limit);

      return {
        data: parents,
        meta: {
          total,
          page,
          limit,
          totalPages
        }
      };

    } catch (error) {
      throw new BadRequestException(`Failed to get subject parents: ${error.message}`);
    }
  }

  // New Enrollment Methods

  /**
   * Self-enrollment using enrollment key
   */
  async selfEnroll(studentId: string, enrollDto: SelfEnrollDto): Promise<SelfEnrollResponseDto> {
    try {
      // Find the class subject by enrollment key
      const classSubject = await this.classSubjectRepository.findOne({
        where: {
          enrollmentKey: enrollDto.enrollmentKey,
          enrollmentEnabled: true,
          isActive: true,
        },
        relations: ['subject', 'class'],
      });

      if (!classSubject) {
        throw new NotFoundException('Invalid enrollment key or enrollment is disabled');
      }

      // Check if student is enrolled in the class
      const classEnrollment = await this.classStudentRepository.findOne({
        where: {
          instituteId: classSubject.instituteId,
          classId: classSubject.classId,
          studentUserId: studentId,
          isActive: true,
        },
      });

      if (!classEnrollment) {
        throw new ForbiddenException('You must be enrolled in the class to enroll in this subject');
      }

      // Check if already enrolled in the subject
      const existingEnrollment = await this.studentRepository.findOne({
        where: {
          instituteId: classSubject.instituteId,
          classId: classSubject.classId,
          subjectId: classSubject.subjectId,
          studentId: studentId,
        },
      });

      if (existingEnrollment) {
        throw new ConflictException('You are already enrolled in this subject');
      }

      // Create enrollment
      const timestamp = getCurrentSriLankaISO();
      const enrollment = this.studentRepository.create({
        instituteId: classSubject.instituteId,
        classId: classSubject.classId,
        subjectId: classSubject.subjectId,
        studentId: studentId,
        enrollmentMethod: 'self_enrolled',
        enrolledBy: null, // Self-enrolled
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await this.studentRepository.save(enrollment);

      // Refresh student cache after self-enrollment
      await this.userManagementService.refreshUserCache(studentId);

      return {
        message: `Successfully enrolled in ${classSubject.subject.name} for ${classSubject.class.name}`,
        instituteId: classSubject.instituteId,
        classId: classSubject.classId,
        subjectId: classSubject.subjectId,
        subjectName: classSubject.subject.name,
        className: classSubject.class.name,
        enrollmentMethod: 'self_enrolled',
        enrolledAt: getCurrentSriLankaTime(),
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Failed to enroll in subject: ${error.message}`);
    }
  }

  /**
   * Teacher assigns students to subject
   */
  async teacherAssignStudents(
    teacherId: string,
    instituteId: string,
    classId: string,
    subjectId: string,
    assignDto: TeacherAssignStudentsDto
  ): Promise<TeacherAssignResponseDto> {
    try {
      // Verify teacher has access to this subject
      const classSubject = await this.classSubjectRepository.findOne({
        where: {
          instituteId,
          classId,
          subjectId,
          teacherId,
          isActive: true,
        },
        relations: ['subject', 'class'],
      });

      if (!classSubject) {
        throw new ForbiddenException('You do not have permission to assign students to this subject');
      }

      const successfulAssignments = [];
      const failedAssignments = [];
      const studentIds = assignDto.studentIds;

      // Batch fetch all data upfront to avoid N+1 queries
      const [users, classEnrollments, existingSubjectEnrollments] = await Promise.all([
        this.userRepository.find({
          where: { id: In(studentIds) },
          select: ['id', 'firstName', 'lastName'],
        }),
        this.classStudentRepository.find({
          where: {
            instituteId,
            classId,
            studentUserId: In(studentIds),
            isActive: true,
          },
        }),
        this.studentRepository.find({
          where: { instituteId, classId, subjectId, studentId: In(studentIds) },
        }),
      ]);

      // Build lookup maps for O(1) access
      const userMap = new Map(users.map(u => [u.id, u]));
      const classEnrolledSet = new Set(classEnrollments.map(e => e.studentUserId));
      const subjectEnrolledSet = new Set(existingSubjectEnrollments.map(e => e.studentId));

      const enrollmentsToCreate = [];
      const cacheRefreshIds: string[] = [];

      for (const studentId of studentIds) {
        const user = userMap.get(studentId);
        const studentName = user ? `${user.firstName} ${user.lastName}` : 'Unknown';

        if (!classEnrolledSet.has(studentId)) {
          failedAssignments.push({
            studentId,
            studentName,
            status: 'failed',
            reason: 'Student not enrolled in class',
          });
          continue;
        }

        if (subjectEnrolledSet.has(studentId)) {
          failedAssignments.push({
            studentId,
            studentName,
            status: 'failed',
            reason: 'Already enrolled in subject',
          });
          continue;
        }

        const timestamp = getCurrentSriLankaISO();
        enrollmentsToCreate.push(
          this.studentRepository.create({
            instituteId,
            classId,
            subjectId,
            studentId,
            enrollmentMethod: 'teacher_assigned',
            enrolledBy: teacherId,
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
        );
        cacheRefreshIds.push(studentId);

        successfulAssignments.push({
          studentId,
          studentName,
          status: 'success',
        });
      }

      // Batch insert all enrollments at once
      if (enrollmentsToCreate.length > 0) {
        await this.studentRepository.save(enrollmentsToCreate);
      }

      // Refresh caches in parallel
      await Promise.all(
        cacheRefreshIds.map(id => this.userManagementService.refreshUserCache(id)),
      );

      return {
        message: `Successfully assigned ${successfulAssignments.length} students to ${classSubject.subject.name} for ${classSubject.class.name}`,
        successCount: successfulAssignments.length,
        failedCount: failedAssignments.length,
        successfulAssignments,
        failedAssignments,
      };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Failed to assign students: ${error.message}`);
    }
  }

  /**
   * Update enrollment settings for a subject
   */
  async updateEnrollmentSettings(
    teacherId: string,
    instituteId: string,
    classId: string,
    subjectId: string,
    updateDto: UpdateEnrollmentSettingsDto
  ): Promise<EnrollmentSettingsResponseDto> {
    try {
      // Verify teacher has access to this subject
      const classSubject = await this.classSubjectRepository.findOne({
        where: {
          instituteId,
          classId,
          subjectId,
          teacherId,
          isActive: true,
        },
        relations: ['subject', 'class'],
      });

      if (!classSubject) {
        throw new ForbiddenException('You do not have permission to modify settings for this subject');
      }

      // Generate or remove enrollment key based on enabled status
      let enrollmentKey = classSubject.enrollmentKey;
      if (updateDto.enrollmentEnabled && !enrollmentKey) {
        enrollmentKey = this.generateEnrollmentKey(classSubject.subject.name);
      } else if (!updateDto.enrollmentEnabled) {
        enrollmentKey = null;
      }

      // Update settings
      await this.classSubjectRepository.update(
        { instituteId, classId, subjectId },
        {
          enrollmentEnabled: updateDto.enrollmentEnabled,
          enrollmentKey,
        }
      );

      // Get current enrollment count
      const enrollmentCount = await this.studentRepository.count({
        where: {
          instituteId,
          classId,
          subjectId,
          isActive: true,
        },
      });

      return {
        instituteId,
        classId,
        subjectId,
        subjectName: classSubject.subject.name,
        className: classSubject.class.name,
        enrollmentEnabled: updateDto.enrollmentEnabled,
        enrollmentKey: updateDto.enrollmentEnabled ? enrollmentKey : undefined,
        currentEnrollmentCount: enrollmentCount,
        updatedAt: getCurrentSriLankaTime(),
      };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Failed to update enrollment settings: ${error.message}`);
    }
  }

  /**
   * Get enrollment settings for a subject
   */
  async getEnrollmentSettings(
    teacherId: string,
    instituteId: string,
    classId: string,
    subjectId: string
  ): Promise<EnrollmentSettingsResponseDto> {
    try {
      // Verify teacher has access to this subject
      const classSubject = await this.classSubjectRepository.findOne({
        where: {
          instituteId,
          classId,
          subjectId,
          teacherId,
          isActive: true,
        },
        relations: ['subject', 'class'],
      });

      if (!classSubject) {
        throw new ForbiddenException('You do not have permission to view settings for this subject');
      }

      // Get current enrollment count
      const enrollmentCount = await this.studentRepository.count({
        where: {
          instituteId,
          classId,
          subjectId,
          isActive: true,
        },
      });

      return {
        instituteId,
        classId,
        subjectId,
        subjectName: classSubject.subject.name,
        className: classSubject.class.name,
        enrollmentEnabled: classSubject.enrollmentEnabled,
        enrollmentKey: classSubject.enrollmentEnabled ? classSubject.enrollmentKey : undefined,
        currentEnrollmentCount: enrollmentCount,
        updatedAt: classSubject.updatedAt,
      };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Failed to get enrollment settings: ${error.message}`);
    }
  }

  /**
   * Generate a unique enrollment key
   */
  private generateEnrollmentKey(subjectName: string): string {
    const prefix = subjectName.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, '');
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}-${randomPart}`;
  }
}
