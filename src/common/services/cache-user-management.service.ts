import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UserEntity } from '../../modules/user/entities/user.entity';
import { StudentEntity } from '../../modules/student/entities/student.entity';
import { ParentEntity } from '../../modules/parent/entities/parent.entity';
import { CacheService, UserCacheData } from '../services/cache.service';
import { CloudStorageService } from './cloud-storage.service';

export interface UserCacheResult {
  success: boolean;
  message: string;
  userId: string;
  cached: boolean;
  cacheKey: string;
  ttl: number;
  error?: string;
}

export interface BulkUserCacheResult {
  successCount: number;
  errorCount: number;
  results: UserCacheResult[];
}

@Injectable()
export class UserManagementService {
  private readonly logger = new Logger(UserManagementService.name);
  private readonly isCachingEnabled: boolean;

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    private readonly cacheService: CacheService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly cloudStorageService: CloudStorageService,
  ) {
    // ✅ Check if user caching is enabled from environment variable
    const globalCacheEnabled = this.configService.get('CACHE_ENABLED') === 'true';
    const userCacheEnabled = this.configService.get('CACHE_USER_ENABLED') !== 'false'; // Default: enabled
    this.isCachingEnabled = globalCacheEnabled && userCacheEnabled;
    
    if (!globalCacheEnabled) {
      this.logger.warn('🚨 GLOBAL CACHING DISABLED - All cache operations will be skipped, using direct database access');
    } else if (!userCacheEnabled) {
      this.logger.warn('🚨 USER CACHING DISABLED - User cache operations will be skipped, using direct database access');
    }
  }

  async setUserCache(userId: string, refreshFromDatabase: boolean = false): Promise<UserCacheResult> {
    try {
      // 🚨 CONDITIONAL CACHING: Skip cache operations if caching is disabled
      if (!this.isCachingEnabled) {
        return {
          success: true,
          message: 'Cache set skipped - caching disabled',
          userId,
          cached: false,
          cacheKey: 'N/A (caching disabled)',
          ttl: 0,
          error: undefined
        };
      }

      // Check if already cached and not forcing refresh
      if (!refreshFromDatabase) {
        const existingCache = await this.cacheService.getUserCache(userId);
        if (existingCache) {
          return {
            success: true,
            message: 'User already cached',
            userId,
            cached: true,
            cacheKey: `user:details:${userId}`,
            ttl: await this.cacheService.ttl(`user:details:${userId}`)
          };
        }
      }

      // Fetch user data with all related information
      const userData = await this.fetchUserWithRelations(userId);
      
      if (!userData) {
        return {
          success: false,
          message: 'User not found in database',
          userId,
          cached: false,
          cacheKey: `user:details:${userId}`,
          ttl: 0,
          error: 'User not found'
        };
      }

      // Cache the user data
      const cacheSuccess = await this.cacheService.setUserCache(userId, userData);
      
      if (cacheSuccess) {
        return {
          success: true,
          message: 'User cached successfully',
          userId,
          cached: true,
          cacheKey: `user:details:${userId}`,
          ttl: await this.cacheService.ttl(`user:details:${userId}`)
        };
      } else {
        this.logger.error(`❌ CACHE SET FAILED: Failed to cache user ${userId} data`);
        return {
          success: false,
          message: 'Failed to cache user data',
          userId,
          cached: false,
          cacheKey: `user:details:${userId}`,
          ttl: 0,
          error: 'Cache operation failed'
        };
      }

    } catch (error) {
      this.logger.error(`❌ Failed to cache user ${userId}:`, error);
      return {
        success: false,
        message: 'Error occurred while caching user',
        userId,
        cached: false,
        cacheKey: `user:details:${userId}`,
        ttl: 0,
        error: error.message
      };
    }
  }

  async setBulkUserCache(userIds: string[], refreshFromDatabase: boolean = false): Promise<BulkUserCacheResult> {
    const results: UserCacheResult[] = [];
    let successCount = 0;
    let errorCount = 0;


    for (const userId of userIds) {
      try {
        const result = await this.setUserCache(userId, refreshFromDatabase);
        results.push(result);
        
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        errorCount++;
        results.push({
          success: false,
          message: 'Bulk operation error',
          userId,
          cached: false,
          cacheKey: `user:details:${userId}`,
          ttl: 0,
          error: error.message
        });
      }
    }
    
    return {
      successCount,
      errorCount,
      results
    };
  }

  private async fetchUserWithRelations(userId: string): Promise<UserCacheData | null> {
    try {
      // Use raw query for optimal performance and complete control
      const query = `
        SELECT 
          -- User base data
          u.id as userId,
          u.first_name as firstName,
          u.last_name as lastName,
          u.name_with_initials as nameWithInitials,
          u.email,
          u.phone_number as phone,
          u.user_type as userType,
          u.date_of_birth as dateOfBirth,
          u.gender,
          u.nic,
          u.birth_certificate_no as birthCertificateNo,
          u.address_line1 as addressLine1,
          u.address_line2 as addressLine2,
          u.city,
          u.district,
          u.province,
          u.postal_code as postalCode,
          u.country,
          u.image_url as imageUrl,
          u.is_active as isActive,
          u.first_login_completed as firstLoginCompleted,
          u.created_at as createdAt,
          u.updated_at as updatedAt,
          
          -- Student specific data
          s.father_id as fatherId,
          s.mother_id as motherId,
          s.guardian_id as guardianId,
          s.student_id as studentId,
          s.emergency_contact as emergencyContact,
          s.medical_conditions as medicalConditions,
          s.allergies,
          s.blood_group as bloodGroup,
          
          -- Parent specific data
          p.occupation,
          p.workplace,
          p.work_phone as workPhone,
          p.education_level as educationLevel
          
        FROM users u
        LEFT JOIN students s ON u.id = s.user_id
        LEFT JOIN parents p ON u.id = p.user_id
        WHERE u.id = ?
      `;

      const result = await this.dataSource.query(query, [userId]);
      
      if (!result || result.length === 0) {
        return null;
      }

      const row = result[0];
      
      // Transform database result to UserCacheData
      const userData: UserCacheData = {
        userId: String(row.userId),
        firstName: row.firstName,
        lastName: row.lastName,
        nameWithInitials: row.nameWithInitials,
        email: row.email,
        phone: row.phone,
        userType: row.userType,
        dateOfBirth: row.dateOfBirth,
        gender: row.gender,
        nic: row.nic,
        birthCertificateNo: row.birthCertificateNo,
        addressLine1: row.addressLine1,
        addressLine2: row.addressLine2,
        city: row.city,
        district: row.district,
        province: row.province,
        postalCode: row.postalCode,
        country: row.country,
        // ✅ Transform imageUrl to full URL
        imageUrl: row.imageUrl ? this.cloudStorageService.getFullUrl(row.imageUrl) : row.imageUrl,
        isActive: Boolean(row.isActive),
        firstLoginCompleted: row.firstLoginCompleted != null ? Boolean(row.firstLoginCompleted) : undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };

      // Add student-specific data if available
      if (row.fatherId || row.motherId || row.guardianId || row.studentId) {
        userData.fatherId = row.fatherId ? String(row.fatherId) : undefined;
        userData.motherId = row.motherId ? String(row.motherId) : undefined;
        userData.guardianId = row.guardianId ? String(row.guardianId) : undefined;
        userData.studentId = row.studentId;
        userData.emergencyContact = row.emergencyContact;
        userData.medicalConditions = row.medicalConditions;
        userData.allergies = row.allergies;
        userData.bloodGroup = row.bloodGroup;
      }

      // Add parent-specific data if available
      if (row.occupation || row.workplace || row.workPhone || row.educationLevel) {
        userData.occupation = row.occupation;
        userData.workplace = row.workplace;
        userData.workPhone = row.workPhone;
        userData.educationLevel = row.educationLevel;
      }

      return userData;

    } catch (error) {
      this.logger.error(`Failed to fetch user ${userId} with relations:`, error);
      throw error;
    }
  }

  async refreshUserCache(userId: string): Promise<UserCacheResult> {
    // 🚨 CONDITIONAL CACHING: Skip cache operations if caching is disabled
    if (!this.isCachingEnabled) {
      return {
        success: true,
        message: 'Cache refresh skipped - caching disabled',
        userId,
        cached: false,
        cacheKey: 'N/A (caching disabled)',
        ttl: 0,
        error: undefined
      };
    }
    
    // Proceed with normal cache refresh if caching is enabled
    return await this.setUserCache(userId, true);
  }

  async getUserCacheInfo(userId: string): Promise<{
    cached: boolean;
    data: UserCacheData | null;
    ttl: number;
    cacheKey: string;
  }> {
    const cacheKey = `user:details:${userId}`;
    
    // 🚨 CONDITIONAL CACHING: Skip cache operations if caching is disabled
    if (!this.isCachingEnabled) {
      return {
        cached: false,
        data: null,
        ttl: 0,
        cacheKey: 'N/A (caching disabled)'
      };
    }
    
    try {
      const data = await this.cacheService.getUserCache(userId);
      const ttl = await this.cacheService.ttl(cacheKey);

      if (data) {
      } else {
        this.logger.warn(`❌ CACHE MISS: No cached data found for user ${userId}, TTL: ${ttl}s`);
      }

      return {
        cached: !!data,
        data,
        ttl,
        cacheKey
      };
    } catch (error) {
      this.logger.error(`💥 CACHE ERROR: Failed to get cache for user ${userId}: ${error.message}`);
      return {
        cached: false,
        data: null,
        ttl: 0,
        cacheKey
      };
    }
  }

  /**
   * Get user data with database fallback
   */
  async getUserDataWithFallback(userId: string): Promise<UserCacheData | null> {
    try {
      // First try to get from cache
      const cachedData = await this.cacheService.getUserCache(userId);
      
      if (cachedData) {
        return cachedData;
      }

      // Cache miss - fetch from database
      const dbData = await this.fetchUserWithRelations(userId);
      
      if (!dbData) {
        return null;
      }
      
      // Cache the data for future use
      await this.cacheService.setUserCache(userId, dbData);
      
      return dbData;

    } catch (error) {
      this.logger.error(`Failed to get user data with fallback for ${userId}:`, error);
      return null;
    }
  }

  async warmUpUserCache(userIds?: string[]): Promise<BulkUserCacheResult> {
    let targetUserIds = userIds;
    
    if (!userIds) {
      // Get all active user IDs if not specified
      const activeUsers = await this.userRepository.find({
        select: ['id'],
        where: { isActive: true }
      });
      targetUserIds = activeUsers.map(user => String(user.id));
    }

    
    return await this.setBulkUserCache(targetUserIds, false);
  }

  // ===== USER INDEX MANAGEMENT METHODS =====
  
  /**
   * Set user index mappings for phone number, email, and RFID lookups
   */
  async setUserIndexes(userId: string): Promise<{
    phoneIndex: boolean;
    emailIndex: boolean;
    rfidIndex: boolean;
    success: boolean;
  }> {
    try {
      // 🚨 CONDITIONAL CACHING: Skip cache operations if caching is disabled
      if (!this.isCachingEnabled) {
        return {
          phoneIndex: true, // Return true since caching is disabled
          emailIndex: true,
          rfidIndex: true,
          success: true
        };
      }

      // Get user data to extract identifiers
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'phoneNumber', 'email', 'rfid', 'password', 'userType']
      });

      if (!user) {
        throw new Error(`User with ID ${userId} not found`);
      }

      const results = {
        phoneIndex: false,
        emailIndex: false,
        rfidIndex: false,
        success: false
      };

      // Set phone number index with additional data (password + userType)
      if (user.phoneNumber) {
        const phoneData = {
          userId: userId,
          password: user.password,
          userType: user.userType
        };
        await this.cacheService.set(
          `user:phonenumber:${user.phoneNumber}`, 
          phoneData, 
          { ttl: 3600 } // 1 hour TTL
        );
        results.phoneIndex = true;
      }

      // Set email index with additional data (password + userType)
      if (user.email) {
        const emailData = {
          userId: userId,
          password: user.password,
          userType: user.userType
        };
        await this.cacheService.set(
          `user:email:${user.email.toLowerCase()}`, 
          emailData, 
          { ttl: 3600 } // 1 hour TTL
        );
        results.emailIndex = true;
      }

      // Set RFID index (only userId)
      if (user.rfid) {
        await this.cacheService.set(
          `user:rfid:${user.rfid}`, 
          userId, 
          { ttl: 3600 } // 1 hour TTL
        );
        results.rfidIndex = true;
      }

      results.success = results.phoneIndex || results.emailIndex || results.rfidIndex;
      return results;

    } catch (error) {
      this.logger.error(`Failed to set user indexes for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user data by phone number (returns userId, password, userType)
   */
  async getUserDataByPhone(phoneNumber: string): Promise<{
    userId: string;
    password: string;
    userType: string;
  } | null> {
    try {
      const phoneData = await this.cacheService.get(`user:phonenumber:${phoneNumber}`);
      return phoneData;
    } catch (error) {
      this.logger.error(`Failed to get user data by phone ${phoneNumber}:`, error);
      return null;
    }
  }

  /**
   * Get user data by email (returns userId, password, userType)
   */
  async getUserDataByEmail(email: string): Promise<{
    userId: string;
    password: string;
    userType: string;
  } | null> {
    // 🚨 CONDITIONAL CACHING: Skip cache operations if caching is disabled
    if (!this.isCachingEnabled) {
      return null; // Will force fallback to database query in auth service
    }

    try {
      const emailData = await this.cacheService.get(`user:email:${email.toLowerCase()}`);
      return emailData;
    } catch (error) {
      this.logger.error(`Failed to get user data by email ${email}:`, error);
      return null;
    }
  }

  /**
   * Get user ID by RFID
   */
  async getUserIdByRfid(rfid: string): Promise<string | null> {
    try {
      const userId = await this.cacheService.get(`user:rfid:${rfid}`);
      return userId;
    } catch (error) {
      this.logger.error(`Failed to get user ID by RFID ${rfid}:`, error);
      return null;
    }
  }

  /**
   * Get full user data by phone number (two-step process)
   */
  async getUserByPhone(phoneNumber: string): Promise<UserCacheData | null> {
    try {
      // Step 1: Get user data from phone number index
      const phoneData = await this.getUserDataByPhone(phoneNumber);
      
      if (!phoneData) {
        return null;
      }

      // Step 2: Get full user data using user ID
      const userData = await this.cacheService.getUserCache(phoneData.userId);
      
      if (!userData) {
        // If not cached, cache it first then return
        await this.setUserCache(phoneData.userId);
        return await this.cacheService.getUserCache(phoneData.userId);
      }

      return userData;

    } catch (error) {
      this.logger.error(`Failed to get user by phone ${phoneNumber}:`, error);
      return null;
    }
  }

  /**
   * Get full user data by email (two-step process)
   */
  async getUserByEmail(email: string): Promise<UserCacheData | null> {
    try {
      // Step 1: Get user data from email index
      const emailData = await this.getUserDataByEmail(email);
      
      if (!emailData) {
        return null;
      }

      // Step 2: Get full user data using user ID
      const userData = await this.cacheService.getUserCache(emailData.userId);
      
      if (!userData) {
        // If not cached, cache it first then return
        await this.setUserCache(emailData.userId);
        return await this.cacheService.getUserCache(emailData.userId);
      }

      return userData;

    } catch (error) {
      this.logger.error(`Failed to get user by email ${email}:`, error);
      return null;
    }
  }

  /**
   * Get full user data by RFID (two-step process)
   */
  async getUserByRfid(rfid: string): Promise<UserCacheData | null> {
    try {
      // Step 1: Get user ID from RFID index
      const userId = await this.getUserIdByRfid(rfid);
      
      if (!userId) {
        return null;
      }

      // Step 2: Get full user data using user ID
      const userData = await this.cacheService.getUserCache(userId);
      
      if (!userData) {
        // If not cached, cache it first then return
        await this.setUserCache(userId);
        return await this.cacheService.getUserCache(userId);
      }

      return userData;

    } catch (error) {
      this.logger.error(`Failed to get user by RFID ${rfid}:`, error);
      return null;
    }
  }

  /**
   * Remove user indexes when user data changes
   */
  async removeUserIndexes(userId: string): Promise<{
    phoneRemoved: boolean;
    emailRemoved: boolean;
    rfidRemoved: boolean;
    success: boolean;
  }> {
    try {
      // 🚨 CONDITIONAL CACHING: Skip cache operations if caching is disabled
      if (!this.isCachingEnabled) {
        return {
          phoneRemoved: true, // Return true since caching is disabled
          emailRemoved: true,
          rfidRemoved: true,
          success: true
        };
      }

      // Get user data to find what indexes to remove
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'phoneNumber', 'email', 'rfid']
      });

      const results = {
        phoneRemoved: false,
        emailRemoved: false,
        rfidRemoved: false,
        success: false
      };

      if (user) {
        // Remove phone index
        if (user.phoneNumber) {
          await this.cacheService.del(`user:phonenumber:${user.phoneNumber}`);
          results.phoneRemoved = true;
        }

        // Remove email index
        if (user.email) {
          await this.cacheService.del(`user:email:${user.email.toLowerCase()}`);
          results.emailRemoved = true;
        }

        // Remove RFID index
        if (user.rfid) {
          await this.cacheService.del(`user:rfid:${user.rfid}`);
          results.rfidRemoved = true;
        }
      }

      results.success = results.phoneRemoved || results.emailRemoved || results.rfidRemoved;
      return results;

    } catch (error) {
      this.logger.error(`Failed to remove user indexes for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Bulk set user indexes for multiple users
   */
  async setBulkUserIndexes(userIds?: string[]): Promise<{
    successCount: number;
    errorCount: number;
    results: any[];
  }> {
    let targetUserIds = userIds;
    
    if (!userIds) {
      // Get all active user IDs if not specified
      const activeUsers = await this.userRepository.find({
        select: ['id'],
        where: { isActive: true }
      });
      targetUserIds = activeUsers.map(user => String(user.id));
    }

    
    const results = {
      successCount: 0,
      errorCount: 0,
      results: []
    };

    for (const userId of targetUserIds) {
      try {
        const indexResult = await this.setUserIndexes(userId);
        if (indexResult.success) {
          results.successCount++;
        } else {
          results.errorCount++;
        }
        results.results.push({ userId, ...indexResult });
      } catch (error) {
        results.errorCount++;
        results.results.push({ userId, success: false, error: error.message });
        this.logger.error(`Failed to set indexes for user ${userId}:`, error);
      }
    }

    return results;
  }

  /**
   * Cache all users data from database
   * WARNING: Use with caution on large databases
   */
  async cacheAllUsers(options: {
    batchSize?: number;
    refreshExisting?: boolean;
  } = {}): Promise<{
    totalUsers: number;
    successCount: number;
    errorCount: number;
    results: UserCacheResult[];
    errors: string[];
  }> {
    const { batchSize = 50, refreshExisting = false } = options;
    
    
    const startTime = Date.now();
    let offset = 0;
    let totalUsers = 0;
    const results: UserCacheResult[] = [];
    const errors: string[] = [];

    try {
      // Get total count first
      totalUsers = await this.userRepository.count({ where: { isActive: true } });

      if (totalUsers === 0) {
        return {
          totalUsers: 0,
          successCount: 0,
          errorCount: 0,
          results: [],
          errors: []
        };
      }

      // Process in batches
      while (offset < totalUsers) {
        const batchStartTime = Date.now();
        
        try {
          // Get batch of users
          const users = await this.userRepository.find({
            select: ['id'],
            where: { isActive: true },
            skip: offset,
            take: batchSize,
            order: { id: 'ASC' }
          });


          // Process each user in the batch
          for (const user of users) {
            try {
              const cacheResult = await this.setUserCache(String(user.id), refreshExisting);
              results.push(cacheResult);
            } catch (error) {
              const errorResult: UserCacheResult = {
                success: false,
                message: `Failed to cache user: ${error.message}`,
                userId: String(user.id),
                cached: false,
                cacheKey: `user:${user.id}`,
                ttl: 0,
                error: error.message
              };
              results.push(errorResult);
              errors.push(`User ${user.id}: ${error.message}`);
            }
          }

          const batchDuration = Date.now() - batchStartTime;
          
          offset += batchSize;

          // Small delay between batches to avoid overwhelming the system
          if (offset < totalUsers) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }

        } catch (batchError) {
          this.logger.error(`❌ Batch processing failed at offset ${offset}:`, batchError);
          errors.push(`Batch at offset ${offset}: ${batchError.message}`);
          offset += batchSize; // Skip this batch and continue
        }
      }

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const duration = Date.now() - startTime;

      return {
        totalUsers,
        successCount,
        errorCount,
        results,
        errors
      };

    } catch (error) {
      this.logger.error('❌ Critical error in cacheAllUsers:', error);
      throw new Error(`Failed to cache all users: ${error.message}`);
    }
  }
}
