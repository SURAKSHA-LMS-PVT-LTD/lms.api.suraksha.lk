// src/modules/institute/institute.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { now } from '../../common/utils/timezone.util';

@Injectable()
export class InstitutesService {
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
}
