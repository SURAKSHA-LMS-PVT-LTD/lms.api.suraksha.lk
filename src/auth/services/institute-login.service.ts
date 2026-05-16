import { Injectable, Logger, UnauthorizedException, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { InstituteUserEntity } from '../../modules/institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteEntity } from '../../modules/institute/entities/institute.entity';
import { UserEntity } from '../../modules/user/entities/user.entity';
import { StudentEntity } from '../../modules/student/entities/student.entity';
import { ParentEntity } from '../../modules/parent/entities/parent.entity';
import { UserOtpEntity, OtpType, OtpPurpose } from '../../modules/user/entities/user-otp.entity';
import { InstituteUserStatus } from '../../modules/institute_mudules/institue_user/enums/institute-user-status.enum';
import { InstituteUserType } from '../../modules/institute_mudules/institue_user/enums/institute-user-type.enum';
import { AuthService } from '../auth.service';
import { EnhancedEmailService } from '../../common/services/enhanced-email.service';
import { SmslenzProvider } from '../../modules/sms/providers/smslenz.provider';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { normalizeSriLankanPhone } from '../../common/utils/phone-normalizer.util';
import { now } from '../../common/utils/timezone.util';
import {
  InstituteLoginDto,
  InstituteSetPasswordDto,
  InstituteChangePasswordDto,
  InstitutePasswordResetInitiateDto,
  InstitutePasswordResetVerifyDto,
  InstitutePasswordResetChannel,
  GetAvailableContactsDto,
  SelfActivateRequestOtpDto,
  SelfActivateVerifyDto,
} from '../dto/institute-login.dto';
import {
  InstituteSessionService,
  ActiveSessionDto,
} from './institute-session.service';
import { InstituteSessionLoginMethod } from '../entities/institute-login-session.entity';

const OTP_EXPIRY_MINUTES = 30;
const MAX_OTP_REQUESTS_PER_DAY = 5;

@Injectable()
export class InstituteLoginService {
  private readonly logger = new Logger(InstituteLoginService.name);

  constructor(
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    @InjectRepository(UserOtpEntity)
    private readonly otpRepository: Repository<UserOtpEntity>,
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly enhancedEmailService: EnhancedEmailService,
    private readonly smslenzProvider: SmslenzProvider,
    private readonly cloudStorageService: CloudStorageService,
    private readonly instituteSessionService: InstituteSessionService,
  ) {}

  /**
   * Institute-level login using userIdByInstitute + password.
   * Does NOT join with the main users table for authentication — only uses institute_user.
   */
  async login(dto: InstituteLoginDto, options?: {
    ipAddress?: string;
    userAgent?: string;
    /** Resolved host (subdomain.suraksha.lk or customdomain.com) — null for main domain */
    scopeHost?: string | null;
    loginMethod?: InstituteSessionLoginMethod;
  }): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    user: {
      userId: string;
      instituteId: string;
      userIdByInstitute: string;
      instituteUserType: InstituteUserType;
      instituteName: string;
      firstName?: string;
      lastName?: string;
      imageUrl?: string | null;
    };
  }> {
    // 1. Find institute user by (instituteId, userIdByInstitute)
    const instituteUser = await this.instituteUserRepository
      .createQueryBuilder('iu')
      .addSelect('iu.institutePassword') // institute_password is select:false
      .leftJoinAndSelect('iu.institute', 'inst')
      .where('iu.instituteId = :instituteId', { instituteId: dto.instituteId })
      .andWhere('iu.userIdByInstitute = :userIdByInstitute', { userIdByInstitute: dto.userIdByInstitute })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .getOne();

    if (!instituteUser) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Check that institute password is set
    if (!instituteUser.institutePassword) {
      throw new UnauthorizedException({
        message: 'You have not set an institute password yet. Please log in to the main SurakshLMS app and activate your institute access from Profile → Security.',
        errorCode: 'INSTITUTE_PASSWORD_NOT_SET',
      });
    }

    // 3. Verify password using same bcrypt+pepper approach
    const isValid = await this.authService.comparePassword(dto.password, instituteUser.institutePassword);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 4. Get basic user info for the response (minimal DB read)
    const user = await this.userRepository.findOne({
      where: { id: instituteUser.userId },
      select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'imageUrl', 'email', 'userType'],
    });

    // ── 4b. Pre-check: fast path for strict mode ───────────────────────────
    // For STRICT mode we check BEFORE creating the session so we don't create
    // a token that would be immediately invalidated.
    // For RELAXED mode we create first then kick excess — this is intentional
    // because we want the new session to exist before kicking the old one
    // (avoids a window where the user has 0 sessions).
    // Race condition note: both modes do a post-create re-verify to handle
    // simultaneous logins from the same account.
    const preCheck = await this.instituteSessionService.checkSessionLimit(
      instituteUser.instituteId,
      instituteUser.userId,
    );

    if (!preCheck.allowed && preCheck.isStrict) {
      throw new ForbiddenException({
        errorCode: 'DEVICE_LIMIT_REACHED',
        message: `You have reached the maximum number of active sessions (${preCheck.maxDevices}). Please contact your institute administrator to sign out an existing device before logging in again.`,
        activeCount: preCheck.activeCount,
        maxDevices: preCheck.maxDevices,
        activeSessions: preCheck.activeSessions,
      });
    }
    // ── End pre-check ──────────────────────────────────────────────────────

    // 5. Build JWT payload (institute-context aware)
    const payload = {
      sub: instituteUser.userId,
      instituteId: instituteUser.instituteId,
      instituteUserType: instituteUser.instituteUserType,
      userIdByInstitute: instituteUser.userIdByInstitute,
      loginType: 'institute',
      scopeHost: options?.scopeHost ?? null,
    };

    const access_token = await this.jwtService.signAsync(payload);

    // 6. Generate refresh token
    const rememberMe = dto.rememberMe || false;
    const refresh_token = await this.authService.generateRefreshToken(
      instituteUser.userId,
      undefined,
      undefined,
      rememberMe,
    );

    const jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '1h';
    const expires_in = this.parseExpiryToSeconds(jwtExpiresIn);
    const refresh_expires_in = rememberMe ? 30 * 86400 : 7 * 86400;

    // 7. Persist session record
    const newSession = await this.instituteSessionService.createSession({
      instituteId: instituteUser.instituteId,
      userId: instituteUser.userId,
      userIdByInstitute: instituteUser.userIdByInstitute,
      refreshToken: refresh_token,
      loginMethod: options?.loginMethod ?? InstituteSessionLoginMethod.MAIN,
      scopeHost: options?.scopeHost ?? null,
      ipAddress: options?.ipAddress ?? null,
      userAgent: options?.userAgent ?? null,
      refreshExpiresInSeconds: refresh_expires_in,
    });

    // ── 7b. Post-create enforcement (handles race conditions) ──────────────
    // Re-check AFTER inserting our new session. This catches simultaneous
    // logins that both passed the pre-check.
    const postCheck = await this.instituteSessionService.checkSessionLimit(
      instituteUser.instituteId,
      instituteUser.userId,
    );

    if (!postCheck.allowed) {
      if (postCheck.isStrict) {
        // Strict: revoke the session we just created and reject.
        await this.instituteSessionService.deactivateSession(
          newSession.id,
          { requestingUserId: instituteUser.userId, requestingInstituteId: instituteUser.instituteId, isAdmin: true },
          'CONCURRENT_LOGIN_REJECTED',
        );
        throw new ForbiddenException({
          errorCode: 'DEVICE_LIMIT_REACHED',
          message: `You have reached the maximum number of active sessions (${postCheck.maxDevices}). Please contact your institute administrator to sign out an existing device before logging in again.`,
          activeCount: postCheck.maxDevices,
          maxDevices: postCheck.maxDevices,
          activeSessions: postCheck.activeSessions,
        });
      } else {
        // Relaxed: kick oldest sessions to bring count back to limit.
        // Our newly created session has the latest lastActiveAt so it survives.
        const toKick = Math.max(1, postCheck.activeCount - postCheck.maxDevices);
        await this.instituteSessionService.deactivateOldestSessions(
          instituteUser.instituteId,
          instituteUser.userId,
          toKick,
        );
        this.logger.log(
          `🔄 Relaxed session limit: kicked ${toKick} oldest session(s) for user=${instituteUser.userId}`,
        );
      }
    }
    // ── End enforcement ────────────────────────────────────────────────────

    this.logger.log(`✅ Institute login successful: user=${instituteUser.userId}, institute=${instituteUser.instituteId}, scope=${options?.scopeHost ?? 'main'}`);

    return {
      access_token,
      refresh_token,
      expires_in,
      refresh_expires_in,
      user: {
        userId: instituteUser.userId,
        instituteId: instituteUser.instituteId,
        userIdByInstitute: instituteUser.userIdByInstitute,
        instituteUserType: instituteUser.instituteUserType,
        instituteName: instituteUser.institute?.name || 'Unknown Institute',
        firstName: user?.firstName,
        lastName: user?.lastName,
        imageUrl: user?.imageUrl ? this.cloudStorageService.getFullUrl(user.imageUrl) : null,
      },
    };
  }

  /**
   * Set institute password for a user (by admin or during first setup).
   * Requires the caller to be authenticated (JWT) and have INSTITUTE_ADMIN/SUPERADMIN role.
   */
  async setPassword(dto: InstituteSetPasswordDto, targetUserId: string): Promise<{ message: string }> {
    const instituteUser = await this.instituteUserRepository.findOne({
      where: { instituteId: dto.instituteId, userId: targetUserId },
    });

    if (!instituteUser) {
      throw new NotFoundException('Institute user not found');
    }

    const hashedPassword = await this.authService.hashPassword(dto.newPassword);
    const timestamp = now();

    await this.instituteUserRepository.update(
      { instituteId: dto.instituteId, userId: targetUserId },
      { institutePassword: hashedPassword, institutePasswordSetAt: timestamp, updatedAt: timestamp },
    );

    this.logger.log(`✅ Institute password set for user=${targetUserId}, institute=${dto.instituteId}`);
    return { message: 'Institute password set successfully' };
  }

  /**
   * Change own institute password (requires current password).
   */
  async changePassword(dto: InstituteChangePasswordDto, currentUserId: string): Promise<{ message: string }> {
    // Fetch with password column
    const instituteUser = await this.instituteUserRepository
      .createQueryBuilder('iu')
      .addSelect('iu.institutePassword')
      .where('iu.instituteId = :instituteId', { instituteId: dto.instituteId })
      .andWhere('iu.userId = :userId', { userId: currentUserId })
      .getOne();

    if (!instituteUser) {
      throw new NotFoundException('Institute user not found');
    }

    if (!instituteUser.institutePassword) {
      throw new BadRequestException('No institute password set. Please contact your administrator to set one first.');
    }

    // Verify current password
    const isValid = await this.authService.comparePassword(dto.currentPassword, instituteUser.institutePassword);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash and save new password
    const hashedPassword = await this.authService.hashPassword(dto.newPassword);
    const timestamp = now();

    await this.instituteUserRepository.update(
      { instituteId: dto.instituteId, userId: currentUserId },
      { institutePassword: hashedPassword, institutePasswordSetAt: timestamp, updatedAt: timestamp },
    );

    this.logger.log(`✅ Institute password changed for user=${currentUserId}, institute=${dto.instituteId}`);
    return { message: 'Institute password changed successfully' };
  }

  /**
   * Initiate password reset via OTP.
   * Prefers selectedContactId (from available-contacts endpoint), falls back to legacy channel+useParentContact.
   */
  async initiatePasswordReset(dto: InstitutePasswordResetInitiateDto, ipAddress?: string): Promise<{
    message: string;
    sentTo: string;
    channel: InstitutePasswordResetChannel;
    isParentContact: boolean;
  }> {
    // 1. Find the institute user
    const instituteUser = await this.instituteUserRepository.findOne({
      where: {
        instituteId: dto.instituteId,
        userIdByInstitute: dto.userIdByInstitute,
        status: InstituteUserStatus.ACTIVE,
      },
    });

    if (!instituteUser) {
      throw new BadRequestException('If the account exists, an OTP will be sent to the registered contact');
    }

    let contactValue: string;
    let contactType: OtpType;
    let isParentContact: boolean;

    if (dto.selectedContactId) {
      // New flow: use selectedContactId
      const resolved = await this.resolveContactInfo(
        instituteUser.userId,
        instituteUser.instituteUserType,
        dto.selectedContactId,
      );
      contactValue = resolved.contactValue;
      contactType = resolved.contactType;
      isParentContact = resolved.isParentContact;
    } else {
      // Legacy flow: channel + useParentContact
      const user = await this.userRepository.findOne({
        where: { id: instituteUser.userId },
        select: ['id', 'email', 'phoneNumber'],
      });
      if (!user) throw new BadRequestException('If the account exists, an OTP will be sent to the registered contact');

      let contactEmail: string | null = user.email || null;
      let contactPhone: string | null = user.phoneNumber || null;
      isParentContact = false;

      if (
        instituteUser.instituteUserType === InstituteUserType.STUDENT &&
        (dto.useParentContact ||
          (dto.channel === InstitutePasswordResetChannel.EMAIL && !contactEmail) ||
          (dto.channel === InstitutePasswordResetChannel.PHONE && !contactPhone))
      ) {
        const student = await this.studentRepository.findOne({ where: { userId: instituteUser.userId } });
        if (student) {
          const parentIds = [student.fatherId, student.motherId, student.guardianId].filter(Boolean);
          if (parentIds.length > 0) {
            const parents = await this.parentRepository.find({ where: { userId: In(parentIds) }, relations: ['user'] });
            for (const parent of parents) {
              if (parent?.user) {
                if (dto.channel === InstitutePasswordResetChannel.EMAIL && parent.user.email) {
                  contactEmail = parent.user.email;
                  isParentContact = true;
                  break;
                }
                if (dto.channel === InstitutePasswordResetChannel.PHONE && parent.user.phoneNumber) {
                  contactPhone = parent.user.phoneNumber;
                  isParentContact = true;
                  break;
                }
              }
            }
          }
        }
      }

      const resolvedChannel = dto.channel || InstitutePasswordResetChannel.PHONE;
      if (resolvedChannel === InstitutePasswordResetChannel.EMAIL && !contactEmail) {
        throw new BadRequestException('No email available. Please use the contact selection flow.');
      }
      if (resolvedChannel === InstitutePasswordResetChannel.PHONE && !contactPhone) {
        throw new BadRequestException('No phone available. Please use the contact selection flow.');
      }
      contactValue = resolvedChannel === InstitutePasswordResetChannel.EMAIL ? contactEmail! : contactPhone!;
      contactType = resolvedChannel === InstitutePasswordResetChannel.EMAIL ? OtpType.EMAIL : OtpType.PHONE;
    }

    // Rate limiting
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCount = await this.otpRepository.count({
      where: { userId: instituteUser.userId, otpPurpose: OtpPurpose.INSTITUTE_PASSWORD_RESET, createdDate: todayStr },
    });
    if (todayCount >= MAX_OTP_REQUESTS_PER_DAY) {
      throw new BadRequestException('Maximum OTP requests reached for today. Try again tomorrow.');
    }

    // Invalidate old OTPs
    await this.otpRepository.update(
      { userId: instituteUser.userId, otpPurpose: OtpPurpose.INSTITUTE_PASSWORD_RESET, isVerified: false },
      { isVerified: true },
    );

    // Generate OTP
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.otpRepository.save(
      this.otpRepository.create({
        userId: instituteUser.userId,
        email: contactType === OtpType.EMAIL ? contactValue : undefined,
        phoneNumber: contactType === OtpType.PHONE ? contactValue : undefined,
        otpCode,
        otpType: contactType,
        otpPurpose: OtpPurpose.INSTITUTE_PASSWORD_RESET,
        expiresAt,
        createdAt: now(),
        createdDate: todayStr,
        ipAddress: ipAddress || null,
      }),
    );

    // Send OTP
    let sentTo: string;
    if (contactType === OtpType.EMAIL) {
      const user = await this.userRepository.findOne({
        where: { id: instituteUser.userId },
        select: ['firstName', 'lastName'],
      });
      await this.enhancedEmailService.sendOTP({
        email: contactValue,
        otp: otpCode,
        userName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'User',
        expiryMinutes: String(OTP_EXPIRY_MINUTES),
        requestType: 'Institute Password Reset',
        ipAddress,
      });
      const [local, domain] = contactValue.split('@');
      sentTo = `${local[0]}***@${domain}`;
    } else {
      const normalized = normalizeSriLankanPhone(contactValue) || contactValue;
      await this.smslenzProvider.sendSms({
        senderId: 'Suraksha',
        contact: normalized,
        message: `Your institute password reset code is: ${otpCode}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`,
      });
      sentTo = this.maskPhone(normalized);
    }

    this.logger.log(`✅ Institute password reset OTP sent: user=${instituteUser.userId}, channel=${contactType}, isParent=${isParentContact}`);

    return {
      message: 'OTP sent successfully',
      sentTo,
      channel: contactType === OtpType.EMAIL ? InstitutePasswordResetChannel.EMAIL : InstitutePasswordResetChannel.PHONE,
      isParentContact,
    };
  }

  /**
   * Verify OTP and set new institute password.
   */
  async verifyAndResetPassword(dto: InstitutePasswordResetVerifyDto): Promise<{ message: string }> {
    // 1. Find institute user
    const instituteUser = await this.instituteUserRepository.findOne({
      where: {
        instituteId: dto.instituteId,
        userIdByInstitute: dto.userIdByInstitute,
        status: InstituteUserStatus.ACTIVE,
      },
    });

    if (!instituteUser) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Find the OTP record
    const otpRecord = await this.otpRepository.findOne({
      where: {
        userId: instituteUser.userId,
        otpPurpose: OtpPurpose.INSTITUTE_PASSWORD_RESET,
        isVerified: false,
      },
      order: { createdAt: 'DESC' },
    });

    if (!otpRecord) {
      throw new BadRequestException('No pending OTP found. Please request a new one.');
    }

    // 3. Check expiry
    if (new Date() > otpRecord.expiresAt) {
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    // 4. Check attempts (max 5)
    if (otpRecord.attempts >= 5) {
      throw new BadRequestException('Too many failed attempts. Please request a new OTP.');
    }

    // 5. Verify OTP code
    if (otpRecord.otpCode !== dto.otpCode) {
      // Increment attempts
      await this.otpRepository.update(otpRecord.id, { attempts: otpRecord.attempts + 1 });
      throw new UnauthorizedException('Invalid OTP code');
    }

    // 6. Mark OTP as verified
    await this.otpRepository.update(otpRecord.id, {
      isVerified: true,
      verifiedAt: now(),
    });

    // 7. Hash and set new password
    const hashedPassword = await this.authService.hashPassword(dto.newPassword);
    const timestamp = now();

    await this.instituteUserRepository.update(
      { instituteId: dto.instituteId, userId: instituteUser.userId },
      { institutePassword: hashedPassword, institutePasswordSetAt: timestamp, updatedAt: timestamp },
    );

    this.logger.log(`✅ Institute password reset completed: user=${instituteUser.userId}, institute=${dto.instituteId}`);
    return { message: 'Password reset successfully' };
  }

  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 3600;
    const value = parseInt(match[1], 10);
    switch (match[2]) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 3600;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private maskPhone(phone: string): string {
    // Show only last 2 digits: e.g. "+94771234528" → "****28"
    if (!phone || phone.length < 2) return '****';
    return `****${phone.slice(-2)}`;
  }

  private maskEmail(email: string): string {
    const atIdx = email.indexOf('@');
    if (atIdx < 0) return '***@***.***';
    return `${email.charAt(0) || '*'}***@${email.slice(atIdx + 1)}`;
  }

  /**
   * Resolve a selectedContactId to actual contact value and type.
   * contactId values: 'own_email', 'own_phone', 'father_phone', 'mother_phone', 'guardian_phone'
   */
  private async resolveContactInfo(
    userId: string,
    userType: InstituteUserType,
    selectedContactId: string,
  ): Promise<{ contactValue: string; contactType: OtpType; isParentContact: boolean }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'phoneNumber'],
    });

    if (selectedContactId === 'own_email') {
      if (!user?.email) throw new BadRequestException('No email address registered for this account.');
      return { contactValue: user.email, contactType: OtpType.EMAIL, isParentContact: false };
    }

    if (selectedContactId === 'own_phone') {
      if (!user?.phoneNumber) throw new BadRequestException('No phone number registered for this account.');
      return { contactValue: user.phoneNumber, contactType: OtpType.PHONE, isParentContact: false };
    }

    // Parent contacts (students only)
    if (['father_phone', 'mother_phone', 'guardian_phone'].includes(selectedContactId)) {
      if (userType !== InstituteUserType.STUDENT) {
        throw new BadRequestException('Parent contact is only available for students.');
      }
      const student = await this.studentRepository.findOne({ where: { userId } });
      if (!student) throw new BadRequestException('Student record not found.');

      const parentId =
        selectedContactId === 'father_phone' ? student.fatherId
          : selectedContactId === 'mother_phone' ? student.motherId
            : student.guardianId;

      if (!parentId) throw new BadRequestException('Selected parent/guardian not linked.');

      const parent = await this.parentRepository.findOne({ where: { userId: parentId }, relations: ['user'] });
      if (!parent?.user?.phoneNumber) throw new BadRequestException('Parent phone number not available.');

      return { contactValue: parent.user.phoneNumber, contactType: OtpType.PHONE, isParentContact: true };
    }

    throw new BadRequestException('Invalid contact selection.');
  }

  /**
   * Build a list of masked available contacts for a user (own + parent phones/emails).
   */
  private async buildContactList(
    userId: string,
    userType: InstituteUserType,
  ): Promise<{ id: string; label: string; masked: string; type: 'EMAIL' | 'PHONE' }[]> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'phoneNumber'],
    });

    const contacts: { id: string; label: string; masked: string; type: 'EMAIL' | 'PHONE' }[] = [];

    if (user?.email) {
      contacts.push({ id: 'own_email', label: 'Your registered email', masked: this.maskEmail(user.email), type: 'EMAIL' });
    }
    if (user?.phoneNumber) {
      contacts.push({ id: 'own_phone', label: 'Your registered phone', masked: this.maskPhone(user.phoneNumber), type: 'PHONE' });
    }

    if (userType === InstituteUserType.STUDENT) {
      const student = await this.studentRepository.findOne({ where: { userId } });
      if (student) {
        const parentEntries = [
          { id: 'father_phone', parentId: student.fatherId, label: "Father's phone" },
          { id: 'mother_phone', parentId: student.motherId, label: "Mother's phone" },
          { id: 'guardian_phone', parentId: student.guardianId, label: "Guardian's phone" },
        ];
        const parentIds = parentEntries.map(e => e.parentId).filter(Boolean);
        if (parentIds.length > 0) {
          const parents = await this.parentRepository.find({ where: { userId: In(parentIds) }, relations: ['user'] });
          const parentMap = new Map(parents.map(p => [p.userId, p]));
          for (const entry of parentEntries) {
            if (!entry.parentId) continue;
            const parent = parentMap.get(entry.parentId);
            if (parent?.user?.phoneNumber) {
              const masked = this.maskPhone(parent.user.phoneNumber);
              if (!contacts.some(c => c.id === entry.id)) {
                contacts.push({ id: entry.id, label: entry.label, masked, type: 'PHONE' });
              }
            }
          }
        }
      }
    }

    return contacts;
  }

  // ── Public new methods ─────────────────────────────────────────────────────

  /**
   * Returns masked contact options (own phone/email + parent phones for students).
   * Public endpoint — no auth required. Only returns last 2 digits of phone numbers.
   */
  async getAvailableContacts(dto: GetAvailableContactsDto): Promise<{
    contacts: { id: string; label: string; masked: string; type: 'EMAIL' | 'PHONE' }[];
  }> {
    const instituteUser = await this.instituteUserRepository.findOne({
      where: { instituteId: dto.instituteId, userIdByInstitute: dto.userIdByInstitute, status: InstituteUserStatus.ACTIVE },
    });
    if (!instituteUser) throw new NotFoundException('Institute user not found.');

    const contacts = await this.buildContactList(instituteUser.userId, instituteUser.instituteUserType);
    return { contacts };
  }

  /**
   * Get institute profile info for the currently authenticated user (main JWT).
   * Used in the self-activate flow.
   */
  async getMyInstituteProfile(currentUserId: string, instituteId: string): Promise<{
    hasPassword: boolean;
    extraData: Record<string, any> | null;
    instituteUserType: string;
    status: string;
    userIdByInstitute: string | null;
    institutePasswordSetAt: Date | null;
  }> {
    const instituteUser = await this.instituteUserRepository
      .createQueryBuilder('iu')
      .addSelect('iu.institutePassword')
      .where('iu.userId = :userId', { userId: currentUserId })
      .andWhere('iu.instituteId = :instituteId', { instituteId })
      .getOne();

    if (!instituteUser) throw new NotFoundException('Institute profile not found.');

    return {
      hasPassword: !!instituteUser.institutePassword,
      extraData: instituteUser.extraData || null,
      instituteUserType: instituteUser.instituteUserType,
      status: instituteUser.status,
      userIdByInstitute: instituteUser.userIdByInstitute || null,
      institutePasswordSetAt: instituteUser.institutePasswordSetAt || null,
    };
  }

  /**
   * Returns masked contacts for the currently authenticated user (main JWT) for a given institute.
   * Used in the self-activate in-app flow.
   */
  async getMyAvailableContacts(currentUserId: string, instituteId: string): Promise<{
    contacts: { id: string; label: string; masked: string; type: 'EMAIL' | 'PHONE' }[];
  }> {
    const instituteUser = await this.instituteUserRepository.findOne({
      where: { userId: currentUserId, instituteId, status: InstituteUserStatus.ACTIVE },
    });
    if (!instituteUser) throw new NotFoundException('Institute profile not found.');

    const contacts = await this.buildContactList(currentUserId, instituteUser.instituteUserType);
    return { contacts };
  }

  /**
   * Request OTP for self-activation (in-app, authenticated via main JWT).
   * Only works if institute password is not yet set.
   */
  async selfActivateRequestOtp(
    currentUserId: string,
    dto: SelfActivateRequestOtpDto,
    ipAddress?: string,
  ): Promise<{ message: string; sentTo: string; type: 'EMAIL' | 'PHONE' }> {
    const instituteUser = await this.instituteUserRepository
      .createQueryBuilder('iu')
      .addSelect('iu.institutePassword')
      .where('iu.userId = :userId', { userId: currentUserId })
      .andWhere('iu.instituteId = :instituteId', { instituteId: dto.instituteId })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .getOne();

    if (!instituteUser) throw new NotFoundException('Institute profile not found.');
    if (instituteUser.institutePassword) {
      throw new BadRequestException('Institute password already set. Use change-password to update it.');
    }

    const { contactValue, contactType, isParentContact } = await this.resolveContactInfo(
      currentUserId,
      instituteUser.instituteUserType,
      dto.selectedContactId,
    );

    const todayStr = new Date().toISOString().split('T')[0];
    const todayCount = await this.otpRepository.count({
      where: { userId: currentUserId, otpPurpose: OtpPurpose.INSTITUTE_ACTIVATION, createdDate: todayStr },
    });
    if (todayCount >= MAX_OTP_REQUESTS_PER_DAY) {
      throw new BadRequestException('Maximum OTP requests reached for today.');
    }

    await this.otpRepository.update(
      { userId: currentUserId, otpPurpose: OtpPurpose.INSTITUTE_ACTIVATION, isVerified: false },
      { isVerified: true },
    );

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.otpRepository.save(
      this.otpRepository.create({
        userId: currentUserId,
        email: contactType === OtpType.EMAIL ? contactValue : undefined,
        phoneNumber: contactType === OtpType.PHONE ? contactValue : undefined,
        otpCode,
        otpType: contactType,
        otpPurpose: OtpPurpose.INSTITUTE_ACTIVATION,
        expiresAt,
        createdAt: now(),
        createdDate: todayStr,
        ipAddress: ipAddress || null,
      }),
    );

    let sentTo: string;
    if (contactType === OtpType.EMAIL) {
      const user = await this.userRepository.findOne({ where: { id: currentUserId }, select: ['firstName', 'lastName'] });
      await this.enhancedEmailService.sendOTP({
        email: contactValue,
        otp: otpCode,
        userName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'User',
        expiryMinutes: String(OTP_EXPIRY_MINUTES),
        requestType: 'Institute Profile Activation',
        ipAddress,
      });
      sentTo = this.maskEmail(contactValue);
    } else {
      const normalized = normalizeSriLankanPhone(contactValue) || contactValue;
      await this.smslenzProvider.sendSms({
        senderId: 'Suraksha',
        contact: normalized,
        message: `Your institute profile activation code is: ${otpCode}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share.`,
      });
      sentTo = this.maskPhone(normalized);
    }

    this.logger.log(`✅ Institute activation OTP sent: user=${currentUserId}, institute=${dto.instituteId}, isParent=${isParentContact}`);
    return { message: 'OTP sent successfully', sentTo, type: contactType === OtpType.EMAIL ? 'EMAIL' : 'PHONE' };
  }

  /**
   * Verify activation OTP and set institute password (first time only).
   * Optionally fills empty extraData fields.
   */
  async selfActivateVerifyAndSetPassword(
    currentUserId: string,
    dto: SelfActivateVerifyDto,
  ): Promise<{ message: string }> {
    const instituteUser = await this.instituteUserRepository
      .createQueryBuilder('iu')
      .addSelect('iu.institutePassword')
      .where('iu.userId = :userId', { userId: currentUserId })
      .andWhere('iu.instituteId = :instituteId', { instituteId: dto.instituteId })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .getOne();

    if (!instituteUser) throw new NotFoundException('Institute profile not found.');
    if (instituteUser.institutePassword) {
      throw new BadRequestException('Institute password already set. Use change-password to update it.');
    }

    const otpRecord = await this.otpRepository.findOne({
      where: { userId: currentUserId, otpPurpose: OtpPurpose.INSTITUTE_ACTIVATION, isVerified: false },
      order: { createdAt: 'DESC' },
    });

    if (!otpRecord) throw new BadRequestException('No pending OTP found. Please request a new one.');
    if (new Date() > otpRecord.expiresAt) throw new BadRequestException('OTP has expired. Please request a new one.');
    if (otpRecord.attempts >= 5) throw new BadRequestException('Too many failed attempts. Please request a new OTP.');
    if (otpRecord.otpCode !== dto.otpCode) {
      await this.otpRepository.update(otpRecord.id, { attempts: otpRecord.attempts + 1 });
      throw new UnauthorizedException('Invalid OTP code.');
    }

    await this.otpRepository.update(otpRecord.id, { isVerified: true, verifiedAt: now() });

    const hashedPassword = await this.authService.hashPassword(dto.newPassword);
    const timestamp = now();

    const updateData: Record<string, any> = {
      institutePassword: hashedPassword,
      institutePasswordSetAt: timestamp,
      updatedAt: timestamp,
    };

    // Merge provided extraData into empty fields only (cannot overwrite existing values)
    if (dto.extraData && Object.keys(dto.extraData).length > 0) {
      const current = instituteUser.extraData || {};
      const merged = { ...current };
      for (const [key, value] of Object.entries(dto.extraData)) {
        if (!(key in merged) || merged[key] === null || merged[key] === '') {
          merged[key] = value;
        }
      }
      updateData.extraData = merged;
    }

    await this.instituteUserRepository.update(
      { userId: currentUserId, instituteId: dto.instituteId },
      updateData,
    );

    this.logger.log(`✅ Institute activation complete: user=${currentUserId}, institute=${dto.instituteId}`);
    return { message: 'Institute password set successfully. You can now login with your institute credentials.' };
  }
}
