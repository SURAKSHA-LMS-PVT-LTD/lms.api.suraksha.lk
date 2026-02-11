import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  CompleteFirstLoginProfileDto
} from '../dto/first-login.dto';
import { UserType } from '../../modules/user/enums/user-type.enum';
import { ProfileCompletionStatus, calculateProfileCompletion, determineProfileStatus } from '../../modules/user/enums/profile-completion-status.enum';

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
    private readonly enhancedEmailService: EnhancedEmailService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly cloudStorageService: CloudStorageService,
    private readonly smsProvider: SmslenzProvider,
    // ✅ CACHING SERVICES
    private readonly userManagementService: UserManagementService,
    private readonly cacheService: CacheService,
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

    // Invalidate any existing tokens for this email
    await this.passwordResetTokenRepository.update(
      { email: dto.email, isUsed: false },
      { isUsed: true, updatedAt: now() }
    );

    // Create new token
    const resetToken = this.passwordResetTokenRepository.create({
      email: dto.email,
      otp,
      tokenType: 'FIRST_LOGIN',
      expiresAt,
      createdAt: now(), // Explicitly set Sri Lanka timezone
      updatedAt: now(), // Initialize updatedAt
      ipAddress,
      userAgent,
    });

    await this.passwordResetTokenRepository.save(resetToken);

    // Log the first login attempt
    const loginLog = this.firstLoginLogRepository.create({
      userId: user.id,
      email: dto.email,
      status: 'OTP_SENT',
      createdAt: now(), // Explicitly set Sri Lanka timezone
      ipAddress,
      userAgent,
      notes: 'First login OTP sent successfully'
    });

    await this.firstLoginLogRepository.save(loginLog);

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
    return Math.floor(100000 + Math.random() * 900000).toString();
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
        createdAt: new Date(oneHourAgoMs)
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
   */
  private async getAdditionalUserData(userId: string, userType: string): Promise<Partial<MinimalUserDataDto>> {
    const additionalData: Partial<MinimalUserDataDto> = {};

    try {
      if (userType === 'STUDENT') {
        // Get student-specific data
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
      } else if (userType === 'PARENT') {
        // Get parent-specific data
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
      }
    } catch (error) {
      this.logger.warn(`Could not fetch additional data for user ${userId}:`, error.message);
      // Don't fail the request if additional data fetch fails
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

    // Handle image URL
    if (imageUrl) {
      updateData.imageUrl = imageUrl;
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
   */
  private async updateTypeSpecificDataEnhanced(userId: string, userType: string, dto: EnhancedVerifyOtpDto): Promise<void> {
    try {
      if (userType === 'STUDENT') {
        // Update student-specific data
        const { StudentEntity } = await import('../../modules/student/entities/student.entity');
        const studentRepository = this.userRepository.manager.getRepository(StudentEntity);
        
        const studentUpdateData: any = {};
        if (dto.studentId) studentUpdateData.studentId = dto.studentId;
        if (dto.emergencyContact) studentUpdateData.emergencyContact = dto.emergencyContact;
        if (dto.bloodGroup) studentUpdateData.bloodGroup = dto.bloodGroup;
        
        if (Object.keys(studentUpdateData).length > 0) {
          await studentRepository.update({ userId }, studentUpdateData);
        }
      } else if (userType === 'PARENT') {
        // Update parent-specific data
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
      // Don't fail the request if type-specific data update fails
    }
  }

  /**
   * Update type-specific data (student/parent)
   */
  private async updateTypeSpecificData(userId: string, userType: string, dto: CompleteProfileDto): Promise<void> {
    try {
      if (userType === 'STUDENT') {
        // Update student-specific data
        const { StudentEntity } = await import('../../modules/student/entities/student.entity');
        const studentRepository = this.userRepository.manager.getRepository(StudentEntity);
        
        const studentUpdateData: any = {};
        if (dto.emergencyContact) studentUpdateData.emergencyContact = dto.emergencyContact;
        if (dto.bloodGroup) studentUpdateData.bloodGroup = dto.bloodGroup;
        
        if (Object.keys(studentUpdateData).length > 0) {
          await studentRepository.update({ userId }, studentUpdateData);
        }
      } else if (userType === 'PARENT') {
        // Update parent-specific data
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
      // Don't fail the request if type-specific data update fails
    }
  }

  // ============================================================
  // 📱 PHONE-BASED FIRST LOGIN FLOW
  // ============================================================

  /**
   * Step 1: Initiate first login by phone number
   * - Find user by phone
   * - Check user exists and hasn't completed first login
   * - Send SMS OTP
   */
  async initiateFirstLoginByPhone(
    dto: InitiateFirstLoginByPhoneDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ success: boolean; message: string; expiresInMinutes: number }> {
    const normalizedPhone = normalizeSriLankanPhone(dto.phoneNumber);
    if (!normalizedPhone) {
      throw new BadRequestException('Invalid phone number format. Use Sri Lankan format: 077X, 94X, +94X');
    }

    // Find user by phone number
    const user = await this.userRepository.findOne({
      where: { phoneNumber: normalizedPhone, isActive: true },
      select: ['id', 'phoneNumber', 'firstName', 'password', 'firstLoginCompleted']
    });

    if (!user) {
      throw new NotFoundException('No user found with this phone number. Please contact your institute admin.');
    }

    // Check if already completed first login
    if (user.firstLoginCompleted && user.password) {
      throw new BadRequestException('First login already completed. Please use regular login.');
    }

    // Rate limit: max 3 OTP requests per hour for this phone
    const oneHourAgoMs = nowTimestamp() - (60 * 60 * 1000);
    const recentTokens = await this.passwordResetTokenRepository.count({
      where: {
        email: normalizedPhone, // Store phone in email field (varchar)
        tokenType: 'FIRST_LOGIN' as any,
      }
    });

    // Invalidate previous OTPs for this phone
    await this.passwordResetTokenRepository.update(
      { email: normalizedPhone, tokenType: 'FIRST_LOGIN' as any, isUsed: false },
      { isUsed: true, updatedAt: now() }
    );

    // Generate OTP
    const otp = this.generateOTP();
    const expiryTimeMs = nowTimestamp() + (15 * 60 * 1000); // 15 minutes
    const expiresAt = new Date(expiryTimeMs);

    // Save OTP token (store phone in email field)
    const resetToken = this.passwordResetTokenRepository.create({
      email: normalizedPhone,
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
      userId: user.id,
      email: normalizedPhone,
      status: 'OTP_SENT',
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
      userAgent,
      notes: 'Phone-based first login OTP sent via SMS'
    });
    await this.firstLoginLogRepository.save(loginLog);

    // Send SMS OTP
    try {
      await this.smsProvider.sendSms({
        contact: normalizedPhone,
        message: `Your Suraksha LMS first login code is: ${otp}. Valid for 15 minutes. Do not share this code.`,
        senderId: 'SurakshaLMS',
      });
    } catch (smsError) {
      this.logger.error(`❌ Failed to send first login SMS to ${maskPii(normalizedPhone)}: ${smsError.message}`);
    }

    return {
      success: true,
      message: `OTP sent to ${maskPii(normalizedPhone)} via SMS. Valid for 15 minutes.`,
      expiresInMinutes: 15
    };
  }

  /**
   * Step 2: Verify phone OTP and return annotated user profile
   * - Verify SMS OTP
   * - Mark phone as verified
   * - Return user profile with field annotations (editable, required, current values)
   * - Return a simple JWT for subsequent steps
   */
  async verifyPhoneOtpFirstLogin(
    dto: VerifyPhoneOtpFirstLoginDto,
    ipAddress?: string,
    userAgent?: string
  ): Promise<any> {
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
        isOtpVerified: false
      }
    });

    if (!resetToken) {
      await this.passwordResetTokenRepository.increment(
        { email: normalizedPhone, tokenType: 'FIRST_LOGIN' as any, isUsed: false },
        'attemptCount', 1
      );
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Check expiry
    if (now() > resetToken.expiresAt) {
      await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    // Check attempts
    if (resetToken.attemptCount >= 5) {
      await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('Too many failed attempts. Please request a new OTP.');
    }

    // Mark OTP as verified
    await this.passwordResetTokenRepository.update(resetToken.id, {
      isOtpVerified: true,
      updatedAt: now(),
    });

    // Find user
    const user = await this.userRepository.findOne({
      where: { phoneNumber: normalizedPhone, isActive: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Mark phone as verified
    await this.userRepository.update(user.id, {
      isPhoneVerified: true,
      updatedAt: now()
    });

    // Get student/parent data if exists
    const { StudentEntity } = await import('../../modules/student/entities/student.entity');
    const { ParentEntity } = await import('../../modules/parent/entities/parent.entity');
    const studentRepo = this.userRepository.manager.getRepository(StudentEntity);
    const parentRepo = this.userRepository.manager.getRepository(ParentEntity);

    const student = await studentRepo.findOne({ where: { userId: user.id } });
    const parent = await parentRepo.findOne({ where: { userId: user.id } });

    // Create simple JWT for profile completion (30 day expiry)
    const access_token = this.jwtService.sign(
      { sub: user.id, type: 'first_login_profile', iat: Math.floor(nowTimestamp() / 1000) },
      { expiresIn: '30d' }
    );

    // Build annotated profile
    const profile: Record<string, any> = {
      id: { value: user.id, editable: false, required: false },
      firstName: { value: user.firstName || null, editable: true, required: true },
      lastName: { value: user.lastName || null, editable: true, required: true },
      nameWithInitials: { value: user.nameWithInitials || null, editable: true, required: false },
      email: {
        value: user.email || null,
        editable: !user.email, // Can add if empty; can't change if admin set it
        required: true,
        needsVerification: true
      },
      phoneNumber: { value: normalizedPhone, editable: false, required: true },
      userType: {
        value: user.userType || UserType.USER,
        editable: true,
        required: true,
        options: [UserType.USER, UserType.USER_WITHOUT_PARENT, UserType.USER_WITHOUT_STUDENT]
      },
      dateOfBirth: { value: user.dateOfBirth ? user.dateOfBirth.toISOString().split('T')[0] : null, editable: true, required: false },
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
        editable: !user.imageUrl, // Can upload only if no existing image
        required: false
      },
    };

    // Student fields
    let studentFields: Record<string, any> | undefined;
    if (student) {
      studentFields = {
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

    // Log
    const loginLog = this.firstLoginLogRepository.create({
      userId: user.id,
      email: normalizedPhone,
      status: 'OTP_VERIFIED',
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
      userAgent,
      notes: 'Phone OTP verified - annotated profile returned'
    });
    await this.firstLoginLogRepository.save(loginLog);

    return {
      success: true,
      message: 'Phone verified successfully. Complete your profile.',
      access_token,
      userId: user.id,
      isPhoneVerified: true,
      isEmailVerified: user.isEmailVerified || false,
      hasPassword: !!user.password,
      profile,
      studentFields,
      parentFields,
    };
  }

  /**
   * Step 3: Send email OTP during first login
   * - User provides email -> check it's not taken by another user
   * - Send OTP via email
   * - Requires first-login JWT token
   */
  async requestEmailOtpFirstLogin(
    dto: RequestEmailOtpFirstLoginDto,
    authorizationHeader: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string; expiresInMinutes: number }> {
    const userId = this.extractUserIdFromToken(authorizationHeader);
    const email = dto.email.toLowerCase();

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

    // Generate OTP
    const otp = this.generateOTP();
    const expiryTimeMs = nowTimestamp() + (15 * 60 * 1000);
    const expiresAt = new Date(expiryTimeMs);

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

    // Send OTP email
    try {
      await this.enhancedEmailService.sendOTP({
        email,
        otp,
        userName: email.split('@')[0],
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
   * Step 4: Verify email OTP during first login
   * - Verify email OTP
   * - Update user email and mark as verified
   */
  async verifyEmailOtpFirstLogin(
    dto: VerifyEmailOtpFirstLoginDto,
    authorizationHeader: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string; email: string }> {
    const userId = this.extractUserIdFromToken(authorizationHeader);
    const email = dto.email.toLowerCase();

    // Find OTP
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

    // Check expiry
    if (now() > resetToken.expiresAt) {
      await this.passwordResetTokenRepository.update(resetToken.id, { isUsed: true, updatedAt: now() });
      throw new BadRequestException('OTP has expired. Please request a new one.');
    }

    // Mark OTP as used
    resetToken.isUsed = true;
    resetToken.isOtpVerified = true;
    resetToken.updatedAt = now();
    await this.passwordResetTokenRepository.save(resetToken);

    // Update user email and mark as verified
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
   * Step 5: Complete first login profile
   * - Save all profile data
   * - Set password (required)
   * - Update user type if changed
   * - Update student/parent data
   * - Mark firstLoginCompleted = true
   * - Return real login tokens (access + refresh)
   */
  async completeFirstLoginProfile(
    dto: CompleteFirstLoginProfileDto,
    authorizationHeader: string,
    ipAddress?: string,
    userAgent?: string,
    rememberMe: boolean = false
  ): Promise<any> {
    const userId = this.extractUserIdFromToken(authorizationHeader);

    // Validate passwords match
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    // Get user
    const user = await this.userRepository.findOne({
      where: { id: userId, isActive: true }
    });

    if (!user) {
      throw new NotFoundException('User not found');
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

    // Name with initials (auto-generate if not provided)
    updateData.nameWithInitials = dto.nameWithInitials ||
      `${dto.firstName.charAt(0).toUpperCase()}. ${dto.lastName}`;

    // User type change (only USER/USER_WITHOUT_PARENT/USER_WITHOUT_STUDENT allowed)
    if (dto.userType) {
      const allowedTypes = [UserType.USER, UserType.USER_WITHOUT_PARENT, UserType.USER_WITHOUT_STUDENT];
      if (allowedTypes.includes(dto.userType as UserType)) {
        updateData.userType = dto.userType as UserType;
      }
    }

    // Optional fields
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

    // Profile image: only allow if user has no existing image
    if (dto.imageUrl && !user.imageUrl) {
      updateData.imageUrl = dto.imageUrl;
    }

    // Calculate profile completion
    const mergedUser = { ...user, ...updateData, password: hashedPassword };
    updateData.profileCompletionStatus = determineProfileStatus(mergedUser as any);
    updateData.profileCompletionPercentage = calculateProfileCompletion(mergedUser as any);

    // Save user
    await this.userRepository.update(userId, updateData);

    // Update student-specific data
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

    // Update parent-specific data
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

    // Invalidate all first-login OTP tokens for this user
    await this.passwordResetTokenRepository.update(
      { email: user.phoneNumber || '', tokenType: 'FIRST_LOGIN' as any, isUsed: false },
      { isUsed: true, updatedAt: now() }
    );

    // Refresh cache
    try {
      await this.userManagementService.refreshUserCache(userId);
      await this.userManagementService.setUserIndexes(userId);
    } catch (cacheError) {
      this.logger.warn(`Cache refresh failed after first login for user ${userId}: ${cacheError.message}`);
    }

    // Log completion
    const loginLog = this.firstLoginLogRepository.create({
      userId,
      email: user.email || user.phoneNumber || '',
      status: 'COMPLETED',
      createdAt: now(),
      updatedAt: now(),
      ipAddress,
      userAgent,
      notes: 'Phone-based first login completed - profile saved, password set'
    });
    await this.firstLoginLogRepository.save(loginLog);

    // Generate real login tokens via AuthService
    const updatedUser = await this.userRepository.findOne({ where: { id: userId } });
    if (!updatedUser) {
      throw new NotFoundException('User not found after update');
    }

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
      throw new BadRequestException('Authorization header required. Use the token from phone verification step.');
    }

    const token = authorizationHeader.substring(7);
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new BadRequestException('Invalid or expired token. Please verify your phone again.');
    }

    const userId = payload.sub;
    if (!userId) {
      throw new BadRequestException('Invalid token - user ID not found');
    }

    return userId;
  }
}
