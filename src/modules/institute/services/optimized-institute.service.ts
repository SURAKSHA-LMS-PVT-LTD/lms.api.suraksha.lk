import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere } from 'typeorm';
import { InstituteEntity } from '../entities/institute.entity';
import { now } from '../../../common/utils/timezone.util';
import { Country } from '../../user/enums/country.enum';
import {
  CreateInstituteDto,
  UpdateInstituteDto,
  InstituteQueryDto
} from '../dto/index.dto';
import {
  InstitutePublicResponseDto,
  InstituteSummaryResponseDto,
  InstituteDetailResponseDto,
  InstituteAdminResponseDto
} from '../dto/secure-institute-response.dto';
import { UserType } from '../../user/enums/user-type.enum';

@Injectable()
export class OptimizedInstituteService {
  constructor(
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
  ) {}

  /**
   * Get public institute listing - minimal data, no authentication required
   */
  async findPublic(query: InstituteQueryDto): Promise<{
    data: InstitutePublicResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      search,
      city,
      country,
      page = 1,
      limit = 10,
      sortBy = 'name',
      sortOrder = 'ASC'
    } = query;

    const where: FindOptionsWhere<InstituteEntity> = {
      isActive: true // Only show active institutes publicly
    };

    if (search) {
      where.name = Like(`%${search}%`);
    }
    if (city) {
      where.city = city;
    }
    if (country) {
      where.country = country as Country;
    }

    // Optimized query - only fetch required fields
    const [data, total] = await this.instituteRepository.findAndCount({
      select: ['id', 'name', 'code', 'city', 'country'],
      where,
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    const responseData = data.map(institute => new InstitutePublicResponseDto(institute));
    return { data: responseData, total, page, limit };
  }

  /**
   * Get institute summary for authenticated users
   */
  async findSummary(query: InstituteQueryDto): Promise<{
    data: InstituteSummaryResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      search,
      city,
      state,
      country,
      isActive,
      page = 1,
      limit = 10,
      sortBy = 'name',
      sortOrder = 'ASC'
    } = query;

    const where: FindOptionsWhere<InstituteEntity> = {};

    if (search) {
      where.name = Like(`%${search}%`);
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

    // Optimized query - fetch summary fields only
    const [data, total] = await this.instituteRepository.findAndCount({
      select: ['id', 'name', 'code', 'email', 'phone', 'city', 'state'],
      where,
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    const responseData = data.map(institute => new InstituteSummaryResponseDto(institute));
    return { data: responseData, total, page, limit };
  }

  /**
   * Get detailed institute information for authorized users
   */
  async findDetail(id: string): Promise<InstituteDetailResponseDto> {
    // Optimized query - exclude sensitive fields
    const institute = await this.instituteRepository.findOne({
      select: [
        'id', 'name', 'code', 'email', 'phone', 'address',
        'city', 'state', 'country', 'pinCode', 'imageUrl'
      ],
      where: { id, isActive: true }
    });

    if (!institute) {
      throw new NotFoundException(`Institute with ID ${id} not found`);
    }

    return new InstituteDetailResponseDto(institute);
  }

  /**
   * Get complete institute information for administrators only
   */
  async findAdmin(id: string, userType: UserType): Promise<InstituteAdminResponseDto> {
    // Access control will be handled by decorators

    // Full query for admin access
    const institute = await this.instituteRepository.findOne({
      where: { id }
    });

    if (!institute) {
      throw new NotFoundException(`Institute with ID ${id} not found`);
    }

    return new InstituteAdminResponseDto(institute);
  }

  /**
   * Get institutes for dropdown/selection (minimal data)
   */
  async findForDropdown(): Promise<{ id: string; name: string; code: string }[]> {
    // Highly optimized query for dropdowns
    const institutes = await this.instituteRepository.find({
      select: ['id', 'name', 'code'],
      where: { isActive: true },
      order: { name: 'ASC' }
    });

    return institutes;
  }

  /**
   * Create new institute
   */
  async create(createInstituteDto: CreateInstituteDto): Promise<InstituteDetailResponseDto> {
    // Check for conflicts - optimized query
    const existingInstitute = await this.instituteRepository.findOne({
      select: ['id', 'code', 'email'],
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

    const timestamp = now();
    const institute = this.instituteRepository.create({
      ...createInstituteDto,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const savedInstitute = await this.instituteRepository.save(institute);
    
    return new InstituteDetailResponseDto(savedInstitute);
  }

  /**
   * Update institute
   */
  async update(id: string, updateInstituteDto: UpdateInstituteDto): Promise<InstituteDetailResponseDto> {
    // Check if institute exists - optimized query
    const institute = await this.instituteRepository.findOne({
      select: ['id', 'email'],
      where: { id, isActive: true }
    });

    if (!institute) {
      throw new NotFoundException(`Institute with ID ${id} not found`);
    }

    // Check email conflicts if email is being updated
    if (updateInstituteDto.email && updateInstituteDto.email !== institute.email) {
      const existingInstitute = await this.instituteRepository.findOne({
        select: ['id'],
        where: { email: updateInstituteDto.email }
      });

      if (existingInstitute && existingInstitute.id !== id) {
        throw new ConflictException('Institute with this email already exists');
      }
    }

    await this.instituteRepository.update(id, updateInstituteDto);
    
    // Return updated data
    return this.findDetail(id);
  }

  /**
   * Soft delete institute (admin only)
   */
  async remove(id: string, userType: UserType): Promise<void> {
    // Access control will be handled by decorators

    const result = await this.instituteRepository.update(
      { id, isActive: true },
      { isActive: false }
    );

    if (result.affected === 0) {
      throw new NotFoundException(`Institute with ID ${id} not found`);
    }
  }

  /**
   * Activate institute (admin only)
   */
  async activate(id: string, userType: UserType): Promise<InstituteAdminResponseDto> {
    // Access control will be handled by decorators

    const result = await this.instituteRepository.update(
      { id },
      { isActive: true }
    );

    if (result.affected === 0) {
      throw new NotFoundException(`Institute with ID ${id} not found`);
    }

    return this.findAdmin(id, userType);
  }

  /**
   * Find institute by code (optimized for authentication)
   */
  async findByCode(code: string): Promise<{ id: string; name: string; isActive: boolean }> {
    const institute = await this.instituteRepository.findOne({
      select: ['id', 'name', 'isActive'],
      where: { code }
    });

    if (!institute || !institute.isActive) {
      throw new NotFoundException(`Institute with code ${code} not found`);
    }

    return institute;
  }

  /**
   * Check if institute exists (for validation)
   */
  async exists(id: string): Promise<boolean> {
    const count = await this.instituteRepository.count({
      where: { id, isActive: true }
    });
    return count > 0;
  }

  /**
   * Get institute statistics (admin only)
   */
  async getStatistics(userType: UserType): Promise<{
    total: number;
    active: number;
    inactive: number;
  }> {
    // Access control will be handled by decorators

    const [total, active] = await Promise.all([
      this.instituteRepository.count(),
      this.instituteRepository.count({ where: { isActive: true } })
    ]);

    return {
      total,
      active,
      inactive: total - active
    };
  }
}
