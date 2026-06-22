/**
 * 🌐 INSTITUTE SELF-REGISTRATION SERVICE
 *
 * Orchestrates the public /forms/:token registration flow. It does NOT duplicate
 * user-creation logic — it reuses InstituteAdminUserService.createInstituteUser
 * (with self-registration options) and UserOtpService for verification.
 *
 * Two paths:
 *  - NEW user   → build a CreateInstituteUserDto from the public payload and call
 *                 createInstituteUser({ selfRegistration }) → enrollments land 'pending'.
 *  - EXISTING   → user proved ownership of a matching phone/email via OTP. We
 *                 "claim" them into the institute with the link's user type, after:
 *                   • blocking if they're already an active member of this institute,
 *                   • blocking if they hold a DIFFERENT institute user type here,
 *                   • filling only their missing profile fields (others read-only).
 *
 * The institute is ALWAYS derived from the link token — never trusted from the client.
 */

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  GoneException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { now } from '../../../common/utils/timezone.util';

import { InstituteRegistrationLinkEntity } from '../entities/institute-registration-link.entity';
import { InstituteEntity } from '../entities/institute.entity';
import { InstituteClassEntity } from '../../institute_mudules/institue_class/entities/institue_class.entity';
import { InstituteClassSubjectEntity } from '../../institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
// (entity class is InstituteClassSubjectEntity)
import { InstituteUserEntity } from '../../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteUserStatus } from '../../institute_mudules/institue_user/enums/institute-user-status.enum';
import { InstituteUserType } from '../../institute_mudules/institue_user/enums/institute-user-type.enum';
import { UserEntity } from '../../user/entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';

import { InstituteAdminUserService } from '../../user/services/institute-admin-user.service';
import { UserOtpService } from '../../user/services/user-otp.service';
import { FeaturesService } from '../../features/features.service';
import { SMART_CARDS_FEATURE_KEY } from '../../smart-cards/enums/smart-card.enums';
import { CreateInstituteUserDto } from '../../user/dto/create-institute-user.dto';

/** Public payload posted from the /forms/:token form. */
export interface PublicRegistrationPayload {
  instituteUserType: string;
  firstName?: string;
  lastName?: string;
  nameWithInitials?: string;
  email?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  nic?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  father?: Record<string, any>;
  mother?: Record<string, any>;
  guardian?: Record<string, any>;
  classEnrollments?: { classId: string; subjectEnrollments?: { subjectId: string }[] }[];
  extraData?: Record<string, any>;
}

@Injectable()
export class InstituteSelfRegistrationService {
  private readonly logger = new Logger(InstituteSelfRegistrationService.name);

