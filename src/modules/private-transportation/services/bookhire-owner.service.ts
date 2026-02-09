import { Injectable, ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookhireOwnerEntity } from '../entities/bookhire-owner.entity';
import { 
  CreateBookhireOwnerDto, 
  UpdateBookhireOwnerDto, 
  BookhireOwnerLoginDto, 
  ChangeBookhireOwnerPasswordDto,
  BookhireOwnerResponseDto,
  BookhireOwnerListResponseDto
} from '../dto/bookhire-owner.dto';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../../auth/auth.service';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import { now } from '../../../common/utils/timezone.util';

@Injectable()
export class BookhireOwnerService {
  constructor(
    @InjectRepository(BookhireOwnerEntity)
    private bookhireOwnerRepository: Repository<BookhireOwnerEntity>,
    private authService: AuthService,
    private jwtService: JwtService,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  async register(createBookhireOwnerDto: CreateBookhireOwnerDto): Promise<{ owner: any; token: string }> {
    // Check if email already exists - Optimized field selection
    const existingOwner = await this.bookhireOwnerRepository.findOne({ 
      where: { email: createBookhireOwnerDto.email.toLowerCase() },
      select: ['id', 'email'] // Only need ID and email for validation
    });
    
    if (existingOwner) {
      throw new ConflictException('Email already registered');
    }

    // Check if contact number already exists - Optimized field selection
    const existingContact = await this.bookhireOwnerRepository.findOne({ 
      where: { phone: createBookhireOwnerDto.phoneNumber },
      select: ['id', 'phone'] // Only need ID and phone for validation
    });
    
    if (existingContact) {
      throw new ConflictException('Contact number already registered');
    }

    // Hash password
    const hashedPassword = await this.authService.hashPassword(createBookhireOwnerDto.password);

    // Create owner with proper field mapping
    const timestamp = now();
    const owner = this.bookhireOwnerRepository.create({
      name: createBookhireOwnerDto.ownerName, // Map ownerName to name
      phone: createBookhireOwnerDto.phoneNumber, // Map phoneNumber to phone
      email: createBookhireOwnerDto.email.toLowerCase(),
      password: hashedPassword,
      address: createBookhireOwnerDto.address,
      createdAt: timestamp,
      updatedAt: timestamp
      // Note: businessName, city, state, pincode, businessLicense are not in entity
    });

    const savedOwner = await this.bookhireOwnerRepository.save(owner);

    // Generate JWT token
    const payload = { 
      sub: savedOwner.id, 
      email: savedOwner.email,
      type: 'bookhire-owner'
    };
    const token = this.jwtService.sign(payload);

    // Remove password from response
    const ownerObject = { ...savedOwner };
    delete ownerObject.password;

    return { owner: ownerObject, token };
  }

  async login(loginDto: BookhireOwnerLoginDto): Promise<{ owner: any; token: string }> {
    const owner = await this.bookhireOwnerRepository
      .createQueryBuilder('owner')
      .addSelect('owner.password')
      .where('owner.email = :email', { email: loginDto.email.toLowerCase() })
      .andWhere('owner.isActive = :isActive', { isActive: true })
      .getOne();

    if (!owner) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.authService.comparePassword(
      loginDto.password,
      owner.password
    );    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    // lastLogin removed - not in database schema

    // Generate JWT token with owner info
    const payload = { 
      sub: owner.id, 
      email: owner.email,
      type: 'bookhire-owner',
      ownerName: owner.name,
      businessName: owner.name
    };
    const token = this.jwtService.sign(payload);

    // Remove password from response
    const ownerObject = { ...owner };
    delete ownerObject.password;

    return { owner: ownerObject, token };
  }

  async findById(id: string): Promise<BookhireOwnerEntity> {
    const owner = await this.bookhireOwnerRepository.findOne({
      where: { id },
      select: {
        password: false // Exclude password from selection
      }
    });

    if (!owner) {
      throw new NotFoundException('Bookhire owner not found');
    }

    return owner;
  }

  async findByEmail(email: string): Promise<BookhireOwnerEntity> {
    const owner = await this.bookhireOwnerRepository.findOne({
      where: { email: email.toLowerCase() },
      select: {
        password: false // Exclude password from selection
      }
    });

    if (!owner) {
      throw new NotFoundException('Bookhire owner not found');
    }

    return owner;
  }

  async updateProfile(id: string, updateDto: UpdateBookhireOwnerDto): Promise<BookhireOwnerEntity> {
    const owner = await this.findById(id);

    // If phone number is being updated, check for conflicts
    if (updateDto.phoneNumber && updateDto.phoneNumber !== owner.phone) {
      const existingContact = await this.bookhireOwnerRepository.findOne({
        where: { phone: updateDto.phoneNumber }
      });
      
      if (existingContact) {
        throw new ConflictException('Contact number already registered');
      }
    }

    // Map DTO fields to entity fields for update
    const updateData: any = {};
    if (updateDto.ownerName !== undefined) updateData.name = updateDto.ownerName;
    if (updateDto.phoneNumber !== undefined) updateData.phone = updateDto.phoneNumber;
    if (updateDto.businessName !== undefined) {
      // businessName is not in entity, skip or log warning
    }
    if (updateDto.address !== undefined) updateData.address = updateDto.address;
    if (updateDto.profileImageUrl !== undefined) updateData.profileImage = updateDto.profileImageUrl;
    // Skip fields not in entity: city, state, pincode, businessLicense

    // Update the owner with mapped fields
    if (Object.keys(updateData).length > 0) {
      await this.bookhireOwnerRepository.update(id, updateData);
    }

    return this.findById(id);
  }

  async changePassword(id: string, changePasswordDto: ChangeBookhireOwnerPasswordDto): Promise<void> {
    const owner = await this.bookhireOwnerRepository
      .createQueryBuilder('owner')
      .addSelect('owner.password')
      .where('owner.id = :id', { id })
      .getOne();

    if (!owner) {
      throw new NotFoundException('Bookhire owner not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await this.authService.comparePassword(
      changePasswordDto.currentPassword,
      owner.password
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await this.authService.hashPassword(
      changePasswordDto.newPassword
    );

    // Update password
    await this.bookhireOwnerRepository.update(id, { 
      password: hashedNewPassword 
    });
  }

  async findAll(page: number = 1, limit: number = 10): Promise<{ owners: BookhireOwnerEntity[]; total: number }> {
    const skip = (page - 1) * limit;

    const [owners, total] = await Promise.all([
      this.bookhireOwnerRepository.find({
        select: {
          password: false // Exclude password from selection
        },
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      }),
      this.bookhireOwnerRepository.count()
    ]);

    return { owners, total };
  }

  async deactivate(id: string): Promise<void> {
    const owner = await this.findById(id);

    await this.bookhireOwnerRepository.update(id, { isActive: false });
  }

  async activate(id: string): Promise<void> {
    const owner = await this.findById(id);

    await this.bookhireOwnerRepository.update(id, { isActive: true });
  }

  // DTO transformation methods
  private transformEntityToDto(entity: BookhireOwnerEntity): BookhireOwnerResponseDto {
    if (!entity) {
      return null;
    }

    // Handle profile image URL safely
    const profileImageUrl = entity.profileImage && typeof entity.profileImage === 'string' ? entity.profileImage : null;

    return {
      id: entity.id || null,
      fullName: entity.name && typeof entity.name === 'string' ? entity.name.trim() : null,
      phoneNumber: entity.phone && typeof entity.phone === 'string' ? entity.phone.trim() : null,
      email: entity.email && typeof entity.email === 'string' ? entity.email.toLowerCase().trim() : null,
      city: null, // Not available in current entity
      district: null, // Not available in current entity
      province: null, // Not available in current entity
      address: entity.address && typeof entity.address === 'string' ? entity.address.trim() : null,
      nationalId: null, // Not available in current entity
      licenseNumber: null, // Not available in current entity
      profileImageUrl: this.cloudStorageService.getFullUrl(profileImageUrl),
      isVerified: entity.isVerified === true,
      isActive: entity.isActive !== false, // Default to true unless explicitly false
      createdAt: entity.createdAt || null,
      updatedAt: entity.updatedAt || null
    };
  }

  async findByIdAsDto(id: string): Promise<BookhireOwnerResponseDto> {
    const entity = await this.findById(id);
    return this.transformEntityToDto(entity);
  }

  async findAllAsDto(page: number = 1, limit: number = 10): Promise<BookhireOwnerListResponseDto> {
    const skip = (page - 1) * limit;

    const [entities, total] = await Promise.all([
      this.bookhireOwnerRepository.find({
        select: {
          password: false // Exclude password from selection
        },
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      }),
      this.bookhireOwnerRepository.count()
    ]);

    return {
      owners: entities.map(entity => this.transformEntityToDto(entity)).filter(dto => dto !== null),
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit
    };
  }

  async updateProfileAsDto(id: string, updateDto: UpdateBookhireOwnerDto): Promise<BookhireOwnerResponseDto> {
    const entity = await this.updateProfile(id, updateDto);
    return this.transformEntityToDto(entity);
  }
}
