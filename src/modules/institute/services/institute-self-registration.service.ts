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
import { Repository, DataSource, EntityManager } from 'typeorm';
import * as bcrypt from 'bcrypt';
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
import { ProfileCompletionStatus } from '../../user/enums/profile-completion-status.enum';
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
  fullName?: string;
  religion?: string;
  birthCertificateNo?: string;
  email?: string;
  emailOtpId?: string;
  phoneNumber?: string;
  phoneOtpId?: string;
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
  /** When set, this is a mock-user claim: the student is taking ownership of a hollow pre-created record. */
  mockUserIdByInstitute?: string;
  /** Required alongside mockUserIdByInstitute: the card ID printed on the physical card
   *  (e.g. "SC1234567890"). userIdByInstitute alone is a small, sequential value that can
   *  be enumerated — the card ID is a large random value only the cardholder can read. */
  mockClaimCardId?: string;
  password?: string;
  isClaiming?: boolean;
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
      autoVerify: !!body.autoVerify,
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
      'requireEmailVerification', 'extraDataFields', 'autoVerify', 'isActive', 'expiresAt',
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

  /** Return the instituteId for an active link — used by public endpoints that need it without full config. */
  async getInstituteIdFromToken(token: string): Promise<string> {
    const link = await this.resolveActiveLink(token);
    return link.instituteId;
  }

  /** Load an active, non-expired link by token, or throw 404/410. */
  private async resolveActiveLink(token: string): Promise<InstituteRegistrationLinkEntity> {
    const link = await this.linkRepo.findOne({ where: { token } });
    if (!link) throw new NotFoundException('This registration link does not exist.');
    if (!link.isActive) throw new GoneException('This registration link has been disabled.');
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('This registration link has expired.');
    }
    // The institute itself must be active — a deactivated/suspended institute must not
    // accept new registrations even if a cached link is submitted (audit M-4).
    const institute = await this.instituteRepo.findOne({
      where: { id: link.instituteId },
      select: ['id', 'isActive'],
    });
    if (!institute) throw new NotFoundException('Institute not found.');
    if (!institute.isActive) {
      throw new GoneException('This institute is not currently accepting registrations.');
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
        autoVerify: link.autoVerify,
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
  // PUBLIC: lookup contacts by Suraksha User ID (before OTP)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Given a Suraksha LMS User ID, return the masked contacts (phone / email)
   * so the user can choose which one to receive the verification OTP on.
   * No sensitive data is exposed — contacts are masked (e.g. +94 77*** 1234).
   */
  async lookupContactsByUserId(token: string, userId: string): Promise<{
    found: boolean;
    maskedPhone?: string | null;
    maskedEmail?: string | null;
  }> {
    const link = await this.resolveActiveLink(token);

    // Scope to users who actually have a membership at this link's institute — otherwise
    // any registration link becomes a platform-wide user-existence oracle for arbitrary
    // numeric IDs outside that institute.
    const membership = await this.instituteUserRepo.findOne({
      where: { instituteId: link.instituteId, userId: userId as any },
    });
    if (!membership) return { found: false };

    const user = await this.userRepo.findOne({ where: { id: userId as any } });
    if (!user) return { found: false };

    const maskPhone = (p: string) => {
      // Keep first 3 and last 4 digits; mask the middle: +94 77***1234
      const d = p.replace(/\D/g, '');
      if (d.length < 7) return p.slice(0, 2) + '***' + p.slice(-2);
      return p.slice(0, 5) + '***' + p.slice(-4);
    };
    const maskEmail = (e: string) => {
      const [local, domain] = e.split('@');
      if (!domain) return e.slice(0, 2) + '***';
      const visible = local.length > 3 ? local.slice(0, 3) : local.slice(0, 1);
      return visible + '***@' + domain;
    };

    return {
      found: true,
      maskedPhone: user.phoneNumber ? maskPhone(user.phoneNumber) : null,
      maskedEmail: user.email ? maskEmail(user.email) : null,
    };
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

    // Read-only eligibility check (no writes here) — use the default manager.
    await this.assertCanClaim(link, user.id, this.dataSource.manager);

    const student = await this.studentRepo.findOne({ where: { userId: user.id } });

    // "Missing" = currently empty on the profile. Filled fields are returned read-only.
    const filled: Record<string, any> = {
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      nameWithInitials: user.nameWithInitials ?? null,
      fullName: (user as any).fullName ?? null,
      religion: (user as any).religion ?? null,
      birthCertificateNo: (user as any).birthCertificateNo ?? null,
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
    //    Track which contacts were actually proven via OTP — only a verified contact may
    //    be used to claim an existing account (audit H-4: prevents hijacking a victim's
    //    account by submitting their phone/email on a link that doesn't require verification).
    let phoneVerified = false;
    let emailVerified = false;
    if (link.requirePhoneVerification) {
      if (!payload.phoneNumber) throw new BadRequestException('Phone number is required.');
      await this.otpService.assertRegistrationVerified({
        phoneNumber: payload.phoneNumber,
        phoneOtpId: payload.phoneOtpId,
      });
      phoneVerified = true;
    }
    if (link.requireEmailVerification) {
      if (!payload.email) throw new BadRequestException('Email address is required.');
      await this.otpService.assertRegistrationVerified({
        email: payload.email,
        emailOtpId: payload.emailOtpId,
      });
      emailVerified = true;
    }

    // 2b. Institute custom columns: enforce 'required' ones and drop any keys the link
    //     did not enable (clients can't smuggle arbitrary extraData).
    const sanitizedExtra = await this.validateAndCollectCustomColumns(link, userType, payload.extraData);
    payload.extraData = sanitizedExtra;

    // 2c. Mock-user claim path: student enters institute user ID → claims a hollow record.
    if (payload.mockUserIdByInstitute?.trim()) {
      return this.claimMockUser(link, userType, payload);
    }

    // 3. Existing-account detection → claim path.
    //    Look up ONLY by verified contacts. An unverified contact must never resolve to an
    //    existing account, or an attacker could claim someone else's account (H-4).
    const existing = await this.findUserByContact({
      phoneNumber: phoneVerified ? payload.phoneNumber : undefined,
      email: emailVerified ? payload.email : undefined,
    });
    if (existing) {
      if (!payload.isClaiming) {
        throw new ConflictException('This phone number or email is already registered. If this is your account, please use the "Find account" feature to link it.');
      }
      return this.claimExisting(link, existing, userType, payload);
    }

    // 4. New user → reuse the admin creation pipeline in self-registration mode.
    const institute = await this.instituteRepo.findOne({ where: { id: link.instituteId } });
    const dto = this.buildCreateDto(link, payload, userType, institute || undefined);
    const result = await this.adminUserService.createInstituteUser(
      link.instituteId,
      null,
      dto,
      {
        selfRegistration: true,
        actorUserId: null,
        enrollmentVerificationStatus: 'pending',
        cardEmptyPoolBehavior: link.cardEmptyPoolBehavior,
      },
    );

    // Auto-verify status update for new users
    if (link.autoVerify) {
      await this.userRepo.update({ id: BigInt(result.userId) as any }, { 
        profileCompletionStatus: ProfileCompletionStatus.COMPLETE,
        profileCompletionPercentage: 100 
      });
      // also update the created institute user to ACTIVE
      await this.instituteUserRepo.update(
        { instituteId: link.instituteId, userId: String(result.userId) },
        { status: InstituteUserStatus.ACTIVE },
      );
    }

    await this.linkRepo.increment({ id: link.id }, 'registrationCount', 1);

    const response = {
      success: true,
      mode: 'created',
      message: link.autoVerify ? 'Registration successful.' : 'Registration submitted. Your enrollment is pending institute approval.',
      userId: result.userId,
      cardPendingScopes: (result as any).cardPendingScopes,
      autoVerify: link.autoVerify,
    };

    // Fire-and-forget WhatsApp notifications to student + parents.
    this.sendRegistrationWhatsApp({
      userId: String(result.userId),
      instituteId: link.instituteId,
      studentPhone: payload.phoneNumber,
      fatherPhone: (payload.father as any)?.phoneNumber,
      motherPhone: (payload.mother as any)?.phoneNumber,
      displayName: result.nameWithInitials || result.firstName || payload.firstName,
      mode: 'created',
      userIdByInstitute: (result as any).userIdByInstitute,
      assignedCards: (result as any).smartCards,
      autoVerify: link.autoVerify,
    }).catch(err => this.logger.warn(`WhatsApp reg notification failed: ${err.message}`));

    return response;
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
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Claim eligibility check runs INSIDE the transaction (H-3) so it can't race a
      // concurrent claim that would create a duplicate membership.
      await this.assertCanClaim(link, user.id, queryRunner.manager);

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
      setIfEmpty('fullName' as any, payload.fullName);
      setIfEmpty('religion' as any, payload.religion);
      setIfEmpty('birthCertificateNo' as any, payload.birthCertificateNo);
      setIfEmpty('dateOfBirth' as any, payload.dateOfBirth);
      setIfEmpty('gender' as any, payload.gender);
      setIfEmpty('nic' as any, payload.nic);
      if (Object.keys(patch).length) {
        patch.updatedAt = now();
        await queryRunner.manager.update(UserEntity, { id: user.id }, patch);
      }

      if (link.autoVerify) {
        user.profileCompletionStatus = ProfileCompletionStatus.COMPLETE;
        user.profileCompletionPercentage = 100;
        await queryRunner.manager.save(user);
      }

      // Create the institute membership in a pending state with the link's user type.
      // Persist any collected institute custom-column values onto the membership row.
      await queryRunner.manager.save(
        queryRunner.manager.create(InstituteUserEntity, {
          instituteId: link.instituteId,
          userId: String(user.id),
          instituteUserType: userType,
          status: link.autoVerify ? InstituteUserStatus.ACTIVE : InstituteUserStatus.PENDING,
          extraData: payload.extraData ?? undefined,
          createdAt: now(),
          updatedAt: now(),
        } as any),
      );

      // Ensure a students row exists when claiming as a STUDENT — without it the
      // assign-parent flow and the profile page parent fetch both silently fail.
      if (userType === InstituteUserType.STUDENT) {
        const existing = await queryRunner.manager.findOne(StudentEntity, { where: { userId: String(user.id) } });
        if (!existing) {
          await queryRunner.manager.save(
            queryRunner.manager.create(StudentEntity, {
              userId: String(user.id),
              isActive: true,
              createdAt: now(),
              updatedAt: now(),
            }),
          );
        }
      }

      // Class/subject enrollments (pending) — written in the SAME transaction (H-5) so a
      // failure rolls back the membership too, never leaving a half-written claim.
      if (userType === InstituteUserType.STUDENT && link.allowClassEnrollment && payload.classEnrollments?.length) {
        await this.enrollExistingPending(link, String(user.id), payload, queryRunner.manager);
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    await this.linkRepo.increment({ id: link.id }, 'registrationCount', 1);

    // Fire-and-forget WhatsApp notifications.
    this.sendRegistrationWhatsApp({
      userId: String(user.id),
      instituteId: link.instituteId,
      studentPhone: payload.phoneNumber ?? user.phoneNumber ?? undefined,
      fatherPhone: (payload.father as any)?.phoneNumber,
      motherPhone: (payload.mother as any)?.phoneNumber,
      displayName: user.nameWithInitials || user.firstName || payload.firstName,
      mode: 'claimed',
      autoVerify: link.autoVerify,
    }).catch(err => this.logger.warn(`WhatsApp reg notification failed: ${err.message}`));


    return {
      success: true,
      mode: 'claimed',
      message: link.autoVerify
        ? 'Your existing account has been successfully linked to this institute and approved.'
        : 'Your existing account has been submitted to join this institute. Pending admin approval.',
      userId: String(user.id),
      autoVerify: link.autoVerify,
    };
  }

  /**
   * Mock-user claim: student takes ownership of an admin-created hollow record.
   * - Finds the mock user by (instituteId + userIdByInstitute)
   * - Requires the card ID printed on the physical card as a second factor — the
   *   institute user ID alone (e.g. "RC0001") is small and sequential and can be
   *   enumerated, so it cannot serve as the sole identity proof.
   * - Fills in real profile data
   * - Sets isMock = false
   * - Upgrades the institute membership status to ACTIVE (already enrolled by admin)
   */
  private async claimMockUser(
    link: InstituteRegistrationLinkEntity,
    userType: InstituteUserType,
    payload: PublicRegistrationPayload,
  ): Promise<any> {
    const userIdByInstitute = payload.mockUserIdByInstitute!.trim();
    const claimCardId = payload.mockClaimCardId?.trim();
    if (!claimCardId) {
      throw new BadRequestException('The card ID printed on your physical card is required to claim this record.');
    }

    // Locate the institute membership for this ID
    const membership = await this.instituteUserRepo.findOne({
      where: { instituteId: link.instituteId, userIdByInstitute } as any,
    });
    if (!membership) {
      throw new BadRequestException('No student record found for this institute user ID.');
    }

    const user = await this.userRepo.findOne({ where: { id: membership.userId as any } });
    if (!user) {
      throw new NotFoundException('User record not found.');
    }
    if (!(user as any).isMock) {
      throw new BadRequestException('This student ID has already been claimed.');
    }
    // Second factor: the card ID must match what's on file for this record — a large,
    // random value only readable from the physical card, unlike the sequential
    // userIdByInstitute (prevents claiming arbitrary records via ID enumeration).
    if (!(user as any).cardId || (user as any).cardId !== claimCardId) {
      throw new BadRequestException('The card ID does not match this student record.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Fill in real profile data — only empty slots
      const patch: Record<string, any> = {};
      const setIfEmpty = (field: string, value: any) => {
        if (value !== undefined && value !== null && value !== '' && (user as any)[field] == null) {
          patch[field] = value;
        }
      };
      setIfEmpty('firstName', payload.firstName);
      setIfEmpty('lastName', payload.lastName);
      setIfEmpty('nameWithInitials', payload.nameWithInitials ||
        (payload.firstName && payload.lastName ? `${payload.firstName[0]}. ${payload.lastName}` : undefined));
      setIfEmpty('fullName', payload.fullName || (payload.firstName && payload.lastName ? `${payload.firstName} ${payload.lastName}` : undefined));
      setIfEmpty('religion', payload.religion);
      setIfEmpty('birthCertificateNo', payload.birthCertificateNo);
      setIfEmpty('email', payload.email?.toLowerCase());
      setIfEmpty('phoneNumber', payload.phoneNumber);
      setIfEmpty('gender', payload.gender);
      setIfEmpty('dateOfBirth', payload.dateOfBirth ? new Date(payload.dateOfBirth) : undefined);
      setIfEmpty('nic', payload.nic);
      setIfEmpty('addressLine1', payload.addressLine1);
      setIfEmpty('addressLine2', payload.addressLine2);
      setIfEmpty('city', payload.city);
      setIfEmpty('district', payload.district);
      setIfEmpty('province', payload.province);
      setIfEmpty('postalCode', payload.postalCode);

      // Mark as claimed
      patch.isMock = false;
      patch.updatedAt = now();

      await queryRunner.manager.update(UserEntity, { id: user.id }, patch);

      // Upgrade membership to ACTIVE (admin pre-enrolled them; self-reg just confirms identity)
      await queryRunner.manager.update(
        InstituteUserEntity,
        { instituteId: membership.instituteId, userId: membership.userId },
        { status: InstituteUserStatus.ACTIVE, updatedAt: now() },
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    await this.linkRepo.increment({ id: link.id }, 'registrationCount', 1);

    return {
      success: true,
      mode: 'claimed',
      message: 'Profile completed successfully. You are now enrolled.',
      userId: String(user.id),
      userIdByInstitute,
      autoVerify: true, // mock-user claim always activates membership immediately (see line above)
    };
  }

  /**
   * Pending class/subject enrollment for an already-existing user (claim path).
   * Runs on the caller's transaction manager (audit H-5) so a failure here rolls back
   * the membership row too — no half-written claim state.
   */
  private async enrollExistingPending(
    link: InstituteRegistrationLinkEntity,
    userId: string,
    payload: PublicRegistrationPayload,
    manager: EntityManager,
  ): Promise<void> {
    // We replicate the same pending rows createInstituteUser would write — directly here,
    // because the existing user already exists (we must not re-create the user record).
    for (const ce of payload.classEnrollments ?? []) {
      const cls = await manager.findOne(InstituteClassEntity, {
        where: { id: ce.classId, instituteId: link.instituteId } as any,
      });
      if (!cls) continue;

      const existingClass = await manager.findOne(InstituteClassStudentEntity, {
        where: { instituteId: link.instituteId, classId: ce.classId, studentUserId: userId },
      });
      if (!existingClass) {
        await manager.save(
          manager.create(InstituteClassStudentEntity, {
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
          const existingSub = await manager.findOne(InstituteClassSubjectStudent, {
            where: { instituteId: link.instituteId, classId: ce.classId, subjectId: se.subjectId, studentId: userId },
          });
          if (!existingSub) {
            await manager.save(
              manager.create(InstituteClassSubjectStudent, {
                instituteId: link.instituteId,
                classId: ce.classId,
                subjectId: se.subjectId,
                studentId: userId,
                isActive: true,
                enrollmentMethod: 'self_enrolled',
                verificationStatus: link.autoVerify ? 'verified' : 'pending',
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

  /**
   * Send WhatsApp registration success messages (fire-and-forget).
   * Sends to: student phone (if provided), father phone, mother phone — all independently.
   * Never throws — any per-number failure is logged and swallowed.
   */
  private async sendRegistrationWhatsApp(params: {
    userId: string;
    instituteId: string;
    studentPhone?: string;
    fatherPhone?: string;
    motherPhone?: string;
    displayName?: string;
    mode: 'created' | 'claimed';
    userIdByInstitute?: string;
    assignedCards?: Array<{ cardName: string; cardId: string; scope: string }>;
    autoVerify?: boolean;
  }): Promise<void> {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneId || !token) return; // WhatsApp not configured

    const institute = await this.instituteRepo.findOne({ where: { id: params.instituteId } });
    const instituteName = institute?.name ?? 'the institute';
    const name = params.displayName ?? 'Student';
    const userId = params.userId;

    const idLine = params.userIdByInstitute
      ? `සුරක්ෂා අංකය: *${userId}* | ආයතන අංකය: *${params.userIdByInstitute}*`
      : `ලියාපදිංචි අංකය: *${userId}*`;

    const cardLines = (params.assignedCards && params.assignedCards.length > 0)
      ? `\n💳 *ස්මාර්ට් කාඩ්:* ${params.assignedCards.map(c => `${c.cardName} (${c.cardId})`).join(', ')}`
      : '';

    const statusLineStudent = params.autoVerify 
      ? `තත්ත්වය: ✅ *අනුමතයි* / Approved\n\n`
      : (params.mode === 'claimed' 
          ? `තත්ත්වය: ⏳ *අනුමත කිරීම බලාපොරොත්තු වෙමින්* / Pending Verification\n\n`
          : `තත්ත්වය: ⏳ *ආයතන අනුමතිය බලාපොරොත්තු වෙමින්* / Pending Institute Approval\n\n`);

    const studentMsg =
      params.mode === 'claimed'
        ? `🎓 *සුරක්ෂා LMS - ලියාපදිංචිය* / *Registration Confirmed*\n\n` +
          `ආයුබෝවන් ${name}!\n` +
          `ඔබගේ ගිණුම *${instituteName}* ආයතනයට සම්බන්ධ කර ඇත.\n` +
          `${idLine}${cardLines}\n` +
          statusLineStudent +
          `ශිෂ්‍ය අනුමතිය ලැබෙන විට ඔබට දැනුම් දෙනු ලැබේ.\n` +
          `_Powered by Suraksha LMS_`
        : `🎓 *සුරක්ෂා LMS - ලියාපදිංචිය* / *Registration Successful*\n\n` +
          `ආයුබෝවන් ${name}!\n` +
          `ඔබ *${instituteName}* ආයතනයට සාර්ථකව ලියාපදිංචි වී ඇත.\n` +
          `${idLine}${cardLines}\n` +
          statusLineStudent +
          (params.autoVerify ? `` : `ඔබගේ ලියාපදිංචිය සමාලෝචනය කර ඉක්මනින් ක්‍රියාත්මක කරනු ලැබේ.\n`) +
          `_Powered by Suraksha LMS_`;

    const statusLineParent = params.autoVerify 
      ? `තත්ත්වය: ✅ *අනුමතයි* / Approved\n\n`
      : `තත්ත්වය: ⏳ *ආයතන අනුමතිය බලාපොරොත්තු* / Pending Approval\n\n`;

    const parentMsg = (relation: 'පියා' | 'මව') =>
      `🎓 *සුරක්ෂා LMS - දරු ලියාපදිංචිය* / *Child Registration*\n\n` +
      `${relation} ට දැනුම් දීම:\n` +
      `ඔබේ දරු/දරිය *${name}* *${instituteName}* ආයතනයට ලියාපදිංචි කර ඇත.\n` +
      `${idLine}${cardLines}\n` +
      statusLineParent +
      `_Powered by Suraksha LMS_`;

    const sendOne = async (phone: string, message: string) => {
      try {
        const normalized = phone.replace(/^\+/, '');
        await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: normalized,
            type: 'text',
            text: { body: message },
          }),
        });
      } catch (err: any) {
        this.logger.warn(`WhatsApp send to ${phone} failed: ${err.message}`);
      }
    };

    const sends: Promise<void>[] = [];
    if (params.studentPhone) sends.push(sendOne(params.studentPhone, studentMsg));
    if (params.fatherPhone) sends.push(sendOne(params.fatherPhone, parentMsg('පියා')));
    if (params.motherPhone) sends.push(sendOne(params.motherPhone, parentMsg('මව')));
    await Promise.allSettled(sends);
  }

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
  private async assertCanClaim(
    link: InstituteRegistrationLinkEntity,
    userId: string | number,
    manager: EntityManager,
  ): Promise<void> {
    // Run inside the claim transaction (audit H-3) so the membership check and the
    // subsequent membership insert cannot interleave with a concurrent claim.
    const memberships = await manager.find(InstituteUserEntity, {
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
    institute?: InstituteEntity,
  ): CreateInstituteUserDto {
    const dto: any = {
      instituteUserType: userType,
      firstName: payload.firstName,
      lastName: payload.lastName,
      nameWithInitials: payload.nameWithInitials,
      fullName: payload.fullName,
      religion: payload.religion,
      birthCertificateNo: payload.birthCertificateNo,
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
      password: payload.password || undefined,
      institutePassword: (payload.password && (institute?.customLoginEnabled || !!(institute?.subdomain || institute?.customDomain))) ? payload.password : undefined,
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
