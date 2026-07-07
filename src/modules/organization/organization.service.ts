import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, Like, Brackets } from 'typeorm';
import { OrganizationEntity, OrganizationType } from './entities/organization.entity';
import { OrganizationUserEntity, OrganizationRole } from './entities/organization-user.entity';
import { CauseEntity } from './entities/cause.entity';
import { UserEntity } from '../user/entities/user.entity';
import { InstituteEntity } from '../institute/entities/institute.entity';
import { UserType } from '../user/enums/user-type.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { CreateOrganizationDto, UpdateOrganizationDto, EnrollUserDto, OrgVerifyUserDto, AssignInstituteDto, AssignUserRoleDto, ChangeUserRoleDto, RemoveUserDto, OrganizationAssignUserToInstituteDto, BulkAssignUsersToInstituteDto } from './dto/organization.dto';
import { InstituteUserEntity } from '../institute_mudules/institue_user/entities/institue_user.entity';
import { InstituteUserStatus } from '../institute_mudules/institue_user/enums/institute-user-status.enum';
import { InstituteUserType } from '../institute_mudules/institue_user/enums/institute-user-type.enum';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { EnhancedJwtPayload, ROLE_BITMASKS, USER_TYPE_COMPACT } from '../../auth/interfaces/enhanced-jwt-payload.interface';
import { getCurrentSriLankaTime, getCurrentSriLankaISO } from '../../common/utils/timezone.util';
import { sanitizeSortField, sanitizeSortOrder } from '@common/utils/query-sanitizer.util';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly organizationRepository: Repository<OrganizationEntity>,
    
    @InjectRepository(OrganizationUserEntity)
    private readonly organizationUserRepository: Repository<OrganizationUserEntity>,
    
    @InjectRepository(CauseEntity)
    private readonly causeRepository: Repository<CauseEntity>,
    
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
    
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    
    private readonly dataSource: DataSource,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  /**
   * Get organization names by IDs for compact JWT token operations
   */
  async getOrganizationNamesByIds(organizationIds: string[], searchTerm?: string) {
    const query = this.organizationRepository
      .createQueryBuilder('org')
      .select(['org.organizationId', 'org.name', 'org.type'])
      .where('org.organizationId IN (:...ids)', { ids: organizationIds });

    if (searchTerm) {
      query.andWhere('(org.name LIKE :search OR org.type LIKE :search)', { 
        search: `%${searchTerm}%` 
      });
    }

    return await query.getMany();
  }

  /**
   * Get organizations a student is enrolled in within an institute
   * Returns array of { organization, role, status, enrolledDate }
   */
  async getStudentOrganizations(instituteId: string, studentId: string, requestingUserId?: string) {
    // Validate institute exists
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) {
      throw new NotFoundException('Institute not found');
    }

    // Query organization memberships for the student within the institute
    const rows = await this.organizationUserRepository
      .createQueryBuilder('ou')
      .innerJoin(OrganizationEntity, 'org', 'org.organizationId = ou.organizationId')
      .where('org.instituteId = :instituteId', { instituteId })
      .andWhere('ou.userId = :studentId', { studentId })
      .select([
        'org.organizationId as organizationId',
        'org.name as organizationName',
        'ou.role as role',
        'ou.isVerified as status',
        'ou.createdAt as enrolledDate'
      ])
      .getRawMany();

    // Map rows to desired shape
    const result = rows.map(r => ({
      organization: {
        organizationId: r.organizationId,
        name: r.organizationName
      },
      role: r.role,
      status: r.status === 1 || r.status === true ? 'verified' : 'unverified',
      enrolledDate: r.enrolledDate
    }));

    return result;
  }

  /**
   * Get all organization members in an institute
   * Optional filter by studentId
   * Returns paginated list of members with organization details
   */
  async getInstituteOrganizationMembers(
    instituteId: string, 
    studentId: string | undefined,
    paginationDto: PaginationDto,
    requestingUserId?: string
  ) {
    // Validate institute exists
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) {
      throw new NotFoundException('Institute not found');
    }

    const pagination = paginationDto || new PaginationDto();

    // Build query for organization members in this institute
    const query = this.organizationUserRepository
      .createQueryBuilder('ou')
      .innerJoin(OrganizationEntity, 'org', 'org.organizationId = ou.organizationId')
      .innerJoin(UserEntity, 'user', 'user.id = ou.userId')
      .where('org.instituteId = :instituteId', { instituteId })
      .select([
        'ou.userId as userId',
        'user.firstName as firstName',
        'user.lastName as lastName',
        'user.nameWithInitials as nameWithInitials',
        'user.email as email',
        'org.organizationId as organizationId',
        'org.name as organizationName',
        'org.type as organizationType',
        'ou.role as role',
        'ou.isVerified as isVerified',
        'ou.createdAt as enrolledDate'
      ]);

    // Optional filter by studentId
    if (studentId) {
      query.andWhere('ou.userId = :studentId', { studentId });
    }

    // Get total count
    const countQuery = query.clone();
    const total = await countQuery.getCount();

    // Add pagination
    query
      .orderBy('ou.createdAt', 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit || 10);

    const rows = await query.getRawMany();

    // Format response
    const members = rows.map(r => ({
      userId: r.userId,
      name: `${r.firstName} ${r.lastName || ''}`.trim(),
      nameWithInitials: r.nameWithInitials || undefined,
      email: r.email,
      organization: {
        organizationId: r.organizationId,
        name: r.organizationName,
        type: r.organizationType
      },
      role: r.role,
      status: r.isVerified === 1 || r.isVerified === true ? 'verified' : 'unverified',
      enrolledDate: r.enrolledDate
    }));

    return new PaginatedResponseDto(
      members, 
      pagination.page || 1, 
      pagination.limit || 10, 
      total
    );
  }

  /**
   * Get all enrolled students in a specific organization
   * Access: SUPERADMIN, INSTITUTE_ADMIN only
   * Returns only students (institute_user_type = STUDENT) who are enrolled in the organization
   */
  async getOrganizationStudentsByInstitute(
    instituteId: string,
    organizationId: string,
    paginationDto: PaginationDto,
    requestingUserId?: string
  ) {
    // Validate institute exists
    const institute = await this.instituteRepository.findOne({ where: { id: instituteId } });
    if (!institute) {
      throw new NotFoundException('Institute not found');
    }

    const pagination = paginationDto || new PaginationDto();

    // Build query for ALL organization members (president, moderator, member, etc.)
    // Join with institute_users to get institute-specific info
    const query = this.organizationUserRepository
      .createQueryBuilder('ou')
      .innerJoin(UserEntity, 'user', 'user.id = ou.userId')
      .innerJoin(InstituteUserEntity, 'iu', 'iu.userId = ou.userId AND iu.instituteId = :instituteId', { instituteId })
      .where('ou.organizationId = :organizationId', { organizationId })
      .andWhere('iu.status = :status', { status: InstituteUserStatus.ACTIVE })
      .select([
        'ou.userId as userId',
        'user.firstName as firstName',
        'user.lastName as lastName',
        'user.nameWithInitials as nameWithInitials',
        'user.email as email',
        'user.phoneNumber as phoneNumber',
        'user.imageUrl as imageUrl',
        'user.userType as mainUserType',
        'iu.userIdByInstitute as userIdByInstitute',
        'iu.instituteUserType as instituteUserType',
        'ou.role as organizationRole',
        'ou.isVerified as isVerified',
        'ou.createdAt as enrolledDate'
      ]);

    // Get total count
    const countQuery = query.clone();
    const total = await countQuery.getCount();

    // Add pagination
    query
      .orderBy('ou.role', 'ASC') // President first, then moderator, then member
      .addOrderBy('ou.createdAt', 'DESC')
      .skip(pagination.skip)
      .take(pagination.limit || 10);

    const rows = await query.getRawMany();

    // Format response with organization roles
    const members = rows.map(r => ({
      userId: r.userId,
      userIdByInstitute: r.userIdByInstitute || null,
      firstName: r.firstName,
      lastName: r.lastName || '',
      name: `${r.firstName} ${r.lastName || ''}`.trim(),
      nameWithInitials: r.nameWithInitials || undefined,
      email: r.email,
      phoneNumber: r.phoneNumber || null,
      // ✅ Transform imageUrl to full URL
      imageUrl: r.imageUrl ? this.cloudStorageService.getFullUrl(r.imageUrl) : null,
      mainUserType: r.mainUserType, // USER, SUPERADMIN, etc.
      instituteUserType: r.instituteUserType, // STUDENT, TEACHER, INSTITUTE_ADMIN, etc.
      organizationRole: r.organizationRole, // PRESIDENT, MODERATOR, MEMBER
      verificationStatus: r.isVerified === 1 || r.isVerified === true ? 'verified' : 'unverified',
      enrolledDate: r.enrolledDate
    }));

    return new PaginatedResponseDto(
      members, 
      pagination.page || 1, 
      pagination.limit || 10, 
      total
    );
  }

  /**
   * Create a new organization
   * Access: SUPERADMIN, ORGANIZATION_MANAGER, INSTITUTE_ADMIN (with instituteId)
   */
  async createOrganization(
    createOrganizationDto: CreateOrganizationDto, 
    user: EnhancedJwtPayload,
    imageUrl?: string | null
  ) {
    const { name, type, isPublic, enrollmentKey, needEnrollmentVerification, enabledEnrollments, instituteId, imageUrl: dtoImageUrl } = createOrganizationDto;
    
    // Use imageUrl from DTO if provided, otherwise use the parameter (for backward compatibility)
    const finalImageUrl = dtoImageUrl || imageUrl || null;

    const userId = user.s;
    
    // ============================================
    // STEP 1: Determine User Role (Compact JWT)
    // ============================================
    // u = 0 (SUPERADMIN), u = 1 (ORGANIZATION_MANAGER), u = 2+ (Regular User)
    // Institute Admin stored in: i[].r & 8 === 8
    
    const isGlobalAdmin = user.u === 0 || user.u === 1; // SUPERADMIN or OM
    
    // Extract Institute Admin institutes from compact JWT
    let instituteAdminInstituteIds: string[] = [];
    if (user.i && Array.isArray(user.i)) {
      instituteAdminInstituteIds = user.i
        .filter((access: any) => (access.r & ROLE_BITMASKS.IA) === ROLE_BITMASKS.IA) // Filter IA role
        .map((access: any) => access.i); // Extract institute IDs
    }
    
    const isInstituteAdmin = instituteAdminInstituteIds.length > 0;
    
    // ============================================
    // STEP 2: Access Control Validation
    // ============================================
    
    // Rule 1: Institute Admin MUST provide instituteId
    if (isInstituteAdmin && !isGlobalAdmin && !instituteId) {
      this.logger.warn(`❌ Institute Admin (user ${userId}) tried to create org without instituteId`);
      throw new BadRequestException('Institute admins must provide instituteId when creating organizations');
    }
    
    // Rule 2: Institute Admin can ONLY create for their own institutes
    if (isInstituteAdmin && !isGlobalAdmin && instituteId) {
      if (!instituteAdminInstituteIds.includes(instituteId)) {
        this.logger.warn(
          `❌ Institute Admin (user ${userId}) denied: tried to create org for institute ${instituteId}. ` +
          `Allowed institutes: [${instituteAdminInstituteIds.join(', ')}]`
        );
        throw new ForbiddenException(
          `You can only create organizations for your institutes: [${instituteAdminInstituteIds.join(', ')}]`
        );
      }
    }
    
    // Rule 3: Regular users cannot create organizations
    if (!isGlobalAdmin && !isInstituteAdmin) {
      this.logger.warn(
        `❌ Organization creation denied for regular user ${userId} (userType: ${user.u})`
      );
      throw new ForbiddenException('Only Organization Managers, Super Admins, or Institute Admins can create organizations');
    }
    
    // ============================================
    // STEP 3: Log Authorization Success
    // ============================================
    const roleDescription = isGlobalAdmin 
      ? (user.u === 0 ? 'SUPERADMIN' : 'ORGANIZATION_MANAGER')
      : `INSTITUTE_ADMIN (institutes: ${instituteAdminInstituteIds.join(', ')})`;

    // Validate enrollment key requirement
    if (!isPublic && !enrollmentKey) {
      throw new BadRequestException('Enrollment key is required for private organizations');
    }

    // Validate institute exists if provided
    if (instituteId) {
      const institute = await this.instituteRepository.findOne({
        where: { id: instituteId }
      });
      if (!institute) {
        throw new BadRequestException('Institute not found');
      }
    }

    // Create organization
    const timestamp = getCurrentSriLankaISO();
    const organization = this.organizationRepository.create({
      name,
      type,
      isPublic,
      enrollmentKey: enrollmentKey || null,
      needEnrollmentVerification: needEnrollmentVerification ?? true,
      enabledEnrollments: enabledEnrollments ?? true,
      imageUrl: finalImageUrl, // Use uploaded image URL from DTO or parameter
      instituteId: instituteId || null,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const savedOrganization = await this.organizationRepository.save(organization);

    // Create organization user relationship
    if (userId !== 'OM_USER') {
      // Regular user creation - assign as MEMBER
      const creatorUser = await this.userRepository.findOne({
        where: { id: userId }
      });

      if (!creatorUser) {
        throw new BadRequestException(`Creator user with ID ${userId} not found`);
      }

      const timestamp2 = getCurrentSriLankaISO();
      const orgUser = this.organizationUserRepository.create({
        organizationId: savedOrganization.organizationId,
        userId: userId,
        role: OrganizationRole.MEMBER,
        isVerified: true,
        createdAt: timestamp2,
        updatedAt: timestamp2
      });

      await this.organizationUserRepository.save(orgUser);
    } else {
      // Organization Manager creation - create system user
      let omSystemUser = await this.userRepository.findOne({
        where: { email: 'org.manager@system.local' }
      });

      if (!omSystemUser) {
        const timestamp3 = getCurrentSriLankaISO();
        omSystemUser = this.userRepository.create({
          email: 'org.manager@system.local',
          firstName: 'Organization',
          lastName: 'Manager',
          isActive: true,
          password: null,
          createdAt: timestamp3,
          updatedAt: timestamp3
        });
        await this.userRepository.save(omSystemUser);
      }

      const timestamp4 = getCurrentSriLankaISO();
      const orgUser = this.organizationUserRepository.create({
        organizationId: savedOrganization.organizationId,
        userId: omSystemUser.id,
        role: OrganizationRole.PRESIDENT,
        isVerified: true,
        createdAt: timestamp4,
        updatedAt: timestamp4
      });

      await this.organizationUserRepository.save(orgUser);
    }

    return {
      id: savedOrganization.organizationId,
      name: savedOrganization.name,
      type: savedOrganization.type,
      isPublic: savedOrganization.isPublic,
      needEnrollmentVerification: savedOrganization.needEnrollmentVerification,
      enabledEnrollments: savedOrganization.enabledEnrollments,
      // ✅ Transform imageUrl to full URL
      imageUrl: savedOrganization.imageUrl ? this.cloudStorageService.getFullUrl(savedOrganization.imageUrl) : savedOrganization.imageUrl,
      instituteId: savedOrganization.instituteId
    };
  }

  /**
   * Get all organizations with pagination
   */
  async getOrganizations(userId?: string, paginationDto?: PaginationDto, user?: EnhancedJwtPayload): Promise<PaginatedResponseDto<any>> {
    const pagination = paginationDto || new PaginationDto();
    
    const query = this.organizationRepository
      .createQueryBuilder('org')
      .leftJoinAndSelect('org.organizationUsers', 'orgUser')
      .leftJoinAndSelect('org.causes', 'causes');

    if (userId) {
      // Extract institute IDs from compact JWT
      let userInstituteIds: string[] = [];
      if (user?.i && Array.isArray(user.i)) {
        userInstituteIds = user.i.map((access: any) => access.i);
      }
      
      // Build comprehensive filtering
      query.where(qb => {
        const subQuery = qb.subQuery()
          .select('1')
          .from(OrganizationEntity, 'o')
          .where('o.organizationId = org.organizationId')
          .andWhere(new Brackets(sub => {
            // Public organizations
            sub.where('o.isPublic = :isPublic', { isPublic: true });
            
            // User's enrolled organizations
            sub.orWhere(qb2 => {
              const enrolled = qb2.subQuery()
                .select('1')
                .from(OrganizationUserEntity, 'ou')
                .where('ou.organizationId = o.organizationId')
                .andWhere('ou.userId = :userId', { userId })
                .getQuery();
              return `EXISTS ${enrolled}`;
            });
            
            // Private organizations from user's institutes
            if (userInstituteIds.length > 0) {
              sub.orWhere('(o.isPublic = :isPrivate AND o.instituteId IN (:...instituteIds))', {
                isPrivate: false,
                instituteIds: userInstituteIds
              });
            }
          }));
        
        return `EXISTS ${subQuery.getQuery()}`;
      });
      
    } else {
      query.where('org.isPublic = :isPublic', { isPublic: true });
    }

    // Get total count
    const total = await query.getCount();

    // Add sorting
    query.orderBy(`org.createdAt`, 'DESC');

    // Add pagination
    query.skip(pagination.skip).take(pagination.limit || 10);

    const organizations = await query.getMany();

    // ✅ Transform imageUrl to full URL for all organizations
    const transformedOrganizations = organizations.map(org => {
      if (org.imageUrl) {
        org.imageUrl = this.cloudStorageService.getFullUrl(org.imageUrl);
      }
      return org;
    });

    return new PaginatedResponseDto(transformedOrganizations, pagination.page || 1, pagination.limit || 10, total);
  }

  /**
   * Get organizations by institute ID
   * Used for filtering organizations by a specific institute
   * Returns both public and private organizations from the institute
   */
  async getOrganizationsByInstitute(
    instituteId: string,
    userId?: string,
    paginationDto?: PaginationDto,
    user?: EnhancedJwtPayload
  ): Promise<PaginatedResponseDto<any>> {
    const pagination = paginationDto || new PaginationDto();

    const query = this.organizationRepository
      .createQueryBuilder('org')
      .leftJoinAndSelect('org.institute', 'institute')
      .where('org.instituteId = :instituteId', { instituteId });

    // Apply access control based on authentication
    if (userId) {
      // For authenticated users: show public orgs + user's enrolled orgs
      query.andWhere(
        new Brackets(qb => {
          qb.where('org.isPublic = :isPublic', { isPublic: true })
            .orWhere(qb2 => {
              const subQuery = qb2.subQuery()
                .select('1')
                .from('org_organization_users', 'ou')
                .where('ou.organizationId = org.organizationId')
                .andWhere('ou.userId = :userId', { userId })
                .getQuery();
              return `EXISTS ${subQuery}`;
            });
        })
      );
    } else {
      // For unauthenticated users: only public orgs
      query.andWhere('org.isPublic = :isPublic', { isPublic: true });
    }

    // Add search functionality (optional)
    if (pagination['search']) {
      query.andWhere('org.name LIKE :search', { search: `%${pagination['search']}%` });
    }

    // Get total count
    const total = await query.getCount();

    // Add sorting and pagination (SQL injection safe — allowlist validated)
    const validOrgSortFields = ['createdAt', 'updatedAt', 'name', 'memberCount', 'causeCount'] as const;
    const sortBy = sanitizeSortField(pagination['sortBy'], validOrgSortFields, 'createdAt');
    const sortOrder = sanitizeSortOrder(pagination['sortOrder']);
    
    if (sortBy === 'memberCount') {
      // Sort by organization users count
      query
        .leftJoin('org.organizationUsers', 'countOrgUser')
        .groupBy('org.organizationId')
        .orderBy('COUNT(countOrgUser.userId)', sortOrder);
    } else if (sortBy === 'causeCount') {
      // Sort by causes count
      query
        .leftJoin('org.causes', 'countCause')
        .groupBy('org.organizationId')
        .orderBy('COUNT(countCause.causeId)', sortOrder);
    } else {
      query.orderBy(`org.${sortBy}`, sortOrder);
    }

    query.skip(pagination.skip).take(pagination.limit || 10);

    // Add LEFT JOINs to get counts in single query (avoid N+1)
    query
      .leftJoin('org.organizationUsers', 'orgUser')
      .leftJoin('org.causes', 'cause')
      .addSelect('COUNT(DISTINCT orgUser.userId)', 'memberCount')
      .addSelect('COUNT(DISTINCT cause.causeId)', 'causeCount')
      .groupBy('org.organizationId')
      .addGroupBy('institute.id');

    const organizations = await query.getRawAndEntities();

    // Transform response with counts from query results
    const transformedOrgs = organizations.entities.map((org, index) => {
      const raw = organizations.raw[index];
      
      // ✅ Transform imageUrl to full URL for organization
      const fullImageUrl = org.imageUrl ? this.cloudStorageService.getFullUrl(org.imageUrl) : null;
      
      // ✅ Transform imageUrl to full URL for institute
      const fullInstituteImageUrl = org.institute?.imageUrl 
        ? this.cloudStorageService.getFullUrl(org.institute.imageUrl) 
        : null;

      return {
        organizationId: org.organizationId,
        name: org.name,
        type: org.type,
        isPublic: org.isPublic,
        imageUrl: fullImageUrl,
        instituteId: org.instituteId,
        memberCount: parseInt(raw.memberCount) || 0,
        causeCount: parseInt(raw.causeCount) || 0,
        createdAt: org.createdAt,
        institute: org.institute ? {
            instituteId: org.institute.id,
            name: org.institute.name,
            imageUrl: fullInstituteImageUrl
          } : null
        };
      });

    return new PaginatedResponseDto(transformedOrgs, pagination.page || 1, pagination.limit || 10, total);
  }

  /**
   * Assign organization to institute (ADMIN OPERATION)
   * Uses exception handling instead of separate existence checks
   */
  async assignToInstitute(organizationId: string, assignInstituteDto: AssignInstituteDto, user?: EnhancedJwtPayload) {
    try {
      const { instituteId } = assignInstituteDto;

      // Direct update - will throw if organization doesn't exist
      const result = await this.organizationRepository.update(
        { organizationId },
        { instituteId, updatedAt: new Date() }
      );

      if (result.affected === 0) {
        throw new NotFoundException(`Organization with ID ${organizationId} not found`);
      }

      const userId = user?.s || 'anonymous';

      // SECURITY AUDIT LOGGING - Institute assignment logged

      return {
        success: true,
        message: 'Organization successfully assigned to institute',
        timestamp: getCurrentSriLankaISO(),
        operation: 'ASSIGN_INSTITUTE',
        organizationId,
        instituteId,
        performedBy: {
          userId,
        },
      };
    } catch (error) {
      const userId = user?.s || 'anonymous';
      this.logger.error(
        `❌ INSTITUTE ASSIGNMENT FAILED: Organization ${organizationId} to institute ${assignInstituteDto.instituteId} ` +
        `by user ${userId} | Error: ${error.message}`
      );

      if (error instanceof NotFoundException || 
          error instanceof BadRequestException || 
          error instanceof ForbiddenException) {
        throw error;
      }

      // Check for foreign key constraint errors (institute doesn't exist)
      if (error.message && error.message.includes('foreign key constraint')) {
        throw new NotFoundException(`Institute with ID ${assignInstituteDto.instituteId} not found`);
      }

      throw new BadRequestException('Failed to assign organization to institute. Please try again.');
    }
  }

  /**
   * Remove organization from institute
   * Uses exception handling for efficiency
   */
  async removeFromInstitute(organizationId: string, user?: EnhancedJwtPayload) {
    try {
      // Direct update - will throw if organization doesn't exist
      const result = await this.organizationRepository.update(
        { organizationId },
        { instituteId: null }
      );

      if (result.affected === 0) {
        throw new NotFoundException('Organization not found');
      }

      const userId = user?.s || 'anonymous';

      return {
        message: 'Organization successfully removed from institute',
        organizationId,
        removedAt: getCurrentSriLankaISO()
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to remove organization from institute');
    }
  }

  /**
   * Get available institutes for organization assignment
   */
  async getAvailableInstitutes(paginationDto?: PaginationDto): Promise<PaginatedResponseDto<any>> {
    const pagination = paginationDto || new PaginationDto();

    const query = this.instituteRepository
      .createQueryBuilder('institute')
      .leftJoin('institute.organizations', 'org')
      .select([
        'institute.id',
        'institute.name',
        'institute.imageUrl'
      ])
      .addSelect('COUNT(org.organizationId)', 'organizationCount')
      .groupBy('institute.id');

    // Add search functionality
    if (pagination['search']) {
      query.andWhere('institute.name LIKE :search', { search: `%${pagination['search']}%` });
    }

    // Get total count
    const total = await this.instituteRepository.count();

    // Add sorting (SQL injection safe — allowlist validated)
    const validInstSortFields = ['name', 'createdAt', 'updatedAt', 'organizationCount'] as const;
    const sortBy = sanitizeSortField(pagination['sortBy'], validInstSortFields, 'name');
    const sortOrder = sanitizeSortOrder(pagination['sortOrder']);

    if (sortBy === 'organizationCount') {
      query.orderBy('organizationCount', sortOrder);
    } else {
      query.orderBy(`institute.${sortBy}`, sortOrder);
    }

    // Add pagination
    query.skip(pagination.skip).take(pagination.limit || 10);

    const institutes = await query.getRawMany();

    const formattedInstitutes = institutes.map(inst => ({
      instituteId: inst.institute_id,
      name: inst.institute_name,
      imageUrl: inst.institute_imageUrl ? this.cloudStorageService.getFullUrl(inst.institute_imageUrl) : null,
      organizationCount: parseInt(inst.organizationCount) || 0
    }));

    return new PaginatedResponseDto(formattedInstitutes, pagination.page || 1, pagination.limit || 10, total);
  }

  /**
   * Get organization members (verified only)
   */
  async getOrganizationMembers(organizationId: string, pagination: PaginationDto, user?: EnhancedJwtPayload) {
    // Get total count of verified members
    const total = await this.organizationUserRepository.count({
      where: {
        organizationId,
        isVerified: true
      }
    });

    // Get paginated verified members
    const members = await this.organizationUserRepository.find({
      where: {
        organizationId,
        isVerified: true
      },
      relations: ['user'],
      skip: pagination.skip,
      take: pagination.limit || 10,
      order: { createdAt: 'DESC' }
    });

    // Calculate role breakdown
    const roleBreakdown = await this.organizationUserRepository
      .createQueryBuilder('ou')
      .select('ou.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .where('ou.organizationId = :organizationId', { organizationId })
      .andWhere('ou.isVerified = :isVerified', { isVerified: true })
      .groupBy('ou.role')
      .getRawMany();

    const roleCount = roleBreakdown.reduce((acc, item) => {
      acc[item.role] = parseInt(item.count) || 0;
      return acc;
    }, {} as Record<string, number>);

    return {
      members: members.map(member => ({
        userId: member.userId,
        name: `${member.user.firstName} ${member.user.lastName || ''}`.trim(),
        nameWithInitials: member.user.nameWithInitials || undefined,
        email: member.user.email,
        role: member.role,
        isVerified: member.isVerified,
        joinedAt: member.createdAt
      })),
      totalMembers: total,
      roleBreakdown: roleCount,
      status: 'verified_only'
    };
  }

  /**
   * Get unverified organization members
   */
  async getUnverifiedMembers(organizationId: string, pagination: PaginationDto, user?: EnhancedJwtPayload) {
    // Get total count of unverified members
    const total = await this.organizationUserRepository.count({
      where: {
        organizationId,
        isVerified: false
      }
    });

    // Get paginated unverified members
    const members = await this.organizationUserRepository.find({
      where: {
        organizationId,
        isVerified: false
      },
      relations: ['user'],
      skip: pagination.skip,
      take: pagination.limit || 10,
      order: { createdAt: 'DESC' }
    });

    return {
      unverifiedMembers: members.map(member => ({
        userId: member.userId,
        name: `${member.user.firstName} ${member.user.lastName || ''}`.trim(),
        nameWithInitials: member.user.nameWithInitials || undefined,
        email: member.user.email,
        role: member.role,
        isVerified: member.isVerified,
        enrolledAt: member.createdAt
      })),
      totalUnverified: total,
      status: 'unverified_only'
    };
  }

  /**
   * Verify or reject an unverified organization member.
   * - isVerified=true  -> approve membership
   * - isVerified=false -> reject and remove membership row
   */
  async verifyUser(
    organizationId: string,
    verifyUserDto: OrgVerifyUserDto,
    requestingUserId?: string
  ) {
    const { userId, isVerified } = verifyUserDto;

    const membership = await this.organizationUserRepository.findOne({
      where: { organizationId, userId },
      select: ['organizationId', 'userId', 'isVerified', 'role'],
    });

    if (!membership) {
      throw new NotFoundException('User is not a member of this organization');
    }

    if (isVerified) {
      await this.organizationUserRepository.update(
        { organizationId, userId },
        {
          isVerified: true,
          verifiedBy: requestingUserId || null,
          verifiedAt: getCurrentSriLankaTime(),
        }
      );

      return {
        message: 'User verified successfully',
        userId,
        organizationId,
        isVerified: true,
        verifiedAt: getCurrentSriLankaISO(),
      };
    }

    if (membership.role === OrganizationRole.PRESIDENT) {
      throw new BadRequestException('Cannot reject PRESIDENT membership');
    }

    await this.organizationUserRepository.delete({ organizationId, userId });

    return {
      message: 'User verification rejected and membership removed',
      userId,
      organizationId,
      isVerified: false,
      removedAt: getCurrentSriLankaISO(),
    };
  }

  /**
   * Assign role to user in organization
   * Uses exception handling for efficiency
   */
  async assignUserRole(organizationId: string, assignUserRoleDto: AssignUserRoleDto, requestingUserId?: string) {
    const { userId, role } = assignUserRoleDto;

    // Prevent assigning PRESIDENT role
    if (role === OrganizationRole.PRESIDENT) {
      throw new BadRequestException('Cannot assign PRESIDENT role directly. Use transfer presidency instead.');
    }

    try {
      // Direct update - will throw if user is not in organization
      const result = await this.organizationUserRepository.update(
        { userId, organizationId },
        { role }
      );

      if (result.affected === 0) {
        throw new BadRequestException('User is not a member of this organization');
      }

      return {
        message: 'User role assigned successfully',
        userId,
        organizationId,
        role,
        assignedAt: getCurrentSriLankaISO()
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to assign user role');
    }
  }

  /**
   * Add institute user to organization
   * Institute Admins can add users from their institute to organizations
   */
  async addInstituteUserToOrganization(
    organizationId: string,
    userId: string,
    requestingUserId: string,
    role: string = 'MEMBER'
  ) {
    // Validate organization exists
    const organization = await this.organizationRepository.findOne({
      where: { organizationId }
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    // Validate user exists
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user is already a member
    const existingMember = await this.organizationUserRepository.findOne({
      where: { userId, organizationId }
    });

    if (existingMember) {
      throw new BadRequestException('User is already a member of this organization');
    }

    // Validate role
    const validRoles = ['ADMIN', 'MODERATOR', 'MEMBER'];
    const organizationRole = validRoles.includes(role.toUpperCase()) 
      ? role.toUpperCase() as OrganizationRole 
      : OrganizationRole.MEMBER;

    // Prevent PRESIDENT role
    if (organizationRole === OrganizationRole.PRESIDENT) {
      throw new BadRequestException('Cannot add user as PRESIDENT. Organization can only have one president.');
    }

    // Create organization membership with auto-verification using raw SQL to avoid update constraint
    const now = new Date();
    await this.organizationUserRepository.query(`
      INSERT INTO org_organization_users 
        (organizationId, userId, role, isVerified, verifiedBy, verifiedAt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      organizationId,
      userId,
      organizationRole,
      true,
      requestingUserId,
      now,
      now,
      now
    ]);

    return {
      success: true,
      message: 'User added to organization successfully',
      data: {
        userId,
        organizationId,
        role: organizationRole,
        isVerified: true,
        addedBy: requestingUserId,
        addedAt: getCurrentSriLankaISO()
      }
    };
  }

  /**
   * Change user role in organization
   * Uses exception handling for efficiency
   */
  async changeUserRole(organizationId: string, changeUserRoleDto: ChangeUserRoleDto, requestingUserId?: string) {
    const { userId, newRole } = changeUserRoleDto;

    // Prevent changing to PRESIDENT role
    if (newRole === OrganizationRole.PRESIDENT) {
      throw new BadRequestException('Cannot assign PRESIDENT role directly. Use transfer presidency instead.');
    }

    try {
      // Direct update with WHERE condition to prevent changing PRESIDENT
      const result = await this.organizationUserRepository
        .createQueryBuilder()
        .update(OrganizationUserEntity)
        .set({ role: newRole })
        .where('userId = :userId', { userId })
        .andWhere('organizationId = :organizationId', { organizationId })
        .andWhere('role != :presidentRole', { presidentRole: OrganizationRole.PRESIDENT })
        .execute();

      if (result.affected === 0) {
        // Check if user exists or is president
        const member = await this.organizationUserRepository.findOne({
          where: { userId, organizationId },
          select: ['role']
        });

        if (!member) {
          throw new BadRequestException('User is not a member of this organization');
        }

        if (member.role === OrganizationRole.PRESIDENT) {
          throw new BadRequestException('Cannot change PRESIDENT role. Use transfer presidency instead.');
        }

        throw new BadRequestException('Failed to change user role');
      }

      return {
        message: 'User role changed successfully',
        userId,
        organizationId,
        role: newRole,
        assignedAt: getCurrentSriLankaISO()
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to change user role');
    }
  }

  /**
   * Remove user from organization
   * Uses exception handling for efficiency
   */
  async removeUserFromOrganization(organizationId: string, removeUserDto: RemoveUserDto, requestingUserId?: string) {
    const { userId } = removeUserDto;

    try {
      // Direct delete with WHERE condition to prevent removing PRESIDENT
      const result = await this.organizationUserRepository
        .createQueryBuilder()
        .delete()
        .from(OrganizationUserEntity)
        .where('userId = :userId', { userId })
        .andWhere('organizationId = :organizationId', { organizationId })
        .andWhere('role != :presidentRole', { presidentRole: OrganizationRole.PRESIDENT })
        .execute();

      if (result.affected === 0) {
        // Check if user exists or is president
        const member = await this.organizationUserRepository.findOne({
          where: { userId, organizationId },
          select: ['role']
        });

        if (!member) {
          throw new BadRequestException('User is not a member of this organization');
        }

        if (member.role === OrganizationRole.PRESIDENT) {
          throw new BadRequestException('Cannot remove PRESIDENT. Transfer presidency first.');
        }

        throw new BadRequestException('Failed to remove user');
      }

      return {
        message: 'User removed from organization successfully',
        userId,
        organizationId,
        removedAt: getCurrentSriLankaISO()
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to remove user from organization');
    }
  }

  /**
   * Leave organization as the current authenticated user.
   */
  async leaveOrganization(organizationId: string, requestingUserId: string) {
    return this.removeUserFromOrganization(
      organizationId,
      { userId: requestingUserId },
      requestingUserId
    );
  }

  /**
   * Delete organization.
   * Allowed for SUPERADMIN / ORGANIZATION_MANAGER or the current PRESIDENT of the organization.
   */
  async deleteOrganization(organizationId: string, user?: EnhancedJwtPayload) {
    const organization = await this.organizationRepository.findOne({
      where: { organizationId },
      select: ['organizationId'],
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const userId = user?.s;
    if (!userId) {
      throw new ForbiddenException('Invalid user context');
    }

    const isGlobalAdmin = user.u === USER_TYPE_COMPACT.SUPERADMIN || user.u === USER_TYPE_COMPACT.ORGANIZATION_MANAGER;

    if (!isGlobalAdmin) {
      const membership = await this.organizationUserRepository.findOne({
        where: { organizationId, userId },
        select: ['role'],
      });

      if (!membership || membership.role !== OrganizationRole.PRESIDENT) {
        throw new ForbiddenException('Only organization president or system organization admins can delete this organization');
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.createQueryBuilder()
        .delete()
        .from(OrganizationUserEntity)
        .where('organizationId = :organizationId', { organizationId })
        .execute();

      await manager.createQueryBuilder()
        .delete()
        .from(CauseEntity)
        .where('organizationId = :organizationId', { organizationId })
        .execute();

      await manager.createQueryBuilder()
        .delete()
        .from(OrganizationEntity)
        .where('organizationId = :organizationId', { organizationId })
        .execute();
    });

    return {
      message: 'Organization deleted successfully',
      organizationId,
      deletedAt: getCurrentSriLankaISO(),
    };
  }

  /**
   * Transfer presidency to another user
   * Uses exception handling and transaction for atomic operation
   */
  async transferPresidency(organizationId: string, newPresidentUserId: string, requestingUserId?: string) {
    try {
      // Use transaction for atomic operation
      const result = await this.dataSource.transaction(async (manager) => {
        // Find and demote current president (if exists)
        const demoteResult = await manager
          .createQueryBuilder()
          .update(OrganizationUserEntity)
          .set({ role: OrganizationRole.ADMIN })
          .where('organizationId = :organizationId', { organizationId })
          .andWhere('role = :presidentRole', { presidentRole: OrganizationRole.PRESIDENT })
          .execute();

        const previousPresidentId = demoteResult.affected > 0 ? 'demoted' : null;

        // Promote new user to PRESIDENT
        const promoteResult = await manager
          .createQueryBuilder()
          .update(OrganizationUserEntity)
          .set({ role: OrganizationRole.PRESIDENT })
          .where('userId = :userId', { userId: newPresidentUserId })
          .andWhere('organizationId = :organizationId', { organizationId })
          .execute();

        if (promoteResult.affected === 0) {
          throw new BadRequestException('New president must be a member of the organization');
        }

        return { previousPresidentId };
      });

      return {
        message: 'Presidency transferred successfully',
        newPresidentUserId,
        previousPresidentUserId: result.previousPresidentId,
        transferredAt: getCurrentSriLankaISO()
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to transfer presidency');
    }
  }

  /**
   * ADMIN ASSIGNMENT TO INSTITUTE
   * 
   * Allows organization ADMIN/PRESIDENT to assign organization members to institutes
   * 
   * Access Control:
   * - SUPERADMIN: Can assign any user to any institute
   * - ORGANIZATION_MANAGER: Can assign any user to any institute
   * - Organization PRESIDENT/ADMIN: Can assign their members to institutes
   * - Institute ADMIN: Can accept assignments to their institute
   * 
   * Business Rules:
   * 1. User must be a member of the organization (verified)
   * 2. Institute must exist and be active
   * 3. User cannot be assigned twice to same institute
   * 4. Admin assignment = auto-verified by default
   * 5. Records who assigned the user
   * 
   * @param organizationId - Organization ID
   * @param assignDto - Assignment details
   * @param requestingUserId - User making the assignment (admin/president)
   */
  async assignUserToInstitute(
    organizationId: string, 
    assignDto: OrganizationAssignUserToInstituteDto, 
    requestingUserId?: string
  ) {
    const { userId, instituteId, userIdByInstitute, instituteUserType, autoVerify } = assignDto;


    // Step 1: Verify user is a member of the organization
    const orgMembership = await this.organizationUserRepository.findOne({
      where: { 
        userId, 
        organizationId,
        isVerified: true // Must be verified in organization
      }
    });

    if (!orgMembership) {
      throw new BadRequestException(
        'User must be a verified member of the organization before assignment to institute'
      );
    }

    // Step 2: Verify institute exists and is active
    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId }
    });

    if (!institute) {
      throw new NotFoundException('Institute not found');
    }

    if (!institute.isActive) {
      throw new BadRequestException('Cannot assign users to inactive institute');
    }

    // Step 3: Check if user already assigned to this institute
    const existingAssignment = await this.instituteUserRepository.findOne({
      where: { 
        userId, 
        instituteId 
      }
    });

    if (existingAssignment) {
      throw new BadRequestException(
        `User is already assigned to this institute (Status: ${existingAssignment.status})`
      );
    }

    // Step 4: Determine institute user type
    const finalInstituteUserType = instituteUserType || InstituteUserType.STUDENT;
    
    // Validate institute user type
    if (!Object.values(InstituteUserType).includes(finalInstituteUserType as InstituteUserType)) {
      throw new BadRequestException(`Invalid institute user type: ${finalInstituteUserType}`);
    }

    // Step 5: Determine verification status
    const shouldAutoVerify = autoVerify !== false; // Default to true for admin assignments

    // Step 6: Create institute user assignment
    try {
      const timestamp = getCurrentSriLankaISO();
      const instituteUser = this.instituteUserRepository.create({
        userId,
        instituteId,
        userIdByInstitute: userIdByInstitute || null,
        instituteUserType: finalInstituteUserType as InstituteUserType,
        status: shouldAutoVerify ? InstituteUserStatus.ACTIVE : InstituteUserStatus.PENDING,
        verifiedBy: shouldAutoVerify ? requestingUserId : null,
        verifiedAt: shouldAutoVerify ? new Date() : null,
        createdAt: timestamp,
        updatedAt: timestamp
      });

      const savedAssignment = await this.instituteUserRepository.save(instituteUser);


      // Step 7: Fetch user details for response
      const user = await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'email', 'firstName', 'lastName']
      });

      return {
        message: shouldAutoVerify 
          ? 'User assigned to institute and auto-verified successfully' 
          : 'User assigned to institute. Awaiting verification.',
        assignment: {
          userId: savedAssignment.userId,
          instituteId: savedAssignment.instituteId,
          userIdByInstitute: savedAssignment.userIdByInstitute,
          instituteUserType: savedAssignment.instituteUserType,
          status: savedAssignment.status,
          verifiedBy: savedAssignment.verifiedBy,
          verifiedAt: savedAssignment.verifiedAt,
          createdAt: savedAssignment.createdAt
        },
        user: {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          nameWithInitials: user.nameWithInitials || undefined
        },
        institute: {
          id: institute.id,
          name: institute.name,
          code: institute.code
        }
      };

    } catch (error) {
      // Handle duplicate key error (composite primary key violation)
      if (error.code === '23505' || error.code === 'ER_DUP_ENTRY' || 
          error.message?.includes('duplicate key') || 
          error.message?.includes('Duplicate entry')) {
        throw new BadRequestException('User is already assigned to this institute');
      }
      
      this.logger.error(`❌ Failed to assign user to institute: ${error.message}`);
      throw new BadRequestException(`Failed to assign user to institute: ${error.message}`);
    }
  }

  /**
   * BULK ADMIN ASSIGNMENT TO INSTITUTE
   * 
   * Allows organization admins to assign multiple organization members to an institute at once
   * 
   * Use Cases:
   * - Onboarding entire organization to an institute
   * - Migrating users between institutes
   * - Batch enrollment of students/teachers
   * 
   * Business Rules:
   * 1. All users must be verified members of the organization
   * 2. Partial success: Some users may succeed, others fail
   * 3. Returns detailed results for each assignment
   * 4. Skips already assigned users
   * 
   * @param organizationId - Organization ID
   * @param bulkAssignDto - Bulk assignment details
   * @param requestingUserId - User making the assignment
   */
  async bulkAssignUsersToInstitute(
    organizationId: string, 
    bulkAssignDto: BulkAssignUsersToInstituteDto, 
    requestingUserId?: string
  ) {
    const { userIds, instituteId, defaultInstituteUserType, autoVerify } = bulkAssignDto;


    // Step 1: Verify institute exists
    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId }
    });

    if (!institute) {
      throw new NotFoundException('Institute not found');
    }

    if (!institute.isActive) {
      throw new BadRequestException('Cannot assign users to inactive institute');
    }

    // Step 2: Fetch all organization memberships in one query
    const orgMemberships = await this.organizationUserRepository.find({
      where: { 
        organizationId,
        userId: In(userIds),
        isVerified: true
      }
    });

    const verifiedUserIds = new Set(orgMemberships.map(m => m.userId));

    // Step 3: Check existing institute assignments
    const existingAssignments = await this.instituteUserRepository.find({
      where: {
        instituteId,
        userId: In(userIds)
      }
    });

    const alreadyAssignedUserIds = new Set(existingAssignments.map(a => a.userId));

    // Step 4: Process each user
    const results = {
      successful: [],
      failed: [],
      skipped: [],
      summary: {
        total: userIds.length,
        succeeded: 0,
        failed: 0,
        skipped: 0
      }
    };

    const shouldAutoVerify = autoVerify !== false; // Default to true
    const finalInstituteUserType = defaultInstituteUserType || InstituteUserType.STUDENT;

    for (const userId of userIds) {
      try {
        // Check if user is verified member
        if (!verifiedUserIds.has(userId)) {
          results.skipped.push({
            userId,
            reason: 'User is not a verified member of the organization'
          });
          results.summary.skipped++;
          continue;
        }

        // Check if already assigned
        if (alreadyAssignedUserIds.has(userId)) {
          results.skipped.push({
            userId,
            reason: 'User is already assigned to this institute'
          });
          results.summary.skipped++;
          continue;
        }

        // Create assignment
        const timestamp = getCurrentSriLankaISO();
        const instituteUser = this.instituteUserRepository.create({
          userId,
          instituteId,
          instituteUserType: finalInstituteUserType as InstituteUserType,
          status: shouldAutoVerify ? InstituteUserStatus.ACTIVE : InstituteUserStatus.PENDING,
          verifiedBy: shouldAutoVerify ? requestingUserId : null,
          verifiedAt: shouldAutoVerify ? new Date() : null,
          createdAt: timestamp,
          updatedAt: timestamp
        });

        await this.instituteUserRepository.save(instituteUser);

        results.successful.push({
          userId,
          status: instituteUser.status,
          message: 'Assigned successfully'
        });
        results.summary.succeeded++;

      } catch (error) {
        results.failed.push({
          userId,
          reason: error.message || 'Assignment failed'
        });
        results.summary.failed++;
      }
    }

    return {
      message: `Bulk assignment complete: ${results.summary.succeeded} succeeded, ${results.summary.failed} failed, ${results.summary.skipped} skipped`,
      institute: {
        id: institute.id,
        name: institute.name,
        code: institute.code
      },
      results
    };
  }

  /**
   * GET ORGANIZATION MEMBERS ELIGIBLE FOR INSTITUTE ASSIGNMENT
   * 
   * Returns verified organization members who are NOT yet assigned to the specified institute
   * 
   * @param organizationId - Organization ID
   * @param instituteId - Institute ID
   * @param paginationDto - Pagination parameters
   */
  async getEligibleMembersForInstitute(
    organizationId: string, 
    instituteId: string,
    paginationDto: PaginationDto
  ): Promise<PaginatedResponseDto<any>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    // Subquery: Get user IDs already assigned to this institute
    const assignedUserIds = await this.instituteUserRepository
      .createQueryBuilder('iu')
      .select('iu.userId')
      .where('iu.instituteId = :instituteId', { instituteId })
      .getRawMany()
      .then(results => results.map(r => r.userId));

    // Query: Get verified organization members NOT in assignedUserIds
    const query = this.organizationUserRepository
      .createQueryBuilder('ou')
      .leftJoinAndSelect('ou.user', 'user')
      .where('ou.organizationId = :organizationId', { organizationId })
      .andWhere('ou.isVerified = :isVerified', { isVerified: true });

    if (assignedUserIds.length > 0) {
      query.andWhere('ou.userId NOT IN (:...assignedUserIds)', { assignedUserIds });
    }

    const [data, total] = await query
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const formattedData = data.map(ou => ({
      userId: ou.userId,
      email: ou.user.email,
      firstName: ou.user.firstName,
      lastName: ou.user.lastName,
      organizationRole: ou.role,
      joinedAt: ou.createdAt
    }));

    return {
      data: formattedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasPreviousPage: page > 1,
        hasNextPage: page < Math.ceil(total / limit),
        previousPage: page > 1 ? page - 1 : null,
        nextPage: page < Math.ceil(total / limit) ? page + 1 : null
      }
    };
  }

  /**
   * Update organization image
   * @deprecated File parameter is deprecated - use imageUrl string instead
   */
  async updateOrganizationImage(
    organizationId: string,
    imageUrl: string,
    currentUser: any
  ) {
    // Find organization
    const organization = await this.organizationRepository.findOne({
      where: { organizationId }
    });
    
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }
    
    if (!imageUrl || typeof imageUrl !== 'string') {
      throw new BadRequestException('imageUrl is required');
    }
    
    // Delete old image if exists
    if (organization.imageUrl) {
      try {
        await this.cloudStorageService.deleteFile(organization.imageUrl);
      } catch (error) {
        this.logger.warn(`Failed to delete old organization image: ${error.message}`);
        // Don't fail the request if old image deletion fails
      }
    }
    
    // Update organization with new imageUrl
    await this.organizationRepository.update(organizationId, {
      imageUrl
    });
    
    
    return {
      success: true,
      message: 'Organization image updated successfully',
      imageUrl: imageUrl
    };
  }

  /**
   * 🚀 Get organization enrollment key (Admins and Members)
   * Returns the enrollment key for private organizations
   * Accessible by organization admins and members
   */
  async getOrganizationEnrollmentKey(
    organizationId: string,
    requestingUserId: string,
    jwtPayload: EnhancedJwtPayload
  ): Promise<{
    organizationId: string;
    organizationName: string;
    isPublic: boolean;
    enrollmentKey: string | null;
  }> {

    // Find organization
    const organization = await this.organizationRepository.findOne({
      where: { organizationId },
      relations: ['institute']
    });

    if (!organization) {
      throw new NotFoundException(`Organization with ID ${organizationId} not found`);
    }

    // Authorization check: SUPERADMIN or INSTITUTE_ADMIN only
    const userTypeCompact = jwtPayload.u;
    const isSuperAdmin = userTypeCompact === USER_TYPE_COMPACT.SUPERADMIN;

    if (!isSuperAdmin) {
      // Check if user is an Institute Admin with access to this organization's institute
      if (!organization.instituteId) {
        throw new ForbiddenException('Only SUPERADMIN can view enrollment keys for global organizations');
      }

      // Check if user has institute admin access to this organization's institute
      const hasInstituteAccess = this.checkInstituteAdminAccess(jwtPayload, organization.instituteId);
      
      if (!hasInstituteAccess) {
        throw new ForbiddenException('Only SUPERADMIN or Institute Admin can view the enrollment key');
      }
    }


    return {
      organizationId: organization.organizationId,
      organizationName: organization.name,
      isPublic: organization.isPublic,
      enrollmentKey: organization.enrollmentKey || null
    };
  }

  /**
   * Check if user has Institute Admin access to a specific institute
   */
  private checkInstituteAdminAccess(jwtPayload: EnhancedJwtPayload, instituteId: string): boolean {
    // Check if user has institute access array
    if (!jwtPayload.i || typeof jwtPayload.i === 'number') {
      return false;
    }

    // Find the institute in the access array
    const instituteAccess = jwtPayload.i.find(entry => entry.i === instituteId);
    if (!instituteAccess) {
      return false;
    }

    // Check if user has Institute Admin role (bitmask 8)
    return (instituteAccess.r & ROLE_BITMASKS.IA) !== 0;
  }

  // Continue with more methods...
}
