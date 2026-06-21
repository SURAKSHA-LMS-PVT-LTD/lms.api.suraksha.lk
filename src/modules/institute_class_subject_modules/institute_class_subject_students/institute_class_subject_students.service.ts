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
import {
  UnverifiedStudentResponseDto,
  VerificationActionResponseDto,
  BulkVerificationResponseDto,
} from './dto/verify-enrollment.dto';
import { InstituteClassSubjectStudent } from './entities/institute_class_subject_student.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { SubjectEntity } from '../../subject/entities/subject.entity';
import { SubjectResponseDto } from '../../subject/dto/subject-response.dto';
import { InstituteClassSubjectEntity } from '../../institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectPayment, PaymentStatus, PaymentTargetType, PaymentPriority } from '../../payment/entities/institute-class-subject-payment.entity';
import { InstituteClassSubjectPaymentSubmission, SubmissionStatus } from '../../payment/entities/institute-class-subject-payment-submission.entity';
import { InstituteClassPayment } from '../../payment/entities/institute-class-payment.entity';
import { InstituteClassPaymentSubmission } from '../../payment/entities/institute-class-payment-submission.entity';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { UserType } from '../../user/enums/user-type.enum';
import { UserManagementService } from '../../../common/services/cache-user-management.service';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
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
    @InjectRepository(InstituteClassSubjectPayment)
    private readonly paymentRepository: Repository<InstituteClassSubjectPayment>,
    @InjectRepository(InstituteClassSubjectPaymentSubmission)
    private readonly submissionRepository: Repository<InstituteClassSubjectPaymentSubmission>,
    @InjectRepository(InstituteClassPayment)
    private readonly classPaymentRepository: Repository<InstituteClassPayment>,
    @InjectRepository(InstituteClassPaymentSubmission)
    private readonly classPaymentSubmissionRepository: Repository<InstituteClassPaymentSubmission>,
    private readonly userManagementService: UserManagementService,
    private readonly cloudStorageService: CloudStorageService,
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
        enrollmentMethod: 'teacher_assigned' as const,
        verificationStatus: 'verified' as const,
        extraData: createDto.extraData,
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
        'student.nameWithInitials',
        'student.email',
        'student.imageUrl',
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
        'student.nameWithInitials',
        'student.email',
        'student.imageUrl',
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
        'enrollment.instituteId',
        'enrollment.classId',
        'enrollment.subjectId',
        'enrollment.studentId',
        'enrollment.createdAt',
        'enrollment.isActive',
        'enrollment.studentType'
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
        'student.nameWithInitials',
        'student.email',
        'student.imageUrl'
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
          verificationStatus: 'verified' as const,
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
        'enrollment.instituteId',
        'enrollment.classId',
        'enrollment.subjectId',
        'enrollment.studentId',
        'enrollment.createdAt',
        'enrollment.isActive',
        'enrollment.studentType',
        'enrollment.enrollmentMethod',
        'enrollment.verificationStatus'
      ])
      .leftJoin('enrollment.student', 'student')
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.nameWithInitials',
        'student.email',
        'student.phoneNumber',
        'student.imageUrl'
      ])
      .where('enrollment.instituteId = :instituteId', { instituteId })
      .andWhere('enrollment.classId = :classId', { classId })
      .andWhere('enrollment.subjectId = :subjectId', { subjectId })
      .andWhere('enrollment.isActive = :isActive', { isActive: true })
      .andWhere('enrollment.verificationStatus = :verificationStatus', { verificationStatus: 'verified' })
      .orderBy('enrollment.createdAt', 'ASC')
      .getMany();

    return enrollments.map(enrollment => InstituteClassSubjectStudentResponseDto.fromEntity(enrollment));
  }

  // Get class subjects for a specific student (student's view)
  async getClassSubjectsForStudent(studentId: string): Promise<InstituteClassSubjectStudentResponseDto[]> {
    const enrollments = await this.studentRepository
      .createQueryBuilder('enrollment')
      .select([
        'enrollment.instituteId',
        'enrollment.classId',
        'enrollment.subjectId',
        'enrollment.studentId',
        'enrollment.createdAt',
        'enrollment.updatedAt',
        'enrollment.isActive',
        'enrollment.studentType',
        'enrollment.enrollmentMethod',
        'enrollment.verificationStatus',
        'enrollment.verifiedAt',
        'enrollment.rejectionReason'
      ])
      .leftJoin('enrollment.student', 'student')
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.nameWithInitials',
        'student.email',
        'student.imageUrl'
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
        'enrollment.instituteId',
        'enrollment.classId',
        'enrollment.subjectId',
        'enrollment.studentId',
        'enrollment.createdAt',
        'enrollment.isActive',
        'enrollment.studentType'
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
          
          -- Enrollment status fields
          enrollment.verification_status as "verificationStatus",
          enrollment.verified_at as "verifiedAt",
          enrollment.rejection_reason as "rejectionReason",
          enrollment.enrollment_method as "enrollmentMethod",
          enrollment.created_at as "enrolledAt",
          enrollment.enrollment_payment_id as "enrollmentPaymentId",
          enrollment.student_type as "studentType",

          -- Get teacher and class status from institute_class_subjects (LEFT JOIN to include enrollments without teacher assignment)
          ics.teacher_id as "teacherId",
          ics.is_active as "classSubjectActive",
          ics.enrollment_fee_amount as "enrollmentFeeAmount",
          
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
        enrollmentMethod: row.enrollmentMethod,
        verificationStatus: row.verificationStatus,
        verifiedAt: row.verifiedAt ?? null,
        rejectionReason: row.rejectionReason ?? null,
        enrolledAt: row.enrolledAt ?? null,
        enrollmentPaymentId: row.enrollmentPaymentId ?? null,
        studentType: row.studentType ?? 'paid',
        enrollmentFeeAmount: row.enrollmentFeeAmount ? Number(row.enrollmentFeeAmount) : null,
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
          phoneNumber: row.student_phone
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
            phoneNumber: row.father_phone,
            imageUrl: row.father_image ? this.cloudStorageService.getFullUrl(row.father_image) : null,
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
            phoneNumber: row.mother_phone,
            imageUrl: row.mother_image ? this.cloudStorageService.getFullUrl(row.mother_image) : null,
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
            phoneNumber: row.guardian_phone,
            imageUrl: row.guardian_image ? this.cloudStorageService.getFullUrl(row.guardian_image) : null,
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
      // Find the class subject by instituteId, classId, subjectId
      const classSubject = await this.classSubjectRepository.findOne({
        where: {
          instituteId: enrollDto.instituteId,
          classId: enrollDto.classId,
          subjectId: enrollDto.subjectId,
          enrollmentEnabled: true,
          isActive: true,
        },
        relations: ['subject', 'class'],
      });

      if (!classSubject) {
        throw new NotFoundException('Subject not found or self-enrollment is disabled for this subject');
      }

      // Validate enrollment key:
      // - If a key is configured AND the student provided one → must match
      // - If a key is configured AND the student provided none → only skip if a payment gate is also configured (payment-mode covers it)
      // - If no key configured → open/payment enrollment; no key needed
      if (classSubject.enrollmentKey) {
        if (!enrollDto.enrollmentKey) {
          // No key provided — only acceptable if payment gate is configured (payment enrolls them)
          if (!classSubject.enrollmentPaymentRefId) {
            throw new BadRequestException('Enrollment key is required for this subject');
          }
          // If payment gate is configured, lack of key is fine — payment check handles access
        } else if (classSubject.enrollmentKey !== enrollDto.enrollmentKey) {
          throw new BadRequestException('Invalid enrollment key');
        }
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
        // Allow re-enrollment if payment was rejected (student wants to resubmit)
        if (existingEnrollment.verificationStatus === 'payment_rejected') {
          // Reset to pending_payment so they can upload a new slip
          existingEnrollment.verificationStatus = 'pending_payment';
          existingEnrollment.rejectionReason = null;
          existingEnrollment.enrollmentPaymentId = null;
          existingEnrollment.updatedAt = getCurrentSriLankaISO() as any;

          // Auto-create a new enrollment payment for re-submission
          let reEnrollPaymentId: string | undefined;
          try {
            const feeAmount = classSubject.enrollmentFeeAmount ? Number(classSubject.enrollmentFeeAmount) : 0;
            if (feeAmount > 0) {
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + 30);

              const reEnrollPayment = this.paymentRepository.create({
                instituteId: classSubject.instituteId,
                classId: classSubject.classId,
                subjectId: classSubject.subjectId,
                createdBy: null,
                title: `Enrollment Fee - ${classSubject.subject.name}`,
                description: `Re-enrollment fee for ${classSubject.subject.name} in ${classSubject.class.name}.`,
                targetType: PaymentTargetType.BOTH,
                priority: PaymentPriority.MANDATORY,
                amount: feeAmount,
                lastDate: dueDate,
                status: PaymentStatus.ACTIVE,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              const savedRePayment = await this.paymentRepository.save(reEnrollPayment);
              reEnrollPaymentId = savedRePayment.id;
              existingEnrollment.enrollmentPaymentId = savedRePayment.id;
            }
          } catch (paymentError) {
            console.error('Failed to auto-create re-enrollment payment:', paymentError);
          }

          await this.studentRepository.save(existingEnrollment);

          return {
            message: `Re-enrollment initiated for ${classSubject.subject.name}. Please upload your payment slip.`,
            instituteId: classSubject.instituteId,
            classId: classSubject.classId,
            subjectId: classSubject.subjectId,
            subjectName: classSubject.subject.name,
            className: classSubject.class.name,
            enrollmentMethod: 'self_enrolled',
            verificationStatus: 'pending_payment',
            enrolledAt: new Date(),
            paymentRequired: true,
            feeAmount: classSubject.enrollmentFeeAmount ? Number(classSubject.enrollmentFeeAmount) : undefined,
            enrollmentPaymentId: reEnrollPaymentId,
          };
        }
        if (existingEnrollment.verificationStatus === 'rejected') {
          throw new ConflictException('Your enrollment was previously rejected. Please contact the teacher or admin.');
        }
        if (existingEnrollment.verificationStatus === 'pending' || existingEnrollment.verificationStatus === 'pending_payment') {
          throw new ConflictException('Your enrollment is already pending verification');
        }
        throw new ConflictException('You are already enrolled in this subject');
      }

      // Determine verification status based on fee requirement AND class-level student type
      const paymentRequired = classSubject.enrollmentFeeRequired && classSubject.enrollmentFeeAmount > 0;

      // ✅ CLASS-LEVEL FREE CARD CHECK:
      // If admin/teacher has pre-approved this student as 'free_card' at the class level,
      // skip payment slip and verification — enroll immediately as free_card verified.
      const isClassFreeCard = classEnrollment.studentType === 'free_card';

      // ✅ PAYMENT-GATED ENROLLMENT CHECK:
      // If a specific class-level payment is configured, verify the student already paid.
      // Uses institute_class_payment_submissions (class-level), NOT subject payment submissions.
      let hasValidPayment = false;
      let gatedPaymentRecord: InstituteClassPayment | null = null;
      if (!isClassFreeCard && classSubject.enrollmentPaymentRefId) {
        const allowedStatuses: string[] = classSubject.enrollmentPaymentStatuses
          ? classSubject.enrollmentPaymentStatuses.split(',').map(s => s.trim())
          : [SubmissionStatus.VERIFIED];
        const submission = await this.classPaymentSubmissionRepository.findOne({
          where: {
            paymentId: classSubject.enrollmentPaymentRefId,
            userId: studentId,
          },
        });
        if (submission && allowedStatuses.includes(submission.status)) {
          hasValidPayment = true;
        }
        // Load the payment record so we can return title/amount/dueDate to the student
        gatedPaymentRecord = await this.classPaymentRepository.findOne({
          where: { id: classSubject.enrollmentPaymentRefId },
        });
      }

      let verificationStatus: string;
      let enrollmentStudentType: 'normal' | 'paid' | 'free_card' | 'half_paid' | 'quarter_paid';

      if (isClassFreeCard) {
        // Admin pre-approved at class level — enroll as verified immediately so student can attend
        verificationStatus = 'verified';
        enrollmentStudentType = 'free_card';
      } else if (classSubject.enrollmentPaymentRefId && hasValidPayment) {
        // Student has paid the required class payment — enroll immediately as paid
        verificationStatus = 'verified';
        enrollmentStudentType = 'paid';
      } else if (classSubject.enrollmentPaymentRefId && !hasValidPayment) {
        // Payment required but not found — put in pending_payment, return payment ID
        verificationStatus = 'pending_payment';
        enrollmentStudentType = 'normal';
      } else if (paymentRequired) {
        verificationStatus = 'pending_payment';
        enrollmentStudentType = 'normal';
      } else {
        verificationStatus = 'pending';
        enrollmentStudentType = 'normal';
      }

      // Create enrollment with appropriate verification status
      const timestamp = getCurrentSriLankaISO();
      const enrollment = this.studentRepository.create({
        instituteId: classSubject.instituteId,
        classId: classSubject.classId,
        subjectId: classSubject.subjectId,
        studentId: studentId,
        enrollmentMethod: 'self_enrolled',
        enrolledBy: null, // Self-enrolled
        isActive: true,
        verificationStatus: verificationStatus as any,
        studentType: enrollmentStudentType,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const savedEnrollment = await this.studentRepository.save(enrollment);

      // Auto-create enrollment fee payment record if payment is required (not for free card students)
      let enrollmentPaymentId: string | undefined;
      if (paymentRequired && !isClassFreeCard) {
        try {
          const feeAmount = Number(classSubject.enrollmentFeeAmount);
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30); // 30-day deadline

          const enrollmentPayment = this.paymentRepository.create({
            instituteId: classSubject.instituteId,
            classId: classSubject.classId,
            subjectId: classSubject.subjectId,
            createdBy: null,
            title: `Enrollment Fee - ${classSubject.subject.name}`,
            description: `Monthly enrollment fee for ${classSubject.subject.name} in ${classSubject.class.name}. Student self-enrollment payment.`,
            targetType: PaymentTargetType.BOTH,
            priority: PaymentPriority.MANDATORY,
            amount: feeAmount,
            lastDate: dueDate,
            status: PaymentStatus.ACTIVE,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          const savedPayment = await this.paymentRepository.save(enrollmentPayment);
          enrollmentPaymentId = savedPayment.id;

          // Link enrollment to payment
          savedEnrollment.enrollmentPaymentId = savedPayment.id;
          await this.studentRepository.save(savedEnrollment);
        } catch (paymentError) {
          // Payment creation failed but enrollment is created - log but don't fail
          console.error('Failed to auto-create enrollment payment:', paymentError);
        }
      }

      // Refresh student cache after self-enrollment
      await this.userManagementService.refreshUserCache(studentId);

      let message: string;
      if (isClassFreeCard) {
        message = `Successfully enrolled in ${classSubject.subject.name} for ${classSubject.class.name}. You are enrolled as a free card student — no payment required.`;
      } else if (classSubject.enrollmentPaymentRefId && hasValidPayment) {
        message = `Successfully enrolled in ${classSubject.subject.name} for ${classSubject.class.name}. Payment verified.`;
      } else if (classSubject.enrollmentPaymentRefId && !hasValidPayment) {
        message = `Enrolled in ${classSubject.subject.name} for ${classSubject.class.name}. Please complete the required payment to activate your enrollment.`;
      } else if (paymentRequired) {
        message = `Enrolled in ${classSubject.subject.name} for ${classSubject.class.name}. Please upload your payment slip (Rs. ${classSubject.enrollmentFeeAmount}).`;
      } else {
        message = `Successfully enrolled in ${classSubject.subject.name} for ${classSubject.class.name}. Awaiting verification by teacher or admin.`;
      }

      const needsPayment = (!isClassFreeCard && classSubject.enrollmentPaymentRefId && !hasValidPayment) ||
                           (!isClassFreeCard && paymentRequired && !classSubject.enrollmentPaymentRefId);

      return {
        message,
        instituteId: classSubject.instituteId,
        classId: classSubject.classId,
        subjectId: classSubject.subjectId,
        subjectName: classSubject.subject.name,
        className: classSubject.class.name,
        enrollmentMethod: 'self_enrolled',
        verificationStatus,
        enrolledAt: new Date(),
        paymentRequired: needsPayment,
        feeAmount: (paymentRequired && !isClassFreeCard && !classSubject.enrollmentPaymentRefId)
          ? Number(classSubject.enrollmentFeeAmount) : undefined,
        enrollmentPaymentId: classSubject.enrollmentPaymentRefId || enrollmentPaymentId,
        studentType: enrollmentStudentType,
        // Class-level payment gate details so the student knows exactly what to pay
        enrollmentPaymentTitle: gatedPaymentRecord?.title ?? undefined,
        enrollmentPaymentAmount: gatedPaymentRecord?.amount ? Number(gatedPaymentRecord.amount) : undefined,
        enrollmentPaymentDueDate: gatedPaymentRecord?.lastDate ? new Date(gatedPaymentRecord.lastDate).toISOString() : undefined,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Failed to enroll in subject: ${error.message}`);
    }
  }

  /**
   * Student claims free card status for a pending_payment enrollment.
   * Changes verificationStatus to 'pending' and studentType to 'free_card'.
   * Admin must then verify the claim.
   */
  async claimFreeCard(
    studentId: string,
    instituteId: string,
    classId: string,
    subjectId: string
  ): Promise<{ message: string; verificationStatus: string; studentType: string }> {
    try {
      const enrollment = await this.studentRepository.findOne({
        where: { instituteId, classId, subjectId, studentId },
      });

      if (!enrollment) {
        throw new NotFoundException('Enrollment not found');
      }

      if (enrollment.verificationStatus !== 'pending_payment') {
        throw new BadRequestException('Free card claim is only allowed for enrollments awaiting payment');
      }

      // Check if admin already pre-approved student as free_card at class level
      const classEnrollment = await this.classStudentRepository.findOne({
        where: { instituteId, classId, studentUserId: studentId },
      });
      const isClassFreeCard = classEnrollment?.studentType === 'free_card';

      const timestamp = getCurrentSriLankaISO();
      // If pre-approved at class level, set verified directly so they can attend
      const newVerificationStatus = isClassFreeCard ? 'verified' : 'enrolled_free_card';
      await this.studentRepository.update(
        { instituteId, classId, subjectId, studentId },
        {
          studentType: 'free_card',
          verificationStatus: newVerificationStatus as any,
          updatedAt: timestamp,
        }
      );

      return {
        message: isClassFreeCard
          ? 'Free card verified. You are now fully enrolled and can attend classes.'
          : 'Free card claim accepted. You are enrolled without payment.',
        verificationStatus: newVerificationStatus,
        studentType: 'free_card',
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to claim free card: ${error.message}`);
    }
  }

  /**
   * Admin/Teacher updates student type (paid/free_card) for a specific enrollment.
   */
  async updateStudentType(
    instituteId: string,
    classId: string,
    subjectId: string,
    studentId: string,
    studentType: 'normal' | 'paid' | 'free_card' | 'half_paid' | 'quarter_paid'
  ): Promise<{ message: string; studentType: string }> {
    try {
      const enrollment = await this.studentRepository.findOne({
        where: { instituteId, classId, subjectId, studentId },
      });

      if (!enrollment) {
        throw new NotFoundException('Enrollment not found');
      }

      const timestamp = getCurrentSriLankaISO();
      await this.studentRepository.update(
        { instituteId, classId, subjectId, studentId },
        {
          studentType,
          updatedAt: timestamp,
        }
      );

      return {
        message: `Student type updated to ${studentType}`,
        studentType,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to update student type: ${error.message}`);
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
          select: ['id', 'firstName', 'lastName', 'nameWithInitials'],
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
        const studentName = user ? (user.nameWithInitials || `${user.firstName} ${user.lastName}`.trim()) : 'Unknown';

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
            verificationStatus: 'verified',
            studentType: assignDto.studentType || 'normal',
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
    updateDto: UpdateEnrollmentSettingsDto,
    isAdmin = false
  ): Promise<EnrollmentSettingsResponseDto> {
    try {
      // Institute admins and superadmins can update any subject; teachers only their assigned subject.
      const whereClause: any = { instituteId, classId, subjectId, isActive: true };
      if (!isAdmin) {
        whereClause.teacherId = teacherId;
      }

      const classSubject = await this.classSubjectRepository.findOne({
        where: whereClause,
        relations: ['subject', 'class'],
      });

      if (!classSubject) {
        throw new ForbiddenException('You do not have permission to modify settings for this subject');
      }

      // === ENROLLMENT KEY LOGIC ===
      // Priority: explicit enrollmentKey in DTO > auto-generate if needed > preserve existing
      let enrollmentKey: string | null = classSubject.enrollmentKey ?? null;

      if (updateDto.enrollmentKey !== undefined) {
        // Caller explicitly set the key (or explicitly cleared it with null/'')
        enrollmentKey = updateDto.enrollmentKey?.trim() || null;
      } else if (updateDto.enrollmentEnabled && !enrollmentKey && updateDto.enrollmentFeeRequired !== true) {
        // Enrollment enabled, no existing key, not payment-only → auto-generate a key
        enrollmentKey = this.generateEnrollmentKey(classSubject.subject.name);
      } else if (!updateDto.enrollmentEnabled) {
        // Enrollment fully disabled — clear key
        enrollmentKey = null;
      }
      // If payment-only mode (enrollmentEnabled=true, enrollmentKey=null, enrollmentFeeRequired=true)
      // the key stays null intentionally — no change needed.

      // Update settings (including fee fields if provided)
      const updateData: any = {
        enrollmentEnabled: updateDto.enrollmentEnabled,
        enrollmentKey,
      };
      if (updateDto.enrollmentFeeRequired !== undefined) {
        updateData.enrollmentFeeRequired = updateDto.enrollmentFeeRequired;
      }
      if (updateDto.enrollmentFeeAmount !== undefined) {
        updateData.enrollmentFeeAmount = updateDto.enrollmentFeeAmount;
      }
      // If fee is disabled, clear the amount and payment ref
      if (updateDto.enrollmentFeeRequired === false) {
        updateData.enrollmentFeeAmount = null;
        updateData.enrollmentPaymentRefId = null;
        updateData.enrollmentPaymentStatuses = null;
      }
      // Payment-gated enrollment fields
      if (updateDto.enrollmentPaymentRefId !== undefined) {
        updateData.enrollmentPaymentRefId = updateDto.enrollmentPaymentRefId || null;
      }
      if (updateDto.enrollmentPaymentStatuses !== undefined) {
        updateData.enrollmentPaymentStatuses = updateDto.enrollmentPaymentStatuses?.length
          ? updateDto.enrollmentPaymentStatuses.join(',')
          : null;
      }

      await this.classSubjectRepository.update(
        { instituteId, classId, subjectId },
        updateData
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
        updatedAt: new Date(),
        enrollmentFeeRequired: updateDto.enrollmentFeeRequired ?? classSubject.enrollmentFeeRequired,
        enrollmentFeeAmount: updateDto.enrollmentFeeAmount ?? (classSubject.enrollmentFeeAmount ? Number(classSubject.enrollmentFeeAmount) : undefined),
        enrollmentPaymentRefId: updateData.enrollmentPaymentRefId !== undefined
          ? updateData.enrollmentPaymentRefId
          : (classSubject.enrollmentPaymentRefId ?? undefined),
        enrollmentPaymentStatuses: updateData.enrollmentPaymentStatuses !== undefined
          ? (updateData.enrollmentPaymentStatuses ? updateData.enrollmentPaymentStatuses.split(',') : undefined)
          : (classSubject.enrollmentPaymentStatuses ? classSubject.enrollmentPaymentStatuses.split(',') : undefined),
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
        enrollmentFeeRequired: classSubject.enrollmentFeeRequired,
        enrollmentFeeAmount: classSubject.enrollmentFeeAmount ? Number(classSubject.enrollmentFeeAmount) : undefined,
        enrollmentPaymentRefId: classSubject.enrollmentPaymentRefId ?? undefined,
        enrollmentPaymentStatuses: classSubject.enrollmentPaymentStatuses
          ? classSubject.enrollmentPaymentStatuses.split(',').map(s => s.trim())
          : undefined,
      };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new BadRequestException(`Failed to get enrollment settings: ${error.message}`);
    }
  }

  /**
   * Get unverified (pending) students for a specific class subject
   * Used by institute admins and teachers to review pending enrollments
   */
  async getUnverifiedStudents(
    instituteId: string,
    classId: string,
    subjectId: string
  ): Promise<UnverifiedStudentResponseDto[]> {
    try {
      const pendingEnrollments = await this.studentRepository
        .createQueryBuilder('enrollment')
        .leftJoin('enrollment.student', 'student')
        .addSelect([
          'student.id',
          'student.firstName',
          'student.lastName',
          'student.nameWithInitials',
          'student.email',
          'student.imageUrl'
        ])
        .where('enrollment.instituteId = :instituteId', { instituteId })
        .andWhere('enrollment.classId = :classId', { classId })
        .andWhere('enrollment.subjectId = :subjectId', { subjectId })
        .andWhere('enrollment.verificationStatus IN (:...statuses)', { statuses: ['pending', 'pending_payment', 'payment_rejected'] })
        .andWhere('enrollment.isActive = :isActive', { isActive: true })
        .orderBy('enrollment.createdAt', 'ASC')
        .getMany();

      return pendingEnrollments.map(enrollment => ({
        instituteId: enrollment.instituteId,
        classId: enrollment.classId,
        subjectId: enrollment.subjectId,
        studentId: enrollment.studentId,
        studentFirstName: enrollment.student?.firstName,
        studentLastName: enrollment.student?.lastName,
        studentNameWithInitials: enrollment.student?.nameWithInitials,
        studentEmail: enrollment.student?.email,
        studentImageUrl: enrollment.student?.imageUrl ? this.cloudStorageService.getFullUrl(enrollment.student.imageUrl) : null,
        enrollmentMethod: enrollment.enrollmentMethod,
        verificationStatus: enrollment.verificationStatus,
        studentType: enrollment.studentType,
        enrollmentPaymentId: enrollment.enrollmentPaymentId || null,
        rejectionReason: enrollment.rejectionReason || null,
        enrolledAt: enrollment.createdAt,
      }));
    } catch (error) {
      throw new BadRequestException(`Failed to get unverified students: ${error.message}`);
    }
  }

  /**
   * Verify a single student's enrollment
   */
  async verifyStudentEnrollment(
    verifierId: string,
    instituteId: string,
    classId: string,
    subjectId: string,
    studentId: string
  ): Promise<VerificationActionResponseDto> {
    try {
      const enrollment = await this.studentRepository.findOne({
        where: {
          instituteId,
          classId,
          subjectId,
          studentId,
        },
      });

      if (!enrollment) {
        throw new NotFoundException('Student enrollment not found');
      }

      if (enrollment.verificationStatus === 'verified') {
        throw new ConflictException('Student enrollment is already verified');
      }

      if (enrollment.verificationStatus === 'rejected') {
        throw new BadRequestException('Cannot verify a rejected enrollment. Student must re-enroll.');
      }

      const timestamp = getCurrentSriLankaISO();
      await this.studentRepository.update(
        { instituteId, classId, subjectId, studentId },
        {
          verificationStatus: 'verified',
          verifiedBy: verifierId,
          verifiedAt: timestamp,
          updatedAt: timestamp,
        }
      );

      // Refresh student cache after verification
      await this.userManagementService.refreshUserCache(studentId);

      return {
        message: 'Student enrollment verified successfully',
        instituteId,
        classId,
        subjectId,
        studentId,
        verificationStatus: 'verified',
        actionBy: verifierId,
        actionAt: new Date(),
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to verify student enrollment: ${error.message}`);
    }
  }

  /**
   * Reject a single student's enrollment
   */
  async rejectStudentEnrollment(
    verifierId: string,
    instituteId: string,
    classId: string,
    subjectId: string,
    studentId: string,
    rejectionReason?: string
  ): Promise<VerificationActionResponseDto> {
    try {
      const enrollment = await this.studentRepository.findOne({
        where: {
          instituteId,
          classId,
          subjectId,
          studentId,
        },
      });

      if (!enrollment) {
        throw new NotFoundException('Student enrollment not found');
      }

      if (enrollment.verificationStatus === 'rejected') {
        throw new ConflictException('Student enrollment is already rejected');
      }

      const timestamp = getCurrentSriLankaISO();
      await this.studentRepository.update(
        { instituteId, classId, subjectId, studentId },
        {
          verificationStatus: 'rejected',
          verifiedBy: verifierId,
          verifiedAt: timestamp,
          rejectionReason: rejectionReason || null,
          isActive: false,
          updatedAt: timestamp,
        }
      );

      // Refresh student cache after rejection
      await this.userManagementService.refreshUserCache(studentId);

      return {
        message: 'Student enrollment rejected',
        instituteId,
        classId,
        subjectId,
        studentId,
        verificationStatus: 'rejected',
        actionBy: verifierId,
        actionAt: new Date(),
        rejectionReason,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(`Failed to reject student enrollment: ${error.message}`);
    }
  }

  /**
   * Bulk verify student enrollments
   */
  async bulkVerifyStudentEnrollments(
    verifierId: string,
    instituteId: string,
    classId: string,
    subjectId: string,
    studentIds: string[]
  ): Promise<BulkVerificationResponseDto> {
    try {
      const successful: { studentId: string; studentName: string }[] = [];
      const failed: { studentId: string; reason: string }[] = [];

      // Batch fetch enrollments and users
      const [enrollments, users] = await Promise.all([
        this.studentRepository.find({
          where: {
            instituteId,
            classId,
            subjectId,
            studentId: In(studentIds),
          },
        }),
        this.userRepository.find({
          where: { id: In(studentIds) },
          select: ['id', 'firstName', 'lastName', 'nameWithInitials'],
        }),
      ]);

      const enrollmentMap = new Map(enrollments.map(e => [e.studentId, e]));
      const userMap = new Map(users.map(u => [u.id, u]));
      const cacheRefreshIds: string[] = [];

      const timestamp = getCurrentSriLankaISO();

      for (const studentId of studentIds) {
        const enrollment = enrollmentMap.get(studentId);
        const user = userMap.get(studentId);
        const studentName = user ? (user.nameWithInitials || `${user.firstName} ${user.lastName}`.trim()) : 'Unknown';

        if (!enrollment) {
          failed.push({ studentId, reason: 'Enrollment not found' });
          continue;
        }

        if (enrollment.verificationStatus === 'verified') {
          failed.push({ studentId, reason: 'Already verified' });
          continue;
        }

        if (enrollment.verificationStatus === 'rejected') {
          failed.push({ studentId, reason: 'Cannot verify a rejected enrollment' });
          continue;
        }

        await this.studentRepository.update(
          { instituteId, classId, subjectId, studentId },
          {
            verificationStatus: 'verified',
            verifiedBy: verifierId,
            verifiedAt: timestamp,
            updatedAt: timestamp,
          }
        );

        cacheRefreshIds.push(studentId);
        successful.push({ studentId, studentName });
      }

      // Refresh caches in parallel
      await Promise.all(
        cacheRefreshIds.map(id => this.userManagementService.refreshUserCache(id)),
      );

      return {
        message: `Successfully verified ${successful.length} student(s)`,
        successCount: successful.length,
        failedCount: failed.length,
        verificationStatus: 'verified',
        successful,
        failed,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to bulk verify student enrollments: ${error.message}`);
    }
  }

  /**
   * Bulk reject student enrollments
   */
  async bulkRejectStudentEnrollments(
    verifierId: string,
    instituteId: string,
    classId: string,
    subjectId: string,
    studentIds: string[],
    rejectionReason?: string
  ): Promise<BulkVerificationResponseDto> {
    try {
      const successful: { studentId: string; studentName: string }[] = [];
      const failed: { studentId: string; reason: string }[] = [];

      // Batch fetch enrollments and users
      const [enrollments, users] = await Promise.all([
        this.studentRepository.find({
          where: {
            instituteId,
            classId,
            subjectId,
            studentId: In(studentIds),
          },
        }),
        this.userRepository.find({
          where: { id: In(studentIds) },
          select: ['id', 'firstName', 'lastName', 'nameWithInitials'],
        }),
      ]);

      const enrollmentMap = new Map(enrollments.map(e => [e.studentId, e]));
      const userMap = new Map(users.map(u => [u.id, u]));
      const cacheRefreshIds: string[] = [];

      const timestamp = getCurrentSriLankaISO();

      for (const studentId of studentIds) {
        const enrollment = enrollmentMap.get(studentId);
        const user = userMap.get(studentId);
        const studentName = user ? (user.nameWithInitials || `${user.firstName} ${user.lastName}`.trim()) : 'Unknown';

        if (!enrollment) {
          failed.push({ studentId, reason: 'Enrollment not found' });
          continue;
        }

        if (enrollment.verificationStatus === 'rejected') {
          failed.push({ studentId, reason: 'Already rejected' });
          continue;
        }

        await this.studentRepository.update(
          { instituteId, classId, subjectId, studentId },
          {
            verificationStatus: 'rejected',
            verifiedBy: verifierId,
            verifiedAt: timestamp,
            rejectionReason: rejectionReason || null,
            isActive: false,
            updatedAt: timestamp,
          }
        );

        cacheRefreshIds.push(studentId);
        successful.push({ studentId, studentName });
      }

      // Refresh caches in parallel
      await Promise.all(
        cacheRefreshIds.map(id => this.userManagementService.refreshUserCache(id)),
      );

      return {
        message: `Successfully rejected ${successful.length} student(s)`,
        successCount: successful.length,
        failedCount: failed.length,
        verificationStatus: 'rejected',
        successful,
        failed,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to bulk reject student enrollments: ${error.message}`);
    }
  }

  /**
   * Get class-level enrollment type summary:
   * Returns all students enrolled in any subject in a class, aggregated with their
   * per-subject studentType. Optionally filter by studentType.
   */
  async getClassEnrollmentTypeSummary(
    instituteId: string,
    classId: string,
    filterType?: 'free_card' | 'paid' | 'normal' | 'half_paid' | 'quarter_paid' | 'all',
  ): Promise<{
    studentId: string;
    name: string;
    email: string;
    imageUrl: string | null;
    subjects: {
      subjectId: string;
      subjectName: string;
      studentType: 'normal' | 'paid' | 'free_card' | 'half_paid' | 'quarter_paid';
      verificationStatus: string;
    }[];
    hasFreeCard: boolean;
  }[]> {
    const qb = this.studentRepository
      .createQueryBuilder('e')
      .innerJoin(UserEntity, 'u', 'u.id = e.studentId')
      .innerJoin(SubjectEntity, 'sub', 'sub.id = e.subjectId')
      .select([
        'e.studentId          AS "studentId"',
        'u.firstName          AS "firstName"',
        'u.lastName           AS "lastName"',
        'u.email              AS "email"',
        'u.imageUrl           AS "imageUrl"',
        'e.subjectId          AS "subjectId"',
        'sub.name             AS "subjectName"',
        'e.studentType        AS "studentType"',
        'e.verificationStatus AS "verificationStatus"',
      ])
      .where('e.instituteId = :instituteId', { instituteId })
      .andWhere('e.classId = :classId', { classId })
      .andWhere('e.isActive = :isActive', { isActive: true });

    if (filterType && filterType !== 'all') {
      qb.andWhere('e.studentType = :filterType', { filterType });
    }

    const rows: {
      studentId: string;
      firstName: string;
      lastName: string;
      email: string;
      imageUrl: string | null;
      subjectId: string;
      subjectName: string;
      studentType: 'normal' | 'paid' | 'free_card' | 'half_paid' | 'quarter_paid';
      verificationStatus: string;
    }[] = await qb.orderBy('"firstName"').getRawMany();

    // Group by studentId
    const studentMap = new Map<string, (typeof rows[number]) & { subjects: any[] }>();
    for (const row of rows) {
      if (!studentMap.has(row.studentId)) {
        studentMap.set(row.studentId, {
          ...row,
          subjects: [],
        });
      }
      studentMap.get(row.studentId)!.subjects.push({
        subjectId:         row.subjectId,
        subjectName:       row.subjectName,
        studentType:       row.studentType,
        verificationStatus: row.verificationStatus,
      });
    }

    return Array.from(studentMap.values()).map(s => ({
      studentId:  s.studentId,
      name:       `${s.firstName} ${s.lastName}`.trim(),
      email:      s.email,
      imageUrl:   s.imageUrl,
      subjects:   s.subjects,
      hasFreeCard: s.subjects.some(sub => sub.studentType === 'free_card'),
    }));
  }

  /**
   * Update student type for ALL subject enrollments of a student within a class
   * (batch class-level free card toggle).
   */
  async updateStudentTypeForClass(
    instituteId: string,
    classId: string,
    studentId: string,
    studentType: 'normal' | 'paid' | 'free_card' | 'half_paid' | 'quarter_paid',
  ): Promise<{ message: string; updatedCount: number; studentType: string }> {
    const result = await this.studentRepository.update(
      { instituteId, classId, studentId, isActive: true },
      { studentType, updatedAt: getCurrentSriLankaISO() },
    );
    const count = result.affected ?? 0;
    if (count === 0) {
      throw new NotFoundException('No active subject enrollments found for this student in the class');
    }
    return {
      message: `Student type updated to ${studentType} across ${count} subject enrollment(s)`,
      updatedCount: count,
      studentType,
    };
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
