// src/modules/institute/institute.service.ts
import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
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
import { InstituteSettingsResponseDto, InstituteReportBrandingResponseDto, InstituteProfileResponseDto } from './dto/institute-settings.dto';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { InstituteAccessValidator } from '../../common/helpers/institute-access-validator.helper';
import { now } from '../../common/utils/timezone.util';
import { RESERVED_SUBDOMAINS } from '../tenant/dto/tenant.dto';

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
    const conditions: FindOptionsWhere<InstituteEntity>[] = [
      { email: createInstituteDto.email },
    ];
    if (createInstituteDto.code) {
      conditions.push({ code: createInstituteDto.code });
    }
    const existingInstitute = await this.instituteRepository.findOne({ where: conditions });

    if (existingInstitute) {
      if (createInstituteDto.code && existingInstitute.code === createInstituteDto.code) {
        throw new ConflictException('Institute with this code already exists');
      }
      if (existingInstitute.email === createInstituteDto.email) {
        throw new ConflictException('Institute with this email already exists');
      }
    }
  }

  /** Generate a unique institute code like INST-20260411-001 */
  private async generateInstituteCode(): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `INST-${dateStr}-`;
    // Find highest sequence for today
    const existing = await this.instituteRepository
      .createQueryBuilder('i')
      .select('i.code', 'code')
      .where('i.code LIKE :pattern', { pattern: `${prefix}%` })
      .getRawMany<{ code: string }>();
    let max = 0;
    for (const { code } of existing) {
      const seq = parseInt(code.slice(prefix.length), 10);
      if (!isNaN(seq) && seq > max) max = seq;
    }
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
  }

  async create(
    createInstituteDto: CreateInstituteDto,
    imageUrl?: string | null,
    imageUrls?: string[] | null,
    logoUrl?: string | null,
    loadingGifUrl?: string | null
  ): Promise<InstituteEntity> {
    // Conflicts are now checked in the controller before uploading files

    // ✅ Extract URL fields and tier/subdomain from DTO
    const {
      imageUrl: dtoImageUrl,
      imageUrls: dtoImageUrls,
      logoUrl: dtoLogoUrl,
      loadingGifUrl: dtoLoadingGifUrl,
      subdomain: dtoSubdomain,
      code: dtoCode,
      ...instituteData
    } = createInstituteDto;

    // Auto-generate code if not provided by caller
    const resolvedCode = dtoCode || await this.generateInstituteCode();

    // Validate subdomain requires at least STARTER tier
    if (dtoSubdomain && (!instituteData.tier || instituteData.tier === 'FREE')) {
      throw new BadRequestException('Subdomains require at least STARTER tier');
    }

    // Validate subdomain is not reserved and not already taken
    if (dtoSubdomain) {
      const normalizedSubdomain = dtoSubdomain.toLowerCase();
      if (RESERVED_SUBDOMAINS.includes(normalizedSubdomain)) {
        throw new BadRequestException(`Subdomain "${normalizedSubdomain}" is reserved and cannot be used`);
      }
      const existing = await this.instituteRepository.findOne({
        where: { subdomain: normalizedSubdomain },
      });
      if (existing) {
        throw new ConflictException(`Subdomain "${normalizedSubdomain}" is already taken`);
      }
    }

    const timestamp = now();
    const institute = this.instituteRepository.create({
      ...instituteData,
      code: resolvedCode,
      // Only set subdomain if tier allows it (STARTER+)
      subdomain: (dtoSubdomain && instituteData.tier && instituteData.tier !== 'FREE') ? dtoSubdomain.toLowerCase() : null,
      customLoginEnabled: !!(dtoSubdomain && instituteData.tier && instituteData.tier !== 'FREE'),
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
      isSessionLimitEnabled: institute.isSessionLimitEnabled,
      defaultSessionsPerUserCount: institute.defaultSessionsPerUserCount,
      isStrictSessionLimit: institute.isStrictSessionLimit,
      // Report branding — returned as full URLs so frontend can fetch directly
      reportHeaderUrl: institute.reportHeaderUrl ? this.cloudStorageService.getFullUrl(institute.reportHeaderUrl) : null,
      reportFooterUrl: institute.reportFooterUrl ? this.cloudStorageService.getFullUrl(institute.reportFooterUrl) : null,
      // Receipt printer banner images (separate from PDF report banners)
      receiptHeaderUrl: institute.receiptHeaderUrl ? this.cloudStorageService.getFullUrl(institute.receiptHeaderUrl) : null,
      receiptFooterUrl: institute.receiptFooterUrl ? this.cloudStorageService.getFullUrl(institute.receiptFooterUrl) : null,
      printerSettings: institute.printerSettings ?? null,
      allowUserPhotoUpload: institute.allowUserPhotoUpload,
    });
  }

  /**
   * Get report branding as base64 data URLs so PDFs can embed the images
   * without depending on browser CORS.
   */
  async getReportBranding(instituteId: string, user: any): Promise<InstituteReportBrandingResponseDto> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);

    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId, isActive: true },
    });

    if (!institute) {
      throw new NotFoundException(`Institute with ID ${instituteId} not found`);
    }

    const [headerDataUrl, footerDataUrl] = await Promise.all([
      institute.reportHeaderUrl ? this.fetchImageAsDataUrl(this.cloudStorageService.getFullUrl(institute.reportHeaderUrl)) : Promise.resolve(null),
      institute.reportFooterUrl ? this.fetchImageAsDataUrl(this.cloudStorageService.getFullUrl(institute.reportFooterUrl)) : Promise.resolve(null),
    ]);

    return new InstituteReportBrandingResponseDto({
      instituteHeaderDataUrl: headerDataUrl,
      instituteFooterDataUrl: footerDataUrl,
    });
  }

  /**
   * Single endpoint for printing pages — returns printer config + header/footer data URLs.
   * Uses FlexibleAccessGuard so all institute members (not just admin) can call it.
   */
  async getPrintSettings(instituteId: string): Promise<import('./dto/institute-settings.dto').InstitutePrintSettingsResponseDto> {
    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId, isActive: true },
      select: ['id', 'printerSettings', 'receiptHeaderUrl', 'receiptFooterUrl'],
    });

    if (!institute) {
      throw new NotFoundException(`Institute with ID ${instituteId} not found`);
    }

    const [headerImageDataUrl, footerImageDataUrl] = await Promise.all([
      institute.receiptHeaderUrl
        ? this.fetchImageAsDataUrl(this.cloudStorageService.getFullUrl(institute.receiptHeaderUrl))
        : Promise.resolve(null),
      institute.receiptFooterUrl
        ? this.fetchImageAsDataUrl(this.cloudStorageService.getFullUrl(institute.receiptFooterUrl))
        : Promise.resolve(null),
    ]);

    const { InstitutePrintSettingsResponseDto } = await import('./dto/institute-settings.dto');
    return new InstitutePrintSettingsResponseDto({
      defaultSize: institute.printerSettings?.defaultSize ?? '3inch',
      language: institute.printerSettings?.language ?? 'en',
      receiptHeader: institute.printerSettings?.receiptHeader ?? null,
      receiptFooter: institute.printerSettings?.receiptFooter ?? null,
      headerImageDataUrl,
      footerImageDataUrl,
    });
  }

  private async fetchImageAsDataUrl(imageUrl: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(imageUrl, { signal: controller.signal });
      if (!response.ok) {
        this.logger.warn(`Failed to fetch report image ${imageUrl}: ${response.status} ${response.statusText}`);
        return null;
      }

      const contentType = response.headers.get('content-type') || 'image/png';
      const buffer = Buffer.from(await response.arrayBuffer());
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (error) {
      this.logger.warn(`Error fetching report image ${imageUrl}: ${error instanceof Error ? error.message : error}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
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

    // Session limits
    if (dto.isSessionLimitEnabled !== undefined) updateData.isSessionLimitEnabled = dto.isSessionLimitEnabled;
    if (dto.defaultSessionsPerUserCount !== undefined) updateData.defaultSessionsPerUserCount = dto.defaultSessionsPerUserCount;
    if (dto.isStrictSessionLimit !== undefined) updateData.isStrictSessionLimit = dto.isStrictSessionLimit;

    // Report branding — S3 relative paths; track replaced paths for deletion
    if (dto.reportHeaderUrl !== undefined) {
      if (institute.reportHeaderUrl && institute.reportHeaderUrl !== dto.reportHeaderUrl) {
        filesToDelete.push(institute.reportHeaderUrl);
      }
      updateData.reportHeaderUrl = dto.reportHeaderUrl;
    }
    if (dto.reportFooterUrl !== undefined) {
      if (institute.reportFooterUrl && institute.reportFooterUrl !== dto.reportFooterUrl) {
        filesToDelete.push(institute.reportFooterUrl);
      }
      updateData.reportFooterUrl = dto.reportFooterUrl;
    }

    // Receipt printer banner images — separate from PDF report banners
    if (dto.receiptHeaderUrl !== undefined) {
      if (institute.receiptHeaderUrl && institute.receiptHeaderUrl !== dto.receiptHeaderUrl) {
        filesToDelete.push(institute.receiptHeaderUrl);
      }
      updateData.receiptHeaderUrl = dto.receiptHeaderUrl;
    }
    if (dto.receiptFooterUrl !== undefined) {
      if (institute.receiptFooterUrl && institute.receiptFooterUrl !== dto.receiptFooterUrl) {
        filesToDelete.push(institute.receiptFooterUrl);
      }
      updateData.receiptFooterUrl = dto.receiptFooterUrl;
    }

    // Printer settings — merge with existing so partial updates work
    if (dto.printerSettings !== undefined) {
      updateData.printerSettings = {
        ...(institute.printerSettings ?? {}),
        ...dto.printerSettings,
      };
    }

    if (dto.allowUserPhotoUpload !== undefined) {
      updateData.allowUserPhotoUpload = dto.allowUserPhotoUpload;
    }

    updateData.updatedAt = now();

    await this.instituteRepository.update(instituteId, updateData);

    // Apply session limit to existing users based on mode (raw SQL to avoid entity metadata lookup)
    if (dto.defaultSessionsPerUserCount !== undefined && dto.sessionLimitUpdateMode) {
      const em = this.instituteRepository.manager;
      if (dto.sessionLimitUpdateMode === 'ALL_USERS') {
        await em.query(
          `UPDATE institute_user SET max_devices_per_user = ? WHERE institute_id = ?`,
          [dto.defaultSessionsPerUserCount, instituteId],
        );
      } else if (dto.sessionLimitUpdateMode === 'USERS_WITH_PREVIOUS_LIMIT') {
        await em.query(
          `UPDATE institute_user SET max_devices_per_user = ? WHERE institute_id = ? AND max_devices_per_user IS NOT NULL`,
          [dto.defaultSessionsPerUserCount, instituteId],
        );
      }
      // NEW_USERS_ONLY: no-op — new enrollments inherit defaultSessionsPerUserCount automatically
    }

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
  // Institute Image Management (dedicated endpoints)
  // ───────────────────────────────────────────────────

  /**
   * Shared helper — load institute and validate JWT access for settings-level operations.
   */
  private async loadInstituteForSettings(instituteId: string, user: any): Promise<InstituteEntity> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId, isActive: true },
    });
    if (!institute) {
      throw new NotFoundException(`Institute with ID ${instituteId} not found`);
    }
    return institute;
  }

  /**
   * Permanently delete the institute logo from storage and clear the DB field.
   */
  async deleteLogoImage(instituteId: string, user: any): Promise<InstituteSettingsResponseDto> {
    const institute = await this.loadInstituteForSettings(instituteId, user);
    const oldPath = institute.logoUrl;
    if (oldPath) {
      await this.instituteRepository.update(instituteId, { logoUrl: null, updatedAt: now() });
      this.cloudStorageService.deleteFile(oldPath).catch(err =>
        this.logger.warn(`Failed to delete logo: ${oldPath} — ${err.message}`)
      );
    }
    return this.getSettings(instituteId, user);
  }

  /**
   * Permanently delete the loading GIF from storage and clear the DB field.
   */
  async deleteLoadingGif(instituteId: string, user: any): Promise<InstituteSettingsResponseDto> {
    const institute = await this.loadInstituteForSettings(instituteId, user);
    const oldPath = institute.loadingGifUrl;
    if (oldPath) {
      await this.instituteRepository.update(instituteId, { loadingGifUrl: null, updatedAt: now() });
      this.cloudStorageService.deleteFile(oldPath).catch(err =>
        this.logger.warn(`Failed to delete loading GIF: ${oldPath} — ${err.message}`)
      );
    }
    return this.getSettings(instituteId, user);
  }

  /**
   * Permanently delete the cover/banner image from storage and clear the DB field.
   */
  async deleteCoverImage(instituteId: string, user: any): Promise<InstituteSettingsResponseDto> {
    const institute = await this.loadInstituteForSettings(instituteId, user);
    const oldPath = institute.imageUrl;
    if (oldPath) {
      await this.instituteRepository.update(instituteId, { imageUrl: null, updatedAt: now() });
      this.cloudStorageService.deleteFile(oldPath).catch(err =>
        this.logger.warn(`Failed to delete cover image: ${oldPath} — ${err.message}`)
      );
    }
    return this.getSettings(instituteId, user);
  }

  /**
   * Add a single image to the gallery array (max 10).
   * Accepts the S3/GCS relative path from /upload/verify-and-publish.
   */
  async addGalleryImage(instituteId: string, relativePath: string, user: any): Promise<InstituteSettingsResponseDto> {
    const institute = await this.loadInstituteForSettings(instituteId, user);
    const current: string[] = Array.isArray(institute.imageUrls) ? institute.imageUrls : [];
    if (current.length >= 10) {
      throw new BadRequestException('Gallery is full — maximum 10 images allowed');
    }
    await this.instituteRepository.update(instituteId, {
      imageUrls: [...current, relativePath],
      updatedAt: now(),
    });
    return this.getSettings(instituteId, user);
  }

  /**
   * Remove a gallery image by its 0-based index and permanently delete from storage.
   */
  async deleteGalleryImage(instituteId: string, imageIndex: number, user: any): Promise<InstituteSettingsResponseDto> {
    const institute = await this.loadInstituteForSettings(instituteId, user);
    const current: string[] = Array.isArray(institute.imageUrls) ? institute.imageUrls : [];
    if (imageIndex < 0 || imageIndex >= current.length) {
      throw new BadRequestException(
        `Invalid index ${imageIndex} — gallery has ${current.length} image(s) (0-based)`
      );
    }
    const removedPath = current[imageIndex];
    const newPaths = current.filter((_, i) => i !== imageIndex);
    await this.instituteRepository.update(instituteId, { imageUrls: newPaths, updatedAt: now() });
    if (removedPath) {
      this.cloudStorageService.deleteFile(removedPath).catch(err =>
        this.logger.warn(`Failed to delete gallery image: ${removedPath} — ${err.message}`)
      );
    }
    return this.getSettings(instituteId, user);
  }

  // ───────────────────────────────────────────────────
  // User Extra Data Schema (Institute Admin)
  // ───────────────────────────────────────────────────

  /**
   * Get the institute-wide custom user column schema.
   * Returns empty array if not yet configured.
   */
  async getUserExtraDataSchema(
    instituteId: string,
    user: any,
  ): Promise<Array<{ key: string; label: string; type: string; applicableTo?: string[] }>> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId, isActive: true },
      select: ['id', 'userExtraDataSchema'],
    });
    if (!institute) throw new NotFoundException(`Institute ${instituteId} not found`);
    return Array.isArray(institute.userExtraDataSchema) ? institute.userExtraDataSchema : [];
  }

  /**
   * Replace the institute-wide custom user column schema.
   * Pass an empty array to clear all custom columns.
   */
  async updateUserExtraDataSchema(
    instituteId: string,
    schema: Array<{ key: string; label: string; type: string; applicableTo?: string[] }>,
    user: any,
  ): Promise<Array<{ key: string; label: string; type: string; applicableTo?: string[] }>> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId, isActive: true },
    });
    if (!institute) throw new NotFoundException(`Institute ${instituteId} not found`);
    await this.instituteRepository.update(instituteId, {
      userExtraDataSchema: schema as any,
      updatedAt: now(),
    });

    return schema;
  }

  // ───────────────────────────────────────────────────
  // Design Templates
  // ───────────────────────────────────────────────────

  async getDesignTemplates(instituteId: string, user: any): Promise<any[]> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId, isActive: true },
      select: ['id', 'designTemplates'],
    });
    if (!institute) throw new NotFoundException(`Institute ${instituteId} not found`);
    return institute.designTemplates ?? [];
  }

  async saveDesignTemplates(instituteId: string, templates: any[], user: any): Promise<any[]> {
    InstituteAccessValidator.validateInstituteAccess(user, instituteId);
    const institute = await this.instituteRepository.findOne({
      where: { id: instituteId, isActive: true },
    });
    if (!institute) throw new NotFoundException(`Institute ${instituteId} not found`);
    await this.instituteRepository.update(instituteId, {
      designTemplates: templates,
      updatedAt: now(),
    });
    return templates;
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
        'logoUrl', 'loadingGifUrl', 'imageUrls', 'imageUrl',
        'primaryColorCode', 'secondaryColorCode',
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
      loadingGifUrl: institute.loadingGifUrl ? this.cloudStorageService.getFullUrl(institute.loadingGifUrl) : null,
      imageUrls: Array.isArray(institute.imageUrls)
        ? institute.imageUrls.map(url => this.cloudStorageService.getFullUrl(url))
        : [],
      imageUrl: institute.imageUrl ? this.cloudStorageService.getFullUrl(institute.imageUrl) : null,
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
