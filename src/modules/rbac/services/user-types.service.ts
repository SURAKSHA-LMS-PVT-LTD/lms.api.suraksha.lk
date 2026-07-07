import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InstituteUserTypeEntity } from '../entities/institute-user-type.entity';
import { InstituteFeaturePermissionEntity } from '../entities/institute-feature-permission.entity';
import { CreateUserTypeDto, UpdateUserTypeDto, UserTypeResponseDto } from '../dto/rbac.dto';

@Injectable()
export class UserTypesService {
  constructor(
    @InjectRepository(InstituteUserTypeEntity)
    private readonly repo: Repository<InstituteUserTypeEntity>,
    @InjectRepository(InstituteFeaturePermissionEntity)
    private readonly permRepo: Repository<InstituteFeaturePermissionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(instituteId: string): Promise<UserTypeResponseDto[]> {
    const types = await this.repo.find({
      where: { instituteId, isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const mapped = types.map(this.toDto);

    // Inject synthetic entries for built-in enum roles not stored as table rows
    const existingSlugs = new Set(mapped.map(t => t.slug));
    const systemTypes: UserTypeResponseDto[] = [
      {
        id: 'system-institute-admin',
        instituteId,
        name: 'Institute Admin',
        namePlural: 'Institute Admins',
        slug: 'institute_admin',
        description: 'Full administrative access to the institute',
        color: '#EF4444',
        isSystemType: true,
        isPublic: false,
        isActive: true,
        sortOrder: 0,
        createdAt: null,
        updatedAt: null,
      },
      {
        id: 'system-teacher',
        instituteId,
        name: 'Teacher',
        namePlural: 'Teachers',
        slug: 'teacher',
        description: 'Teaching staff',
        color: '#10B981',
        isSystemType: true,
        isPublic: true,
        isActive: true,
        sortOrder: 2,
        createdAt: null,
        updatedAt: null,
      },
      {
        id: 'system-attendance-marker',
        instituteId,
        name: 'Attendance Marker',
        namePlural: 'Attendance Markers',
        slug: 'attendance_marker',
        description: 'Can mark attendance only',
        color: '#F59E0B',
        isSystemType: true,
        isPublic: true,
        isActive: true,
        sortOrder: 3,
        createdAt: null,
        updatedAt: null,
      },
    ].filter(s => !existingSlugs.has(s.slug));

    return [...systemTypes, ...mapped];
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

    // Copy permissions from base type if requested
    if (dto.baseTypeSlug) {
      const baseType = await this.repo.findOne({ where: { instituteId, slug: dto.baseTypeSlug } });
      if (baseType) {
        const basePerms = await this.permRepo.find({ where: { instituteId, userTypeId: baseType.id } });
        if (basePerms.length) {
          const placeholders = basePerms.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())').join(', ');
          const params: any[] = [];
          for (const p of basePerms) {
            params.push(
              instituteId, saved.id, p.featureKey,
              p.canView ? 1 : 0, p.canCreate ? 1 : 0, p.canUpdate ? 1 : 0,
              p.canDelete ? 1 : 0, p.canReport ? 1 : 0, p.canSubmit ? 1 : 0,
            );
          }
          await this.dataSource.query(
            `INSERT INTO institute_feature_permissions
               (institute_id, user_type_id, feature_key, can_view, can_create, can_update, can_delete, can_report, can_submit, created_at, updated_at)
             VALUES ${placeholders}
             ON DUPLICATE KEY UPDATE
               can_view=VALUES(can_view), can_create=VALUES(can_create), can_update=VALUES(can_update),
               can_delete=VALUES(can_delete), can_report=VALUES(can_report), can_submit=VALUES(can_submit),
               updated_at=NOW()`,
            params,
          );
        }
      }
    }

    return this.toDto(saved);
  }

  async update(instituteId: string, id: string, dto: UpdateUserTypeDto): Promise<UserTypeResponseDto> {
    const type = await this.repo.findOne({ where: { id, instituteId } });
    if (!type) throw new NotFoundException('User type not found');

    // System types guard: only non-structural fields may be touched
    if (type.isSystemType) {
      if ((dto as any).slug !== undefined) {
        throw new ForbiddenException('Cannot change the slug of a system user type');
      }
      // Block deactivating a system type via isActive=false
      if (dto.isActive === false) {
        throw new ForbiddenException('System user types cannot be deactivated');
      }
    }

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
