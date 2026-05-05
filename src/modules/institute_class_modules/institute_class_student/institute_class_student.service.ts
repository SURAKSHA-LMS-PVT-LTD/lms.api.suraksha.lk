import { Injectable, ConflictException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { getCurrentSriLankaISO } from '../../../common/utils/timezone.util';
import { CreateInstituteClassStudentDto, BulkCreateInstituteClassStudentDto } from './dto/create-institute_class_student.dto';
import { UpdateInstituteClassStudentDto } from './dto/update-institute_class_student.dto';
import { ClassParentResponseDto, ClassParentQueryDto, PaginatedClassParentResponseDto } from './dto/class-parent-response.dto';
import { InstituteClassStudentRepository } from './repositories/institute-class-student.repository';
import { 
  IInstituteClassStudentService,
  IInstituteClassStudentCriteria,
  IFindAllOptions,
  IBulkDeleteCriteria 
} from './interfaces/institute-class-student.interface';
import { InstituteClassStudentEntity } from './entities/institute_class_student.entity';
import { INSTITUTE_CLASS_STUDENT_CONSTANTS } from './constants/institute-class-student.constants';
import { UserEntity } from '../../user/entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { StudentsService } from '../../student/student.service';
import { UsersService } from '../../user/user.service';
import { UserType } from '../../user/enums/user-type.enum';
import { UserManagementService } from '../../../common/services/cache-user-management.service';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

@Injectable()
export class InstituteClassStudentService implements IInstituteClassStudentService {
  constructor(
    private readonly repository: InstituteClassStudentRepository,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepository: Repository<InstituteClassStudentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    private readonly studentsService: StudentsService,
    private readonly usersService: UsersService,
    private readonly userManagementService: UserManagementService,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  async assignStudentToClass(data: CreateInstituteClassStudentDto): Promise<InstituteClassStudentEntity> {
    // Check if student is already assigned to this class
    const exists = await this.repository.exists({
      instituteId: data.instituteId,
      classId: data.classId,
      studentUserId: data.studentUserId,
    });

    if (exists) {
      throw new ConflictException(INSTITUTE_CLASS_STUDENT_CONSTANTS.ERRORS.ALREADY_EXISTS);
    }

    try {
      const result = await this.repository.create(data);
      
      // Refresh student cache after class assignment
      await this.userManagementService.refreshUserCache(data.studentUserId);
      
      return result;
    } catch (error) {
      throw new BadRequestException('Failed to assign student to class');
    }
  }

  async removeStudentFromClass(criteria: IInstituteClassStudentCriteria): Promise<boolean> {
    const exists = await this.repository.exists(criteria);
    if (!exists) {
      throw new NotFoundException(INSTITUTE_CLASS_STUDENT_CONSTANTS.ERRORS.NOT_FOUND);
    }

    const result = await this.repository.delete(criteria);
    
    // Refresh student cache after class removal
    if (result && criteria.studentUserId) {
      await this.userManagementService.refreshUserCache(criteria.studentUserId);
    }
    
    return result;
  }

  async updateStudentAssignment(
    criteria: IInstituteClassStudentCriteria,
    data: UpdateInstituteClassStudentDto,
  ): Promise<InstituteClassStudentEntity> {
    const exists = await this.repository.exists(criteria);
    if (!exists) {
      throw new NotFoundException(INSTITUTE_CLASS_STUDENT_CONSTANTS.ERRORS.NOT_FOUND);
    }

    const result = await this.repository.update(criteria, data);
    
    // Refresh student cache after assignment update
    if (criteria.studentUserId) {
      await this.userManagementService.refreshUserCache(criteria.studentUserId);
    }
    
    return result;
  }

  // High-performance method to get students in a class (optimized)
  async getClassStudentsOptimized(classId: string, options: { skip?: number; take?: number; activeOnly?: boolean } = {}) {
    return await this.repository.getStudentsInClass(classId, options);
  }

  // Legacy method for backward compatibility
  async getClassStudents(classId: string, options: IFindAllOptions = {}): Promise<InstituteClassStudentEntity[]> {
    return await this.repository.findByClass(classId, {
      ...options,
      withRelations: true,
    });
  }

  // High-performance method to get student's classes (optimized)
  async getStudentClassesOptimized(studentUserId: string, options: { skip?: number; take?: number; activeOnly?: boolean } = {}) {
    return await this.repository.getStudentClasses(studentUserId, options);
  }

  // Ultra-optimized method with advanced filtering for student enrolled classes
  async getStudentEnrolledClassesWithFilters(
    studentUserId: string, 
    filters: { 
      skip?: number; 
      take?: number; 
      activeOnly?: boolean;
      instituteId?: string;
      classId?: string;
      subjectId?: string;
      verifiedOnly?: boolean;
      enrollmentMethod?: string;
    } = {}
  ) {
    return await this.repository.getStudentClassesWithFilters(studentUserId, filters);
  }

  // Legacy method for backward compatibility  
  async getStudentClasses(studentUserId: string, options: IFindAllOptions = {}): Promise<InstituteClassStudentEntity[]> {
    return await this.repository.findByStudent(studentUserId, {
      ...options,
      withRelations: true,
    });
  }

  async getInstituteStudents(instituteId: string, options: IFindAllOptions = {}): Promise<InstituteClassStudentEntity[]> {
    return await this.repository.findByInstitute(instituteId, {
      ...options,
      withRelations: true,
    });
  }

  async bulkAssignStudents(data: BulkCreateInstituteClassStudentDto): Promise<InstituteClassStudentEntity[]> {
    // ✅ OPTIMIZED: Check for existing assignments in bulk to eliminate N+1 queries
    const existingAssignments = await this.repository.findAll({
      where: {
        instituteId: data.instituteId,
        classId: data.classId,
        studentUserId: data.studentUserIds
      }
    });

    const existingStudentIds = new Set(existingAssignments.map(assignment => assignment.studentUserId.toString()));
    const newStudentUserIds = data.studentUserIds.filter(studentUserId => !existingStudentIds.has(studentUserId.toString()));

    if (newStudentUserIds.length === 0) {
      throw new ConflictException('All students are already assigned to this class');
    }

    const bulkData = {
      instituteId: data.instituteId,
      classId: data.classId,
      studentUserIds: newStudentUserIds,
      isActive: data.isActive,
    };

    const result = await this.repository.bulkCreate(bulkData);
    
    // Refresh cache for all newly assigned students
    for (const studentUserId of newStudentUserIds) {
      await this.userManagementService.refreshUserCache(studentUserId);
    }
    
    return result;
  }

  async bulkRemoveStudents(criteria: IBulkDeleteCriteria): Promise<boolean> {
    const result = await this.repository.bulkDelete(criteria);
    
    // Refresh cache for all removed students
    if (result && criteria.studentUserIds && criteria.studentUserIds.length > 0) {
      for (const studentUserId of criteria.studentUserIds) {
        await this.userManagementService.refreshUserCache(studentUserId);
      }
    }
    
    return result;
  }

  async isStudentInClass(criteria: IInstituteClassStudentCriteria): Promise<boolean> {
    return await this.repository.exists(criteria);
  }

  async getStudentCount(criteria: Partial<IInstituteClassStudentCriteria> = {}): Promise<number> {
    return await this.repository.count(criteria);
  }

  // Additional convenience methods
  async findAll(options: IFindAllOptions = {}): Promise<InstituteClassStudentEntity[]> {
    return await this.repository.findAll({
      ...options,
      withRelations: true,
    });
  }

  async findOne(criteria: IInstituteClassStudentCriteria, requestingUser?: any): Promise<InstituteClassStudentEntity> {
    if (requestingUser && criteria.studentUserId) {
      const isOwnData = requestingUser.s === criteria.studentUserId;
      const children = Array.isArray(requestingUser.c) ? requestingUser.c : [];
      const isParentOfStudent = children.includes(criteria.studentUserId);
      
      // Determine if user is staff (Superadmin, Institute Admin, or Teacher)
      let isStaff = requestingUser.u === 0 || requestingUser.userType === 'superadmin';
      
      if (!isStaff && requestingUser.i && Array.isArray(requestingUser.i)) {
        const institute = requestingUser.i.find((inst: any) => inst.i === criteria.instituteId);
        if (institute) {
          // IA=2, TE=4. Bitmask check: (r & (2|4)) != 0
          isStaff = (institute.r & 6) !== 0;
        }
      }
      
      if (!isOwnData && !isParentOfStudent && !isStaff) {
        throw new ForbiddenException('You can only access your own class assignments or your children\'s class assignments.');
      }
    }
    
    const result = await this.repository.findOne(criteria);
    if (!result) {
      throw new NotFoundException(INSTITUTE_CLASS_STUDENT_CONSTANTS.ERRORS.NOT_FOUND);
    }
    return result;
  }

  /**
   * Enhanced self-enrollment with institute verification requirement
   */
  async selfEnrollToClass(
    instituteId: string,
    classId: string,
    studentUserId: string,
    enrollmentData: { enrollmentCode?: string; enrollmentReason?: string }
  ): Promise<InstituteClassStudentEntity> {
    // Check if user exists and is a student
    const user = await this.userRepository.findOne({
      where: { id: studentUserId }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Access control will be handled by decorators

    // Check if student is enrolled in the institute first
    // Query institute_user table to verify enrollment
    const instituteUserQuery = await this.userRepository
      .createQueryBuilder('user')
      .innerJoin('institute_user', 'iu', 'iu.user_id = user.id')
      .where('iu.institute_id = :instituteId', { instituteId })
      .andWhere('iu.user_id = :studentUserId', { studentUserId })
      .andWhere('iu.status = :status', { status: 'ACTIVE' })
      .getOne();

    if (!instituteUserQuery) {
      throw new BadRequestException('Student must be enrolled in the institute first before enrolling in classes');
    }

    // Check if student is already assigned to this class
    const exists = await this.repository.exists({
      instituteId,
      classId,
      studentUserId,
    });

    if (exists) {
      throw new ConflictException('Student is already enrolled in this class');
    }

    // ✅ SECURITY: Verify student record exists (DO NOT auto-create)
    const student = await this.studentRepository.findOne({
      where: { userId: studentUserId }
    });

    if (!student) {
      throw new BadRequestException(
        'Student record not found. Student must be created through the official student registration process before enrolling in classes.'
      );
    }

    try {
      const timestamp = getCurrentSriLankaISO();
      const enrollmentDataToSave = {
        instituteId,
        classId,
        studentUserId,
        isActive: true,
        isVerified: false, // Always requires verification for self-enrollment
        enrollmentMethod: 'self_enrollment',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      return await this.repository.create(enrollmentDataToSave);
    } catch (error) {
      throw new BadRequestException(`Failed to self-enroll student: ${error.message}`);
    }
  }

  /**
   * Admin/Teacher assignment with automatic verification
   */
  async adminTeacherAssignToClass(
    instituteId: string,
    classId: string,
    studentUserIds: string[],
    assignedBy: string,
    options?: { skipVerification?: boolean; assignmentNotes?: string }
  ): Promise<{ success: string[]; failed: Array<{ studentUserId: string; reason: string }> }> {
    const results = { success: [], failed: [] };

    // Batch fetch all data upfront to avoid N+1 queries
    const [users, students, existingEnrollmentRecords, instituteUsers] = await Promise.all([
      this.userRepository.find({
        where: { id: In(studentUserIds) },
      }),
      this.studentRepository.find({
        where: { userId: In(studentUserIds) },
      }),
      // ✅ FIXED: Single batch query instead of N separate exists() calls
      this.classStudentRepository.find({
        where: { instituteId, classId, studentUserId: In(studentUserIds) },
        select: ['studentUserId'],
      }),
      this.userRepository
        .createQueryBuilder('user')
        .innerJoin('institute_user', 'iu', 'iu.user_id = user.id')
        .where('iu.institute_id = :instituteId', { instituteId })
        .andWhere('iu.user_id IN (:...studentUserIds)', { studentUserIds })
        .andWhere('iu.status = :status', { status: 'ACTIVE' })
        .getMany(),
    ]);

    // Build lookup maps for O(1) access
    const userMap = new Map(users.map(u => [u.id, u]));
    const studentMap = new Map(students.map(s => [s.userId, s]));
    const enrolledSet = new Set(existingEnrollmentRecords.map(e => (e as any).studentUserId));
    const instituteUserSet = new Set(instituteUsers.map(u => u.id));

    const enrollmentsToCreate = [];

    for (const studentUserId of studentUserIds) {
      if (!userMap.has(studentUserId)) {
        results.failed.push({ studentUserId, reason: 'User not found' });
        continue;
      }

      if (!instituteUserSet.has(studentUserId)) {
        results.failed.push({ studentUserId, reason: 'Student must be enrolled in institute first' });
        continue;
      }

      if (enrolledSet.has(studentUserId)) {
        results.failed.push({ studentUserId, reason: 'Already enrolled in class' });
        continue;
      }

      if (!studentMap.has(studentUserId)) {
        results.failed.push({
          studentUserId,
          reason: 'Student record not found. Student must be created through the official student registration process before class assignment.',
        });
        continue;
      }

      const timestamp = getCurrentSriLankaISO();
      enrollmentsToCreate.push({
        instituteId,
        classId,
        studentUserId,
        isActive: true,
        isVerified: options?.skipVerification !== false,
        enrollmentMethod: 'teacher_assigned',
        verifiedBy: assignedBy,
        verifiedAt: new Date(), // real UTC — MySQL2 timezone:'+05:30' stores as Sri Lanka time
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      results.success.push(studentUserId);
    }

    // Batch create all enrollments at once
    if (enrollmentsToCreate.length > 0) {
      for (const data of enrollmentsToCreate) {
        await this.repository.create(data);
      }
    }

    return results;
  }

  /**
   * Get unverified students with secure response
   */
  async getUnverifiedStudentsSecure(
    instituteId: string,
    classId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ data: any[]; meta: any }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 10));
    const skip = (page - 1) * limit;

    try {
      // Get unverified students using findAll with explicit nested relations
      const unverifiedStudents = await this.repository.findAll({
        skip,
        take: limit,
        relations: INSTITUTE_CLASS_STUDENT_CONSTANTS.RELATIONS.UNVERIFIED_STUDENTS,
        where: {
          instituteId,
          classId,
          isVerified: false,
          enrollmentMethod: 'self_enrollment'
        },
        order: { createdAt: 'ASC' }
      });

      // Get total count for pagination
      const total = await this.repository.count({
        instituteId,
        classId
      });

      // Transform to secure response format
      const secureData = unverifiedStudents.map(enrollment => ({
        studentUserId: enrollment.studentUserId,
        studentName: `${enrollment.student?.user?.firstName || ''} ${enrollment.student?.user?.lastName || ''}`.trim() || 'Unknown',
        nameWithInitials: enrollment.student?.user?.nameWithInitials || undefined,
        studentEmail: enrollment.student?.user?.email || '',
        phoneNumber: enrollment.student?.user?.phoneNumber || '',
        imageUrl: enrollment.student?.user?.imageUrl ? this.cloudStorageService.getFullUrl(enrollment.student.user.imageUrl) : enrollment.student?.user?.imageUrl,
        enrollmentMethod: enrollment.enrollmentMethod,
        enrollmentDate: enrollment.createdAt,
        instituteStudentId: enrollment.student?.studentId
      }));

      return {
        data: secureData,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new BadRequestException(`Failed to retrieve unverified students: ${error.message}`);
    }
  }

  /**
   * Enhanced bulk verification with detailed results
   */
  async bulkVerifyStudentsEnhanced(
    instituteId: string,
    classId: string,
    verifications: Array<{ studentUserId: string; approve: boolean; notes?: string }>,
    verifiedBy: string
  ): Promise<{ approved: number; rejected: number; failed: number; details: any[] }> {
    const results = {
      approved: 0,
      rejected: 0,
      failed: 0,
      details: []
    };

    for (const verification of verifications) {
      try {
        const result = await this.verifyStudent(
          instituteId,
          classId,
          verification.studentUserId,
          verification.approve,
          verifiedBy
        );

        if (verification.approve && result) {
          results.approved++;
          results.details.push({
            studentUserId: verification.studentUserId,
            status: 'approved',
            message: verification.notes || 'Successfully verified and approved'
          });
        } else if (!verification.approve) {
          results.rejected++;
          results.details.push({
            studentUserId: verification.studentUserId,
            status: 'rejected',
            message: verification.notes || 'Enrollment request rejected'
          });
        }
      } catch (error) {
        results.failed++;
        results.details.push({
          studentUserId: verification.studentUserId,
          status: 'failed',
          message: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get enrollment statistics for a class
   */
  async getClassEnrollmentStats(instituteId: string, classId: string): Promise<any> {
    try {
      // Get all students for this class
      const allStudents = await this.repository.findAll({
        where: { instituteId, classId },
        withRelations: false
      });

      // Calculate statistics from the results
      const totalEnrolled = allStudents.filter(s => s.isActive).length;
      const verified = allStudents.filter(s => s.isActive && s.isVerified).length;
      const pendingVerification = allStudents.filter(s => s.isActive && !s.isVerified).length;
      const teacherAssigned = allStudents.filter(s => s.isActive && s.enrollmentMethod === 'teacher_assigned').length;
      const selfEnrolled = allStudents.filter(s => s.isActive && s.enrollmentMethod === 'self_enrollment').length;

      const stats = {
        totalEnrolled,
        verified,
        pendingVerification,
        teacherAssigned,
        selfEnrolled
      };

      return stats;
    } catch (error) {
      throw new BadRequestException(`Failed to get enrollment statistics: ${error.message}`);
    }
  }
  async selfEnroll(
    instituteId: string,
    classId: string,
    studentUserId: string,
    enrollmentCode?: string
  ): Promise<InstituteClassStudentEntity> {
    // Check if user exists and is a student
    const user = await this.userRepository.findOne({
      where: { id: studentUserId }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Access control will be handled by decorators

    // ✅ SECURITY: Verify student record exists (DO NOT auto-create)
    const student = await this.studentRepository.findOne({
      where: { userId: studentUserId }
    });

    if (!student) {
      throw new BadRequestException(
        'Student record not found. Student must be created through the official student registration process before class enrollment.'
      );
    }

    // Check if student is already assigned to this class
    const exists = await this.repository.exists({
      instituteId,
      classId,
      studentUserId,
    });

    if (exists) {
      throw new ConflictException('Student is already enrolled in this class');
    }

    try {
      const timestamp = getCurrentSriLankaISO();
      const enrollmentData = {
        instituteId,
        classId,
        studentUserId,
        isActive: true,
        isVerified: false, // Requires verification for self-enrollment
        enrollmentMethod: 'self_enrollment',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      return await this.repository.create(enrollmentData);
    } catch (error) {
      throw new BadRequestException(`Failed to self-enroll student: ${error.message}`);
    }
  }

  async verifyStudent(
    instituteId: string, 
    classId: string, 
    studentUserId: string, 
    approve: boolean, 
    verifiedBy: string
  ): Promise<InstituteClassStudentEntity | null> {
    const student = await this.repository.findOne({
      instituteId,
      classId,
      studentUserId
    });

    if (!student) {
      throw new NotFoundException(INSTITUTE_CLASS_STUDENT_CONSTANTS.ERRORS.NOT_FOUND);
    }

    if (approve) {
      // Approve the student
      return await this.repository.update(
        { instituteId, classId, studentUserId },
        {
          isVerified: true,
          verifiedBy,
          verifiedAt: new Date()
        }
      );
    } else {
      // Reject and remove the student
      await this.repository.delete({ instituteId, classId, studentUserId });
      return null;
    }
  }

  async getUnverifiedStudents(instituteId: string, classId: string): Promise<any[]> {
    // Use UserEntity repository to join with InstituteClassStudent table for complete student information
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .innerJoin('institute_class_students', 'ics', 'ics.student_user_id = user.id')
      .select([
        'user.id as id',
        'user.first_name as firstName',
        'user.last_name as lastName',
        'user.name_with_initials as nameWithInitials',
        'user.phone_number as phoneNumber',
        'user.image_url as imageUrl',
        'ics.institute_id as instituteId',
        'ics.institute_class_id as classId',
        'ics.student_user_id as studentUserId',
        'ics.enrollment_method as enrollmentMethod',
        'ics.is_verified as isVerified',
        'ics.is_active as isActive',
        'ics.created_at as enrollmentDate',
        'ics.student_type as studentType'
      ])
      .where('ics.institute_id = :instituteId', { instituteId })
      .andWhere('ics.institute_class_id = :classId', { classId })
      .andWhere('ics.is_verified = :isVerified', { isVerified: false });

    const results = await queryBuilder.getRawMany();
    
    return results.map(row => ({
      instituteId: row.instituteId,
      classId: row.classId,
      studentUserId: row.studentUserId,
      enrollmentMethod: row.enrollmentMethod,
      isVerified: row.isVerified,
      isActive: row.isActive,
      enrollmentDate: row.enrollmentDate,
      studentType: row.studentType || 'normal',
      id: row.id,
      name: `${row.firstName} ${row.lastName || ''}`.trim(),
      nameWithInitials: row.nameWithInitials || undefined,
      phoneNumber: row.phoneNumber,
      // ✅ Transform imageUrl to full URL
      imageUrl: row.imageUrl ? this.cloudStorageService.getFullUrl(row.imageUrl) : row.imageUrl,
      userIdByInstitute: `s${row.id}` // Generate institute user ID based on user ID
    }));
  }

  async bulkVerifyStudents(
    instituteId: string,
    classId: string,
    verifications: Array<{ studentUserId: string; approve: boolean }>,
    verifiedBy: string
  ): Promise<{ approved: number; rejected: number }> {
    let approved = 0;
    let rejected = 0;

    for (const verification of verifications) {
      try {
        const result = await this.verifyStudent(
          instituteId,
          classId,
          verification.studentUserId,
          verification.approve,
          verifiedBy
        );
        
        if (result) {
          approved++;
        } else {
          rejected++;
        }
      } catch (error) {
        // Log error but continue with other students
      }
    }

    return { approved, rejected };
  }

  // =================== CLASS PARENT METHODS ===================

  /**
   * Get all parents of students in a class with filtering and pagination
   * Avoids SELECT * and includes proper security measures
   */
  async getClassParents(
    instituteId: string,
    classId: string,
    query: ClassParentQueryDto
  ): Promise<PaginatedClassParentResponseDto> {
    try {
      // Validate and sanitize pagination parameters
      const page = Math.max(1, query.page || 1);
      const limit = Math.min(100, Math.max(1, query.limit || 10));
      const skip = (page - 1) * limit;

      // Build base query - Get students in class with their parent relationships
      let queryBuilder = this.studentRepository
        .createQueryBuilder('student')
        .innerJoin('institute_class_students', 'class_student', 
          'class_student.student_user_id = student.user_id AND class_student.institute_id = :instituteId AND class_student.class_id = :classId AND class_student.is_active = true'
        )
        .leftJoin('student.user', 'student_user')
        .leftJoin('parents', 'father_parent', 'father_parent.user_id = student.father_id')
        .leftJoin('father_parent.user', 'father_user')
        .leftJoin('parents', 'mother_parent', 'mother_parent.user_id = student.mother_id')
        .leftJoin('mother_parent.user', 'mother_user')
        .leftJoin('parents', 'guardian_parent', 'guardian_parent.user_id = student.guardian_id')
        .leftJoin('guardian_parent.user', 'guardian_user')
        .select([
          // Student fields
          'student.userId',
          'student.studentId',
          'student_user.id',
          'student_user.firstName', 
          'student_user.lastName',
          'student_user.email',
          // Father fields
          'father_parent.userId',
          'father_parent.occupation',
          'father_parent.workplace',
          'father_user.id',
          'father_user.firstName',
          'father_user.lastName', 
          'father_user.email',
          'father_user.phoneNumber',
          'father_user.imageUrl',
          // Mother fields  
          'mother_parent.userId',
          'mother_parent.occupation',
          'mother_parent.workplace',
          'mother_user.id',
          'mother_user.firstName',
          'mother_user.lastName',
          'mother_user.email', 
          'mother_user.phoneNumber',
          'mother_user.imageUrl',
          // Guardian fields
          'guardian_parent.userId',
          'guardian_parent.occupation', 
          'guardian_parent.workplace',
          'guardian_user.id',
          'guardian_user.firstName',
          'guardian_user.lastName',
          'guardian_user.email',
          'guardian_user.phoneNumber',
          'guardian_user.imageUrl'
        ])
        .setParameters({ instituteId, classId });

      // Apply filters
      if (query.studentId) {
        queryBuilder = queryBuilder.andWhere('student.user_id = :studentId', { 
          studentId: query.studentId 
        });
      }

      if (query.studentName) {
        queryBuilder = queryBuilder.andWhere(
          '(LOWER(student_user.firstName) LIKE LOWER(:studentName) OR LOWER(student_user.lastName) LIKE LOWER(:studentName))',
          { studentName: `%${query.studentName.trim()}%` }
        );
      }

      if (query.parentName) {
        queryBuilder = queryBuilder.andWhere(
          '(LOWER(father_user.firstName) LIKE LOWER(:parentName) OR LOWER(father_user.lastName) LIKE LOWER(:parentName) OR ' +
          'LOWER(mother_user.firstName) LIKE LOWER(:parentName) OR LOWER(mother_user.lastName) LIKE LOWER(:parentName) OR ' +
          'LOWER(guardian_user.firstName) LIKE LOWER(:parentName) OR LOWER(guardian_user.lastName) LIKE LOWER(:parentName))',
          { parentName: `%${query.parentName.trim()}%` }
        );
      }

      // Execute query with pagination
      const [students, total] = await Promise.all([
        queryBuilder.skip(skip).take(limit).getMany(),
        queryBuilder.getCount()
      ]);

      // Transform data to parent-centric format
      const parents: ClassParentResponseDto[] = [];

      students.forEach(student => {
        const studentData = {
          userId: student.userId,
          name: `${student.user?.firstName || ''} ${student.user?.lastName || ''}`.trim() || student.user?.email || 'Unknown Student',
          studentId: student.studentId
        };

        // Add father if exists
        if (student.father?.user) {
          const includeParent = !query.relationship || query.relationship === 'father';
          if (includeParent) {
            parents.push(new ClassParentResponseDto(
              {
                id: student.father.userId,
                firstName: student.father.user.firstName,
                lastName: student.father.user.lastName,
                email: student.father.user.email,
                phoneNumber: student.father.user.phoneNumber,
                // ✅ Transform imageUrl to full URL
                imageUrl: student.father.user.imageUrl ? this.cloudStorageService.getFullUrl(student.father.user.imageUrl) : student.father.user.imageUrl,
                occupation: student.father.occupation,
                workplace: student.father.workplace
              },
              studentData,
              'father'
            ));
          }
        }

        // Add mother if exists  
        if (student.mother?.user) {
          const includeParent = !query.relationship || query.relationship === 'mother';
          if (includeParent) {
            parents.push(new ClassParentResponseDto(
              {
                id: student.mother.userId,
                firstName: student.mother.user.firstName,
                lastName: student.mother.user.lastName,
                email: student.mother.user.email,
                phoneNumber: student.mother.user.phoneNumber,
                // ✅ Transform imageUrl to full URL
                imageUrl: student.mother.user.imageUrl ? this.cloudStorageService.getFullUrl(student.mother.user.imageUrl) : student.mother.user.imageUrl,
                occupation: student.mother.occupation,
                workplace: student.mother.workplace
              },
              studentData,
              'mother'
            ));
          }
        }

        // Add guardian if exists
        if (student.guardian?.user) {
          const includeParent = !query.relationship || query.relationship === 'guardian';
          if (includeParent) {
            parents.push(new ClassParentResponseDto(
              {
                id: student.guardian.userId,
                firstName: student.guardian.user.firstName,
                lastName: student.guardian.user.lastName,
                email: student.guardian.user.email,
                phoneNumber: student.guardian.user.phoneNumber,
                // ✅ Transform imageUrl to full URL
                imageUrl: student.guardian.user.imageUrl ? this.cloudStorageService.getFullUrl(student.guardian.user.imageUrl) : student.guardian.user.imageUrl,
                occupation: student.guardian.occupation,
                workplace: student.guardian.workplace
              },
              studentData,
              'guardian'
            ));
          }
        }
      });

      return {
        data: parents,
        meta: {
          total: parents.length, // Total parents, not students
          page,
          limit,
          totalPages: Math.ceil(parents.length / limit)
        }
      };

    } catch (error) {
      throw new BadRequestException('Failed to retrieve class parents');
    }
  }

  async updateClassStudentType(
    instituteId: string,
    classId: string,
    studentUserId: string,
    studentType: 'normal' | 'paid' | 'free_card' | 'half_paid' | 'quarter_paid',
  ): Promise<{ message: string; studentType: string }> {
    const record = await this.classStudentRepository.findOne({
      where: { instituteId, classId, studentUserId },
    });
    if (!record) {
      throw new NotFoundException('Student is not enrolled in this class');
    }
    await this.classStudentRepository.update(
      { instituteId, classId, studentUserId },
      { studentType },
    );
    await this.userManagementService.refreshUserCache(studentUserId);
    return { message: 'Class student type updated', studentType };
  }
}
