import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, MoreThan, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserEntity } from '../../modules/user/entities/user.entity';
import { PasswordResetTokenEntity, UserFirstLoginLogEntity } from '../entities/password-reset.entity';
import { EnhancedEmailService } from '../../common/services/enhanced-email.service';
import { AuthService } from '../auth.service';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { SmslenzProvider } from '../../modules/sms/providers/smslenz.provider';
import { normalizeSriLankanPhone } from '../../common/utils/phone-normalizer.util';
// ✅ CACHING SERVICES
import { UserManagementService } from '../../common/services/cache-user-management.service';
import { CacheService } from '../../common/services/cache.service';
import { now, nowTimestamp } from '../../common/utils/timezone.util';
import { maskPii } from '../../common/utils/pii-masking.util';
import { 
  InitiateFirstLoginDto, 
  VerifyOtpDto, 
  SetPasswordDto,
  FirstLoginResponseDto,
  OtpVerificationResponseDto,
  PasswordSetupResponseDto,
  EnhancedOtpVerificationResponseDto,
  MinimalUserDataDto,
  CompleteProfileDto,
  EnhancedVerifyOtpDto,
  EnhancedOtpCompleteVerificationResponseDto,
  CompleteUserDataDto,
  InitiateFirstLoginByPhoneDto,
  VerifyPhoneOtpFirstLoginDto,
  RequestEmailOtpFirstLoginDto,
  VerifyEmailOtpFirstLoginDto,
  CompleteFirstLoginProfileDto,
  InitiateFirstLoginDto2,
  VerifyFirstLoginOtpDto,
  RequestPhoneOtpFirstLoginDto,
  VerifyPhoneOtpInFlowDto
} from '../dto/first-login.dto';
import { UserType } from '../../modules/user/enums/user-type.enum';
import { ProfileCompletionStatus, calculateProfileCompletion, determineProfileStatus } from '../../modules/user/enums/profile-completion-status.enum';
import { ImageVerificationStatus } from '../../modules/institute_mudules/institue_user/enums/image-verification-status.enum';
import { StudentEntity } from '../../modules/student/entities/student.entity';
import { UserOtpEntity, OtpType, OtpPurpose, OtpDeliveryMethod } from '../../modules/user/entities/user-otp.entity';

@Injectable()
export class FirstLoginService {
  private readonly logger = new Logger(FirstLoginService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly passwordResetTokenRepository: Repository<PasswordResetTokenEntity>,
    @InjectRepository(UserFirstLoginLogEntity)
    private readonly firstLoginLogRepository: Repository<UserFirstLoginLogEntity>,
    @InjectRepository(UserOtpEntity)
    private readonly userOtpRepository: Repository<UserOtpEntity>,
    private readonly enhancedEmailService: EnhancedEmailService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly cloudStorageService: CloudStorageService,
    private readonly smsProvider: SmslenzProvider,
    // ✅ CACHING SERVICES
    private readonly userManagementService: UserManagementService,
    private readonly cacheService: CacheService,
    private readonly dataSource: DataSource,
  ) {}

