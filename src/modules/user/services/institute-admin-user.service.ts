/**
 * Institute Admin User Service
 *
 * Allows **institute admins** to:
 * - Create new users (STUDENT / TEACHER / INSTITUTE_ADMIN / ATTENDANCE_MARKER)
 *   and immediately enroll them in their institute.
 * - Attach an **institute-scoped image** that is automatically verified.
 * - Optionally attach a **global image** that remains PENDING until a system
 *   admin approves it.
 * - Enroll students in classes and subjects in a single request.
 *
 * Image Rules:
 * - instituteUserImageUrl  → user_images row (scope=INSTITUTE, status=VERIFIED)
 *                          → institute_user.institute_user_image_url is set
 * - globalImageUrl         → user_images row (scope=GLOBAL, status=PENDING)
 *                          → user.imageVerificationStatus=PENDING
 *                          → user.imageUrl stays NULL until system admin approves
 *
 * ID Card email is NOT sent until user.imageUrl is set (i.e. global image is VERIFIED).
 */

import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
  Optional,
} from '@nestjs/common';
import { SmartCardsService } from '../../smart-cards/smart-cards.service';
import { SmartCardScope } from '../../smart-cards/enums/smart-card.enums';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { now } from '../../../common/utils/timezone.util';
import { UserEntity } from '../entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';
import { UserImageEntity, ImageScope } from '../entities/user-image.entity';
import { InstituteHouseEntity } from '../../institute_mudules/institute_house/entities/institute_house.entity';
import {
  InstituteHouseMemberEntity,
  HouseEnrollmentMethod,
} from '../../institute_mudules/institute_house/entities/institute_house_member.entity';
import { UserType } from '../enums/user-type.enum';
import { InstituteUserType } from '../../institute_mudules/institue_user/enums/institute-user-type.enum';
import { InstituteUserStatus } from '../../institute_mudules/institue_user/enums/institute-user-status.enum';
import { ImageVerificationStatus } from '../../institute_mudules/institue_user/enums/image-verification-status.enum';
import {
  ProfileCompletionStatus,
  calculateProfileCompletion,
  determineProfileStatus,
} from '../enums/profile-completion-status.enum';
import { CardStatus } from '../../user-card-management/enums/card-status.enum';
import { AsyncEmailService } from '../../../common/services/async-email.service';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { InstituteCreditsService } from '../../notification-credits/services/institute-credits.service';
import { CreditTransactionType } from '../../notification-credits/entities/institute-credit-transaction.entity';
import {
  CreateInstituteUserDto,
  CreateInstituteUserResponseDto,
  InstAdminParentDto,
  InstituteUserCreationImageResultDto,
} from '../dto/create-institute-user.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

/**
 * Options for the public self-registration path (created via a /forms/:token link).
 * When omitted, createInstituteUser behaves exactly as the admin path (unchanged).
 */
export interface SelfRegistrationOptions {
  /** True when invoked from a public registration link (not an authenticated admin). */
  selfRegistration: true;
  /** Used as the "actor" id for audit columns; null when no admin is involved. */
  actorUserId: string | null;
  /**
   * Enrollment verification state for self-registered class/subject rows.
   * Self-registrations land 'pending' (awaiting admin); admin path stays verified.
   */
  enrollmentVerificationStatus: 'pending';
  /** What to do if a requested card auto-assign finds an empty pool. */
  cardEmptyPoolBehavior: 'skip' | 'error';
}

