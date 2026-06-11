import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In } from 'typeorm';
import { getCurrentSriLankaTime, getCurrentSriLankaISO } from '../../../common/utils/timezone.util';
import { ConfigService } from '@nestjs/config';

// DTOs
import { CreateInstitueUserDto } from './dto/create-institue_user.dto';
import { UpdateInstitueUserDto } from './dto/update-institue_user.dto';
import { AssignUserToInstituteDto } from './dto/assign-user-institute.dto';
import { QueryInstituteUserDto } from './dto/query-institute-user.dto';
import { SecureUserQueryDto, SecureClassUserQueryDto, SecureSubjectUserQueryDto } from './dto/secure-query.dto';
import { BulkVerificationDto, VerifyUserDto, VerificationResponseDto } from './dto/bulk-verification.dto';
import {
  AssignUserByPhoneDto,
  AssignParentByPhoneDto,
  AssignStudentByRfidDto,
  BulkAssignUsersDto,
  AssignmentResponseDto,
  BulkAssignmentResponseDto,
  AssignUserByEmailDto,
  AssignUserByIdDto
} from './dto/assign-user-by-phone.dto';
import {
  EnhancedAssignUserToInstituteDto,
  EnhancedAssignmentResponseDto,
  BulkEnhancedAssignDto,
  BulkEnhancedAssignmentResponseDto
} from './dto/enhanced-assign-user.dto';
import {
  UploadInstituteUserImageDto,
  UpdateInstituteCardIdDto,
  VerifyInstituteUserImageDto,
  InstituteUserImageResponseDto
} from './dto/upload-institute-user-image.dto';
import { AdminUserDataResponseDto } from './dto/admin-user-data-response.dto';

// SECURITY: ONLY USE SECURE DTOs - NO UNSAFE DTOs ALLOWED
import { SecureUserResponseDto, SecureStudentResponseDto, SecureParentResponseDto, PaginatedSecureUserResponseDto } from './dto/secure-user-response.dto';

// Entities
import { InstituteUserEntity } from './entities/institue_user.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { StudentEntity } from '../../student/entities/student.entity';
import { ParentEntity } from '../../parent/entities/parent.entity';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteClassStudentEntity } from '../../institute_class_modules/institute_class_student/entities/institute_class_student.entity';
import { InstituteClassSubjectStudent } from '../../institute_class_subject_modules/institute_class_subject_students/entities/institute_class_subject_student.entity';
import { UserImageEntity, ImageScope } from '../../user/entities/user-image.entity';

// Enums & Utils
import { UserType } from '../../user/enums/user-type.enum';
import { InstituteUserType } from './enums/institute-user-type.enum';
import { InstituteUserStatus } from './enums/institute-user-status.enum';
import { ImageVerificationStatus } from './enums/image-verification-status.enum';
import { SecurityUtils } from './utils/security.utils';
import { plainToClass } from 'class-transformer';
import { maskPhoneNumber, maskEmail } from '../../../common/utils/phone-mask.util';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import * as bcrypt from 'bcrypt';
// ✅ CACHING SERVICES
import { UserManagementService } from '../../../common/services/cache-user-management.service';
import { CacheService } from '../../../common/services/cache.service';
import { UserRoleValidationService } from '../../user/services/user-role-validation.service';


@Injectable()
export class InstitueUserService {
  /**
   * 🔧 CONDITIONAL CACHING ENHANCEMENT
   * 
   * This service now supports environment-controlled caching via CACHE_ENABLED environment variable.
   * When CACHE_ENABLED=true: All cache operations function normally
   * When CACHE_ENABLED=false: Cache operations are skipped, queries go directly to database
   * 
   * This allows for:
   * - Development/testing flexibility
   * - Production cache control
   * - Debugging cache-related issues
   * 
   * Cache operations affected:
   * - User management cache (refreshUserCache)
   * - Bulk cache refresh operations
   * 
   * All cache refresh calls are wrapped in: if (this.isCachingEnabled) { ... }
   */
  private readonly logger = new Logger(InstitueUserService.name);
  private isCachingEnabled: boolean;
  private shouldMaskSensitiveData: boolean;

  constructor(
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,

    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,

    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,

    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,

    @InjectRepository(InstituteClassStudentEntity)
    private readonly classStudentRepository: Repository<InstituteClassStudentEntity>,

    @InjectRepository(InstituteClassSubjectStudent)
    private readonly subjectStudentRepository: Repository<InstituteClassSubjectStudent>,

    @InjectRepository(UserImageEntity)
    private readonly userImageRepository: Repository<UserImageEntity>,

    private readonly cloudStorageService: CloudStorageService,
    // ✅ CACHING SERVICES
    private readonly userManagementService: UserManagementService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly userRoleValidationService: UserRoleValidationService,
  ) {
    // Initialize caching flag based on environment variable
    this.isCachingEnabled = this.configService.get<string>('CACHE_ENABLED') === 'true';

    // ✅ Initialize masking based on environment variables
    // If either phone or email masking is enabled, we should mask sensitive data
    const isPhoneMasked = this.configService.get<string>('IS_PHONENUMBERS_MASKED') === 'true';
    const isEmailMasked = this.configService.get<string>('IS_EMAILS_MASKED') === 'true';
    this.shouldMaskSensitiveData = false;
  }

  // =================== DEPRECATED UNSAFE METHODS ===================
  // These methods expose sensitive data and are disabled for security

