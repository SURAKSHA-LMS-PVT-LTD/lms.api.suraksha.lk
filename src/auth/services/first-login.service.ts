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
  CompleteUserDataDto
} from '../dto/first-login.dto';

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
      // Don't fail the first login if caching fails
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
      // Don't fail the profile completion if caching fails
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
}
