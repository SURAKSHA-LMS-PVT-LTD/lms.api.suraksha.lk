import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InstituteFeaturePermissionEntity } from '../entities/institute-feature-permission.entity';
import { InstituteUserTypeEntity } from '../entities/institute-user-type.entity';
import { BulkUpdatePermissionsDto, FeaturePermissionDto } from '../dto/rbac.dto';

export type PermissionMatrix = Record<string, string[]>;

// In-process cache: short TTL avoids Redis dependency while keeping perf acceptable
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { data: PermissionMatrix; expiresAt: number }>();

@Injectable()
export class FeaturePermissionsService {
  constructor(
    @InjectRepository(InstituteFeaturePermissionEntity)
    private readonly repo: Repository<InstituteFeaturePermissionEntity>,
    @InjectRepository(InstituteUserTypeEntity)
    private readonly userTypeRepo: Repository<InstituteUserTypeEntity>,
    private readonly dataSource: DataSource,
  ) {}

  private cacheKey(instituteId: string, userTypeId: string) {
    return `rbac:perm:${instituteId}:${userTypeId}`;
  }

  private invalidate(instituteId: string, userTypeId: string) {
    cache.delete(this.cacheKey(instituteId, userTypeId));
    // Opportunistically prune expired entries to prevent unbounded Map growth
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
  }

  async getMatrix(instituteId: string, userTypeId: string): Promise<PermissionMatrix> {
    const key = this.cacheKey(instituteId, userTypeId);
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.data;

    const rows = await this.repo.find({ where: { instituteId, userTypeId } });

    const matrix: PermissionMatrix = {};
    for (const row of rows) {
      const actions: string[] = [];
      if (row.canView)   actions.push('view');
      if (row.canCreate) actions.push('create');
      if (row.canUpdate) actions.push('update');
      if (row.canDelete) actions.push('delete');
      if (row.canReport) actions.push('report');
      matrix[row.featureKey] = actions;
    }

    cache.set(key, { data: matrix, expiresAt: Date.now() + CACHE_TTL_MS });
    return matrix;
  }

  async listForUserType(instituteId: string, userTypeId: string): Promise<FeaturePermissionDto[]> {
    const userType = await this.userTypeRepo.findOne({ where: { id: userTypeId, instituteId } });
    if (!userType) throw new NotFoundException('User type not found');

    const rows = await this.repo.find({ where: { instituteId, userTypeId } });
    return rows.map(r => ({
      featureKey: r.featureKey,
      canView: r.canView,
      canCreate: r.canCreate,
      canUpdate: r.canUpdate,
      canDelete: r.canDelete,
      canReport: r.canReport,
    }));
  }

  async bulkUpdate(
    instituteId: string,
    userTypeId: string,
    dto: BulkUpdatePermissionsDto,
  ): Promise<void> {
    const userType = await this.userTypeRepo.findOne({ where: { id: userTypeId, instituteId } });
    if (!userType) throw new NotFoundException('User type not found');

    if (!dto.permissions.length) {
      this.invalidate(instituteId, userTypeId);
      return;
    }

    // Single batch INSERT … ON DUPLICATE KEY UPDATE — one round-trip regardless of row count
    const placeholders = dto.permissions.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())').join(', ');
    const params: any[] = [];
    for (const p of dto.permissions) {
      params.push(
        instituteId,
        userTypeId,
        p.featureKey,
        p.canView ? 1 : 0,
        p.canCreate ? 1 : 0,
        p.canUpdate ? 1 : 0,
        p.canDelete ? 1 : 0,
        p.canReport ? 1 : 0,
      );
    }

    await this.dataSource.query(
      `INSERT INTO institute_feature_permissions
         (institute_id, user_type_id, feature_key, can_view, can_create, can_update, can_delete, can_report, created_at, updated_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         can_view   = VALUES(can_view),
         can_create = VALUES(can_create),
         can_update = VALUES(can_update),
         can_delete = VALUES(can_delete),
         can_report = VALUES(can_report),
         updated_at = NOW()`,
      params,
    );

    this.invalidate(instituteId, userTypeId);
  }
}
