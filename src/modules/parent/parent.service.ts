// NestJS Core
import { Injectable, NotFoundException, ConflictException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

// Entities
import { ParentEntity } from './entities/parent.entity';
import { UserEntity } from '../user/entities/user.entity';

// Services
import { UsersService } from '../user/user.service';
import { CloudStorageService } from '../../common/services/cloud-storage.service';

// DTOs
import { CreateParentDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';
import { QueryParentDto } from './dto/query-parent.dto';
import { ParentResponseDto } from './dto/parent-response.dto';
import { PaginatedParentResponseDto } from './dto/paginated-parent-response.dto';
import { ParentChildrenResponseDto, ChildInfoDto } from './dto/parent-children-response.dto';
import { UserResponseDto } from '../user/dto/user-response.dto';

// Enums
import { UserType } from '../user/enums/user-type.enum';
import { SubscriptionPlan } from '../user/enums/subscription-plan.enum';
import { Language } from '../user/enums/language.enum';

// Utils & Exceptions
import { BusinessLogicException } from '../../common/exceptions/custom.exceptions';
import { sanitizeSortField, sanitizeSortOrder } from '@common/utils/query-sanitizer.util';

@Injectable()
export class ParentsService {
  constructor(
    @InjectRepository(ParentEntity)
    private readonly parentRepository: Repository<ParentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  async create(createParentDto: CreateParentDto): Promise<ParentResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate that user data is provided
      if (!createParentDto.user) {
        throw new BadRequestException('User data is required to create a parent');
      }

      // Set user type to PARENT and enforce NULL fields
      createParentDto.user.userType = UserType.USER_WITHOUT_STUDENT;
      
      // Import enums for validation
      const { District } = await import('../user/enums/district.enum');
      const { Province } = await import('../user/enums/province.enum');
      const { Country } = await import('../user/enums/country.enum');

      // ✅ ENFORCE NULL: Always ensure password and imageUrl are NULL for security
      const userDataWithNullFields: any = {
        ...createParentDto.user,
        password: null,     // Always NULL for security
        imageUrl: null,     // Always NULL - use profile upload API
        userType: UserType.USER_WITHOUT_STUDENT,  // Ensure userType is set
      };

      // Convert string types to enums if provided and valid
      if (createParentDto.user.district && Object.values(District).includes(createParentDto.user.district as any)) {
        userDataWithNullFields.district = createParentDto.user.district as any;
      }
      if (createParentDto.user.province && Object.values(Province).includes(createParentDto.user.province as any)) {
        userDataWithNullFields.province = createParentDto.user.province as any;
      }
      if (createParentDto.user.country && Object.values(Country).includes(createParentDto.user.country as any)) {
        userDataWithNullFields.country = createParentDto.user.country as any;
      }

      // ✅ OPTIMIZED: Create user using UsersService which handles date parsing and validation
      const userResponse = await this.usersService.create(userDataWithNullFields, queryRunner);
      
      // ✅ OPTIMIZED: Use userResponse directly instead of redundant database query
      const savedUser = {
        id: userResponse.id,
        ...userDataWithNullFields,
        createdAt: new Date(), // real UTC
        updatedAt: new Date()  // real UTC
      };

      // Create parent with user relation
      const { user, ...parentData } = createParentDto;
      const timestamp = new Date();
      const parentEntity = this.parentRepository.create({ 
        ...parentData, 
        userId: savedUser.id,
        user: savedUser,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const savedParent = await queryRunner.manager.save(ParentEntity, parentEntity);

      await queryRunner.commitTransaction();

      // ✅ OPTIMIZED: Build response directly from created entities to avoid additional query
      const parentResponse: ParentResponseDto = {
        userId: savedParent.userId,
        occupation: savedParent.occupation,
        workplace: savedParent.workplace,
        workPhone: savedParent.workPhone,
        educationLevel: savedParent.educationLevel,
        isActive: savedParent.isActive,
        createdAt: savedParent.createdAt,
        updatedAt: savedParent.updatedAt,
        user: {
          id: savedUser.id,
          firstName: savedUser.firstName,
          lastName: savedUser.lastName,
          email: savedUser.email,
          phoneNumber: savedUser.phone,
          dateOfBirth: savedUser.dateOfBirth,
          gender: savedUser.gender,
          imageUrl: null,  // Always NULL for new users
          addressLine1: savedUser.addressLine1,
          addressLine2: savedUser.addressLine2,
          city: savedUser.city,
          district: savedUser.district,
          province: savedUser.province,
          postalCode: savedUser.postalCode,
          country: savedUser.country,
          userType: savedUser.userType,
          isActive: savedUser.isActive,
          subscriptionPlan: SubscriptionPlan.FREE, // Default subscription plan for new users
          paymentExpiresAt: undefined,
          language: savedUser.language || Language.ENGLISH,
          createdAt: savedUser.createdAt,
          updatedAt: savedUser.updatedAt
        }
      };

      return parentResponse;
    } catch (error) {
      if (queryRunner && queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      
      
      // 🚀 ULTRA-OPTIMIZED: Parse MySQL constraint errors for specific issues
      if (error.code === 'ER_DUP_ENTRY') {
        
        if (error.message.includes('PRIMARY')) {
          throw new ConflictException('Parent already exists for this user.');
        }
        if (error.message.includes('email_user_type')) {
          throw new ConflictException('Email already exists for this user type.');
        }
        
        // Generic duplicate error
        throw new ConflictException('Parent record already exists with provided information.');
      }
      
      if (error.code === 'ER_NO_REFERENCED_ROW_2') {
        
        if (error.message.includes('fk_parents_user')) {
          throw new BadRequestException('User ID does not exist. Please ensure the user exists before creating parent.');
        }
        
        // Generic foreign key error
        throw new BadRequestException('Invalid reference: Referenced user does not exist.');
      }
      
      // If it's already a specific exception, re-throw it
      if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof BusinessLogicException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to create parent due to an internal error. Please try again.');
    } finally {
      if (queryRunner) {
        await queryRunner.release();
      }
    }
  }

  /**
   * ✅ OPTIMIZED: Bulk create parents with performance optimizations
   * Handles multiple parent creations efficiently with minimal database queries
   */
  async bulkCreate(createParentDtos: CreateParentDto[]): Promise<ParentResponseDto[]> {
    if (!createParentDtos || createParentDtos.length === 0) {
      throw new BadRequestException('No parent data provided for bulk creation');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const results: ParentResponseDto[] = [];
      
      // ✅ BULK PROCESSING: Create all parents efficiently
      for (const dto of createParentDtos) {
        const parentResponse = await this.processSingleParentInBulk(dto, queryRunner);
        results.push(parentResponse);
      }

      await queryRunner.commitTransaction();
      return results;

    } catch (error) {
      if (queryRunner && queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      
      throw new BadRequestException(`Bulk parent creation failed: ${error.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * ✅ OPTIMIZED: Process single parent within bulk operation
   * Reuses transaction and avoids redundant operations
   */
  private async processSingleParentInBulk(createParentDto: CreateParentDto, queryRunner: any): Promise<ParentResponseDto> {
    // Validate that user data is provided
    if (!createParentDto.user) {
      throw new BadRequestException('User data is required to create a parent');
    }

    // Import enums for validation
    const { District } = await import('../user/enums/district.enum');
    const { Province } = await import('../user/enums/province.enum');
    const { Country } = await import('../user/enums/country.enum');

    // Set user type to PARENT and enforce NULL fields
    const userDataWithNullFields: any = {
      ...createParentDto.user,
      password: null,     // Always NULL for security
      imageUrl: null,     // Always NULL - use profile upload API
      userType: UserType.USER_WITHOUT_STUDENT  // Ensure userType is set
    };

    // Convert string types to enums if provided and valid
    if (createParentDto.user.district && Object.values(District).includes(createParentDto.user.district as any)) {
      userDataWithNullFields.district = createParentDto.user.district as any;
    }
    if (createParentDto.user.province && Object.values(Province).includes(createParentDto.user.province as any)) {
      userDataWithNullFields.province = createParentDto.user.province as any;
    }
    if (createParentDto.user.country && Object.values(Country).includes(createParentDto.user.country as any)) {
      userDataWithNullFields.country = createParentDto.user.country as any;
    }

    // Create user
    const userResponse = await this.usersService.create(userDataWithNullFields, queryRunner);
    const savedUser = {
      id: userResponse.id,
      ...userDataWithNullFields,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create parent
    const { user, ...parentData } = createParentDto;
    const timestamp = new Date();
    const parentEntity = this.parentRepository.create({ 
      ...parentData, 
      userId: savedUser.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const savedParent = await queryRunner.manager.save(ParentEntity, parentEntity);

    // Build optimized response
    return {
      userId: savedParent.userId,
      occupation: savedParent.occupation,
      workplace: savedParent.workplace,
      workPhone: savedParent.workPhone,
      educationLevel: savedParent.educationLevel,
      isActive: savedParent.isActive,
      createdAt: savedParent.createdAt,
      updatedAt: savedParent.updatedAt,
      user: {
        id: savedUser.id,
        firstName: savedUser.firstName,
        lastName: savedUser.lastName,
        email: savedUser.email,
        phoneNumber: savedUser.phone,
        dateOfBirth: savedUser.dateOfBirth,
        gender: savedUser.gender,
        imageUrl: null,  // Always NULL for new users
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
        language: savedUser.language || Language.ENGLISH,
        createdAt: savedUser.createdAt,
        updatedAt: savedUser.updatedAt
      }
    };
  }

  async findAll(query: QueryParentDto): Promise<PaginatedParentResponseDto> {
    const { search, occupation, workplace, educationLevel, isActive, page, limit, sortBy, sortOrder } = query;

    const queryBuilder = this.parentRepository.createQueryBuilder('parent')
      .select([
        'parent.id',
        'parent.userId',
        'parent.occupation',
        'parent.workplace',
        'parent.educationLevel',
        'parent.isActive',
        'parent.createdAt',
        'parent.updatedAt'
      ])
      .leftJoin('parent.user', 'user')
      .addSelect([
        'user.id',
        'user.firstName',
        'user.lastName',
        'user.email',
        'user.phoneNumber'
      ]);

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        '(user.firstName LIKE :search OR user.lastName LIKE :search OR user.email LIKE :search OR parent.occupation LIKE :search OR parent.workplace LIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (occupation) {
      queryBuilder.andWhere('parent.occupation LIKE :occupation', { occupation: `%${occupation}%` });
    }

    if (workplace) {
      queryBuilder.andWhere('parent.workplace LIKE :workplace', { workplace: `%${workplace}%` });
    }

    if (educationLevel) {
      queryBuilder.andWhere('parent.educationLevel = :educationLevel', { educationLevel });
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere('parent.isActive = :isActive', { isActive });
    }

    // Apply sorting (SQL injection safe — allowlist validated)
    const validParentSortFields = ['createdAt', 'updatedAt', 'firstName', 'lastName', 'email', 'phoneNumber', 'occupation', 'workplace', 'educationLevel'] as const;
    const sortField = sanitizeSortField(sortBy, validParentSortFields, 'createdAt');
    const order = sanitizeSortOrder(sortOrder);
    queryBuilder.orderBy(`parent.${sortField}`, order);

    // Apply pagination
    const pageNumber = page ?? 1;
    const limitNumber = limit ?? 10;
    const skip = (pageNumber - 1) * limitNumber;
    queryBuilder.skip(skip).take(limitNumber);

    const [parents, total] = await queryBuilder.getManyAndCount();

    const parentResponseDtos = parents.map(parent => this.mapToResponseDto(parent));

    return new PaginatedParentResponseDto(parentResponseDtos, pageNumber, limitNumber, total);
  }

  async findOne(userId: string): Promise<ParentResponseDto | null> {
    const parent = await this.parentRepository
      .createQueryBuilder('parent')
      .select([
        'parent.userId',
        'parent.occupation',
        'parent.workplace',
        'parent.workPhone',
        'parent.educationLevel',
        'parent.isActive',
        'parent.createdAt',
        'parent.updatedAt'
      ])
      .leftJoin('parent.user', 'user')
      .addSelect([
        'user.id',
        'user.firstName',
        'user.lastName',
        'user.email',
        'user.phoneNumber',
        'user.userType',
        'user.dateOfBirth',
        'user.gender',
        'user.addressLine1',
        'user.addressLine2',
        'user.city',
        'user.district',
        'user.province',
        'user.postalCode',
        'user.country',
        'user.isActive',
        'user.createdAt',
        'user.updatedAt',
        'user.imageUrl'
      ])
      .where('parent.userId = :userId', { userId })
      .getOne();

    if (!parent) {
      return null;
    }

    return this.mapToResponseDto(parent);
  }

  async update(userId: string, updateParentDto: UpdateParentDto): Promise<ParentResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const parent = await this.parentRepository.findOne({
        where: { userId },
        relations: ['user'],
      });

      if (!parent) {
        throw new NotFoundException(`Parent with user ID ${userId} not found`);
      }

      // Update user information if provided
      if (updateParentDto.user) {
        await queryRunner.manager.update(UserEntity, userId, updateParentDto.user);
      }

      // Update parent information
      const parentUpdateData = { ...updateParentDto };
      delete parentUpdateData.user;

      if (Object.keys(parentUpdateData).length > 0) {
        await queryRunner.manager.update(ParentEntity, userId, parentUpdateData);
      }

      await queryRunner.commitTransaction();

      // 🚀 ULTRA-OPTIMIZED: Build response from existing data instead of unnecessary SELECT
      // Create updated parent with current data + updates
      const updatedParentEntity = Object.assign({}, parent, parentUpdateData, { updatedAt: new Date() });
      
      // Update user entity if user data was provided
      if (updateParentDto.user) {
        Object.assign(updatedParentEntity.user, updateParentDto.user, { updatedAt: new Date() });
      }

      return this.mapToResponseDto(updatedParentEntity);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async remove(userId: string): Promise<void> {
    const parent = await this.parentRepository.findOne({
      where: { userId },
      relations: ['user'],
    });

    if (!parent) {
      throw new NotFoundException(`Parent with user ID ${userId} not found`);
    }

    await this.parentRepository.remove(parent);
  }

  async softDelete(userId: string): Promise<ParentResponseDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const parent = await this.parentRepository.findOne({
        where: { userId },
        relations: ['user'],
      });

      if (!parent) {
        throw new NotFoundException(`Parent with user ID ${userId} not found`);
      }

      await queryRunner.manager.update(ParentEntity, userId, { isActive: false });
      await queryRunner.manager.update(UserEntity, userId, { isActive: false });

      await queryRunner.commitTransaction();

      // 🚀 ULTRA-OPTIMIZED: Build response from existing data instead of unnecessary SELECT
      const deactivatedParent = Object.assign({}, parent, { 
        isActive: false, 
        updatedAt: new Date() 
      });
      
      // Update user active status
      Object.assign(deactivatedParent.user, { 
        isActive: false, 
        updatedAt: new Date() 
      });

      return this.mapToResponseDto(deactivatedParent);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findParentChildren(userId: string): Promise<ParentChildrenResponseDto> {
    const parent = await this.parentRepository
      .createQueryBuilder('parent')
      .select(['parent.userId'])
      .leftJoin('parent.user', 'user')
      .addSelect(['user.id', 'user.firstName', 'user.lastName', 'user.nameWithInitials', 'user.email', 'user.imageUrl'])
      .leftJoin('parent.childrenAsFather', 'childrenAsFather')
      .addSelect(['childrenAsFather.userId'])
      .leftJoin('childrenAsFather.user', 'childrenAsFatherUser')
      .addSelect([
        'childrenAsFatherUser.id', 
        'childrenAsFatherUser.firstName', 
        'childrenAsFatherUser.lastName',
        'childrenAsFatherUser.nameWithInitials',
        'childrenAsFatherUser.phoneNumber',
        'childrenAsFatherUser.email',
        'childrenAsFatherUser.imageUrl'
      ])
      .leftJoin('parent.childrenAsMother', 'childrenAsMother')
      .addSelect(['childrenAsMother.userId'])
      .leftJoin('childrenAsMother.user', 'childrenAsMotherUser')
      .addSelect([
        'childrenAsMotherUser.id', 
        'childrenAsMotherUser.firstName', 
        'childrenAsMotherUser.lastName',
        'childrenAsMotherUser.nameWithInitials',
        'childrenAsMotherUser.phoneNumber',
        'childrenAsMotherUser.email',
        'childrenAsMotherUser.imageUrl'
      ])
      .leftJoin('parent.childrenAsGuardian', 'childrenAsGuardian')
      .addSelect(['childrenAsGuardian.userId'])
      .leftJoin('childrenAsGuardian.user', 'childrenAsGuardianUser')
      .addSelect([
        'childrenAsGuardianUser.id', 
        'childrenAsGuardianUser.firstName', 
        'childrenAsGuardianUser.lastName', 
        'childrenAsGuardianUser.phoneNumber',
        'childrenAsGuardianUser.email',
        'childrenAsGuardianUser.imageUrl'
      ])
      .where('parent.userId = :userId', { userId })
      .getOne();

    if (!parent) {
      return new ParentChildrenResponseDto({ parentId: userId, parentName: '', children: [] });
    }

    // Helper function to map children to simplified format with URL transformation
    const mapChildrenToSimplified = (children: any[], relationship: string): ChildInfoDto[] => {
      return children.map(child => {
        const user = child.user;
        return new ChildInfoDto({
          id: child.userId,
          name: user ? `${user.firstName} ${user.lastName}`.trim() : '',
          nameWithInitials: user?.nameWithInitials || undefined,
          phoneNumber: user?.phoneNumber || '',
          email: user?.email || '',
          // ✅ Use cloudStorageService to transform relative URLs to full URLs
          imageUrl: user?.imageUrl ? this.cloudStorageService.getFullUrl(user.imageUrl) : null,
          relationship: relationship
        });
      });
    };

    // Combine all children with their relationships
    const allChildren = [
      ...mapChildrenToSimplified(parent.childrenAsFather || [], 'father'),
      ...mapChildrenToSimplified(parent.childrenAsMother || [], 'mother'),
      ...mapChildrenToSimplified(parent.childrenAsGuardian || [], 'guardian'),
    ];

    return new ParentChildrenResponseDto({
      parentId: parent.userId,
      parentName: parent.user ? `${parent.user.firstName} ${parent.user.lastName}`.trim() : '',
      children: allChildren
    });
  }

  private mapToResponseDto(parent: ParentEntity): ParentResponseDto {
    return new ParentResponseDto({
      userId: parent.userId,
      occupation: parent.occupation,
      workplace: parent.workplace,
      workPhone: parent.workPhone,
      educationLevel: parent.educationLevel,
      isActive: parent.isActive,
      createdAt: parent.createdAt,
      updatedAt: parent.updatedAt,
      user: new UserResponseDto(parent.user),
    });
  }

  /**
   * Get storage base URL from environment configuration
   * Supports Google Cloud Storage, AWS S3, and local storage
   */
  private getStorageBaseUrl(): string {
    const provider = this.configService.get<string>('STORAGE_PROVIDER', 'google')?.toLowerCase();
    
    switch (provider) {
      case 'google':
      case 'gcs':
        const bucket = this.configService.get<string>('GCS_BUCKET_NAME') || 
                      this.configService.get<string>('GOOGLE_STORAGE_BUCKET');
        return `https://storage.googleapis.com/${bucket}`;
        
      case 'aws':
      case 's3':
        const awsBucket = this.configService.get<string>('AWS_S3_BUCKET');
        const region = this.configService.get<string>('AWS_REGION', 'us-east-1');
        return `https://${awsBucket}.s3.${region}.amazonaws.com`;
        
      case 'local':
        return this.configService.get<string>('LOCAL_STORAGE_BASE_URL', 'http://localhost:3000/uploads');
        
      default:
        // Fallback to Google
        const fallbackBucket = this.configService.get<string>('GCS_BUCKET_NAME') || 
                              this.configService.get<string>('GOOGLE_STORAGE_BUCKET');
        return `https://storage.googleapis.com/${fallbackBucket}`;
    }
  }
}
