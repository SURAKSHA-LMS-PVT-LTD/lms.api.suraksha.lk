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
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
  Optional,
} from '@nestjs/common';
import { SmartCardsService } from '../../smart-cards/smart-cards.service';
import { SmartCardScope } from '../../smart-cards/enums/smart-card.enums';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner, EntityManager } from 'typeorm';
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
   * @param adminUserId  The user ID of the calling institute admin. `null` in the
   *                     self-registration path (no admin actor — authorized via link token).
   * @param dto          Creation payload.
   */
  async createInstituteUser(
    instituteId: string,
    adminUserId: string | null,
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

    // Birth certificate number is required only for self-registration (public form).
    // Institute admins may create students without it.
    if (isSelfReg && dto.instituteUserType === InstituteUserType.STUDENT && !dto.birthCertificateNo) {
      throw new BadRequestException('Birth certificate number is required for students.');
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
      // Non-self-reg always has an admin actor; narrow the nullable param for the type checker.
      await this.assertInstituteAdmin(adminUserId as string, instituteId);
    }

    // ── Reject a client-supplied ID upfront when auto-generation is on ───────
    // (The actual ID is generated atomically inside the transaction below — C-2.)
    if (institute.userIdAutoGenerate && dto.userIdByInstitute) {
      throw new BadRequestException(
        'This institute auto-generates user IDs. You cannot provide a custom userIdByInstitute.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // ── Auto-generate userIdByInstitute INSIDE the transaction ───────────
      // Must be inside the transaction so a rollback releases the ID, and uses a
      // row lock so concurrent registrations never share a counter value (C-2).
      if (institute.userIdAutoGenerate) {
        dto.userIdByInstitute = await this.generateNextInstituteUserId(
          institute,
          queryRunner.manager,
        );
      }

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

      // 4a. Institute image — default auto-verified; admin can override to PENDING
      const instImgStatus =
        dto.instituteImageVerificationStatus === 'PENDING'
          ? ImageVerificationStatus.PENDING
          : ImageVerificationStatus.VERIFIED;
      if (dto.instituteUserImageUrl) {
        await queryRunner.manager.save(
          queryRunner.manager.create(UserImageEntity, {
            userId: savedUser.id,
            imageUrl: dto.instituteUserImageUrl,
            scope: ImageScope.INSTITUTE,
            instituteId,
            status: instImgStatus,
            verifiedBy: instImgStatus === ImageVerificationStatus.VERIFIED ? adminUserId : null,
            verifiedAt: now(),
            createdAt: now(),
            updatedAt: now(),
          }),
        );
        imageResults.instituteImage = {
          scope: ImageScope.INSTITUTE,
          status: instImgStatus,
          imageUrl: this.safeFullUrl(dto.instituteUserImageUrl),
          note: instImgStatus === ImageVerificationStatus.VERIFIED
            ? 'Auto-verified by institute admin'
            : 'Pending approval',
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

      // ── Institute-level password (optional) ─────────────────────────────────
      // When `dto.institutePassword` is supplied the admin explicitly wants to set a
      // portal/custom-domain login password for this membership.  We validate that
      // the institute actually has `customLoginEnabled` before writing it so that
      // rogue clients cannot silently set an institute password on institutes that
      // haven't enabled the feature.
      let hashedInstitutePassword: string | undefined;
      if (dto.institutePassword) {
        if (!institute.customLoginEnabled) {
          throw new BadRequestException(
            'This institute does not have custom login (institute portal login) enabled. ' +
            'Enable "Custom Login" in Institute Settings before setting an institute-level password.',
          );
        }
        const pepper = process.env.BCRYPT_PEPPER || '';
        hashedInstitutePassword = await bcrypt.hash(dto.institutePassword + pepper, 12);
      }

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
              ? instImgStatus
              : ImageVerificationStatus.PENDING,
            imageVerifiedBy: (dto.instituteUserImageUrl && instImgStatus === ImageVerificationStatus.VERIFIED) ? adminUserId : null,
            status: InstituteUserStatus.ACTIVE,
            verifiedBy: adminUserId,
            verifiedAt: now(),
            createdAt: now(),
            updatedAt: now(),
            houseId: dto.houseId ?? null,
            extraData: dto.extraData ?? null,
            // Institute-level portal password (only when customLoginEnabled and password supplied)
            ...(hashedInstitutePassword ? {
              institutePassword: hashedInstitutePassword,
              institutePasswordSetAt: now(),
            } : {}),
          }),
        );
      } else {
        // User already enrolled — update house assignment and/or institute password
        const updatePayload: Record<string, any> = { updatedAt: now() };
        if (dto.houseId) updatePayload.houseId = dto.houseId;
        if (hashedInstitutePassword) {
          updatePayload.institutePassword = hashedInstitutePassword;
          updatePayload.institutePasswordSetAt = now();
        }
        if (Object.keys(updatePayload).length > 1) {
          await queryRunner.manager.update(
            InstituteUserEntity,
            { instituteId, userId: savedUser.id },
            updatePayload,
          );
        }
      }

      // ── 5b. Smart-card assignment (institute + suraksha), same transaction ──
      const smartCardResults: Array<{ scope: string; cardId: string; cardName: string }> = [];
      // When the requested card pool is empty: admin path always errors; self-registration
      // honors the link's cardEmptyPoolBehavior ('skip' → continue & flag, 'error' → fail).
      const cardPendingScopes: string[] = [];

      // Skip auto-assignment when the user already has a card for that scope —
      // e.g. existing student re-enrolling: rfid = SURAKSHA card, cardId = INSTITUTE card.
      if (dto.autoAssignInstituteCard && savedUser.cardId) {
        this.logger.log(`User ${savedUser.id} already has an institute card (${savedUser.cardId}); skipping auto-assign.`);
        dto.autoAssignInstituteCard = false;
      }
      if (dto.autoAssignSurakshaCard && savedUser.rfid) {
        this.logger.log(`User ${savedUser.id} already has a Suraksha RFID (${savedUser.rfid}); skipping auto-assign.`);
        dto.autoAssignSurakshaCard = false;
      }

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
        userIdByInstitute: dto.userIdByInstitute ?? undefined,
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
  // PUBLIC: Link an EXISTING user to an institute (and complete missing data)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Link an already-registered user to the institute, completing any missing
   * profile / student / parent data along the way.
   *
   * Reuses the same {@link CreateInstituteUserDto} shape as create, so the frontend
   * submits an identical payload. The difference from create:
   *  - The user already exists (resolved by `userId`); we do NOT create a new user.
   *  - Only EMPTY columns are written — existing data is never overwritten.
   *  - For STUDENT role: a student record is created if absent; parent slots are
   *    only filled when currently empty (existing father/mother/guardian untouched).
   *  - Images, smart cards, house, and class/subject enrollment reuse the create helpers.
   *
   * @param instituteId  Institute the admin manages.
   * @param adminUserId  Calling institute admin (audit actor).
   * @param userId       Existing system user to link.
   * @param dto          Same payload shape as create; only missing fields are applied.
   */
  async linkInstituteUser(
    instituteId: string,
    adminUserId: string,
    userId: string,
    dto: CreateInstituteUserDto,
  ): Promise<CreateInstituteUserResponseDto> {
    // Validate institute + admin authorization (same rules as create).
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) {
      throw new NotFoundException(`Institute not found: ${instituteId}`);
    }
    await this.assertInstituteAdmin(adminUserId, instituteId);

    // Reject a client-supplied institute user-id when the institute auto-generates them.
    if (institute.userIdAutoGenerate && dto.userIdByInstitute) {
      throw new BadRequestException(
        'This institute auto-generates user IDs. You cannot provide a custom userIdByInstitute.',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // ── 1. Load the existing user ────────────────────────────────────────
      const existingUser = await queryRunner.manager.findOne(UserEntity, {
        where: { id: userId },
      });
      if (!existingUser || existingUser.isActive === false) {
        throw new NotFoundException(`User ${userId} not found or inactive`);
      }

      // ── 2. Role-assignment validation ────────────────────────────────────
      // STUDENT role requires the user to be eligible to play the student role.
      // USER_WITHOUT_STUDENT users cannot be students.
      if (
        dto.instituteUserType === InstituteUserType.STUDENT &&
        existingUser.userType === UserType.USER_WITHOUT_STUDENT
      ) {
        throw new BadRequestException(
          'This user is a parent-only account (USER_WITHOUT_STUDENT) and cannot be assigned as a STUDENT.',
        );
      }

      // ── 2b. Reject duplicate assignment for the same role ────────────────
      const alreadyAssigned = await queryRunner.manager.findOne(InstituteUserEntity, {
        where: { instituteId, userId, instituteUserType: dto.instituteUserType },
      });
      if (alreadyAssigned) {
        throw new ConflictException(
          `User is already assigned to this institute as ${dto.instituteUserType}.`,
        );
      }

      // ── 3. Auto-generate institute user-id inside the tx (rollback-safe) ─
      if (institute.userIdAutoGenerate) {
        dto.userIdByInstitute = await this.generateNextInstituteUserId(
          institute,
          queryRunner.manager,
        );
      }

      // ── 4. Fill ONLY the empty columns on the user record ────────────────
      await this.fillMissingUserFields(queryRunner, existingUser, dto);

      // ── 5. STUDENT: ensure student record + fill missing + link empty parents
      let studentRecord: StudentEntity | undefined;
      if (dto.instituteUserType === InstituteUserType.STUDENT) {
        studentRecord = await this.ensureStudentRecord(queryRunner, existingUser.id, dto);

        const slots: Array<'father' | 'mother' | 'guardian'> = ['father', 'mother', 'guardian'];
        const updates: Partial<StudentEntity> = {};
        for (const role of slots) {
          const parentDto = dto[role];
          const slotKey = `${role}Id` as 'fatherId' | 'motherId' | 'guardianId';
          // Only link when the slot is currently EMPTY and parent contact is provided.
          const slotEmpty = !studentRecord![slotKey];
          if (slotEmpty && parentDto && (parentDto.email || parentDto.phoneNumber)) {
            updates[slotKey] = await this.createOrFindParent(queryRunner, parentDto, adminUserId) as any;
          }
        }
        if (Object.keys(updates).length) {
          await queryRunner.manager.update(StudentEntity, { userId: existingUser.id }, {
            ...updates,
            updatedAt: now(),
          });
        }
      }

      // ── 6. Images (same semantics as create) ─────────────────────────────
      const imageResults: {
        instituteImage?: InstituteUserCreationImageResultDto;
        globalImage?: InstituteUserCreationImageResultDto;
      } = {};
      const instImgStatus =
        dto.instituteImageVerificationStatus === 'PENDING'
          ? ImageVerificationStatus.PENDING
          : ImageVerificationStatus.VERIFIED;

      if (dto.instituteUserImageUrl) {
        await queryRunner.manager.save(
          queryRunner.manager.create(UserImageEntity, {
            userId: existingUser.id,
            imageUrl: dto.instituteUserImageUrl,
            scope: ImageScope.INSTITUTE,
            instituteId,
            status: instImgStatus,
            verifiedBy: instImgStatus === ImageVerificationStatus.VERIFIED ? adminUserId : null,
            verifiedAt: now(),
            createdAt: now(),
            updatedAt: now(),
          }),
        );
        imageResults.instituteImage = {
          scope: ImageScope.INSTITUTE,
          status: instImgStatus,
          imageUrl: this.safeFullUrl(dto.instituteUserImageUrl),
          note: instImgStatus === ImageVerificationStatus.VERIFIED
            ? 'Auto-verified by institute admin'
            : 'Pending approval',
        };
      }

      // Global image only when the user has no verified profile image yet.
      if (dto.globalImageUrl && !existingUser.imageUrl) {
        await queryRunner.manager.save(
          queryRunner.manager.create(UserImageEntity, {
            userId: existingUser.id,
            imageUrl: dto.globalImageUrl,
            scope: ImageScope.GLOBAL,
            status: ImageVerificationStatus.PENDING,
            createdAt: now(),
            updatedAt: now(),
          }),
        );
        await queryRunner.manager.update(UserEntity, { id: existingUser.id }, {
          imageVerificationStatus: ImageVerificationStatus.PENDING,
          updatedAt: now(),
        });
        imageResults.globalImage = {
          scope: ImageScope.GLOBAL,
          status: ImageVerificationStatus.PENDING,
          imageUrl: this.safeFullUrl(dto.globalImageUrl),
          note: 'Requires system admin approval. ID card will be sent after approval.',
        };
      }

      // ── 7. Institute assignment ──────────────────────────────────────────
      let hashedInstitutePassword: string | undefined;
      if (dto.institutePassword) {
        if (!institute.customLoginEnabled) {
          throw new BadRequestException(
            'This institute does not have custom login (institute portal login) enabled. ' +
            'Enable "Custom Login" in Institute Settings before setting an institute-level password.',
          );
        }
        const pepper = process.env.BCRYPT_PEPPER || '';
        hashedInstitutePassword = await bcrypt.hash(dto.institutePassword + pepper, 12);
      }

      await queryRunner.manager.save(
        queryRunner.manager.create(InstituteUserEntity, {
          instituteId,
          userId: existingUser.id,
          instituteUserType: dto.instituteUserType,
          userIdByInstitute: dto.userIdByInstitute ?? null,
          instituteCardId: dto.instituteCardId ?? null,
          instituteUserImageUrl: dto.instituteUserImageUrl ?? null,
          imageVerificationStatus: dto.instituteUserImageUrl
            ? instImgStatus
            : ImageVerificationStatus.PENDING,
          imageVerifiedBy: (dto.instituteUserImageUrl && instImgStatus === ImageVerificationStatus.VERIFIED) ? adminUserId : null,
          status: InstituteUserStatus.ACTIVE,
          verifiedBy: adminUserId,
          verifiedAt: now(),
          createdAt: now(),
          updatedAt: now(),
          houseId: dto.houseId ?? null,
          extraData: dto.extraData ?? null,
          ...(hashedInstitutePassword ? {
            institutePassword: hashedInstitutePassword,
            institutePasswordSetAt: now(),
          } : {}),
        }),
      );

      // ── 8. Smart cards — skip scopes the user already has ────────────────
      const smartCardResults: Array<{ scope: string; cardId: string; cardName: string }> = [];
      if (dto.autoAssignInstituteCard && existingUser.cardId) dto.autoAssignInstituteCard = false;
      if (dto.autoAssignSurakshaCard && existingUser.rfid) dto.autoAssignSurakshaCard = false;

      const wantsCard =
        dto.autoAssignInstituteCard || dto.autoAssignSurakshaCard || !!dto.surakshaCardId || !!dto.instituteCardId;
      if (wantsCard && this.smartCardsService) {
        await this.smartCardsService.assertFeatureEnabled(instituteId);
        const tryAssign = async (scope: SmartCardScope, cardValue: string | undefined) => {
          const card = await this.smartCardsService!.assignCardToUser(
            instituteId,
            { userId: existingUser.id, scope, cardValue },
            adminUserId,
            queryRunner.manager,
          );
          smartCardResults.push({ scope, cardId: card.cardId, cardName: card.cardName });
        };
        if (dto.instituteCardId || dto.autoAssignInstituteCard) {
          await tryAssign(SmartCardScope.INSTITUTE, dto.autoAssignInstituteCard ? undefined : dto.instituteCardId);
        }
        if (dto.surakshaCardId || dto.autoAssignSurakshaCard) {
          await tryAssign(SmartCardScope.GLOBAL, dto.autoAssignSurakshaCard ? undefined : dto.surakshaCardId);
        }
      }

      // ── 9. House enrollment ──────────────────────────────────────────────
      let houseEnrolled = false;
      if (dto.houseId) {
        const house = await queryRunner.manager.findOne(InstituteHouseEntity, {
          where: { id: dto.houseId, instituteId, isActive: true },
        });
        if (!house) {
          throw new BadRequestException(`House ${dto.houseId} not found in institute ${instituteId}.`);
        }
        const existingMember = await queryRunner.manager.findOne(InstituteHouseMemberEntity, {
          where: { houseId: dto.houseId, userId: existingUser.id, instituteId },
        });
        if (!existingMember) {
          await queryRunner.manager.save(
            queryRunner.manager.create(InstituteHouseMemberEntity, {
              houseId: dto.houseId,
              instituteId,
              userId: existingUser.id,
              enrolledBy: adminUserId,
              enrollmentMethod: HouseEnrollmentMethod.AUTO,
              isActive: true,
              createdAt: now(),
              updatedAt: now(),
            }),
          );
        } else if (!existingMember.isActive) {
          await queryRunner.manager.update(InstituteHouseMemberEntity, { id: existingMember.id }, {
            isActive: true, updatedAt: now(),
          });
        }
        houseEnrolled = true;
      }

      // ── 10. Class & subject enrollments (STUDENT only) ───────────────────
      const classEnrollmentResults: any[] = [];
      if (dto.instituteUserType === InstituteUserType.STUDENT && dto.classEnrollments?.length) {
        for (const ce of dto.classEnrollments) {
          classEnrollmentResults.push(
            await this.enrollStudentToClass(
              queryRunner,
              existingUser.id,
              instituteId,
              ce.classId,
              ce.subjectEnrollments ?? [],
              adminUserId,
              dto.extraData ?? null,
              'verified',
            ),
          );
        }
      }

      await queryRunner.commitTransaction();

      // Reload for an accurate response snapshot.
      const finalUser = await this.userRepository.findOne({ where: { id: existingUser.id } }) ?? existingUser;

      const notificationSent = dto.sendWelcomeNotifications !== false
        ? await this.sendWelcome(finalUser, dto.instituteUserType, instituteId)
        : false;

      const requiresFirstLogin = finalUser.profileCompletionStatus === ProfileCompletionStatus.INCOMPLETE;

      return {
        success: true,
        message: `Existing user linked to ${institute.name} as ${dto.instituteUserType}`,
        smartCards: smartCardResults.length ? smartCardResults : undefined,
        userId: finalUser.id,
        userIdByInstitute: dto.userIdByInstitute ?? undefined,
        firstName: finalUser.firstName ?? undefined,
        lastName: finalUser.lastName ?? undefined,
        nameWithInitials: finalUser.nameWithInitials ?? undefined,
        email: finalUser.email ?? undefined,
        phoneNumber: finalUser.phoneNumber ?? undefined,
        instituteUserType: dto.instituteUserType,
        profileCompletionStatus: finalUser.profileCompletionStatus,
        profileCompletionPercentage: finalUser.profileCompletionPercentage ?? 0,
        requiresFirstLogin,
        firstLoginUrl: requiresFirstLogin
          ? `${process.env.FRONTEND_URL ?? 'https://lms.suraksha.lk'}/first-login?userId=${finalUser.id}`
          : undefined,
        studentId: studentRecord?.studentId,
        instituteImage: imageResults.instituteImage,
        globalImage: imageResults.globalImage,
        classEnrollments: classEnrollmentResults.length ? classEnrollmentResults : undefined,
        houseId: dto.houseId ?? undefined,
        houseEnrolled,
        welcomeNotificationSent: notificationSent,
      } as CreateInstituteUserResponseDto;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`linkInstituteUser failed: ${error.message}`, error.stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Write ONLY the empty columns of an existing user from the link DTO.
   * Existing (non-empty) values are never overwritten — the form already hid those
   * fields, but we double-guard here so a stale client cannot clobber real data.
   */
  private async fillMissingUserFields(
    queryRunner: QueryRunner,
    user: UserEntity,
    dto: CreateInstituteUserDto,
  ): Promise<void> {
    const isEmpty = (v: unknown): boolean =>
      v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

    const updates: Partial<UserEntity> = {};
    const setIfMissing = (col: keyof UserEntity, current: unknown, incoming: unknown) => {
      if (isEmpty(current) && !isEmpty(incoming)) {
        (updates as any)[col] = incoming;
      }
    };

    setIfMissing('firstName', user.firstName, dto.firstName);
    setIfMissing('lastName', user.lastName, dto.lastName);
    setIfMissing('nameWithInitials', user.nameWithInitials, dto.nameWithInitials);
    setIfMissing('fullName', user.fullName, dto.fullName);
    setIfMissing('religion', user.religion, dto.religion);
    setIfMissing('birthCertificateNo', user.birthCertificateNo, dto.birthCertificateNo);
    setIfMissing('email', user.email, dto.email ? dto.email.toLowerCase() : undefined);
    setIfMissing('phoneNumber', user.phoneNumber, dto.phoneNumber);
    setIfMissing('gender', user.gender, dto.gender);
    setIfMissing('dateOfBirth', user.dateOfBirth, dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined);
    setIfMissing('nic', user.nic, dto.nic);
    setIfMissing('addressLine1', user.addressLine1, dto.addressLine1);
    setIfMissing('addressLine2', user.addressLine2, dto.addressLine2);
    setIfMissing('city', user.city, dto.city);
    setIfMissing('district', user.district, dto.district);
    setIfMissing('province', user.province, dto.province);
    setIfMissing('postalCode', user.postalCode, dto.postalCode);

    if (Object.keys(updates).length) {
      updates.updatedAt = now();
      await queryRunner.manager.update(UserEntity, { id: user.id }, updates);
      Object.assign(user, updates); // keep the in-memory copy fresh for the response
    }
  }

  /**
   * Ensure a `students` row exists for the user, creating it if missing and
   * filling only the empty student columns from the link DTO.
   * Returns the (existing or newly created) student record.
   */
  private async ensureStudentRecord(
    queryRunner: QueryRunner,
    userId: string,
    dto: CreateInstituteUserDto,
  ): Promise<StudentEntity> {
    let student = await queryRunner.manager.findOne(StudentEntity, { where: { userId } });

    if (!student) {
      const studentId = dto.studentData?.studentId || await this.generateUniqueStudentId(queryRunner);
      student = await queryRunner.manager.save(
        queryRunner.manager.create(StudentEntity, {
          userId,
          studentId,
          emergencyContact: dto.studentData?.emergencyContact ?? null,
          bloodGroup: (dto.studentData?.bloodGroup as any) ?? null,
          medicalConditions: dto.studentData?.medicalConditions ?? null,
          allergies: dto.studentData?.allergies ?? null,
          cardDeliveryRecipient: dto.studentData?.cardDeliveryRecipient ?? null,
          isActive: true,
          createdAt: now(),
          updatedAt: now(),
        }),
      );
      return student;
    }

    // Student exists — fill only empty columns.
    const isEmpty = (v: unknown): boolean =>
      v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
    const updates: Partial<StudentEntity> = {};
    if (isEmpty(student.emergencyContact) && dto.studentData?.emergencyContact) updates.emergencyContact = dto.studentData.emergencyContact;
    if (isEmpty(student.bloodGroup) && dto.studentData?.bloodGroup) updates.bloodGroup = dto.studentData.bloodGroup as any;
    if (isEmpty(student.medicalConditions) && dto.studentData?.medicalConditions) updates.medicalConditions = dto.studentData.medicalConditions;
    if (isEmpty(student.allergies) && dto.studentData?.allergies) updates.allergies = dto.studentData.allergies;
    if (isEmpty(student.cardDeliveryRecipient) && dto.studentData?.cardDeliveryRecipient) updates.cardDeliveryRecipient = dto.studentData.cardDeliveryRecipient;

    if (Object.keys(updates).length) {
      updates.updatedAt = now();
      await queryRunner.manager.update(StudentEntity, { userId }, updates);
      Object.assign(student, updates);
    }
    return student;
  }

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
    // Pre-flight duplicate check (friendly error). This is a best-effort guard — under
    // concurrent registrations two transactions can both pass it, so the authoritative
    // protection is the DB unique constraint, caught on save() below (audit C-3).
    if (dto.email) {
      const existing = await queryRunner.manager.findOne(UserEntity, {
        where: { email: dto.email.toLowerCase() },
      });
      if (existing) {
        throw new ConflictException(
          `User with email ${dto.email} already exists (ID: ${existing.id}). Use assign endpoint instead.`,
        );
      }
    }
    if (dto.phoneNumber) {
      const existing = await queryRunner.manager.findOne(UserEntity, {
        where: { phoneNumber: dto.phoneNumber },
      });
      if (existing) {
        throw new ConflictException(
          `User with phone ${dto.phoneNumber} already exists (ID: ${existing.id}). Use assign endpoint instead.`,
        );
      }
    }

    const nameWithInitials =
      dto.nameWithInitials ||
      (dto.firstName && dto.lastName
        ? this.generateNameWithInitials(dto.firstName, dto.lastName)
        : null);

    const fullName =
      dto.fullName ||
      (dto.firstName && dto.lastName ? `${dto.firstName} ${dto.lastName}` : null);

    let hashedPassword: string | undefined;
    if (dto.password) {
      const pepper = process.env.BCRYPT_PEPPER || '';
      hashedPassword = await bcrypt.hash(dto.password + pepper, 12);
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
      fullName,
      religion: dto.religion ?? null,
      birthCertificateNo: dto.birthCertificateNo ?? null,
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

    let savedUser: UserEntity;
    try {
      savedUser = await queryRunner.manager.save(userEntity);
    } catch (err: any) {
      // Authoritative duplicate protection: the DB unique index (email is UNIQUE; phone/nic
      // where constrained) rejects a concurrent insert that slipped past the pre-flight check.
      const code = err?.code ?? err?.driverError?.code;
      if (code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT' || code === '23505') {
        throw new ConflictException(
          'An account with this email or phone number already exists. Please use the existing account.',
        );
      }
      throw err;
    }

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
      data.nameWithInitials ||
      (data.firstName && data.lastName
        ? this.generateNameWithInitials(data.firstName, data.lastName)
        : null);
    const fullName =
      data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null;

    const userEntity = queryRunner.manager.create(UserEntity, {
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      nameWithInitials,
      fullName,
      birthCertificateNo: data.birthCertificateNo ?? null,
      email: data.email?.toLowerCase() ?? null,
      phoneNumber: data.phoneNumber ?? null,
      password: hashedPassword ?? null,
      passwordSetAt: hashedPassword ? now() : null,
      userType: UserType.USER_WITHOUT_STUDENT,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
      gender: data.gender,
      nic: data.nic ?? null,
      addressLine1: data.addressLine1 ?? null,
      addressLine2: data.addressLine2 ?? null,
      city: data.city ?? null,
      district: data.district,
      province: data.province,
      postalCode: data.postalCode ?? null,
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

  /**
   * Atomically increment institute.user_id_last_counter and return the formatted ID.
   *
   * Correctness requirements (see audit C-2):
   *  - MUST run inside the caller's transaction (`manager` = queryRunner.manager) so that
   *    a rollback of the surrounding user-creation transaction also rolls back the counter
   *    increment — otherwise a failed registration permanently burns an ID number.
   *  - The increment AND read-back happen in a single atomic statement under a
   *    pessimistic row lock, so two concurrent registrations can never read the same value
   *    (which would assign the same userIdByInstitute to two different students).
   *
   * Format: <prefix><zero-padded counter>  e.g. prefix "RC" → "RC001", "RC002" …
   * Pad width is chosen so existing pool stays sortable (min 3 digits).
   */
  private async generateNextInstituteUserId(
    institute: InstituteEntity,
    manager: EntityManager,
  ): Promise<string> {
    // Lock the institute row, then increment and read the new value in one atomic step.
    // SELECT … FOR UPDATE serializes concurrent callers; the increment+read cannot interleave.
    const locked = await manager
      .createQueryBuilder(InstituteEntity, 'i')
      .setLock('pessimistic_write')
      .where('i.id = :id', { id: institute.id })
      .getOne();

    const current = Number((locked as any)?.userIdLastCounter ?? 0);
    const counter = current + 1;

    await manager.update(InstituteEntity, { id: institute.id }, {
      userIdLastCounter: counter as any,
    });

    const prefix = institute.userIdPrefix?.trim() ?? '';
    // Pad to at least 3 digits; widen automatically once we exceed 999.
    const padWidth = Math.max(3, String(counter).length);
    return `${prefix}${String(counter).padStart(padWidth, '0')}`;
  }

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
