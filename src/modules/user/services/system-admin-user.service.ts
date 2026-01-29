/**
 * System Admin User Service
 * 
 * Provides APIs for system administrators to:
 * - Create users with minimal information (only phone OR email required)
 * - Create complete family units (student + parents) in one call
 * - Manage incomplete profiles
 * - Handle first-login flow
 */

import { Injectable, BadRequestException, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { getCurrentSriLankaTime } from '../../../common/utils/timezone.util';
import { UserEntity } from '../entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { UserType } from '../enums/user-type.enum';
import { ProfileCompletionStatus, calculateProfileCompletion, determineProfileStatus } from '../enums/profile-completion-status.enum';
import { 
  CreateFamilyUnitDto, 
  CreateFamilyUnitResponseDto, 
  FamilyMemberResponseDto,
  MinimalUserDto,
  FamilyMemberUserDto,
  FamilyStudentDto,
  BulkCreateFamilyDto,
  BulkCreateFamilyResponseDto,
  InstituteEnrollmentDto,
  InstituteEnrollmentResponseDto,
  ClassEnrollmentResponseDto,
  SubjectEnrollmentResponseDto,
  GenerateProfileImageUrlDto,
  GenerateProfileImageUrlResponseDto,
  AssignProfileImageDto,
  AssignProfileImageResponseDto,
  LookupStudentResponseDto,
  GenerateProfileImageUrlByUserIdDto,
  AssignProfileImageByUserIdDto,
} from '../dto/create-family-unit.dto';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteUserType } from '../../institute_mudules/institue_user/enums/institute-user-type.enum';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';
import { InstituteUserStatus } from '../../institute_mudules/institue_user/enums/institute-user-status.enum';
import { ImageVerificationStatus } from '../../institute_mudules/institue_user/enums/image-verification-status.enum';
import { AsyncEmailService } from '../../../common/services/async-email.service';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { now } from '../../../common/utils/timezone.util';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SystemAdminUserService {
  private readonly logger = new Logger(SystemAdminUserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(InstituteClassEntity)
    private readonly instituteClassRepository: Repository<InstituteClassEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly instituteClassStudentRepository: Repository<InstituteClassStudentEntity>,
    @InjectRepository(InstituteClassSubjectStudent)
    private readonly instituteClassSubjectStudentRepository: Repository<InstituteClassSubjectStudent>,
    private readonly dataSource: DataSource,
    private readonly asyncEmailService: AsyncEmailService,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  /**
   * 👨‍👩‍👧 Create complete family unit
   * 
   * Creates student + optional parents/guardian in one transaction.
   * Each user only needs email OR phone.
   * Incomplete profiles are marked for first-login completion.
   */
  async createFamilyUnit(
    dto: CreateFamilyUnitDto,
    adminUserId: string
  ): Promise<CreateFamilyUnitResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate at least email or phone for student
      if (!dto.student.email && !dto.student.phoneNumber) {
        throw new BadRequestException('Student must have at least email OR phone number');
      }

      const createdUsers: {
        student?: FamilyMemberResponseDto;
        father?: FamilyMemberResponseDto;
        mother?: FamilyMemberResponseDto;
        guardian?: FamilyMemberResponseDto;
      } = {};

      let fatherId: string | null = null;
      let motherId: string | null = null;
      let guardianId: string | null = null;
      let notificationsSent = 0;

      // ============================================
      // STEP 1: Create Father (if provided)
      // ============================================
      if (dto.father && (dto.father.email || dto.father.phoneNumber)) {
        const fatherResult = await this.createOrFindParentUser(
          queryRunner,
          dto.father,
          'father',
          adminUserId,
          dto.sendWelcomeNotifications
        );
        createdUsers.father = fatherResult.response;
        fatherId = fatherResult.userId;
        if (fatherResult.notificationSent) notificationsSent++;
      }

      // ============================================
      // STEP 2: Create Mother (if provided)
      // ============================================
      if (dto.mother && (dto.mother.email || dto.mother.phoneNumber)) {
        const motherResult = await this.createOrFindParentUser(
          queryRunner,
          dto.mother,
          'mother',
          adminUserId,
          dto.sendWelcomeNotifications
        );
        createdUsers.mother = motherResult.response;
        motherId = motherResult.userId;
        if (motherResult.notificationSent) notificationsSent++;
      }

      // ============================================
      // STEP 3: Create Guardian (if provided and different from parents)
      // ============================================
      if (dto.guardian && (dto.guardian.email || dto.guardian.phoneNumber)) {
        // Check if guardian is same as father or mother
        const guardianIsFather = dto.father && (
          (dto.guardian.email && dto.guardian.email === dto.father.email) ||
          (dto.guardian.phoneNumber && dto.guardian.phoneNumber === dto.father.phoneNumber)
        );
        const guardianIsMother = dto.mother && (
          (dto.guardian.email && dto.guardian.email === dto.mother.email) ||
          (dto.guardian.phoneNumber && dto.guardian.phoneNumber === dto.mother.phoneNumber)
        );

        if (guardianIsFather) {
          guardianId = fatherId;
          createdUsers.guardian = createdUsers.father;
        } else if (guardianIsMother) {
          guardianId = motherId;
          createdUsers.guardian = createdUsers.mother;
        } else {
          const guardianResult = await this.createOrFindParentUser(
            queryRunner,
            dto.guardian,
            'guardian',
            adminUserId,
            dto.sendWelcomeNotifications
          );
          createdUsers.guardian = guardianResult.response;
          guardianId = guardianResult.userId;
          if (guardianResult.notificationSent) notificationsSent++;
        }
      }

      // ============================================
      // STEP 4: Create Student
      // ============================================
      const studentResult = await this.createStudentUser(
        queryRunner,
        dto.student,
        { fatherId, motherId, guardianId },
        adminUserId,
        dto.sendWelcomeNotifications
      );
      createdUsers.student = studentResult.response;
      if (studentResult.notificationSent) notificationsSent++;

      // ============================================
      // STEP 5: Institute Enrollments (new nested structure)
      // ============================================
      let instituteEnrollments: InstituteEnrollmentResponseDto[] = [];
      let enrollmentSummary = {
        totalInstitutes: 0,
        totalClasses: 0,
        totalSubjects: 0,
        allActive: true,
        allVerified: true
      };

      if (dto.instituteEnrollments && dto.instituteEnrollments.length > 0) {
        for (const enrollment of dto.instituteEnrollments) {
          const result = await this.enrollStudentToInstituteNested(
            queryRunner,
            studentResult.userId,
            enrollment,
            adminUserId,
            dto.autoActivateEnrollments !== false
          );
          instituteEnrollments.push(result);
          
          if (result.success) {
            enrollmentSummary.totalInstitutes++;
            if (result.classEnrollments) {
              enrollmentSummary.totalClasses += result.classEnrollments.length;
              result.classEnrollments.forEach(ce => {
                if (ce.subjectEnrollments) {
                  enrollmentSummary.totalSubjects += ce.subjectEnrollments.length;
                }
                if (!ce.isActive) enrollmentSummary.allActive = false;
                if (!ce.isVerified) enrollmentSummary.allVerified = false;
              });
            }
          }
        }
      }

      // Legacy: Handle old instituteCode/classId format
      let instituteEnrollment: CreateFamilyUnitResponseDto['instituteEnrollment'];
      if (dto.instituteCode && !dto.instituteEnrollments) {
        instituteEnrollment = await this.enrollStudentToInstitute(
          queryRunner,
          studentResult.userId,
          dto.instituteCode,
          dto.classId
        );
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      // Calculate totals
      const totalUsersCreated = [
        createdUsers.student,
        createdUsers.father,
        createdUsers.mother,
        createdUsers.guardian
      ].filter(u => u && u.id).length;

      const incompleteProfiles = [
        createdUsers.student,
        createdUsers.father,
        createdUsers.mother,
        createdUsers.guardian
      ].filter(u => u && u.profileCompletionStatus === ProfileCompletionStatus.INCOMPLETE).length;

      return {
        success: true,
        message: `Family unit created successfully. ${incompleteProfiles} user(s) need to complete their profile via first login.`,
        student: createdUsers.student!,
        father: createdUsers.father,
        mother: createdUsers.mother,
        guardian: createdUsers.guardian,
        instituteEnrollments: instituteEnrollments.length > 0 ? instituteEnrollments : undefined,
        instituteEnrollment, // Legacy
        enrollmentSummary: instituteEnrollments.length > 0 ? enrollmentSummary : undefined,
        totalUsersCreated,
        incompleteProfiles,
        notificationsSent
      };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to create family unit: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * 📦 Bulk create family units
   */
  async bulkCreateFamilyUnits(
    dto: BulkCreateFamilyDto,
    adminUserId: string
  ): Promise<BulkCreateFamilyResponseDto> {
    const results: BulkCreateFamilyResponseDto['results'] = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < dto.families.length; i++) {
      try {
        const result = await this.createFamilyUnit(dto.families[i], adminUserId);
        results.push(result);
        successCount++;
      } catch (error) {
        failedCount++;
        results.push({
          success: false,
          error: error.message,
          index: i
        });

        if (!dto.continueOnError) {
          break;
        }
      }
    }

    return {
      totalRequested: dto.families.length,
      successCount,
      failedCount,
      results
    };
  }

  /**
   * 🔐 Complete first login - Set password and mark profile as basic
   */
  async completeFirstLogin(
    userId: string,
    password: string,
    additionalInfo?: {
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      gender?: string;
    }
  ): Promise<{ success: boolean; message: string; canLogin: boolean }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'profileCompletionStatus', 'firstName', 'lastName', 'email', 'phoneNumber']
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update user
    const updates: Partial<UserEntity> = {
      password: hashedPassword,
      passwordSetAt: now(),
      firstLoginCompleted: true,
      updatedAt: now()
    };

    // Add additional info if provided
    if (additionalInfo?.firstName) updates.firstName = additionalInfo.firstName;
    if (additionalInfo?.lastName) updates.lastName = additionalInfo.lastName;
    if (additionalInfo?.dateOfBirth) updates.dateOfBirth = new Date(additionalInfo.dateOfBirth);
    if (additionalInfo?.gender) updates.gender = additionalInfo.gender as any;

    // Generate nameWithInitials if we now have firstName and lastName
    if ((user.firstName || additionalInfo?.firstName) && (user.lastName || additionalInfo?.lastName)) {
      const firstName = additionalInfo?.firstName || user.firstName || '';
      const lastName = additionalInfo?.lastName || user.lastName || '';
      updates.nameWithInitials = this.generateNameWithInitials(firstName, lastName);
    }

    // Recalculate completion status
    const updatedUser = { ...user, ...updates, password: hashedPassword };
    updates.profileCompletionStatus = determineProfileStatus(updatedUser);
    updates.profileCompletionPercentage = calculateProfileCompletion(updatedUser);

    await this.userRepository.update(userId, updates);

    return {
      success: true,
      message: 'First login completed successfully. You can now access the system.',
      canLogin: updates.profileCompletionStatus !== ProfileCompletionStatus.INCOMPLETE
    };
  }

  /**
   * 📊 Get users with incomplete profiles
   */
  async getIncompleteProfiles(
    options: {
      page?: number;
      limit?: number;
      createdByAdminId?: string;
    }
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {
      profileCompletionStatus: ProfileCompletionStatus.INCOMPLETE
    };

    if (options.createdByAdminId) {
      where.createdByAdminId = options.createdByAdminId;
    }

    const [users, total] = await this.userRepository.findAndCount({
      where,
      select: [
        'id', 'firstName', 'lastName', 'nameWithInitials', 'email', 'phoneNumber',
        'userType', 'profileCompletionStatus', 'profileCompletionPercentage',
        'createdAt', 'createdByAdminId'
      ],
      order: { createdAt: 'DESC' },
      skip,
      take: limit
    });

    return {
      data: users,
      total,
      page,
      limit
    };
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  /**
   * Create or find existing parent user
   */
  private async createOrFindParentUser(
    queryRunner: QueryRunner,
    data: FamilyMemberUserDto,
    role: 'father' | 'mother' | 'guardian',
    adminUserId: string,
    sendNotification?: boolean
  ): Promise<{ userId: string; response: FamilyMemberResponseDto; notificationSent: boolean }> {
    
    // Check if user already exists
    let existingUser: UserEntity | null = null;
    if (data.email) {
      existingUser = await queryRunner.manager.findOne(UserEntity, {
        where: { email: data.email.toLowerCase() }
      });
    }
    if (!existingUser && data.phoneNumber) {
      existingUser = await queryRunner.manager.findOne(UserEntity, {
        where: { phoneNumber: data.phoneNumber }
      });
    }

    if (existingUser) {
      // User exists - verify they can be a parent
      if (existingUser.userType !== UserType.USER && existingUser.userType !== UserType.USER_WITHOUT_STUDENT) {
        throw new BadRequestException(
          `${role} with email/phone already exists but cannot be assigned as parent (type: ${existingUser.userType})`
        );
      }

      // Ensure parent record exists
      let parentRecord = await queryRunner.manager.findOne(ParentEntity, {
        where: { userId: existingUser.id }
      });

      if (!parentRecord) {
        // Create parent record
        parentRecord = queryRunner.manager.create(ParentEntity, {
          userId: existingUser.id,
          occupation: data.occupation,
          workplace: data.workplace,
          workPhone: data.workPhone,
          educationLevel: data.educationLevel,
          isActive: true,
          createdAt: now(),
          updatedAt: now()
        });
        await queryRunner.manager.save(parentRecord);
      }

      return {
        userId: existingUser.id,
        response: this.toFamilyMemberResponse(existingUser, false),
        notificationSent: false
      };
    }

    // Create new user
    const nameWithInitials = data.nameWithInitials || 
      (data.firstName && data.lastName ? this.generateNameWithInitials(data.firstName, data.lastName) : null);

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (data.password) {
      hashedPassword = await bcrypt.hash(data.password, 12);
    }

    const completionStatus = determineProfileStatus({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      password: hashedPassword
    });

    const userEntity = queryRunner.manager.create(UserEntity, {
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      nameWithInitials,
      email: data.email?.toLowerCase() || null,
      phoneNumber: data.phoneNumber || null,
      password: hashedPassword || null,
      passwordSetAt: hashedPassword ? now() : null,
      userType: UserType.USER_WITHOUT_STUDENT,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender,
      nic: data.nic || null,
      rfid: data.rfid || null,
      addressLine1: data.addressLine1 || null,
      addressLine2: data.addressLine2 || null,
      city: data.city || null,
      district: data.district,
      province: data.province,
      postalCode: data.postalCode || null,
      imageUrl: data.imageUrl || null,
      language: data.language,
      isActive: true,
      isPhoneVerified: false,
      isEmailVerified: false,
      profileCompletionStatus: completionStatus,
      profileCompletionPercentage: calculateProfileCompletion({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        password: hashedPassword
      }),
      firstLoginCompleted: !!hashedPassword, // If password provided, first login is complete
      createdByAdminId: adminUserId,
      createdAt: now(),
      updatedAt: now()
    });

    const savedUser = await queryRunner.manager.save(userEntity);

    // Create parent record
    const parentEntity = queryRunner.manager.create(ParentEntity, {
      userId: savedUser.id,
      occupation: data.occupation,
      workplace: data.workplace,
      workPhone: data.workPhone,
      educationLevel: data.educationLevel,
      isActive: true,
      createdAt: now(),
      updatedAt: now()
    });
    await queryRunner.manager.save(parentEntity);

    // Send notification
    let notificationSent = false;
    if (sendNotification !== false) {
      notificationSent = await this.sendWelcomeNotification(savedUser, role);
    }

    return {
      userId: savedUser.id,
      response: this.toFamilyMemberResponse(savedUser, notificationSent),
      notificationSent
    };
  }

  /**
   * Create student user
   */
  private async createStudentUser(
    queryRunner: QueryRunner,
    data: FamilyStudentDto,
    parents: { fatherId: string | null; motherId: string | null; guardianId: string | null },
    adminUserId: string,
    sendNotification?: boolean
  ): Promise<{ userId: string; response: FamilyMemberResponseDto; notificationSent: boolean }> {
    
    // Check if user already exists
    let existingUser: UserEntity | null = null;
    if (data.email) {
      existingUser = await queryRunner.manager.findOne(UserEntity, {
        where: { email: data.email.toLowerCase() }
      });
    }
    if (!existingUser && data.phoneNumber) {
      existingUser = await queryRunner.manager.findOne(UserEntity, {
        where: { phoneNumber: data.phoneNumber }
      });
    }

    if (existingUser) {
      throw new BadRequestException(
        `Student with email/phone already exists (ID: ${existingUser.id}). Use update API instead.`
      );
    }

    // Create user
    const nameWithInitials = data.nameWithInitials || 
      (data.firstName && data.lastName ? this.generateNameWithInitials(data.firstName, data.lastName) : null);

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (data.password) {
      hashedPassword = await bcrypt.hash(data.password, 12);
    }

    const completionStatus = determineProfileStatus({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      password: hashedPassword
    });

    const userEntity = queryRunner.manager.create(UserEntity, {
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      nameWithInitials,
      email: data.email?.toLowerCase() || null,
      phoneNumber: data.phoneNumber || null,
      password: hashedPassword || null,
      passwordSetAt: hashedPassword ? now() : null,
      userType: UserType.USER,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender,
      nic: data.nic || null,
      rfid: data.rfid || null,
      addressLine1: data.addressLine1 || null,
      addressLine2: data.addressLine2 || null,
      city: data.city || null,
      district: data.district,
      province: data.province,
      postalCode: data.postalCode || null,
      imageUrl: data.imageUrl || null,
      language: data.language,
      isActive: true,
      isPhoneVerified: false,
      isEmailVerified: false,
      profileCompletionStatus: completionStatus,
      profileCompletionPercentage: calculateProfileCompletion({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        password: hashedPassword
      }),
      firstLoginCompleted: !!hashedPassword, // If password provided, first login is complete
      createdByAdminId: adminUserId,
      createdAt: now(),
      updatedAt: now()
    });

    const savedUser = await queryRunner.manager.save(userEntity);

    // Create student record
    const studentEntity = queryRunner.manager.create(StudentEntity, {
      userId: savedUser.id,
      studentId: data.studentId || this.generateStudentId(),
      fatherId: parents.fatherId,
      motherId: parents.motherId,
      guardianId: parents.guardianId,
      emergencyContact: data.emergencyContact,
      bloodGroup: data.bloodGroup,
      medicalConditions: data.medicalConditions,
      allergies: data.allergies,
      isActive: true,
      createdAt: now(),
      updatedAt: now()
    });
    await queryRunner.manager.save(studentEntity);

    // Send notification
    let notificationSent = false;
    if (sendNotification !== false) {
      notificationSent = await this.sendWelcomeNotification(savedUser, 'student');
    }

    const response = this.toFamilyMemberResponse(savedUser, notificationSent);
    response.studentId = studentEntity.studentId;

    return {
      userId: savedUser.id,
      response,
      notificationSent
    };
  }

  /**
   * Enroll student to institute
   */
  private async enrollStudentToInstitute(
    queryRunner: QueryRunner,
    studentUserId: string,
    instituteCode: string,
    classId?: string
  ): Promise<CreateFamilyUnitResponseDto['instituteEnrollment']> {
    try {
      // Find institute
      const institute = await queryRunner.manager.findOne(InstituteEntity, {
        where: { code: instituteCode }
      });

      if (!institute) {
        return {
          success: false,
          message: `Institute not found with code: ${instituteCode}`
        };
      }

      // Create institute user record
      const existingInstituteUser = await queryRunner.manager.findOne(InstituteUserEntity, {
        where: { instituteId: institute.id, userId: studentUserId }
      });

      if (!existingInstituteUser) {
        const instituteUser = queryRunner.manager.create(InstituteUserEntity, {
          instituteId: institute.id,
          userId: studentUserId,
          userType: InstituteUserType.STUDENT,
          isActive: true,
          createdAt: now(),
          updatedAt: now()
        });
        await queryRunner.manager.save(instituteUser);
      }

      let className: string | undefined;

      // Enroll to class if specified
      if (classId) {
        const classEntity = await queryRunner.manager.findOne(InstituteClassEntity, {
          where: { id: classId, instituteId: institute.id }
        });

        if (classEntity) {
          className = classEntity.name;

          // Check if already enrolled
          const existingEnrollment = await queryRunner.manager.findOne(InstituteClassStudentEntity, {
            where: { classId, studentUserId }
          });

          if (!existingEnrollment) {
            const enrollment = queryRunner.manager.create(InstituteClassStudentEntity, {
              classId,
              studentUserId,
              isVerified: true,
              isActive: true,
              createdAt: now(),
              updatedAt: now()
            });
            await queryRunner.manager.save(enrollment);
          }
        }
      }

      return {
        success: true,
        instituteId: institute.id,
        instituteName: institute.name,
        classId,
        className,
        message: classId 
          ? `Student enrolled to ${institute.name} - ${className}`
          : `Student enrolled to ${institute.name}`
      };

    } catch (error) {
      this.logger.error(`Failed to enroll student: ${error.message}`);
      return {
        success: false,
        message: `Enrollment failed: ${error.message}`
      };
    }
  }

  /**
   * 🏫 Enroll student to institute with nested class/subject structure
   * System admin created enrollments are automatically ACTIVE and verified
   */
  private async enrollStudentToInstituteNested(
    queryRunner: QueryRunner,
    studentUserId: string,
    enrollment: InstituteEnrollmentDto,
    adminUserId: string,
    autoActivate: boolean = true
  ): Promise<InstituteEnrollmentResponseDto> {
    try {
      // Find institute
      const institute = await queryRunner.manager.findOne(InstituteEntity, {
        where: { id: enrollment.instituteId }
      });

      if (!institute) {
        return {
          success: false,
          message: `Institute not found with ID: ${enrollment.instituteId}`
        };
      }

      // Create or update institute user record
      let instituteUser = await queryRunner.manager.findOne(InstituteUserEntity, {
        where: { instituteId: institute.id, userId: studentUserId }
      });

      const instituteUserType = (enrollment.instituteUserType as InstituteUserType) || InstituteUserType.STUDENT;

      if (!instituteUser) {
        instituteUser = queryRunner.manager.create(InstituteUserEntity, {
          instituteId: institute.id,
          userId: studentUserId,
          instituteUserType: instituteUserType,
          userIdByInstitute: enrollment.userIdByInstitute || null,
          instituteUserImageUrl: enrollment.instituteUserImageUrl || null,
          instituteCardId: enrollment.instituteCardId || null,
          status: autoActivate ? InstituteUserStatus.ACTIVE : InstituteUserStatus.PENDING,
          verifiedBy: autoActivate ? adminUserId : null,
          verifiedAt: autoActivate ? now() : null,
          imageVerificationStatus: enrollment.instituteUserImageUrl && autoActivate 
            ? ImageVerificationStatus.VERIFIED 
            : ImageVerificationStatus.PENDING,
          imageVerifiedBy: enrollment.instituteUserImageUrl && autoActivate ? adminUserId : null,
          createdAt: now(),
          updatedAt: now()
        });
        await queryRunner.manager.save(instituteUser);
      } else {
        // Update existing institute user with new data if provided
        const updates: Partial<InstituteUserEntity> = { updatedAt: now() };
        if (enrollment.userIdByInstitute) updates.userIdByInstitute = enrollment.userIdByInstitute;
        if (enrollment.instituteUserImageUrl) updates.instituteUserImageUrl = enrollment.instituteUserImageUrl;
        if (enrollment.instituteCardId) updates.instituteCardId = enrollment.instituteCardId;
        if (autoActivate && instituteUser.status === InstituteUserStatus.PENDING) {
          updates.status = InstituteUserStatus.ACTIVE;
          updates.verifiedBy = adminUserId;
          updates.verifiedAt = now();
        }
        await queryRunner.manager.update(InstituteUserEntity, 
          { instituteId: institute.id, userId: studentUserId }, 
          updates
        );
      }

      // Process class enrollments
      const classEnrollmentResults: ClassEnrollmentResponseDto[] = [];

      if (enrollment.classEnrollments && enrollment.classEnrollments.length > 0) {
        for (const classEnrollment of enrollment.classEnrollments) {
          const classResult = await this.enrollStudentToClass(
            queryRunner,
            studentUserId,
            institute.id,
            classEnrollment.classId,
            classEnrollment.subjectEnrollments || [],
            adminUserId,
            autoActivate
          );
          classEnrollmentResults.push(classResult);
        }
      }

      return {
        success: true,
        instituteId: institute.id,
        instituteName: institute.name,
        instituteUserType: instituteUserType,
        status: autoActivate ? 'ACTIVE' : 'PENDING',
        userIdByInstitute: enrollment.userIdByInstitute,
        classEnrollments: classEnrollmentResults,
        message: `Student enrolled to ${institute.name}` + 
          (classEnrollmentResults.length > 0 ? ` with ${classEnrollmentResults.length} class(es)` : '')
      };

    } catch (error) {
      this.logger.error(`Failed to enroll student to institute: ${error.message}`);
      return {
        success: false,
        message: `Institute enrollment failed: ${error.message}`
      };
    }
  }

  /**
   * 📚 Enroll student to class with subjects
   */
  private async enrollStudentToClass(
    queryRunner: QueryRunner,
    studentUserId: string,
    instituteId: string,
    classId: string,
    subjectEnrollments: { subjectId: string }[],
    adminUserId: string,
    autoActivate: boolean
  ): Promise<ClassEnrollmentResponseDto> {
    // Find class
    const classEntity = await queryRunner.manager.findOne(InstituteClassEntity, {
      where: { id: classId, instituteId: instituteId }
    });

    if (!classEntity) {
      return {
        classId,
        isActive: false,
        isVerified: false,
        enrollmentMethod: 'manual',
        subjectEnrollments: []
      };
    }

    // Check if already enrolled in class
    let classStudent = await queryRunner.manager.findOne(InstituteClassStudentEntity, {
      where: { instituteId, classId, studentUserId }
    });

    if (!classStudent) {
      classStudent = queryRunner.manager.create(InstituteClassStudentEntity, {
        instituteId,
        classId,
        studentUserId,
        isActive: true,
        isVerified: autoActivate,
        enrollmentMethod: 'manual',
        verifiedBy: autoActivate ? adminUserId : null,
        verifiedAt: autoActivate ? now() : null,
        createdAt: now(),
        updatedAt: now()
      });
      await queryRunner.manager.save(classStudent);
    } else if (autoActivate && !classStudent.isVerified) {
      // Auto-verify existing enrollment
      await queryRunner.manager.update(InstituteClassStudentEntity,
        { instituteId, classId, studentUserId },
        { 
          isVerified: true, 
          verifiedBy: adminUserId, 
          verifiedAt: now(),
          updatedAt: now()
        }
      );
    }

    // Process subject enrollments
    const subjectEnrollmentResults: SubjectEnrollmentResponseDto[] = [];

    if (subjectEnrollments.length > 0) {
      for (const subjectEnrollment of subjectEnrollments) {
        const subjectResult = await this.enrollStudentToSubject(
          queryRunner,
          studentUserId,
          instituteId,
          classId,
          subjectEnrollment.subjectId,
          adminUserId
        );
        subjectEnrollmentResults.push(subjectResult);
      }
    }

    return {
      classId,
      className: classEntity.name,
      isActive: true,
      isVerified: autoActivate,
      enrollmentMethod: 'manual',
      subjectEnrollments: subjectEnrollmentResults
    };
  }

  /**
   * 📖 Enroll student to subject
   */
  private async enrollStudentToSubject(
    queryRunner: QueryRunner,
    studentUserId: string,
    instituteId: string,
    classId: string,
    subjectId: string,
    adminUserId: string
  ): Promise<SubjectEnrollmentResponseDto> {
    // Check if already enrolled
    let subjectStudent = await queryRunner.manager.findOne(InstituteClassSubjectStudent, {
      where: { instituteId, classId, subjectId, studentId: studentUserId }
    });

    if (!subjectStudent) {
      subjectStudent = queryRunner.manager.create(InstituteClassSubjectStudent, {
        instituteId,
        classId,
        subjectId,
        studentId: studentUserId,
        isActive: true,
        enrollmentMethod: 'teacher_assigned',
        enrolledBy: adminUserId,
        createdAt: now(),
        updatedAt: now()
      });
      await queryRunner.manager.save(subjectStudent);
    }

    return {
      subjectId,
      isActive: true,
      enrollmentMethod: 'teacher_assigned'
    };
  }

  /**
   * Send welcome notification
   */
  private async sendWelcomeNotification(
    user: UserEntity,
    role: 'student' | 'father' | 'mother' | 'guardian'
  ): Promise<boolean> {
    try {
      const firstLoginUrl = `${process.env.FRONTEND_URL || 'https://app.suraksha.lk'}/first-login?userId=${user.id}`;
      
      if (user.email) {
        this.asyncEmailService.sendTemplateEmailAsync({
          templateType: 'welcome-incomplete-profile',
          toEmails: [user.email],
          templateData: {
            name: user.firstName || user.nameWithInitials || 'User',
            role: role,
            firstLoginUrl,
            email: user.email,
            phoneNumber: user.phoneNumber
          },
          customSubject: 'Welcome to Suraksha LMS - Complete Your Registration'
        });
        return true;
      }

      // TODO: Send SMS if phone but no email
      if (user.phoneNumber) {
        this.logger.log(`SMS notification queued for ${user.phoneNumber} (not implemented)`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.warn(`Failed to send welcome notification: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate name with initials
   */
  private generateNameWithInitials(firstName: string, lastName: string): string {
    const firstNameWords = firstName.split(/\s+/).filter(word => word.length > 0);
    const lastNameWords = lastName.split(/\s+/).filter(word => word.length > 0);
    
    const firstNameInitials = firstNameWords
      .map(word => word.charAt(0).toUpperCase() + '.')
      .join('');
    
    const lastNameInitials = lastNameWords.slice(0, -1)
      .map(word => word.charAt(0).toUpperCase() + '.')
      .join('');
    
    const finalWord = lastNameWords[lastNameWords.length - 1] || '';
    const capitalizedFinalWord = finalWord.charAt(0).toUpperCase() + finalWord.slice(1).toLowerCase();
    
    return `${firstNameInitials}${lastNameInitials} ${capitalizedFinalWord}`.trim();
  }

  /**
   * Generate unique student ID
   */
  private generateStudentId(): string {
    const year = getCurrentSriLankaTime().getFullYear();
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    return `STU-${year}-${random}`;
  }

  /**
   * 📧 Resend welcome notification to user
   */
  async resendWelcomeNotification(
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'firstName', 'nameWithInitials', 'email', 'phoneNumber', 'profileCompletionStatus', 'userType']
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (!user.email && !user.phoneNumber) {
      throw new BadRequestException('User has no email or phone number to send notification');
    }

    // Determine role based on user type
    let role: 'student' | 'father' | 'mother' | 'guardian' = 'student';
    if (user.userType === UserType.USER_WITHOUT_STUDENT) {
      role = 'guardian'; // Parent without student
    }

    const sent = await this.sendWelcomeNotification(user as UserEntity, role);

    return {
      success: sent,
      message: sent 
        ? 'Welcome notification sent successfully' 
        : 'Failed to send notification - no email or phone available'
    };
  }

  /**
   * Convert user entity to response DTO
   */
  private toFamilyMemberResponse(user: UserEntity, welcomeMessageSent: boolean): FamilyMemberResponseDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      nameWithInitials: user.nameWithInitials,
      email: user.email,
      phoneNumber: user.phoneNumber,
      profileCompletionStatus: user.profileCompletionStatus || ProfileCompletionStatus.INCOMPLETE,
      profileCompletionPercentage: user.profileCompletionPercentage || 0,
      welcomeMessageSent,
      firstLoginUrl: user.profileCompletionStatus === ProfileCompletionStatus.INCOMPLETE
        ? `${process.env.FRONTEND_URL || 'https://app.suraksha.lk'}/first-login?userId=${user.id}`
        : undefined
    };
  }

  // ==========================================
  // 📸 PROFILE IMAGE MANAGEMENT
  // ==========================================

  /**
   * 🔍 Lookup Student by Student ID
   */
  async lookupStudentById(studentId: string): Promise<LookupStudentResponseDto> {
    const student = await this.studentRepository.findOne({
      where: { studentId },
      relations: ['user']
    });

    if (!student) {
      throw new NotFoundException(`Student not found with ID: ${studentId}`);
    }

    const user = student.user;

    return {
      studentId: student.studentId,
      userId: student.userId,
      firstName: user.firstName,
      lastName: user.lastName,
      nameWithInitials: user.nameWithInitials,
      email: user.email,
      phoneNumber: user.phoneNumber,
      imageUrl: user.imageUrl,
      profileCompletionStatus: user.profileCompletionStatus,
      profileCompletionPercentage: user.profileCompletionPercentage
    };
  }

  /**
   * 🔗 Generate Signed URL for Profile Image Upload
   */
  async generateProfileImageUrl(
    dto: GenerateProfileImageUrlDto
  ): Promise<GenerateProfileImageUrlResponseDto> {
    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(dto.contentType)) {
      throw new BadRequestException(
        `Invalid content type. Allowed: ${allowedTypes.join(', ')}`
      );
    }

    // Validate file size (max 5MB)
    const maxFileSize = 5 * 1024 * 1024; // 5MB
    if (dto.fileSize && dto.fileSize > maxFileSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed (5MB). Provided: ${(dto.fileSize / 1024 / 1024).toFixed(2)}MB`
      );
    }

    // Find student by studentId
    const student = await this.studentRepository.findOne({
      where: { studentId: dto.studentId },
      relations: ['user']
    });

    if (!student) {
      throw new NotFoundException(`Student not found with ID: ${dto.studentId}`);
    }

    const user = student.user;

    // Generate signed URL
    const folder = 'user-profiles';
    const result = await this.cloudStorageService.generateSignedUploadUrl(
      folder,
      dto.fileName,
      dto.contentType,
      600, // 10 minutes expiry
      maxFileSize
    );

    this.logger.log(
      `Generated profile image upload URL for student ${dto.studentId} (user ${student.userId})`
    );

    return {
      success: true,
      studentId: dto.studentId,
      userId: student.userId,
      studentName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.nameWithInitials || 'Unknown',
      uploadUrl: result.uploadUrl,
      relativePath: result.relativePath,
      expiresAt: result.expiresAt,
      contentType: dto.contentType,
      fields: result.fields
    };
  }

  /**
   * 📸 Assign Profile Image to Student
   */
  async assignProfileImage(
    dto: AssignProfileImageDto,
    adminUserId: string
  ): Promise<AssignProfileImageResponseDto> {
    // Find student by studentId
    const student = await this.studentRepository.findOne({
      where: { studentId: dto.studentId },
      relations: ['user']
    });

    if (!student) {
      throw new NotFoundException(`Student not found with ID: ${dto.studentId}`);
    }

    const user = student.user;
    const previousImageUrl = user.imageUrl;

    // Verify the file exists in cloud storage (optional but recommended)
    try {
      const exists = await this.cloudStorageService.fileExists(dto.relativePath);
      if (!exists) {
        throw new BadRequestException(
          'File not found in cloud storage. Please upload the file first using the signed URL.'
        );
      }
    } catch (error) {
      // If verification fails, log warning but continue (might be timing issue)
      this.logger.warn(
        `Could not verify file existence for ${dto.relativePath}: ${error.message}`
      );
    }

    // Build full URL
    const fullUrl = await this.cloudStorageService.getFullUrl(dto.relativePath);

    // Update user's imageUrl
    await this.userRepository.update(
      { id: student.userId },
      { 
        imageUrl: fullUrl,
        updatedAt: now()
      }
    );

    this.logger.log(
      `Profile image assigned for student ${dto.studentId} (user ${student.userId}) by admin ${adminUserId}`
    );

    return {
      success: true,
      studentId: dto.studentId,
      userId: student.userId,
      studentName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.nameWithInitials || 'Unknown',
      imageUrl: fullUrl,
      previousImageUrl,
      message: previousImageUrl 
        ? 'Profile image updated successfully'
        : 'Profile image assigned successfully'
    };
  }

  // ==================== USER ID BASED PROFILE IMAGE METHODS ====================

  async lookupUserById(userId: number): Promise<LookupStudentResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId.toString() },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Find student record if exists
    const student = await this.studentRepository.findOne({
      where: { userId: user.id },
    });

    return {
      studentId: student?.studentId || null,
      userId: user.id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      nameWithInitials: user.nameWithInitials,
      email: user.email,
      phoneNumber: user.phoneNumber,
      imageUrl: user.imageUrl,
      profileCompletionStatus: user.profileCompletionStatus,
      profileCompletionPercentage: user.profileCompletionPercentage,
    };
  }

  async generateProfileImageUrlByUserId(
    dto: GenerateProfileImageUrlByUserIdDto,
  ): Promise<GenerateProfileImageUrlResponseDto> {
    // Verify user exists
    const user = await this.userRepository.findOne({
      where: { id: dto.userId.toString() },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    // Find student record if exists
    const student = await this.studentRepository.findOne({
      where: { userId: user.id },
    });

    // Validate content type
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ];
    if (!allowedTypes.includes(dto.contentType)) {
      throw new BadRequestException(
        `Invalid content type. Allowed: ${allowedTypes.join(', ')}`,
      );
    }

    // Generate unique file path
    const timestamp = Date.now();
    const sanitizedFileName = dto.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const relativePath = `profile-images/${dto.userId}/${timestamp}_${sanitizedFileName}`;

    // Generate signed upload URL (10 minutes expiry)
    const signedUrlResult = await this.cloudStorageService.generateSignedUploadUrl(
      relativePath,
      dto.contentType,
      '10m', // 10 minutes
    );

    this.logger.log(
      `Generated profile image upload URL for user ${dto.userId}`,
    );

    return {
      success: true,
      studentId: student?.studentId || null,
      userId: user.id.toString(),
      studentName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.nameWithInitials || 'Unknown',
      uploadUrl: signedUrlResult.uploadUrl,
      relativePath,
      expiresAt: signedUrlResult.expiresAt || new Date(Date.now() + 10 * 60 * 1000),
      contentType: dto.contentType,
      fields: signedUrlResult.fields,
    };
  }

  async assignProfileImageByUserId(
    dto: AssignProfileImageByUserIdDto,
    adminUserId: number,
  ): Promise<AssignProfileImageResponseDto> {
    // Find user by ID
    const user = await this.userRepository.findOne({
      where: { id: dto.userId.toString() },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    const previousImageUrl = user.imageUrl;

    // Verify file exists in storage
    const fileExists = await this.cloudStorageService.fileExists(
      dto.relativePath,
    );
    if (!fileExists) {
      throw new BadRequestException(
        'File not found in storage. Please upload the file first.',
      );
    }

    // Get full URL
    const fullUrl = this.cloudStorageService.getFullUrl(dto.relativePath);

    // Update user's imageUrl
    await this.userRepository.update(
      dto.userId.toString(),
      { 
        imageUrl: fullUrl,
        updatedAt: now()
      }
    );

    this.logger.log(
      `Profile image assigned to user ${dto.userId} by admin ${adminUserId}`,
    );

    return {
      success: true,
      studentId: null,
      userId: dto.userId.toString(),
      studentName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.nameWithInitials || 'Unknown',
      imageUrl: fullUrl,
      previousImageUrl,
      message: previousImageUrl 
        ? 'Profile image updated successfully'
        : 'Profile image assigned successfully'
    };
  }
}
