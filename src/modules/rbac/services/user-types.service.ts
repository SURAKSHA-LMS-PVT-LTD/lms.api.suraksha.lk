import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstituteUserTypeEntity } from '../entities/institute-user-type.entity';
import { CreateUserTypeDto, UpdateUserTypeDto, UserTypeResponseDto } from '../dto/rbac.dto';

@Injectable()
export class UserTypesService {
  constructor(
    @InjectRepository(InstituteUserTypeEntity)
    private readonly repo: Repository<InstituteUserTypeEntity>,
  ) {}

  async list(instituteId: string): Promise<UserTypeResponseDto[]> {
    const types = await this.repo.find({
      where: { instituteId, isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return types.map(this.toDto);
  }

  async getById(instituteId: string, id: string): Promise<UserTypeResponseDto> {
    const type = await this.repo.findOne({ where: { id, instituteId } });
    if (!type) throw new NotFoundException('User type not found');
    return this.toDto(type);
  }

  async create(instituteId: string, dto: CreateUserTypeDto): Promise<UserTypeResponseDto> {
    const slug = dto.slug ?? dto.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const existing = await this.repo.findOne({ where: { instituteId, slug } });
    if (existing) throw new ConflictException(`A user type with slug "${slug}" already exists`);

    const entity = this.repo.create({
      instituteId,
      name: dto.name,
      namePlural: dto.namePlural ?? dto.name + 's',
      slug,
      description: dto.description,
      color: dto.color,
      isSystemType: false,
      isPublic: dto.isPublic ?? true,
      isActive: true,
      sortOrder: dto.sortOrder ?? 100,
    });

    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async update(instituteId: string, id: string, dto: UpdateUserTypeDto): Promise<UserTypeResponseDto> {
    const type = await this.repo.findOne({ where: { id, instituteId } });
    if (!type) throw new NotFoundException('User type not found');

    Object.assign(type, {
      name: dto.name ?? type.name,
      namePlural: dto.namePlural ?? type.namePlural,
      description: dto.description ?? type.description,
      color: dto.color ?? type.color,
      isPublic: dto.isPublic ?? type.isPublic,
      isActive: dto.isActive ?? type.isActive,
      sortOrder: dto.sortOrder ?? type.sortOrder,
    });

    const saved = await this.repo.save(type);
    return this.toDto(saved);
  }

  async remove(instituteId: string, id: string): Promise<void> {
    const type = await this.repo.findOne({ where: { id, instituteId } });
    if (!type) throw new NotFoundException('User type not found');
    if (type.isSystemType) throw new ForbiddenException('System user types cannot be deleted');

    // Soft delete
    type.isActive = false;
    await this.repo.save(type);
  }

  private toDto(t: InstituteUserTypeEntity): UserTypeResponseDto {
    return {
      id: t.id,
      instituteId: t.instituteId,
      name: t.name,
      namePlural: t.namePlural ?? t.name + 's',
      slug: t.slug,
      description: t.description,
      color: t.color,
      isSystemType: t.isSystemType,
      isPublic: t.isPublic,
      isActive: t.isActive,
      sortOrder: t.sortOrder,
      createdAt: t.createdAt?.toISOString(),
      updatedAt: t.updatedAt?.toISOString(),
    };
  }
}
