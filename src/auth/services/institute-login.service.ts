import { Injectable, Logger, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
} from '../dto/institute-login.dto';

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
  ) {}

  /**
   * Institute-level login using userIdByInstitute + password.
   * Does NOT join with the main users table for authentication — only uses institute_user.
   */
  async login(dto: InstituteLoginDto): Promise<{
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
      throw new UnauthorizedException('Institute password not set. Please contact your institute administrator.');
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

    // 5. Build JWT payload (institute-context aware)
    const payload = {
      sub: instituteUser.userId,
      instituteId: instituteUser.instituteId,
      instituteUserType: instituteUser.instituteUserType,
      userIdByInstitute: instituteUser.userIdByInstitute,
      loginType: 'institute',
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

    this.logger.log(`✅ Institute login successful: user=${instituteUser.userId}, institute=${instituteUser.instituteId}`);

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
   * Sends OTP to user's email/phone, or falls back to parent's contact for students.
   */
  async initiatePasswordReset(dto: InstitutePasswordResetInitiateDto, ipAddress?: string): Promise<{
    message: string;
    sentTo: string; // Masked email/phone that OTP was sent to
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
      // Don't reveal whether user exists
      throw new BadRequestException('If the account exists, an OTP will be sent to the registered contact');
    }

    // 2. Get the user's contact info
    const user = await this.userRepository.findOne({
      where: { id: instituteUser.userId },
      select: ['id', 'email', 'phoneNumber', 'firstName', 'lastName'],
    });

    if (!user) {
      throw new BadRequestException('If the account exists, an OTP will be sent to the registered contact');
    }

    // 3. Determine contact info — with parent fallback for students
    let contactEmail: string | null = user.email || null;
    let contactPhone: string | null = user.phoneNumber || null;
    let isParentContact = false;

    // If student and (missing requested channel OR explicitly using parent contact)
    if (
      instituteUser.instituteUserType === InstituteUserType.STUDENT &&
      (dto.useParentContact || (dto.channel === InstitutePasswordResetChannel.EMAIL && !contactEmail) ||
       (dto.channel === InstitutePasswordResetChannel.PHONE && !contactPhone))
    ) {
      // Look up parent contact
      const student = await this.studentRepository.findOne({
        where: { userId: instituteUser.userId },
      });

      if (student) {
        // Try father → mother → guardian
        const parentIds = [student.fatherId, student.motherId, student.guardianId].filter(Boolean);
        
        for (const parentId of parentIds) {
          const parent = await this.parentRepository.findOne({
            where: { userId: parentId },
            relations: ['user'],
          });

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

    // 4. Validate that we have contact info for the requested channel
    if (dto.channel === InstitutePasswordResetChannel.EMAIL && !contactEmail) {
      throw new BadRequestException('No email address available. Try using phone or parent contact.');
    }
    if (dto.channel === InstitutePasswordResetChannel.PHONE && !contactPhone) {
      throw new BadRequestException('No phone number available. Try using email or parent contact.');
    }

    // 5. Check daily OTP limit
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCount = await this.otpRepository.count({
      where: {
        userId: instituteUser.userId,
        otpPurpose: OtpPurpose.INSTITUTE_PASSWORD_RESET,
        createdDate: todayStr,
      },
    });

    if (todayCount >= MAX_OTP_REQUESTS_PER_DAY) {
      throw new BadRequestException('Maximum OTP requests reached for today. Try again tomorrow.');
    }

    // 6. Invalidate old OTPs for this user + purpose
    await this.otpRepository.update(
      {
        userId: instituteUser.userId,
        otpPurpose: OtpPurpose.INSTITUTE_PASSWORD_RESET,
        isVerified: false,
      },
      { isVerified: true }, // Mark as used to prevent reuse
    );

    // 7. Generate OTP
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // 8. Save OTP record
    const otpRecord = this.otpRepository.create({
      userId: instituteUser.userId,
      email: dto.channel === InstitutePasswordResetChannel.EMAIL ? contactEmail : undefined,
      phoneNumber: dto.channel === InstitutePasswordResetChannel.PHONE ? contactPhone : undefined,
      otpCode,
      otpType: dto.channel === InstitutePasswordResetChannel.EMAIL ? OtpType.EMAIL : OtpType.PHONE,
      otpPurpose: OtpPurpose.INSTITUTE_PASSWORD_RESET,
      expiresAt,
      createdAt: now(),
      createdDate: todayStr,
      ipAddress: ipAddress || null,
    });
    await this.otpRepository.save(otpRecord);

    // 9. Send OTP
    let sentTo: string;

    if (dto.channel === InstitutePasswordResetChannel.EMAIL) {
      await this.enhancedEmailService.sendOTP({
        email: contactEmail,
        otp: otpCode,
        userName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
        expiryMinutes: String(OTP_EXPIRY_MINUTES),
        requestType: 'Institute Password Reset',
        ipAddress,
      });
      // Mask email: j***@example.com
      const [localPart, domain] = contactEmail.split('@');
      sentTo = `${localPart[0]}***@${domain}`;
    } else {
      const normalizedPhone = normalizeSriLankanPhone(contactPhone) || contactPhone;
      await this.smslenzProvider.sendSms({
        senderId: 'Suraksha',
        contact: normalizedPhone,
        message: `Your institute password reset code is: ${otpCode}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`,
      });
      // Mask phone: +94***4567
      sentTo = `${normalizedPhone.substring(0, 3)}***${normalizedPhone.substring(normalizedPhone.length - 4)}`;
    }

    this.logger.log(`✅ Institute password reset OTP sent: user=${instituteUser.userId}, channel=${dto.channel}, isParent=${isParentContact}`);

    return {
      message: 'OTP sent successfully',
      sentTo,
      channel: dto.channel,
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
}
