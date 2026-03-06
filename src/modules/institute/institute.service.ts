// src/modules/institute/institute.service.ts
import { Injectable, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere, In } from 'typeorm';
import { InstituteEntity } from './entities/institute.entity';
import { Country } from '../user/enums/country.enum';
import {
  CreateInstituteDto,
  UpdateInstituteDto,
  InstituteQueryDto,
  InstituteResponseDto,
  PaginatedInstituteResponseDto
} from './dto/index.dto';
import { UpdateInstituteSettingsDto } from './dto/update-institute-settings.dto';
import { InstituteSettingsResponseDto, InstituteProfileResponseDto } from './dto/institute-settings.dto';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { InstituteAccessValidator } from '../../common/helpers/institute-access-validator.helper';
import { now } from '../../common/utils/timezone.util';

@Injectable()
export class InstitutesService {
  private readonly logger = new Logger(InstitutesService.name);

  constructor(
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  // Check for code/email conflicts before creating
  async checkConflicts(createInstituteDto: CreateInstituteDto): Promise<void> {
    const existingInstitute = await this.instituteRepository.findOne({
      where: [
        { code: createInstituteDto.code },
        { email: createInstituteDto.email }
      ]
    });

    if (existingInstitute) {
      if (existingInstitute.code === createInstituteDto.code) {
        throw new ConflictException('Institute with this code already exists');
      }
      if (existingInstitute.email === createInstituteDto.email) {
        throw new ConflictException('Institute with this email already exists');
      }
    }
  }

  async create(
    createInstituteDto: CreateInstituteDto,
    imageUrl?: string | null,
    imageUrls?: string[] | null,
    logoUrl?: string | null,
    loadingGifUrl?: string | null
  ): Promise<InstituteEntity> {
    // Conflicts are now checked in the controller before uploading files

    // ✅ Extract URL fields from DTO if provided, otherwise use parameters (backward compatibility)
    const {
      imageUrl: dtoImageUrl,
      imageUrls: dtoImageUrls,
      logoUrl: dtoLogoUrl,
      loadingGifUrl: dtoLoadingGifUrl,
      ...instituteData
    } = createInstituteDto;

    const timestamp = now();
    const institute = this.instituteRepository.create({
      ...instituteData,
      imageUrl: dtoImageUrl || imageUrl || null,
      imageUrls: dtoImageUrls || imageUrls || null,
      logoUrl: dtoLogoUrl || logoUrl || null,
      loadingGifUrl: dtoLoadingGifUrl || loadingGifUrl || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return this.instituteRepository.save(institute);
  }

  async findAll(query: InstituteQueryDto): Promise<PaginatedInstituteResponseDto> {
    const {
      search,
      city,
      state,
      country,
      isActive,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = query;

    const where: FindOptionsWhere<InstituteEntity> = {};

    // Apply filters
    if (search) {
      where.name = Like(`%${search}%`);
      // You could also search by code: where.code = Like(`%${search}%`);
    }

    if (city) {
      where.city = city;
    }

    if (state) {
      where.state = state;
    }

    if (country) {
      where.country = country as Country;
    }

    if (typeof isActive === 'boolean') {
      where.isActive = isActive;
    }

    const [data, total] = await this.instituteRepository.findAndCount({
      where,
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    // ✅ Transform URL fields to full URLs
    const transformedData = data.map(institute => {
      if (institute.imageUrl) {
        institute.imageUrl = this.cloudStorageService.getFullUrl(institute.imageUrl);
      }
      if (institute.logoUrl) {
        institute.logoUrl = this.cloudStorageService.getFullUrl(institute.logoUrl);
      }
      if (institute.loadingGifUrl) {
        institute.loadingGifUrl = this.cloudStorageService.getFullUrl(institute.loadingGifUrl);
      }
      if (institute.imageUrls && Array.isArray(institute.imageUrls)) {
        institute.imageUrls = this.cloudStorageService.getFullUrls(institute.imageUrls);
      }
      return new InstituteResponseDto(institute);
    });

    return new PaginatedInstituteResponseDto(transformedData, total, page, limit);
  }

  async findOne(id: string): Promise<InstituteEntity> {
    const institute = await this.instituteRepository.findOne({
      where: { id, isActive: true }
    });

    if (!institute) {
      throw new NotFoundException(`Institute with ID ${id} not found`);
    }

    // ✅ Transform URL fields to full URLs
    if (institute.imageUrl) {
      institute.imageUrl = this.cloudStorageService.getFullUrl(institute.imageUrl);
    }
    if (institute.logoUrl) {
      institute.logoUrl = this.cloudStorageService.getFullUrl(institute.logoUrl);
    }
    if (institute.loadingGifUrl) {
      institute.loadingGifUrl = this.cloudStorageService.getFullUrl(institute.loadingGifUrl);
    }
    if (institute.imageUrls && Array.isArray(institute.imageUrls)) {
      institute.imageUrls = this.cloudStorageService.getFullUrls(institute.imageUrls);
    }

    return institute;
  }

  async findByCode(code: string): Promise<InstituteEntity> {
    const institute = await this.instituteRepository.findOne({
      where: { code, isActive: true }
    });

    if (!institute) {
      throw new NotFoundException(`Institute with code ${code} not found`);
    }

    // ✅ Transform URL fields to full URLs
    if (institute.imageUrl) {
      institute.imageUrl = this.cloudStorageService.getFullUrl(institute.imageUrl);
    }
    if (institute.logoUrl) {
      institute.logoUrl = this.cloudStorageService.getFullUrl(institute.logoUrl);
    }
    if (institute.loadingGifUrl) {
      institute.loadingGifUrl = this.cloudStorageService.getFullUrl(institute.loadingGifUrl);
    }
    if (institute.imageUrls && Array.isArray(institute.imageUrls)) {
      institute.imageUrls = this.cloudStorageService.getFullUrls(institute.imageUrls);
    }

    return institute;
  }

  async update(
    id: string,
    updateInstituteDto: UpdateInstituteDto,
    imageUrl?: string | null,
    imageUrls?: string[] | null,
    logoUrl?: string | null,
    loadingGifUrl?: string | null
  ): Promise<InstituteEntity> {
    const institute = await this.findOne(id);

    // Check for email conflicts if email is being updated
    if (updateInstituteDto.email && updateInstituteDto.email !== institute.email) {
      const existingInstitute = await this.instituteRepository.findOne({
        where: { email: updateInstituteDto.email }
      });

      if (existingInstitute && existingInstitute.id !== id) {
        throw new ConflictException('Institute with this email already exists');
      }
    }

    // ✅ Extract URL fields from DTO first
    const {
      imageUrl: dtoImageUrl,
      imageUrls: dtoImageUrls,
      logoUrl: dtoLogoUrl,
      loadingGifUrl: dtoLoadingGifUrl,
      ...instituteData
    } = updateInstituteDto;

    Object.assign(institute, instituteData);
    
    // ✅ Apply image URLs: prioritize DTO values over parameters
    if (dtoImageUrl !== undefined || imageUrl !== undefined) {
      institute.imageUrl = dtoImageUrl ?? imageUrl ?? institute.imageUrl;
    }
    if (dtoImageUrls !== undefined || imageUrls !== undefined) {
      institute.imageUrls = dtoImageUrls ?? imageUrls ?? institute.imageUrls;
    }
    if (dtoLogoUrl !== undefined || logoUrl !== undefined) {
      institute.logoUrl = dtoLogoUrl ?? logoUrl ?? institute.logoUrl;
    }
    if (dtoLoadingGifUrl !== undefined || loadingGifUrl !== undefined) {
      institute.loadingGifUrl = dtoLoadingGifUrl ?? loadingGifUrl ?? institute.loadingGifUrl;
    }
    
    const savedInstitute = await this.instituteRepository.save(institute);
    
    // ✅ Transform URL fields to full URLs for response
    if (savedInstitute.imageUrl) {
      savedInstitute.imageUrl = this.cloudStorageService.getFullUrl(savedInstitute.imageUrl);
    }
    if (savedInstitute.logoUrl) {
      savedInstitute.logoUrl = this.cloudStorageService.getFullUrl(savedInstitute.logoUrl);
    }
    if (savedInstitute.loadingGifUrl) {
      savedInstitute.loadingGifUrl = this.cloudStorageService.getFullUrl(savedInstitute.loadingGifUrl);
    }
    if (savedInstitute.imageUrls && Array.isArray(savedInstitute.imageUrls)) {
      savedInstitute.imageUrls = this.cloudStorageService.getFullUrls(savedInstitute.imageUrls);
    }
    
    return savedInstitute;
  }

  async remove(id: string): Promise<void> {
    const institute = await this.findOne(id);
    institute.isActive = false;
    await this.instituteRepository.save(institute);
  }

  async activate(id: string): Promise<InstituteEntity> {
    const institute = await this.instituteRepository.findOne({
      where: { id }
    });

    if (!institute) {
      throw new NotFoundException(`Institute with ID ${id} not found`);
    }

    institute.isActive = true;
    const savedInstitute = await this.instituteRepository.save(institute);

    return savedInstitute;
  }

  async deactivate(id: string): Promise<InstituteEntity> {
    const institute = await this.findOne(id);
    institute.isActive = false;
    const savedInstitute = await this.instituteRepository.save(institute);

    return savedInstitute;
  }

  // Utility method for bulk operations
  async findByIds(ids: string[]): Promise<InstituteEntity[]> {
    return this.instituteRepository.find({
      where: { id: In(ids), isActive: true }
    });
  }

  // Method to get institute statistics
  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byCountry: Array<{ country: string; count: number }>;
  }> {
    const [total, active] = await Promise.all([
      this.instituteRepository.count(),
      this.instituteRepository.count({ where: { isActive: true } })
    ]);

    const byCountry = await this.instituteRepository
      .createQueryBuilder('institute')
      .select('institute.country', 'country')
      .addSelect('COUNT(*)', 'count')
      .where('institute.isActive = :isActive', { isActive: true })
      .groupBy('institute.country')
      .getRawMany();

    return {
      total,
      active,
      inactive: total - active,
      byCountry: byCountry.map(item => ({
        country: item.country || 'Unknown',
        count: parseInt(item.count)
      }))
    };
  }

  /**
   * Update institute image URL
   */
  async updateImageUrl(instituteId: string, imageUrl: string): Promise<InstituteEntity> {
    const institute = await this.findOne(instituteId);
    if (!institute) {
      throw new NotFoundException('Institute not found');
    }

    await this.instituteRepository.update(instituteId, { imageUrl });
    
    return this.findOne(instituteId);
  }

  // ───────────────────────────────────────────────────
  // Institute Settings (Institute Admin)
  // ───────────────────────────────────────────────────

  /**
   * Get full institute settings for the Institute Admin settings page.
   * Validates the caller has access to this institute via JWT.
   * Returns all fields with S3 URLs resolved to full URLs.
   */
  async getSettings(instituteId: string, user: any): Promise<InstituteSettingsResponseDto> {
    // Validate institute access from JWT
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);

    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId, isActive: true },
    });

    if (!institute) {
      throw new NotFoundException(`Institute with ID ${instituteId} not found`);
    }

    return new InstituteSettingsResponseDto({
      id: institute.id,
      name: institute.name,
      shortName: institute.shortName,
      code: institute.code,
      email: institute.email,
      phone: institute.phone,
      systemContactEmail: institute.systemContactEmail,
      systemContactPhoneNumber: institute.systemContactPhoneNumber,
      address: institute.address,
      city: institute.city,
      state: institute.state,
      country: institute.country,
      district: institute.district,
      province: institute.province,
      pinCode: institute.pinCode,
      type: institute.type,
      logoUrl: institute.logoUrl ? this.cloudStorageService.getFullUrl(institute.logoUrl) : null,
      loadingGifUrl: institute.loadingGifUrl ? this.cloudStorageService.getFullUrl(institute.loadingGifUrl) : null,
      primaryColorCode: institute.primaryColorCode,
      secondaryColorCode: institute.secondaryColorCode,
      imageUrls: institute.imageUrls && Array.isArray(institute.imageUrls)
        ? this.cloudStorageService.getFullUrls(institute.imageUrls)
        : [],
      imageUrl: institute.imageUrl ? this.cloudStorageService.getFullUrl(institute.imageUrl) : null,
      vision: institute.vision,
      mission: institute.mission,
      websiteUrl: institute.websiteUrl,
      facebookPageUrl: institute.facebookPageUrl,
      youtubeChannelUrl: institute.youtubeChannelUrl,
      isActive: institute.isActive,
      updatedAt: institute.updatedAt,
    });
  }

  /**
   * Update institute settings from the Institute Admin settings page.
   * Only updatable fields are accepted (code, isDefault, isActive excluded).
   * Image fields accept S3 relative paths; response returns full S3 URLs.
   */
  async updateSettings(
    instituteId: string,
    dto: UpdateInstituteSettingsDto,
    user: any,
  ): Promise<InstituteSettingsResponseDto> {
    // Validate institute access from JWT
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);

    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId, isActive: true },
    });

    if (!institute) {
      throw new NotFoundException(`Institute with ID ${instituteId} not found`);
    }

    // Check email uniqueness if changing
    if (dto.email && dto.email.toLowerCase() !== institute.email) {
      const conflict = await this.instituteRepository.findOne({
        where: { email: dto.email },
      });
      if (conflict && conflict.id !== instituteId) {
        throw new ConflictException('An institute with this email already exists');
      }
    }

    // Build update payload — only set fields that are present in DTO
    const updateData: Partial<InstituteEntity> = {};

    // Collect old storage paths that will be permanently deleted after save
    const filesToDelete: string[] = [];

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.shortName !== undefined) updateData.shortName = dto.shortName;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.systemContactEmail !== undefined) updateData.systemContactEmail = dto.systemContactEmail;
    if (dto.systemContactPhoneNumber !== undefined) updateData.systemContactPhoneNumber = dto.systemContactPhoneNumber;
    if (dto.address !== undefined) updateData.address = dto.address;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.state !== undefined) updateData.state = dto.state;
    if (dto.country !== undefined) updateData.country = dto.country;
    if (dto.district !== undefined) updateData.district = dto.district;
    if (dto.province !== undefined) updateData.province = dto.province;
    if (dto.pinCode !== undefined) updateData.pinCode = dto.pinCode;
    if (dto.type !== undefined) updateData.type = dto.type;

    // Image fields — track replaced/removed paths for permanent storage deletion
    if (dto.logoUrl !== undefined) {
      if (institute.logoUrl && institute.logoUrl !== dto.logoUrl) {
        filesToDelete.push(institute.logoUrl);
      }
      updateData.logoUrl = dto.logoUrl;
    }
    if (dto.loadingGifUrl !== undefined) {
      if (institute.loadingGifUrl && institute.loadingGifUrl !== dto.loadingGifUrl) {
        filesToDelete.push(institute.loadingGifUrl);
      }
      updateData.loadingGifUrl = dto.loadingGifUrl;
    }
    if (dto.imageUrl !== undefined) {
      if (institute.imageUrl && institute.imageUrl !== dto.imageUrl) {
        filesToDelete.push(institute.imageUrl);
      }
      updateData.imageUrl = dto.imageUrl;
    }
    if (dto.imageUrls !== undefined) {
      // Find paths that were in old gallery but are NOT in the new array
      const oldPaths: string[] = Array.isArray(institute.imageUrls) ? institute.imageUrls : [];
      const newPaths: string[] = Array.isArray(dto.imageUrls) ? dto.imageUrls : [];
      const removedPaths = oldPaths.filter(p => p && !newPaths.includes(p));
      filesToDelete.push(...removedPaths);
      updateData.imageUrls = dto.imageUrls;
    }

    if (dto.primaryColorCode !== undefined) updateData.primaryColorCode = dto.primaryColorCode;
    if (dto.secondaryColorCode !== undefined) updateData.secondaryColorCode = dto.secondaryColorCode;
    if (dto.vision !== undefined) updateData.vision = dto.vision;
    if (dto.mission !== undefined) updateData.mission = dto.mission;
    if (dto.websiteUrl !== undefined) updateData.websiteUrl = dto.websiteUrl;
    if (dto.facebookPageUrl !== undefined) updateData.facebookPageUrl = dto.facebookPageUrl;
    if (dto.youtubeChannelUrl !== undefined) updateData.youtubeChannelUrl = dto.youtubeChannelUrl;

    updateData.updatedAt = now();

    await this.instituteRepository.update(instituteId, updateData);

    // Permanently delete replaced/removed storage files (fire-and-forget — DB save already succeeded)
    if (filesToDelete.length > 0) {
      Promise.all(
        filesToDelete.map(path =>
          this.cloudStorageService.deleteFile(path).catch(err =>
            this.logger.warn(`Failed to delete storage file: ${path} — ${err.message}`)
          )
        )
      ).catch(() => {});
    }

    // Return fresh settings with full S3 URLs
    return this.getSettings(instituteId, user);
  }

  // ───────────────────────────────────────────────────
  // Institute Profile (All institute members — minimal view)
  // ───────────────────────────────────────────────────

  /**
   * Get lightweight institute profile for teachers, students, attendance markers.
   * Returns only identity + branding + social links.
   * No images array, no system contacts, no gallery, no timestamps.
   */
  async getProfile(instituteId: string, user: any): Promise<InstituteProfileResponseDto> {
    // Validate institute access from JWT — any institute role
    InstituteAccessValidator.validateInstituteAccess(user, instituteId, undefined, undefined, true);

    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId, isActive: true },
      select: [
        'id', 'name', 'shortName', 'email', 'phone',
        'city', 'type',
        'logoUrl', 'primaryColorCode', 'secondaryColorCode',
        'websiteUrl', 'facebookPageUrl', 'youtubeChannelUrl',
        'vision', 'mission',
      ],
    });

    if (!institute) {
      throw new NotFoundException(`Institute with ID ${instituteId} not found`);
    }

    return new InstituteProfileResponseDto({
      id: institute.id,
      name: institute.name,
      shortName: institute.shortName,
      // code and pinCode intentionally excluded — enrollment credentials
      logoUrl: institute.logoUrl ? this.cloudStorageService.getFullUrl(institute.logoUrl) : null,
      primaryColorCode: institute.primaryColorCode,
      secondaryColorCode: institute.secondaryColorCode,
      phone: institute.phone,
      email: institute.email,
      city: institute.city,
      type: institute.type,
      websiteUrl: institute.websiteUrl,
      facebookPageUrl: institute.facebookPageUrl,
      youtubeChannelUrl: institute.youtubeChannelUrl,
      vision: institute.vision,
      mission: institute.mission,
    });
  }
}
