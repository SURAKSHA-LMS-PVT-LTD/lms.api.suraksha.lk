import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getCurrentSriLankaTime, getCurrentSriLankaISO } from '../utils/timezone.util';
import { CacheService } from './cache.service';
import { UserEntity } from '../../modules/user/entities/user.entity';
import { StudentEntity } from '../../modules/student/entities/student.entity';
import { ParentEntity } from '../../modules/parent/entities/parent.entity';
import { InstituteUserEntity } from '../../modules/institute_mudules/institue_user/entities/institue_user.entity';

/**
 * 🚀 COMPREHENSIVE USER CACHE MANAGER
 * 
 * Caches complete user data needed for:
 * 1. Advertisement matching (userType, subscriptionPlan, occupation, location)
 * 2. Attendance marking (institute enrollments, profile images, verification status)
 * 3. Parent access (children relationships, emergency contacts)
 * 
 * Cache Structure:
 * - user:{userId} → Full user profile with occupation, images, demographics
 * - user:{userId}:institutes → List of institutes with enrollment details & images
 * - user:{userId}:access → Hierarchical access permissions
 * 
 * Auto-invalidation triggers:
 * - User creation/update → Refresh user cache
 * - Institute enrollment → Refresh institutes cache
 * - Image verification → Refresh specific institute image
 * - Status change → Refresh access cache
 */

export interface CachedUserProfile {
  // Basic Identity
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  
  // User Classification (for ads)
  userType: string;
  subscriptionPlan?: string;
  
  // Demographics (for ads)
  dateOfBirth?: string;
  age?: number;
  gender?: string;
  
  // Location (for ads)
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  province?: string;
  country?: string;
  
  // Professional (for ads - parents)
  occupation?: string;
  workplace?: string;
  educationLevel?: string;
  
  // Medical (for students)
  emergencyContact?: string;
  medicalConditions?: string;
  allergies?: string;
  bloodGroup?: string;
  
  // Global profile image
  imageUrl?: string;
  
  // Status
  isActive: boolean;
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface CachedInstituteEnrollment {
  instituteId: string;
  instituteName?: string;
  
  // Enrollment details
  userIdByInstitute?: string; // Institute-assigned ID (e.g., STU2024001)
  instituteUserType: string; // STUDENT, TEACHER, INSTITUTE_ADMIN, etc.
  status: string; // ACTIVE, PENDING, INACTIVE, FORMER
  
  // Images (priority: verified institute image > global image)
  imageUrl?: string; // Final resolved image URL
  instituteUserImageUrl?: string; // Institute-specific profile image
  globalImageUrl?: string; // User's global profile image
  imageVerificationStatus: string; // VERIFIED, PENDING, REJECTED
  
  // Verification
  verifiedAt?: string;
  verifiedBy?: string;
  
  // Access details
  isAdmin: boolean;
  classes?: string[]; // Class IDs enrolled in
  subjects?: string[]; // Subject IDs teaching/enrolled
  
  // Timestamps
  enrolledAt: string;
  updatedAt: string;
}

export interface CachedUserWithInstitutes extends CachedUserProfile {
  institutes: CachedInstituteEnrollment[];
}

@Injectable()
export class UserCacheManagerService {
  private readonly logger = new Logger(UserCacheManagerService.name);
  
  // Cache TTLs
  private readonly USER_PROFILE_TTL = 7200; // 2 hours
  private readonly INSTITUTE_LIST_TTL = 3600; // 1 hour
  
  constructor(
    private readonly cacheService: CacheService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
  ) {}

  // =================== MAIN CACHE OPERATIONS ===================

  /**
   * Get complete user profile with all institute enrollments
   * Used for: Attendance marking, ad targeting, profile display
   */
  async getUserWithInstitutes(userId: string): Promise<CachedUserWithInstitutes | null> {
    try {
      // Try cache first
      const cached = await this.cacheService.get<CachedUserWithInstitutes>(
        `user:${userId}:full`
      );
      
      if (cached) {
        return cached;
      }
      
      // Cache miss - build from database
      const userProfile = await this.buildUserProfile(userId);
      
      if (!userProfile) {
        return null;
      }
      
      // Cache for future use
      await this.cacheService.set(
        `user:${userId}:full`,
        userProfile,
        { ttl: this.USER_PROFILE_TTL }
      );
      
      return userProfile;
    } catch (error) {
      this.logger.error(`Failed to get user with institutes: ${error.message}`);
      // Fallback to database on cache failure
      return await this.buildUserProfile(userId);
    }
  }

  /**
   * Get user profile for advertisement matching
   * Optimized: Returns only fields needed for ad scoring
   */
  async getUserForAdMatching(userId: string): Promise<CachedUserProfile | null> {
    const fullUser = await this.getUserWithInstitutes(userId);
    
    if (!fullUser) {
      return null;
    }
    
    // Return profile without institutes array to reduce payload
    const { institutes, ...profile } = fullUser;
    return profile;
  }

  /**
   * Get user's institute enrollment details
   * Used for: Attendance marking with correct image URL
   */
  async getUserInstituteEnrollment(
    userId: string, 
    instituteId: string
  ): Promise<CachedInstituteEnrollment | null> {
    const fullUser = await this.getUserWithInstitutes(userId);
    
    if (!fullUser) {
      return null;
    }
    
    return fullUser.institutes.find(i => i.instituteId === instituteId) || null;
  }

  // =================== CACHE INVALIDATION (Smart Logic) ===================