@Injectable()
export class InstituteAdminUserService {
  private readonly logger = new Logger(InstituteAdminUserService.name);

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
    private readonly classStudentRepository: Repository<InstituteClassStudentEntity>,
    @InjectRepository(InstituteClassSubjectStudent)
    private readonly subjectStudentRepository: Repository<InstituteClassSubjectStudent>,
    @InjectRepository(UserImageEntity)
    private readonly userImageRepository: Repository<UserImageEntity>,
    @InjectRepository(InstituteHouseEntity)
    private readonly houseRepository: Repository<InstituteHouseEntity>,
    @InjectRepository(InstituteHouseMemberEntity)
    private readonly houseMemberRepository: Repository<InstituteHouseMemberEntity>,
    private readonly dataSource: DataSource,
    private readonly asyncEmailService: AsyncEmailService,
    private readonly cloudStorageService: CloudStorageService,
    @Optional()
    private readonly instituteCreditsService?: InstituteCreditsService,
    @Optional()
    private readonly smartCardsService?: SmartCardsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: Create user within institute
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new user and enroll them into the institute.
   *
   * @param instituteId  The institute the calling admin manages.
   * @param adminUserId  The user ID of the calling institute admin.
   * @param dto          Creation payload.
   */
  async createInstituteUser(
    instituteId: string,
    adminUserId: string,
    dto: CreateInstituteUserDto,
    options?: SelfRegistrationOptions,
  ): Promise<CreateInstituteUserResponseDto> {
    const isSelfReg = options?.selfRegistration === true;
    // For students: allow no email/phone if at least one parent has contact info
    if (!dto.email && !dto.phoneNumber) {
      if (dto.instituteUserType === InstituteUserType.STUDENT) {
        const parentHasContact = 
          (dto.father && (dto.father.email || dto.father.phoneNumber)) ||
          (dto.mother && (dto.mother.email || dto.mother.phoneNumber)) ||
          (dto.guardian && (dto.guardian.email || dto.guardian.phoneNumber));
        if (!parentHasContact) {
          throw new BadRequestException(
            'Student has no email or phone number. At least one parent/guardian must have an email or phone number.'
          );
        }
      } else {
        throw new BadRequestException('At least one of email or phoneNumber is required');
      }
    }

    // Validate: each provided parent must have at least email OR phone
    for (const role of ['father', 'mother', 'guardian'] as const) {
      const parentDto = dto[role];
      if (parentDto && (parentDto.firstName || parentDto.lastName)) {
        if (!parentDto.email && !parentDto.phoneNumber) {
          throw new BadRequestException(
            `${role.charAt(0).toUpperCase() + role.slice(1)} must have at least an email address or phone number.`
          );
        }
      }
    }

    // Validate institute exists
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) {
      throw new NotFoundException(`Institute not found: ${instituteId}`);
    }