  constructor(
    @InjectRepository(InstituteRegistrationLinkEntity)
    private readonly linkRepo: Repository<InstituteRegistrationLinkEntity>,
    @InjectRepository(InstituteEntity)
    private readonly instituteRepo: Repository<InstituteEntity>,
    @InjectRepository(InstituteClassEntity)
    private readonly classRepo: Repository<InstituteClassEntity>,
    @InjectRepository(InstituteClassSubjectEntity)
    private readonly classSubjectRepo: Repository<InstituteClassSubjectEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepo: Repository<InstituteUserEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepo: Repository<StudentEntity>,
    private readonly dataSource: DataSource,
    private readonly adminUserService: InstituteAdminUserService,
    private readonly otpService: UserOtpService,
    private readonly featuresService: FeaturesService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // ADMIN: link lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  /** Generate an unguessable URL-safe token. */
  private generateToken(): string {
    return randomBytes(18).toString('base64url'); // 24-char URL-safe slug
  }

  async createLink(
    instituteId: string,
    createdBy: string | null,
    body: Partial<InstituteRegistrationLinkEntity>,
  ): Promise<InstituteRegistrationLinkEntity> {
    const allowed = Array.isArray(body.allowedUserTypes) ? body.allowedUserTypes : [];
    if (!allowed.length) {
      throw new BadRequestException('At least one allowed user type is required.');
    }
    // Validate the user types against the enum.
    const validTypes = new Set(Object.values(InstituteUserType) as string[]);
    for (const t of allowed) {
      if (!validTypes.has(t)) throw new BadRequestException(`Invalid user type: ${t}`);
    }

    // Generate a unique token (retry on the rare collision).
    let token = this.generateToken();
    for (let i = 0; i < 5 && (await this.linkRepo.findOne({ where: { token } })); i++) {
      token = this.generateToken();
    }

    const link = this.linkRepo.create({
      token,
      instituteId,
      createdBy,
      label: body.label ?? null,
      allowedUserTypes: allowed,
      autoAssignCard: !!body.autoAssignCard,
      cardScope: body.cardScope ?? 'INSTITUTE',
      cardEmptyPoolBehavior: body.cardEmptyPoolBehavior ?? 'skip',
      allowClassEnrollment: !!body.allowClassEnrollment,
      // Subject enrollment only meaningful when class enrollment is on.
      allowSubjectEnrollment: !!body.allowClassEnrollment && !!body.allowSubjectEnrollment,
      requirePhoneVerification: body.requirePhoneVerification !== false,
      requireEmailVerification: body.requireEmailVerification !== false,
      extraDataFields: body.extraDataFields ?? null,
      isActive: true,
      expiresAt: body.expiresAt ?? null,
      registrationCount: 0,
    });
    return this.linkRepo.save(link);
  }

  async listLinks(instituteId: string): Promise<InstituteRegistrationLinkEntity[]> {
    return this.linkRepo.find({ where: { instituteId }, order: { createdAt: 'DESC' } });
  }

  async updateLink(
    instituteId: string,
    linkId: string,
    patch: Partial<InstituteRegistrationLinkEntity>,
  ): Promise<InstituteRegistrationLinkEntity> {
    const link = await this.linkRepo.findOne({ where: { id: linkId, instituteId } });
    if (!link) throw new NotFoundException('Registration link not found.');

    // Whitelist mutable fields — token / institute / counts are immutable.
    const mutable: (keyof InstituteRegistrationLinkEntity)[] = [
      'label', 'allowedUserTypes', 'autoAssignCard', 'cardScope', 'cardEmptyPoolBehavior',
      'allowClassEnrollment', 'allowSubjectEnrollment', 'requirePhoneVerification',
      'requireEmailVerification', 'extraDataFields', 'isActive', 'expiresAt',
    ];
    for (const key of mutable) {
      if (patch[key] !== undefined) (link as any)[key] = patch[key];
    }
    if (!link.allowClassEnrollment) link.allowSubjectEnrollment = false;
    return this.linkRepo.save(link);
  }

  async deleteLink(instituteId: string, linkId: string): Promise<void> {
    const res = await this.linkRepo.delete({ id: linkId, instituteId });
    if (!res.affected) throw new NotFoundException('Registration link not found.');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: resolve link + build form config
  // ─────────────────────────────────────────────────────────────────────────

  /** Load an active, non-expired link by token, or throw 404/410. */
  private async resolveActiveLink(token: string): Promise<InstituteRegistrationLinkEntity> {
    const link = await this.linkRepo.findOne({ where: { token } });
    if (!link) throw new NotFoundException('This registration link does not exist.');
    if (!link.isActive) throw new GoneException('This registration link has been disabled.');
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('This registration link has expired.');
    }
    return link;
  }

  /**
   * Public form config: branding + link toggles + (if enabled) class/subject lists.
   * Card options are reported as available only when the institute actually has the
   * smart-cards feature enabled — otherwise the form must hide/disable them.
   */
  async getPublicFormConfig(token: string): Promise<any> {
    const link = await this.resolveActiveLink(token);
    const institute = await this.instituteRepo.findOne({ where: { id: link.instituteId } });
    if (!institute) throw new NotFoundException('Institute not found.');

    const features = await this.featuresService.getFeaturesForInstitute(link.instituteId);
    const smartCardsEnabled = !!features?.[SMART_CARDS_FEATURE_KEY]?.enabled;

    let classes: any[] = [];
    if (link.allowClassEnrollment) {
      const rows = await this.classRepo.find({
        where: { instituteId: link.instituteId, isActive: true } as any,
        order: { grade: 'ASC', name: 'ASC' } as any,
      });
      // Pre-load subjects per class only when subject enrollment is enabled.
      const subjectsByClass: Record<string, any[]> = {};
      if (link.allowSubjectEnrollment && rows.length) {
        const cs = await this.classSubjectRepo.find({
          where: { instituteId: link.instituteId, isActive: true } as any,
          relations: ['subject'],
        });
        for (const row of cs) {
          (subjectsByClass[row.classId] ??= []).push({
            subjectId: row.subjectId,
            name: (row as any).subject?.name ?? row.subjectId,
          });
        }
      }
      classes = rows.map((c) => ({
        classId: c.id,
        name: c.name,
        grade: (c as any).grade ?? null,
        subjects: subjectsByClass[c.id] ?? [],
      }));
    }

    // Resolve the institute's custom columns the form should render. Join each schema
    // column with this link's per-field mode ('off' columns are dropped), and filter to
    // the link's user types via the column's applicableTo. Core fields are NOT here —
    // they keep their fixed system requiredness, handled by the standard create flow.
    const customColumns = this.resolveCustomColumns(institute, link);

    return {
      token: link.token,
      institute: {
        id: institute.id,
        name: institute.name,
        logoUrl: institute.loginLogoUrl || institute.logoUrl || null,
        backgroundUrl: (institute as any).loginBackgroundUrl || null,
        primaryColorCode: institute.primaryColorCode || null,
        welcomeTitle: (institute as any).loginWelcomeTitle || null,
        welcomeSubtitle: (institute as any).loginWelcomeSubtitle || null,
      },
      config: {
        allowedUserTypes: link.allowedUserTypes,
        autoAssignCard: link.autoAssignCard,
        cardScope: link.cardScope,
        // Card UI is only actionable when the feature is on. The form should show a
        // "Enable Smart Cards feature" note when this is false but autoAssignCard is set.
        smartCardsEnabled,
        allowClassEnrollment: link.allowClassEnrollment,
        allowSubjectEnrollment: link.allowSubjectEnrollment,
        requirePhoneVerification: link.requirePhoneVerification,
        requireEmailVerification: link.requireEmailVerification,
        // Institute custom columns to render, each with its per-link mode.
        customColumns,
      },
      classes,
    };
  }

  /**
   * Validate submitted custom-column values against the link config and return a
   * sanitized extraData containing ONLY keys the link enabled (optional/required).
   * Throws if a required column is missing. Unknown/disabled keys are dropped so a
   * client can't smuggle arbitrary data into extraData.
   */
  private async validateAndCollectCustomColumns(
    link: InstituteRegistrationLinkEntity,
    userType: InstituteUserType,
    submitted: Record<string, any> | undefined,
  ): Promise<Record<string, any> | undefined> {
    const institute = await this.instituteRepo.findOne({ where: { id: link.instituteId } });
    if (!institute) return undefined;
    const columns = this.resolveCustomColumns(institute, link).filter((c) => {
      // resolveCustomColumns already filtered applicableTo against ALL link types;
      // re-check against the specific user type being registered.
      const schemaCol = ((institute as any).userExtraDataSchema as any[] | undefined)?.find((s) => s.key === c.key);
      const applicable = schemaCol?.applicableTo;
      return !applicable?.length || applicable.includes(userType);
    });
    if (!columns.length) return undefined;

    const out: Record<string, any> = {};
    const src = submitted ?? {};
    for (const col of columns) {
      const raw = src[col.key];
      const empty = raw === undefined || raw === null || raw === '';
      if (empty) {
        if (col.required) throw new BadRequestException(`"${col.label}" is required.`);
        continue;
      }
      if (col.type === 'select' && col.options?.length && !col.options.includes(String(raw))) {
        throw new BadRequestException(`"${col.label}" must be one of: ${col.options.join(', ')}.`);
      }
      out[col.key] = raw;
    }
    return Object.keys(out).length ? out : undefined;
  }

  /**
   * Join institute.userExtraDataSchema with the link's per-field modes.
   * Returns only columns set to 'optional' or 'required' that apply to the link's
   * allowed user types. 'off' (or unset) columns are excluded entirely.
   */
  private resolveCustomColumns(
    institute: InstituteEntity,
    link: InstituteRegistrationLinkEntity,
  ): Array<{ key: string; label: string; type: string; options?: string[]; required: boolean }> {
    const schema = (institute as any).userExtraDataSchema as
      | Array<{ key: string; label: string; type: string; options?: string[]; applicableTo?: string[] }>
      | undefined;
    if (!Array.isArray(schema) || !schema.length) return [];
    const modes = link.extraDataFields ?? {};
    const linkTypes = new Set(link.allowedUserTypes);

    return schema
      .filter((col) => {
        const mode = modes[col.key];
        if (mode !== 'optional' && mode !== 'required') return false; // off/unset → skip
        // applicableTo empty/undefined → applies to all; otherwise must intersect link types.
        if (col.applicableTo?.length && !col.applicableTo.some((t) => linkTypes.has(t))) return false;
        return true;
      })
      .map((col) => ({
        key: col.key,
        label: col.label,
        type: col.type,
        options: col.options,
        required: modes[col.key] === 'required',
      }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: existing-account lookup (after OTP claim)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * After OTP-verifying ownership of an existing account, return which profile
   * fields are missing (so the form shows only those as editable) plus a read-only
   * snapshot of what's already on file. Also enforces the institute-membership and
   * user-type-conflict rules so the form can fail fast.
   */
  async lookupExistingForClaim(
    token: string,
    params: { phoneNumber?: string; email?: string },
  ): Promise<any> {
    const link = await this.resolveActiveLink(token);

    // Prove ownership server-side (never trust the client's "verified" flag).
    await this.otpService.assertRegistrationVerified(params);

    const user = await this.findUserByContact(params);
    if (!user) throw new NotFoundException('No existing account matches that verified contact.');

    await this.assertCanClaim(link, user.id);

    const student = await this.studentRepo.findOne({ where: { userId: user.id } });

    // "Missing" = currently empty on the profile. Filled fields are returned read-only.
    const filled: Record<string, any> = {
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      nameWithInitials: user.nameWithInitials ?? null,
      email: user.email ?? null,
      phoneNumber: user.phoneNumber ?? null,
      dateOfBirth: (user as any).dateOfBirth ?? null,
      gender: (user as any).gender ?? null,
      nic: (user as any).nic ?? null,
    };
    const missing = Object.entries(filled)
      .filter(([, v]) => v === null || v === '')
      .map(([k]) => k);

    return {
      existingUserId: String(user.id),
      filled,
      missing,
      hasFather: !!student?.fatherId,
      hasMother: !!student?.motherId,
      hasGuardian: !!student?.guardianId,
    };
  }

  /**
   * Lighter lookup for a PARENT contact (no institute-claim checks). After OTP-verifying
   * ownership of a parent's phone/email, return the basic profile fields to prefill that
   * parent block. If no account matches, returns { found: false } — the form just keeps
   * the parent's fields editable.
   */
  async lookupParentContact(
    token: string,
    params: { phoneNumber?: string; email?: string },
  ): Promise<any> {
    await this.resolveActiveLink(token);
    await this.otpService.assertRegistrationVerified(params);

    const user = await this.findUserByContact(params);
    if (!user) return { found: false };

    const filled: Record<string, any> = {
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      nameWithInitials: user.nameWithInitials ?? null,
      email: user.email ?? null,
      phoneNumber: user.phoneNumber ?? null,
      nic: (user as any).nic ?? null,
    };
    const missing = Object.entries(filled).filter(([, v]) => v === null || v === '').map(([k]) => k);
    return { found: true, existingUserId: String(user.id), filled, missing };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC: register (new) / claim (existing)
  // ─────────────────────────────────────────────────────────────────────────

  async register(token: string, payload: PublicRegistrationPayload, ipAddress?: string): Promise<any> {
    const link = await this.resolveActiveLink(token);

    // 1. User type must be one the link allows.
    if (!link.allowedUserTypes.includes(payload.instituteUserType)) {
      throw new BadRequestException('Selected user type is not allowed for this registration link.');
    }
    const userType = payload.instituteUserType as InstituteUserType;

    // 2. Verification gates (server re-checks; never trusts the client).
    if (link.requirePhoneVerification) {
      if (!payload.phoneNumber) throw new BadRequestException('Phone number is required.');
      await this.otpService.assertRegistrationVerified({ phoneNumber: payload.phoneNumber });
    }
    if (link.requireEmailVerification) {
      if (!payload.email) throw new BadRequestException('Email address is required.');
      await this.otpService.assertRegistrationVerified({ email: payload.email });
    }

    // 2b. Institute custom columns: enforce 'required' ones and drop any keys the link
    //     did not enable (clients can't smuggle arbitrary extraData).
    const sanitizedExtra = await this.validateAndCollectCustomColumns(link, userType, payload.extraData);
    payload.extraData = sanitizedExtra;

    // 3. Existing-account detection → claim path.
    const existing = await this.findUserByContact({
      phoneNumber: payload.phoneNumber,
      email: payload.email,
    });
    if (existing) {
      return this.claimExisting(link, existing, userType, payload);
    }

    // 4. New user → reuse the admin creation pipeline in self-registration mode.
    const dto = this.buildCreateDto(link, payload, userType);
    const result = await this.adminUserService.createInstituteUser(
      link.instituteId,
      null as any,
      dto,
      {
        selfRegistration: true,
        actorUserId: null,
        enrollmentVerificationStatus: 'pending',
        cardEmptyPoolBehavior: link.cardEmptyPoolBehavior,
      },
    );

    await this.linkRepo.increment({ id: link.id }, 'registrationCount', 1);

    return {
      success: true,
      mode: 'created',
      message: 'Registration submitted. Your enrollment is pending institute approval.',
      userId: result.userId,
      cardPendingScopes: (result as any).cardPendingScopes,
    };
  }

  /**
   * Claim an existing account into the institute. Ownership was already proven via OTP
   * (re-asserted in register()). Fills only missing profile fields, then creates the
   * institute membership (pending) and any class/subject enrollments (pending).
   */
  private async claimExisting(
    link: InstituteRegistrationLinkEntity,
    user: UserEntity,
    userType: InstituteUserType,
    payload: PublicRegistrationPayload,
  ): Promise<any> {
    await this.assertCanClaim(link, user.id);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Fill ONLY missing core profile fields — never overwrite existing/verified data.
      const patch: Record<string, any> = {};
      const setIfEmpty = (field: keyof UserEntity, value: any) => {
        if (value && (user[field] === null || user[field] === undefined || user[field] === '')) {
          patch[field as string] = value;
        }
      };
      setIfEmpty('firstName', payload.firstName);
      setIfEmpty('lastName', payload.lastName);
      setIfEmpty('nameWithInitials', payload.nameWithInitials);
      setIfEmpty('dateOfBirth' as any, payload.dateOfBirth);
      setIfEmpty('gender' as any, payload.gender);
      setIfEmpty('nic' as any, payload.nic);
      if (Object.keys(patch).length) {
        patch.updatedAt = now();
        await queryRunner.manager.update(UserEntity, { id: user.id }, patch);
      }

      // Create the institute membership in a pending state with the link's user type.
      // Persist any collected institute custom-column values onto the membership row.
      await queryRunner.manager.save(
        queryRunner.manager.create(InstituteUserEntity, {
          instituteId: link.instituteId,
          userId: String(user.id),
          instituteUserType: userType,
          status: InstituteUserStatus.PENDING,
          extraData: payload.extraData ?? undefined,
          createdAt: now(),
          updatedAt: now(),
        } as any),
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    // Class/subject enrollments (pending) — reuse the admin service in self-reg mode.
    // Membership already exists; createInstituteUser is not re-run for existing users.
    if (userType === InstituteUserType.STUDENT && link.allowClassEnrollment && payload.classEnrollments?.length) {
      await this.enrollExistingPending(link, String(user.id), payload);
    }

    await this.linkRepo.increment({ id: link.id }, 'registrationCount', 1);

    return {
      success: true,
      mode: 'claimed',
      message: 'Your existing account has been submitted to join this institute. Pending admin approval.',
      userId: String(user.id),
    };
  }

  /** Pending class/subject enrollment for an already-existing user (claim path). */
  private async enrollExistingPending(
    link: InstituteRegistrationLinkEntity,
    userId: string,
    payload: PublicRegistrationPayload,
  ): Promise<void> {
    // We replicate the same pending rows createInstituteUser would write — directly here,
    // because the existing user already exists (we must not re-create the user record).
    for (const ce of payload.classEnrollments ?? []) {
      const cls = await this.classRepo.findOne({ where: { id: ce.classId, instituteId: link.instituteId } });
      if (!cls) continue;

      const existingClass = await this.dataSource.manager.findOne(InstituteClassStudentEntity, {
        where: { instituteId: link.instituteId, classId: ce.classId, studentUserId: userId },
      });
      if (!existingClass) {
        await this.dataSource.manager.save(
          this.dataSource.manager.create(InstituteClassStudentEntity, {
            instituteId: link.instituteId,
            classId: ce.classId,
            studentUserId: userId,
            isActive: true,
            isVerified: false,
            enrollmentMethod: 'self_enrollment',
            createdAt: now(),
            updatedAt: now(),
          }),
        );
      }

      if (link.allowSubjectEnrollment) {
        for (const se of ce.subjectEnrollments ?? []) {
          const existingSub = await this.dataSource.manager.findOne(InstituteClassSubjectStudent, {
            where: { instituteId: link.instituteId, classId: ce.classId, subjectId: se.subjectId, studentId: userId },
          });
          if (!existingSub) {
            await this.dataSource.manager.save(
              this.dataSource.manager.create(InstituteClassSubjectStudent, {
                instituteId: link.instituteId,
                classId: ce.classId,
                subjectId: se.subjectId,
                studentId: userId,
                isActive: true,
                enrollmentMethod: 'self_enrolled',
                verificationStatus: 'pending',
                createdAt: now(),
                updatedAt: now(),
              }),
            );
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async findUserByContact(params: { phoneNumber?: string; email?: string }): Promise<UserEntity | null> {
    if (params.email) {
      const byEmail = await this.userRepo.findOne({ where: { email: params.email.trim().toLowerCase() } });
      if (byEmail) return byEmail;
    }
    if (params.phoneNumber) {
      const byPhone = await this.userRepo.findOne({ where: { phoneNumber: params.phoneNumber } });
      if (byPhone) return byPhone;
    }
    return null;
  }

  /**
   * Enforce the claim rules:
   *  - block if already an active member of this institute (no duplicate enrollment),
   *  - block if they hold a DIFFERENT institute user type here (admin must resolve).
   */
  private async assertCanClaim(link: InstituteRegistrationLinkEntity, userId: string | number): Promise<void> {
    const memberships = await this.instituteUserRepo.find({
      where: { instituteId: link.instituteId, userId: String(userId) },
    });
    const active = memberships.find((m) => m.status === InstituteUserStatus.ACTIVE);
    if (active) {
      throw new ConflictException('You are already a member of this institute.');
    }
    const conflicting = memberships.find(
      (m) => m.instituteUserType && !link.allowedUserTypes.includes(m.instituteUserType),
    );
    if (conflicting) {
      throw new ForbiddenException(
        'Your account already has a different role in this institute. Please contact the institute admin.',
      );
    }
  }

  /** Build a CreateInstituteUserDto from the public payload, restricted to link config. */
  private buildCreateDto(
    link: InstituteRegistrationLinkEntity,
    payload: PublicRegistrationPayload,
    userType: InstituteUserType,
  ): CreateInstituteUserDto {
    const dto: any = {
      instituteUserType: userType,
      firstName: payload.firstName,
      lastName: payload.lastName,
      nameWithInitials: payload.nameWithInitials,
      email: payload.email,
      phoneNumber: payload.phoneNumber,
      dateOfBirth: payload.dateOfBirth,
      gender: payload.gender,
      nic: payload.nic,
      addressLine1: payload.addressLine1,
      addressLine2: payload.addressLine2,
      city: payload.city,
      district: payload.district,
      province: payload.province,
      postalCode: payload.postalCode,
      father: payload.father,
      mother: payload.mother,
      guardian: payload.guardian,
      extraData: payload.extraData,
      // No welcome notification spend on self-registration (pending approval).
      sendWelcomeNotifications: false,
    };

    // Card auto-assign — only when the link enables it. The service still gates on the
    // smart-cards feature flag and applies the empty-pool behavior we pass in options.
    if (link.autoAssignCard) {
      if (link.cardScope === 'INSTITUTE' || link.cardScope === 'BOTH') dto.autoAssignInstituteCard = true;
      if (link.cardScope === 'GLOBAL' || link.cardScope === 'BOTH') dto.autoAssignSurakshaCard = true;
    }

    // Class/subject enrollment — only for students and only when the link allows it.
    if (userType === InstituteUserType.STUDENT && link.allowClassEnrollment && payload.classEnrollments?.length) {
      dto.classEnrollments = payload.classEnrollments.map((ce) => ({
        classId: ce.classId,
        subjectEnrollments:
          link.allowSubjectEnrollment && ce.subjectEnrollments?.length
            ? ce.subjectEnrollments.map((s) => ({ subjectId: s.subjectId }))
            : undefined,
      }));
    }

    return dto as CreateInstituteUserDto;
  }
}
