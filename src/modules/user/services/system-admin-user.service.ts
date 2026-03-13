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
import { CardStatus } from '../../user-card-management/enums/card-status.enum';
import { now } from '../../../common/utils/timezone.util';
import { UserImageEntity } from '../entities/user-image.entity';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

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
    @InjectRepository(UserImageEntity)
    private readonly userImageRepository: Repository<UserImageEntity>,
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

    // ✅ Auto-generate normal card ID + set status ACTIVE + 2-year expiry (set before save to avoid double-save)
    const generatedCardId = await this.generateUniqueCardId(queryRunner);
    const cardExpiryDate = now();
    cardExpiryDate.setFullYear(cardExpiryDate.getFullYear() + 2);

    userEntity.cardId = generatedCardId;
    userEntity.cardStatus = CardStatus.ACTIVE;
    userEntity.cardExpiryDate = cardExpiryDate;

    const savedUser = await queryRunner.manager.save(userEntity);

    // Create student record
    const studentEntity = queryRunner.manager.create(StudentEntity, {
      userId: savedUser.id,
      studentId: data.studentId || await this.generateUniqueStudentId(queryRunner),
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
        // ✅ Student with imageUrl AND cardId → send ID card email only (no welcome)
        if (role === 'student' && user.imageUrl && user.cardId) {
          let photoUrl = user.imageUrl;
          try {
            photoUrl = this.cloudStorageService.getFullUrl(user.imageUrl);
          } catch (e) {
            // Use raw imageUrl if getFullUrl fails
          }

          // Get studentId if available
          let studentId: string | undefined;
          try {
            const student = await this.studentRepository.findOne({
              where: { userId: user.id }
            });
            studentId = student?.studentId;
          } catch (e) {
            this.logger.debug(`Student lookup failed for userId ${user.id}: ${e?.message}`);
          }

          this.asyncEmailService.sendTemplateEmailAsync({
            templateType: 'id_card',
            toEmails: [user.email],
            templateData: {
              nameWithInitials: user.nameWithInitials || undefined,
              firstName: user.firstName || undefined,
              lastName: user.lastName || undefined,
              studentId: studentId || undefined,
              userId: user.id?.toString(),
              fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
              photoUrl: photoUrl,
              cardId: user.cardId,
              issueDate: new Date().toISOString().split('T')[0],
              barcodeNumber: user.cardId,
            },
            customSubject: 'Welcome to Suraksha LMS - Your ID Card!'
          });

          this.logger.log(`ID card email sent for user ${user.id}, cardId: ${user.cardId}`);
          return true;
        }

        // For users without image/card or non-students → send incomplete profile email
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
   * Generate unique student ID using cryptographically secure random
   * Uses crypto.randomInt for collision-resistant IDs
   */
  private generateStudentId(): string {
    const year = new Date().getFullYear();
    const random = crypto.randomInt(0, 10000000).toString().padStart(7, '0');
    return `STU-${year}-${random}`;
  }

  /**
   * Generate unique student ID with DB uniqueness check + retry
   */
  private async generateUniqueStudentId(queryRunner: QueryRunner): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidateId = this.generateStudentId();
      const existing = await queryRunner.manager.findOne(StudentEntity, {
        where: { studentId: candidateId },
      });
      if (!existing) return candidateId;
      this.logger.warn(`Student ID collision on attempt ${attempt + 1}: ${candidateId}`);
    }
    // Fallback with timestamp for guaranteed uniqueness (must fit VARCHAR(20))
    const ts = Date.now().toString(36).slice(-7);
    return `STU-${new Date().getFullYear()}-${ts}`;
  }

  /**
   * Generate unique normal card ID (QR/Barcode)
   * Format: CARD-YYYY-XXXXXXX (e.g. CARD-2026-0004231)
   * Uses cryptographically secure random
   */
  private generateCardId(): string {
    const year = new Date().getFullYear();
    const random = crypto.randomInt(0, 10000000).toString().padStart(7, '0');
    return `CARD-${year}-${random}`;
  }

  /**
   * Generate unique card ID with DB uniqueness check + retry
   */
  private async generateUniqueCardId(queryRunner?: QueryRunner): Promise<string> {
    const repo = queryRunner ? queryRunner.manager.getRepository(UserEntity) : this.userRepository;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidateId = this.generateCardId();
      const existing = await repo.findOne({ where: { cardId: candidateId } });
      if (!existing) return candidateId;
      this.logger.warn(`Card ID collision on attempt ${attempt + 1}: ${candidateId}`);
    }
    // Fallback with timestamp for guaranteed uniqueness
    const ts = Date.now().toString(36);
    return `CARD-${new Date().getFullYear()}-${ts}`;
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
      imageUrl: user.imageUrl ? this.cloudStorageService.getFullUrl(user.imageUrl) : null,
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

    // Update user's imageUrl and mark as VERIFIED (admin is explicitly assigning)
    await this.userRepository.update(
      { id: student.userId },
      { 
        imageUrl: fullUrl,
        imageVerificationStatus: ImageVerificationStatus.VERIFIED,
        imageVerifiedBy: adminUserId,
        imageVerifiedAt: now(),
        imageRejectionReason: null,
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
      imageUrl: user.imageUrl ? this.cloudStorageService.getFullUrl(user.imageUrl) : null,
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

    // Update user's imageUrl and mark as VERIFIED (admin is explicitly assigning)
    await this.userRepository.update(
      dto.userId.toString(),
      { 
        imageUrl: fullUrl,
        imageVerificationStatus: ImageVerificationStatus.VERIFIED,
        imageVerifiedBy: adminUserId.toString(),
        imageVerifiedAt: now(),
        imageRejectionReason: null,
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

  /**
   * ✅ Get Users with Pending/Unverified Images
   * System Admin can review images that need verification.
   *
   * Queries BOTH sources so that legacy users (whose imageVerificationStatus
   * was set before the user_images table existed) are also visible:
   *   1. user_images table  — new submissions (post-migration)
   *   2. users table        — legacy rows where imageVerificationStatus matches
   *                           but no user_images record was created
   */
  async getUnverifiedUsers(query: any): Promise<any> {
    const { page = 1, limit = 20, status = ImageVerificationStatus.PENDING } = query;

    // --- Source 1: user_images rows ---
    const allImages = await this.userImageRepository
      .createQueryBuilder('ui')
      .where('ui.status = :status', { status })
      .orderBy('ui.createdAt', 'DESC')
      .getMany();

    // --- Source 2: legacy users table rows (no user_images record) ---
    const trackedUserIds = new Set(allImages.map(img => img.userId));
    const legacyUsers = await this.userRepository
      .createQueryBuilder('u')
      .where('u.imageVerificationStatus = :status', { status })
      .andWhere('u.imageUrl IS NOT NULL')
      .getMany();
    const legacyRows = legacyUsers.filter(u => !trackedUserIds.has(u.id));

    // --- Batch-load user metadata for user_images rows ---
    const userIds = [...new Set(allImages.map(img => img.userId))];
    const users = userIds.length
      ? await this.userRepository.find({
          where: { id: userIds as any },
          select: ['id', 'nameWithInitials', 'email', 'phoneNumber', 'userType', 'updatedAt'],
        })
      : [];
    const userMap = new Map(users.map(u => [u.id, u]));

    const imageRecords = allImages.map(img => {
      const user = userMap.get(img.userId);
      return {
        imageId: img.id,
        userId: img.userId,
        nameWithInitials: user?.nameWithInitials ?? null,
        email: user?.email ? this.maskEmail(user.email) : null,
        phoneNumber: user?.phoneNumber ? this.maskPhone(user.phoneNumber) : null,
        imageUrl: this.cloudStorageService.getFullUrl(img.imageUrl),
        imageVerificationStatus: img.status,
        scope: img.scope,
        instituteId: img.instituteId ?? null,
        imageUploadedAt: img.createdAt,
        userType: user?.userType ?? null,
        isLegacy: false,
      };
    });

    const legacyRecords = legacyRows.map(u => ({
      imageId: null,
      userId: u.id,
      nameWithInitials: u.nameWithInitials,
      email: u.email ? this.maskEmail(u.email) : null,
      phoneNumber: u.phoneNumber ? this.maskPhone(u.phoneNumber) : null,
      imageUrl: this.cloudStorageService.getFullUrl(u.imageUrl),
      imageVerificationStatus: u.imageVerificationStatus,
      scope: null,
      instituteId: null,
      imageUploadedAt: u.updatedAt,
      userType: u.userType,
      isLegacy: true,
    }));

    // Merge, sort newest-first, paginate in memory
    const all = [...imageRecords, ...legacyRecords].sort(
      (a, b) => new Date(b.imageUploadedAt).getTime() - new Date(a.imageUploadedAt).getTime()
    );
    const total = all.length;
    const skip = (page - 1) * limit;
    const paginated = all.slice(skip, skip + Number(limit));

    return {
      users: paginated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * ✅ Approve User Image
   * Marks the user_images record as VERIFIED, copies its URL to user.imageUrl,
   * generates a card if needed, and sends a confirmation email.
   */
  async approveUserImage(dto: any, adminId: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: dto.userId.toString() },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    // Find the image record to approve — by explicit imageId or the latest PENDING submission
    let imageRecord: UserImageEntity | null = null;
    let isLegacyApproval = false;
    if (dto.imageId) {
      imageRecord = await this.userImageRepository.findOne({
        where: { id: dto.imageId.toString(), userId: dto.userId.toString() },
      });
      if (!imageRecord) {
        throw new NotFoundException(`Image record ${dto.imageId} not found for user ${dto.userId}`);
      }
    } else {
      imageRecord = await this.userImageRepository.findOne({
        where: { userId: dto.userId.toString(), status: ImageVerificationStatus.PENDING },
        order: { createdAt: 'DESC' },
      });
      if (!imageRecord) {
        // Legacy path: imageVerificationStatus set before user_images table existed
        if (user.imageUrl && user.imageVerificationStatus === ImageVerificationStatus.PENDING) {
          isLegacyApproval = true;
        } else {
          throw new BadRequestException('No pending image found for this user');
        }
      }
    }

    const approvedAt = new Date();

    // Mark the image record as verified (skip for legacy — no row exists)
    if (!isLegacyApproval) {
      await this.userImageRepository.update(imageRecord.id, {
        status: ImageVerificationStatus.VERIFIED,
        verifiedBy: adminId,
        verifiedAt: approvedAt,
      });
    }

    // ✅ Generate card ID if not exists + set ACTIVE status + 2-year expiry
    let cardGenerated = false;
    if (!user.cardId) {
      const generatedCardId = await this.generateUniqueCardId();
      const cardExpiryDate = now();
      cardExpiryDate.setFullYear(cardExpiryDate.getFullYear() + 2);

      await this.userRepository.update(dto.userId.toString(), {
        cardId: generatedCardId,
        cardStatus: CardStatus.ACTIVE,
        cardExpiryDate: cardExpiryDate,
      });

      user.cardId = generatedCardId;
      user.cardStatus = CardStatus.ACTIVE;
      user.cardExpiryDate = cardExpiryDate;
      cardGenerated = true;

      this.logger.log(`Generated card ID ${generatedCardId} for user ${dto.userId}`);
    }

    // Promote the approved image to user.imageUrl and update verification metadata
    const approvedImagePath = isLegacyApproval ? user.imageUrl : imageRecord!.imageUrl;
    await this.userRepository.update(dto.userId.toString(), {
      imageUrl: approvedImagePath,
      imageVerificationStatus: ImageVerificationStatus.VERIFIED,
      imageVerifiedBy: adminId,
      imageVerifiedAt: approvedAt,
      imageRejectionReason: null,
      updatedAt: new Date(),
    });

    // ✅ Check if user is a student to determine email type
    const student = await this.studentRepository.findOne({
      where: { userId: dto.userId.toString() }
    });

    // Send approval email with ID card for students
    const approvedImageUrl = approvedImagePath;
    if (user.email) {
      try {
        if (student && approvedImageUrl && user.cardId) {
          let photoUrl = approvedImageUrl;
          try {
            photoUrl = this.cloudStorageService.getFullUrl(approvedImageUrl);
          } catch (e) {
            // Use raw path if getFullUrl fails
          }

          this.asyncEmailService.sendTemplateEmailAsync({
            templateType: 'id_card',
            toEmails: [user.email],
            templateData: {
              nameWithInitials: user.nameWithInitials || undefined,
              firstName: user.firstName || undefined,
              lastName: user.lastName || undefined,
              studentId: student.studentId || undefined,
              userId: user.id?.toString(),
              fullName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
              photoUrl: photoUrl,
              cardId: user.cardId,
              issueDate: new Date().toISOString().split('T')[0],
              barcodeNumber: user.cardId,
            },
            customSubject: '✅ Your ID Card is Ready!'
          });

          this.logger.log(`ID card email sent to user ${dto.userId}`);
        } else {
          this.asyncEmailService.sendTemplateEmailAsync({
            templateType: 'generic',
            toEmails: [user.email],
            customSubject: '✅ Profile Image Approved',
            templateData: {
              USER_NAME: user.nameWithInitials || user.firstName || 'User',
              MESSAGE_TITLE: '✅ Your Profile Image Has Been Approved!',
              MESSAGE_BODY: `Great news! Your profile image has been reviewed and approved by our team.\n\nYour profile is now complete and visible to others on the platform.\n\nThank you for being part of Suraksha LMS!`,
              ACTION_URL: 'https://lms.suraksha.lk/dashboard',
              ACTION_TEXT: 'Go to Dashboard',
              FOOTER_TEXT: 'Keep up the great work!'
            }
          });
        }
      } catch (emailError) {
        this.logger.warn(`Failed to send approval email to user ${dto.userId}: ${emailError.message}`);
      }
    }

    this.logger.log(`Image ${isLegacyApproval ? '(legacy)' : imageRecord!.id} approved for user ${dto.userId} by admin ${adminId}`);

    return {
      success: true,
      message: 'User image approved successfully',
      userId: user.id,
      imageId: isLegacyApproval ? null : imageRecord!.id,
      status: ImageVerificationStatus.VERIFIED,
      approvedBy: adminId,
      approvedAt,
      cardGenerated,
      cardId: user.cardId || null,
    };
  }

  /**
   * ✅ Reject User Image with Email & Signed Upload URL
   *
   * - Updates the user_images record to REJECTED (keeps DB history)
   * - Deletes the cloud file to free storage space
   * - Does NOT change user.imageUrl — the previous approved image remains active
   * - Sends rejection email with a signed re-upload link
   */
  async rejectUserImage(dto: any, adminId: string): Promise<any> {
    const { userId, rejectionReason, userEmail, urlValidityDays = 7 } = dto;

    const user = await this.userRepository.findOne({
      where: { id: userId.toString() },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Find the image record to reject — by explicit imageId or the latest PENDING submission
    let imageRecord: UserImageEntity | null = null;
    let isLegacyRejection = false;
    if (dto.imageId) {
      imageRecord = await this.userImageRepository.findOne({
        where: { id: dto.imageId.toString(), userId: userId.toString() },
      });
      if (!imageRecord) {
        throw new NotFoundException(`Image record ${dto.imageId} not found for user ${userId}`);
      }
    } else {
      imageRecord = await this.userImageRepository.findOne({
        where: { userId: userId.toString(), status: ImageVerificationStatus.PENDING },
        order: { createdAt: 'DESC' },
      });
      if (!imageRecord) {
        // Legacy path: imageVerificationStatus set before user_images table existed
        if (user.imageUrl && user.imageVerificationStatus === ImageVerificationStatus.PENDING) {
          isLegacyRejection = true;
        } else {
          throw new BadRequestException('No pending image found for this user');
        }
      }
    }

    const rejectedAt = new Date();

    // Delete the rejected image file from cloud storage (save space; DB record is kept)
    const imageUrlToDelete = isLegacyRejection ? user.imageUrl : imageRecord!.imageUrl;
    try {
      const imagePath = this.extractPathFromUrl(imageUrlToDelete) ?? imageUrlToDelete;
      await this.cloudStorageService.deleteFile(imagePath);
      this.logger.log(`Deleted rejected image: ${imagePath}`);
    } catch (deleteError) {
      this.logger.warn(`Failed to delete rejected image: ${deleteError.message}`);
    }

    // Mark the image record as rejected (skip for legacy — no row exists)
    if (!isLegacyRejection) {
      await this.userImageRepository.update(imageRecord!.id, {
        status: ImageVerificationStatus.REJECTED,
        rejectionReason,
        verifiedBy: adminId,
        verifiedAt: rejectedAt,
      });
    }

    // Update the user's status fields for backward compat — also clear imageUrl for legacy rejections
    // (legacy imageUrl IS the pending image, unlike new flow where imageUrl = last approved)
    await this.userRepository.update(userId.toString(), {
      imageVerificationStatus: ImageVerificationStatus.REJECTED,
      imageVerifiedBy: adminId,
      imageVerifiedAt: rejectedAt,
      imageRejectionReason: rejectionReason,
      updatedAt: new Date(),
    });

    // Generate cryptographically signed upload token (HMAC-SHA256)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + urlValidityDays);

    const tokenPayload = JSON.stringify({
      userId,
      purpose: 'profile-image-reupload',
      exp: expiresAt.getTime(),
    });
    const tokenSecret = process.env.JWT_SECRET || process.env.UPLOAD_TOKEN_SECRET;
    if (!tokenSecret) {
      this.logger.error('JWT_SECRET or UPLOAD_TOKEN_SECRET must be set for token signing');
      throw new Error('Server configuration error: signing secret not configured');
    }
    const signature = crypto.createHmac('sha256', tokenSecret).update(tokenPayload).digest('base64url');
    const uploadToken = `${Buffer.from(tokenPayload).toString('base64url')}.${signature}`;

    const frontendBaseUrl = process.env.FRONTEND_URL || 'https://lms.suraksha.lk';
    const frontendUploadUrl = `${frontendBaseUrl}/profile/image/upload?token=${uploadToken}`;

    // Send rejection email with upload link
    const emailDest = userEmail || user.email;
    let emailSent = false;

    if (emailDest) {
      try {
        this.asyncEmailService.sendTemplateEmailAsync({
          templateType: 'generic',
          toEmails: [emailDest],
          customSubject: 'Action Required: Profile Image Rejected',
          templateData: {
            USER_NAME: user.nameWithInitials || user.firstName || 'User',
            MESSAGE_TITLE: '🔔 Profile Image Update Required',
            MESSAGE_BODY: `We've reviewed your profile image submission and unfortunately it doesn't meet our guidelines at this time.\n\nRejection Reason:\n${rejectionReason}\n\n📋 Image Guidelines:\n✓ Clear, well-lit photo showing your face\n✓ Professional or neutral background\n✓ No filters, sunglasses, or face coverings\n✓ Minimum resolution: 400x400px\n\nThis link expires on: ${expiresAt.toLocaleString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
            ACTION_URL: frontendUploadUrl,
            ACTION_TEXT: 'Upload New Image',
            FOOTER_TEXT: 'Need help? Contact us: support@suraksha.lk'
          }
        });

        emailSent = true;
        this.logger.log(`Rejection email sent to ${emailDest}`);
      } catch (emailError) {
        this.logger.error(`Failed to send rejection email: ${emailError.message}`);
      }
    }

    this.logger.log(`Image ${isLegacyRejection ? '(legacy)' : imageRecord!.id} rejected for user ${userId} by admin ${adminId}. Reason: ${rejectionReason}`);

    return {
      success: true,
      message: 'User image rejected successfully. User notified via email.',
      userId: user.id,
      imageId: isLegacyRejection ? null : imageRecord!.id,
      rejectionReason,
      uploadUrl: frontendUploadUrl,
      expiresAt: expiresAt.toISOString(),
      emailSent,
      uploadToken,
    };
  }

  /**
   * Helper: Extract path from full cloud storage URL
   */
  private extractPathFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      // S3 host-style URL: bucket is in hostname, path is the relative key
      if (urlObj.hostname.includes('.amazonaws.com')) {
        return urlObj.pathname.substring(1) || null; // strip leading /
      }
      // GCS URL: https://storage.googleapis.com/bucket-name/folder/filename
      if (urlObj.hostname.includes('googleapis.com')) {
        const parts = urlObj.pathname.split('/').filter(Boolean);
        return parts.slice(1).join('/') || null; // skip bucket name segment
      }
      // Fallback: split by known bucket name from env
      const bucketName = process.env.AWS_S3_BUCKET || process.env.GCS_BUCKET_NAME;
      if (bucketName && url.includes(`${bucketName}/`)) {
        return url.split(`${bucketName}/`)[1] || null;
      }
      return null;
    } catch (e) {
      this.logger.debug(`extractPathFromUrl failed: ${e?.message}`);
      return null;
    }
  }

  /**
   * Helper: Mask email for privacy
   */
  private maskEmail(email?: string): string | undefined {
    if (!email) return undefined;
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `${local[0]}***@${domain}`;
    return `${local[0]}***${local[local.length - 1]}@${domain}`;
  }

  /**
   * Helper: Mask phone number
   */
  private maskPhone(phone?: string): string | undefined {
    if (!phone) return undefined;
    if (phone.length <= 6) return phone;
    return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
  }

  // ==========================================
  // 🎴 CARD MANAGEMENT (Global User Cards)
  // ==========================================

  /**
   * Get card info for a user (both normal card & RFID)
   */
  async getUserCardInfo(userId: number): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId.toString() },
      select: ['id', 'firstName', 'lastName', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate']
    });

    if (!user) {
      throw new NotFoundException(`User not found with ID: ${userId}`);
    }

    return {
      success: true,
      userId: user.id,
      userName: `${user.firstName} ${user.lastName || ''}`.trim(),
      normalCard: {
        cardId: user.cardId || null,
        cardStatus: user.cardStatus || null,
        cardExpiryDate: user.cardExpiryDate || null,
        isExpired: user.cardExpiryDate ? new Date(user.cardExpiryDate) < new Date() : false
      },
      rfidCard: {
        rfid: user.rfid || null,
        rfidCardStatus: user.rfidCardStatus || null,
        rfidExpiryDate: user.rfidExpiryDate || null,
        isExpired: user.rfidExpiryDate ? new Date(user.rfidExpiryDate) < new Date() : false
      }
    };
  }

  /**
   * Assign or update a normal card (QR/barcode) for a user
   */
  async assignNormalCard(userId: number, dto: { cardId: string; cardExpiryDate?: string }, adminId: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId.toString() } });
    if (!user) throw new NotFoundException(`User not found with ID: ${userId}`);

    // Check if cardId is already used by another user
    if (dto.cardId) {
      const existingUser = await this.userRepository.findOne({ where: { cardId: dto.cardId } });
      if (existingUser && existingUser.id !== userId.toString()) {
        throw new BadRequestException(`Card ID ${dto.cardId} is already assigned to another user (ID: ${existingUser.id})`);
      }
    }

    // If user already has an active card, mark old one as REPLACED
    const previousCardId = user.cardId;
    const previousStatus = user.cardStatus;

    user.cardId = dto.cardId;
    user.cardStatus = CardStatus.ACTIVE;
    user.cardExpiryDate = dto.cardExpiryDate ? new Date(dto.cardExpiryDate) : null;
    await this.userRepository.save(user);

    this.logger.log(`Admin ${adminId} assigned normal card ${dto.cardId} to user ${userId}. Previous: ${previousCardId} (${previousStatus})`);

    return {
      success: true,
      message: `Normal card assigned to user ${userId}`,
      userId: user.id,
      cardId: user.cardId,
      cardStatus: user.cardStatus,
      cardExpiryDate: user.cardExpiryDate,
      previousCardId,
      previousStatus
    };
  }

  /**
   * Update card status for a user (normal card or RFID independently)
   */
  async updateUserCardStatus(
    userId: number,
    dto: { cardType: 'normal' | 'rfid'; status: CardStatus },
    adminId: string
  ): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id: userId.toString() } });
    if (!user) throw new NotFoundException(`User not found with ID: ${userId}`);

    if (dto.cardType === 'normal') {
      if (!user.cardId) throw new BadRequestException('User does not have a normal card assigned');
      const prevStatus = user.cardStatus;
      user.cardStatus = dto.status;
      // Clear cardId if deactivated
      if (dto.status !== CardStatus.ACTIVE) {
        user.cardId = null;
      }
      await this.userRepository.save(user);
      this.logger.log(`Admin ${adminId} changed normal card status for user ${userId}: ${prevStatus} → ${dto.status}`);
    } else {
      if (!user.rfid) throw new BadRequestException('User does not have an RFID card assigned');
      const prevStatus = user.rfidCardStatus;
      user.rfidCardStatus = dto.status;
      // Clear rfid if deactivated
      if (dto.status !== CardStatus.ACTIVE) {
        user.rfid = null;
      }
      await this.userRepository.save(user);
      this.logger.log(`Admin ${adminId} changed RFID card status for user ${userId}: ${prevStatus} → ${dto.status}`);
    }

    return {
      success: true,
      message: `${dto.cardType} card status updated to ${dto.status}`,
      userId: user.id,
      normalCard: {
        cardId: user.cardId,
        cardStatus: user.cardStatus,
        cardExpiryDate: user.cardExpiryDate
      },
      rfidCard: {
        rfid: user.rfid,
        rfidCardStatus: user.rfidCardStatus,
        rfidExpiryDate: user.rfidExpiryDate
      }
    };
  }

  /**
   * Lookup a user by card ID (normal) or RFID
   */
  async lookupUserByCard(cardId: string): Promise<any> {
    // Try normal card first
    let user = await this.userRepository.findOne({
      where: { cardId },
      select: ['id', 'firstName', 'lastName', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate', 'imageUrl', 'email', 'phoneNumber']
    });
    let lookupType = 'normalCard';

    if (!user) {
      // Try RFID
      user = await this.userRepository.findOne({
        where: { rfid: cardId },
        select: ['id', 'firstName', 'lastName', 'rfid', 'rfidCardStatus', 'rfidExpiryDate', 'cardId', 'cardStatus', 'cardExpiryDate', 'imageUrl', 'email', 'phoneNumber']
      });
      lookupType = 'rfid';
    }

    if (!user) {
      throw new NotFoundException(`No user found with card ID or RFID: ${cardId}`);
    }

    return {
      success: true,
      lookupType,
      userId: user.id,
      userName: `${user.firstName} ${user.lastName || ''}`.trim(),
      email: this.maskEmail(user.email),
      phoneNumber: this.maskPhone(user.phoneNumber),
      imageUrl: user.imageUrl ? this.cloudStorageService.getFullUrl(user.imageUrl) : null,
      normalCard: {
        cardId: user.cardId,
        cardStatus: user.cardStatus,
        cardExpiryDate: user.cardExpiryDate,
        isExpired: user.cardExpiryDate ? new Date(user.cardExpiryDate) < new Date() : false
      },
      rfidCard: {
        rfid: user.rfid,
        rfidCardStatus: user.rfidCardStatus,
        rfidExpiryDate: user.rfidExpiryDate,
        isExpired: user.rfidExpiryDate ? new Date(user.rfidExpiryDate) < new Date() : false
      }
    };
  }
}