    // Validate caller is an active admin of this institute.
    // Self-registration skips this — the public controller authorizes via the link token,
    // and there is no admin actor. adminUserId is null in that path.
    if (!isSelfReg) {
      await this.assertInstituteAdmin(adminUserId, instituteId);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // ── 1. Resolve global user type from institute role ──────────────────
      const globalUserType = this.resolveGlobalUserType(dto.instituteUserType);

      // ── 2. Create the main user record ───────────────────────────────────
      const { savedUser, studentRecord } = await this.createCoreUser(
        queryRunner,
        dto,
        globalUserType,
        adminUserId,
      );

      // ── 3. Handle parent records for STUDENT role ─────────────────────────
      if (dto.instituteUserType === InstituteUserType.STUDENT) {
        let fatherId: string | null = null;
        let motherId: string | null = null;
        let guardianId: string | null = null;

        if (dto.father && (dto.father.email || dto.father.phoneNumber)) {
          fatherId = await this.createOrFindParent(queryRunner, dto.father, adminUserId);
        }
        if (dto.mother && (dto.mother.email || dto.mother.phoneNumber)) {
          motherId = await this.createOrFindParent(queryRunner, dto.mother, adminUserId);
        }
        if (dto.guardian && (dto.guardian.email || dto.guardian.phoneNumber)) {
          guardianId = await this.createOrFindParent(queryRunner, dto.guardian, adminUserId);
        }

        if (studentRecord && (fatherId || motherId || guardianId)) {
          await queryRunner.manager.update(StudentEntity, { userId: savedUser.id }, {
            fatherId,
            motherId,
            guardianId,
            updatedAt: now(),
          });
        }
      }

      // ── 4. Handle images ──────────────────────────────────────────────────
      const imageResults: {
        instituteImage?: InstituteUserCreationImageResultDto;
        globalImage?: InstituteUserCreationImageResultDto;
      } = {};

      // 4a. Institute image → auto-verified
      if (dto.instituteUserImageUrl) {
        await queryRunner.manager.save(
          queryRunner.manager.create(UserImageEntity, {
            userId: savedUser.id,
            imageUrl: dto.instituteUserImageUrl,
            scope: ImageScope.INSTITUTE,
            instituteId,
            status: ImageVerificationStatus.VERIFIED,
            verifiedBy: adminUserId,
            verifiedAt: now(),
            createdAt: now(),
            updatedAt: now(),
          }),
        );
        imageResults.instituteImage = {
          scope: ImageScope.INSTITUTE,
          status: ImageVerificationStatus.VERIFIED,
          imageUrl: this.safeFullUrl(dto.instituteUserImageUrl),
          note: 'Auto-verified by institute admin',
        };
      }

      // 4b. Global image → PENDING (needs system admin approval)
      if (dto.globalImageUrl) {
        await queryRunner.manager.save(
          queryRunner.manager.create(UserImageEntity, {
            userId: savedUser.id,
            imageUrl: dto.globalImageUrl,
            scope: ImageScope.GLOBAL,
            status: ImageVerificationStatus.PENDING,
            createdAt: now(),
            updatedAt: now(),
          }),
        );
        // Mark user's imageVerificationStatus as PENDING (imageUrl stays null until approved)
        await queryRunner.manager.update(UserEntity, { id: savedUser.id }, {
          imageVerificationStatus: ImageVerificationStatus.PENDING,
          updatedAt: now(),
        });
        savedUser.imageVerificationStatus = ImageVerificationStatus.PENDING;

        imageResults.globalImage = {
          scope: ImageScope.GLOBAL,
          status: ImageVerificationStatus.PENDING,
          imageUrl: this.safeFullUrl(dto.globalImageUrl),
          note: 'Requires system admin approval. ID card will be sent after approval.',
        };
      }

      // ── 5. Enroll in institute ─────────────────────────────────────────────
      const existingLink = await queryRunner.manager.findOne(InstituteUserEntity, {
        where: { instituteId, userId: savedUser.id },
      });

      if (!existingLink) {
        await queryRunner.manager.save(
          queryRunner.manager.create(InstituteUserEntity, {
            instituteId,
            userId: savedUser.id,
            instituteUserType: dto.instituteUserType,
            userIdByInstitute: dto.userIdByInstitute ?? null,
            instituteCardId: dto.instituteCardId ?? null,
            instituteUserImageUrl: dto.instituteUserImageUrl ?? null,
            imageVerificationStatus: dto.instituteUserImageUrl
              ? ImageVerificationStatus.VERIFIED
              : ImageVerificationStatus.PENDING,
            imageVerifiedBy: dto.instituteUserImageUrl ? adminUserId : null,
            status: InstituteUserStatus.ACTIVE,
            verifiedBy: adminUserId,
            verifiedAt: now(),
            createdAt: now(),
            updatedAt: now(),
            houseId: dto.houseId ?? null,
            extraData: dto.extraData ?? null,
          }),
        );
      } else if (dto.houseId) {
        // User already in institute — update house assignment
        await queryRunner.manager.update(
          InstituteUserEntity,
          { instituteId, userId: savedUser.id },
          { houseId: dto.houseId, updatedAt: now() },
        );
      }

      // ── 5b. Smart-card assignment (institute + suraksha), same transaction ──
      const smartCardResults: Array<{ scope: string; cardId: string; cardName: string }> = [];
      // When the requested card pool is empty: admin path always errors; self-registration
      // honors the link's cardEmptyPoolBehavior ('skip' → continue & flag, 'error' → fail).
      const cardPendingScopes: string[] = [];
      const wantsCard =
        dto.autoAssignInstituteCard || dto.autoAssignSurakshaCard || !!dto.surakshaCardId || !!dto.instituteCardId;
      if (wantsCard && this.smartCardsService) {
        await this.smartCardsService.assertFeatureEnabled(instituteId);

        // Only auto-assign (cardValue undefined) can hit an empty pool; manual ids must always resolve.
        const tryAssign = async (scope: SmartCardScope, cardValue: string | undefined, isAuto: boolean) => {
          try {
            const card = await this.smartCardsService!.assignCardToUser(
              instituteId,
              { userId: savedUser.id, scope, cardValue },
              adminUserId,
              queryRunner.manager,
            );
            smartCardResults.push({ scope, cardId: card.cardId, cardName: card.cardName });
          } catch (err: any) {
            const emptyPool = isAuto && /no available/i.test(err?.message ?? '');
            if (emptyPool && isSelfReg && options!.cardEmptyPoolBehavior === 'skip') {
              // Soft-skip: register without a card, flag for admin follow-up.
              cardPendingScopes.push(scope);
              this.logger.warn(
                `Self-registration: ${scope} card pool empty for institute ${instituteId}; ` +
                `registered user ${savedUser.id} without a card (flagged pending).`,
              );
              return;
            }
            throw err; // admin path, manual id, or 'error' behavior → propagate (rolls back tx)
          }
        };

        if (dto.instituteCardId || dto.autoAssignInstituteCard) {
          await tryAssign(
            SmartCardScope.INSTITUTE,
            dto.autoAssignInstituteCard ? undefined : dto.instituteCardId,
            !!dto.autoAssignInstituteCard,
          );
        }

        if (dto.surakshaCardId || dto.autoAssignSurakshaCard) {
          await tryAssign(
            SmartCardScope.GLOBAL,
            dto.autoAssignSurakshaCard ? undefined : dto.surakshaCardId,
            !!dto.autoAssignSurakshaCard,
          );
        }
      }

      // ── 6. House enrollment (if houseId provided) ──────────────────────────
      let houseEnrolled = false;
      if (dto.houseId) {
        const house = await queryRunner.manager.findOne(InstituteHouseEntity, {
          where: { id: dto.houseId, instituteId, isActive: true },
        });
        if (!house) {
          throw new BadRequestException(
            `House ${dto.houseId} not found in institute ${instituteId}.`,
          );
        }
        const existingMember = await queryRunner.manager.findOne(
          InstituteHouseMemberEntity,
          { where: { houseId: dto.houseId, userId: savedUser.id, instituteId } },
        );
        if (!existingMember) {
          await queryRunner.manager.save(
            queryRunner.manager.create(InstituteHouseMemberEntity, {
              houseId: dto.houseId,
              instituteId,
              userId: savedUser.id,
              enrolledBy: adminUserId,
              enrollmentMethod: HouseEnrollmentMethod.AUTO,
              isActive: true,
              createdAt: now(),
              updatedAt: now(),
            }),
          );
        } else if (!existingMember.isActive) {
          await queryRunner.manager.update(
            InstituteHouseMemberEntity,
            { id: existingMember.id },
            { isActive: true, updatedAt: now() },
          );
        }
        houseEnrolled = true;
      }

      // ── 7. Class & subject enrollments (STUDENT only) ─────────────────────
      const classEnrollmentResults: any[] = [];

      if (
        dto.instituteUserType === InstituteUserType.STUDENT &&
        dto.classEnrollments?.length
      ) {
        for (const ce of dto.classEnrollments) {
          const result = await this.enrollStudentToClass(
            queryRunner,
            savedUser.id,
            instituteId,
            ce.classId,
            ce.subjectEnrollments ?? [],
            adminUserId,
            dto.extraData ?? null,
            isSelfReg ? 'pending' : 'verified',
          );
          classEnrollmentResults.push(result);
        }
      }

      await queryRunner.commitTransaction();

      // ── 7. Send welcome notification ──────────────────────────────────────
      const notificationSent = dto.sendWelcomeNotifications !== false
        ? await this.sendWelcome(savedUser, dto.instituteUserType, instituteId)
        : false;

      const requiresFirstLogin = savedUser.profileCompletionStatus === ProfileCompletionStatus.INCOMPLETE;

      return {
        success: true,
        message: `${dto.instituteUserType} created and enrolled in ${institute.name}`,
        smartCards: smartCardResults.length ? smartCardResults : undefined,
        userId: savedUser.id,
        firstName: savedUser.firstName ?? undefined,
        lastName: savedUser.lastName ?? undefined,
        nameWithInitials: savedUser.nameWithInitials ?? undefined,
        email: savedUser.email ?? undefined,
        phoneNumber: savedUser.phoneNumber ?? undefined,
        instituteUserType: dto.instituteUserType,
        profileCompletionStatus: savedUser.profileCompletionStatus,
        profileCompletionPercentage: savedUser.profileCompletionPercentage ?? 0,
        requiresFirstLogin,
        firstLoginUrl: requiresFirstLogin
          ? `${process.env.FRONTEND_URL ?? 'https://lms.suraksha.lk'}/first-login?userId=${savedUser.id}`
          : undefined,
        studentId: studentRecord?.studentId,
        instituteImage: imageResults.instituteImage,
        globalImage: imageResults.globalImage,
        classEnrollments: classEnrollmentResults.length ? classEnrollmentResults : undefined,
        houseId: dto.houseId ?? undefined,
        houseEnrolled,
        welcomeNotificationSent: notificationSent,
        // Scopes whose card pool was empty and skipped (self-registration 'skip' behavior).
        cardPendingScopes: cardPendingScopes.length ? cardPendingScopes : undefined,
      } as CreateInstituteUserResponseDto;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`createInstituteUser failed: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Verify the calling user is an active INSTITUTE_ADMIN of the given institute.
   */
  private async assertInstituteAdmin(adminUserId: string, instituteId: string): Promise<void> {
    const link = await this.instituteUserRepository.findOne({
      where: {
        userId: adminUserId,
        instituteId,
        instituteUserType: InstituteUserType.INSTITUTE_ADMIN,
        status: InstituteUserStatus.ACTIVE,
      },
    });
    if (!link) {
      throw new ForbiddenException(
        'You must be an active INSTITUTE_ADMIN of this institute to create users.',
      );
    }
  }

  /**
   * Map institute role → global user type.
   * Teachers, admins, attendance markers → USER_WITHOUT_STUDENT
   * because they don't need a student record.
   */
  private resolveGlobalUserType(instituteUserType: InstituteUserType): UserType {
    if (instituteUserType === InstituteUserType.STUDENT) {
      return UserType.USER;
    }
    return UserType.USER_WITHOUT_STUDENT;
  }

  /**
   * Create the core `users` record (and `students` record for STUDENT role).
   * Also creates the `user_images` row for the global image if imageUrl is set,
   * since for non-student roles there is no separate image step.
   */
  private async createCoreUser(
    queryRunner: QueryRunner,
    dto: CreateInstituteUserDto,
    globalUserType: UserType,
    adminUserId: string,
  ): Promise<{ savedUser: UserEntity; studentRecord?: StudentEntity }> {
    // Check for duplicate
    if (dto.email) {
      const existing = await queryRunner.manager.findOne(UserEntity, {
        where: { email: dto.email.toLowerCase() },
      });
      if (existing) {
        throw new BadRequestException(
          `User with email ${dto.email} already exists (ID: ${existing.id}). Use assign endpoint instead.`,
        );
      }
    }
    if (dto.phoneNumber) {
      const existing = await queryRunner.manager.findOne(UserEntity, {
        where: { phoneNumber: dto.phoneNumber },
      });
      if (existing) {
        throw new BadRequestException(
          `User with phone ${dto.phoneNumber} already exists (ID: ${existing.id}). Use assign endpoint instead.`,
        );
      }
    }

    const nameWithInitials =
      dto.nameWithInitials ||
      (dto.firstName && dto.lastName
        ? this.generateNameWithInitials(dto.firstName, dto.lastName)
        : null);

    let hashedPassword: string | undefined;
    if (dto.password) {
      hashedPassword = await bcrypt.hash(dto.password, 12);
    }

    const completion = determineProfileStatus({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      password: hashedPassword,
    });

    // Build the base entity — imageUrl intentionally NULL pending approval
    const userEntity = queryRunner.manager.create(UserEntity, {
      firstName: dto.firstName ?? null,
      lastName: dto.lastName ?? null,
      nameWithInitials,
      email: dto.email?.toLowerCase() ?? null,
      phoneNumber: dto.phoneNumber ?? null,
      password: hashedPassword ?? null,
      passwordSetAt: hashedPassword ? now() : null,
      userType: globalUserType,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      gender: dto.gender,
      nic: dto.nic ?? null,
      addressLine1: dto.addressLine1 ?? null,
      addressLine2: dto.addressLine2 ?? null,
      city: dto.city ?? null,
      district: dto.district,
      province: dto.province,
      postalCode: dto.postalCode ?? null,
      language: dto.language,
      // imageUrl stays NULL — only set after global image is VERIFIED
      imageUrl: null,
      imageVerificationStatus:
        dto.globalImageUrl ? ImageVerificationStatus.PENDING : null,
      isActive: true,
      isPhoneVerified: false,
      isEmailVerified: false,
      profileCompletionStatus: completion,
      profileCompletionPercentage: calculateProfileCompletion({
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        password: hashedPassword,
      }),
      firstLoginCompleted: !!hashedPassword,
      createdByAdminId: adminUserId,
      createdAt: now(),
      updatedAt: now(),
    });

    // Auto-generate card ID for students
    if (globalUserType === UserType.USER) {
      const cardId = await this.generateUniqueCardId(queryRunner);
      const cardExpiry = now();
      cardExpiry.setFullYear(cardExpiry.getFullYear() + 2);
      userEntity.cardId = cardId;
      userEntity.cardStatus = CardStatus.ACTIVE;
      userEntity.cardExpiryDate = cardExpiry;
    }

    const savedUser = await queryRunner.manager.save(userEntity);

    // Create student record if needed
    let studentRecord: StudentEntity | undefined;
    if (globalUserType === UserType.USER) {
      const studentId = dto.studentData?.studentId
        || await this.generateUniqueStudentId(queryRunner);

      studentRecord = await queryRunner.manager.save(
        queryRunner.manager.create(StudentEntity, {
          userId: savedUser.id,
          studentId,
          emergencyContact: dto.studentData?.emergencyContact ?? null,
          bloodGroup: dto.studentData?.bloodGroup as any ?? null,
          medicalConditions: dto.studentData?.medicalConditions ?? null,
          allergies: dto.studentData?.allergies ?? null,
          cardDeliveryRecipient: dto.studentData?.cardDeliveryRecipient ?? null,
          isActive: true,
          createdAt: now(),
          updatedAt: now(),
        }),
      );
    }

    return { savedUser, studentRecord };
  }

  /**
   * Create or reuse a parent user record.
   */
  private async createOrFindParent(
    queryRunner: QueryRunner,
    data: InstAdminParentDto,
    adminUserId: string,
  ): Promise<string> {
    let existing: UserEntity | null = null;
    if (data.email) {
      existing = await queryRunner.manager.findOne(UserEntity, {
        where: { email: data.email.toLowerCase() },
      });
    }
    if (!existing && data.phoneNumber) {
      existing = await queryRunner.manager.findOne(UserEntity, {
        where: { phoneNumber: data.phoneNumber },
      });
    }

    if (existing) {
      // Ensure parent record exists
      const parentRecord = await queryRunner.manager.findOne(ParentEntity, {
        where: { userId: existing.id },
      });
      if (!parentRecord) {
        await queryRunner.manager.save(
          queryRunner.manager.create(ParentEntity, {
            userId: existing.id,
            occupation: data.occupation,
            workplace: data.workplace,
            isActive: true,
            createdAt: now(),
            updatedAt: now(),
          }),
        );
      }
      return existing.id;
    }

    // Create new USER_WITHOUT_STUDENT user
    const hashedPassword = data.password ? await bcrypt.hash(data.password, 12) : undefined;
    const nameWithInitials =
      data.firstName && data.lastName
        ? this.generateNameWithInitials(data.firstName, data.lastName)
        : null;

    const userEntity = queryRunner.manager.create(UserEntity, {
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      nameWithInitials,
      email: data.email?.toLowerCase() ?? null,
      phoneNumber: data.phoneNumber ?? null,
      password: hashedPassword ?? null,
      passwordSetAt: hashedPassword ? now() : null,
      userType: UserType.USER_WITHOUT_STUDENT,
      isActive: true,
      isPhoneVerified: false,
      isEmailVerified: false,
      profileCompletionStatus: determineProfileStatus({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        password: hashedPassword,
      }),
      profileCompletionPercentage: calculateProfileCompletion({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phoneNumber: data.phoneNumber,
        password: hashedPassword,
      }),
      firstLoginCompleted: !!hashedPassword,
      createdByAdminId: adminUserId,
      createdAt: now(),
      updatedAt: now(),
    });

    const savedUser = await queryRunner.manager.save(userEntity);

    await queryRunner.manager.save(
      queryRunner.manager.create(ParentEntity, {
        userId: savedUser.id,
        occupation: data.occupation,
        workplace: data.workplace,
        isActive: true,
        createdAt: now(),
        updatedAt: now(),
      }),
    );

    return savedUser.id;
  }

  /**
   * Enroll a student into a class with optional subject enrollments.
   */
  private async enrollStudentToClass(
    queryRunner: QueryRunner,
    studentUserId: string,
    instituteId: string,
    classId: string,
    subjectEnrollments: { subjectId: string }[],
    adminUserId: string,
    extraData: Record<string, any> | null = null,
    enrollmentStatus: 'verified' | 'pending' = 'verified',
  ): Promise<any> {
    // Self-registration enrollments land 'pending' (awaiting admin approval) and are
    // marked self_enrolled — so no enrollment key is required and they don't go live
    // until an admin approves them. Admin path stays verified/manual as before.
    const isPending = enrollmentStatus === 'pending';

    const classEntity = await queryRunner.manager.findOne(InstituteClassEntity, {
      where: { id: classId, instituteId },
    });

    if (!classEntity) {
      return { classId, success: false, message: `Class ${classId} not found in institute` };
    }

    // Class enrollment
    const existingClassStudent = await queryRunner.manager.findOne(InstituteClassStudentEntity, {
      where: { instituteId, classId, studentUserId },
    });

    if (!existingClassStudent) {
      await queryRunner.manager.save(
        queryRunner.manager.create(InstituteClassStudentEntity, {
          instituteId,
          classId,
          studentUserId,
          isActive: true,
          isVerified: !isPending,
          enrollmentMethod: isPending ? 'self_enrollment' : 'manual',
          verifiedBy: isPending ? undefined : adminUserId,
          verifiedAt: isPending ? undefined : now(),
          createdAt: now(),
          updatedAt: now(),
          extraData,
        }),
      );
    }

    // Subject enrollments
    const subjectResults: any[] = [];
    for (const se of subjectEnrollments) {
      const existingSubject = await queryRunner.manager.findOne(InstituteClassSubjectStudent, {
        where: { instituteId, classId, subjectId: se.subjectId, studentId: studentUserId },
      });
      if (!existingSubject) {
        await queryRunner.manager.save(
          queryRunner.manager.create(InstituteClassSubjectStudent, {
            instituteId,
            classId,
            subjectId: se.subjectId,
            studentId: studentUserId,
            isActive: true,
            enrollmentMethod: isPending ? 'self_enrolled' : 'teacher_assigned',
            verificationStatus: isPending ? 'pending' : 'verified',
            enrolledBy: isPending ? undefined : adminUserId,
            createdAt: now(),
            updatedAt: now(),
            extraData,
          }),
        );
        subjectResults.push({ subjectId: se.subjectId, enrolled: true, status: isPending ? 'pending' : 'verified' });
      } else {
        subjectResults.push({ subjectId: se.subjectId, enrolled: false, note: 'already enrolled' });
      }
    }

    return {
      classId,
      className: classEntity.name,
      success: true,
      subjectEnrollments: subjectResults,
    };
  }

  /**
   * Send a welcome notification to the newly created user.
   * ID card email is skipped — imageUrl is null until system admin approves.
   */
  private async sendWelcome(user: UserEntity, role: InstituteUserType, instituteId: string): Promise<boolean> {
    try {
      if (!user.email) return false;

      // Deduct 2 credits for the welcome email. If insufficient, skip sending (best-effort).
      if (this.instituteCreditsService) {
        const hasCredits = await this.instituteCreditsService.hasSufficientCredits(instituteId, 2);
        if (!hasCredits) {
          this.logger.warn(`sendWelcome skipped for ${user.id}: insufficient credits in institute ${instituteId}`);
          return false;
        }
        try {
          await this.instituteCreditsService.deductCredits(instituteId, {
            amount: 2,
            type: CreditTransactionType.EMAIL_SEND,
            description: `Welcome email to new user ${user.id}`,
            referenceType: 'WELCOME_EMAIL',
            referenceId: user.id,
          });
        } catch (creditErr) {
          this.logger.warn(`sendWelcome credit deduction failed: ${creditErr.message}`);
          return false;
        }
      }

      const firstLoginUrl = `${process.env.FRONTEND_URL ?? 'https://lms.suraksha.lk'}/first-login?userId=${user.id}`;
      const roleLabel = role.toLowerCase().replace('_', ' ');

      this.asyncEmailService.sendTemplateEmailAsync({
        templateType: 'welcome-incomplete-profile',
        toEmails: [user.email],
        templateData: {
          name: user.firstName ?? user.nameWithInitials ?? 'User',
          role: roleLabel,
          firstLoginUrl,
          email: user.email,
          phoneNumber: user.phoneNumber,
        },
        customSubject: 'Welcome to Suraksha LMS - Complete Your Registration',
      });
      return true;
    } catch (err) {
      this.logger.warn(`sendWelcome failed: ${err.message}`);
      return false;
    }
  }

  // ─── ID helpers ──────────────────────────────────────────────────────────

  private generateNameWithInitials(firstName: string, lastName: string): string {
    const firstWords = firstName.split(/\s+/).filter(Boolean);
    const lastWords = lastName.split(/\s+/).filter(Boolean);
    const firstInitials = firstWords.map(w => w.charAt(0).toUpperCase() + '.').join('');
    const midInitials = lastWords.slice(0, -1).map(w => w.charAt(0).toUpperCase() + '.').join('');
    const lastWord = lastWords[lastWords.length - 1] ?? '';
    const capitalLast = lastWord.charAt(0).toUpperCase() + lastWord.slice(1).toLowerCase();
    return `${firstInitials}${midInitials} ${capitalLast}`.trim();
  }

  private generateStudentId(): string {
    const year = new Date().getFullYear();
    const rand = crypto.randomInt(0, 10_000_000).toString().padStart(7, '0');
    return `STU-${year}-${rand}`;
  }

  private async generateUniqueStudentId(queryRunner: QueryRunner): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = this.generateStudentId();
      const existing = await queryRunner.manager.findOne(StudentEntity, {
        where: { studentId: candidate },
      });
      if (!existing) return candidate;
    }
    return `STU-${new Date().getFullYear()}-${Date.now().toString(36).slice(-7)}`;
  }

  private generateCardId(): string {
    const year = new Date().getFullYear();
    const rand = crypto.randomInt(0, 10_000_000).toString().padStart(7, '0');
    return `CARD-${year}-${rand}`;
  }

  private async generateUniqueCardId(queryRunner: QueryRunner): Promise<string> {
    const repo = queryRunner.manager.getRepository(UserEntity);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = this.generateCardId();
      const existing = await repo.findOne({ where: { cardId: candidate } });
      if (!existing) return candidate;
    }
    return `CARD-${new Date().getFullYear()}-${Date.now().toString(36)}`;
  }

  private safeFullUrl(path: string): string {
    try {
      return this.cloudStorageService.getFullUrl(path);
    } catch {
      return path;
    }
  }
}