  /**
   * Invalidate user cache when user is created/updated
   * Trigger: User registration, profile update
   */
  async invalidateUserCache(userId: string): Promise<void> {
    try {
      await Promise.all([
        this.cacheService.del(`user:${userId}:full`),
        this.cacheService.del(`user:${userId}:profile`),
        this.cacheService.del(`user:${userId}:access`),
      ]);
      
    } catch (error) {
      this.logger.error(`Failed to invalidate user cache: ${error.message}`);
    }
  }

  /**
   * Invalidate and rebuild cache when user enrolls in institute
   * Trigger: Institute enrollment, status change
   */
  async refreshUserCacheOnEnrollment(userId: string): Promise<void> {
    try {
      // Delete old cache
      await this.invalidateUserCache(userId);
      
      // Rebuild cache immediately
      await this.getUserWithInstitutes(userId);
      
    } catch (error) {
      this.logger.error(`Failed to refresh user cache on enrollment: ${error.message}`);
    }
  }

  /**
   * Update only institute-specific data without full rebuild
   * Trigger: Image verification, institute card update
   */
  async updateInstituteEnrollmentCache(
    userId: string, 
    instituteId: string, 
    updates: Partial<CachedInstituteEnrollment>
  ): Promise<void> {
    try {
      const fullUser = await this.cacheService.get<CachedUserWithInstitutes>(
        `user:${userId}:full`
      );
      
      if (!fullUser) {
        // Cache doesn't exist, rebuild it
        await this.getUserWithInstitutes(userId);
        return;
      }
      
      // Update specific institute enrollment
      const instituteIndex = fullUser.institutes.findIndex(
        i => i.instituteId === instituteId
      );
      
      if (instituteIndex !== -1) {
        fullUser.institutes[instituteIndex] = {
          ...fullUser.institutes[instituteIndex],
          ...updates,
          updatedAt: getCurrentSriLankaISO(),
        };
        
        // Save updated cache
        await this.cacheService.set(
          `user:${userId}:full`,
          fullUser,
          { ttl: this.USER_PROFILE_TTL }
        );
        
      }
    } catch (error) {
      this.logger.error(`Failed to update institute enrollment cache: ${error.message}`);
    }
  }

  /**
   * Bulk cache warming for multiple users
   * Used by: Attendance job, ad matching job
   */
  async warmCacheForUsers(userIds: string[]): Promise<void> {
    
    const batchSize = 50;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(userId => this.getUserWithInstitutes(userId))
      );
    }
  }

  // =================== PRIVATE HELPERS ===================

  /**
   * Build complete user profile from database
   */
  private async buildUserProfile(userId: string): Promise<CachedUserWithInstitutes | null> {
    // Fetch user
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    
    if (!user) {
      return null;
    }
    
    // Calculate age from dateOfBirth
    let age: number | undefined;
    if (user.dateOfBirth) {
      const birthDate = new Date(user.dateOfBirth);
      const today = getCurrentSriLankaTime();
      age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
    }
    
    // Build base profile
    const profile: CachedUserProfile = {
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      userType: user.userType,
      subscriptionPlan: user.subscriptionPlan,
      dateOfBirth: user.dateOfBirth?.toISOString(),
      age,
      gender: user.gender,
      addressLine1: user.addressLine1,
      addressLine2: user.addressLine2,
      city: user.city,
      district: user.district,
      province: user.province,
      country: user.country,
      imageUrl: user.imageUrl,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
    
    // Fetch parent-specific data if user is a parent
    const parent = await this.parentRepository.findOne({
      where: { userId },
      select: ['occupation', 'workplace', 'educationLevel'],
    });
    
    if (parent) {
      profile.occupation = parent.occupation;
      profile.workplace = parent.workplace;
      profile.educationLevel = parent.educationLevel;
    }
    
    // Fetch student-specific data if user is a student
    const student = await this.studentRepository.findOne({
      where: { userId },
      select: ['emergencyContact', 'medicalConditions', 'allergies', 'bloodGroup'],
    });
    
    if (student) {
      profile.emergencyContact = student.emergencyContact;
      profile.medicalConditions = student.medicalConditions;
      profile.allergies = student.allergies;
      profile.bloodGroup = student.bloodGroup;
    }
    
    // Fetch institute enrollments
    const instituteEnrollments = await this.instituteUserRepository.find({
      where: { userId },
      relations: ['institute'],
    });
    
    // Build institute enrollments with image priority logic
    const institutes: CachedInstituteEnrollment[] = instituteEnrollments.map(enrollment => {
      // Image priority:
      // 1. If imageVerificationStatus is VERIFIED → use instituteUserImageUrl
      // 2. Otherwise → use global user.imageUrl
      let finalImageUrl = user.imageUrl;
      
      if (enrollment.imageVerificationStatus === 'VERIFIED' && enrollment.instituteUserImageUrl) {
        finalImageUrl = enrollment.instituteUserImageUrl;
      }
      
      return {
        instituteId: enrollment.instituteId,
        instituteName: enrollment.institute?.name,
        userIdByInstitute: enrollment.userIdByInstitute,
        instituteUserType: enrollment.instituteUserType,
        status: enrollment.status,
        imageUrl: finalImageUrl,
        instituteUserImageUrl: enrollment.instituteUserImageUrl,
        globalImageUrl: user.imageUrl,
        imageVerificationStatus: enrollment.imageVerificationStatus,
        verifiedAt: enrollment.verifiedAt?.toISOString(),
        verifiedBy: enrollment.verifiedBy,
        isAdmin: enrollment.instituteUserType === 'INSTITUTE_ADMIN',
        enrolledAt: enrollment.createdAt.toISOString(),
        updatedAt: enrollment.updatedAt.toISOString(),
      };
    });
    
    return {
      ...profile,
      institutes,
    };
  }
}