  async initiateFirstLogin(
    dto: InitiateFirstLoginDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<FirstLoginResponseDto> {

    // Check if user exists
    const user = await this.userRepository.findOne({
      where: { email: dto.email, isActive: true }
    });

    if (!user) {
      throw new NotFoundException('User not found with this email address');
    }

    // Check if user already has a password
    if (user.password) {
      throw new BadRequestException('User already has a password set. Please use regular login.');
    }

    // Generate OTP
    const otp = this.generateOTP();
    const expiryTimeMs = nowTimestamp() + (15 * 60 * 1000); // 15 minutes in milliseconds
    const expiresAt = new Date(expiryTimeMs);

    // Use a transaction to ensure atomicity of token creation + log entry
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Invalidate any existing tokens for this email
      await queryRunner.manager.update(
        PasswordResetTokenEntity,
        { email: dto.email, isUsed: false },
        { isUsed: true, updatedAt: now() }
      );

      // Create new token
      const resetToken = queryRunner.manager.create(PasswordResetTokenEntity, {
        email: dto.email,
        otp,
        tokenType: 'FIRST_LOGIN',
        expiresAt,
        createdAt: now(),
        updatedAt: now(),
        ipAddress,
        userAgent,
      });

      await queryRunner.manager.save(resetToken);

      // Log the first login attempt
      const loginLog = queryRunner.manager.create(UserFirstLoginLogEntity, {
        userId: user.id,
        email: dto.email,
        status: 'OTP_SENT',
        createdAt: now(),
        ipAddress,
        userAgent,
        notes: 'First login OTP sent successfully'
      });

      await queryRunner.manager.save(loginLog);

      await queryRunner.commitTransaction();
    } catch (txError) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to create OTP token for ${maskPii(dto.email)}: ${txError.message}`);
      throw new BadRequestException('Failed to initiate first login. Please try again.');
    } finally {
      await queryRunner.release();
    }

    // Send OTP email using AWS Lambda email service (industry-level performance)
    // This doesn't block the response - user gets immediate feedback
    try {
      await this.enhancedEmailService.sendOTP({
        email: user.email!,
        otp,
        userName: user.firstName || 'User',
        expiryMinutes: '15',
        requestType: 'First Login',
        ipAddress: ipAddress || 'Unknown'
      });
    } catch (emailError) {
      this.logger.error(`❌ Failed to send first login OTP email to ${maskPii(dto.email)}: ${emailError.message}`);
      // Don't fail the request - OTP is stored in database, user can retry
    }


    return {
      success: true,
      message: 'OTP sent successfully to your email address. Please check your inbox.',
      data: {
        email: dto.email,
        expiresInMinutes: 15
      }
    };
  }

  async verifyOTP(
    dto: VerifyOtpDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<OtpVerificationResponseDto> {

    // Find the token
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        email: dto.email,
        otp: dto.otp,
        tokenType: 'FIRST_LOGIN',
        isUsed: false,
        isOtpVerified: false
      }
    });

    if (!resetToken) {
      // Increment attempt count for existing tokens
      await this.passwordResetTokenRepository.increment(
        { email: dto.email, tokenType: 'FIRST_LOGIN', isUsed: false },
        'attemptCount',
        1
      );

      throw new BadRequestException('Invalid or expired OTP');
    }

    // Check if token is expired
    const currentTime = now();
    if (currentTime > resetToken.expiresAt) {
      await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    // Check attempt count
    if (resetToken.attemptCount >= 5) {
      await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('Too many failed attempts. Please request a new OTP.');
    }

    // Generate verification token for password setup
    const verificationToken = this.jwtService.sign(
      { 
        email: dto.email, 
        tokenId: resetToken.id,
        type: 'password_setup'
      },
      { expiresIn: '15m' }
    );

    // Update token status
    await this.passwordResetTokenRepository.update(resetToken.id, {
      isOtpVerified: true,
      verificationToken,
      updatedAt: now(),
    });

    // Update log (no password needed here - just for logging)
    const user = await this.userRepository.findOne({ 
      where: { email: dto.email },
      select: ['id', 'email'] // Only need id and email for logging
    });
    const loginLog = this.firstLoginLogRepository.create({
      userId: user?.id || '',
      email: dto.email,
      status: 'OTP_VERIFIED',
      ipAddress,
      userAgent,
      notes: 'OTP verified successfully'
    });

    await this.firstLoginLogRepository.save(loginLog);


    return {
      success: true,
      message: 'OTP verified successfully. You can now set your password.',
      verificationToken,
      expiresInMinutes: 15
    };
  }

  async setPassword(
    dto: SetPasswordDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<PasswordSetupResponseDto> {

    // Verify passwords match
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Verify the verification token
    let tokenPayload: any;
    try {
      tokenPayload = this.jwtService.verify(dto.verificationToken);
    } catch (error) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (tokenPayload.email !== dto.email || tokenPayload.type !== 'password_setup') {
      throw new BadRequestException('Invalid verification token');
    }

    // Find the reset token
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        id: tokenPayload.tokenId,
        email: dto.email,
        isOtpVerified: true,
        isUsed: false
      }
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired token');
    }

    // Find the user
    const user = await this.userRepository.findOne({
      where: { email: dto.email, isActive: true }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Hash the password using AuthService with pepper and proper salt rounds
    const hashedPassword = await this.authService.hashPassword(dto.password);

    // Update user with password
    const updateData: Partial<UserEntity> = {
      password: hashedPassword,
      updatedAt: now()
    };

    // Phone number is completely optional now
    if (dto.phoneNumber && dto.phoneNumber.trim().length > 0) {
      updateData.phoneNumber = dto.phoneNumber;
    }

    await this.userRepository.update(user.id, updateData);

    // Mark token as used
    await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true, updatedAt: now() });

    // CACHE REFRESH: Critical password change requires cache update
    try {
      // Get the fully updated user for sync
      const fullUpdatedUser = await this.userRepository.findOne({
        where: { id: user.id }
      });

      if (fullUpdatedUser) {
      }
    } catch (error) {
      this.logger.error(`Failed to complete first login password change for user ${user.id}:`, error);
    }

    // 🔄 Update user cache and indexes after first login password setup
    try {
      await this.userManagementService.refreshUserCache(user.id);
      await this.userManagementService.setUserIndexes(user.id);
    } catch (cacheError) {
      this.logger.warn(`Cache refresh failed after first login for user ${user.id}: ${cacheError.message}`);
    }

    // Update log
    const loginLog = this.firstLoginLogRepository.create({
      userId: user.id,
      email: dto.email,
      status: 'COMPLETED',
      ipAddress,
      userAgent,
      notes: 'Password set successfully - first login completed'
    });

    await this.firstLoginLogRepository.save(loginLog);


    // Get updated user data
    const updatedUser = await this.userRepository.findOne({
      where: { id: user.id },
      select: ['id', 'email', 'firstName', 'lastName', 'userType']
    });

    return {
      success: true,
      message: 'Password set successfully. You can now login with your email and password.',
      user: {
        id: updatedUser!.id,
        email: updatedUser!.email || '',
        firstName: updatedUser!.firstName || '',
        lastName: updatedUser!.lastName || '',
        userType: updatedUser!.userType?.toString() || ''
      }
    };
  }

  private generateOTP(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  async resendOTP(
    email: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<FirstLoginResponseDto> {

    // Check rate limiting - max 3 OTP requests per hour
    const oneHourAgoMs = nowTimestamp() - (60 * 60 * 1000); // 1 hour in milliseconds

    const recentTokens = await this.passwordResetTokenRepository.count({
      where: {
        email,
        tokenType: 'FIRST_LOGIN',
        createdAt: MoreThanOrEqual(new Date(oneHourAgoMs))
      }
    });

    if (recentTokens >= 3) {
      throw new BadRequestException('Too many OTP requests. Please try again after an hour.');
    }

    return this.initiateFirstLogin({ email }, ipAddress, userAgent);
  }

  async checkFirstLoginStatus(email: string): Promise<{ requiresFirstLogin: boolean; userExists: boolean }> {
    const user = await this.userRepository.findOne({
      where: { email, isActive: true },
      select: ['id', 'email', 'password']
    });

    if (!user) {
      return { requiresFirstLogin: false, userExists: false };
    }

    return {
      // User requires first login if they don't have a password or password is empty
      requiresFirstLogin: !user.password || user.password.trim().length === 0,
      userExists: true
    };
  }

  // ===== ENHANCED APPROACH METHODS =====

  /**
   * Enhanced OTP verification that returns minimal user data with simple JWT
   */
  async verifyOTPEnhanced(
    dto: VerifyOtpDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<EnhancedOtpVerificationResponseDto> {

    // First do standard OTP verification
    await this.verifyOTP(dto, ipAddress, userAgent);

    // Get user data
    const user = await this.userRepository.findOne({
      where: { email: dto.email, isActive: true },
      select: ['id', 'email', 'firstName', 'lastName', 'userType', 'phoneNumber', 'dateOfBirth', 'gender', 'addressLine1', 'addressLine2', 'city', 'district', 'province', 'country']
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create simple JWT with only user ID
    const simplePayload = {
      sub: user.id,  // Standard JWT subject claim
      iat: Math.floor(nowTimestamp() / 1000)
    };

    const access_token = this.jwtService.sign(simplePayload, { expiresIn: '30d' }); // 30 days for profile completion

    // Get additional user data based on user type
    const additionalData = await this.getAdditionalUserData(user.id, user.userType);

    // Build minimal user data response
    const minimalUserData: MinimalUserDataDto = {
      id: user.id,
      email: user.email || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      userType: user.userType || '',
      // Include current data (might be empty for new users)
      phoneNumber: user.phoneNumber || undefined,
      dateOfBirth: user.dateOfBirth?.toISOString().split('T')[0] || undefined,
      gender: user.gender || undefined,
      addressLine1: user.addressLine1 || undefined,
      addressLine2: user.addressLine2 || undefined,
      city: user.city || undefined,
      district: user.district || undefined,
      province: user.province || undefined,
      country: user.country || undefined,
      // Add type-specific data
      ...additionalData
    };

    // Update log
    const loginLog = this.firstLoginLogRepository.create({
      userId: user.id,
      email: dto.email,
      status: 'OTP_VERIFIED', // Use existing status
      ipAddress,
      userAgent,
      notes: 'Enhanced OTP verified - minimal user data returned'
    });

    await this.firstLoginLogRepository.save(loginLog);


    return {
      success: true,
      message: 'OTP verified successfully. Complete your profile.',
      access_token,
      user: minimalUserData
    };
  }

  /**
   * Get additional user data based on user type (student/parent specific data)
   * Note: DB user_type uses UserType enum ('USER', 'SUPER_ADMIN', etc.), not institute roles.
   * A 'USER' can be enrolled as STUDENT or PARENT via institute_users, so we try loading both.
   */
  private async getAdditionalUserData(userId: string, userType: string): Promise<Partial<MinimalUserDataDto>> {
    const additionalData: Partial<MinimalUserDataDto> = {};

    try {
      // Try loading student-specific data (user may be enrolled as student in an institute)
      try {
        const { StudentEntity } = await import('../../modules/student/entities/student.entity');
        const studentRepository = this.userRepository.manager.getRepository(StudentEntity);
        
        const student = await studentRepository.findOne({
          where: { userId },
          select: ['studentId', 'emergencyContact', 'bloodGroup']
        });

        if (student) {
          additionalData.studentId = student.studentId || undefined;
          additionalData.emergencyContact = student.emergencyContact || undefined;
          additionalData.bloodGroup = student.bloodGroup || undefined;
        }
      } catch (e) { this.logger.debug(`Student entity not found for user ${userId}: ${e?.message}`); }

      // Try loading parent-specific data (user may be enrolled as parent in an institute)
      try {
        const { ParentEntity } = await import('../../modules/parent/entities/parent.entity');
        const parentRepository = this.userRepository.manager.getRepository(ParentEntity);
        
        const parent = await parentRepository.findOne({
          where: { userId },
          select: ['occupation', 'workplace', 'educationLevel']
        });

        if (parent) {
          additionalData.occupation = parent.occupation || undefined;
          additionalData.workplace = parent.workplace || undefined;
          additionalData.educationLevel = parent.educationLevel || undefined;
        }
      } catch (e) { this.logger.debug(`Parent entity not found for user ${userId}: ${e?.message}`); }
    } catch (error) {
      this.logger.warn(`Could not fetch additional data for user ${userId}:`, error.message);
    }

    return additionalData;
  }

  /**
   * Complete user profile - update all user information with simple JWT authentication
   */
  async completeProfile(
    dto: CompleteProfileDto,
    authorizationHeader: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; message: string; user: any }> {
    // Validate authorization header
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      throw new BadRequestException('Valid JWT token required');
    }

    // Extract and verify JWT token
    const token = authorizationHeader.substring(7);
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch (error) {
      throw new BadRequestException('Invalid or expired token');
    }

    const userId = payload.sub;
    if (!userId) {
      throw new BadRequestException('Invalid token - user ID not found');
    }


    // Get user
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update user data
    const updateData: Partial<UserEntity> = {};
    
    // Basic user fields
    if (dto.phoneNumber) updateData.phoneNumber = dto.phoneNumber;
    if (dto.dateOfBirth) updateData.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.gender) {
      // Import and validate Gender enum
      const { Gender } = await import('../../modules/user/enums/gender.enum');
      if (Object.values(Gender).includes(dto.gender as any)) {
        updateData.gender = dto.gender as any;
      }
    }
    if (dto.addressLine1) updateData.addressLine1 = dto.addressLine1;
    if (dto.addressLine2) updateData.addressLine2 = dto.addressLine2;
    if (dto.city) updateData.city = dto.city;
    if (dto.district) {
      const { District } = await import('../../modules/user/enums/district.enum');
      if (Object.values(District).includes(dto.district as any)) {
        updateData.district = dto.district as any;
      }
    }
    if (dto.province) {
      const { Province } = await import('../../modules/user/enums/province.enum');
      if (Object.values(Province).includes(dto.province as any)) {
        updateData.province = dto.province as any;
      }
    }
    if (dto.country) {
      const { Country } = await import('../../modules/user/enums/country.enum');
      if (Object.values(Country).includes(dto.country as any)) {
        updateData.country = dto.country as any;
      }
    }

    // Handle password update
    if (dto.password) {
      updateData.password = await this.authService.hashPassword(dto.password);
    }

    updateData.updatedAt = now();

    // Update user
    await this.userRepository.update(userId, updateData);

    // Update type-specific data
    await this.updateTypeSpecificData(userId, user.userType, dto);

    // Cache refresh
    try {
      const fullUpdatedUser = await this.userRepository.findOne({
        where: { id: userId }
      });

      if (fullUpdatedUser) {
      }
    } catch (error) {
      this.logger.error(`Failed to complete profile for user ${userId}:`, error);
    }

    // Log the completion
    const loginLog = this.firstLoginLogRepository.create({
      userId: userId,
      email: user.email,
      status: 'COMPLETED', // Use existing status from entity definition
      ipAddress,
      userAgent,
      notes: 'Profile completion successful'
    });

    await this.firstLoginLogRepository.save(loginLog);

    // Get updated user data
    const updatedUser = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'email', 'firstName', 'lastName', 'userType']
    });


    // 🔄 Refresh user cache after profile completion (user data changes)
    try {
      await this.userManagementService.refreshUserCache(userId);
    } catch (cacheError) {
      this.logger.warn(`Cache refresh failed after profile completion for user ${userId}: ${cacheError.message}`);
    }

    return {
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser!.id,
        email: updatedUser!.email || '',
        firstName: updatedUser!.firstName || '',
        lastName: updatedUser!.lastName || '',
        userType: updatedUser!.userType?.toString() || ''
      }
    };
  }

  /**
   * Complete OTP verification with profile data and image upload
   * Single-step approach: verify OTP + update profile + upload image
   */
  async verifyOTPComplete(
    dto: EnhancedVerifyOtpDto,
    profileImageUrl?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<EnhancedOtpCompleteVerificationResponseDto> {

    // First do standard OTP verification
    await this.verifyOTP(
      { email: dto.email, otp: dto.otp },
      ipAddress,
      userAgent
    );

    // Get user data
    const user = await this.userRepository.findOne({
      where: { email: dto.email, isActive: true }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userId = user.id;

    // ✅ Use profile image URL from DTO first, then parameter (for backward compatibility)
    const imageUrl = dto.profileImageUrl || profileImageUrl;

    // Update user data
    const updateData: Partial<UserEntity> = {};
    
    // Basic user fields
    if (dto.phoneNumber) updateData.phoneNumber = dto.phoneNumber;
    if (dto.dateOfBirth) updateData.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.gender) {
      // Import and validate Gender enum
      const { Gender } = await import('../../modules/user/enums/gender.enum');
      if (Object.values(Gender).includes(dto.gender as any)) {
        updateData.gender = dto.gender as any;
      }
    }
    if (dto.addressLine1) updateData.addressLine1 = dto.addressLine1;
    if (dto.addressLine2) updateData.addressLine2 = dto.addressLine2;
    if (dto.city) updateData.city = dto.city;
    if (dto.district) {
      const { District } = await import('../../modules/user/enums/district.enum');
      if (Object.values(District).includes(dto.district as any)) {
        updateData.district = dto.district as any;
      }
    }
    if (dto.province) {
      const { Province } = await import('../../modules/user/enums/province.enum');
      if (Object.values(Province).includes(dto.province as any)) {
        updateData.province = dto.province as any;
      }
    }
    if (dto.country) {
      const { Country } = await import('../../modules/user/enums/country.enum');
      if (Object.values(Country).includes(dto.country as any)) {
        updateData.country = dto.country as any;
      }
    }

    // Handle password update
    if (dto.password) {
      updateData.password = await this.authService.hashPassword(dto.password);
    }

    // Handle image URL - set to PENDING for admin verification
    if (imageUrl) {
      updateData.imageUrl = imageUrl;
      updateData.imageVerificationStatus = ImageVerificationStatus.PENDING;
      updateData.imageVerifiedBy = null;
      updateData.imageVerifiedAt = null;
      updateData.imageRejectionReason = null;
    }

    updateData.updatedAt = now();

    // Update user
    await this.userRepository.update(userId, updateData);

    // Update type-specific data
    await this.updateTypeSpecificDataEnhanced(userId, user.userType, dto);

    // Cache refresh
    try {
      const fullUpdatedUser = await this.userRepository.findOne({
        where: { id: userId }
      });

      if (fullUpdatedUser) {
      }
    } catch (error) {
      this.logger.error(`Failed to complete OTP verification for user ${userId}:`, error);
    }

    // Create simple JWT with only user ID
    const simplePayload = {
      sub: userId,  // Standard JWT subject claim
      iat: Math.floor(nowTimestamp() / 1000)
    };

    const access_token = this.jwtService.sign(simplePayload, { expiresIn: '30d' });

    // Get complete updated user data
    const updatedUser = await this.userRepository.findOne({
      where: { id: userId },
      select: [
        'id', 'email', 'firstName', 'lastName', 'userType', 
        'phoneNumber', 'dateOfBirth', 'gender', 'imageUrl',
        'addressLine1', 'addressLine2', 'city', 'district', 'province', 'country'
      ]
    });

    if (!updatedUser) {
      throw new NotFoundException('Updated user not found');
    }

    // Get additional user data based on user type
    const additionalData = await this.getAdditionalUserData(userId, user.userType);

    // Build complete user data response
    const completeUserData: CompleteUserDataDto = {
      id: updatedUser.id,
      email: updatedUser.email || '',
      firstName: updatedUser.firstName || '',
      lastName: updatedUser.lastName || '',
      userType: updatedUser.userType || '',
      phoneNumber: updatedUser.phoneNumber || undefined,
      dateOfBirth: updatedUser.dateOfBirth?.toISOString().split('T')[0] || undefined,
      gender: updatedUser.gender || undefined,
      // ✅ Transform imageUrl to full URL
      imageUrl: updatedUser.imageUrl ? this.cloudStorageService.getFullUrl(updatedUser.imageUrl) : undefined,
      addressLine1: updatedUser.addressLine1 || undefined,
      addressLine2: updatedUser.addressLine2 || undefined,
      city: updatedUser.city || undefined,
      district: updatedUser.district || undefined,
      province: updatedUser.province || undefined,
      country: updatedUser.country || undefined,
      // Add type-specific data
      ...additionalData
    };

    // Log the completion
    const loginLog = this.firstLoginLogRepository.create({
      userId: userId,
      email: dto.email,
      status: 'COMPLETED',
      ipAddress,
      userAgent,
      notes: 'Complete OTP verification with profile update and image upload successful'
    });

    await this.firstLoginLogRepository.save(loginLog);


    return {
      success: true,
      message: 'OTP verified and profile completed successfully. You can now access the application.',
      access_token,
      user: completeUserData
    };
  }

  /**
   * Upload profile image - now accepts imageUrl from signed URL upload
   * @deprecated File upload parameter is deprecated - use imageUrl string instead
   */
  private async uploadProfileImage(imageUrl: string, userId: string): Promise<string> {
    // Simply return the imageUrl
    return imageUrl;
  }

  /**
   * Update type-specific data for enhanced approach
   * Note: DB user_type is 'USER', not 'STUDENT'/'PARENT'. Try updating both tables if data provided.
   */
  private async updateTypeSpecificDataEnhanced(userId: string, userType: string, dto: EnhancedVerifyOtpDto): Promise<void> {
    try {
      // Try updating student-specific data if relevant fields are provided
      if (dto.studentId || dto.emergencyContact || dto.bloodGroup) {
        const { StudentEntity } = await import('../../modules/student/entities/student.entity');
        const studentRepository = this.userRepository.manager.getRepository(StudentEntity);
        
        const studentUpdateData: any = {};
        if (dto.studentId) studentUpdateData.studentId = dto.studentId;
        if (dto.emergencyContact) studentUpdateData.emergencyContact = dto.emergencyContact;
        if (dto.bloodGroup) studentUpdateData.bloodGroup = dto.bloodGroup;
        
        if (Object.keys(studentUpdateData).length > 0) {
          await studentRepository.update({ userId }, studentUpdateData);
        }
      }

      // Try updating parent-specific data if relevant fields are provided
      if (dto.occupation || dto.workplace || dto.educationLevel) {
        const { ParentEntity } = await import('../../modules/parent/entities/parent.entity');
        const parentRepository = this.userRepository.manager.getRepository(ParentEntity);
        
        const parentUpdateData: any = {};
        if (dto.occupation) parentUpdateData.occupation = dto.occupation;
        if (dto.workplace) parentUpdateData.workplace = dto.workplace;
        if (dto.educationLevel) parentUpdateData.educationLevel = dto.educationLevel;
        
        if (Object.keys(parentUpdateData).length > 0) {
          await parentRepository.update({ userId }, parentUpdateData);
        }
      }
    } catch (error) {
      this.logger.warn(`Could not update enhanced type-specific data for user ${userId}:`, error.message);
    }
  }

  /**
   * Update type-specific data (student/parent)
   * Note: DB user_type is 'USER', not 'STUDENT'/'PARENT'. Try updating both tables if data provided.
   */
  private async updateTypeSpecificData(userId: string, userType: string, dto: CompleteProfileDto): Promise<void> {
    try {
      // Try updating student-specific data if relevant fields are provided
      if (dto.emergencyContact || dto.bloodGroup) {
        const { StudentEntity } = await import('../../modules/student/entities/student.entity');
        const studentRepository = this.userRepository.manager.getRepository(StudentEntity);
        
        const studentUpdateData: any = {};
        if (dto.emergencyContact) studentUpdateData.emergencyContact = dto.emergencyContact;
        if (dto.bloodGroup) studentUpdateData.bloodGroup = dto.bloodGroup;
        
        if (Object.keys(studentUpdateData).length > 0) {
          await studentRepository.update({ userId }, studentUpdateData);
        }
      }

      // Try updating parent-specific data if relevant fields are provided
      if (dto.occupation || dto.workplace || dto.educationLevel) {
        const { ParentEntity } = await import('../../modules/parent/entities/parent.entity');
        const parentRepository = this.userRepository.manager.getRepository(ParentEntity);
        
        const parentUpdateData: any = {};
        if (dto.occupation) parentUpdateData.occupation = dto.occupation;
        if (dto.workplace) parentUpdateData.workplace = dto.workplace;
        if (dto.educationLevel) parentUpdateData.educationLevel = dto.educationLevel;
        
        if (Object.keys(parentUpdateData).length > 0) {
          await parentRepository.update({ userId }, parentUpdateData);
        }
      }
    } catch (error) {
      this.logger.warn(`Could not update type-specific data for user ${userId}:`, error.message);
    }
  }

  // ============================================================
  // 📱 MULTI-IDENTIFIER FIRST LOGIN FLOW  
  //    Supports: phone, email, systemId
  // ============================================================

  /**
   * Detect identifier type from a raw string.
   * Returns: 'phone' | 'email' | 'systemId'
   * UUID (e.g. 123e4567-e89b-12d3-a456-426614174000) is treated as systemId
   * and looked up directly by users.id.
   */
  private detectIdentifierType(identifier: string): 'phone' | 'email' | 'systemId' {
    const trimmed = identifier.trim();
    // Email: contains @
    if (trimmed.includes('@')) return 'email';
    // UUID v4: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return 'systemId';
    // Phone: starts with 0, +94, 94 and contains mostly digits
    const digitsOnly = trimmed.replace(/[+\-\s()]/g, '');
    if (/^(0|94|\+94)\d{8,11}$/.test(digitsOnly)) return 'phone';
    // Otherwise: systemId (e.g., STU-0001)
    return 'systemId';
  }

  /**
   * Step 1: Unified first login initiation.
   * - Accept phone, email, or systemId
   * - Find user
   * - Determine verification requirements based on what contact info exists
   * - Send OTP to best available channel
   * - Return verification requirements
   */
  async initiateFirstLoginUnified(
    dto: InitiateFirstLoginDto2,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    success: boolean;
    message: string;
    otpSentVia: 'phone' | 'email' | null;
    maskedDestination: string | null;
    expiresInMinutes: number;
    verificationsRequired: { phone: boolean; email: boolean };
    userHasPhone: boolean;
    userHasEmail: boolean;
    userId: string;
    accessToken?: string;
    requiresContactInfo?: boolean;
    parentOtpUsed?: boolean;
    parentRelationship?: string;
  }> {
    const identifierType = this.detectIdentifierType(dto.identifier);
    let user: UserEntity | null = null;

    // ── Find user by identifier ──
    if (identifierType === 'phone') {
      const normalizedPhone = normalizeSriLankanPhone(dto.identifier);
      if (!normalizedPhone) {
        throw new BadRequestException('Invalid phone number format. Use Sri Lankan format: 077X, 94X, +94X');
      }
      user = await this.userRepository.findOne({
        where: { phoneNumber: normalizedPhone, isActive: true },
        select: ['id', 'phoneNumber', 'email', 'firstName', 'nameWithInitials', 'password', 'firstLoginCompleted',
                 'userType', 'isPhoneVerified', 'isEmailVerified']
      });
    } else if (identifierType === 'email') {
      const email = dto.identifier.trim().toLowerCase();
      user = await this.userRepository.findOne({
        where: { email, isActive: true },
        select: ['id', 'phoneNumber', 'email', 'firstName', 'nameWithInitials', 'password', 'firstLoginCompleted',
                 'userType', 'isPhoneVerified', 'isEmailVerified']
      });
    } else {
      // User ID → Global registration (not institute-specific)
      // Look up directly in users table by ID
      user = await this.userRepository.findOne({
        where: { id: dto.identifier.trim(), isActive: true },
        select: ['id', 'phoneNumber', 'email', 'firstName', 'nameWithInitials', 'password', 'firstLoginCompleted',
                 'userType', 'isPhoneVerified', 'isEmailVerified']
      });
      
      if (!user) {
        throw new NotFoundException(
          `No user found with identifier "${dto.identifier}". Please check your User ID, student ID, email, or phone number.`
        );
      }
    }

    // Check if already completed
    if (user.firstLoginCompleted && user.password) {
      throw new BadRequestException('First login already completed. Please use regular login.');
    }

    // ── Determine verification requirements ──
    const hasPhone = !!user.phoneNumber;
    const hasEmail = !!user.email;
    const phoneNeedsVerification = hasPhone && !user.isPhoneVerified;
    const emailNeedsVerification = hasEmail && !user.isEmailVerified;

    // ── SPECIAL HANDLING FOR USER ID LOGIN ──
    // User ID is proof of identity, so skip OTP and issue JWT directly
    // User must add/verify contacts in-flow based on their account status
    if (identifierType === 'systemId') {
      const accessToken = this.generateFirstLoginAccessToken(user.id);
      
      // Case 1: No phone AND no email → Check for parent contact (students) or require contact info
      if (!hasPhone && !hasEmail) {
        // Check if this user is a student with parents who have contact info
        const studentRecord = await this.dataSource.getRepository(StudentEntity).findOne({
          where: { userId: user.id, isActive: true },
        });

        if (studentRecord) {
          // Look up parent users with contact info (priority: father → mother → guardian)
          const parentIds = [
            { id: studentRecord.fatherId, relationship: 'father' },
            { id: studentRecord.motherId, relationship: 'mother' },
            { id: studentRecord.guardianId, relationship: 'guardian' },
          ].filter(p => !!p.id);

          for (const parent of parentIds) {
            const parentUser = await this.userRepository.findOne({
              where: { id: parent.id, isActive: true },
              select: ['id', 'phoneNumber', 'email', 'firstName', 'nameWithInitials'],
            });

            if (parentUser && (parentUser.phoneNumber || parentUser.email)) {
              // Send OTP to parent's contact
              let otpSentVia: 'phone' | 'email' | null = null;
              let maskedDestination: string | null = null;

              if (parentUser.phoneNumber) {
                await this.sendFirstLoginPhoneOtp(parentUser.phoneNumber, user.id, ipAddress, userAgent);
                otpSentVia = 'phone';
                maskedDestination = maskPii(parentUser.phoneNumber);
              } else if (parentUser.email) {
                const userName = parentUser.nameWithInitials || parentUser.firstName || 'Parent';
                await this.sendFirstLoginEmailOtp(parentUser.email, user.id, userName, ipAddress, userAgent);
                otpSentVia = 'email';
                maskedDestination = maskPii(parentUser.email);
              }

              return {
                success: true,
                message: `OTP sent to ${parent.relationship}'s ${otpSentVia === 'phone' ? 'phone' : 'email'} (${maskedDestination}). Valid for 15 minutes.`,
                otpSentVia,
                maskedDestination,
                expiresInMinutes: 15,
                verificationsRequired: { phone: false, email: false },
                userHasPhone: false,
                userHasEmail: false,
                userId: user.id,
                accessToken,
                requiresContactInfo: false,
                parentOtpUsed: true,
                parentRelationship: parent.relationship,
              };
            }
          }
        }

        // No parent contact found — fall back to requiring contact info
        return {
          success: true,
          message: 'Please add your phone number or email to continue registration.',
          otpSentVia: null,
          maskedDestination: null,
          expiresInMinutes: 0,
          verificationsRequired: { phone: false, email: false },
          userHasPhone: false,
          userHasEmail: false,
          userId: user.id,
          accessToken,
          requiresContactInfo: true,
        };
      }
      
      // Case 2: Has contacts but none verified → Must verify existing contacts
      if (phoneNeedsVerification || emailNeedsVerification) {
        let message = 'Please verify your ';
        if (phoneNeedsVerification && emailNeedsVerification) {
          message += 'phone number and email';
        } else if (phoneNeedsVerification) {
          message += `phone number (${maskPii(user.phoneNumber!)})`;
        } else {
          message += `email (${maskPii(user.email!)})`;
        }
        message += ' to continue.';
        
        return {
          success: true,
          message,
          otpSentVia: null,
          maskedDestination: null,
          expiresInMinutes: 0,
          verificationsRequired: { phone: phoneNeedsVerification, email: emailNeedsVerification },
          userHasPhone: hasPhone,
          userHasEmail: hasEmail,
          userId: user.id,
          accessToken,
          requiresContactInfo: false,
        };
      }
      
      // Case 3: At least one contact verified → Proceed to profile completion
      return {
        success: true,
        message: 'User ID verified. Please complete your profile.',
        otpSentVia: null,
        maskedDestination: null,
        expiresInMinutes: 0,
        verificationsRequired: { phone: false, email: false },
        userHasPhone: hasPhone,
        userHasEmail: hasEmail,
        userId: user.id,
        accessToken,
        requiresContactInfo: false,
      };
    }

    // ── PHONE/EMAIL LOGIN FLOW (requires OTP) ──
    // At least one contact must exist
    if (!hasPhone && !hasEmail) {
      throw new BadRequestException(
        'This user account has no phone number or email. Please use your User ID (UUID) to login and add contact information.'
      );
    }

    // ── Send OTP to best available channel ──
    // Priority: phone first (instant SMS), email second
    let otpSentVia: 'phone' | 'email' | null = null;
    let maskedDestination: string | null = null;

    if (hasPhone && !user.isPhoneVerified) {
      // Send SMS OTP
      const normalizedPhone = user.phoneNumber!;
      await this.sendFirstLoginPhoneOtp(normalizedPhone, user.id, ipAddress, userAgent);
      otpSentVia = 'phone';
      maskedDestination = maskPii(normalizedPhone);
    } else if (hasEmail && !user.isEmailVerified) {
      // Send Email OTP
      const userName = user.nameWithInitials || user.firstName || 'User';
      await this.sendFirstLoginEmailOtp(user.email!, user.id, userName, ipAddress, userAgent);
      otpSentVia = 'email';
      maskedDestination = maskPii(user.email!);
    } else {
      // Both already verified (edge case — user is re-hitting initiate)
      // Resend to phone if available, else email
      if (hasPhone) {
        await this.sendFirstLoginPhoneOtp(user.phoneNumber!, user.id, ipAddress, userAgent);
        otpSentVia = 'phone';
        maskedDestination = maskPii(user.phoneNumber!);
      } else {
        const userName = user.nameWithInitials || user.firstName || 'User';
        await this.sendFirstLoginEmailOtp(user.email!, user.id, userName, ipAddress, userAgent);
        otpSentVia = 'email';
        maskedDestination = maskPii(user.email!);
      }
    }

    return {
      success: true,
      message: `OTP sent via ${otpSentVia === 'phone' ? 'SMS' : 'email'} to ${maskedDestination}. Valid for 15 minutes.`,
      otpSentVia,
      maskedDestination,
      expiresInMinutes: 15,
      verificationsRequired: {
        phone: phoneNeedsVerification,
        email: emailNeedsVerification,
      },
      userHasPhone: hasPhone,
      userHasEmail: hasEmail,
      userId: user.id,
    };
  }

  /**
   * Helper: Send OTP via SMS for first login
   */
  private async sendFirstLoginPhoneOtp(
    phoneNumber: string, userId: string, ipAddress?: string, userAgent?: string
  ) {
    // Invalidate previous OTPs
    await this.passwordResetTokenRepository.update(
      { email: phoneNumber, tokenType: 'FIRST_LOGIN' as any, isUsed: false },
      { isUsed: true, updatedAt: now() }
    );

    const otp = this.generateOTP();
    const expiresAt = new Date(nowTimestamp() + (15 * 60 * 1000));

    const resetToken = this.passwordResetTokenRepository.create({
      email: phoneNumber,
      otp,
      tokenType: 'FIRST_LOGIN' as any,
      expiresAt,
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
      userAgent,
    });
    await this.passwordResetTokenRepository.save(resetToken);

    // Log
    const loginLog = this.firstLoginLogRepository.create({
      userId,
      email: phoneNumber,
      status: 'OTP_SENT',
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
      userAgent,
      notes: 'First login OTP sent via SMS'
    });
    await this.firstLoginLogRepository.save(loginLog);

    try {
      await this.smsProvider.sendSms({
        contact: phoneNumber,
        message: `Your Suraksha LMS first login code is: ${otp}. Valid for 15 minutes. Do not share this code.`,
        senderId: 'SurakshaLMS',
      });
    } catch (smsError) {
      this.logger.error(`❌ Failed to send first login SMS to ${maskPii(phoneNumber)}: ${smsError.message}`);
    }
  }

  /**
   * Helper: Send OTP via email for first login
   */
  private async sendFirstLoginEmailOtp(
    email: string, userId: string, userName?: string, ipAddress?: string, userAgent?: string
  ) {
    // Invalidate previous OTPs
    await this.passwordResetTokenRepository.update(
      { email, tokenType: 'FIRST_LOGIN' as any, isUsed: false },
      { isUsed: true, updatedAt: now() }
    );

    const otp = this.generateOTP();
    const expiresAt = new Date(nowTimestamp() + (15 * 60 * 1000));

    const resetToken = this.passwordResetTokenRepository.create({
      email,
      otp,
      tokenType: 'FIRST_LOGIN' as any,
      expiresAt,
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
      userAgent,
    });
    await this.passwordResetTokenRepository.save(resetToken);

    // Log
    const loginLog = this.firstLoginLogRepository.create({
      userId,
      email,
      status: 'OTP_SENT',
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
      userAgent,
      notes: 'First login OTP sent via email'
    });
    await this.firstLoginLogRepository.save(loginLog);

    try {
      await this.enhancedEmailService.sendOTP({
        email,
        otp,
        userName: userName || email.split('@')[0],
        expiryMinutes: '15',
        requestType: 'First Login',
        ipAddress: ipAddress || 'Unknown'
      });
    } catch (emailError) {
      this.logger.error(`❌ Failed to send first login email to ${maskPii(email)}: ${emailError.message}`);
    }
  }

  /**
   * Helper: Generate JWT access token for first login flow
   * Used for userId logins that skip initial OTP verification
   */
  private generateFirstLoginAccessToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId, type: 'first_login_profile', iat: Math.floor(nowTimestamp() / 1000) },
      { expiresIn: '30d' }
    );
  }

  /**
   * Step 2: Verify initial OTP (phone OR email).
   * On success:
   *  - Mark the channel as verified
   *  - Return JWT + annotated profile
   *  - Tell frontend what additional verifications are still needed
   */
  async verifyFirstLoginOtp(
    dto: VerifyFirstLoginOtpDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<any> {
    let lookupIdentifier: string;
    if (dto.channel === 'phone') {
      lookupIdentifier = normalizeSriLankanPhone(dto.identifier) || dto.identifier;
    } else {
      lookupIdentifier = dto.identifier.trim().toLowerCase();
    }

    // Find OTP token
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        email: lookupIdentifier,
        otp: dto.otp,
        tokenType: 'FIRST_LOGIN' as any,
        isUsed: false,
        isOtpVerified: false,
      }
    });

    if (!resetToken) {
      await this.passwordResetTokenRepository.increment(
        { email: lookupIdentifier, tokenType: 'FIRST_LOGIN' as any, isUsed: false },
        'attemptCount', 1
      );
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (now() > resetToken.expiresAt) {
      await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    if (resetToken.attemptCount >= 5) {
      await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('Too many failed attempts. Please request a new OTP.');
    }

    // Mark OTP verified
    await this.passwordResetTokenRepository.update(resetToken.id, {
      isOtpVerified: true, updatedAt: now(),
    });

    // Find user by identifier
    let user: UserEntity | null = null;
    if (dto.channel === 'phone') {
      user = await this.userRepository.findOne({
        where: { phoneNumber: lookupIdentifier, isActive: true }
      });
    } else {
      user = await this.userRepository.findOne({
        where: { email: lookupIdentifier, isActive: true }
      });
    }

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Mark this channel as verified
    if (dto.channel === 'phone') {
      await this.userRepository.update(user.id, { isPhoneVerified: true, updatedAt: now() });
      user.isPhoneVerified = true;
    } else {
      await this.userRepository.update(user.id, { isEmailVerified: true, updatedAt: now() });
      user.isEmailVerified = true;
    }

    // Build annotated profile
    const { profile, studentFields, parentFields } = await this.buildAnnotatedProfile(user);

    // Create JWT for subsequent steps
    const access_token = this.jwtService.sign(
      { sub: user.id, type: 'first_login_profile', iat: Math.floor(nowTimestamp() / 1000) },
      { expiresIn: '30d' }
    );

    // Calculate remaining verifications
    const stillNeedsPhoneVerification = !!user.phoneNumber && !user.isPhoneVerified;
    const stillNeedsEmailVerification = !!user.email && !user.isEmailVerified;

    // Log
    const loginLog = this.firstLoginLogRepository.create({
      userId: user.id,
      email: lookupIdentifier,
      status: 'OTP_VERIFIED',
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
      userAgent,
      notes: `${dto.channel} OTP verified - annotated profile returned`
    });
    await this.firstLoginLogRepository.save(loginLog);

    return {
      success: true,
      message: `${dto.channel === 'phone' ? 'Phone' : 'Email'} verified successfully. Complete your profile.`,
      access_token,
      userId: user.id,
      isPhoneVerified: user.isPhoneVerified,
      isEmailVerified: user.isEmailVerified,
      hasPassword: !!user.password,
      verificationsStillRequired: {
        phone: stillNeedsPhoneVerification,
        email: stillNeedsEmailVerification,
      },
      userHasPhone: !!user.phoneNumber,
      userHasEmail: !!user.email,
      profile,
      studentFields,
      parentFields,
    };
  }

  /**
   * Build annotated profile with field metadata for frontend
   */
  private async buildAnnotatedProfile(user: UserEntity): Promise<{
    profile: Record<string, any>;
    studentFields?: Record<string, any>;
    parentFields?: Record<string, any>;
  }> {
    const { StudentEntity } = await import('../../modules/student/entities/student.entity');
    const { ParentEntity } = await import('../../modules/parent/entities/parent.entity');
    const studentRepo = this.userRepository.manager.getRepository(StudentEntity);
    const parentRepo = this.userRepository.manager.getRepository(ParentEntity);

    const student = await studentRepo.findOne({ where: { userId: user.id } });
    const parent = await parentRepo.findOne({ where: { userId: user.id } });

    const profile: Record<string, any> = {
      id: { value: user.id, editable: false, required: false },
      firstName: { value: user.firstName || null, editable: true, required: true },
      lastName: { value: user.lastName || null, editable: true, required: true },
      nameWithInitials: { value: user.nameWithInitials || null, editable: true, required: false },
      email: {
        value: user.email || null,
        editable: !user.email, // Can add email if empty; can't change if admin set it
        required: true,
        needsVerification: !user.isEmailVerified,
        isVerified: user.isEmailVerified,
      },
      phoneNumber: {
        value: user.phoneNumber || null,
        editable: !user.phoneNumber, // Can add phone if empty; can't change if already set
        required: true,
        needsVerification: user.phoneNumber ? !user.isPhoneVerified : false,
        isVerified: user.isPhoneVerified,
      },
      userType: {
        value: user.userType || UserType.USER,
        editable: true,
        required: true,
        options: [UserType.USER, UserType.USER_WITHOUT_PARENT, UserType.USER_WITHOUT_STUDENT]
      },
      dateOfBirth: { 
        value: user.dateOfBirth 
          ? (user.dateOfBirth instanceof Date 
              ? user.dateOfBirth.toISOString().split('T')[0] 
              : user.dateOfBirth) 
          : null, 
        editable: true, 
        required: false 
      },
      gender: { value: user.gender || null, editable: true, required: false, options: ['MALE', 'FEMALE', 'OTHER'] },
      nic: { value: user.nic || null, editable: true, required: false },
      birthCertificateNo: { value: user.birthCertificateNo || null, editable: false, required: false },
      addressLine1: { value: user.addressLine1 || null, editable: true, required: false },
      addressLine2: { value: user.addressLine2 || null, editable: true, required: false },
      city: { value: user.city || null, editable: true, required: false },
      district: { value: user.district || null, editable: true, required: false },
      province: { value: user.province || null, editable: true, required: false },
      country: { value: user.country || 'SRI_LANKA', editable: true, required: false },
      imageUrl: {
        value: user.imageUrl ? this.cloudStorageService.getFullUrl(user.imageUrl) : null,
        editable: !user.imageUrl,
        required: false
      },
    };

    // Student fields
    let studentFields: Record<string, any> | undefined;
    if (student) {
      studentFields = {
        studentId: { value: student.studentId || null, editable: false, required: false },
        emergencyContact: { value: student.emergencyContact || null, editable: true, required: false },
        medicalConditions: { value: student.medicalConditions || null, editable: true, required: false },
        allergies: { value: student.allergies || null, editable: true, required: false },
        bloodGroup: {
          value: student.bloodGroup || null, editable: true, required: false,
          options: ['A+','A-','B+','B-','AB+','AB-','O+','O-']
        },
      };
    }

    // Parent fields
    let parentFields: Record<string, any> | undefined;
    if (parent) {
      parentFields = {
        occupation: { value: parent.occupation || null, editable: true, required: false },
        workplace: { value: parent.workplace || null, editable: true, required: false },
        workPhone: { value: parent.workPhone || null, editable: true, required: false },
        educationLevel: { value: parent.educationLevel || null, editable: true, required: false },
      };
    }

    return { profile, studentFields, parentFields };
  }

  /**
   * Phone-only initiation (backward compat / direct phone entry)
   */
  async initiateFirstLoginByPhone(
    dto: InitiateFirstLoginByPhoneDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; message: string; expiresInMinutes: number }> {
    // Delegate to unified method
    const result = await this.initiateFirstLoginUnified(
      { identifier: dto.phoneNumber }, ipAddress, userAgent
    );
    return {
      success: result.success,
      message: result.message,
      expiresInMinutes: result.expiresInMinutes,
    };
  }

  /**
   * Verify phone OTP (backward compat / direct phone verify)
   */
  async verifyPhoneOtpFirstLogin(
    dto: VerifyPhoneOtpFirstLoginDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<any> {
    return this.verifyFirstLoginOtp(
      { identifier: dto.phoneNumber, otp: dto.otp, channel: 'phone' },
      ipAddress, userAgent
    );
  }

  /**
   * Request phone OTP during profile completion (requires JWT).
   * Used when user initiated via email/systemId and needs to verify their phone.
   */
  async requestPhoneOtpInFlow(
    dto: RequestPhoneOtpFirstLoginDto,
    authorizationHeader: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string; expiresInMinutes: number }> {
    const userId = this.extractUserIdFromToken(authorizationHeader);
    const normalizedPhone = normalizeSriLankanPhone(dto.phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format. Use Sri Lankan format: 077X, 94X, +94X');
    }

    // Check phone not taken by another user
    const existingUser = await this.userRepository.findOne({
      where: { phoneNumber: normalizedPhone },
      select: ['id']
    });
    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException('This phone number is already registered by another user.');
    }

    // Update user's phone if not set yet
    const user = await this.userRepository.findOne({ where: { id: userId, isActive: true } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.phoneNumber) {
      await this.userRepository.update(userId, { phoneNumber: normalizedPhone, updatedAt: now() });
    }

    await this.sendFirstLoginPhoneOtp(normalizedPhone, userId, ipAddress);

    return {
      success: true,
      message: `OTP sent to ${maskPii(normalizedPhone)} via SMS. Valid for 15 minutes.`,
      expiresInMinutes: 15
    };
  }

  /**
   * Request a WhatsApp reverse-OTP for phone verification during first login (requires JWT).
   * Returns a wa.me link; the user sends the pre-filled message to verify.
   */
  async requestPhoneOtpInFlowWhatsApp(
    dto: RequestPhoneOtpFirstLoginDto,
    authorizationHeader: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string; waLink: string; expiresAt: Date }> {
    const userId = this.extractUserIdFromToken(authorizationHeader);
    const normalizedPhone = normalizeSriLankanPhone(dto.phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format. Use Sri Lankan format: 077X, 94X, +94X');
    }
    if (!process.env.WHATSAPP_BUSINESS_NUMBER) {
      throw new BadRequestException('WhatsApp verification is not configured on this server.');
    }

    const existingUser = await this.userRepository.findOne({ where: { phoneNumber: normalizedPhone }, select: ['id'] });
    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException('This phone number is already registered by another user.');
    }

    const user = await this.userRepository.findOne({ where: { id: userId, isActive: true } });
    if (!user) throw new NotFoundException('User not found');

    if (!user.phoneNumber) {
      await this.userRepository.update(userId, { phoneNumber: normalizedPhone, updatedAt: now() });
    }

    // Expire previous in-flight WhatsApp OTPs for this number
    await this.userOtpRepository.update(
      { userId, phoneNumber: normalizedPhone, otpPurpose: OtpPurpose.VERIFICATION, deliveryMethod: OtpDeliveryMethod.WHATSAPP, isVerified: false, expiresAt: MoreThan(now()) },
      { expiresAt: now() },
    );

    const otpCode = this.generateOTP();
    const expiresAt = new Date(nowTimestamp() + 15 * 60 * 1000);

    const otp = this.userOtpRepository.create({
      userId,
      phoneNumber: normalizedPhone,
      otpCode,
      otpType: OtpType.PHONE,
      otpPurpose: OtpPurpose.VERIFICATION,
      deliveryMethod: OtpDeliveryMethod.WHATSAPP,
      expiresAt,
      createdAt: now(),
      createdDate: new Date().toISOString().split('T')[0],
      ipAddress,
    });
    await this.userOtpRepository.save(otp);

    const businessNumber = (process.env.WHATSAPP_BUSINESS_NUMBER || '').replace(/[^\d]/g, '');
    const waLink = `https://wa.me/${businessNumber}?text=${encodeURIComponent(`OTP ${otpCode}`)}`;

    this.logger.log(`📱 WhatsApp first-login OTP link generated for user ${userId}: ${maskPii(normalizedPhone)}`);

    return {
      success: true,
      message: 'Tap the WhatsApp link (or scan the QR) and send the pre-filled message to verify your phone.',
      waLink,
      expiresAt,
    };
  }

  /**
   * Status check for WhatsApp phone OTP during first login.
   * Returns verified=true once the webhook has confirmed the message.
   */
  async getPhoneOtpStatusInFlow(
    phoneNumber: string,
    authorizationHeader: string,
  ): Promise<{ verified: boolean; expired: boolean }> {
    this.extractUserIdFromToken(authorizationHeader); // just validates token
    const normalizedPhone = normalizeSriLankanPhone(phoneNumber);
    if (!normalizedPhone) throw new BadRequestException('Invalid phone number format');

    const otp = await this.userOtpRepository.findOne({
      where: {
        phoneNumber: normalizedPhone,
        otpPurpose: OtpPurpose.VERIFICATION,
        deliveryMethod: OtpDeliveryMethod.WHATSAPP,
      },
      order: { createdAt: 'DESC' },
    });

    if (!otp) return { verified: false, expired: false };
    if (otp.isVerified) return { verified: true, expired: false };
    if (now() > otp.expiresAt) return { verified: false, expired: true };
    return { verified: false, expired: false };
  }

  /**
   * Verify phone OTP during profile completion (requires JWT).
   */
  async verifyPhoneOtpInFlow(
    dto: VerifyPhoneOtpInFlowDto,
    authorizationHeader: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string; phoneNumber: string }> {
    const userId = this.extractUserIdFromToken(authorizationHeader);
    const normalizedPhone = normalizeSriLankanPhone(dto.phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format');
    }

    // Find OTP token
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        email: normalizedPhone,
        otp: dto.otp,
        tokenType: 'FIRST_LOGIN' as any,
        isUsed: false,
      },
      order: { createdAt: 'DESC' }
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    if (now() > resetToken.expiresAt) {
      await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    // Mark verified
    resetToken.isUsed = true;
    resetToken.isOtpVerified = true;
    resetToken.updatedAt = now();
    await this.passwordResetTokenRepository.save(resetToken);

    // Update user
    await this.userRepository.update(userId, {
      phoneNumber: normalizedPhone,
      isPhoneVerified: true,
      updatedAt: now()
    });

    this.logger.log(`✅ Phone verified in-flow for user ${userId}: ${maskPii(normalizedPhone)}`);

    return {
      success: true,
      message: 'Phone number verified successfully.',
      phoneNumber: normalizedPhone
    };
  }

  /**
   * Request email OTP during first login (requires JWT).
   */
  async requestEmailOtpFirstLogin(
    dto: RequestEmailOtpFirstLoginDto,
    authorizationHeader: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string; expiresInMinutes: number }> {
    const userId = this.extractUserIdFromToken(authorizationHeader);
    const email = dto.email.toLowerCase();

    // Get user for name
    const currentUser = await this.userRepository.findOne({
      where: { id: userId, isActive: true },
      select: ['id', 'firstName', 'nameWithInitials']
    });
    if (!currentUser) {
      throw new NotFoundException('User not found');
    }

    // Check email not taken by another user
    const existingUser = await this.userRepository.findOne({
      where: { email },
      select: ['id']
    });

    if (existingUser && existingUser.id !== userId) {
      throw new BadRequestException('This email is already registered by another user. Please use a different email.');
    }

    // Invalidate previous OTPs for this email
    await this.passwordResetTokenRepository.update(
      { email, tokenType: 'EMAIL_VERIFICATION' as any, isUsed: false },
      { isUsed: true, updatedAt: now() }
    );

    const otp = this.generateOTP();
    const expiresAt = new Date(nowTimestamp() + (15 * 60 * 1000));

    const resetToken = this.passwordResetTokenRepository.create({
      email,
      otp,
      tokenType: 'EMAIL_VERIFICATION' as any,
      expiresAt,
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
    });
    await this.passwordResetTokenRepository.save(resetToken);

    const userName = currentUser.nameWithInitials || currentUser.firstName || 'User';
    try {
      await this.enhancedEmailService.sendOTP({
        email,
        otp,
        userName,
        expiryMinutes: '15',
        requestType: 'Email Verification (First Login)',
        ipAddress: ipAddress || 'Unknown'
      });
    } catch (emailError) {
      this.logger.error(`❌ Failed to send verification email to ${maskPii(email)}: ${emailError.message}`);
    }

    return {
      success: true,
      message: `OTP sent to ${maskPii(email)}. Valid for 15 minutes.`,
      expiresInMinutes: 15
    };
  }

  /**
   * Verify email OTP during first login (requires JWT).
   */
  async verifyEmailOtpFirstLogin(
    dto: VerifyEmailOtpFirstLoginDto,
    authorizationHeader: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string; email: string }> {
    const userId = this.extractUserIdFromToken(authorizationHeader);
    const email = dto.email.toLowerCase();

    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        email,
        otp: dto.otpCode,
        tokenType: 'EMAIL_VERIFICATION' as any,
        isUsed: false,
      },
      order: { createdAt: 'DESC' }
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    if (now() > resetToken.expiresAt) {
      await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    resetToken.isUsed = true;
    resetToken.isOtpVerified = true;
    resetToken.updatedAt = now();
    await this.passwordResetTokenRepository.save(resetToken);

    await this.userRepository.update(userId, {
      email,
      isEmailVerified: true,
      updatedAt: now()
    });

    this.logger.log(`✅ Email verified for user ${userId}: ${maskPii(email)}`);

    return {
      success: true,
      message: 'Email verified successfully.',
      email
    };
  }

  /**
   * Step Final: Complete first login profile.
   * - Save all profile data + password
   * - Enforce verification requirements:
   *   • If user has phone → must be verified
   *   • If user has email → must be verified
   *   • At least one contact method must exist and be verified
   * - Return real login tokens
   */
  async completeFirstLoginProfile(
    dto: CompleteFirstLoginProfileDto,
    authorizationHeader: string,
    ipAddress?: string,
    userAgent?: string,
    rememberMe: boolean = false
  ): Promise<any> {
    const userId = this.extractUserIdFromToken(authorizationHeader);

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ── Enforce verification requirements ──
    const hasPhone = !!user.phoneNumber;
    const hasEmail = !!user.email;
    const errors: string[] = [];

    if (hasPhone && !user.isPhoneVerified) {
      errors.push('Phone number must be verified before completing profile.');
    }
    if (hasEmail && !user.isEmailVerified) {
      errors.push('Email must be verified before completing profile.');
    }
    if (!hasPhone && !hasEmail) {
      errors.push('At least one contact method (phone or email) is required.');
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join(' '));
    }

    // Hash password
    const hashedPassword = await this.authService.hashPassword(dto.password);

    // Build update data
    const updateData: Partial<UserEntity> = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      password: hashedPassword,
      passwordSetAt: now(),
      firstLoginCompleted: true,
      updatedAt: now(),
    };

    updateData.nameWithInitials = dto.nameWithInitials ||
      `${dto.firstName.charAt(0).toUpperCase()}. ${dto.lastName}`;

    if (dto.userType) {
      const allowedTypes = [UserType.USER, UserType.USER_WITHOUT_PARENT, UserType.USER_WITHOUT_STUDENT];
      if (allowedTypes.includes(dto.userType as UserType)) {
        updateData.userType = dto.userType as UserType;
      }
    }

    if (dto.dateOfBirth) updateData.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.gender) {
      const { Gender } = await import('../../modules/user/enums/gender.enum');
      if (Object.values(Gender).includes(dto.gender as any)) {
        updateData.gender = dto.gender as any;
      }
    }
    if (dto.nic) updateData.nic = dto.nic;
    if (dto.addressLine1) updateData.addressLine1 = dto.addressLine1;
    if (dto.addressLine2) updateData.addressLine2 = dto.addressLine2;
    if (dto.city) updateData.city = dto.city;
    if (dto.district) {
      const { District } = await import('../../modules/user/enums/district.enum');
      if (Object.values(District).includes(dto.district as any)) {
        updateData.district = dto.district as any;
      }
    }
    if (dto.province) {
      const { Province } = await import('../../modules/user/enums/province.enum');
      if (Object.values(Province).includes(dto.province as any)) {
        updateData.province = dto.province as any;
      }
    }
    if (dto.country) {
      const { Country } = await import('../../modules/user/enums/country.enum');
      if (Object.values(Country).includes(dto.country as any)) {
        updateData.country = dto.country as any;
      }
    }

    if (dto.imageUrl && !user.imageUrl) {
      updateData.imageUrl = dto.imageUrl;
      // Set image verification status to PENDING when image is uploaded during first login
      updateData.imageVerificationStatus = ImageVerificationStatus.PENDING;
      updateData.imageVerifiedBy = null;
      updateData.imageVerifiedAt = null;
      updateData.imageRejectionReason = null;
    }

    // Profile completion
    const mergedUser = { ...user, ...updateData, password: hashedPassword };
    updateData.profileCompletionStatus = determineProfileStatus(mergedUser as any);
    updateData.profileCompletionPercentage = calculateProfileCompletion(mergedUser as any);

    await this.userRepository.update(userId, updateData);

    // Student data
    const { StudentEntity } = await import('../../modules/student/entities/student.entity');
    const studentRepo = this.userRepository.manager.getRepository(StudentEntity);
    const student = await studentRepo.findOne({ where: { userId } });
    if (student) {
      const studentUpdate: any = { updatedAt: now() };
      if (dto.emergencyContact) studentUpdate.emergencyContact = dto.emergencyContact;
      if (dto.medicalConditions) studentUpdate.medicalConditions = dto.medicalConditions;
      if (dto.allergies) studentUpdate.allergies = dto.allergies;
      if (dto.bloodGroup) studentUpdate.bloodGroup = dto.bloodGroup;
      if (Object.keys(studentUpdate).length > 1) {
        await studentRepo.update({ userId }, studentUpdate);
      }
    }

    // Parent data
    const { ParentEntity } = await import('../../modules/parent/entities/parent.entity');
    const parentRepo = this.userRepository.manager.getRepository(ParentEntity);
    const parent = await parentRepo.findOne({ where: { userId } });
    if (parent) {
      const parentUpdate: any = { updatedAt: now() };
      if (dto.occupation) parentUpdate.occupation = dto.occupation;
      if (dto.workplace) parentUpdate.workplace = dto.workplace;
      if (dto.workPhone) parentUpdate.workPhone = dto.workPhone;
      if (dto.educationLevel) parentUpdate.educationLevel = dto.educationLevel;
      if (Object.keys(parentUpdate).length > 1) {
        await parentRepo.update({ userId }, parentUpdate);
      }
    }

    // Invalidate all first-login OTP tokens
    if (user.phoneNumber) {
      await this.passwordResetTokenRepository.update(
        { email: user.phoneNumber, tokenType: 'FIRST_LOGIN' as any, isUsed: false },
        { isUsed: true, updatedAt: now() }
      );
    }
    if (user.email) {
      await this.passwordResetTokenRepository.update(
        { email: user.email, tokenType: 'FIRST_LOGIN' as any, isUsed: false },
        { isUsed: true, updatedAt: now() }
      );
    }

    // Refresh cache
    try {
      await this.userManagementService.refreshUserCache(userId);
      await this.userManagementService.setUserIndexes(userId);
    } catch (cacheError) {
      this.logger.warn(`Cache refresh failed after first login for user ${userId}: ${cacheError.message}`);
    }

    // Log
    const loginLog = this.firstLoginLogRepository.create({
      userId,
      email: user.email || user.phoneNumber || '',
      status: 'COMPLETED',
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
      userAgent,
      notes: 'First login completed - profile saved, password set'
    });
    await this.firstLoginLogRepository.save(loginLog);

    // Real login tokens
    const updatedUser = await this.userRepository.findOne({ where: { id: userId } });
    if (!updatedUser) throw new NotFoundException('User not found after update');

    const loginResult = await this.authService.loginV2(
      updatedUser, ipAddress, userAgent, rememberMe
    );

    this.logger.log(`✅ First login completed for user ${userId}`);

    return {
      success: true,
      message: 'Profile completed and logged in successfully.',
      access_token: loginResult.access_token,
      refresh_token: loginResult.refresh_token,
      expires_in: loginResult.expires_in,
      refresh_expires_in: loginResult.refresh_expires_in,
      user: loginResult.user,
    };
  }

  /**
   * Extract userId from first-login JWT token
   */
  private extractUserIdFromToken(authorizationHeader: string): string {
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      throw new BadRequestException('Authorization header required. Use the token from verification step.');
    }

    const token = authorizationHeader.substring(7);
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new BadRequestException('Invalid or expired token. Please verify your identity again.');
    }

    const userId = payload.sub;
    if (!userId) {
      throw new BadRequestException('Invalid token - user ID not found');
    }

    return userId;
  }
}