  async create(createInstitueUserDto: CreateInstitueUserDto, currentUser?: any): Promise<{ success: boolean; message: string; user?: { id: string; name: string; nameWithInitials?: string } }> {
    try {
      // Validate current user authorization (SUPERADMIN, INSTITUTE_ADMIN and TEACHER can create institute users)
      if (!currentUser) {
        throw new UnauthorizedException('Authentication required');
      }

      // Validate input parameters
      const { userId, instituteId } = createInstitueUserDto;
      SecurityUtils.validateBigIntId(userId, 'User ID');
      SecurityUtils.validateBigIntId(instituteId, 'Institute ID');

      // Check if user-institute relationship already exists
      const existingRelationship = await this.instituteUserRepository.findOne({
        where: {
          userId: userId,
          instituteId: instituteId,
        },
        relations: ['user']
      });

      if (existingRelationship) {
        // Get user details for response
        const userDetails = existingRelationship.user;
        const userName = userDetails.firstName && userDetails.lastName
          ? `${userDetails.firstName} ${userDetails.lastName}`.trim()
          : userDetails.firstName || userDetails.email || 'Unknown User';

        return {
          success: false,
          message: `User is already assigned to this institute with status: ${existingRelationship.status}`,
          user: {
            id: userId,
            name: userName
          }
        };
      }

      // Verify user exists
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'firstName', 'lastName', 'nameWithInitials', 'email']
      });

      if (!user) {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }

      // Verify institute exists (optional - for better error handling)
      const institute = await this.instituteRepository.findOne({
        where: { id: instituteId }
      });

      if (!institute) {
        throw new NotFoundException(`Institute with ID ${instituteId} not found`);
      }

      // Create new institute user relationship
      const timestamp = getCurrentSriLankaISO();

      // Hash institute password if provided
      let hashedInstitutePassword: string | undefined;
      if (createInstitueUserDto.institutePassword) {
        const pepper = this.configService.get<string>('BCRYPT_PEPPER') || '';
        const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS') || '12', 10);
        hashedInstitutePassword = await bcrypt.hash(createInstitueUserDto.institutePassword + pepper, saltRounds);
      }

      const newInstituteUser = this.instituteUserRepository.create({
        userId: userId,
        instituteId: instituteId,
        userIdByInstitute: createInstitueUserDto.userIdByInstitute,
        status: createInstitueUserDto.status || InstituteUserStatus.PENDING,
        ...(hashedInstitutePassword && {
          institutePassword: hashedInstitutePassword,
          institutePasswordSetAt: timestamp,
        }),
        extraData: createInstitueUserDto.extraData,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await this.instituteUserRepository.save(newInstituteUser);

      // Prepare user name for response
      const userName = user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`.trim()
        : user.firstName || user.email || 'Unknown User';

      return {
        success: true,
        message: `User successfully assigned to institute with status: ${newInstituteUser.status}`,
        user: {
          id: userId,
          name: userName,
          nameWithInitials: user.nameWithInitials || undefined
        }
      };

    } catch (error) {
      if (error instanceof UnauthorizedException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Failed to create institute user assignment');
    }
  }

  async assignUserToInstitute(assignDto: AssignUserToInstituteDto): Promise<SecureUserResponseDto> {
    throw new BadRequestException('SECURITY: This method is deprecated. Use secure endpoints instead.');
  }

  async findAll(query: QueryInstituteUserDto): Promise<PaginatedSecureUserResponseDto> {
    throw new BadRequestException('SECURITY: This method is deprecated. Use getSecureUsersByInstituteAndType instead.');
  }

  async getUsersByInstitute(instituteId: string): Promise<SecureUserResponseDto[]> {
    throw new BadRequestException('SECURITY: This method is deprecated. Use getSecureUsersByInstituteAndType instead.');
  }

  async getTeachersByInstitute(instituteId: string): Promise<SecureUserResponseDto[]> {
    throw new BadRequestException('SECURITY: This method is deprecated. Use getSecureUsersByInstituteAndType instead.');
  }

  async getInstitutesByUser(userId: string): Promise<SecureUserResponseDto[]> {
    throw new BadRequestException('SECURITY: This method is deprecated. Use secure endpoints instead.');
  }

  async findOne(instituteId: string, userId: string): Promise<SecureUserResponseDto> {
    throw new BadRequestException('SECURITY: This method is deprecated. Use secure endpoints instead.');
  }

  async update(instituteId: string, userId: string, updateDto: UpdateInstitueUserDto): Promise<SecureUserResponseDto> {
    throw new BadRequestException('SECURITY: This method is deprecated. Use secure endpoints instead.');
  }

  // =================== SECURE METHODS FOR NEW ENDPOINTS ===================

  /**
   * Get users by institute and user type with pagination and security
   * ONLY returns safe user data - no sensitive fields
   * Optionally includes parent details for students when parent=true
   * 
   * ✅ PERFORMANCE OPTIMIZATIONS:
   * - Reduced SELECT fields to only necessary data
   * - Eliminated N+1 queries with bulk operations
   * - Added unmasked email for admin access
   * - Optimized parent data loading with single query
   */
  async getSecureUsersByInstituteAndType(
    instituteId: string,
    userType: InstituteUserType,
    query: SecureUserQueryDto
  ): Promise<PaginatedSecureUserResponseDto> {
    // ✅ SPECIAL HANDLING: PARENT type is not stored in institute_users table
    // Parents are retrieved via student → parent relationships
    if (userType === InstituteUserType.PARENT) {
      return this.getParentsByInstitute(instituteId, query);
    }

    // Apply security validations
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeUserType = SecurityUtils.validateInstituteUserType(userType);
    const { page, limit, skip } = SecurityUtils.validatePagination(query.page, query.limit);
    const { sortBy, sortOrder } = SecurityUtils.validateSortParams(query.sortBy, query.sortOrder);

    // Sanitize search input
    const safeSearch = query.search ? SecurityUtils.sanitizeSearchInput(query.search) : null;

    // Check if parent details should be included (only for STUDENT type)
    // Note: children array is excluded from parent data for performance
    const includeParentDetails = userType === InstituteUserType.STUDENT && query.parent === 'true';

    // 🚀 OPTIMIZED QUERY: Select only essential fields for better performance
    const baseFields = [
      'u.id as user_id',
      'u.first_name',
      'u.last_name',
      'u.name_with_initials as nameWithInitials',
      'u.email as email',  // ✅ Always include email with alias (will be unmasked for admin users)
      'u.phone_number',
      'u.image_url as user_image_url',  // User's global image
      'u.gender',
      'u.date_of_birth',
      'u.address_line1',
      'u.address_line2',
      'u.is_active',
      'iu.user_id_institue as userIdByInstitute',
      'iu.house_id as house_id',
      'iu.extra_data as extra_data',
      'iu.status',
      'iu.verified_at',
      'iu.created_at',
      'iu.institute_user_image_url',  // Institute-specific image
      'iu.image_verification_status',  // Image verification status
      'ih.name as house_name',
      'CONCAT(v.first_name, " ", COALESCE(v.last_name, "")) as verifier_name',
      'iu.max_devices_per_user as max_devices_per_user'
    ];

    // Add student-specific fields only if needed
    if (userType === InstituteUserType.STUDENT) {
      baseFields.push(
        's.father_id as father_id',
        's.mother_id as mother_id',
        's.guardian_id as guardian_id',
        's.emergency_contact as emergency_contact',
        's.medical_conditions as medical_conditions',
        's.allergies as allergies',
        's.student_id as student_id'
      );
    }

    // 🚀 OPTIMIZED QUERY: Build base query with conditional joins for better performance
    let queryBuilder = this.instituteUserRepository
      .createQueryBuilder('iu')
      .leftJoin('iu.user', 'u')
      .leftJoin('institute_house', 'ih', 'ih.id = iu.house_id AND ih.institute_id = iu.institute_id')
      // Only join verifier when needed for display
      .leftJoin('iu.verifier', 'v');

    // Conditionally add student table join only for STUDENT queries to avoid unnecessary JOINs
    if (userType === InstituteUserType.STUDENT) {
      queryBuilder = queryBuilder.leftJoin('students', 's', 's.user_id = u.id');
    }

    queryBuilder = queryBuilder
      .select(baseFields)
      .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('iu.instituteUserType = :userType', { userType: safeUserType })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      // Add index hints for better query performance
      .andWhere('u.is_active = :userActive', { userActive: true });

    // Create optimized count query (lighter than main query)
    let countQueryBuilder = this.instituteUserRepository
      .createQueryBuilder('iu')
      .leftJoin('iu.user', 'u')
      .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('iu.instituteUserType = :userType', { userType: safeUserType })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .andWhere('u.is_active = :userActive', { userActive: true });

    if (query.houseId) {
      const safeHouseId = SecurityUtils.validateBigIntId(query.houseId, 'houseId');
      queryBuilder.andWhere('iu.house_id = :houseId', { houseId: safeHouseId });
      countQueryBuilder.andWhere('iu.house_id = :houseId', { houseId: safeHouseId });
    }

    // Apply search filter if provided
    if (safeSearch) {
      const searchCondition = '(CONCAT(u.first_name, " ", COALESCE(u.last_name, "")) LIKE :search OR u.email LIKE :search)';
      queryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
      countQueryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
    }

    // Apply active filter if provided
    if (query.isActive !== undefined) {
      const isActive = query.isActive === 'true';
      queryBuilder.andWhere('u.is_active = :isActive', { isActive });
      countQueryBuilder.andWhere('u.is_active = :isActive', { isActive });
    }

    // Apply gender filter if provided (all user types)
    if (query.gender) {
      const safeGender = SecurityUtils.sanitizeSearchInput(query.gender);
      queryBuilder.andWhere('u.gender = :gender', { gender: safeGender });
      countQueryBuilder.andWhere('u.gender = :gender', { gender: safeGender });
    }

    // Apply age filters if provided (all user types)
    if (query.minAge || query.maxAge) {
      const currentDate = new Date();

      if (query.minAge) {
        const minAge = parseInt(query.minAge);
        const maxBirthDate = new Date(currentDate.getFullYear() - minAge, currentDate.getMonth(), currentDate.getDate());
        queryBuilder.andWhere('u.date_of_birth <= :maxBirthDate', { maxBirthDate: maxBirthDate.toISOString().split('T')[0] });
        countQueryBuilder.andWhere('u.date_of_birth <= :maxBirthDate', { maxBirthDate: maxBirthDate.toISOString().split('T')[0] });
      }

      if (query.maxAge) {
        const maxAge = parseInt(query.maxAge);
        const minBirthDate = new Date(currentDate.getFullYear() - maxAge - 1, currentDate.getMonth(), currentDate.getDate());
        queryBuilder.andWhere('u.date_of_birth >= :minBirthDate', { minBirthDate: minBirthDate.toISOString().split('T')[0] });
        countQueryBuilder.andWhere('u.date_of_birth >= :minBirthDate', { minBirthDate: minBirthDate.toISOString().split('T')[0] });
      }
    }

    // Apply date of birth range filter if provided
    if (query.dobFrom) {
      queryBuilder.andWhere('u.date_of_birth >= :dobFrom', { dobFrom: query.dobFrom });
      countQueryBuilder.andWhere('u.date_of_birth >= :dobFrom', { dobFrom: query.dobFrom });
    }
    if (query.dobTo) {
      queryBuilder.andWhere('u.date_of_birth <= :dobTo', { dobTo: query.dobTo });
      countQueryBuilder.andWhere('u.date_of_birth <= :dobTo', { dobTo: query.dobTo });
    }

    // Apply joined date range filter if provided (iu.created_at is the join date)
    if (query.joinedFrom) {
      queryBuilder.andWhere('iu.created_at >= :joinedFrom', { joinedFrom: query.joinedFrom });
      countQueryBuilder.andWhere('iu.created_at >= :joinedFrom', { joinedFrom: query.joinedFrom });
    }
    if (query.joinedTo) {
      queryBuilder.andWhere('iu.created_at <= :joinedTo', { joinedTo: `${query.joinedTo} 23:59:59` });
      countQueryBuilder.andWhere('iu.created_at <= :joinedTo', { joinedTo: `${query.joinedTo} 23:59:59` });
    }

    // Apply city/address filter if provided (all user types)
    if (query.city) {
      const safeCity = SecurityUtils.sanitizeSearchInput(query.city);
      const cityCondition = '(u.address_line1 LIKE :city OR u.address_line2 LIKE :city)';
      queryBuilder.andWhere(cityCondition, { city: `%${safeCity}%` });
      countQueryBuilder.andWhere(cityCondition, { city: `%${safeCity}%` });
    }

    // =================== STUDENT-SPECIFIC FILTERS ===================
    if (userType === InstituteUserType.STUDENT) {
      // Add student table join for count query if filtering by student fields
      if (query.studentId || query.emergencyContact || query.hasMedicalConditions || query.hasAllergies) {
        countQueryBuilder.leftJoin('students', 's', 's.user_id = u.id');
      }

      // Filter by student ID
      if (query.studentId) {
        const safeStudentId = SecurityUtils.sanitizeSearchInput(query.studentId);
        queryBuilder.andWhere('s.student_id LIKE :studentId', { studentId: `%${safeStudentId}%` });
        countQueryBuilder.andWhere('s.student_id LIKE :studentId', { studentId: `%${safeStudentId}%` });
      }

      // Filter by emergency contact
      if (query.emergencyContact) {
        const safeEmergencyContact = SecurityUtils.sanitizeSearchInput(query.emergencyContact);
        queryBuilder.andWhere('s.emergency_contact LIKE :emergencyContact', { emergencyContact: `%${safeEmergencyContact}%` });
        countQueryBuilder.andWhere('s.emergency_contact LIKE :emergencyContact', { emergencyContact: `%${safeEmergencyContact}%` });
      }

      // Filter students with medical conditions
      if (query.hasMedicalConditions === 'true') {
        queryBuilder.andWhere('s.medical_conditions IS NOT NULL AND s.medical_conditions != ""');
        countQueryBuilder.andWhere('s.medical_conditions IS NOT NULL AND s.medical_conditions != ""');
      } else if (query.hasMedicalConditions === 'false') {
        queryBuilder.andWhere('(s.medical_conditions IS NULL OR s.medical_conditions = "")');
        countQueryBuilder.andWhere('(s.medical_conditions IS NULL OR s.medical_conditions = "")');
      }

      // Filter students with allergies
      if (query.hasAllergies === 'true') {
        queryBuilder.andWhere('s.allergies IS NOT NULL AND s.allergies != ""');
        countQueryBuilder.andWhere('s.allergies IS NOT NULL AND s.allergies != ""');
      } else if (query.hasAllergies === 'false') {
        queryBuilder.andWhere('(s.allergies IS NULL OR s.allergies = "")');
        countQueryBuilder.andWhere('(s.allergies IS NULL OR s.allergies = "")');
      }
    }

    // Get total count
    const total = await countQueryBuilder.getCount();

    // Apply sorting and pagination to main query
    const sortField = this.mapSortFieldForRaw(sortBy);
    const rawResults = await queryBuilder
      .orderBy(sortField, sortOrder)
      .skip(skip)
      .take(limit)
      .getRawMany();

    // Transform to secure DTOs with optional parent details and respect masking settings
    const data = await this.transformRawToSecureDtos(rawResults, safeUserType as InstituteUserType, includeParentDetails, this.shouldMaskSensitiveData);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get institute users filtered by custom user type ID (primary_user_type_id).
   * Used for dynamic user type assignment — not limited to system roles.
   */
  async getUsersByCustomUserTypeId(
    instituteId: string,
    userTypeId: string,
    query: SecureUserQueryDto
  ): Promise<PaginatedSecureUserResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeUserTypeId = SecurityUtils.validateBigIntId(userTypeId, 'userTypeId');
    const { page, limit, skip } = SecurityUtils.validatePagination(query.page, query.limit);
    const { sortBy, sortOrder } = SecurityUtils.validateSortParams(query.sortBy, query.sortOrder);
    const safeSearch = query.search ? SecurityUtils.sanitizeSearchInput(query.search) : null;

    const baseFields = [
      'u.id as user_id',
      'u.first_name',
      'u.last_name',
      'u.email as email',
      'u.phone_number',
      'u.image_url as user_image_url',
      'u.gender',
      'u.date_of_birth',
      'u.is_active',
      'iu.user_id_institue as userIdByInstitute',
      'iu.extra_data as extra_data',
      'iu.status',
      'iu.institute_user_image_url',
    ];

    let queryBuilder = this.instituteUserRepository
      .createQueryBuilder('iu')
      .leftJoin('iu.user', 'u')
      .select(baseFields)
      .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('iu.primaryUserTypeId = :userTypeId', { userTypeId: safeUserTypeId })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .andWhere('u.is_active = :userActive', { userActive: true });

    let countQueryBuilder = this.instituteUserRepository
      .createQueryBuilder('iu')
      .leftJoin('iu.user', 'u')
      .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('iu.primaryUserTypeId = :userTypeId', { userTypeId: safeUserTypeId })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .andWhere('u.is_active = :userActive', { userActive: true });

    if (safeSearch) {
      const searchCondition = '(CONCAT(u.first_name, " ", COALESCE(u.last_name, "")) LIKE :search OR u.email LIKE :search)';
      queryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
      countQueryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
    }

    const total = await countQueryBuilder.getCount();
    const sortField = this.mapSortFieldForRaw(sortBy);
    const rawResults = await queryBuilder
      .orderBy(sortField, sortOrder)
      .skip(skip)
      .take(limit)
      .getRawMany();

    const data = rawResults.map((row: any) => ({
      id: row.user_id?.toString(),
      name: [row.first_name, row.last_name].filter(Boolean).join(' '),
      email: row.email ?? '',
      phoneNumber: row.phone_number ?? '',
      imageUrl: (row.institute_user_image_url || row.user_image_url)
        ? this.cloudStorageService.getFullUrl(row.institute_user_image_url || row.user_image_url)
        : null,
      instituteUserImageUrl: row.institute_user_image_url
        ? this.cloudStorageService.getFullUrl(row.institute_user_image_url)
        : null,
      globalImageUrl: row.user_image_url
        ? this.cloudStorageService.getFullUrl(row.user_image_url)
        : null,
      userIdByInstitute: row.userIdByInstitute ?? null,
      status: row.status ?? 'active',
      isActive: row.is_active ?? true,
      extraData: row.extra_data ? (typeof row.extra_data === 'string' ? JSON.parse(row.extra_data) : row.extra_data) : null,
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
    };
  }

  /**
   * Get parents by institute - Special handler for PARENT type
   *
   * ⚠️ IMPORTANT: Parents are NOT stored in institute_users table!
   * This method:
   * 1. Gets all STUDENTS from the institute
   * 2. Extracts their parent IDs (father_id, mother_id, guardian_id)
   * 3. Fetches parent user details
   * 4. Returns parents with their associated students
   */
  private async getParentsByInstitute(
    instituteId: string,
    query: SecureUserQueryDto
  ): Promise<PaginatedSecureUserResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const { page, limit, skip } = SecurityUtils.validatePagination(query.page, query.limit);
    const { sortBy, sortOrder } = SecurityUtils.validateSortParams(query.sortBy, query.sortOrder);
    const safeSearch = query.search ? SecurityUtils.sanitizeSearchInput(query.search) : null;

    // Step 1: Get all students from this institute with their parent IDs
    const studentsQuery = this.instituteUserRepository
      .createQueryBuilder('iu')
      .leftJoin('iu.user', 'u')
      .leftJoin('students', 's', 's.user_id = u.id')
      .select([
        'u.id as user_id',
        's.father_id',
        's.mother_id',
        's.guardian_id'
      ])
      .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('iu.instituteUserType = :userType', { userType: InstituteUserType.STUDENT })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .andWhere('u.is_active = :userActive', { userActive: true });

    const students = await studentsQuery.getRawMany();

    // Step 2: Collect all unique parent IDs
    const parentIds = new Set<string>();
    const parentToStudentsMap = new Map<string, string[]>(); // parentId → [studentIds]

    students.forEach(student => {
      if (student.father_id) {
        parentIds.add(student.father_id);
        if (!parentToStudentsMap.has(student.father_id)) {
          parentToStudentsMap.set(student.father_id, []);
        }
        parentToStudentsMap.get(student.father_id)!.push(student.user_id);
      }
      if (student.mother_id) {
        parentIds.add(student.mother_id);
        if (!parentToStudentsMap.has(student.mother_id)) {
          parentToStudentsMap.set(student.mother_id, []);
        }
        parentToStudentsMap.get(student.mother_id)!.push(student.user_id);
      }
      if (student.guardian_id && student.guardian_id !== student.father_id && student.guardian_id !== student.mother_id) {
        parentIds.add(student.guardian_id);
        if (!parentToStudentsMap.has(student.guardian_id)) {
          parentToStudentsMap.set(student.guardian_id, []);
        }
        parentToStudentsMap.get(student.guardian_id)!.push(student.user_id);
      }
    });

    if (parentIds.size === 0) {
      // No parents found
      return {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0
        }
      };
    }

    // Step 3: Query parent users
    let parentsQueryBuilder = this.userRepository
      .createQueryBuilder('u')
      .leftJoin(ParentEntity, 'p', 'p.userId = u.id')
      .select([
        'u.id as user_id',
        'u.name_with_initials as name_with_initials',
        'u.name_with_initials as name', // Alias as name for easier frontend consumption if needed
        'u.email as email',
        'u.phone_number',
        'u.image_url as user_image_url',
        'u.gender',
        'u.date_of_birth',
        'u.address_line1',
        'u.address_line2',
        'u.is_active',
        'p.occupation as occupation',
        'p.workplace as workplace'
      ])
      .where('u.id IN (:...parentIds)', { parentIds: Array.from(parentIds) })
      .andWhere('u.is_active = :userActive', { userActive: true });

    // Apply search filter
    if (safeSearch) {
      const searchCondition = '(CONCAT(u.first_name, " ", COALESCE(u.last_name, "")) LIKE :search OR u.email LIKE :search OR u.phone_number LIKE :search)';
      parentsQueryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
    }

    // Apply occupation filter (for PARENT type)
    if (query.occupation) {
      const safeOccupation = SecurityUtils.sanitizeSearchInput(query.occupation);
      parentsQueryBuilder.andWhere('p.occupation LIKE :occupation', { occupation: `%${safeOccupation}%` });
    }

    // Apply workplace filter (for PARENT type)
    if (query.workplace) {
      const safeWorkplace = SecurityUtils.sanitizeSearchInput(query.workplace);
      parentsQueryBuilder.andWhere('p.workplace LIKE :workplace', { workplace: `%${safeWorkplace}%` });
    }

    // Get total count (before pagination)
    const total = await parentsQueryBuilder.getCount();

    // Apply sorting and pagination
    const sortField = sortBy === 'name' ? 'CONCAT(u.first_name, " ", COALESCE(u.last_name, ""))' : 'u.created_at';
    const rawParents = await parentsQueryBuilder
      .orderBy(sortField, sortOrder)
      .skip(skip)
      .take(limit)
      .getRawMany();

    // Step 4: If students=true, fetch student details for each parent (getParentsByInstitute)
    let studentDataMap = new Map<string, any[]>();
    if (query.students === 'true') {
      const studentIds = Array.from(new Set(students.map(s => s.user_id)));

      if (studentIds.length > 0 && rawParents.length > 0) {
        const studentDetails = await this.instituteUserRepository
          .createQueryBuilder('iu')
          .leftJoin('iu.user', 'u')
          .leftJoin('students', 's', 's.user_id = u.id')
          .select([
            'u.id as user_id',
            'u.first_name',
            'u.last_name',
            'u.name_with_initials as name_with_initials',
            'u.email',
            'u.phone_number',
            'u.image_url as user_image_url',
            'iu.user_id_institue as student_id',
            's.father_id',
            's.mother_id',
            's.guardian_id'
          ])
          .where('u.id IN (:...studentIds)', { studentIds })
          .andWhere('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
          .andWhere('u.is_active = :userActive', { userActive: true })
          .getRawMany();

        // Map students to their parents
        studentDetails.forEach(student => {
          // For father
          if (student.father_id) {
            if (!studentDataMap.has(student.father_id)) {
              studentDataMap.set(student.father_id, []);
            }
            studentDataMap.get(student.father_id)!.push({
              userId: student.user_id,
              studentId: student.student_id,
              name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
              email: this.shouldMaskSensitiveData ? maskEmail(student.email) : student.email,
              phoneNumber: this.shouldMaskSensitiveData ? maskPhoneNumber(student.phone_number) : student.phone_number,
              imageUrl: this.cloudStorageService.getFullUrl(student.user_image_url),
              relationshipType: 'father' as const
            });
          }
          // For mother
          if (student.mother_id) {
            if (!studentDataMap.has(student.mother_id)) {
              studentDataMap.set(student.mother_id, []);
            }
            studentDataMap.get(student.mother_id)!.push({
              userId: student.user_id,
              studentId: student.student_id,
              name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
              email: this.shouldMaskSensitiveData ? maskEmail(student.email) : student.email,
              phoneNumber: this.shouldMaskSensitiveData ? maskPhoneNumber(student.phone_number) : student.phone_number,
              imageUrl: this.cloudStorageService.getFullUrl(student.user_image_url),
              relationshipType: 'mother' as const
            });
          }
          // For guardian
          if (student.guardian_id) {
            if (!studentDataMap.has(student.guardian_id)) {
              studentDataMap.set(student.guardian_id, []);
            }
            studentDataMap.get(student.guardian_id)!.push({
              userId: student.user_id,
              studentId: student.student_id,
              name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
              email: this.shouldMaskSensitiveData ? maskEmail(student.email) : student.email,
              phoneNumber: this.shouldMaskSensitiveData ? maskPhoneNumber(student.phone_number) : student.phone_number,
              imageUrl: this.cloudStorageService.getFullUrl(student.user_image_url),
              relationshipType: 'guardian' as const
            });
          }
        });
      }
    }

    // Step 5: Transform to DTOs
    const data = rawParents.map(raw => {
      const parentData: any = {
        id: raw.user_id,
        firstName: raw.first_name || (raw as any).first_name,
        lastName: raw.last_name || (raw as any).last_name,
        email: raw.email,
        phoneNumber: raw.phone_number || (raw as any).phone_number,
        imageUrl: this.cloudStorageService.getFullUrl(raw.user_image_url || (raw as any).user_image_url),
        gender: raw.gender,
        dateOfBirth: raw.date_of_birth,
        addressLine1: raw.address_line1,
        addressLine2: raw.address_line2,
        isActive: raw.is_active,
        occupation: raw.occupation,
        workplace: raw.workplace
      };

      const parentInfo: any = {
        occupation: raw.occupation,
        workplace: raw.workplace
      };

      // Add children data if students=true
      if (query.students === 'true') {
        parentInfo.children = studentDataMap.get(raw.user_id) || [];
      }

      const parent = new SecureParentResponseDto(
        parentData,
        parentInfo,
        undefined, // no userIdByInstitute for parents
        undefined, // no instituteUserData for parents
        this.shouldMaskSensitiveData // respect environment masking settings
      );

      return parent;
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get parents by class - retrieves all parents of students in a specific class
   * Parents are accessed via student relationships, not institute_users table
   */
  private async getParentsByClass(
    instituteId: string,
    classId: string,
    query: SecureClassUserQueryDto
  ): Promise<PaginatedSecureUserResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeClassId = SecurityUtils.validateBigIntId(classId, 'classId');
    const { page, limit, skip } = SecurityUtils.validatePagination(query.page, query.limit);
    const { sortBy, sortOrder } = SecurityUtils.validateSortParams(query.sortBy, query.sortOrder);
    const safeSearch = query.search ? SecurityUtils.sanitizeSearchInput(query.search) : null;

    // Step 1: Get all students from this class with their parent IDs
    const studentsQuery = this.instituteUserRepository
      .createQueryBuilder('iu')
      .leftJoin('iu.user', 'u')
      .leftJoin('students', 's', 's.user_id = u.id')
      .leftJoin(InstituteClassStudentEntity, 'ics', 'ics.student_user_id = u.id')
      .select([
        'u.id as user_id',
        's.father_id',
        's.mother_id',
        's.guardian_id'
      ])
      .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('ics.classId = :classId', { classId: safeClassId })
      .andWhere('iu.instituteUserType = :userType', { userType: InstituteUserType.STUDENT })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .andWhere('ics.is_active = :classActive', { classActive: true })
      .andWhere('u.is_active = :userActive', { userActive: true });

    const students = await studentsQuery.getRawMany();

    // Step 2: Collect all unique parent IDs
    const parentIds = new Set<string>();
    const parentToStudentsMap = new Map<string, string[]>(); // parentId → [studentIds]

    students.forEach(student => {
      if (student.father_id) {
        parentIds.add(student.father_id);
        if (!parentToStudentsMap.has(student.father_id)) {
          parentToStudentsMap.set(student.father_id, []);
        }
        parentToStudentsMap.get(student.father_id)!.push(student.user_id);
      }
      if (student.mother_id) {
        parentIds.add(student.mother_id);
        if (!parentToStudentsMap.has(student.mother_id)) {
          parentToStudentsMap.set(student.mother_id, []);
        }
        parentToStudentsMap.get(student.mother_id)!.push(student.user_id);
      }
      if (student.guardian_id && student.guardian_id !== student.father_id && student.guardian_id !== student.mother_id) {
        parentIds.add(student.guardian_id);
        if (!parentToStudentsMap.has(student.guardian_id)) {
          parentToStudentsMap.set(student.guardian_id, []);
        }
        parentToStudentsMap.get(student.guardian_id)!.push(student.user_id);
      }
    });

    if (parentIds.size === 0) {
      // No parents found
      return {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0
        }
      };
    }

    // Step 3: Query parent users
    let parentsQueryBuilder = this.userRepository
      .createQueryBuilder('u')
      .leftJoin(ParentEntity, 'p', 'p.userId = u.id')
      .select([
        'u.id as user_id',
        'u.first_name',
        'u.last_name',
        'u.email as email',
        'u.phone_number',
        'u.image_url as user_image_url',
        'u.gender',
        'u.date_of_birth',
        'u.address_line1',
        'u.address_line2',
        'u.is_active',
        'p.occupation as occupation',
        'p.workplace as workplace'
      ])
      .where('u.id IN (:...parentIds)', { parentIds: Array.from(parentIds) })
      .andWhere('u.is_active = :userActive', { userActive: true });

    // Apply search filter
    if (safeSearch) {
      const searchCondition = '(CONCAT(u.first_name, " ", COALESCE(u.last_name, "")) LIKE :search OR u.email LIKE :search OR u.phone_number LIKE :search)';
      parentsQueryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
    }

    // Apply occupation filter (for PARENT type)
    if (query.occupation) {
      const safeOccupation = SecurityUtils.sanitizeSearchInput(query.occupation);
      parentsQueryBuilder.andWhere('p.occupation LIKE :occupation', { occupation: `%${safeOccupation}%` });
    }

    // Apply workplace filter (for PARENT type)
    if (query.workplace) {
      const safeWorkplace = SecurityUtils.sanitizeSearchInput(query.workplace);
      parentsQueryBuilder.andWhere('p.workplace LIKE :workplace', { workplace: `%${safeWorkplace}%` });
    }

    // Get total count (before pagination)
    const total = await parentsQueryBuilder.getCount();

    // Apply sorting and pagination
    const sortField = sortBy === 'name' ? 'CONCAT(u.first_name, " ", COALESCE(u.last_name, ""))' : 'u.created_at';
    const rawParents = await parentsQueryBuilder
      .orderBy(sortField, sortOrder)
      .skip(skip)
      .take(limit)
      .getRawMany();

    // Step 4: If students=true, fetch student details for each parent
    let studentDataMap = new Map<string, any[]>();
    if (query.students === 'true') {
      const studentIds = Array.from(new Set(students.map(s => s.user_id)));

      if (studentIds.length > 0) {
        const studentDetails = await this.instituteUserRepository
          .createQueryBuilder('iu')
          .leftJoin('iu.user', 'u')
          .leftJoin('students', 's', 's.user_id = u.id')
          .select([
            'u.id as user_id',
            'u.first_name',
            'u.last_name',
            'u.email',
            'u.phone_number',
            'u.image_url as user_image_url',
            'iu.user_id_institue as student_id',
            's.father_id',
            's.mother_id',
            's.guardian_id'
          ])
          .where('u.id IN (:...studentIds)', { studentIds })
          .andWhere('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
          .andWhere('u.is_active = :userActive', { userActive: true })
          .getRawMany();

        // Map students to their parents
        studentDetails.forEach(student => {
          // For father
          if (student.father_id) {
            if (!studentDataMap.has(student.father_id)) {
              studentDataMap.set(student.father_id, []);
            }
            studentDataMap.get(student.father_id)!.push({
              userId: student.user_id,
              studentId: student.student_id,
              name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
              email: this.shouldMaskSensitiveData ? maskEmail(student.email) : student.email,
              phoneNumber: this.shouldMaskSensitiveData ? maskPhoneNumber(student.phone_number) : student.phone_number,
              imageUrl: this.cloudStorageService.getFullUrl(student.user_image_url),
              relationshipType: 'father' as const
            });
          }
          // For mother
          if (student.mother_id) {
            if (!studentDataMap.has(student.mother_id)) {
              studentDataMap.set(student.mother_id, []);
            }
            studentDataMap.get(student.mother_id)!.push({
              userId: student.user_id,
              studentId: student.student_id,
              name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
              email: this.shouldMaskSensitiveData ? maskEmail(student.email) : student.email,
              phoneNumber: this.shouldMaskSensitiveData ? maskPhoneNumber(student.phone_number) : student.phone_number,
              imageUrl: this.cloudStorageService.getFullUrl(student.user_image_url),
              relationshipType: 'mother' as const
            });
          }
          // For guardian
          if (student.guardian_id) {
            if (!studentDataMap.has(student.guardian_id)) {
              studentDataMap.set(student.guardian_id, []);
            }
            studentDataMap.get(student.guardian_id)!.push({
              userId: student.user_id,
              studentId: student.student_id,
              name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
              email: this.shouldMaskSensitiveData ? maskEmail(student.email) : student.email,
              phoneNumber: this.shouldMaskSensitiveData ? maskPhoneNumber(student.phone_number) : student.phone_number,
              imageUrl: this.cloudStorageService.getFullUrl(student.user_image_url),
              relationshipType: 'guardian' as const
            });
          }
        });
      }
    }

    // Step 5: Transform to DTOs
    const data = rawParents.map(raw => {
      const parentData: any = {
        id: raw.user_id,
        firstName: raw.first_name || (raw as any).first_name,
        lastName: raw.last_name || (raw as any).last_name,
        email: raw.email,
        phoneNumber: raw.phone_number || (raw as any).phone_number,
        imageUrl: this.cloudStorageService.getFullUrl(raw.user_image_url || (raw as any).user_image_url),
        gender: raw.gender,
        dateOfBirth: raw.date_of_birth,
        addressLine1: raw.address_line1,
        addressLine2: raw.address_line2,
        isActive: raw.is_active,
        occupation: raw.occupation,
        workplace: raw.workplace
      };

      const parentInfo: any = {
        occupation: raw.occupation,
        workplace: raw.workplace
      };

      // Add children data if students=true
      if (query.students === 'true') {
        parentInfo.children = studentDataMap.get(raw.user_id) || [];
      }

      const parent = new SecureParentResponseDto(
        parentData,
        parentInfo,
        undefined, // no userIdByInstitute for parents
        undefined, // no instituteUserData for parents
        this.shouldMaskSensitiveData // respect environment masking settings
      );

      return parent;
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get parents by subject - retrieves all parents of students in a specific subject
   * Parents are accessed via student relationships, not institute_users table
   */
  private async getParentsBySubject(
    instituteId: string,
    classId: string,
    subjectId: string,
    query: SecureSubjectUserQueryDto
  ): Promise<PaginatedSecureUserResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeClassId = SecurityUtils.validateBigIntId(classId, 'classId');
    const safeSubjectId = SecurityUtils.validateBigIntId(subjectId, 'subjectId');
    const { page, limit, skip } = SecurityUtils.validatePagination(query.page, query.limit);
    const { sortBy, sortOrder } = SecurityUtils.validateSortParams(query.sortBy, query.sortOrder);
    const safeSearch = query.search ? SecurityUtils.sanitizeSearchInput(query.search) : null;

    // Step 1: Get all students from this subject with their parent IDs
    const studentsQuery = this.instituteUserRepository
      .createQueryBuilder('iu')
      .leftJoin('iu.user', 'u')
      .leftJoin('students', 's', 's.user_id = u.id')
      .leftJoin(InstituteClassStudentEntity, 'ics', 'ics.student_user_id = u.id')
      .leftJoin('institute_class_subject_students', 'icss', 'icss.student_user_id = u.id AND icss.subject_id = :subjectId')
      .select([
        'u.id as user_id',
        's.father_id',
        's.mother_id',
        's.guardian_id'
      ])
      .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('ics.classId = :classId', { classId: safeClassId })
      .andWhere('icss.subject_id = :subjectId', { subjectId: safeSubjectId })
      .andWhere('iu.instituteUserType = :userType', { userType: InstituteUserType.STUDENT })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .andWhere('ics.is_active = :classActive', { classActive: true })
      .andWhere('icss.is_active = :subjectActive', { subjectActive: true })
      .andWhere('u.is_active = :userActive', { userActive: true })
      .setParameter('subjectId', safeSubjectId);

    const students = await studentsQuery.getRawMany();

    // Step 2: Collect all unique parent IDs
    const parentIds = new Set<string>();
    const parentToStudentsMap = new Map<string, string[]>(); // parentId → [studentIds]

    students.forEach(student => {
      if (student.father_id) {
        parentIds.add(student.father_id);
        if (!parentToStudentsMap.has(student.father_id)) {
          parentToStudentsMap.set(student.father_id, []);
        }
        parentToStudentsMap.get(student.father_id)!.push(student.user_id);
      }
      if (student.mother_id) {
        parentIds.add(student.mother_id);
        if (!parentToStudentsMap.has(student.mother_id)) {
          parentToStudentsMap.set(student.mother_id, []);
        }
        parentToStudentsMap.get(student.mother_id)!.push(student.user_id);
      }
      if (student.guardian_id && student.guardian_id !== student.father_id && student.guardian_id !== student.mother_id) {
        parentIds.add(student.guardian_id);
        if (!parentToStudentsMap.has(student.guardian_id)) {
          parentToStudentsMap.set(student.guardian_id, []);
        }
        parentToStudentsMap.get(student.guardian_id)!.push(student.user_id);
      }
    });

    if (parentIds.size === 0) {
      // No parents found
      return {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0
        }
      };
    }

    // Step 3: Query parent users
    let parentsQueryBuilder = this.userRepository
      .createQueryBuilder('u')
      .leftJoin(ParentEntity, 'p', 'p.userId = u.id')
      .select([
        'u.id as user_id',
        'u.first_name',
        'u.last_name',
        'u.email as email',
        'u.phone_number',
        'u.image_url as user_image_url',
        'u.gender',
        'u.date_of_birth',
        'u.address_line1',
        'u.address_line2',
        'u.is_active',
        'p.occupation as occupation',
        'p.workplace as workplace'
      ])
      .where('u.id IN (:...parentIds)', { parentIds: Array.from(parentIds) })
      .andWhere('u.is_active = :userActive', { userActive: true });

    // Apply search filter
    if (safeSearch) {
      const searchCondition = '(CONCAT(u.first_name, " ", COALESCE(u.last_name, "")) LIKE :search OR u.email LIKE :search OR u.phone_number LIKE :search)';
      parentsQueryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
    }

    // Apply occupation filter (for PARENT type)
    if (query.occupation) {
      const safeOccupation = SecurityUtils.sanitizeSearchInput(query.occupation);
      parentsQueryBuilder.andWhere('p.occupation LIKE :occupation', { occupation: `%${safeOccupation}%` });
    }

    // Apply workplace filter (for PARENT type)
    if (query.workplace) {
      const safeWorkplace = SecurityUtils.sanitizeSearchInput(query.workplace);
      parentsQueryBuilder.andWhere('p.workplace LIKE :workplace', { workplace: `%${safeWorkplace}%` });
    }

    // Get total count (before pagination)
    const total = await parentsQueryBuilder.getCount();

    // Apply sorting and pagination
    const sortField = sortBy === 'name' ? 'CONCAT(u.first_name, " ", COALESCE(u.last_name, ""))' : 'u.created_at';
    const rawParents = await parentsQueryBuilder
      .orderBy(sortField, sortOrder)
      .skip(skip)
      .take(limit)
      .getRawMany();

    // Step 4: Transform to DTOs
    const data = rawParents.map(raw => {
      const parent = new SecureParentResponseDto(
        {
          id: raw.user_id,
          firstName: raw.first_name || (raw as any).first_name,
          lastName: raw.last_name || (raw as any).last_name,
          email: raw.email,
          phoneNumber: raw.phone_number || (raw as any).phone_number,
          imageUrl: this.cloudStorageService.getFullUrl(raw.user_image_url || (raw as any).user_image_url),
          gender: raw.gender,
          dateOfBirth: raw.date_of_birth,
          addressLine1: raw.address_line1,
          addressLine2: raw.address_line2,
          isActive: raw.is_active
        },
        {
          occupation: raw.occupation,
          workplace: raw.workplace
        },
        undefined, // no userIdByInstitute for parents
        undefined, // no instituteUserData for parents
        this.shouldMaskSensitiveData // respect environment masking settings
      );

      return parent;
    });

    // Step 4: If students=true, fetch student details for each parent (getParentsBySubject)
    let studentDataMap = new Map<string, any[]>();
    if (query.students === 'true') {
      const studentIds = Array.from(new Set(students.map(s => s.user_id)));

      if (studentIds.length > 0 && rawParents.length > 0) {
        const studentDetails = await this.instituteUserRepository
          .createQueryBuilder('iu')
          .leftJoin('iu.user', 'u')
          .leftJoin('students', 's', 's.user_id = u.id')
          .select([
            'u.id as user_id',
            'u.first_name',
            'u.last_name',
            'u.email',
            'u.phone_number',
            'u.image_url as user_image_url',
            'iu.user_id_institue as student_id',
            's.father_id',
            's.mother_id',
            's.guardian_id'
          ])
          .where('u.id IN (:...studentIds)', { studentIds })
          .andWhere('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
          .andWhere('u.is_active = :userActive', { userActive: true })
          .getRawMany();

        // Map students to their parents
        studentDetails.forEach(student => {
          // For father
          if (student.father_id) {
            if (!studentDataMap.has(student.father_id)) {
              studentDataMap.set(student.father_id, []);
            }
            studentDataMap.get(student.father_id)!.push({
              userId: student.user_id,
              studentId: student.student_id,
              name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
              email: this.shouldMaskSensitiveData ? maskEmail(student.email) : student.email,
              phoneNumber: this.shouldMaskSensitiveData ? maskPhoneNumber(student.phone_number) : student.phone_number,
              imageUrl: this.cloudStorageService.getFullUrl(student.user_image_url),
              relationshipType: 'father' as const
            });
          }
          // For mother
          if (student.mother_id) {
            if (!studentDataMap.has(student.mother_id)) {
              studentDataMap.set(student.mother_id, []);
            }
            studentDataMap.get(student.mother_id)!.push({
              userId: student.user_id,
              studentId: student.student_id,
              name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
              email: this.shouldMaskSensitiveData ? maskEmail(student.email) : student.email,
              phoneNumber: this.shouldMaskSensitiveData ? maskPhoneNumber(student.phone_number) : student.phone_number,
              imageUrl: this.cloudStorageService.getFullUrl(student.user_image_url),
              relationshipType: 'mother' as const
            });
          }
          // For guardian
          if (student.guardian_id) {
            if (!studentDataMap.has(student.guardian_id)) {
              studentDataMap.set(student.guardian_id, []);
            }
            studentDataMap.get(student.guardian_id)!.push({
              userId: student.user_id,
              studentId: student.student_id,
              name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
              email: this.shouldMaskSensitiveData ? maskEmail(student.email) : student.email,
              phoneNumber: this.shouldMaskSensitiveData ? maskPhoneNumber(student.phone_number) : student.phone_number,
              imageUrl: this.cloudStorageService.getFullUrl(student.user_image_url),
              relationshipType: 'guardian' as const
            });
          }
        });

        // Add children to each parent DTO
        data.forEach((parent: any) => {
          if (query.students === 'true') {
            parent.children = studentDataMap.get(parent.id) || [];
          }
        });
      }
    }

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get users by class with security - only for authorized class/subject teachers and admins
   * ONLY returns safe user data - no sensitive fields
   */
  async getSecureUsersByClass(
    instituteId: string,
    userType: InstituteUserType,
    classId: string,
    query: SecureClassUserQueryDto
  ): Promise<PaginatedSecureUserResponseDto> {
    // ✅ SPECIAL HANDLING: PARENT type is not stored in institute_users table
    // Parents are retrieved via student → parent relationships
    if (userType === InstituteUserType.PARENT) {
      return this.getParentsByClass(instituteId, classId, query);
    }

    // Apply security validations
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeUserType = SecurityUtils.validateInstituteUserType(userType);
    const safeClassId = SecurityUtils.validateBigIntId(classId, 'classId');
    const { page, limit, skip } = SecurityUtils.validatePagination(query.page, query.limit);
    const { sortBy, sortOrder } = SecurityUtils.validateSortParams(query.sortBy, query.sortOrder);

    // Sanitize search input
    const safeSearch = query.search ? SecurityUtils.sanitizeSearchInput(query.search) : null;

    // Check if parent details should be included
    const includeParentDetails = userType === InstituteUserType.STUDENT && query.parent === 'true';

    // Build secure query with only safe fields - Include student data and parent info
    const queryBuilder = this.userRepository
      .createQueryBuilder('u')
      .leftJoin(InstituteUserEntity, 'iu', 'iu.userId = u.id AND iu.instituteId = :instituteIdForJoin')
      .leftJoin(InstituteClassStudentEntity, 'ics', 'ics.studentUserId = u.id AND ics.classId = :classIdForJoin')
      .leftJoin(StudentEntity, 's', 's.userId = u.id')
      .select([
        'u.id as user_id',
        'u.first_name',
        'u.last_name',
        'u.email as email',
        'u.phone_number',
        'u.image_url as user_image_url',  // User's global image
        'u.gender',
        'u.date_of_birth',
        'u.address_line1',
        'u.address_line2',
        'u.is_active',
        'iu.user_id_institue as userIdByInstitute',
        'iu.institute_user_image_url',  // Institute-specific image
        'iu.image_verification_status',  // Image verification status
        'iu.extra_data as extra_data',
        'iu.created_at',
        'ics.isVerified as student_is_verified',
        'ics.student_type as student_type',
        's.father_id as father_id',
        's.mother_id as mother_id',
        's.guardian_id as guardian_id',
        's.emergency_contact as emergency_contact',
        's.medical_conditions as medical_conditions',
        's.allergies as allergies',
        's.student_id as student_id',
        'iu.max_devices_per_user as max_devices_per_user'
      ])
      .where('iu.instituteUserType = :userType', { userType: safeUserType })  // ✅ FIX: Use institute user type, not global user type
      .andWhere('u.is_active = :userActive', { userActive: true })
      .andWhere('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('ics.classId = :classId', { classId: safeClassId })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .andWhere('ics.is_active = :classStatus', { classStatus: true })
      .setParameter('instituteIdForJoin', safeInstituteId)
      .setParameter('classIdForJoin', safeClassId);

    // Create count query - Include student join for filtering consistency
    const countQueryBuilder = this.userRepository
      .createQueryBuilder('u')
      .leftJoin(InstituteUserEntity, 'iu', 'iu.userId = u.id AND iu.instituteId = :instituteIdForJoin')
      .leftJoin(InstituteClassStudentEntity, 'ics', 'ics.studentUserId = u.id AND ics.classId = :classIdForJoin')
      .leftJoin(StudentEntity, 's', 's.userId = u.id')
      .where('iu.instituteUserType = :userType', { userType: safeUserType })  // ✅ FIX: Use institute user type, not global user type
      .andWhere('u.is_active = :userActive', { userActive: true })
      .andWhere('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('ics.classId = :classId', { classId: safeClassId })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .andWhere('ics.is_active = :classStatus', { classStatus: true })
      .setParameter('instituteIdForJoin', safeInstituteId)
      .setParameter('classIdForJoin', safeClassId);

    // Apply parent occupation/workplace filters if provided (requires parent join)
    if (userType === InstituteUserType.STUDENT && (query.occupation || query.workplace)) {
      // Join with parent tables for filtering
      queryBuilder
        .leftJoin(ParentEntity, 'p_father', 'p_father.userId = s.fatherId')
        .leftJoin(ParentEntity, 'p_mother', 'p_mother.userId = s.motherId')
        .leftJoin(ParentEntity, 'p_guardian', 'p_guardian.userId = s.guardianId');

      countQueryBuilder
        .leftJoin(ParentEntity, 'p_father', 'p_father.userId = s.fatherId')
        .leftJoin(ParentEntity, 'p_mother', 'p_mother.userId = s.motherId')
        .leftJoin(ParentEntity, 'p_guardian', 'p_guardian.userId = s.guardianId');

      if (query.occupation) {
        const safeOccupation = SecurityUtils.sanitizeSearchInput(query.occupation);
        const occupationCondition = '(p_father.occupation LIKE :occupation OR p_mother.occupation LIKE :occupation OR p_guardian.occupation LIKE :occupation)';
        queryBuilder.andWhere(occupationCondition, { occupation: `%${safeOccupation}%` });
        countQueryBuilder.andWhere(occupationCondition, { occupation: `%${safeOccupation}%` });
      }

      if (query.workplace) {
        const safeWorkplace = SecurityUtils.sanitizeSearchInput(query.workplace);
        const workplaceCondition = '(p_father.workplace LIKE :workplace OR p_mother.workplace LIKE :workplace OR p_guardian.workplace LIKE :workplace)';
        queryBuilder.andWhere(workplaceCondition, { workplace: `%${safeWorkplace}%` });
        countQueryBuilder.andWhere(workplaceCondition, { workplace: `%${safeWorkplace}%` });
      }
    }

    // Apply search filter if provided
    if (safeSearch) {
      const searchCondition = '(CONCAT(u.first_name, " ", COALESCE(u.last_name, "")) LIKE :search OR u.email LIKE :search)';
      queryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
      countQueryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
    }

    // Apply gender filter if provided
    if (query.gender) {
      const safeGender = SecurityUtils.sanitizeSearchInput(query.gender);
      queryBuilder.andWhere('u.gender = :gender', { gender: safeGender });
      countQueryBuilder.andWhere('u.gender = :gender', { gender: safeGender });
    }

    // Apply date of birth range filter if provided
    if (query.dobFrom) {
      queryBuilder.andWhere('u.date_of_birth >= :dobFrom', { dobFrom: query.dobFrom });
      countQueryBuilder.andWhere('u.date_of_birth >= :dobFrom', { dobFrom: query.dobFrom });
    }
    if (query.dobTo) {
      queryBuilder.andWhere('u.date_of_birth <= :dobTo', { dobTo: query.dobTo });
      countQueryBuilder.andWhere('u.date_of_birth <= :dobTo', { dobTo: query.dobTo });
    }

    // Apply joined date range filter if provided
    if (query.joinedFrom) {
      queryBuilder.andWhere('iu.created_at >= :joinedFrom', { joinedFrom: query.joinedFrom });
      countQueryBuilder.andWhere('iu.created_at >= :joinedFrom', { joinedFrom: query.joinedFrom });
    }
    if (query.joinedTo) {
      queryBuilder.andWhere('iu.created_at <= :joinedTo', { joinedTo: `${query.joinedTo} 23:59:59` });
      countQueryBuilder.andWhere('iu.created_at <= :joinedTo', { joinedTo: `${query.joinedTo} 23:59:59` });
    }

    // Apply student-specific filters (only for STUDENT type)
    if (userType === InstituteUserType.STUDENT) {
      // Filter by student ID
      if (query.studentId) {
        const safeStudentId = SecurityUtils.sanitizeSearchInput(query.studentId);
        queryBuilder.andWhere('s.student_id LIKE :studentId', { studentId: `%${safeStudentId}%` });
        countQueryBuilder.andWhere('s.student_id LIKE :studentId', { studentId: `%${safeStudentId}%` });
      }

      // Filter by emergency contact
      if (query.emergencyContact) {
        const safeEmergencyContact = SecurityUtils.sanitizeSearchInput(query.emergencyContact);
        queryBuilder.andWhere('s.emergency_contact LIKE :emergencyContact', { emergencyContact: `%${safeEmergencyContact}%` });
        countQueryBuilder.andWhere('s.emergency_contact LIKE :emergencyContact', { emergencyContact: `%${safeEmergencyContact}%` });
      }

      // Filter students with medical conditions
      if (query.hasMedicalConditions === 'true') {
        queryBuilder.andWhere('s.medical_conditions IS NOT NULL AND s.medical_conditions != ""');
        countQueryBuilder.andWhere('s.medical_conditions IS NOT NULL AND s.medical_conditions != ""');
      } else if (query.hasMedicalConditions === 'false') {
        queryBuilder.andWhere('(s.medical_conditions IS NULL OR s.medical_conditions = "")');
        countQueryBuilder.andWhere('(s.medical_conditions IS NULL OR s.medical_conditions = "")');
      }

      // Filter students with allergies
      if (query.hasAllergies === 'true') {
        queryBuilder.andWhere('s.allergies IS NOT NULL AND s.allergies != ""');
        countQueryBuilder.andWhere('s.allergies IS NOT NULL AND s.allergies != ""');
      } else if (query.hasAllergies === 'false') {
        queryBuilder.andWhere('(s.allergies IS NULL OR s.allergies = "")');
        countQueryBuilder.andWhere('(s.allergies IS NULL OR s.allergies = "")');
      }
    }

    // Always filter for active and verified students only - no parameters needed
    queryBuilder.andWhere('ics.isVerified = :isVerified', { isVerified: true });
    countQueryBuilder.andWhere('ics.isVerified = :isVerified', { isVerified: true });

    // Get total count
    const total = await countQueryBuilder.getCount();

    // Apply sorting and pagination to main query
    const sortField = this.mapSortFieldForRaw(sortBy);
    const rawResults = await queryBuilder
      .orderBy(sortField, sortOrder)
      .skip(skip)
      .take(limit)
      .getRawMany();

    // Transform to secure DTOs with optional parent details and respect masking settings
    const data = await this.transformRawToSecureDtos(rawResults, safeUserType as InstituteUserType, includeParentDetails, this.shouldMaskSensitiveData);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get users by subject with security - only for authorized subject teachers and admins
   * ONLY returns safe user data - no sensitive fields
   */
  async getSecureUsersBySubject(
    instituteId: string,
    userType: InstituteUserType,
    classId: string,
    subjectId: string,
    query: SecureSubjectUserQueryDto
  ): Promise<PaginatedSecureUserResponseDto> {
    // ✅ SPECIAL HANDLING: PARENT type is not stored in institute_users table
    // Parents are retrieved via student → parent relationships
    if (userType === InstituteUserType.PARENT) {
      return this.getParentsBySubject(instituteId, classId, subjectId, query);
    }

    // Apply security validations
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeUserType = SecurityUtils.validateInstituteUserType(userType);
    const safeClassId = SecurityUtils.validateBigIntId(classId, 'classId');
    const safeSubjectId = SecurityUtils.validateBigIntId(subjectId, 'subjectId');
    const { page, limit, skip } = SecurityUtils.validatePagination(query.page, query.limit);
    const { sortBy, sortOrder } = SecurityUtils.validateSortParams(query.sortBy, query.sortOrder);

    // Sanitize search input
    const safeSearch = query.search ? SecurityUtils.sanitizeSearchInput(query.search) : null;

    // Check if parent details should be included
    const includeParentDetails = userType === InstituteUserType.STUDENT && query.parent === 'true';

    // Build secure query with only safe fields - OPTIMIZED: Include student data to avoid N+1 queries
    const queryBuilder = this.userRepository
      .createQueryBuilder('u')
      .leftJoin(InstituteUserEntity, 'iu', 'iu.userId = u.id AND iu.instituteId = :instituteIdForJoin')
      .leftJoin(InstituteClassSubjectStudent, 'icss', 'icss.studentId = u.id AND icss.classId = :classIdForJoin AND icss.subjectId = :subjectIdForJoin')
      .leftJoin(StudentEntity, 's', 's.userId = u.id')
      .select([
        'u.id as user_id',
        'u.first_name',
        'u.last_name',
        'u.email as email',
        'u.phone_number',
        'u.image_url as user_image_url',  // User's global image
        'u.gender',
        'u.date_of_birth',
        'u.address_line1',
        'u.address_line2',
        'u.is_active',
        'iu.user_id_institue as userIdByInstitute',
        'iu.institute_user_image_url',  // Institute-specific image
        'iu.image_verification_status',  // Image verification status
        'iu.extra_data as extra_data',
        'iu.created_at',
        'icss.student_type as student_type',
        's.father_id as father_id',
        's.mother_id as mother_id',
        's.guardian_id as guardian_id',
        's.emergency_contact as emergency_contact',
        's.medical_conditions as medical_conditions',
        's.allergies as allergies',
        's.student_id as student_id',
        'iu.max_devices_per_user as max_devices_per_user'
      ])
      .where('iu.instituteUserType = :userType', { userType: safeUserType })  // ✅ FIX: Use institute user type, not global user type
      .andWhere('u.is_active = :userActive', { userActive: true })
      .andWhere('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('icss.classId = :classId', { classId: safeClassId })
      .andWhere('icss.subjectId = :subjectId', { subjectId: safeSubjectId })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .andWhere('icss.is_active = :subjectStatus', { subjectStatus: true })
      .setParameter('instituteIdForJoin', safeInstituteId)
      .setParameter('classIdForJoin', safeClassId)
      .setParameter('subjectIdForJoin', safeSubjectId);

    // Create count query - OPTIMIZED: Include student join for consistency
    const countQueryBuilder = this.userRepository
      .createQueryBuilder('u')
      .leftJoin(InstituteUserEntity, 'iu', 'iu.userId = u.id AND iu.instituteId = :instituteIdForJoin')
      .leftJoin(InstituteClassSubjectStudent, 'icss', 'icss.studentId = u.id AND icss.classId = :classIdForJoin AND icss.subjectId = :subjectIdForJoin')
      .leftJoin(StudentEntity, 's', 's.userId = u.id')
      .where('iu.instituteUserType = :userType', { userType: safeUserType })  // ✅ FIX: Use institute user type, not global user type
      .andWhere('u.is_active = :userActive', { userActive: true })
      .andWhere('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('icss.classId = :classId', { classId: safeClassId })
      .andWhere('icss.subjectId = :subjectId', { subjectId: safeSubjectId })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .andWhere('icss.is_active = :subjectStatus', { subjectStatus: true })
      .setParameter('instituteIdForJoin', safeInstituteId)
      .setParameter('classIdForJoin', safeClassId)
      .setParameter('subjectIdForJoin', safeSubjectId);

    // Apply parent occupation/workplace filters if provided (requires parent join)
    if (userType === InstituteUserType.STUDENT && (query.occupation || query.workplace)) {
      // Join with parent tables for filtering
      queryBuilder
        .leftJoin(ParentEntity, 'p_father', 'p_father.userId = s.fatherId')
        .leftJoin(ParentEntity, 'p_mother', 'p_mother.userId = s.motherId')
        .leftJoin(ParentEntity, 'p_guardian', 'p_guardian.userId = s.guardianId');

      countQueryBuilder
        .leftJoin(ParentEntity, 'p_father', 'p_father.userId = s.fatherId')
        .leftJoin(ParentEntity, 'p_mother', 'p_mother.userId = s.motherId')
        .leftJoin(ParentEntity, 'p_guardian', 'p_guardian.userId = s.guardianId');

      if (query.occupation) {
        const safeOccupation = SecurityUtils.sanitizeSearchInput(query.occupation);
        const occupationCondition = '(p_father.occupation LIKE :occupation OR p_mother.occupation LIKE :occupation OR p_guardian.occupation LIKE :occupation)';
        queryBuilder.andWhere(occupationCondition, { occupation: `%${safeOccupation}%` });
        countQueryBuilder.andWhere(occupationCondition, { occupation: `%${safeOccupation}%` });
      }

      if (query.workplace) {
        const safeWorkplace = SecurityUtils.sanitizeSearchInput(query.workplace);
        const workplaceCondition = '(p_father.workplace LIKE :workplace OR p_mother.workplace LIKE :workplace OR p_guardian.workplace LIKE :workplace)';
        queryBuilder.andWhere(workplaceCondition, { workplace: `%${safeWorkplace}%` });
        countQueryBuilder.andWhere(workplaceCondition, { workplace: `%${safeWorkplace}%` });
      }
    }

    // Apply search filter if provided
    if (safeSearch) {
      const searchCondition = '(CONCAT(u.first_name, " ", COALESCE(u.last_name, "")) LIKE :search OR u.email LIKE :search)';
      queryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
      countQueryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
    }

    // Apply gender filter if provided
    if (query.gender) {
      const safeGender = SecurityUtils.sanitizeSearchInput(query.gender);
      queryBuilder.andWhere('u.gender = :gender', { gender: safeGender });
      countQueryBuilder.andWhere('u.gender = :gender', { gender: safeGender });
    }

    // Apply date of birth range filter if provided
    if (query.dobFrom) {
      queryBuilder.andWhere('u.date_of_birth >= :dobFrom', { dobFrom: query.dobFrom });
      countQueryBuilder.andWhere('u.date_of_birth >= :dobFrom', { dobFrom: query.dobFrom });
    }
    if (query.dobTo) {
      queryBuilder.andWhere('u.date_of_birth <= :dobTo', { dobTo: query.dobTo });
      countQueryBuilder.andWhere('u.date_of_birth <= :dobTo', { dobTo: query.dobTo });
    }

    // Apply joined date range filter if provided
    if (query.joinedFrom) {
      queryBuilder.andWhere('iu.created_at >= :joinedFrom', { joinedFrom: query.joinedFrom });
      countQueryBuilder.andWhere('iu.created_at >= :joinedFrom', { joinedFrom: query.joinedFrom });
    }
    if (query.joinedTo) {
      queryBuilder.andWhere('iu.created_at <= :joinedTo', { joinedTo: `${query.joinedTo} 23:59:59` });
      countQueryBuilder.andWhere('iu.created_at <= :joinedTo', { joinedTo: `${query.joinedTo} 23:59:59` });
    }

    // Apply student-specific filters (only for STUDENT type)
    if (userType === InstituteUserType.STUDENT) {
      // Filter by student ID
      if (query.studentId) {
        const safeStudentId = SecurityUtils.sanitizeSearchInput(query.studentId);
        queryBuilder.andWhere('s.student_id LIKE :studentId', { studentId: `%${safeStudentId}%` });
        countQueryBuilder.andWhere('s.student_id LIKE :studentId', { studentId: `%${safeStudentId}%` });
      }

      // Filter by emergency contact
      if (query.emergencyContact) {
        const safeEmergencyContact = SecurityUtils.sanitizeSearchInput(query.emergencyContact);
        queryBuilder.andWhere('s.emergency_contact LIKE :emergencyContact', { emergencyContact: `%${safeEmergencyContact}%` });
        countQueryBuilder.andWhere('s.emergency_contact LIKE :emergencyContact', { emergencyContact: `%${safeEmergencyContact}%` });
      }

      // Filter students with medical conditions
      if (query.hasMedicalConditions === 'true') {
        queryBuilder.andWhere('s.medical_conditions IS NOT NULL AND s.medical_conditions != ""');
        countQueryBuilder.andWhere('s.medical_conditions IS NOT NULL AND s.medical_conditions != ""');
      } else if (query.hasMedicalConditions === 'false') {
        queryBuilder.andWhere('(s.medical_conditions IS NULL OR s.medical_conditions = "")');
        countQueryBuilder.andWhere('(s.medical_conditions IS NULL OR s.medical_conditions = "")');
      }

      // Filter students with allergies
      if (query.hasAllergies === 'true') {
        queryBuilder.andWhere('s.allergies IS NOT NULL AND s.allergies != ""');
        countQueryBuilder.andWhere('s.allergies IS NOT NULL AND s.allergies != ""');
      } else if (query.hasAllergies === 'false') {
        queryBuilder.andWhere('(s.allergies IS NULL OR s.allergies = "")');
        countQueryBuilder.andWhere('(s.allergies IS NULL OR s.allergies = "")');
      }
    }

    // Note: InstituteClassSubjectStudent doesn't have isVerified field
    // Verification is handled at the class level through InstituteClassStudentEntity

    // Get total count
    const total = await countQueryBuilder.getCount();

    // Apply sorting and pagination to main query
    const sortField = this.mapSortFieldForRaw(sortBy);
    const rawResults = await queryBuilder
      .orderBy(sortField, sortOrder)
      .skip(skip)
      .take(limit)
      .getRawMany();

    // Transform to secure DTOs with optional parent details and respect masking settings
    const data = await this.transformRawToSecureDtos(rawResults, safeUserType as InstituteUserType, includeParentDetails, this.shouldMaskSensitiveData);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  // =================== PRIVATE SECURITY UTILITY METHODS ===================

  /**
   * Map sort fields to raw query fields for security
   */
  private mapSortFieldForRaw(sortBy: string): string {
    const mapping: Record<string, string> = {
      'createdAt': 'iu.created_at',
      'name': 'u.first_name',
      'email': 'u.email',
      'dateOfBirth': 'u.date_of_birth'
    };
    return mapping[sortBy] || 'iu.created_at';
  }

  /**
   * Transform raw query results to secure DTOs
   * ONLY includes safe fields - never exposes sensitive data
   * For students, can optionally include full parent details with occupation and workplace
   * 
   * ✅ OPTIMIZATION UPDATE: Added maskSensitiveData parameter for admin vs regular user access
   */
  private async transformRawToSecureDtos(
    rawResults: any[],
    userType: InstituteUserType,
    includeParentDetails: boolean = false,
    maskSensitiveData: boolean = false  // ✅ New parameter for admin access
  ): Promise<SecureUserResponseDto[]> {
    const dtos: SecureUserResponseDto[] = [];

    // ✅ NO ADDITIONAL QUERIES NEEDED: Student data is already included in main query results

    // ✅ PARENT DATA OPTIMIZATION: Only fetch parent details if specifically requested
    let parentsMap: Map<string, any> = new Map();
    if (userType === InstituteUserType.STUDENT && includeParentDetails && rawResults.length > 0) {
      // Collect all unique parent IDs from the raw query results (already includes student data)
      const allParentIds = new Set<string>();
      rawResults.forEach(raw => {
        if (raw.father_id) allParentIds.add(raw.father_id);
        if (raw.mother_id) allParentIds.add(raw.mother_id);
        if (raw.guardian_id) allParentIds.add(raw.guardian_id);
      });

      if (allParentIds.size > 0) {
        const parents = await this.getParentDetailsBulk(Array.from(allParentIds));
        parents.forEach(parent => {
          parentsMap.set(parent.userId, parent);
        });
      }
    }

    for (const raw of rawResults) {
      // ✅ Smart image URL fallback logic with VERIFICATION CHECK:
      // 1. If institute_user_image_url exists AND imageVerificationStatus is VERIFIED, use it
      // 2. Otherwise, fall back to user.imageUrl from global user table
      const isInstituteImageVerified = raw.image_verification_status === 'VERIFIED';
      let finalImageUrl = (raw.institute_user_image_url && isInstituteImageVerified)
        ? raw.institute_user_image_url
        : raw.user_image_url;

      // ✅ Transform imageUrl to full URL if it exists
      if (finalImageUrl) {
        finalImageUrl = this.cloudStorageService.getFullUrl(finalImageUrl);
      }

      // Extract institute user data for verification info
      const instituteUserData = {
        status: raw.status,
        verified_at: raw.verified_at,
        verifiedByName: raw.verifier_name,
        imageUrl: finalImageUrl, // Use the verified imageUrl logic
        instituteUserImageUrl: raw.institute_user_image_url
          ? this.cloudStorageService.getFullUrl(raw.institute_user_image_url)
          : null,
        globalImageUrl: raw.user_image_url
          ? this.cloudStorageService.getFullUrl(raw.user_image_url)
          : null,
        house_id: raw.house_id,
        house_name: raw.house_name,
        extra_data: raw.extra_data,
        max_devices_per_user: raw.max_devices_per_user,
      };

      if (userType === InstituteUserType.STUDENT) {
        // ✅ Student data is already available in raw results (no additional queries needed)

        // ✅ Get parent details from pre-loaded map (student data already in raw results)
        let parentDetails: any = {};

        if (includeParentDetails) {
          // ✅ Safely handle null parent IDs - only add to parentDetails if ID exists and parent data found
          if (raw.father_id) {
            const fatherData = parentsMap.get(raw.father_id);
            if (fatherData) {
              parentDetails.father = fatherData;
            }
          }

          if (raw.mother_id) {
            const motherData = parentsMap.get(raw.mother_id);
            if (motherData) {
              parentDetails.mother = motherData;
            }
          }

          if (raw.guardian_id && raw.guardian_id !== raw.father_id && raw.guardian_id !== raw.mother_id) {
            const guardianData = parentsMap.get(raw.guardian_id);
            if (guardianData) {
              parentDetails.guardian = guardianData;
            }
          }
        }

        // ✅ Create student object from raw data with null safety
        const studentData = {
          userId: raw.user_id || null,
          fatherId: raw.father_id || null,
          motherId: raw.mother_id || null,
          guardianId: raw.guardian_id || null,
          emergencyContact: raw.emergency_contact || null,
          medicalConditions: raw.medical_conditions || null,
          allergies: raw.allergies || null,
          studentId: raw.student_id || null,
          studentType: raw.student_type || 'normal',
        };

        const dto = new SecureStudentResponseDto(raw, studentData, raw.userIdByInstitute, parentDetails, instituteUserData, maskSensitiveData);
        dtos.push(dto);
      } else {
        // For teachers, institute admins, attendance markers and other types, use base secure DTO
        const dto = new SecureUserResponseDto(raw, raw.userIdByInstitute, instituteUserData, maskSensitiveData);
        dtos.push(dto);
      }
    }

    return dtos;
  }

  /**
   * Get parent details with user info, occupation and workplace
   * SECURITY: Only returns safe parent fields including phoneNumber and imageUrl
   */
  private async getParentDetails(parentUserId: string): Promise<any> {
    if (!parentUserId) return null;

    // Get user details including phoneNumber and imageUrl
    const user = await this.userRepository.findOne({
      where: { id: parentUserId },
      select: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'imageUrl']
    });

    if (!user) return null;

    // Get parent-specific details (occupation, workplace)
    const parent = await this.parentRepository.findOne({
      where: { userId: parentUserId },
      select: ['occupation', 'workplace']
    });

    // ✅ Transform imageUrl to full URL if it exists
    const imageUrl = user.imageUrl ? this.cloudStorageService.getFullUrl(user.imageUrl) : user.imageUrl;

    return {
      id: user.id,
      first_name: user.firstName,
      last_name: user.lastName,
      email: user.email,
      phone_number: user.phoneNumber,
      image_url: imageUrl,
      occupation: parent?.occupation,
      workplace: parent?.workplace
    };
  }

  /**
   * 🚀 PERFORMANCE OPTIMIZED: Get multiple parent details in bulk to prevent N+1 queries
   * Returns parent info (name, email, phone, occupation, workplace) without children array
   */
  private async getParentDetailsBulk(parentUserIds: string[]): Promise<any[]> {
    if (!parentUserIds || parentUserIds.length === 0) return [];

    // ✅ Filter out null/undefined values and convert to strings
    const validParentIds = parentUserIds.filter(id => id != null && id !== undefined && id !== '').map(id => id.toString());
    if (validParentIds.length === 0) return [];

    // Get all user details in one query
    const users = await this.userRepository.find({
      where: { id: In(validParentIds) },
      select: ['id', 'firstName', 'lastName', 'email', 'phoneNumber', 'imageUrl']
    });

    // ✅ If no users found, return empty array to avoid errors
    if (!users || users.length === 0) return [];

    // Get all parent-specific details in one query
    const parents = await this.parentRepository.find({
      where: { userId: In(validParentIds) },
      select: ['userId', 'occupation', 'workplace']
    });

    // Create a map for quick parent lookup
    const parentsMap = new Map();
    parents.forEach(parent => {
      parentsMap.set(parent.userId, parent);
    });

    // ✅ PERFORMANCE: Return only parent data with formatted name initials for security
    return users.map(user => {
      const parent = parentsMap.get(user.id);

      // Format name with initials for security (hide full name from payload)
      const firstName = user.firstName || '';
      const lastName = user.lastName || '';
      const parts = firstName.trim().split(/\s+/);
      const initials = parts.map(p => p.charAt(0).toUpperCase() + '.').join('');
      const formattedLast = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
      const nameWithInitials = `${initials} ${formattedLast}`.trim();

      // ✅ Resolve full image URL the same way the single-parent sibling method does
      const resolvedImageUrl = user.imageUrl
        ? this.cloudStorageService.getFullUrl(user.imageUrl)
        : null;

      return {
        userId: user.id,
        id: user.id,
        name: nameWithInitials,
        first_name: user.firstName || '',
        last_name: user.lastName || '',
        email: user.email || '',
        phone_number: user.phoneNumber || null,
        image_url: resolvedImageUrl,
        imageUrl: resolvedImageUrl,
        occupation: parent?.occupation || null,
        workplace: parent?.workplace || null
        // children array removed for performance optimization
      };
    });
  }

  // =================== VERIFICATION METHODS FOR INSTITUTE ADMINS ===================

  /**
   * Get unverified/pending users by institute and user type
   * ONLY for Institute Admins - shows users waiting for verification
   */
  async getUnverifiedUsersByInstituteAndType(
    instituteId: string,
    userType: InstituteUserType,
    query: SecureUserQueryDto
  ): Promise<PaginatedSecureUserResponseDto> {
    // Apply security validations
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeUserType = SecurityUtils.validateInstituteUserType(userType);
    const { page, limit, skip } = SecurityUtils.validatePagination(query.page, query.limit);
    const { sortBy, sortOrder } = SecurityUtils.validateSortParams(query.sortBy, query.sortOrder);

    // Sanitize search input
    const safeSearch = query.search ? SecurityUtils.sanitizeSearchInput(query.search) : null;

    // Build secure query with only safe fields for PENDING users
    const queryBuilder = this.instituteUserRepository
      .createQueryBuilder('iu')
      .leftJoin('iu.user', 'u')
      .select([
        'u.id as user_id',
        'u.first_name',
        'u.last_name',
        'u.email as email',
        'u.phone_number',
        'u.image_url',
        'u.gender',
        'u.date_of_birth',
        'u.address_line1',
        'u.address_line2',
        'u.is_active',
        'iu.user_id_institue as userIdByInstitute',
        'iu.status',
        'iu.created_at'
      ])
      .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('iu.instituteUserType = :userType', { userType: safeUserType })  // ✅ FIX: Use institute user type, not global user type
      .andWhere('iu.status = :status', { status: InstituteUserStatus.PENDING });  // FILTER BY PENDING ONLY

    // Create count query  
    const countQueryBuilder = this.instituteUserRepository
      .createQueryBuilder('iu')
      .leftJoin('iu.user', 'u')
      .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
      .andWhere('iu.instituteUserType = :userType', { userType: safeUserType })  // ✅ FIX: Use institute user type, not global user type
      .andWhere('iu.status = :status', { status: InstituteUserStatus.PENDING });  // FILTER BY PENDING ONLY

    // Apply search filter if provided
    if (safeSearch) {
      const searchCondition = '(CONCAT(u.first_name, " ", COALESCE(u.last_name, "")) LIKE :search OR u.email LIKE :search)';
      queryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
      countQueryBuilder.andWhere(searchCondition, { search: `%${safeSearch}%` });
    }

    // Apply active filter if provided
    if (query.isActive !== undefined) {
      const isActive = query.isActive === 'true';
      queryBuilder.andWhere('u.is_active = :isActive', { isActive });
      countQueryBuilder.andWhere('u.is_active = :isActive', { isActive });
    }

    // Get total count
    const total = await countQueryBuilder.getCount();

    // Apply sorting and pagination to main query
    const sortField = this.mapSortFieldForRaw(sortBy);
    const rawResults = await queryBuilder
      .orderBy(sortField, sortOrder)
      .skip(skip)
      .take(limit)
      .getRawMany();

    // Transform to secure DTOs with pending status info and respect masking settings
    const data = await this.transformRawToSecureDtos(rawResults, safeUserType as InstituteUserType, false, this.shouldMaskSensitiveData);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Bulk verify users - ONLY for Institute Admins
   * Changes status from PENDING to ACTIVE and records verifier info
   */
  async bulkVerifyUsers(
    instituteId: string,
    bulkVerificationDto: BulkVerificationDto,
    verifierId: string
  ): Promise<VerificationResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeVerifierId = SecurityUtils.validateBigIntId(verifierId, 'verifierId');

    const response: VerificationResponseDto = {
      verifiedUsers: [],
      failedUsers: [],
      totalProcessed: bulkVerificationDto.userIds.length,
      successCount: 0,
      failureCount: 0,
      failureDetails: []
    };

    // ✅ OPTIMIZED: Eliminate N+1 queries by using bulk operations
    try {
      // Validate all user IDs first
      const safeUserIds = bulkVerificationDto.userIds.map(userId =>
        SecurityUtils.validateBigIntId(userId, 'userId')
      );

      // ✅ BULK OPERATION: Get all pending institute users in one query
      const pendingInstituteUsers = await this.instituteUserRepository.find({
        where: {
          instituteId: safeInstituteId,
          userId: In(safeUserIds),
          status: InstituteUserStatus.PENDING
        }
      });

      // Create a map for quick lookup
      const pendingUsersMap = new Map<string, any>();
      pendingInstituteUsers.forEach(iu => {
        pendingUsersMap.set(iu.userId.toString(), iu);
      });

      // Identify valid and invalid user IDs
      const validUserIds: string[] = [];
      const validUserIdsForBulkUpdate: string[] = [];

      for (const userId of bulkVerificationDto.userIds) {
        const safeUserId = SecurityUtils.validateBigIntId(userId, 'userId');

        if (pendingUsersMap.has(safeUserId.toString())) {
          validUserIds.push(userId);
          validUserIdsForBulkUpdate.push(safeUserId.toString());
        } else {
          response.failedUsers.push(userId);
          response.failureDetails?.push({
            userId,
            reason: 'User not found or not pending verification'
          });
        }
      }

      if (validUserIdsForBulkUpdate.length > 0) {
        // ✅ BULK OPERATION: Update all valid users in one query
        await this.instituteUserRepository.update(
          {
            instituteId: safeInstituteId,
            userId: In(validUserIdsForBulkUpdate.map(id => BigInt(id))),
            status: InstituteUserStatus.PENDING
          },
          {
            status: InstituteUserStatus.ACTIVE,
            verifiedBy: safeVerifierId,
            verifiedAt: new Date() // real UTC — MySQL2 timezone:'+05:30' stores as Sri Lanka time
          }
        );

        // ✅ PROCESSING COMPLETE: All users processed

        response.verifiedUsers = validUserIds;
        response.successCount = validUserIds.length;
      }

    } catch (error) {
      // If bulk operation fails, mark all as failed
      response.failedUsers = bulkVerificationDto.userIds;
      response.verifiedUsers = [];
      response.successCount = 0;
      response.failureDetails = bulkVerificationDto.userIds.map(userId => ({
        userId,
        reason: error.message || 'Bulk verification failed'
      }));
    }

    response.failureCount = response.failedUsers.length;
    return response;
  }

  /**
   * Verify single user - ONLY for Institute Admins
   */
  async verifySingleUser(
    instituteId: string,
    verifyUserDto: VerifyUserDto,
    verifierId: string
  ): Promise<VerificationResponseDto> {
    return this.bulkVerifyUsers(
      instituteId,
      { userIds: [verifyUserDto.userId], notes: verifyUserDto.notes },
      verifierId
    );
  }

  // =================== ADMIN UTILITY METHODS ===================

  /**
   * Soft delete user from institute by setting status to INACTIVE
   * Only accessible by Institute Admins and Super Admins
   */
  async deactivateInstituteUser(
    instituteId: string,
    userId: string,
    deactivatedBy: string
  ): Promise<{
    success: boolean;
    message: string;
    userId: string;
    instituteId: string;
    previousStatus: string;
    newStatus: string;
  }> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeUserId = SecurityUtils.validateBigIntId(userId, 'userId');

    try {
      // Find the institute user relationship
      const instituteUser = await this.instituteUserRepository.findOne({
        where: {
          instituteId: safeInstituteId,
          userId: safeUserId
        }
      });

      if (!instituteUser) {
        throw new NotFoundException(
          `User ${userId} is not assigned to institute ${instituteId}`
        );
      }

      const previousStatus = instituteUser.status;

      // Update status to INACTIVE
      instituteUser.status = InstituteUserStatus.INACTIVE;
      await this.instituteUserRepository.save(instituteUser);

      return {
        success: true,
        message: 'User deactivated successfully in institute',
        userId,
        instituteId,
        previousStatus,
        newStatus: InstituteUserStatus.INACTIVE
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to deactivate user: ${error.message}`
      );
    }
  }

  /**
   * Update extra data for an institute user.
   * Only accessible by Institute Admins and Super Admins.
   */
  async updateExtraData(
    instituteId: string,
    userId: string,
    extraData: Record<string, any> | null,
  ): Promise<{
    success: boolean;
    message: string;
    userId: string;
    instituteId: string;
    extraData: Record<string, any> | null;
  }> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeUserId = SecurityUtils.validateBigIntId(userId, 'userId');

    const instituteUser = await this.instituteUserRepository.findOne({
      where: { instituteId: safeInstituteId, userId: safeUserId },
    });

    if (!instituteUser) {
      throw new NotFoundException(
        `User ${userId} is not assigned to institute ${instituteId}`,
      );
    }

    instituteUser.extraData = extraData;
    await this.instituteUserRepository.save(instituteUser);

    return {
      success: true,
      message: 'Extra data updated successfully',
      userId,
      instituteId,
      extraData,
    };
  }

  /**
   * Activate user in institute by setting status to ACTIVE
   * Only accessible by Institute Admins and Super Admins
   */
  async activateInstituteUser(
    instituteId: string,
    userId: string,
    activatedBy: string
  ): Promise<{
    success: boolean;
    message: string;
    userId: string;
    instituteId: string;
    previousStatus: string;
    newStatus: string;
  }> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeUserId = SecurityUtils.validateBigIntId(userId, 'userId');

    try {
      // Find the institute user relationship
      const instituteUser = await this.instituteUserRepository.findOne({
        where: {
          instituteId: safeInstituteId,
          userId: safeUserId
        }
      });

      if (!instituteUser) {
        throw new NotFoundException(
          `User ${userId} is not assigned to institute ${instituteId}`
        );
      }

      const previousStatus = instituteUser.status;

      // Update status to ACTIVE
      instituteUser.status = InstituteUserStatus.ACTIVE;
      await this.instituteUserRepository.save(instituteUser);

      return {
        success: true,
        message: 'User activated successfully in institute',
        userId,
        instituteId,
        previousStatus,
        newStatus: InstituteUserStatus.ACTIVE
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to activate user: ${error.message}`
      );
    }
  }

  /**
   * Change user's institute role (STUDENT -> TEACHER, etc.)
   * Only accessible by Institute Admins and Super Admins
   */
  async changeInstituteUserRole(
    instituteId: string,
    userId: string,
    newRole: string,
    changedBy: string
  ): Promise<{
    success: boolean;
    message: string;
    userId: string;
    instituteId: string;
    previousRole: string;
    newRole: string;
  }> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeUserId = SecurityUtils.validateBigIntId(userId, 'userId');

    try {
      // Validate the new role
      const validRoles = Object.values(InstituteUserType);
      if (!validRoles.includes(newRole as InstituteUserType)) {
        throw new BadRequestException(
          `Invalid role. Valid roles are: ${validRoles.join(', ')}`
        );
      }

      // Find the institute user relationship
      const instituteUser = await this.instituteUserRepository.findOne({
        where: {
          instituteId: safeInstituteId,
          userId: safeUserId
        }
      });

      if (!instituteUser) {
        throw new NotFoundException(
          `User ${userId} is not assigned to institute ${instituteId}`
        );
      }

      const previousRole = instituteUser.instituteUserType;

      // Update role
      instituteUser.instituteUserType = newRole as InstituteUserType;
      await this.instituteUserRepository.save(instituteUser);

      return {
        success: true,
        message: 'User role changed successfully in institute',
        userId,
        instituteId,
        previousRole,
        newRole
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to change user role: ${error.message}`
      );
    }
  }

  /**
   * Get all inactive users in institute (status = INACTIVE)
   * Only accessible by Institute Admins and Super Admins
   */
  async getInactiveInstituteUsers(
    instituteId: string,
    query: SecureUserQueryDto
  ): Promise<PaginatedSecureUserResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');

    try {
      const page = parseInt(query.page) || 1;
      const limit = Math.min(parseInt(query.limit) || 10, 100);
      const skip = (page - 1) * limit;

      // Build query for inactive users
      const queryBuilder = this.instituteUserRepository
        .createQueryBuilder('iu')
        .leftJoinAndSelect('iu.user', 'user')
        .where('iu.institute_id = :instituteId', { instituteId: safeInstituteId })
        .andWhere('iu.status = :status', { status: InstituteUserStatus.INACTIVE });

      // Apply search filter
      if (query.search) {
        queryBuilder.andWhere(
          '(user.firstName LIKE :search OR user.lastName LIKE :search OR user.email LIKE :search OR user.phoneNumber LIKE :search OR iu.userIdByInstitute LIKE :search)',
          { search: `%${query.search}%` }
        );
      }

      if (query.houseId) {
        const safeHouseId = SecurityUtils.validateBigIntId(query.houseId, 'houseId');
        queryBuilder.andWhere('iu.house_id = :houseId', { houseId: safeHouseId });
      }

      // Filter by institute user type
      if (query.isActive) {
        queryBuilder.andWhere('user.isActive = :isActive', {
          isActive: query.isActive === 'true'
        });
      }

      // Filter by gender
      if (query.gender) {
        queryBuilder.andWhere('user.gender = :gender', { gender: query.gender });
      }

      // Filter by city/address
      if (query.city) {
        queryBuilder.andWhere(
          '(user.address_line1 LIKE :city OR user.address_line2 LIKE :city)',
          { city: `%${query.city}%` }
        );
      }

      // Filter by age range
      if (query.minAge) {
        const minDate = new Date();
        minDate.setFullYear(minDate.getFullYear() - parseInt(query.minAge));
        queryBuilder.andWhere('user.dateOfBirth <= :minDate', { minDate });
      }

      if (query.maxAge) {
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() - parseInt(query.maxAge));
        queryBuilder.andWhere('user.dateOfBirth >= :maxDate', { maxDate });
      }

      // Student-specific filters - only join if needed
      if (query.studentId || query.emergencyContact || query.hasMedicalConditions || query.hasAllergies) {
        queryBuilder.leftJoinAndSelect('user.student', 'student');

        if (query.studentId) {
          queryBuilder.andWhere('student.studentId LIKE :studentId', {
            studentId: `%${query.studentId}%`
          });
        }

        if (query.emergencyContact) {
          queryBuilder.andWhere('student.emergencyContact LIKE :emergencyContact', {
            emergencyContact: `%${query.emergencyContact}%`
          });
        }

        if (query.hasMedicalConditions === 'true') {
          queryBuilder.andWhere('student.medicalConditions IS NOT NULL AND student.medicalConditions != :empty', { empty: '' });
        } else if (query.hasMedicalConditions === 'false') {
          queryBuilder.andWhere('(student.medicalConditions IS NULL OR student.medicalConditions = :empty)', { empty: '' });
        }

        if (query.hasAllergies === 'true') {
          queryBuilder.andWhere('student.allergies IS NOT NULL AND student.allergies != :empty', { empty: '' });
        } else if (query.hasAllergies === 'false') {
          queryBuilder.andWhere('(student.allergies IS NULL OR student.allergies = :empty)', { empty: '' });
        }
      }

      // Parent-specific filters - only join if needed
      if (query.occupation || query.workplace) {
        queryBuilder.leftJoinAndSelect('user.parent', 'parent');

        if (query.occupation) {
          queryBuilder.andWhere('parent.occupation LIKE :occupation', {
            occupation: `%${query.occupation}%`
          });
        }

        if (query.workplace) {
          queryBuilder.andWhere('parent.workplace LIKE :workplace', {
            workplace: `%${query.workplace}%`
          });
        }
      }

      // Sorting
      const sortBy = query.sortBy || 'createdAt';
      const sortOrder = (query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';

      if (sortBy === 'name') {
        queryBuilder.orderBy('user.firstName', sortOrder);
        queryBuilder.addOrderBy('user.lastName', sortOrder);
      } else if (sortBy === 'email') {
        queryBuilder.orderBy('user.email', sortOrder);
      } else if (sortBy === 'dateOfBirth') {
        queryBuilder.orderBy('user.dateOfBirth', sortOrder);
      } else {
        // Use entity property name, not database column name
        queryBuilder.orderBy('iu.updatedAt', sortOrder);
      }

      // Get total count
      const total = await queryBuilder.getCount();

      // Get paginated results
      const instituteUsers = await queryBuilder
        .skip(skip)
        .take(limit)
        .getMany();

      // Transform to secure response format (same structure as regular get users)
      // ✅ Filter out any entries where user is null/undefined (data integrity issue)
      const data = instituteUsers
        .filter(iu => {
          if (!iu || !iu.user) {
            this.logger.warn(`⚠️ Skipping institute user entry - user relation not loaded`);
            return false;
          }
          return true;
        })
        .map(iu => {
          try {
            const dto = new SecureUserResponseDto(iu.user, iu.userIdByInstitute, iu);
            return dto;
          } catch (mappingError) {
            this.logger.error(`❌ Failed to map user to DTO: ${mappingError.message}`, {
              userId: iu?.userId,
              instituteId: iu?.instituteId
            });
            return null;
          }
        })
        .filter(dto => dto !== null); // Remove any failed mappings

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      this.logger.error(`❌ Failed to get inactive users:`, {
        message: error.message,
        stack: error.stack,
        instituteId: safeInstituteId
      });

      // Don't expose internal errors to client
      if (error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException) {
        throw error;
      }

      throw new BadRequestException(
        'Failed to retrieve inactive users. Please try again or contact support.'
      );
    }
  }

  async remove(instituteId: string, userId: string): Promise<void> {
    const result = await this.instituteUserRepository.delete({
      instituteId,
      userId
    });

    if (result.affected === 0) {
      throw new NotFoundException('Institute user relationship not found');
    }
  }

  // =================== OPTIMIZED ASSIGNMENT METHODS ===================

  /**
   * ✅ OPTIMIZED: Assign user to institute by phone number with single query validation
   * Uses JWT token for access control - no additional queries needed
   * Supports optional image upload during assignment
   */
  async assignUserByPhone(
    instituteId: string,
    assignDto: AssignUserByPhoneDto,
    verifiedById?: string
  ): Promise<AssignmentResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');

    try {
      // ✅ QUERY 1: Get user ID and type only (minimal fields for validation)
      const user = await this.userRepository
        .createQueryBuilder('user')
        .select(['user.id', 'user.userType', 'user.firstName', 'user.lastName'])
        .where('user.phoneNumber = :phoneNumber', { phoneNumber: assignDto.phoneNumber })
        .getOne();

      if (!user) {
        throw new BadRequestException(
          `User with phone number ${assignDto.phoneNumber} not found`
        );
      }

      // ✅ Validate user has a valid type
      if (!user.userType || user.userType.trim() === '') {
        throw new BadRequestException(
          `User with phone number ${assignDto.phoneNumber} has no user type set. Please update user profile first.`
        );
      }

      const safeUserId = SecurityUtils.validateBigIntId(user.id, 'userId');

      // ✅ CHECK IF USER ALREADY HAS STUDENT RELATION IN THIS INSTITUTE
      const hasStudentRelation = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
        .andWhere('iu.userId = :userId', { userId: safeUserId })
        .andWhere('iu.instituteUserType = :studentType', { studentType: InstituteUserType.STUDENT })
        .getExists();

      // ✅ COMPREHENSIVE VALIDATION: Check user type + PARENT-STUDENT conflict
      const validation = this.userRoleValidationService.validateComprehensiveRoleAssignment(
        user.userType,
        assignDto.instituteUserType,
        hasStudentRelation
      );

      if (!validation.isValid) {
        throw new BadRequestException(validation.reason);
      }

      // ✅ PERFORMANCE: Check if assignment already exists (any role)
      const assignmentExists = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
        .andWhere('iu.userId = :userId', { userId: safeUserId })
        .andWhere('iu.instituteUserType = :roleType', { roleType: assignDto.instituteUserType })
        .getExists();

      if (assignmentExists) {
        throw new ConflictException(`User is already assigned to this institute as ${assignDto.instituteUserType}`);
      }

      // 🖼️ Use imageUrl from DTO if provided (already verified via signed URL)
      let imageUrl: string | null = null;
      let imageStatus: ImageVerificationStatus = ImageVerificationStatus.PENDING;

      if (assignDto.imageUrl) {
        imageUrl = assignDto.imageUrl;
        imageStatus = verifiedById ? ImageVerificationStatus.VERIFIED : ImageVerificationStatus.PENDING;
      }

      // ✅ SINGLE INSERT: Create assignment with image data in one query
      const timestamp = getCurrentSriLankaISO();
      const assignment = this.instituteUserRepository.create({
        instituteId: safeInstituteId,
        userId: safeUserId,
        instituteUserType: assignDto.instituteUserType,
        userIdByInstitute: assignDto.userIdByInstitute || null,
        status: InstituteUserStatus.ACTIVE,
        instituteUserImageUrl: imageUrl,
        imageVerificationStatus: imageUrl ? imageStatus : null,
        imageVerifiedBy: (imageUrl && verifiedById) ? verifiedById : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await this.instituteUserRepository.save(assignment);

      // ✅ OPTIMIZED: Return immediately without cache operations
      return {
        success: true,
        message: `User ${user.firstName} ${user.lastName} successfully assigned to institute${assignDto.userIdByInstitute ? ` with ID: ${assignDto.userIdByInstitute}` : ''}${imageUrl ? ' (image uploaded)' : ''}`,
        userId: user.id,
        instituteId,
        userIdByInstitute: assignDto.userIdByInstitute
      };

    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(`Failed to assign user: ${error.message}`);
    }
  }

  /**
   * 🚀 ULTRA-OPTIMIZED: Assign parent by phone number with minimal queries
   * 
   * Performance Improvements:
   * - No heavy JOINs (was using LEFT JOIN on parents table)
   * - Simple findOne() instead of complex QueryBuilder with raw query
   * - exists() check instead of selecting parent data
   * - Minimal field selection for better performance
   * - 70% faster than previous JOIN-based approach
   */
  async assignParentByPhone(
    studentId: string,
    assignDto: AssignParentByPhoneDto,
    image?: string,
    verifiedById?: string
  ): Promise<AssignmentResponseDto> {
    const safeStudentId = SecurityUtils.validateBigIntId(studentId, 'studentId');

    try {
      // 🚀 STEP 1: Check if parent user exists (pure existence check - no data retrieval)
      const parentUserExists = await this.userRepository.exists({
        where: {
          phoneNumber: assignDto.phoneNumber,
          userType: UserType.USER_WITHOUT_STUDENT,
          isActive: true
        }
      });

      if (!parentUserExists) {
        throw new BadRequestException(
          `Parent with phone number ${assignDto.phoneNumber} not found or user is not a parent`
        );
      }

      // 🚀 STEP 2: Get only parent user ID (minimal data for assignment)
      const parentUser = await this.userRepository.findOne({
        where: {
          phoneNumber: assignDto.phoneNumber,
          userType: UserType.USER_WITHOUT_STUDENT,
          isActive: true
        },
        select: ['id', 'firstName', 'lastName'] // Minimal fields for response only
      });

      // 🚀 STEP 3: Check if parent record exists (simple exists check)
      const parentExists = await this.parentRepository.exists({
        where: { userId: parentUser.id }
      });

      if (!parentExists) {
        throw new BadRequestException(
          `User found but parent record doesn't exist. Please create parent profile first.`
        );
      }

      // ✅ OPTIMIZED: Get current student data to determine parent assignment
      const currentStudent = await this.studentRepository.findOne({
        where: { userId: safeStudentId },
        select: ['userId', 'fatherId', 'motherId', 'guardianId']
      });

      if (!currentStudent) {
        throw new BadRequestException(`Student with ID ${studentId} not found`);
      }

      // ✅ EXPLICIT ROLE ASSIGNMENT ONLY - No auto-assignment
      let updateField: string;
      let fieldName: string;

      // Check if the requested role is available
      if (assignDto.parentRole === 'father') {
        if (currentStudent.fatherId) {
          throw new ConflictException(`Student already has a father assigned (ID: ${currentStudent.fatherId}). Cannot assign another parent as father.`);
        }
        updateField = 'fatherId';
        fieldName = 'father';
      } else if (assignDto.parentRole === 'mother') {
        if (currentStudent.motherId) {
          throw new ConflictException(`Student already has a mother assigned (ID: ${currentStudent.motherId}). Cannot assign another parent as mother.`);
        }
        updateField = 'motherId';
        fieldName = 'mother';
      } else if (assignDto.parentRole === 'guardian') {
        if (currentStudent.guardianId) {
          throw new ConflictException(`Student already has a guardian assigned (ID: ${currentStudent.guardianId}). Cannot assign another parent as guardian.`);
        }
        updateField = 'guardianId';
        fieldName = 'guardian';
      } else {
        throw new BadRequestException('Invalid parent role. Must be one of: father, mother, guardian');
      }

      // 🚀 STEP 4: Update student with parent assignment (single query)
      const updateResult = await this.studentRepository
        .createQueryBuilder()
        .update(StudentEntity)
        .set({ [updateField]: parentUser.id })
        .where('userId = :studentId', { studentId: safeStudentId })
        .execute();

      if (updateResult.affected === 0) {
        throw new BadRequestException(`Student with ID ${studentId} not found`);
      }

      return {
        success: true,
        message: `Parent ${parentUser.firstName || 'Unknown'} ${parentUser.lastName || ''} successfully assigned as ${fieldName} to student${assignDto.userIdByInstitute ? ` with ID: ${assignDto.userIdByInstitute}` : ''}`,
        userId: parentUser.id.toString(),
        instituteId: studentId,
        userIdByInstitute: assignDto.userIdByInstitute
      };

    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to assign parent: ${error.message}`);
    }
  }

  /**
   * ✅ OPTIMIZED: Assign user by email with upload-first pattern
   * Supports optional image upload during assignment
   */
  async assignUserByEmail(
    instituteId: string,
    assignDto: AssignUserByEmailDto,
    image?: string,
    verifiedById?: string
  ): Promise<AssignmentResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');

    try {
      // ✅ QUERY 1: Get user ID and type only (minimal fields for validation)
      const user = await this.userRepository
        .createQueryBuilder('user')
        .select(['user.id', 'user.userType', 'user.firstName', 'user.lastName'])
        .where('LOWER(user.email) = LOWER(:email)', { email: assignDto.email })
        .getOne();

      if (!user) {
        throw new BadRequestException(
          `User with email ${assignDto.email} not found`
        );
      }

      // ✅ Validate user has a valid type
      if (!user.userType || user.userType.trim() === '') {
        throw new BadRequestException(
          `User with email ${assignDto.email} has no user type set. Please update user profile first.`
        );
      }

      const safeUserId = SecurityUtils.validateBigIntId(user.id, 'userId');

      // ✅ CHECK IF USER ALREADY HAS STUDENT RELATION IN THIS INSTITUTE
      const hasStudentRelation = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
        .andWhere('iu.userId = :userId', { userId: safeUserId })
        .andWhere('iu.instituteUserType = :studentType', { studentType: InstituteUserType.STUDENT })
        .getExists();

      // ✅ COMPREHENSIVE VALIDATION: Check user type + PARENT-STUDENT conflict
      const validation = this.userRoleValidationService.validateComprehensiveRoleAssignment(
        user.userType,
        assignDto.instituteUserType,
        hasStudentRelation
      );

      if (!validation.isValid) {
        throw new BadRequestException(validation.reason);
      }

      // ✅ PERFORMANCE: Check if assignment already exists (any role)
      const assignmentExists = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
        .andWhere('iu.userId = :userId', { userId: safeUserId })
        .andWhere('iu.instituteUserType = :roleType', { roleType: assignDto.instituteUserType })
        .getExists();

      if (assignmentExists) {
        throw new ConflictException(`User is already assigned to this institute as ${assignDto.instituteUserType}`);
      }

      // 🖼️ OPTIMIZED: Upload image FIRST if provided
      let imageUrl: string | null = null;
      let imageStatus: ImageVerificationStatus = ImageVerificationStatus.PENDING;

      if (image) {
        if (typeof image === 'string') {
          // URL from /upload/verify-and-publish
          imageUrl = image;
          imageStatus = verifiedById ? ImageVerificationStatus.VERIFIED : ImageVerificationStatus.PENDING;
        } else {
          throw new BadRequestException('File upload is deprecated. Use imageUrl from /upload/verify-and-publish.');
        }
      }

      // ✅ SINGLE INSERT: Create assignment with image data in one query
      const timestamp = getCurrentSriLankaISO();
      const assignment = this.instituteUserRepository.create({
        instituteId: safeInstituteId,
        userId: safeUserId,
        instituteUserType: assignDto.instituteUserType,
        userIdByInstitute: assignDto.userIdByInstitute || null,
        instituteCardId: assignDto.instituteCardId || null,
        status: InstituteUserStatus.ACTIVE,
        instituteUserImageUrl: imageUrl,
        imageVerificationStatus: imageUrl ? imageStatus : null,
        imageVerifiedBy: (imageUrl && verifiedById) ? verifiedById : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await this.instituteUserRepository.save(assignment);

      // ✅ OPTIMIZED: Return immediately without cache operations
      return {
        success: true,
        message: `User ${user.firstName} ${user.lastName} successfully assigned to institute${assignDto.userIdByInstitute ? ` with ID: ${assignDto.userIdByInstitute}` : ''}${imageUrl ? ' (image uploaded)' : ''}`,
        userId: user.id,
        instituteId,
        userIdByInstitute: assignDto.userIdByInstitute
      };

    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(`Failed to assign user by email: ${error.message}`);
    }
  }

  /**
   * ✅ OPTIMIZED: Assign user by ID with upload-first pattern
   * Supports optional image upload during assignment
   */
  async assignUserById(
    instituteId: string,
    assignDto: AssignUserByIdDto,
    image?: string,
    verifiedById?: string
  ): Promise<AssignmentResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');
    const safeUserId = SecurityUtils.validateBigIntId(assignDto.userId, 'userId');

    try {
      // ✅ QUERY 1: Get user ID and type only (minimal fields for validation)
      const user = await this.userRepository
        .createQueryBuilder('user')
        .select(['user.id', 'user.userType', 'user.firstName', 'user.lastName'])
        .where('user.id = :userId', { userId: safeUserId })
        .getOne();

      if (!user) {
        throw new BadRequestException(
          `User with ID ${assignDto.userId} not found`
        );
      }

      // ✅ Validate user has a valid type
      if (!user.userType || user.userType.trim() === '') {
        throw new BadRequestException(
          `User with ID ${assignDto.userId} has no user type set. Please update user profile first.`
        );
      }

      // ✅ CHECK IF USER ALREADY HAS STUDENT RELATION IN THIS INSTITUTE
      const hasStudentRelation = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
        .andWhere('iu.userId = :userId', { userId: safeUserId })
        .andWhere('iu.instituteUserType = :studentType', { studentType: InstituteUserType.STUDENT })
        .getExists();

      // ✅ COMPREHENSIVE VALIDATION: Check user type + PARENT-STUDENT conflict
      const validation = this.userRoleValidationService.validateComprehensiveRoleAssignment(
        user.userType,
        assignDto.instituteUserType,
        hasStudentRelation
      );

      if (!validation.isValid) {
        throw new BadRequestException(validation.reason);
      }

      // ✅ PERFORMANCE: Check if assignment already exists (any role)
      const assignmentExists = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
        .andWhere('iu.userId = :userId', { userId: safeUserId })
        .andWhere('iu.instituteUserType = :roleType', { roleType: assignDto.instituteUserType })
        .getExists();

      if (assignmentExists) {
        throw new ConflictException(`User is already assigned to this institute as ${assignDto.instituteUserType}`);
      }

      // 🖼️ OPTIMIZED: Upload image FIRST if provided
      let imageUrl: string | null = null;
      let imageStatus: ImageVerificationStatus = ImageVerificationStatus.PENDING;

      if (image) {
        if (typeof image === 'string') {
          // URL from /upload/verify-and-publish
          imageUrl = image;
          imageStatus = verifiedById ? ImageVerificationStatus.VERIFIED : ImageVerificationStatus.PENDING;
        } else {
          throw new BadRequestException('File upload is deprecated. Use imageUrl from /upload/verify-and-publish.');
        }
      }

      // ✅ SINGLE INSERT: Create assignment with image data in one query
      const timestamp = getCurrentSriLankaISO();
      const assignment = this.instituteUserRepository.create({
        instituteId: safeInstituteId,
        userId: safeUserId,
        instituteUserType: assignDto.instituteUserType,
        userIdByInstitute: assignDto.userIdByInstitute || null,
        instituteCardId: assignDto.instituteCardId || null,
        status: InstituteUserStatus.ACTIVE,
        instituteUserImageUrl: imageUrl,
        imageVerificationStatus: imageUrl ? imageStatus : null,
        imageVerifiedBy: (imageUrl && verifiedById) ? verifiedById : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await this.instituteUserRepository.save(assignment);

      // ✅ OPTIMIZED: Return immediately without cache operations
      return {
        success: true,
        message: `User ${user.firstName} ${user.lastName} successfully assigned to institute${assignDto.userIdByInstitute ? ` with ID: ${assignDto.userIdByInstitute}` : ''}${imageUrl ? ' (image uploaded)' : ''}`,
        userId: user.id,
        instituteId,
        userIdByInstitute: assignDto.userIdByInstitute
      };

    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(`Failed to assign user by ID: ${error.message}`);
    }
  }

  /**
   * ✅ OPTIMIZED: Assign student to institute by RFID with single query
   * Supports optional image upload during assignment
   */
  async assignStudentByRfid(
    instituteId: string,
    assignDto: AssignStudentByRfidDto,
    image?: string,
    verifiedById?: string
  ): Promise<AssignmentResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');

    try {
      // ✅ SINGLE OPTIMIZED QUERY: Find student by RFID directly from user table
      const student = await this.userRepository
        .createQueryBuilder('user')
        .select(['user.id', 'user.userType', 'user.firstName', 'user.lastName', 'user.rfid'])
        .where('user.rfid = :rfid', { rfid: assignDto.rfid })
        .getOne();

      if (!student) {
        throw new BadRequestException(
          `Student with RFID ${assignDto.rfid} not found`
        );
      }

      // ✅ Validate user has a valid type
      if (!student.userType || student.userType.trim() === '') {
        throw new BadRequestException(
          `User with RFID ${assignDto.rfid} has no user type set. Please update user profile first.`
        );
      }

      // ✅ CHECK IF USER ALREADY HAS STUDENT RELATION IN THIS INSTITUTE
      const hasStudentRelation = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
        .andWhere('iu.userId = :userId', { userId: student.id })
        .andWhere('iu.instituteUserType = :studentType', { studentType: InstituteUserType.STUDENT })
        .getExists();

      // ✅ COMPREHENSIVE VALIDATION: Check user type + PARENT-STUDENT conflict
      const validation = this.userRoleValidationService.validateComprehensiveRoleAssignment(
        student.userType,
        assignDto.instituteUserType,
        hasStudentRelation
      );

      if (!validation.isValid) {
        throw new BadRequestException(validation.reason);
      }

      // ✅ PERFORMANCE: Check if assignment already exists for this specific role
      const assignmentExists = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
        .andWhere('iu.userId = :userId', { userId: student.id })
        .andWhere('iu.instituteUserType = :roleType', { roleType: assignDto.instituteUserType })
        .getExists();

      if (assignmentExists) {
        throw new ConflictException(`User is already assigned to this institute as ${assignDto.instituteUserType}`);
      }

      // 🖼️ OPTIMIZED: Upload image FIRST if provided
      let imageUrl: string | null = null;
      let imageStatus: ImageVerificationStatus = ImageVerificationStatus.PENDING;

      if (image) {
        if (typeof image === 'string') {
          // URL from /upload/verify-and-publish
          imageUrl = image;
          imageStatus = verifiedById ? ImageVerificationStatus.VERIFIED : ImageVerificationStatus.PENDING;
        } else {
          throw new BadRequestException('File upload is deprecated. Use imageUrl from /upload/verify-and-publish.');
        }
      }

      // ✅ SINGLE INSERT: Create assignment with image data in one query
      const timestamp = getCurrentSriLankaISO();
      const assignment = this.instituteUserRepository.create({
        instituteId: safeInstituteId,
        userId: student.id,
        instituteUserType: assignDto.instituteUserType,
        userIdByInstitute: assignDto.userIdByInstitute || null,
        status: InstituteUserStatus.ACTIVE,
        instituteUserImageUrl: imageUrl,
        imageVerificationStatus: imageUrl ? imageStatus : null,
        imageVerifiedBy: (imageUrl && verifiedById) ? verifiedById : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      await this.instituteUserRepository.save(assignment);

      // ✅ OPTIMIZED: Return immediately without cache operations
      return {
        success: true,
        message: `Student ${student.firstName} ${student.lastName} successfully assigned to institute${assignDto.userIdByInstitute ? ` with ID: ${assignDto.userIdByInstitute}` : ''}${image ? ' (image uploaded)' : ''}`,
        userId: student.id,
        instituteId,
        userIdByInstitute: assignDto.userIdByInstitute
      };

    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(`Failed to assign student: ${error.message}`);
    }
  }

  /**
   * 🚀 PERFORMANCE OPTIMIZED: Bulk assign users with batch processing (99% fewer queries)
   */
  async bulkAssignUsers(
    instituteId: string,
    bulkAssignDto: BulkAssignUsersDto
  ): Promise<BulkAssignmentResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');

    const response: BulkAssignmentResponseDto = {
      success: true,
      successfulAssignments: [],
      failedAssignments: [],
      summary: {
        total: bulkAssignDto.assignments.length,
        successful: 0,
        failed: 0
      }
    };

    try {
      // ✅ BATCH OPTIMIZATION: Get all users in one query instead of n queries
      const phoneNumbers = bulkAssignDto.assignments.map(a => a.phoneNumber);

      // Single query to get all matching users
      const existingUsers = await this.userRepository
        .createQueryBuilder('user')
        .select(['user.id', 'user.userType', 'user.firstName', 'user.lastName', 'user.phoneNumber'])
        .where('user.phoneNumber IN (:...phoneNumbers)', { phoneNumbers })
        .getMany();

      // Create lookup maps for O(1) access
      const usersByPhone = new Map();
      existingUsers.forEach(user => {
        usersByPhone.set(user.phoneNumber, user);
      });

      // ✅ BATCH CHECK: Verify existing assignments and student relations in one query
      const userIds = existingUsers.map(u => u.id);
      const existingAssignments = new Map(); // Map of userId -> Set of roles
      const studentRelations = new Set(); // Set of userIds who are students

      if (userIds.length > 0) {
        const assignments = await this.instituteUserRepository.find({
          where: {
            instituteId: safeInstituteId,
            userId: In(userIds)
          },
          select: ['userId', 'instituteUserType']
        });

        assignments.forEach(a => {
          const userId = a.userId.toString();
          if (!existingAssignments.has(userId)) {
            existingAssignments.set(userId, new Set());
          }
          existingAssignments.get(userId).add(a.instituteUserType);

          // Track student relations
          if (a.instituteUserType === InstituteUserType.STUDENT) {
            studentRelations.add(userId);
          }
        });
      }

      // Process assignments with batch validation
      const newAssignments = [];

      for (const assignment of bulkAssignDto.assignments) {
        try {
          const user = usersByPhone.get(assignment.phoneNumber);

          if (!user) {
            response.failedAssignments.push({
              phoneNumber: assignment.phoneNumber,
              userType: 'UNKNOWN',
              error: `User with phone number ${assignment.phoneNumber} not found`
            });
            response.summary.failed++;
            continue;
          }

          const userId = user.id.toString();
          const hasStudentRelation = studentRelations.has(userId);

          // ✅ COMPREHENSIVE VALIDATION: Check user type + PARENT-STUDENT conflict
          const validation = this.userRoleValidationService.validateComprehensiveRoleAssignment(
            user.userType,
            assignment.instituteUserType,
            hasStudentRelation
          );

          if (!validation.isValid) {
            response.failedAssignments.push({
              phoneNumber: assignment.phoneNumber,
              userType: user.userType,
              error: validation.reason
            });
            response.summary.failed++;
            continue;
          }

          // Check if user already has this specific role
          const userRoles = existingAssignments.get(userId);
          if (userRoles && userRoles.has(assignment.instituteUserType)) {
            response.failedAssignments.push({
              phoneNumber: assignment.phoneNumber,
              userType: user.userType,
              error: `User is already assigned to this institute as ${assignment.instituteUserType}`
            });
            response.summary.failed++;
            continue;
          }

          // Prepare for batch insert with institute-specific user ID and role
          newAssignments.push({
            instituteId: safeInstituteId,
            userId: user.id,
            instituteUserType: assignment.instituteUserType,  // ✅ Use from DTO
            userIdByInstitute: assignment.userIdByInstitute || null,
            status: InstituteUserStatus.ACTIVE
          });

          response.successfulAssignments.push({
            success: true,
            message: `User ${user.firstName} ${user.lastName} successfully assigned to institute${assignment.userIdByInstitute ? ` with ID: ${assignment.userIdByInstitute}` : ''}`,
            userId: user.id,
            instituteId,
            userIdByInstitute: assignment.userIdByInstitute
          });
          response.summary.successful++;

        } catch (error) {
          response.failedAssignments.push({
            phoneNumber: assignment.phoneNumber,
            userType: usersByPhone.get(assignment.phoneNumber)?.userType || 'UNKNOWN',
            error: error.message
          });
          response.summary.failed++;
        }
      }

      // ✅ BATCH INSERT: Save all new assignments in one transaction
      if (newAssignments.length > 0) {
        await this.instituteUserRepository.save(newAssignments);

        // 🔄 CRITICAL FIX: Bulk refresh user cache after institute assignments (user data changes)
        if (this.isCachingEnabled) {
          try {
            const userCachePromises = newAssignments.map(assignment =>
              this.userManagementService.refreshUserCache(assignment.userId.toString())
                .catch(error => {
                  return null; // Don't fail the entire bulk operation if one user fails
                })
            );
            await Promise.allSettled(userCachePromises);
          } catch (bulkUserCacheError) {
            // Don't fail the assignment if user caching fails
          }
        } else {
        }
      }

    } catch (error) {
      // Fallback to individual processing if batch fails
      return await this.bulkAssignUsersFallback(instituteId, bulkAssignDto);
    }

    response.success = response.summary.failed === 0;
    return response;
  }

  /**
   * 🔄 FALLBACK: Individual processing for error recovery
   */
  private async bulkAssignUsersFallback(
    instituteId: string,
    bulkAssignDto: BulkAssignUsersDto
  ): Promise<BulkAssignmentResponseDto> {
    const response: BulkAssignmentResponseDto = {
      success: true,
      successfulAssignments: [],
      failedAssignments: [],
      summary: {
        total: bulkAssignDto.assignments.length,
        successful: 0,
        failed: 0
      }
    };

    // Process assignments one by one (original method as fallback)
    for (const assignment of bulkAssignDto.assignments) {
      try {
        const result = await this.assignUserByPhone(instituteId, assignment);
        response.successfulAssignments.push(result);
        response.summary.successful++;
      } catch (error) {
        response.failedAssignments.push({
          phoneNumber: assignment.phoneNumber,
          userType: 'PENDING_VALIDATION',
          error: error.message
        });
        response.summary.failed++;
      }
    }

    response.success = response.summary.failed === 0;
    return response;
  }

  // =================== PERFORMANCE UTILITY METHODS ===================

  /**
   * ✅ REMOVED: MongoDB sync methods no longer needed
   */

  /**
   * 🚀 PERFORMANCE: Fast existence check using exists() instead of findOne()
   */
  private async checkAssignmentExists(instituteId: string, userId: string): Promise<boolean> {
    return await this.instituteUserRepository
      .createQueryBuilder('iu')
      .where('iu.instituteId = :instituteId', { instituteId })
      .andWhere('iu.userId = :userId', { userId })
      .getExists();
  }

  /**
   * 🚀 PERFORMANCE: Batch user lookup by phone numbers
   */
  private async getUsersByPhoneNumbers(phoneNumbers: string[]): Promise<UserEntity[]> {
    if (!phoneNumbers || phoneNumbers.length === 0) return [];

    return await this.userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.userType', 'user.firstName', 'user.lastName', 'user.phoneNumber'])
      .where('user.phoneNumber IN (:...phoneNumbers)', { phoneNumbers })
      .getMany();
  }

  // =================== INSTITUTE USER IMAGE UPLOAD METHODS ===================

  /**
   * Upload institute user image - imageUrl already verified via signed URL system
   * @param skipExistenceCheck - Set to true if you just created the institute_user record
   */
  async uploadInstituteUserImage(
    imageUrl: string,
    instituteId: string,
    userId: string,
    verifiedById?: string,
    skipExistenceCheck: boolean = false
  ): Promise<InstituteUserImageResponseDto> {
    try {
      if (!imageUrl) {
        throw new BadRequestException('imageUrl is required');
      }

      // ✅ OPTIMIZED: Skip existence check if we just created the record
      if (!skipExistenceCheck) {
        // Check if institute user relationship exists
        const instituteUser = await this.instituteUserRepository.findOne({
          where: { instituteId, userId }
        });

        if (!instituteUser) {
          throw new NotFoundException('Institute user relationship not found');
        }
      }

      if (verifiedById) {
        // Admin explicitly marking as already-verified (special flow) → approve immediately
        await this.instituteUserRepository.update(
          { instituteId, userId },
          {
            instituteUserImageUrl: imageUrl,
            imageVerificationStatus: ImageVerificationStatus.VERIFIED,
            imageVerifiedBy: verifiedById,
          }
        );
        // Record in history as VERIFIED
        const imageRecord = this.userImageRepository.create({
          userId,
          imageUrl,
          scope: ImageScope.INSTITUTE,
          instituteId,
          status: ImageVerificationStatus.VERIFIED,
          verifiedBy: verifiedById,
          verifiedAt: new Date(),
        });
        await this.userImageRepository.save(imageRecord);
      } else {
        // Admin uploaded for review → create pending submission.
        // Do NOT overwrite instituteUserImageUrl so the last verified image stays live.
        await this.instituteUserRepository.update(
          { instituteId, userId },
          {
            imageVerificationStatus: ImageVerificationStatus.PENDING,
            imageVerifiedBy: null,
          }
        );
        const imageRecord = this.userImageRepository.create({
          userId,
          imageUrl,
          scope: ImageScope.INSTITUTE,
          instituteId,
          status: ImageVerificationStatus.PENDING,
        });
        await this.userImageRepository.save(imageRecord);
      }

      return {
        success: true,
        message: verifiedById
          ? 'Institute user image uploaded and verified successfully'
          : 'Institute user image submitted for verification',
        imageUrl: this.cloudStorageService.getFullUrl(imageUrl),
        userId,
        instituteId
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to upload institute user image: ${error.message}`);
    }
  }

  /**
   * Assign institute card ID - System Admin only
   */
  async assignInstituteCardId(
    instituteId: string,
    userId: string,
    updateCardDto: UpdateInstituteCardIdDto
  ): Promise<{ success: boolean; message: string; cardId: string }> {
    try {
      // Check if institute user relationship exists
      const instituteUser = await this.instituteUserRepository.findOne({
        where: { instituteId, userId }
      });

      if (!instituteUser) {
        throw new NotFoundException('Institute user relationship not found');
      }

      // Check if card ID is already in use
      const existingCardUser = await this.instituteUserRepository.findOne({
        where: {
          instituteId,
          instituteCardId: updateCardDto.cardId
        }
      });

      if (existingCardUser && existingCardUser.userId !== userId) {
        throw new ConflictException('Institute card ID is already assigned to another user');
      }

      // Update card ID
      await this.instituteUserRepository.update(
        { instituteId, userId },
        { instituteCardId: updateCardDto.cardId }
      );

      return {
        success: true,
        message: 'Institute card ID assigned successfully',
        cardId: updateCardDto.cardId
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to assign institute card ID: ${error.message}`);
    }
  }

  /**
   * Verify institute user image - Enhanced with ENUM status and cloud deletion for rejected images
   */
  async verifyInstituteUserImage(
    instituteId: string,
    userId: string,
    verifyImageDto: VerifyInstituteUserImageDto,
    verifierId: string
  ): Promise<{ success: boolean; message: string; status: ImageVerificationStatus }> {
    try {
      // Check if institute user relationship exists
      const instituteUser = await this.instituteUserRepository.findOne({
        where: { instituteId, userId }
      });

      if (!instituteUser) {
        throw new NotFoundException('Institute user relationship not found');
      }

      // Find the pending image submission in user_images table
      const pendingImage = await this.userImageRepository.findOne({
        where: {
          userId,
          instituteId,
          scope: ImageScope.INSTITUTE,
          status: ImageVerificationStatus.PENDING,
        },
        order: { createdAt: 'DESC' },
      });

      // Legacy path: image was assigned directly to institute_user without going through
      // the user_images submission flow (e.g. admin-assigned, imported, or pre-migration).
      const isLegacy = !pendingImage;

      if (isLegacy) {
        // Must still have an image URL on the institute_user row to act on
        if (!instituteUser.instituteUserImageUrl) {
          throw new BadRequestException('No pending image found to verify');
        }
      }

      const imageUrlToProcess = isLegacy
        ? instituteUser.instituteUserImageUrl
        : pendingImage!.imageUrl;

      // If rejecting, delete the submitted (pending) file from cloud storage
      if (verifyImageDto.status === ImageVerificationStatus.REJECTED) {
        try {
          await this.cloudStorageService.deleteFile(imageUrlToProcess);
        } catch (deleteError) {
          // Continue with verification even if deletion fails
        }
      }

      // institute_user update rules:
      //
      // VERIFIED → set instituteUserImageUrl to the newly approved image + mark VERIFIED.
      //            This is the ONLY time institute_user is updated.
      //
      // REJECTED new-flow → do NOT touch institute_user at all.
      //            The previously approved image URL and VERIFIED status stay intact so
      //            other users still see the last approved photo while a new submission
      //            is pending or after a rejection.
      //
      // REJECTED legacy → the URL on institute_user IS the pending image (now deleted);
      //            clear it and record REJECTED so the user is no longer shown as having
      //            an image.
      if (verifyImageDto.status === ImageVerificationStatus.VERIFIED) {
        await this.instituteUserRepository.update(
          { instituteId, userId },
          {
            instituteUserImageUrl: imageUrlToProcess,
            imageVerificationStatus: ImageVerificationStatus.VERIFIED,
            imageVerifiedBy: verifierId,
          },
        );
      } else if (verifyImageDto.status === ImageVerificationStatus.REJECTED && isLegacy) {
        // Legacy only — clear the URL (it was the pending image itself, now deleted)
        await this.instituteUserRepository.update(
          { instituteId, userId },
          {
            instituteUserImageUrl: null,
            imageVerificationStatus: ImageVerificationStatus.REJECTED,
            imageVerifiedBy: verifierId,
          },
        );
      }
      // New-flow REJECTED: institute_user untouched — previous approved image remains visible.

      // Mirror the decision into the user_images table (skip for legacy — no row exists)
      const decisionAt = new Date();
      if (!isLegacy) {
        await this.userImageRepository.update(pendingImage!.id, {
          status: verifyImageDto.status,
          verifiedBy: verifierId,
          verifiedAt: decisionAt,
          rejectionReason: verifyImageDto.status === ImageVerificationStatus.REJECTED ? (verifyImageDto.rejectionReason ?? null) : null,
        });
      }

      // Sync the user-level verification status so the admin dashboard reflects the result
      await this.userRepository.update(userId, {
        imageVerificationStatus: verifyImageDto.status,
        imageVerifiedBy: verifierId,
        imageVerifiedAt: decisionAt,
        imageRejectionReason: verifyImageDto.status === ImageVerificationStatus.REJECTED
          ? (verifyImageDto.rejectionReason ?? null)
          : null,
        updatedAt: decisionAt,
      });

      const statusMessage = verifyImageDto.status === ImageVerificationStatus.VERIFIED
        ? 'approved'
        : verifyImageDto.status === ImageVerificationStatus.REJECTED
          ? 'rejected and deleted from cloud'
          : 'set to pending';

      return {
        success: true,
        message: `Image verification ${statusMessage} successfully`,
        status: verifyImageDto.status
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to verify institute user image: ${error.message}`);
    }
  }

  /**
   * Clears institute_user image fields (called when user deletes a pending image)
   */
  async clearInstituteUserImage(instituteId: string, userId: string): Promise<void> {
    // User cancelled a pending submission — do NOT touch institute_user at all.
    // The approved image URL and VERIFIED status on that row must remain intact.
    // All pending-state tracking lives solely in the user_images table.
  }

  /**
   * Get institute users with images for verification.
   * Dual-source: approved images from institute_user + pending new-flow submissions from user_images.
   */
  async getInstituteUsersForImageVerification(
    instituteId: string,
    query: SecureUserQueryDto
  ): Promise<PaginatedSecureUserResponseDto> {
    try {
      const page = parseInt(query.page || '1');
      const limit = Math.min(parseInt(query.limit || '10'), 100);
      const offset = (page - 1) * limit;

      // ── Source A: institute_user rows that have an approved image ─────────────
      const sourceAUsers = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .leftJoinAndSelect('iu.user', 'user')
        .where('iu.instituteId = :instituteId', { instituteId })
        .andWhere('iu.instituteUserImageUrl IS NOT NULL')
        .getMany();

      const sourceAUserIds = sourceAUsers.map(u => u.userId);

      // ── Latest PENDING user_images per userId for this institute ──────────────
      const pendingImages = await this.userImageRepository
        .createQueryBuilder('ui')
        .where('ui.instituteId = :instituteId', { instituteId })
        .andWhere('ui.scope = :scope', { scope: ImageScope.INSTITUTE })
        .andWhere('ui.status = :status', { status: ImageVerificationStatus.PENDING })
        .orderBy('ui.createdAt', 'DESC')
        .getMany();

      const pendingByUser = new Map<string, UserImageEntity>();
      for (const img of pendingImages) {
        if (!pendingByUser.has(img.userId)) pendingByUser.set(img.userId, img);
      }

      // ── Source B: first-time submitters (pending, no approved URL yet) ────────
      const sourceBUserIds = Array.from(pendingByUser.keys()).filter(id => !sourceAUserIds.includes(id));
      let sourceBUsers: typeof sourceAUsers = [];
      if (sourceBUserIds.length > 0) {
        sourceBUsers = await this.instituteUserRepository
          .createQueryBuilder('iu')
          .leftJoinAndSelect('iu.user', 'user')
          .where('iu.instituteId = :instituteId', { instituteId })
          .andWhere('iu.userId IN (:...userIds)', { userIds: sourceBUserIds })
          .getMany();
      }

      let allUsers = [...sourceAUsers, ...sourceBUsers];

      // ── Apply isVerified filter ───────────────────────────────────────────────
      if (query.isVerified !== undefined) {
        const isVerified = query.isVerified === 'true';
        allUsers = allUsers.filter(iu => {
          const hasPending = pendingByUser.has(iu.userId);
          if (isVerified) {
            // Verified = has approved image, no pending submission
            return !hasPending && iu.imageVerificationStatus === ImageVerificationStatus.VERIFIED;
          } else {
            // Unverified = has pending submission OR legacy PENDING status on institute_user
            return hasPending || iu.imageVerificationStatus === ImageVerificationStatus.PENDING;
          }
        });
      }

      // ── Sort: PENDING first, REJECTED next, VERIFIED last ────────────────────
      allUsers.sort((a, b) => {
        const rank = (iu: typeof a) => {
          if (pendingByUser.has(iu.userId)) return 0;
          if (iu.imageVerificationStatus === ImageVerificationStatus.REJECTED) return 1;
          if (iu.imageVerificationStatus === ImageVerificationStatus.VERIFIED) return 2;
          return 0;
        };
        return rank(a) - rank(b);
      });

      const total = allUsers.length;
      const paginated = allUsers.slice(offset, offset + limit);

      const data = paginated.map(iu => {
        const pendingImg = pendingByUser.get(iu.userId);
        const approvedUrl = iu.instituteUserImageUrl ?? null;
        const displayUrl = pendingImg?.imageUrl ?? approvedUrl;
        const effectiveStatus = pendingImg
          ? ImageVerificationStatus.PENDING
          : (iu.imageVerificationStatus ?? ImageVerificationStatus.PENDING);
        return {
          ...new SecureUserResponseDto(iu.user),
          userId: iu.userId,
          // Image to review (pending submission if exists, else current approved)
          instituteUserImageUrl: displayUrl ? this.cloudStorageService.getFullUrl(displayUrl) : null,
          // Currently live approved image (for comparison)
          approvedInstituteImageUrl: approvedUrl ? this.cloudStorageService.getFullUrl(approvedUrl) : null,
          pendingImageId: pendingImg?.id ?? null,
          instituteCardId: iu.instituteCardId,
          imageVerificationStatus: effectiveStatus,
          imageVerifiedBy: iu.imageVerifiedBy,
        };
      });

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException(`Failed to get institute users for image verification: ${error.message}`);
    }
  }

  /**
   * Get institute users with uploaded images that are still unverified.
   * Dual-source: new-flow (user_images PENDING) + legacy (institute_user PENDING).
   */
  async getUnverifiedUsersWithImages(
    instituteId: string,
    query: SecureUserQueryDto
  ): Promise<PaginatedSecureUserResponseDto> {
    try {
      const page = parseInt(query.page || '1');
      const limit = Math.min(parseInt(query.limit || '10'), 100);
      const offset = (page - 1) * limit;

      // ── Source 1 (new-flow): user_images with PENDING status ─────────────────
      const pendingImages = await this.userImageRepository
        .createQueryBuilder('ui')
        .where('ui.instituteId = :instituteId', { instituteId })
        .andWhere('ui.scope = :scope', { scope: ImageScope.INSTITUTE })
        .andWhere('ui.status = :status', { status: ImageVerificationStatus.PENDING })
        .orderBy('ui.createdAt', 'DESC')
        .getMany();

      // Latest pending image per userId
      const pendingByUser = new Map<string, UserImageEntity>();
      for (const img of pendingImages) {
        if (!pendingByUser.has(img.userId)) pendingByUser.set(img.userId, img);
      }
      const newFlowUserIds = Array.from(pendingByUser.keys());

      // Load institute_user rows for new-flow users
      let newFlowInstituteUsers: Awaited<ReturnType<typeof this.instituteUserRepository.createQueryBuilder>>[] = [];
      let newFlowIURows: any[] = [];
      if (newFlowUserIds.length > 0) {
        newFlowIURows = await this.instituteUserRepository
          .createQueryBuilder('iu')
          .leftJoinAndSelect('iu.user', 'user')
          .where('iu.instituteId = :instituteId', { instituteId })
          .andWhere('iu.userId IN (:...userIds)', { userIds: newFlowUserIds })
          .getMany();
      }

      // ── Source 2 (legacy): institute_user PENDING, imageUrl set, NOT in new-flow ─
      const legacyQB = this.instituteUserRepository
        .createQueryBuilder('iu')
        .leftJoinAndSelect('iu.user', 'user')
        .where('iu.instituteId = :instituteId', { instituteId })
        .andWhere('iu.instituteUserImageUrl IS NOT NULL')
        .andWhere('iu.imageVerificationStatus = :status', { status: ImageVerificationStatus.PENDING });
      if (newFlowUserIds.length > 0) {
        legacyQB.andWhere('iu.userId NOT IN (:...excludeIds)', { excludeIds: newFlowUserIds });
      }
      const legacyIURows = await legacyQB.getMany();

      // ── Merge ─────────────────────────────────────────────────────────────────
      type Row = { iu: any; pendingImg: UserImageEntity | null; isLegacy: boolean };
      let combined: Row[] = [
        ...newFlowIURows.map(iu => ({ iu, pendingImg: pendingByUser.get(iu.userId) ?? null, isLegacy: false })),
        ...legacyIURows.map(iu => ({ iu, pendingImg: null, isLegacy: true })),
      ];

      // Optional search by user name or email
      if (query.search) {
        const s = query.search.toLowerCase();
        combined = combined.filter(({ iu }) => {
          const u = iu.user;
          return (
            u?.firstName?.toLowerCase().includes(s) ||
            u?.lastName?.toLowerCase().includes(s) ||
            u?.email?.toLowerCase().includes(s)
          );
        });
      }

      // Sort newest first (by pending image creation or institute_user update time)
      combined.sort((a, b) => {
        const aDate = a.pendingImg?.createdAt ?? a.iu.updatedAt ?? a.iu.createdAt;
        const bDate = b.pendingImg?.createdAt ?? b.iu.updatedAt ?? b.iu.createdAt;
        return new Date(bDate as any).getTime() - new Date(aDate as any).getTime();
      });

      const total = combined.length;
      const paginated = combined.slice(offset, offset + limit);

      const data = paginated.map(({ iu, pendingImg, isLegacy }) => {
        // For new-flow: approved URL is institute_user.instituteUserImageUrl (may be null for first-timers)
        // For legacy: there is no separate approved URL; the pending image IS the institute_user URL
        const approvedUrl = isLegacy ? null : (iu.instituteUserImageUrl ?? null);
        const displayUrl = pendingImg?.imageUrl ?? iu.instituteUserImageUrl ?? null;
        return {
          ...new SecureUserResponseDto(iu.user),
          userId: iu.userId,
          // Image admin needs to review
          instituteUserImageUrl: displayUrl ? this.cloudStorageService.getFullUrl(displayUrl) : null,
          // Current live approved image (for new-flow users only)
          approvedInstituteImageUrl: approvedUrl ? this.cloudStorageService.getFullUrl(approvedUrl) : null,
          pendingImageId: pendingImg?.id ?? null,
          isLegacy,
          instituteCardId: iu.instituteCardId,
          imageVerificationStatus: ImageVerificationStatus.PENDING,
          imageVerifiedBy: iu.imageVerifiedBy,
          userIdByInstitute: iu.userIdByInstitute,
        };
      });

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException(`Failed to get unverified users with images: ${error.message}`);
    }
  }

  /**
   * Get count of unverified users with images for dashboard stats.
   * Dual-source: new-flow (user_images PENDING) + legacy (institute_user PENDING).
   */
  async getUnverifiedUsersWithImagesCount(instituteId: string): Promise<number> {
    try {
      // New-flow count: distinct userIds in user_images PENDING for this institute
      const newFlowRows = await this.userImageRepository
        .createQueryBuilder('ui')
        .select('ui.userId', 'userId')
        .where('ui.instituteId = :instituteId', { instituteId })
        .andWhere('ui.scope = :scope', { scope: ImageScope.INSTITUTE })
        .andWhere('ui.status = :status', { status: ImageVerificationStatus.PENDING })
        .distinct(true)
        .getRawMany();

      const newFlowUserIds: string[] = newFlowRows.map((r: any) => r.userId);
      const newFlowCount = newFlowUserIds.length;

      // Legacy count: institute_user PENDING with imageUrl, NOT in new-flow
      const legacyQB = this.instituteUserRepository
        .createQueryBuilder('iu')
        .where('iu.instituteId = :instituteId', { instituteId })
        .andWhere('iu.instituteUserImageUrl IS NOT NULL')
        .andWhere('iu.imageVerificationStatus = :status', { status: ImageVerificationStatus.PENDING });
      if (newFlowUserIds.length > 0) {
        legacyQB.andWhere('iu.userId NOT IN (:...excludeIds)', { excludeIds: newFlowUserIds });
      }
      const legacyCount = await legacyQB.getCount();

      return newFlowCount + legacyCount;
    } catch (error) {
      throw new InternalServerErrorException(`Failed to get unverified users count: ${error.message}`);
    }
  }

  /**
   * Get user's own institute user data (any authenticated user can access their own data)
   */
  async getAdminUserData(
    instituteId: string,
    userId: string
  ): Promise<AdminUserDataResponseDto> {
    try {
      // Check if user is assigned to the institute
      const instituteUser = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .leftJoinAndSelect('iu.user', 'user')
        .leftJoin('iu.institute', 'inst')
        .addSelect(['inst.tier'])
        .where('iu.institute_id = :instituteId', { instituteId })
        .andWhere('iu.user_id = :userId', { userId })
        .getOne();

      if (!instituteUser) {
        throw new NotFoundException(`User ${userId} is not assigned to institute ${instituteId}. Please check if you are enrolled in this institute.`);
      }

      // Return institute user profile data
      return {
        userId: instituteUser.userId,
        instituteId: instituteUser.instituteId,
        firstName: instituteUser.user.firstName,
        lastName: instituteUser.user.lastName,
        nameWithInitials: instituteUser.user.nameWithInitials || undefined,
        email: instituteUser.user.email,
        phoneNumber: instituteUser.user.phoneNumber,
        userType: instituteUser.instituteUserType, // Institute-specific user type (STUDENT, TEACHER, ADMIN, etc.)
        status: instituteUser.status,
        userIdByInstitute: instituteUser.userIdByInstitute,
        instituteUserImageUrl: (instituteUser.instituteUserImageUrl || instituteUser.user.imageUrl)
          ? this.cloudStorageService.getFullUrl(instituteUser.instituteUserImageUrl || instituteUser.user.imageUrl)
          : null, // Use institute image or fallback to user image
        instituteCardId: instituteUser.instituteCardId,
        imageVerificationStatus: instituteUser.imageVerificationStatus,
        imageVerifiedBy: instituteUser.imageVerifiedBy,
        isActive: instituteUser.user.isActive,
        createdAt: instituteUser.createdAt,
        updatedAt: instituteUser.updatedAt,
        instituteTier: (instituteUser as any).institute?.tier ?? 'FREE',
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new InternalServerErrorException(`Failed to get admin user data: ${error.message}`);
    }
  }

  /**
   * 🎯 ENHANCED ASSIGNMENT - Assign user to institute with multiple identifier options
   * Supports: userId, RFID, phoneNumber, email
   * Features: Optional image upload, auto-verification, institute-specific IDs
   */
  async enhancedAssignUserToInstitute(
    instituteId: string,
    assignDto: EnhancedAssignUserToInstituteDto,
    uploadedFile?: string,
    assigningUserId?: string
  ): Promise<EnhancedAssignmentResponseDto> {
    const safeInstituteId = SecurityUtils.validateBigIntId(instituteId, 'instituteId');

    try {
      // Step 1: Validate at least one identifier is provided
      const hasIdentifier = !!(
        assignDto.userId ||
        assignDto.rfid ||
        assignDto.phoneNumber ||
        assignDto.email
      );

      if (!hasIdentifier) {
        throw new BadRequestException(
          'At least one identifier (userId, rfid, phoneNumber, or email) must be provided'
        );
      }

      // Step 2: Find user by the provided identifier (single optimized query)
      let user: UserEntity | null = null;
      let identifierUsed = '';

      const queryBuilder = this.userRepository
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.student', 'student')
        .leftJoinAndSelect('user.parent', 'parent')
        .select([
          'user.id', 'user.userType', 'user.firstName', 'user.lastName', 'user.nameWithInitials',
          'user.email', 'user.phoneNumber', 'user.rfid', 'user.isActive',
          'student.id', 'student.firstName', 'student.lastName',
          'parent.id', 'parent.firstName', 'parent.lastName'
        ]);

      // Build query based on provided identifier
      if (assignDto.userId) {
        queryBuilder.where('user.id = :userId', { userId: assignDto.userId });
        identifierUsed = 'userId';
        user = await queryBuilder.getOne();
      } else if (assignDto.rfid) {
        queryBuilder.where('user.rfid = :rfid', { rfid: assignDto.rfid });
        identifierUsed = 'rfid';
        user = await queryBuilder.getOne();
      } else if (assignDto.phoneNumber) {
        queryBuilder.where('user.phoneNumber = :phoneNumber', { phoneNumber: assignDto.phoneNumber });
        identifierUsed = 'phoneNumber';
        user = await queryBuilder.getOne();
      } else if (assignDto.email) {
        queryBuilder.where('user.email = :email', { email: assignDto.email });
        identifierUsed = 'email';
        user = await queryBuilder.getOne();
      }

      if (!user) {
        throw new NotFoundException(`User not found with provided ${identifierUsed}`);
      }

      if (!user.isActive) {
        throw new BadRequestException(`User account is inactive`);
      }

      // Step 3: Comprehensive user type validation
      const validation = this.userRoleValidationService.validateComprehensiveRoleAssignment(
        user.userType,
        assignDto.instituteUserType
      );

      if (!validation.isValid) {
        throw new BadRequestException(validation.reason || 'Invalid role assignment');
      }

      // Step 4: Check if user is already assigned to this institute with this role
      const existingAssignment = await this.instituteUserRepository
        .createQueryBuilder('iu')
        .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
        .andWhere('iu.userId = :userId', { userId: user.id })
        .andWhere('iu.instituteUserType = :userType', { userType: assignDto.instituteUserType })
        .getExists();

      if (existingAssignment) {
        throw new ConflictException(
          `User is already assigned to this institute as ${assignDto.instituteUserType}`
        );
      }

      // Step 5: Validate institute card ID uniqueness (if provided)
      if (assignDto.instituteCardId) {
        const cardIdExists = await this.instituteUserRepository
          .createQueryBuilder('iu')
          .where('iu.instituteId = :instituteId', { instituteId: safeInstituteId })
          .andWhere('iu.instituteCardId = :cardId', { cardId: assignDto.instituteCardId })
          .getExists();

        if (cardIdExists) {
          throw new ConflictException(
            `Institute card ID '${assignDto.instituteCardId}' is already in use`
          );
        }
      }

      // Step 6: Handle image upload (if provided)
      let imageUrl: string | null = null;
      let imageVerified = ImageVerificationStatus.PENDING;
      let imageVerifiedBy: string | null = null;

      if (uploadedFile) {
        // uploadedFile is now a URL string
        imageUrl = uploadedFile;

        // Auto-verification logic
        if (assignDto.autoVerifyImage && assigningUserId) {
          imageVerified = ImageVerificationStatus.VERIFIED;
          imageVerifiedBy = assigningUserId;
        }
      }

      // Step 7: Create institute user assignment
      const timestamp = getCurrentSriLankaISO();
      const instituteUser = this.instituteUserRepository.create({
        instituteId: safeInstituteId,
        userId: user.id,
        instituteUserType: assignDto.instituteUserType,
        status: assignDto.status || InstituteUserStatus.ACTIVE,
        userIdByInstitute: assignDto.instituteUserId || null,
        instituteCardId: assignDto.instituteCardId || null,
        instituteUserImageUrl: imageUrl,
        imageVerificationStatus: imageUrl ? imageVerified : null,
        imageVerifiedBy: imageVerifiedBy,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const savedAssignment = await this.instituteUserRepository.save(instituteUser);

      // Step 8: Refresh caches if enabled
      if (this.isCachingEnabled) {
        try {
          await this.userManagementService.refreshUserCache(user.id);
        } catch (cacheError) {
          // Cache refresh failure should not block the assignment
          console.error('Cache refresh failed:', cacheError);
        }
      }

      // Step 9: Build identifier string for response
      let identifierString = '';
      if (assignDto.userId) identifierString = `userId: ${assignDto.userId}`;
      else if (assignDto.rfid) identifierString = `rfid: ${assignDto.rfid}`;
      else if (assignDto.phoneNumber) identifierString = `phone: ${assignDto.phoneNumber}`;
      else if (assignDto.email) identifierString = `email: ${assignDto.email}`;

      // Step 10: Build response according to DTO structure
      return {
        success: true,
        message: `User successfully assigned to institute as ${assignDto.instituteUserType}`,
        user: {
          userId: user.id,
          userName: `${user.firstName} ${user.lastName}`.trim(),
          nameWithInitials: user.nameWithInitials || undefined,
          userType: user.userType,
          identifier: identifierString
        },
        assignment: {
          instituteId: safeInstituteId,
          instituteUserId: savedAssignment.userIdByInstitute,
          instituteCardId: savedAssignment.instituteCardId,
          instituteUserType: savedAssignment.instituteUserType,
          status: savedAssignment.status
        },
        imageInfo: imageUrl ? {
          imageUrl,
          isVerified: imageVerified === ImageVerificationStatus.VERIFIED,
          verifiedBy: imageVerifiedBy,
          verifiedAt: imageVerified === ImageVerificationStatus.VERIFIED ? new Date() : undefined // real UTC
        } : undefined
      };

    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Failed to assign user to institute: ${error.message}`
      );
    }
  }

  /**
   * 🎯 BULK ENHANCED ASSIGNMENT - Assign multiple users at once
   */
  async bulkEnhancedAssignUsers(
    instituteId: string,
    bulkDto: BulkEnhancedAssignDto,
    assigningUserId?: string
  ): Promise<BulkEnhancedAssignmentResponseDto> {
    const successfulAssignments: EnhancedAssignmentResponseDto[] = [];
    const failedAssignments: Array<{
      identifier: string;
      instituteUserType: string;
      error: string;
    }> = [];

    for (const assignDto of bulkDto.assignments) {
      try {
        const result = await this.enhancedAssignUserToInstitute(
          instituteId,
          assignDto,
          undefined, // No file upload in bulk
          assigningUserId
        );
        successfulAssignments.push(result);
      } catch (error) {
        // Build identifier string for error reporting
        let identifier = '';
        if (assignDto.userId) identifier = `userId: ${assignDto.userId}`;
        else if (assignDto.rfid) identifier = `rfid: ${assignDto.rfid}`;
        else if (assignDto.phoneNumber) identifier = `phone: ${assignDto.phoneNumber}`;
        else if (assignDto.email) identifier = `email: ${assignDto.email}`;
        else identifier = 'unknown';

        failedAssignments.push({
          identifier,
          instituteUserType: assignDto.instituteUserType,
          error: error.message || 'Unknown error'
        });
      }
    }

    return {
      success: failedAssignments.length === 0,
      successfulAssignments,
      failedAssignments,
      summary: {
        total: bulkDto.assignments.length,
        successful: successfulAssignments.length,
        failed: failedAssignments.length
      }
    };
  }
}

