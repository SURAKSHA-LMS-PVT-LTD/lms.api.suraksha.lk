import { Injectable, UnauthorizedException, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { UserEntity } from '../modules/user/entities/user.entity';
import { UserType } from '../modules/user/enums/user-type.enum';
import { InstituteEntity } from '../modules/institute/entities/institute.entity';
import { InstituteUserEntity } from '../modules/institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteClassSubjectEntity } from '../modules/institute_class_modules/institute_class_subject/entities/institute_class_subject.entity';
import { RefreshTokenEntity } from './entities/password-reset.entity';
// ✅ CACHING SERVICES
import { UserManagementService } from '../common/services/cache-user-management.service';
import { CacheService } from '../common/services/cache.service';
import { detectIdentifierType } from '../common/utils/identifier.util';
import { maskPii } from '../common/utils/pii-masking.util';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CloudStorageService } from '../common/services/cloud-storage.service';
import { InstituteClassStudentEntity } from '../modules/institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { StudentEntity } from '../modules/student/entities/student.entity';
import { ParentEntity } from '../modules/parent/entities/parent.entity';
import { InstituteUserStatus } from '../modules/institute_mudules/institue_user/enums/institute-user-status.enum';
import { now } from '../common/utils/timezone.util';
import {
  toCompactUserType,
} from './interfaces/jwt-payload.interface';
import { EnhancedLoginResponse } from './interfaces/enhanced-jwt-payload.interface';
import { EnhancedJwtService } from './services/enhanced-jwt.service';
import { TenantService } from '../modules/tenant/tenant.service';
import { LoginMethod } from '../modules/institute/enums/institute.enums';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds: number;
  private readonly pepper: string;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(InstituteClassStudentEntity)
    private readonly instituteClassStudentRepository: Repository<InstituteClassStudentEntity>,
    @InjectRepository(InstituteClassSubjectEntity)
    private readonly instituteClassSubjectRepository: Repository<InstituteClassSubjectEntity>,
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
    private readonly dataSource: DataSource,
    // ✅ CACHING SERVICES
    private readonly userManagementService: UserManagementService,
    private readonly cacheService: CacheService,
    private readonly cloudStorageService: CloudStorageService,
    private readonly enhancedJwtService: EnhancedJwtService,
    private readonly tenantService: TenantService,
  ) {
    // Get salt rounds from environment variable
    this.saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS', '12'), 10);
    
    // Get pepper from environment variable (NO fallback - must be explicitly set)
    const pepper = this.configService.get<string>('BCRYPT_PEPPER');
    if (!pepper || pepper === 'default-pepper-change-in-production') {
      throw new Error(
        '❌ CRITICAL SECURITY ERROR: BCRYPT_PEPPER is not set or is using the default value!\n' +
        'Set a strong, unique pepper in your .env file: BCRYPT_PEPPER=your_random_secret_string\n' +
        'Generate with: openssl rand -hex 32'
      );
    }
    this.pepper = pepper;
    
    // Validate configuration
    if (isNaN(this.saltRounds) || this.saltRounds < 10 || this.saltRounds > 15) {
      throw new Error('BCRYPT_SALT_ROUNDS must be between 10 and 15');
    }
  }

  /**
   * Detect identifier type - delegates to shared utility
   */
  private detectIdentifierType(identifier: string) {
    return detectIdentifierType(identifier);
  }

  /**
   * 🚀 CACHE-OPTIMIZED: Validate user credentials using existing cache system
   * Performance: 0 database queries (cache hit) vs 1-2 queries (cache miss)
   * Speed: ~15ms (cache) vs ~200ms (database)
   * 
   * Supports multiple identifier types:
   * - Email: user@example.com
   * - Phone: +94771234567, 94771234567, 0771234567, 771234567
   * - System ID: 500423 (6 digits)
   * - Birth Certificate: 12345678901 (other numeric formats)
   */
  async validateUser(identifier: string, password: string): Promise<UserEntity> {
    if (!identifier || !password) {
      throw new UnauthorizedException('Identifier and password are required');
    }

    try {
      // 🔍 STEP 1: Detect identifier type and normalize
      const { type, normalized } = this.detectIdentifierType(identifier);
      
      this.logger.log(`🔐 Login attempt with ${type}: ${maskPii(normalized)}`);

      // ⚡ STEP 2: Try cache-first authentication for email
      if (type === 'email') {
        const emailData = await this.userManagementService.getUserDataByEmail(normalized);
        
        if (emailData) {
          this.logger.debug(`📦 Cache HIT for email: userId=${emailData.userId}, hasPassword=${!!emailData.password}`);
          
          // 🎯 Cache HIT: Verify password directly from cached data
          const isPasswordValid = await this.comparePassword(password, emailData.password);
          
          if (!isPasswordValid) {
            this.logger.warn(`❌ Cache password validation failed for user ${emailData.userId}`);
            throw new UnauthorizedException('Invalid credentials');
          }

          this.logger.debug(`✅ Cache password validation successful for user ${emailData.userId}`);

          // ✅ Get full user data from user cache (already includes all profile data)
          const fullUserData = await this.userManagementService.getUserCacheInfo(emailData.userId);
          
          if (fullUserData.cached && fullUserData.data) {
            // 🚀 CACHE SUCCESS: Return user data from cache (0 database queries)
            const userData = fullUserData.data;
            
            this.logger.log(`🚀 Login successful from cache for user ${userData.userId}`);
            
            // Transform cached data to UserEntity-like object
            return {
              id: userData.userId,
              email: userData.email,
              password: emailData.password, // From email index cache
              firstName: userData.firstName,
              lastName: userData.lastName,
              isActive: userData.isActive,
              userType: userData.userType,
              imageUrl: userData.imageUrl,
              firstLoginCompleted: userData.firstLoginCompleted ?? true,
            } as UserEntity;
          }
        } else {
          this.logger.debug(`📭 Cache MISS for email: ${maskPii(normalized)}`);
        }
      }

      // 📊 STEP 3: Database query based on identifier type
      this.logger.log(`⚠️ Querying database for ${type}: ${maskPii(normalized)}`);
      
      let whereClause: any = {};
      
      switch (type) {
        case 'email':
          whereClause = { email: normalized };
          break;
        case 'phone':
          whereClause = { phoneNumber: normalized };
          break;
        case 'system_id':
          // System ID is stored in the 'id' field (6-digit user ID)
          whereClause = { id: normalized };
          break;
        case 'birth_certificate':
          whereClause = { birthCertificateNo: normalized };
          break;
      }
      
      this.logger.debug(`🔍 WHERE clause type: ${type}`);
      
      const user = await this.userRepository.findOne({ 
        where: whereClause,
        select: ['id', 'email', 'password', 'phoneNumber', 'birthCertificateNo', 'firstName', 'lastName', 'nameWithInitials', 'isActive', 'userType', 'imageUrl', 'firstLoginCompleted']
      });
      
      if (!user) {
        this.logger.warn(`❌ User not found with ${type}: ${maskPii(normalized)}`);
        throw new UnauthorizedException('Invalid credentials');
      }
      
      this.logger.debug(`✅ User found: ID=${user.id}, hasPassword=${!!user.password}`);

      // 🔐 STEP 4: Verify password
      const isPasswordValid = await this.comparePassword(password, user.password);
      if (!isPasswordValid) {
        this.logger.warn(`❌ Database password validation failed for user ${user.id}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      this.logger.log(`✅ Login successful from database for user ${user.id}`);

      // 💾 STEP 5: Cache the user data for future logins (only for email logins)
      if (type === 'email') {
        try {
          await this.userManagementService.setUserCache(user.id);
          await this.userManagementService.setUserIndexes(user.id);
        } catch (cacheError) {
          this.logger.warn(`Failed to cache user data after login: ${cacheError.message}`);
        }
      }

      return user;

    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error(`Login error for ${identifier}: ${error.message}`);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Generate enhanced JWT token with embedded institute/class/child access metadata.
   * This is the only login method - JWT v2 format.
   * Now includes refresh token for secure token renewal.
   * 
   * @param user - Authenticated user entity
   * @param ipAddress - Client IP for audit
   * @param userAgent - Client user agent for audit
   * @param rememberMe - If true, refresh token lasts 30 days instead of 7
   */
  async loginV2(
    user: UserEntity,
    ipAddress?: string,
    userAgent?: string,
    rememberMe: boolean = false,
    loginMethod: LoginMethod = LoginMethod.SURAKSHA_WEB,
    tenantInstituteId?: string,
  ): Promise<EnhancedLoginResponse & { refresh_token: string; expires_in: number; refresh_expires_in: number }> {
    const payload = await this.enhancedJwtService.buildPayload(user);
    
    // Generate access token (short-lived)
    const access_token = await this.jwtService.signAsync(payload);
    
    // Generate refresh token (long-lived, extended if rememberMe)
    const refresh_token = await this.generateRefreshToken(
      user.id,
      ipAddress,
      userAgent,
      rememberMe
    );

    // Calculate expiry info for frontend
    const jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '1h';
    const expires_in = this.parseExpiryToSeconds(jwtExpiresIn);
    const refresh_expires_in = rememberMe ? 30 * 86400 : 7 * 86400; // 30d or 7d in seconds

    // 🔥 Fire-and-forget: Record login event for billing/analytics
    this.tenantService.recordLoginEvent(user.id, loginMethod, tenantInstituteId, ipAddress, userAgent)
      .catch(err => this.logger.warn(`Login event recording failed: ${err.message}`));

    return {
      access_token,
      refresh_token,
      expires_in,
      refresh_expires_in,
      payload,
      user: {
        id: user.id,
        email: user.email,
        nameWithInitials: user.nameWithInitials,
        userType: user.userType,
        imageUrl: user.imageUrl ? this.cloudStorageService.getFullUrl(user.imageUrl) : null,
        firstLoginCompleted: user.firstLoginCompleted ?? true,
      },
    };
  }

  /**
   * Auto-complete first login for users who login with correct credentials
   * but have firstLoginCompleted = false. Since they already have a password
   * and verified their identity, just mark first login as done.
   */
  async autoCompleteFirstLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      firstLoginCompleted: true,
      updatedAt: now(),
    });
    // Refresh cache so future logins pick up the change
    try {
      await this.userManagementService.refreshUserCache(userId);
    } catch (cacheError) {
      this.logger.warn(`Cache refresh failed after auto-completing first login for user ${userId}: ${cacheError.message}`);
    }
    this.logger.log(`✅ Auto-completed first login for user ${userId} (password login)`);
  }

  // REMOVED: All complex data building methods
  // Login now returns only JWT token and basic user info
  // Additional data can be loaded separately via dedicated API endpoints

  /**
   * Get institute assignments for user
   */
  private async getInstituteAssignments(userId: string): Promise<any[]> {
    try {
      const assignments = await this.instituteUserRepository.find({
        where: { 
          userId: userId,
          status: InstituteUserStatus.ACTIVE
        },
        relations: ['institute']
      });

      return assignments.map(assignment => ({
        instituteId: assignment.instituteId,
        instituteName: assignment.institute?.name || 'Unknown Institute',
        roleType: 'INSTITUTE_USER', // Fixed: removed userType property
        joinedDate: assignment.createdAt,
        status: assignment.status
      }));
    } catch (error) {
      this.logger.warn(`Failed to get institute assignments for user ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get all institute IDs a user belongs to (via institute_users or student enrollments).
   * Used by auth flow to validate tenant institute membership.
   */
  async getUserInstituteIds(userId: string): Promise<Array<{ instituteId: string }>> {
    try {
      // Check institute_users (admin/teacher roles)
      const userAssignments = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .select('DISTINCT iu.institute_id', 'instituteId')
        .where('iu.user_id = :userId', { userId })
        .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
        .getRawMany();

      // Check student enrollments (student role)
      const studentEnrollments = await this.instituteClassStudentRepository
        .createQueryBuilder('ics')
        .select('DISTINCT ic.institute_id', 'instituteId')
        .innerJoin('institute_classes', 'ic', 'ics.institute_class_id = ic.id')
        .where('ics.student_user_id = :userId', { userId })
        .andWhere('ics.is_active = true')
        .getRawMany();

      // Merge and deduplicate
      const allIds = new Map<string, { instituteId: string }>();
      for (const row of [...userAssignments, ...studentEnrollments]) {
        allIds.set(row.instituteId, row);
      }
      return Array.from(allIds.values());
    } catch (error: any) {
      this.logger.warn(`Failed to get user institute IDs for ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get student enrollments
   */
  private async getStudentEnrollments(userId: string): Promise<any[]> {
    try {
      const enrollments = await this.instituteClassStudentRepository.find({
        where: { 
          studentUserId: userId,
          isActive: true
        },
        relations: ['institute', 'class']
      });

      return enrollments.map(enrollment => ({
        instituteId: enrollment.instituteId,
        instituteName: enrollment.institute?.name || 'Unknown Institute',
        classId: enrollment.classId,
        className: enrollment.class?.name || 'Unknown Class',
        enrolledDate: enrollment.createdAt,
        status: enrollment.isActive ? 'ACTIVE' : 'INACTIVE'
      }));
    } catch (error) {
      this.logger.warn(`Failed to get student enrollments for user ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get class enrollments for student
   * ✅ SECURITY FIX: Converted to QueryBuilder (was vulnerable raw SQL)
   */
  private async getClassEnrollments(userId: string): Promise<any[]> {
    try {
      const classEnrollments = await this.dataSource
        .createQueryBuilder()
        .select([
          'ics.instituteId as instituteId',
          'ics.classId as classId',
          'ic.name as className',
          'i.name as instituteName',
          'ics.createdAt as enrolledDate'
        ])
        .from('institute_class_students', 'ics')
        .leftJoin('institute_classes', 'ic', 'ics.classId = ic.id')
        .leftJoin('institutes', 'i', 'ics.instituteId = i.id')
        .where('ics.studentUserId = :userId', { userId })
        .andWhere('ics.isActive = 1')
        .distinct(true)
        .getRawMany();

      return classEnrollments || [];
    } catch (error) {
      this.logger.warn(`Failed to get class enrollments for user ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get subject enrollments for student
   * ✅ SECURITY FIX: Converted to QueryBuilder (was vulnerable raw SQL)
   */
  private async getSubjectEnrollments(userId: string): Promise<any[]> {
    try {
      const subjectEnrollments = await this.dataSource
        .createQueryBuilder()
        .select([
          'icss.instituteId as instituteId',
          'icss.classId as classId',
          'icss.subjectId as subjectId',
          's.name as subjectName',
          'ic.name as className',
          'i.name as instituteName',
          'u.firstName as teacherFirstName',
          'u.lastName as teacherLastName'
        ])
        .from('institute_class_students', 'ics')
        .leftJoin('institute_class_subjects', 'icss', 'ics.instituteId = icss.instituteId AND ics.classId = icss.classId')
        .leftJoin('subjects', 's', 'icss.subjectId = s.id')
        .leftJoin('institute_classes', 'ic', 'ics.classId = ic.id')
        .leftJoin('institutes', 'i', 'ics.instituteId = i.id')
        .leftJoin('users', 'u', 'icss.teacherId = u.id')
        .where('ics.studentUserId = :userId', { userId })
        .andWhere('ics.isActive = 1')
        .andWhere('icss.isActive = 1')
        .distinct(true)
        .getRawMany();

      return subjectEnrollments || [];
    } catch (error) {
      this.logger.warn(`Failed to get subject enrollments for user ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get teaching assignments for teacher
   */
  private async getTeachingAssignments(userId: string): Promise<any[]> {
    try {
      const assignments = await this.instituteClassSubjectRepository.find({
        where: { 
          teacherId: userId,
          isActive: true
        },
        relations: ['institute', 'class', 'subject']
      });

      return assignments.map(assignment => ({
        instituteId: assignment.instituteId,
        instituteName: assignment.institute?.name || 'Unknown Institute',
        classId: assignment.classId,
        className: assignment.class?.name || 'Unknown Class',
        subjectId: assignment.subjectId,
        subjectName: assignment.subject?.name || 'Unknown Subject',
        assignedDate: assignment.createdAt
      }));
    } catch (error) {
      this.logger.warn(`Failed to get teaching assignments for user ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get classes teaching for teacher
   * ✅ SECURITY FIX: Converted to QueryBuilder (was vulnerable raw SQL)
   */
  private async getClassesTeaching(userId: string): Promise<any[]> {
    try {
      const classes = await this.dataSource
        .createQueryBuilder()
        .select([
          'ics.instituteId as instituteId',
          'ics.classId as classId',
          'ic.name as className',
          'i.name as instituteName',
          'COUNT(icss.subjectId) as subjectCount'
        ])
        .from('institute_class_subjects', 'ics')
        .leftJoin('institute_classes', 'ic', 'ics.classId = ic.id')
        .leftJoin('institutes', 'i', 'ics.instituteId = i.id')
        .leftJoin('institute_class_subjects', 'icss', 'ics.classId = icss.classId AND ics.instituteId = icss.instituteId')
        .where('ics.teacherId = :userId', { userId })
        .andWhere('ics.isActive = 1')
        .groupBy('ics.instituteId, ics.classId, ic.name, i.name')
        .distinct(true)
        .getRawMany();

      return classes || [];
    } catch (error) {
      this.logger.warn(`Failed to get classes teaching for user ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get subjects teaching for teacher
   * ✅ SECURITY FIX: Converted to QueryBuilder (was vulnerable raw SQL)
   */
  private async getSubjectsTeaching(userId: string): Promise<any[]> {
    try {
      const subjects = await this.dataSource
        .createQueryBuilder()
        .select([
          'ics.subjectId as subjectId',
          's.name as subjectName',
          'COUNT(DISTINCT ics.classId) as classCount',
          'COUNT(DISTINCT icss.studentUserId) as studentCount'
        ])
        .from('institute_class_subjects', 'ics')
        .leftJoin('subjects', 's', 'ics.subjectId = s.id')
        .leftJoin('institute_class_students', 'icss', 'ics.classId = icss.classId AND ics.instituteId = icss.instituteId')
        .where('ics.teacherId = :userId', { userId })
        .andWhere('ics.isActive = 1')
        .andWhere('icss.isActive = 1')
        .groupBy('ics.subjectId, s.name')
        .distinct(true)
        .getRawMany();

      return subjects || [];
    } catch (error) {
      this.logger.warn(`Failed to get subjects teaching for user ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get parent children - Fixed to use correct student-parent relationship
   * ✅ SECURITY FIX: Converted to QueryBuilder (was vulnerable raw SQL)
   */
  private async getParentChildren(userId: string): Promise<any[]> {
    try {
      // Parents are linked to students via fatherId, motherId, or guardianId in students table
      const children = await this.dataSource
        .createQueryBuilder()
        .select([
          's.userId as studentUserId',
          'u.firstName as firstName',
          'u.lastName as lastName',
          'u.name_with_initials as nameWithInitials',
          `CASE 
            WHEN s.fatherId = :userId THEN 'father'
            WHEN s.motherId = :userId THEN 'mother'
            WHEN s.guardianId = :userId THEN 'guardian'
            ELSE 'unknown'
          END as relationship`,
          's.createdAt as createdAt'
        ])
        .from('students', 's')
        .leftJoin('users', 'u', 's.userId = u.id')
        .where('s.fatherId = :userId OR s.motherId = :userId OR s.guardianId = :userId', { userId })
        .distinct(true)
        .getRawMany();

      return children.map((child: any) => ({
        studentId: child.studentUserId,
        studentName: child.nameWithInitials || `${child.firstName || ''} ${child.lastName || ''}`.trim(),
        relationship: child.relationship,
        addedDate: child.createdAt
      }));
    } catch (error) {
      this.logger.warn(`Failed to get parent children for user ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get children enrollments for parent - Fixed to use correct relationship
   * ✅ SECURITY FIX: Converted to QueryBuilder (was vulnerable raw SQL)
   */
  private async getChildrenEnrollments(userId: string): Promise<any[]> {
    try {
      const enrollments = await this.dataSource
        .createQueryBuilder()
        .select([
          's.userId as studentUserId',
          'u.firstName as studentFirstName',
          'u.lastName as studentLastName',
          'ics.instituteId as instituteId',
          'i.name as instituteName',
          'ics.classId as classId',
          'ic.name as className',
          `CASE 
            WHEN s.fatherId = :userId THEN 'father'
            WHEN s.motherId = :userId THEN 'mother'
            WHEN s.guardianId = :userId THEN 'guardian'
            ELSE 'unknown'
          END as relationship`
        ])
        .from('students', 's')
        .leftJoin('users', 'u', 's.userId = u.id')
        .leftJoin('institute_class_students', 'ics', 's.userId = ics.studentUserId')
        .leftJoin('institutes', 'i', 'ics.instituteId = i.id')
        .leftJoin('institute_classes', 'ic', 'ics.classId = ic.id')
        .where('(s.fatherId = :userId OR s.motherId = :userId OR s.guardianId = :userId)', { userId })
        .andWhere('ics.isActive = 1')
        .distinct(true)
        .getRawMany();

      return enrollments || [];
    } catch (error) {
      this.logger.warn(`Failed to get children enrollments for user ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get managed institutes for admin users
   * ✅ SECURITY FIX: Converted to QueryBuilder (was vulnerable raw SQL)
   */
  private async getManagedInstitutes(userId: string): Promise<any[]> {
    try {
      const managedInstitutes = await this.dataSource
        .createQueryBuilder()
        .select([
          'iu.instituteId as instituteId',
          'i.name as instituteName',
          'i.email as instituteEmail',
          'i.phone as institutePhone',
          'iu.userType as roleInInstitute',
          'iu.createdAt as assignedDate'
        ])
        .from('institute_users', 'iu')
        .leftJoin('institutes', 'i', 'iu.instituteId = i.id')
        .where('iu.userId = :userId', { userId })
        .andWhere("iu.status = 'ACTIVE'")
        .distinct(true)
        .getRawMany();

      return managedInstitutes || [];
    } catch (error) {
      this.logger.warn(`Failed to get managed institutes for user ${userId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Get institute summary for admin users
   * ✅ SECURITY FIX: Converted to QueryBuilder (was vulnerable raw SQL)
   */
  private async getInstituteSummary(userId: string): Promise<any> {
    try {
      const summary = await this.dataSource
        .createQueryBuilder()
        .select([
          'COUNT(DISTINCT i.id) as totalInstitutes',
          'COUNT(DISTINCT ic.id) as totalClasses',
          'COUNT(DISTINCT ics.id) as totalStudents',
          'COUNT(DISTINCT icss.teacherId) as totalTeachers'
        ])
        .from('institute_users', 'iu')
        .leftJoin('institutes', 'i', 'iu.instituteId = i.id')
        .leftJoin('institute_classes', 'ic', 'i.id = ic.instituteId')
        .leftJoin('institute_class_students', 'ics', 'i.id = ics.instituteId AND ics.isActive = 1')
        .leftJoin('institute_class_subjects', 'icss', 'i.id = icss.instituteId AND icss.isActive = 1')
        .where('iu.userId = :userId', { userId })
        .andWhere("iu.status = 'ACTIVE'")
        .getRawOne();

      return summary || { totalInstitutes: 0, totalClasses: 0, totalStudents: 0, totalTeachers: 0 };
    } catch (error) {
      this.logger.error(`Failed to get institute summary for user ${userId}: ${error.message}`);
      return { totalInstitutes: 0, totalClasses: 0, totalStudents: 0, totalTeachers: 0 };
    }
  }

  /**
   * Get system summary for super admin
   * ✅ SECURITY FIX: Converted to QueryBuilder (was vulnerable raw SQL)
   */
  private async getSystemSummary(): Promise<any> {
    try {
      // Execute separate queries for accurate counts
      const [totalInstitutes, totalUsers, totalClasses, totalStudents, totalTeachers] = await Promise.all([
        this.dataSource.createQueryBuilder().select('COUNT(*) as count').from('institutes', 'i').getRawOne(),
        this.dataSource.createQueryBuilder().select('COUNT(*) as count').from('users', 'u').getRawOne(),
        this.dataSource.createQueryBuilder().select('COUNT(*) as count').from('institute_classes', 'ic').getRawOne(),
        this.dataSource.createQueryBuilder().select('COUNT(*) as count').from('institute_class_students', 'ics').where('ics.isActive = 1').getRawOne(),
        this.dataSource.createQueryBuilder().select('COUNT(DISTINCT teacherId) as count').from('institute_class_subjects', 'icss').where('icss.isActive = 1').getRawOne()
      ]);

      return {
        totalInstitutes: parseInt(totalInstitutes?.count || '0'),
        totalUsers: parseInt(totalUsers?.count || '0'),
        totalClasses: parseInt(totalClasses?.count || '0'),
        totalStudents: parseInt(totalStudents?.count || '0'),
        totalTeachers: parseInt(totalTeachers?.count || '0')
      };
    } catch (error) {
      this.logger.error(`Failed to get system summary: ${error.message}`);
      return { totalInstitutes: 0, totalUsers: 0, totalClasses: 0, totalStudents: 0, totalTeachers: 0 };
    }
  }

  /**
   * Get all institutes for super admin
   */
  private async getAllInstitutes(): Promise<any[]> {
    try {
      const institutesRaw = await this.instituteRepository.find({
        order: { createdAt: 'DESC' },
        take: 500, // Safety cap — super-admin dashboard never needs all rows at once
      });

      // Map to return only needed fields
      const institutes = institutesRaw.map(inst => ({
        id: inst.id,
        name: inst.name,
        email: inst.email,
        phone: inst.phone,
        address: inst.address,
        createdAt: inst.createdAt
      }));

      return institutes || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get user notifications (placeholder)
   */
  private async getUserNotifications(userId: string): Promise<any[]> {
    try {
      // TODO: Implement notification system
      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get recent activity (placeholder)
   */
  private async getRecentActivity(userId: string): Promise<any[]> {
    try {
      // TODO: Implement activity tracking
      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get user permissions (placeholder)
   */
  private async getUserPermissions(userId: string): Promise<any> {
    try {
      // TODO: Implement permission system based on user type and assignments
      return {
        canCreateClasses: false,
        canManageStudents: false,
        canViewReports: false,
        canManagePayments: false
      };
    } catch (error) {
      this.logger.error(`Failed to get permissions for user ${userId}: ${error.message}`);
      return {};
    }
  }

  /**
   * Hash password with salt and pepper
   */
  async hashPassword(password: string): Promise<string> {
    if (!password || password.trim().length === 0) {
      throw new Error('Password cannot be empty');
    }

    // Add pepper to password before hashing
    const pepperedPassword = password + this.pepper;
    
    // Hash with bcrypt using salt rounds
    return await bcrypt.hash(pepperedPassword, this.saltRounds);
  }

  /**
   * Compare password with hash.
   *
   * Tries peppered hash first (all new Suraksha accounts).
   * Falls back to plain bcrypt (no pepper) for hashes migrated from Thilina LMS.
   * Returns { match: true, isLegacy: true } on legacy match so the caller can
   * re-hash inline and upgrade the stored value automatically.
   */
  async comparePasswordFull(
    password: string,
    hash: string,
  ): Promise<{ match: boolean; isLegacy: boolean }> {
    if (!password || !hash) return { match: false, isLegacy: false };
    try {
      // Primary path: peppered (all accounts created in Suraksha)
      if (await bcrypt.compare(password + this.pepper, hash)) {
        return { match: true, isLegacy: false };
      }
      // Fallback: plain bcrypt (hashes migrated from Thilina LMS — no pepper)
      if (await bcrypt.compare(password, hash)) {
        return { match: true, isLegacy: true };
      }
      return { match: false, isLegacy: false };
    } catch (error) {
      this.logger.error(`Password comparison failed: ${error.message}`);
      return { match: false, isLegacy: false };
    }
  }

  /**
   * Compare password with hash — simple boolean for callers that don't need rehash.
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    const { match } = await this.comparePasswordFull(password, hash);
    return match;
  }

  /**
   * 🔐 Change user password with security validation
   */
  /**
   * 🔐 CHANGE PASSWORD - Core Implementation
   * Changes user password after verifying current password
   * @param userId - User ID (string)
   * @param currentPassword - User's current password (plain text)
   * @param newPassword - New password to set (plain text)
   * @returns Success message
   */
  async changePassword(
    userId: string, 
    currentPassword: string, 
    newPassword: string
  ): Promise<{ message: string; isSuccess: boolean }> {
    
    // Input validation
    if (!userId?.trim()) {
      throw new BadRequestException('User ID is required');
    }
    if (!currentPassword?.trim()) {
      throw new BadRequestException('Current password is required');
    }
    if (!newPassword?.trim()) {
      throw new BadRequestException('New password is required');
    }

    // Execute password change in atomic transaction
    return await this.dataSource.transaction(async (transactionManager) => {
      
      // Step 1: Fetch user with current password hash
      const userRepository = transactionManager.getRepository(UserEntity);
      const user = await userRepository.findOne({
        where: { id: userId.trim() },
        select: ['id', 'email', 'password', 'firstName', 'lastName', 'userType']
      });

      if (!user) {
        this.logger.warn(`Password change failed: User ${userId} not found`);
        throw new UnauthorizedException('User not found');
      }

      // Step 2: Verify current password matches stored hash
      const isCurrentPasswordCorrect = await this.comparePassword(
        currentPassword, 
        user.password
      );

      if (!isCurrentPasswordCorrect) {
        this.logger.warn(`Password change failed: Incorrect current password for user ${userId}`);
        throw new UnauthorizedException('Current password is incorrect');
      }

      // Step 3: Ensure new password is different from current
      const isNewPasswordSameAsCurrent = await this.comparePassword(
        newPassword, 
        user.password
      );

      if (isNewPasswordSameAsCurrent) {
        throw new BadRequestException('New password must be different from current password');
      }

      // Step 4: Hash the new password with bcrypt + pepper
      const hashedPassword = await this.hashPassword(newPassword);

      // Step 5: Update password in database.
      // passwordSetAt is bumped so any access token issued before this change is
      // rejected by JwtStrategy (M1 fix — access tokens must not outlive a password change).
      const updateResult = await userRepository.update(
        { id: userId.trim() },
        { password: hashedPassword, passwordSetAt: now() }
      );

      // Verify update was successful
      if (!updateResult.affected || updateResult.affected === 0) {
        this.logger.error(`Password update failed: No rows affected for user ${userId}`);
        throw new InternalServerErrorException('Failed to update password');
      }

      // Step 6: Refresh user cache (non-blocking, don't fail if cache update fails)
      this.refreshUserCacheAsync(userId);

      // 🔐 SECURITY: Revoke all refresh tokens on password change
      // This forces re-login on all devices, preventing stolen token reuse
      try {
        await transactionManager.update(
          this.refreshTokenRepository.target,
          { userId: userId.trim(), isRevoked: false },
          { isRevoked: true, updatedAt: now() }
        );
        this.logger.log(`🔐 All sessions revoked for user ${userId} after password change`);
      } catch (revokeError) {
        this.logger.warn(`⚠️ Failed to revoke sessions after password change: ${revokeError.message}`);
      }

      return {
        message: 'Password changed successfully',
        isSuccess: true
      };
    });
  }

  /**
   * 🔄 Async cache refresh (fire and forget)
   */
  private async refreshUserCacheAsync(userId: string): Promise<void> {
    try {
      await this.userManagementService.refreshUserCache(userId);
      await this.userManagementService.setUserIndexes(userId);
    } catch (error) {
      this.logger.warn(`⚠️ Cache refresh failed for user ${userId}: ${error.message}`);
    }
  }

  /**
   * 🔐 Reset user password (admin function)
   */
  async resetPassword(
    userId: string, 
    newPassword: string,
    adminUserId?: string
  ): Promise<{ message: string; isSuccess: boolean }> {
    
    if (!userId || !newPassword) {
      throw new UnauthorizedException('User ID and new password are required');
    }

    // Use transaction for atomicity
    return await this.dataSource.transaction(async manager => {
      // 1. Get user
      const user = await this.userRepository.findOne({
        where: { id: userId.toString() },
        select: ['id', 'email', 'firstName', 'lastName', 'userType']
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // 2. Hash new password
      const hashedNewPassword = await this.hashPassword(newPassword);

      // 3. Update password in database (bump passwordSetAt to invalidate pre-change tokens)
      await manager.update(UserEntity, { id: userId }, { password: hashedNewPassword, passwordSetAt: now() });

      return {
        message: 'Password reset successfully',
        isSuccess: true
      };
    });
  }

  /**
   * 🔍 Validate JWT token format and extract user information
   */
  async validateToken(token: string): Promise<any> {
    try {
      const decoded = await this.jwtService.verifyAsync(token);
      return decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * 🆔 Extract user ID from JWT payload (handles both compact and legacy formats)
   */
  extractUserId(payload: any): string {
    // Handle compact JWT format (new)
    if (payload?.s) {
      return payload.s;
    }
    
    // Handle legacy JWT format (old)
    if (payload?.sub || payload?.id) {
      return payload.sub || payload.id;
    }
    
    throw new UnauthorizedException('Invalid JWT payload: user ID not found');
  }

  /**
   * Extract user type from JWT payload (handles both compact and legacy formats)
   */
  extractUserType(payload: any): string {
    // Handle compact JWT format (new)
    if (payload?.ut) {
      return payload.ut;
    }
    
    // Handle legacy JWT format (old)
    if (payload?.userType) {
      return payload.userType;
    }
    
    throw new UnauthorizedException('Invalid JWT payload: user type not found');
  }

  /**
   * 🔐 CHANGE PASSWORD WITH JWT - Controller Layer Method
   * Extracts user ID from JWT and delegates to changePassword
   * @param changePasswordDto - DTO containing currentPassword, newPassword, confirmNewPassword
   * @param authorization - Bearer token from request header
   * @returns Success message
   */
  async changePasswordWithJWT(
    changePasswordDto: ChangePasswordDto, 
    authorization: string
  ): Promise<{ message: string; isSuccess: boolean }> {
    
    // Validate authorization header exists
    if (!authorization?.trim()) {
      throw new UnauthorizedException('Authorization header is required');
    }

    let userId: string;
    let token: string;

    // Extract and verify JWT token
    try {
      // Remove 'Bearer ' prefix
      token = authorization.replace(/^Bearer\s+/i, '').trim();
      
      if (!token) {
        throw new UnauthorizedException('Token is empty');
      }

      // Verify token and extract payload
      const payload = await this.jwtService.verifyAsync(token);
      
      // Extract user ID (support JWT v2 format with 's' field and legacy formats)
      userId = payload.s || payload.sub || payload.id;
      
      if (!userId) {
        this.logger.error(`JWT payload missing user ID: ${JSON.stringify(payload)}`);
        throw new UnauthorizedException('Invalid token: User ID not found');
      }

    } catch (error) {
      // Handle JWT verification errors
      if (error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Invalid token format');
      }
      // Re-throw if already UnauthorizedException
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Generic JWT error
      this.logger.error(`JWT verification failed: ${error.message}`);
      throw new UnauthorizedException('Token verification failed');
    }

    // Validate DTO fields
    if (!changePasswordDto.currentPassword?.trim()) {
      throw new BadRequestException('Current password is required');
    }
    if (!changePasswordDto.newPassword?.trim()) {
      throw new BadRequestException('New password is required');
    }
    if (!changePasswordDto.confirmNewPassword?.trim()) {
      throw new BadRequestException('Password confirmation is required');
    }

    // Verify new password matches confirmation
    if (changePasswordDto.newPassword !== changePasswordDto.confirmNewPassword) {
      throw new BadRequestException('New password and confirmation do not match');
    }

    // Delegate to core changePassword method
    try {
      return await this.changePassword(
        userId,
        changePasswordDto.currentPassword,
        changePasswordDto.newPassword
      );
    } catch (error) {
      // Re-throw all errors from changePassword (already properly formatted)
      throw error;
    }
  }

  /**
   * DEPRECATED: Use direct database query instead
   * Legacy method for backward compatibility
   */
  async findUserByEmail(email: string): Promise<UserEntity | null> {
    
    return await this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'firstName', 'lastName', 'userType', 'isActive']
    });
  }

  /**
   * DEPRECATED: Password migration is no longer needed
   * Legacy method for backward compatibility
   */
  async isPasswordInOldFormat(user: UserEntity, password: string): Promise<boolean> {
    return false; // All passwords are now in new format
  }

  /**
   * DEPRECATED: Password migration is no longer needed
   * Legacy method for backward compatibility
   */
  async rehashPasswordIfNeeded(user: UserEntity, plainPassword: string): Promise<boolean> {
    return true; // Always return true as all passwords are in new format
  }

  /**
   * Get current user profile information securely
   * Uses cache-first approach for optimal performance
   * @param userId User ID from JWT token
   * @returns User profile information without sensitive data
   */
  async getCurrentUserProfile(userId: string): Promise<{
    success: boolean;
    data: {
      id: string;
      firstName: string;
      lastName: string;
      nameWithInitials: string;
      email: string;
      phoneNumber?: string;
      userType: string;
      dateOfBirth?: Date;
      gender?: string;
      birthCertificateNo?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      district?: string;
      province?: string;
      postalCode?: string;
      country?: string;
      imageUrl?: string;
      subscriptionPlan?: string;
      paymentExpiresAt?: Date;
      language?: string;
      createdAt: Date;
      updatedAt: Date;
      rfid?: string;
      // Student-specific fields
      studentId?: string;
      emergencyContact?: string;
      bloodGroup?: string;
      medicalConditions?: string;
      allergies?: string;
      fatherId?: string;
      motherId?: string;
      guardianId?: string;
      // Parent-specific fields
      occupation?: string;
      workplace?: string;
      workPhone?: string;
      educationLevel?: string;
    };
  }> {
    try {
      // ⚡ STEP 1: Try cache-first profile retrieval
      const cachedProfile = await this.userManagementService.getUserCacheInfo(userId);
      
      if (cachedProfile.cached && cachedProfile.data) {
        // 🎯 Cache HIT: Return cached data with URL transformation
        const userData = cachedProfile.data;
        
        // Transform imageUrl to full URL if exists
        const fullImageUrl = userData.imageUrl 
          ? this.cloudStorageService.getFullUrl(userData.imageUrl)
          : undefined;
        
        return {
          success: true,
          data: {
            id: userData.userId,
            firstName: userData.firstName,
            lastName: userData.lastName,
            nameWithInitials: userData.nameWithInitials,
            email: userData.email,
            phoneNumber: userData.phone,
            userType: userData.userType,
            dateOfBirth: userData.dateOfBirth,
            gender: userData.gender,
            birthCertificateNo: userData.birthCertificateNo,
            addressLine1: userData.addressLine1,
            addressLine2: userData.addressLine2,
            city: userData.city,
            district: userData.district,
            province: userData.province,
            postalCode: userData.postalCode,
            country: userData.country,
            imageUrl: fullImageUrl,
            createdAt: userData.createdAt,
            updatedAt: userData.updatedAt,
            // Fields not available in cache - will be undefined
            subscriptionPlan: undefined,
            paymentExpiresAt: undefined,
            language: undefined,
            // Student/parent fields from cache
            studentId: userData.studentId,
            emergencyContact: userData.emergencyContact,
            bloodGroup: userData.bloodGroup,
            medicalConditions: userData.medicalConditions,
            allergies: userData.allergies,
            fatherId: userData.fatherId,
            motherId: userData.motherId,
            guardianId: userData.guardianId,
            occupation: userData.occupation,
            workplace: userData.workplace,
            workPhone: userData.workPhone,
            educationLevel: userData.educationLevel,
          }
        };
      }

      // 📊 STEP 2: Cache MISS - Fallback to database with student/parent joins
      this.logger.warn(`⚠️ Cache miss for user ${userId}, falling back to database`);
      
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: [
          'id', 'firstName', 'lastName', 'nameWithInitials', 'email', 'phoneNumber', 'userType',
          'dateOfBirth', 'gender', 'birthCertificateNo',
          'addressLine1', 'addressLine2', 'city', 'district', 'province',
          'postalCode', 'country', 'imageUrl',
          'subscriptionPlan', 'paymentExpiresAt',
          'language', 'createdAt', 'updatedAt',
          'rfid',
        ],
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // 🔗 STEP 2.5: Fetch student/parent data based on userType
      let studentData: any = null;
      let parentData: any = null;

      if (user.userType === UserType.USER) {
        // USER type: join both student AND parent tables
        try {
          studentData = await this.studentRepository.findOne({ where: { userId } });
        } catch (error) {
          this.logger.warn(`Student data lookup failed for userId ${userId}: ${error.message}`);
        }
        try {
          parentData = await this.parentRepository.findOne({ where: { userId } });
        } catch (error) {
          this.logger.warn(`Parent data lookup failed for userId ${userId}: ${error.message}`);
        }
      } else if (user.userType === UserType.USER_WITHOUT_PARENT) {
        // USER_WITHOUT_PARENT: join only student table
        try {
          studentData = await this.studentRepository.findOne({ where: { userId } });
        } catch (error) {
          this.logger.warn(`Student data lookup failed for userId ${userId}: ${error.message}`);
        }
      } else if (user.userType === UserType.USER_WITHOUT_STUDENT) {
        // USER_WITHOUT_STUDENT: join only parent table
        try {
          parentData = await this.parentRepository.findOne({ where: { userId } });
        } catch (error) {
          this.logger.warn(`Parent data lookup failed for userId ${userId}: ${error.message}`);
        }
      }

      // 💾 STEP 3: Cache the user data for future requests
      try {
        await this.userManagementService.setUserCache(user.id);
      } catch (cacheError) {
        this.logger.warn(`Failed to cache user data: ${cacheError.message}`);
      }

      // ✅ Transform imageUrl to full URL
      const fullImageUrl = user.imageUrl 
        ? this.cloudStorageService.getFullUrl(user.imageUrl)
        : undefined;

      return {
        success: true,
        data: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          nameWithInitials: user.nameWithInitials,
          email: user.email,
          phoneNumber: user.phoneNumber,
          userType: user.userType,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          birthCertificateNo: user.birthCertificateNo,
          addressLine1: user.addressLine1,
          addressLine2: user.addressLine2,
          city: user.city,
          district: user.district,
          province: user.province,
          postalCode: user.postalCode,
          country: user.country,
          imageUrl: fullImageUrl,
          subscriptionPlan: user.subscriptionPlan,
          paymentExpiresAt: user.paymentExpiresAt,
          language: user.language,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          rfid: user.rfid,
          // Student-specific fields (if exists)
          ...(studentData && {
            studentId: studentData.studentId,
            emergencyContact: studentData.emergencyContact,
            bloodGroup: studentData.bloodGroup,
            medicalConditions: studentData.medicalConditions,
            allergies: studentData.allergies,
            fatherId: studentData.fatherId,
            motherId: studentData.motherId,
            guardianId: studentData.guardianId,
          }),
          // Parent-specific fields (if exists)
          ...(parentData && {
            occupation: parentData.occupation,
            workplace: parentData.workplace,
            workPhone: parentData.workPhone,
            educationLevel: parentData.educationLevel,
          }),
        }
      };

    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      this.logger.error(`Error fetching user profile: ${error.message}`);
      throw new UnauthorizedException('Failed to fetch user profile');
    }
  }

  /**
   * 🔄 Generate refresh token
   * Creates a new refresh token for token renewal
   * @param userId - User ID
   * @param ipAddress - Client IP for audit
   * @param userAgent - Client user agent for audit
   * @param rememberMe - If true, token lasts 30 days; otherwise uses JWT_REFRESH_EXPIRES_IN (default 7d)
   */
  async generateRefreshToken(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    rememberMe: boolean = false
  ): Promise<string> {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const baseRefreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

    // 🔐 SSO: rememberMe extends refresh token to 30 days
    const refreshExpiresIn = rememberMe ? '30d' : baseRefreshExpiresIn;

    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    // Generate refresh token with minimal payload
    const payload = { 
      sub: userId,
      type: 'refresh',
      rm: rememberMe // Track rememberMe in token for refresh chain
    };

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn as any,
      algorithm: 'HS256', // M2: pin signing algorithm
    });

    // Calculate expiry date
    const expiresAt = now();
    const daysMatch = refreshExpiresIn.match(/(\d+)d/);
    if (daysMatch) {
      expiresAt.setDate(expiresAt.getDate() + parseInt(daysMatch[1]));
    } else {
      expiresAt.setDate(expiresAt.getDate() + 7); // Default 7 days
    }

    // 🔐 SECURITY: Store hashed token in database (prevents theft on DB breach)
    const currentTime = now();
    await this.refreshTokenRepository.save({
      token: this.hashToken(refreshToken),
      userId: userId,
      expiresAt: expiresAt,
      ipAddress: ipAddress,
      userAgent: userAgent,
      platform: 'web',       // 📱 Default to web for cookie-based auth
      deviceId: null,        // 📱 No device ID for web
      deviceName: null,      // 📱 No device name for web
      isRevoked: false,
      createdAt: currentTime,
      updatedAt: currentTime
    });

    return refreshToken;
  }

  /**
   * 🔄 Refresh access token using refresh token
   * Validates refresh token and generates new access token
   */
  async refreshAccessToken(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ 
    access_token: string; 
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    user: {
      id: string;
      email: string;
      nameWithInitials: string;
      userType: UserType;
      imageUrl?: string;
    }
  }> {
    try {
      const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

      if (!refreshSecret) {
        throw new Error('JWT_REFRESH_SECRET is not configured');
      }

      // Verify refresh token
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshSecret,
        algorithms: ['HS256'], // M2: pin verification algorithm
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // 🔐 SECURITY: Lookup by hashed token (with plain-text fallback for migration)
      const tokenRecord = await this.findRefreshTokenRecord(refreshToken, {
        userId: payload.sub,
        isRevoked: false
      });

      if (!tokenRecord) {
        throw new UnauthorizedException('Invalid or revoked refresh token');
      }

      // Check if token is expired
      if (now() > tokenRecord.expiresAt) {
        throw new UnauthorizedException('Refresh token expired');
      }

      // 🔐 Get user data with hierarchy validation
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        select: ['id', 'email', 'nameWithInitials', 'userType', 'isActive', 'imageUrl']
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // 🔐 SECURITY: Validate user is still active
      if (!user.isActive) {
        // Revoke all refresh tokens for inactive user
        await this.refreshTokenRepository.update(
          { userId: user.id },
          { isRevoked: true }
        );
        throw new UnauthorizedException('User account is inactive');
      }

      // Revoke old refresh token (token rotation)
      await this.refreshTokenRepository.update(
        { id: tokenRecord.id },
        { isRevoked: true, updatedAt: now() }
      );

      // Generate new access token with current hierarchy
      const jwtPayload = await this.enhancedJwtService.buildPayload(user);
      const access_token = await this.jwtService.signAsync(jwtPayload);

      // 🔐 SSO: Preserve rememberMe from original token chain
      const isRememberMe = payload.rm === true;

      // Generate new refresh token (preserving rememberMe)
      const new_refresh_token = await this.generateRefreshToken(
        user.id,
        ipAddress,
        userAgent,
        isRememberMe
      );

      // Calculate expiry info for frontend
      const jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '1h';
      const expires_in = this.parseExpiryToSeconds(jwtExpiresIn);
      const refresh_expires_in = isRememberMe ? 30 * 86400 : 7 * 86400;

      return {
        access_token,
        refresh_token: new_refresh_token,
        expires_in,
        refresh_expires_in,
        user: {
          id: user.id,
          email: user.email,
          nameWithInitials: user.nameWithInitials,
          userType: user.userType,
          imageUrl: user.imageUrl ? this.cloudStorageService.getFullUrl(user.imageUrl) : null
        }
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Refresh token error: ${error.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }


  /**
   * 🔐 Revoke refresh token
   * Invalidates a refresh token (logout)
   */
  async revokeRefreshToken(refreshToken: string): Promise<{ success: boolean }> {
    try {
      const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
      
      // Verify token to get userId
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshSecret,
        algorithms: ['HS256'], // M2: pin verification algorithm
      });

      // 🔐 SECURITY: Revoke by hashed token (with plain-text fallback)
      const tokenHash = this.hashToken(refreshToken);
      const result = await this.refreshTokenRepository.update(
        { token: tokenHash, userId: payload.sub },
        { isRevoked: true }
      );

      // Fallback: try plain text for legacy tokens
      if (result.affected === 0) {
        await this.refreshTokenRepository.update(
          { token: refreshToken, userId: payload.sub },
          { isRevoked: true }
        );
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Failed to revoke refresh token: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * 🗑️ Cleanup expired refresh tokens — runs every day at 02:30 Sri Lanka time.
   * Prevents the refresh_tokens table growing unboundedly.
   */
  @Cron('0 30 2 * * *', { name: 'cleanup-expired-refresh-tokens', timeZone: 'Asia/Colombo' })
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const result = await this.refreshTokenRepository.delete({
        expiresAt: LessThan(now()),
      });
      this.logger.log(`Token cleanup: removed ${result.affected ?? 0} expired refresh tokens`);
    } catch (error) {
      this.logger.error(`Failed to cleanup expired tokens: ${error.message}`);
    }
  }

  // ============================================================================
  // 📱 MOBILE AUTHENTICATION METHODS
  // ============================================================================

  /**
   * 📱 Mobile Login - Returns refresh token in response body
   * For mobile apps (iOS/Android) that cannot use httpOnly cookies
   * Tracks device ID for session management
   * @param rememberMe - If true, refresh token lasts 30 days
   */
  async loginMobile(
    user: UserEntity,
    deviceId: string,
    platform: 'android' | 'ios',
    ipAddress?: string,
    userAgent?: string,
    deviceName?: string,
    rememberMe: boolean = false
  ): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    payload: any;
    user: {
      id: string;
      email: string;
      nameWithInitials: string;
      userType: string;
      imageUrl?: string;
      firstLoginCompleted?: boolean;
    };
  }> {
    // Build JWT payload with user hierarchy
    const payload = await this.enhancedJwtService.buildPayload(user);
    
    // Generate access token
    const access_token = await this.jwtService.signAsync(payload);
    
    // Revoke any existing tokens for this device (single device session)
    await this.revokeDeviceTokens(user.id, deviceId);
    
    // Generate refresh token with device tracking (and rememberMe support)
    const refresh_token = await this.generateMobileRefreshToken(
      user.id,
      deviceId,
      platform,
      ipAddress,
      userAgent,
      deviceName,
      rememberMe
    );

    // Get access token expiry (default 1 hour = 3600 seconds)
    const jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '1h';
    const expires_in = this.parseExpiryToSeconds(jwtExpiresIn);

    // 🔐 SSO: Calculate refresh token expiry based on rememberMe
    const refresh_expires_in = rememberMe ? 30 * 86400 : 7 * 86400;

    return {
      access_token,
      refresh_token,
      expires_in,
      refresh_expires_in,
      payload,
      user: {
        id: user.id,
        email: user.email,
        nameWithInitials: user.nameWithInitials,
        userType: user.userType,
        imageUrl: user.imageUrl ? this.cloudStorageService.getFullUrl(user.imageUrl) : null,
        firstLoginCompleted: user.firstLoginCompleted ?? true,
      },
    };
  }

  /**
   * 📱 Generate Mobile Refresh Token
   * Creates refresh token with device and platform tracking
   * @param rememberMe - If true, token lasts 30 days; otherwise uses JWT_REFRESH_EXPIRES_IN (default 7d)
   */
  async generateMobileRefreshToken(
    userId: string,
    deviceId: string,
    platform: 'android' | 'ios',
    ipAddress?: string,
    userAgent?: string,
    deviceName?: string,
    rememberMe: boolean = false
  ): Promise<string> {
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const baseRefreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

    // 🔐 SSO: rememberMe extends refresh token to 30 days
    const refreshExpiresIn = rememberMe ? '30d' : baseRefreshExpiresIn;

    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    // Generate refresh token with device info in payload
    const payload = { 
      sub: userId,
      type: 'refresh',
      platform: platform,
      deviceId: deviceId,
      rm: rememberMe // Track rememberMe for refresh chain
    };

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn as any,
      algorithm: 'HS256', // M2: pin signing algorithm
    });

    // Calculate expiry date
    const expiresAt = now();
    const daysMatch = refreshExpiresIn.match(/(\d+)d/);
    if (daysMatch) {
      expiresAt.setDate(expiresAt.getDate() + parseInt(daysMatch[1]));
    } else {
      expiresAt.setDate(expiresAt.getDate() + 7); // Default 7 days
    }

    // 🔐 SECURITY: Store hashed token in database
    await this.refreshTokenRepository.save({
      token: this.hashToken(refreshToken),
      userId: userId,
      expiresAt: expiresAt,
      ipAddress: ipAddress,
      userAgent: userAgent,
      platform: platform,
      deviceId: deviceId,
      deviceName: deviceName,
      isRevoked: false,
      createdAt: now(),
      updatedAt: now()
    });

    return refreshToken;
  }

  /**
   * 📱 Mobile Token Refresh
   * Validates refresh token and device ID, returns new tokens
   */
  async refreshMobileToken(
    refreshToken: string,
    deviceId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    user: {
      id: string;
      email: string;
      nameWithInitials: string;
      userType: string;
      imageUrl?: string;
    };
  }> {
    try {
      const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

      if (!refreshSecret) {
        throw new Error('JWT_REFRESH_SECRET is not configured');
      }

      // Verify refresh token
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshSecret,
        algorithms: ['HS256'], // M2: pin verification algorithm
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      if (!payload.sub) {
        throw new UnauthorizedException('Invalid token payload');
      }

      // 📱 SECURITY: Verify device ID matches token
      if (payload.deviceId && payload.deviceId !== deviceId) {
        this.logger.warn(`⚠️ Device ID mismatch for user ${payload.sub}: expected ${payload.deviceId}, got ${deviceId}`);
        throw new UnauthorizedException('Device ID mismatch - token may have been stolen');
      }

      // 🔐 SECURITY: Lookup by hashed token (with plain-text fallback for migration)
      const tokenRecord = await this.findRefreshTokenRecord(refreshToken, {
        userId: payload.sub,
        isRevoked: false,
        deviceId: deviceId
      });

      if (!tokenRecord) {
        throw new UnauthorizedException('Invalid, revoked, or device-mismatched refresh token');
      }

      // Check if token is expired
      if (now() > tokenRecord.expiresAt) {
        throw new UnauthorizedException('Refresh token expired');
      }

      // Get user data with hierarchy validation
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        select: ['id', 'email', 'nameWithInitials', 'userType', 'isActive', 'imageUrl']
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // SECURITY: Validate user is still active
      if (!user.isActive) {
        await this.revokeDeviceTokens(user.id, deviceId);
        throw new UnauthorizedException('User account is inactive');
      }

      // Revoke old refresh token (token rotation)
      await this.refreshTokenRepository.update(
        { id: tokenRecord.id },
        { isRevoked: true, updatedAt: now() }
      );

      // Generate new access token
      const jwtPayload = await this.enhancedJwtService.buildPayload(user);
      const access_token = await this.jwtService.signAsync(jwtPayload);

      // 🔐 SSO: Preserve rememberMe from original token chain
      const isRememberMe = payload.rm === true;

      // Generate new refresh token for device (preserving rememberMe)
      const platform = tokenRecord.platform as 'android' | 'ios';
      const new_refresh_token = await this.generateMobileRefreshToken(
        user.id,
        deviceId,
        platform,
        ipAddress,
        userAgent,
        tokenRecord.deviceName,
        isRememberMe
      );

      // Get access token expiry
      const jwtExpiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '1h';
      const expires_in = this.parseExpiryToSeconds(jwtExpiresIn);
      const refresh_expires_in = isRememberMe ? 30 * 86400 : 7 * 86400;

      return {
        access_token,
        refresh_token: new_refresh_token,
        expires_in,
        refresh_expires_in,
        user: {
          id: user.id,
          email: user.email,
          nameWithInitials: user.nameWithInitials,
          userType: user.userType,
          imageUrl: user.imageUrl ? this.cloudStorageService.getFullUrl(user.imageUrl) : null
        }
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Mobile refresh token error: ${error.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * 📱 Mobile Logout
   * Revokes refresh token for specific device
   */
  async logoutMobile(
    refreshToken: string,
    deviceId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
      
      // Verify token to get userId
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshSecret,
        algorithms: ['HS256'], // M2: pin verification algorithm
      });

      // 🔐 SECURITY: Revoke by hashed token (with plain-text fallback)
      const tokenHash = this.hashToken(refreshToken);
      let result = await this.refreshTokenRepository.update(
        { 
          token: tokenHash, 
          userId: payload.sub,
          deviceId: deviceId 
        },
        { isRevoked: true, updatedAt: now() }
      );

      // Fallback: try plain text for legacy tokens
      if (result.affected === 0) {
        result = await this.refreshTokenRepository.update(
          { 
            token: refreshToken, 
            userId: payload.sub,
            deviceId: deviceId 
          },
          { isRevoked: true, updatedAt: now() }
        );
      }

      if (result.affected === 0) {
        this.logger.warn(`⚠️ Logout attempt for non-existent token: user ${payload.sub}, device ${deviceId}`);
      }

      return { 
        success: true, 
        message: 'Logged out successfully' 
      };
    } catch (error) {
      this.logger.error(`Mobile logout error: ${error.message}`);
      // Still return success to not leak information
      return { 
        success: true, 
        message: 'Logged out successfully' 
      };
    }
  }

  /**
   * 📱 Revoke all tokens for a specific device
   * Used when logging in on same device (single session per device)
   */
  async revokeDeviceTokens(userId: string, deviceId: string): Promise<void> {
    try {
      await this.refreshTokenRepository.update(
        { userId: userId, deviceId: deviceId, isRevoked: false },
        { isRevoked: true, updatedAt: now() }
      );
    } catch (error) {
      this.logger.error(`Failed to revoke device tokens: ${error.message}`);
    }
  }

  /**
   * 📱 Get active sessions for user with pagination
   * Returns list of active refresh tokens with device info
   * Only returns non-sensitive information
   */
  async getActiveSessions(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      platform?: 'web' | 'android' | 'ios';
      sortBy?: 'createdAt' | 'expiresAt' | 'platform';
      sortOrder?: 'ASC' | 'DESC';
    }
  ): Promise<{
    sessions: Array<{
      id: string;
      platform: string;
      deviceId: string | null;
      deviceName: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      createdAt: Date;
      expiresAt: Date;
      isRevoked: boolean;
    }>;
    total: number;
    summary: {
      totalSessions: number;
      webSessions: number;
      androidSessions: number;
      iosSessions: number;
    };
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const sortBy = options?.sortBy || 'createdAt';
    const sortOrder = options?.sortOrder || 'DESC';

    // Build where clause - only return non-revoked sessions
    const where: any = {
      userId: userId,
      isRevoked: false
    };

    if (options?.platform) {
      where.platform = options.platform;
    }

    // Get total count for pagination
    const total = await this.refreshTokenRepository.count({ where });

    // Get sessions with pagination - fetch all fields, then exclude sensitive data manually
    const sessionsRaw = await this.refreshTokenRepository.find({
      where,
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit
    });

    // Map sessions including all necessary fields
    const sessions = sessionsRaw.map(s => ({
      id: s.id,
      platform: s.platform,
      deviceId: s.deviceId,
      deviceName: s.deviceName,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isRevoked: s.isRevoked
    }));

    // Filter out expired sessions
    const activeSessions = sessions.filter(s => s.expiresAt > now());

    // Calculate summary statistics (from all non-expired sessions, not just current page)
    const allActiveSessions = await this.refreshTokenRepository.find({
      where: { userId, isRevoked: false }
    });

    const nonExpired = allActiveSessions.filter(s => s.expiresAt > now());
    const summary = {
      totalSessions: nonExpired.length,
      webSessions: nonExpired.filter(s => s.platform === 'web').length,
      androidSessions: nonExpired.filter(s => s.platform === 'android').length,
      iosSessions: nonExpired.filter(s => s.platform === 'ios').length
    };

    return {
      sessions: activeSessions,
      total: nonExpired.length, // Total non-expired sessions
      summary
    };
  }

  /**
   * 📱 Revoke all sessions for user
   * Used for security events (password change, etc.)
   * @returns Number of sessions revoked
   */
  async revokeAllUserSessions(userId: string): Promise<number> {
    try {
      const result = await this.refreshTokenRepository.update(
        { userId: userId, isRevoked: false },
        { isRevoked: true, updatedAt: now() }
      );
      return result.affected || 0;
    } catch (error) {
      this.logger.error(`Failed to revoke all sessions: ${error.message}`);
      return 0;
    }
  }

  /**
   * Calculate human-readable expiration time
   * @param expiresAt - The expiration date
   * @returns String like "7 days" or "2 hours" or "Expired"
   */
  calculateExpiresInHuman(expiresAt: Date): string {
    const currentTime = now();
    
    if (expiresAt <= currentTime) {
      return 'Expired';
    }

    const diffMs = expiresAt.getTime() - currentTime.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''}`;
    } else {
      return 'Less than 1 minute';
    }
  }

  /**
   * 🔐 Revoke a specific session by session ID
   * Validates that the session belongs to the requesting user
   */
  async revokeSessionById(userId: string, sessionId: string): Promise<void> {
    const result = await this.refreshTokenRepository.update(
      { id: sessionId, userId: userId, isRevoked: false },
      { isRevoked: true, updatedAt: now() }
    );

    if (result.affected === 0) {
      throw new UnauthorizedException('Session not found or already revoked');
    }
  }

  /**
   * � SECURITY: Hash refresh token with SHA-256 before storing in DB
   * Prevents token theft from database breaches
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * 🔐 SECURITY: Find refresh token record by hash (with plain-text fallback for migration)
   * Tries hashed lookup first; falls back to plain text for pre-migration tokens
   */
  private async findRefreshTokenRecord(
    token: string,
    additionalWhere: Record<string, any> = {}
  ): Promise<RefreshTokenEntity | null> {
    const tokenHash = this.hashToken(token);

    // 1. Try hashed lookup first (new tokens)
    let record = await this.refreshTokenRepository.findOne({
      where: { token: tokenHash, ...additionalWhere }
    });

    if (record) return record;

    // 2. Fallback: plain-text lookup (legacy tokens before migration).
    // L2: this widens the lookup surface to any un-migrated plaintext token. It's kept ON
    // by default so existing sessions don't break, but can be disabled once all rows are
    // hashed by setting REFRESH_TOKEN_PLAINTEXT_FALLBACK=false. Every hit is logged so the
    // remaining legacy tokens are observable before you turn it off.
    if (process.env.REFRESH_TOKEN_PLAINTEXT_FALLBACK === 'false') {
      return null;
    }

    record = await this.refreshTokenRepository.findOne({
      where: { token: token, ...additionalWhere }
    });

    if (record) {
      this.logger.warn(`Legacy plaintext refresh token used (id=${record.id}) — auto-migrating to hash`);
      // 🔄 Auto-migrate: update plain-text token to hashed version
      await this.refreshTokenRepository.update(
        { id: record.id },
        { token: tokenHash, updatedAt: now() }
      );
    }

    return record;
  }

  /**
   * 🔧 Parse JWT expiry string to seconds
   */
  private parseExpiryToSeconds(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default 1 hour

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 3600;
    }
  }

}
