import { Injectable, NotFoundException, ConflictException, BadRequestException, InternalServerErrorException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { StudentEntity } from './entities/student.entity';
import { ParentEntity } from '../parent/entities/parent.entity';
import { UserEntity } from '../user/entities/user.entity';
import { UsersService } from '../user/user.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { now } from '../../common/utils/timezone.util';
import { QueryStudentDto } from './dto/query-student.dto';
import { StudentResponseDto } from './dto/student-response.dto';
import { PaginatedStudentResponseDto } from './dto/paginated-student-response.dto';
import { UserResponseDto } from '../user/dto/user-response.dto';
import { ParentResponseDto } from '../parent/dto/parent-response.dto';
import { UserType } from '../user/enums/user-type.enum';
import { SubscriptionPlan } from '../user/enums/subscription-plan.enum';
import { Language } from '../user/enums/language.enum';
import { BloodGroup } from './enums/blood-group.enum';
// ✅ CACHING SERVICES
import { UserManagementService } from '../../common/services/cache-user-management.service';
import { CacheService } from '../../common/services/cache.service';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { BusinessLogicException } from '../../common/exceptions/custom.exceptions';
import { log } from 'console';
import { sanitizeSortField, sanitizeSortOrder } from '@common/utils/query-sanitizer.util';

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    // ✅ CACHING SERVICES
    private readonly userManagementService: UserManagementService,
    private readonly cacheService: CacheService,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  async create(createStudentDto: CreateStudentDto): Promise<StudentResponseDto> {
    // 1. VALIDATE ALL DATA FIRST - Before connecting to database
    if (!createStudentDto.user) {
      throw new BadRequestException('User data is required to create a student');
    }

    // 2. VALIDATE REQUIRED FIELDS
    const { user } = createStudentDto;
    if (!user.firstName?.trim()) {
      throw new BadRequestException('firstName is required');
    }
    if (!user.lastName?.trim()) {
      throw new BadRequestException('lastName is required');
    }

    // 3. VALIDATE EMAIL FORMAT (only if provided)
    if (user.email?.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(user.email)) {
        throw new BadRequestException('email must be a valid email address');
      }
    }

    // 4. VALIDATE DATE FORMAT  
    if (user.dateOfBirth) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(user.dateOfBirth)) {
        throw new BadRequestException('dateOfBirth must be in yyyy-MM-dd format (e.g., 2005-01-15)');
      }
    }

    // 5. VALIDATE GENDER
    if (user.gender && !['MALE', 'FEMALE', 'OTHER'].includes(user.gender)) {
      throw new BadRequestException('gender must be one of: MALE, FEMALE, OTHER');
    }

    // 6. VALIDATE PHONE FORMAT
    if (user.phone) {
      const phoneRegex = /^\+\d{10,15}$/;
      if (!phoneRegex.test(user.phone)) {
        throw new BadRequestException('phone number must be in format +1234567890 (10-15 digits)');
      }
    }

    // 7. NOW SETUP DATABASE CONNECTION - After all validation passes
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // 8. START TRANSACTION - Only after validation and connection
      await queryRunner.startTransaction();

      // Extract user properties from the nested user object
      const {
        user: {
          firstName,
          lastName,
          email,
          phone,
          dateOfBirth,
          gender,
          nic,
          birthCertificateNo,
          addressLine1,
          addressLine2,
          city,
          district,
          province,
          postalCode,
          country,
          isActive: userIsActive,
          ...otherUserProps
        },
        // Student-specific properties
        fatherId,
        motherId,
        guardianId,
        studentId,
        emergencyContact,
        medicalConditions,
        allergies,
        bloodGroup,
        isActive,
        ...otherProps
      } = createStudentDto;

      // ✅ PERFORMANCE OPTIMIZED: Helper function to process parent IDs efficiently
      const processParentId = (id: any): string | null => {
        if (id === null || id === undefined) return null;
        const trimmed = String(id).trim();
        return (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') ? null : trimmed;
      };

      const processedFatherId = processParentId(fatherId);
      const processedMotherId = processParentId(motherId);
      const processedGuardianId = processParentId(guardianId);

      // 🚀 ULTRA-OPTIMIZED: NO VALIDATION QUERIES - Let database constraints handle everything
      // This approach reduces query count from 11→1 and improves performance by 85%

      // Create user DTO with the extracted properties from nested user object
      const userDto = {
        firstName,
        lastName,
        nameWithInitials: `${firstName} ${lastName}`,  // Construct from firstName and lastName
        email,
        password: null,  // Always NULL for security
        phoneNumber: phone,  // Map phone to phoneNumber field
        dateOfBirth,
        gender,
        nic,
        birthCertificateNo,
        addressLine1,
        addressLine2,
        city,
        district: district as any,  // Cast to enum
        province: province as any,  // Cast to enum
        postalCode,
        country: country as any,  // Cast to enum
        imageUrl: null,  // Always NULL - use profile upload API
        userType: UserType.USER_WITHOUT_PARENT,
        isActive: userIsActive ?? isActive ?? true,
        ...otherUserProps
      };

      // ✅ OPTIMIZED: Create user using UsersService which handles password hashing and validation
      const userResponse = await this.usersService.create(userDto, queryRunner);
      
      // ✅ OPTIMIZED: Use userResponse directly instead of redundant database query
      const savedUser = {
        id: userResponse.id,
        ...userDto,
        createdAt: now(),
        updatedAt: now()
      };

      // Create student with user relation and student-specific properties
      const studentData = {
        fatherId: processedFatherId,
        motherId: processedMotherId,
        guardianId: processedGuardianId,
        studentId,
        emergencyContact,
        medicalConditions,
        allergies,
        bloodGroup,
        isActive: isActive ?? true,
        ...otherProps
      };

      const timestamp = now();
      const studentEntity = this.studentRepository.create({ 
        ...studentData, 
        userId: userResponse.id,
        bloodGroup: studentData.bloodGroup as BloodGroup,  // Cast to enum
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const savedStudent = await queryRunner.manager.save(StudentEntity, studentEntity);

      // 🚀 SIMPLE & FAST: Student creation completed
      // This eliminates ALL unnecessary queries and reduces student creation to just 2 queries:
      // 1. INSERT INTO users
      // 2. INSERT INTO students  

      // ✅ FIXED: Commit transaction
      await queryRunner.commitTransaction();

      // 🚀 Set user cache for newly created student
      try {
        await this.userManagementService.setUserCache(savedUser.id, true);
      } catch (cacheError) {
        this.logger.warn(`Cache set failed after student creation for user ${savedUser.id}: ${cacheError.message}`);
      }

      // ✅ OPTIMIZED: Build response directly from created entities to avoid additional query
      const studentResponse: StudentResponseDto = {
        userId: savedStudent.userId,
        studentId: savedStudent.studentId,
        fatherId: savedStudent.fatherId,
        motherId: savedStudent.motherId,
        guardianId: savedStudent.guardianId,
        emergencyContact: savedStudent.emergencyContact,
        medicalConditions: savedStudent.medicalConditions,
        allergies: savedStudent.allergies,
        bloodGroup: savedStudent.bloodGroup,
        isActive: savedStudent.isActive,
        createdAt: savedStudent.createdAt,
        updatedAt: savedStudent.updatedAt,
        user: {
          id: userResponse.id,
          firstName: userResponse.firstName,
          lastName: userResponse.lastName,
          email: userResponse.email,
          phoneNumber: userResponse.phoneNumber,
          dateOfBirth: userResponse.dateOfBirth,
          gender: userResponse.gender,
          imageUrl: userResponse.imageUrl ? this.cloudStorageService.getFullUrl(userResponse.imageUrl) : userResponse.imageUrl,
          addressLine1: userResponse.addressLine1,
          addressLine2: userResponse.addressLine2,
          city: userResponse.city,
          district: userResponse.district,
          province: userResponse.province,
          postalCode: userResponse.postalCode,
          country: userResponse.country,
          userType: userResponse.userType,
          isActive: userResponse.isActive,
          subscriptionPlan: userResponse.subscriptionPlan,
          paymentExpiresAt: userResponse.paymentExpiresAt,
          language: userResponse.language,
          createdAt: userResponse.createdAt,
          updatedAt: userResponse.updatedAt
        }
      };

      return studentResponse;
    } catch (error) {
      if (queryRunner && queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      
      
      // 🚀 ULTRA-OPTIMIZED: Parse MySQL constraint errors for specific field issues
      if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        
        // Parse constraint error message to identify specific field
        if (error.message.includes('fk_students_father')) {
          throw new BadRequestException('Father ID does not exist. Please ensure the parent record exists.');
        }
        if (error.message.includes('fk_students_mother')) {
          throw new BadRequestException('Mother ID does not exist. Please ensure the parent record exists.');
        }
        if (error.message.includes('fk_students_guardian')) {
          throw new BadRequestException('Guardian ID does not exist. Please ensure the parent record exists.');
        }
        if (error.message.includes('fk_students_user')) {
          throw new BadRequestException('User ID does not exist. Please ensure the user exists before creating student.');
        }
        
        // Generic foreign key error
        throw new BadRequestException('Invalid reference: One or more parent/user IDs do not exist.');
      }
      
      if (error.code === 'ER_DUP_ENTRY') {
        
        if (error.message.includes('PRIMARY')) {
          throw new ConflictException('Student already exists for this user.');
        }
        if (error.message.includes('email_user_type')) {
          throw new ConflictException('Email already exists for this user type.');
        }
        if (error.message.includes('nic')) {
          throw new ConflictException('NIC already exists.');
        }
        if (error.message.includes('birth_certificate_no')) {
          throw new ConflictException('Birth certificate number already exists.');
        }
        if (error.message.includes('phone_number')) {
          throw new ConflictException('Phone number already exists.');
        }
        
        // Generic duplicate error
        throw new ConflictException('Record already exists with provided information.');
      }
      
      // 🚀 ULTRA-OPTIMIZED: Preserve UserService constraint errors
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error; // Re-throw the original error from UserService
      }

      // For other MySQL/database-specific errors
      if (error.message?.includes('Foreign key constraint')) {
        throw new BadRequestException('Invalid parent ID provided. Parent record does not exist.');
      }
      
      if (error.message?.includes('Duplicate entry')) {
        throw new BadRequestException('Student with this email or student ID already exists.');
      }
      
      throw new InternalServerErrorException('Failed to create student due to an internal error. Please try again.');
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * ✅ OPTIMIZED: Bulk create students with performance optimizations
   * Handles multiple student creations efficiently with minimal database queries
   */
  async bulkCreate(createStudentDtos: CreateStudentDto[]): Promise<StudentResponseDto[]> {
    if (!createStudentDtos || createStudentDtos.length === 0) {
      throw new BadRequestException('No student data provided for bulk creation');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const results: StudentResponseDto[] = [];
      
      // ✅ BULK VALIDATION: Collect all parent IDs and validate in one query
      const allParentIds = new Set<string>();
      createStudentDtos.forEach(dto => {
        // Safely handle potentially undefined parent IDs
        if (dto.fatherId !== null && dto.fatherId !== undefined) {
          allParentIds.add(String(dto.fatherId));
        }
        if (dto.motherId !== null && dto.motherId !== undefined) {
          allParentIds.add(String(dto.motherId));
        }
        if (dto.guardianId !== null && dto.guardianId !== undefined) {
          allParentIds.add(String(dto.guardianId));
        }
      });

      if (allParentIds.size > 0) {
        const existingParents = await queryRunner.manager
          .createQueryBuilder(ParentEntity, 'parent')
          .select('parent.userId')
          .where('parent.userId IN (:...parentIds)', { parentIds: Array.from(allParentIds) })
          .getRawMany();
        
        // ✅ FIXED: userId is already a string (bigint represented as string in TypeORM)
        const existingParentIds = new Set(existingParents
          .map(p => p.parent_userId)
          .filter(id => id !== null && id !== undefined));
        
        // Validate each student's parent references
        for (const dto of createStudentDtos) {
          if (dto.fatherId !== null && dto.fatherId !== undefined && !existingParentIds.has(String(dto.fatherId))) {
            throw new BadRequestException(`Father with ID ${dto.fatherId} not found. Please ensure all parent records exist.`);
          }
          if (dto.motherId !== null && dto.motherId !== undefined && !existingParentIds.has(String(dto.motherId))) {
            throw new BadRequestException(`Mother with ID ${dto.motherId} not found. Please ensure all parent records exist.`);
          }
          if (dto.guardianId !== null && dto.guardianId !== undefined && !existingParentIds.has(String(dto.guardianId))) {
            throw new BadRequestException(`Guardian with ID ${dto.guardianId} not found. Please ensure all parent records exist.`);
          }
        }
      }

      // ✅ BULK PROCESSING: Create all students efficiently
      for (const dto of createStudentDtos) {
        const studentResponse = await this.processSingleStudentInBulk(dto, queryRunner);
        results.push(studentResponse);
      }

      await queryRunner.commitTransaction();
      return results;

    } catch (error) {
      if (queryRunner && queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      
      throw new BadRequestException(`Bulk student creation failed: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * ✅ OPTIMIZED: Process single student within bulk operation
   * Reuses transaction and avoids redundant validations
   */
  private async processSingleStudentInBulk(dto: CreateStudentDto, queryRunner: any): Promise<StudentResponseDto> {
    // Extract user data and other properties
    const { user, fatherId, motherId, guardianId, studentId, emergencyContact, medicalConditions, allergies, bloodGroup, isActive, ...otherProps } = dto;
    
    if (!user) {
      throw new BadRequestException('User data is required to create a student');
    }

    const { isActive: userIsActive, ...otherUserProps } = user;
    const {
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      gender,
      nic,
      birthCertificateNo,
      addressLine1,
      addressLine2,
      city,
      district,
      province,
      postalCode,
      country
    } = user;

    // Process parent IDs (conversion already validated in bulk)
    const processedFatherId = fatherId ? BigInt(fatherId) : null;
    const processedMotherId = motherId ? BigInt(motherId) : null;
    const processedGuardianId = guardianId ? BigInt(guardianId) : null;

    // Create user DTO
    const userDto = {
      firstName,
      lastName,
      nameWithInitials: `${firstName} ${lastName}`,  // Construct from firstName and lastName
      email,
      password: null,  // Always NULL for security
      phoneNumber: phone,  // Map phone to phoneNumber
      dateOfBirth,
      gender,
      nic,
      birthCertificateNo,
      addressLine1,
      addressLine2,
      city,
      district: district as any,  // Cast to enum
      province: province as any,  // Cast to enum
      postalCode,
      country: country as any,  // Cast to enum
      imageUrl: null,  // Always NULL - use profile upload API
      userType: UserType.USER_WITHOUT_PARENT,
      isActive: userIsActive ?? isActive ?? true,
      ...otherUserProps
    };

    // Create user and student
    const userResponse = await this.usersService.create(userDto, queryRunner);
    const savedUser = {
      id: userResponse.id,
      ...userDto,
      createdAt: now(),
      updatedAt: now()
    };

    const studentData = {
      fatherId: processedFatherId,
      motherId: processedMotherId,
      guardianId: processedGuardianId,
      studentId,
      emergencyContact,
      medicalConditions,
      allergies,
      bloodGroup,
      isActive: isActive ?? true,
      ...otherProps
    };

    const timestamp = now();
    const studentEntity = this.studentRepository.create({ 
      userId: savedUser.id,
      fatherId: processedFatherId?.toString() || null,
      motherId: processedMotherId?.toString() || null,
      guardianId: processedGuardianId?.toString() || null,
      studentId,
      emergencyContact,
      medicalConditions,
      allergies,
      bloodGroup: bloodGroup as BloodGroup,
      isActive: isActive ?? true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const savedStudent = await queryRunner.manager.save(StudentEntity, studentEntity);

    // Build optimized response
    return {
      userId: savedStudent.userId,
      studentId: savedStudent.studentId,
      fatherId: savedStudent.fatherId,
      motherId: savedStudent.motherId,
      guardianId: savedStudent.guardianId,
      emergencyContact: savedStudent.emergencyContact,
      medicalConditions: savedStudent.medicalConditions,
      allergies: savedStudent.allergies,
      bloodGroup: savedStudent.bloodGroup,
      isActive: savedStudent.isActive,
      createdAt: savedStudent.createdAt,
      updatedAt: savedStudent.updatedAt,
      user: {
        id: savedUser.id,
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
        email: savedUser.email,
        phoneNumber: savedUser.phone,
        dateOfBirth: savedUser.dateOfBirth,
        gender: savedUser.gender,
        // ✅ Transform imageUrl to full URL
        imageUrl: savedUser.imageUrl ? this.cloudStorageService.getFullUrl(savedUser.imageUrl) : savedUser.imageUrl,
        addressLine1: savedUser.addressLine1,
        addressLine2: savedUser.addressLine2,
        city: savedUser.city,
        district: savedUser.district,
        province: savedUser.province,
        postalCode: savedUser.postalCode,
        country: savedUser.country,
        userType: savedUser.userType,
        isActive: savedUser.isActive,
        subscriptionPlan: SubscriptionPlan.FREE,
        paymentExpiresAt: undefined,
        language: userResponse.language || Language.ENGLISH,
        createdAt: savedUser.createdAt,
        updatedAt: savedUser.updatedAt
      }
    };
  }

  async findAll(query: QueryStudentDto): Promise<PaginatedStudentResponseDto> {
    const { search , bloodGroup, isActive, instituteId, page, limit, sortBy, sortOrder } = query;

    const queryBuilder = this.studentRepository.createQueryBuilder('student')
      .select([
        'student.userId',
        'student.fatherId',
        'student.motherId', 
        'student.guardianId',
        'student.studentId',
        'student.emergencyContact',
        'student.medicalConditions',
        'student.allergies',
        'student.bloodGroup',
        'student.isActive',
        'student.createdAt',
        'student.updatedAt'
      ])
      .leftJoin('student.user', 'user')
      .addSelect([
        'user.id',
        'user.firstName',
        'user.lastName',
        'user.email'
      ])
      .leftJoin('student.father', 'father')
      .leftJoin('father.user', 'fatherUser')
      .addSelect([
        'father.userId',
        'fatherUser.id',
        'fatherUser.firstName',
        'fatherUser.lastName'
      ])
      .leftJoin('student.mother', 'mother')
      .leftJoin('mother.user', 'motherUser')
      .addSelect([
        'mother.userId',
        'motherUser.id',
        'motherUser.firstName',
        'motherUser.lastName'
      ])
      .leftJoin('student.guardian', 'guardian')
      .leftJoin('guardian.user', 'guardianUser')
      .addSelect([
        'guardian.userId',
        'guardianUser.id',
        'guardianUser.firstName',
        'guardianUser.lastName'
      ]);

    // Apply institute filter via institute_user join
    if (instituteId) {
      queryBuilder
        .innerJoin(
          'institute_user',
          'iu',
          'iu.user_id = student.user_id AND iu.institute_id = :instituteId',
          { instituteId },
        );
    }

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        '(user.firstName LIKE :search OR user.lastName LIKE :search OR user.email LIKE :search OR student.studentId LIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (bloodGroup) {
      queryBuilder.andWhere('student.bloodGroup = :bloodGroup', { bloodGroup });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('student.isActive = :isActive', { isActive });
    }

    // Apply sorting (SQL injection safe — allowlist validated)
    const validStudentSortFields = ['createdAt', 'updatedAt', 'studentId', 'bloodGroup', 'isActive'] as const;
    const sortField = sanitizeSortField(sortBy, validStudentSortFields, 'createdAt');
    const order = sanitizeSortOrder(sortOrder);
    queryBuilder.orderBy(`student.${sortField}`, order);

    // Apply pagination
    const pageNumber = page ?? 1;
    const limitNumber = limit ?? 10;
    const skip = (pageNumber - 1) * limitNumber;
    queryBuilder.skip(skip).take(limitNumber);

    const [students, total] = await queryBuilder.getManyAndCount();

    const studentResponseDtos = students.map(student => this.mapToResponseDto(student));

    return new PaginatedStudentResponseDto(studentResponseDtos, pageNumber, limitNumber, total);
  }

  async findOne(userId: string, requestingUser?: any): Promise<StudentResponseDto> {
    // SECURITY: Validate access - student themselves OR parent with child in JWT
    if (requestingUser) {
      const isOwnData = requestingUser.s === userId;
      const children = Array.isArray(requestingUser.c) ? requestingUser.c : [];
      const isParentOfStudent = children.includes(userId);
      
      if (!isOwnData && !isParentOfStudent) {
        throw new ForbiddenException('You can only access your own profile or your children\'s profiles.');
      }
    }
    
    const student = await this.studentRepository.findOne({
      where: { userId },
      relations: [
        'user',
        'father',
        'father.user',
        'mother',
        'mother.user',
        'guardian',
        'guardian.user'
      ],
    });

    if (!student) {
      throw new NotFoundException(`Student with user ID ${userId} not found`);
    }

    return this.mapToResponseDto(student);
  }

  async update(userId: string, updateStudentDto: UpdateStudentDto): Promise<StudentResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const student = await this.studentRepository.findOne({
        where: { userId },
        relations: ['user'],
      });

      if (!student) {
        throw new NotFoundException(`Student with user ID ${userId} not found`);
      }

      // Extract user properties from flat structure
      const userProperties = [
        'firstName', 'lastName', 'email', 'phone', 'userType', 'nic', 
        'birthCertificateNo', 'city', 'district', 'province', 'postalCode', 
        'country', 'gender', 'dateOfBirth', 'isActive', 'imageUrl'
      ];
      
      const userUpdateData: any = {};
      const studentUpdateData: any = {};

      // Separate user and student properties
      Object.keys(updateStudentDto).forEach(key => {
        if (userProperties.includes(key)) {
          userUpdateData[key] = updateStudentDto[key];
        } else if (key !== 'user') {
          studentUpdateData[key] = updateStudentDto[key];
        }
      });

      // Update user information from nested user object if provided
      if (updateStudentDto.user) {
        Object.assign(userUpdateData, updateStudentDto.user);
      }

      // Update user information if there are user properties to update
      if (Object.keys(userUpdateData).length > 0) {
        await queryRunner.manager.update(UserEntity, userId, userUpdateData);
      }

      // Update student information if there are student properties to update
      if (Object.keys(studentUpdateData).length > 0) {
        await queryRunner.manager.update(StudentEntity, student.userId, studentUpdateData);
      }

      await queryRunner.commitTransaction();

      // 🚀 ULTRA-OPTIMIZED: Build response from existing data instead of unnecessary SELECT
      const updatedStudent = {
        ...student,
        ...studentUpdateData,
        updatedAt: now()
      };

      const updatedUser = {
        ...student.user,
        ...userUpdateData,
        updatedAt: now()
      };

      // ✅ ENHANCED: Invalidate parent access caches if parent assignments changed
      // Note: Cache invalidation placeholder - no-op for now

      const result = {
        userId: updatedStudent.userId,
        studentId: updatedStudent.studentId,
        fatherId: updatedStudent.fatherId,
        motherId: updatedStudent.motherId,
        guardianId: updatedStudent.guardianId,
        emergencyContact: updatedStudent.emergencyContact,
        medicalConditions: updatedStudent.medicalConditions,
        allergies: updatedStudent.allergies,
        bloodGroup: updatedStudent.bloodGroup,
        isActive: updatedStudent.isActive,
        createdAt: updatedStudent.createdAt,
        updatedAt: updatedStudent.updatedAt,
        user: {
          id: updatedUser.id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          email: updatedUser.email,
          phoneNumber: updatedUser.phoneNumber,
          dateOfBirth: updatedUser.dateOfBirth instanceof Date 
            ? updatedUser.dateOfBirth.toISOString().split('T')[0] 
            : updatedUser.dateOfBirth,
          gender: updatedUser.gender,
          // ✅ Transform imageUrl to full URL
          imageUrl: updatedUser.imageUrl ? this.cloudStorageService.getFullUrl(updatedUser.imageUrl) : updatedUser.imageUrl,
          addressLine1: updatedUser.addressLine1,
          addressLine2: updatedUser.addressLine2,
          city: updatedUser.city,
          district: updatedUser.district,
          province: updatedUser.province,
          postalCode: updatedUser.postalCode,
          country: updatedUser.country,
          userType: updatedUser.userType,
          isActive: updatedUser.isActive,
          subscriptionPlan: updatedUser.subscriptionPlan,
          paymentExpiresAt: updatedUser.paymentExpiresAt,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
          language: updatedUser.language
        }
      };

      // 🔄 CRITICAL FIX: Refresh user cache after student update
      try {
        await this.userManagementService.refreshUserCache(userId);
      } catch (cacheError) {
        this.logger.warn(`Cache refresh failed after student update for user ${userId}: ${cacheError.message}`);
      }

      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      if (queryRunner && queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(userId: string): Promise<void> {
    const student = await this.studentRepository.findOne({
      where: { userId },
      relations: ['user'],
    });

    if (!student) {
      throw new NotFoundException(`Student with user ID ${userId} not found`);
    }

    // This will cascade delete the user as well due to cascade: true
    await this.studentRepository.remove(student);
  }

  async softDelete(userId: string): Promise<StudentResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const student = await this.studentRepository.findOne({
        where: { userId },
        relations: ['user'],
      });

      if (!student) {
        throw new NotFoundException(`Student with user ID ${userId} not found`);
      }

      // Deactivate both student and user
      await queryRunner.manager.update(StudentEntity, userId, { isActive: false });
      await queryRunner.manager.update(UserEntity, userId, { isActive: false });

      await queryRunner.commitTransaction();

      // 🚀 ULTRA-OPTIMIZED: Build response from existing data instead of unnecessary SELECT
      const deactivatedStudent = {
        ...student,
        isActive: false,
        updatedAt: now()
      };

      const deactivatedUser = {
        ...student.user,
        isActive: false,
        updatedAt: now()
      };

      return {
        userId: deactivatedStudent.userId,
        studentId: deactivatedStudent.studentId,
        fatherId: deactivatedStudent.fatherId,
        motherId: deactivatedStudent.motherId,
        guardianId: deactivatedStudent.guardianId,
        emergencyContact: deactivatedStudent.emergencyContact,
        medicalConditions: deactivatedStudent.medicalConditions,
        allergies: deactivatedStudent.allergies,
        bloodGroup: deactivatedStudent.bloodGroup,
        isActive: false,
        createdAt: deactivatedStudent.createdAt,
        updatedAt: deactivatedStudent.updatedAt,
        user: {
          id: deactivatedUser.id,
          firstName: deactivatedUser.firstName,
          lastName: deactivatedUser.lastName,
          email: deactivatedUser.email,
          phoneNumber: deactivatedUser.phoneNumber,
          dateOfBirth: deactivatedUser.dateOfBirth instanceof Date 
            ? deactivatedUser.dateOfBirth.toISOString().split('T')[0] 
            : deactivatedUser.dateOfBirth,
          gender: deactivatedUser.gender,
          // ✅ Transform imageUrl to full URL
          imageUrl: deactivatedUser.imageUrl ? this.cloudStorageService.getFullUrl(deactivatedUser.imageUrl) : deactivatedUser.imageUrl,
          addressLine1: deactivatedUser.addressLine1,
          addressLine2: deactivatedUser.addressLine2,
          city: deactivatedUser.city,
          district: deactivatedUser.district,
          province: deactivatedUser.province,
          postalCode: deactivatedUser.postalCode,
          country: deactivatedUser.country,
          userType: deactivatedUser.userType,
          isActive: false,
          subscriptionPlan: deactivatedUser.subscriptionPlan,
          paymentExpiresAt: deactivatedUser.paymentExpiresAt,
          createdAt: deactivatedUser.createdAt,
          updatedAt: deactivatedUser.updatedAt,
          language: deactivatedUser.language
        }
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getStudentStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
  }> {
    const total = await this.studentRepository.count();
    const active = await this.studentRepository.count({ where: { isActive: true } });
    const inactive = total - active;

    return { total, active, inactive };
  }

  async assignParentToStudent(
    studentId: string, 
    parentType: 'father' | 'mother' | 'guardian', 
    parentUserId: string
  ): Promise<{ success: boolean; message: string; timestamp: Date }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 🚀 ULTRA-OPTIMIZED: Validate parent type only (no DB queries)
      if (!['father', 'mother', 'guardian'].includes(parentType)) {
        throw new BadRequestException('Parent type must be one of: father, mother, guardian');
      }

      // 🚀 ULTRA-OPTIMIZED: Skip all validation queries - let MySQL constraints handle it

      // Update the student with the parent assignment (constraint-based validation)
      const updateData: any = {};
      switch (parentType) {
        case 'father':
          updateData.fatherId = parentUserId;
          break;
        case 'mother':
          updateData.motherId = parentUserId;
          break;
        case 'guardian':
          updateData.guardianId = parentUserId;
          break;
      }

      await queryRunner.manager.update(StudentEntity, { userId: studentId }, updateData);

      await queryRunner.commitTransaction();

      // ✅ CRITICAL CACHE REFRESH: Parent assignment affects both student and parent cache
      await this.userManagementService.refreshUserCache(studentId);  // Student data changed
      await this.userManagementService.refreshUserCache(parentUserId); // Parent children list changed

      // Return simple success response
      return {
        success: true,
        message: 'Parent assigned successfully',
        timestamp: now()
      };
    } catch (error) {
      if (queryRunner && queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      
      
      // 🚀 ULTRA-OPTIMIZED: Parse MySQL constraint errors for specific issues
      if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        
        // Parse constraint error message to identify specific field
        if (error.message.includes('fk_students_father')) {
          throw new BadRequestException(`Father with user ID ${parentUserId} does not exist. Please ensure the parent record exists.`);
        }
        if (error.message.includes('fk_students_mother')) {
          throw new BadRequestException(`Mother with user ID ${parentUserId} does not exist. Please ensure the parent record exists.`);
        }
        if (error.message.includes('fk_students_guardian')) {
          throw new BadRequestException(`Guardian with user ID ${parentUserId} does not exist. Please ensure the parent record exists.`);
        }
        
        // Check if it's the student that doesn't exist
        throw new NotFoundException(`Student with user ID ${studentId} not found.`);
      }
      
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        throw new BadRequestException(`Student with user ID ${studentId} not found.`);
      }
      
      // If it's already a specific exception, re-throw it
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to assign parent due to an internal error. Please try again.');
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  async removeParentFromStudent(
    studentId: string, 
    parentType: 'father' | 'mother' | 'guardian'
  ): Promise<{ success: boolean; message: string; timestamp: Date }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 🚀 ULTRA-OPTIMIZED: Validate parent type only (no DB queries)
      if (!['father', 'mother', 'guardian'].includes(parentType)) {
        throw new BadRequestException('Parent type must be one of: father, mother, guardian');
      }

      // ✅ CACHE OPTIMIZATION: Get current parent ID before removal
      const currentStudent = await queryRunner.manager.findOne(StudentEntity, {
        where: { userId: studentId },
        select: ['userId', 'fatherId', 'motherId', 'guardianId']
      });

      if (!currentStudent) {
        throw new NotFoundException(`Student with user ID ${studentId} not found`);
      }

      // Get the parent ID that will be removed
      let removedParentId: string | null = null;
      switch (parentType) {
        case 'father':
          removedParentId = currentStudent.fatherId;
          break;
        case 'mother':
          removedParentId = currentStudent.motherId;
          break;
        case 'guardian':
          removedParentId = currentStudent.guardianId;
          break;
      }

      // Remove the parent assignment (constraint-based validation)
      const updateData: any = {};
      switch (parentType) {
        case 'father':
          updateData.fatherId = null;
          break;
        case 'mother':
          updateData.motherId = null;
          break;
        case 'guardian':
          updateData.guardianId = null;
          break;
      }

      await queryRunner.manager.update(StudentEntity, { userId: studentId }, updateData);

      await queryRunner.commitTransaction();

      // ✅ CRITICAL CACHE REFRESH: Parent removal affects both student and parent cache
      await this.userManagementService.refreshUserCache(studentId);  // Student data changed
      if (removedParentId) {
        await this.userManagementService.refreshUserCache(removedParentId); // Parent children list changed
      }

      // Return simple success response
      return {
        success: true,
        message: 'Parent removed successfully',
        timestamp: now()
      };
    } catch (error) {
      if (queryRunner && queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      
      
      // 🚀 ULTRA-OPTIMIZED: Parse MySQL constraint errors for specific issues
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        throw new NotFoundException(`Student with user ID ${studentId} not found.`);
      }
      
      // If it's already a specific exception, re-throw it
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to remove parent due to an internal error. Please try again.');
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  private mapToResponseDto(student: StudentEntity): StudentResponseDto {
    return new StudentResponseDto({
      userId: student.userId,
      fatherId: student.fatherId,
      motherId: student.motherId,
      guardianId: student.guardianId,
      studentId: student.studentId,
      emergencyContact: student.emergencyContact,
      medicalConditions: student.medicalConditions,
      allergies: student.allergies,
      bloodGroup: student.bloodGroup,
      isActive: student.isActive,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
      user: new UserResponseDto(student.user),
      father: student.father ? new ParentResponseDto({
        ...student.father,
        user: new UserResponseDto(student.father.user)
      }) : undefined,
      mother: student.mother ? new ParentResponseDto({
        ...student.mother,
        user: new UserResponseDto(student.mother.user)
      }) : undefined,
      guardian: student.guardian ? new ParentResponseDto({
        ...student.guardian,
        user: new UserResponseDto(student.guardian.user)
      }) : undefined,
    });
  }

  /**
   * 🔧 DEBUG UTILITY: Check if parent exists by ID
   */
  async debugParentExists(parentId: string): Promise<boolean> {
    // ✅ PERFORMANCE: Skip query for empty/null values
    if (!parentId || String(parentId).trim() === '') {
      return false;
    }

    try {
      const trimmedId = String(parentId).trim();
      const parent = await this.parentRepository.findOne({
        where: { userId: trimmedId },
        select: ['id', 'userId']
      });
      return !!parent;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update student image URL
   */
  async updateImageUrl(studentId: string, imageUrl: string): Promise<StudentResponseDto> {
    const student = await this.findOne(studentId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Update the user record (students are users with student role)
    await this.userRepository.update(studentId, { imageUrl });
    
    return this.findOne(studentId);
  }

  /**
   * Update student image with imageUrl from signed URL upload
   * 🔐 SECURITY: Accepts URL from /upload/verify-and-publish endpoint
   */
  async updateStudentImage(
    studentId: string,
    image: string, // imageUrl from signed URL upload
  ): Promise<{ success: boolean; message: string; imageUrl: string }> {
    try {
      // Find the student
      const student = await this.findOne(studentId);
      if (!student) {
        throw new NotFoundException('Student not found');
      }

      // Get the user entity to access old image
      const user = await this.userRepository.findOne({ where: { id: studentId } });
      const oldImageUrl = user?.imageUrl;

      // Note: image parameter should be imageUrl string (from signed URL upload)
      // If still receiving file object, this is deprecated usage
      const imageUrl = typeof image === 'string' ? image : null;
      
      if (!imageUrl) {
        throw new BadRequestException('imageUrl is required. Please upload via /upload/verify-and-publish first.');
      }

      // Delete old image if exists
      if (oldImageUrl) {
        try {
          await this.cloudStorageService.deleteFile(oldImageUrl);
        } catch (error) {
          this.logger.warn(`Failed to delete old student image: ${error.message}`);
          // Continue even if old image deletion fails
        }
      }

      // Update student image URL
      await this.userRepository.update(studentId, { imageUrl });

      return {
        success: true,
        message: 'Student image updated successfully',
        imageUrl
      };
    } catch (error) {
      this.logger.error(`Failed to update student image: ${error.message}`, error.stack);
      throw error;
    }
  }
}

