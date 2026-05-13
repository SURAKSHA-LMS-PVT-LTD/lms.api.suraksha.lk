import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InstituteUserTypeEntity } from '../entities/institute-user-type.entity';
import { FeaturePermissionsService } from './feature-permissions.service';
import { MyRbacContextDto, UserTypeMembersResponseDto, UserTypeMemberDto } from '../dto/rbac.dto';

@Injectable()
export class RbacContextService {
  constructor(
    @InjectRepository(InstituteUserTypeEntity)
    private readonly userTypeRepo: Repository<InstituteUserTypeEntity>,
    private readonly permissionsService: FeaturePermissionsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Resolves the RBAC context for a user within an institute.
   * Looks up primary_user_type_id first; falls back to matching by slug from the legacy enum.
   */
  async getMyContext(instituteId: string, userId: string, legacyUserType?: string): Promise<MyRbacContextDto> {
    // Try to find their primary_user_type_id
    const memberRow = await this.dataSource.query(
      `SELECT primary_user_type_id, institute_user_type
       FROM institute_user
       WHERE institute_id = ? AND user_id = ? AND status = 'ACTIVE'
       LIMIT 1`,
      [instituteId, userId],
    );

    if (!memberRow?.length) {
      // User is not a member of this institute — return empty context (e.g. superadmin browsing)
      return {
        userTypeId: '',
        userTypeName: legacyUserType ?? '',
        userTypeSlug: (legacyUserType ?? '').toLowerCase(),
        userTypeColor: undefined,
        permissions: {},
        isSystemAdmin: false,
      };
    }

    const { primary_user_type_id, institute_user_type } = memberRow[0];

    let userType: InstituteUserTypeEntity | null = null;

    // Prefer the explicit FK
    if (primary_user_type_id) {
      userType = await this.userTypeRepo.findOne({ where: { id: String(primary_user_type_id), instituteId } });
    }

    // Fallback: match by slug from the legacy enum value
    if (!userType && institute_user_type) {
      const slug = institute_user_type.toLowerCase();
      userType = await this.userTypeRepo.findOne({ where: { instituteId, slug, isActive: true } });
    }

    if (!userType) {
      // Last resort: return a minimal context with no permissions
      return {
        userTypeId: '',
        userTypeName: legacyUserType ?? 'Unknown',
        userTypeSlug: (legacyUserType ?? 'unknown').toLowerCase(),
        userTypeColor: undefined,
        permissions: {},
        isSystemAdmin: false,
      };
    }

    const permissions = await this.permissionsService.getMatrix(instituteId, userType.id);

    return {
      userTypeId: userType.id,
      userTypeName: userType.name,
      userTypeSlug: userType.slug,
      userTypeColor: userType.color ?? undefined,
      permissions,
      isSystemAdmin: false,
    };
  }

  async getUserTypeMembers(
    instituteId: string,
    typeId: string,
    opts: { page: number; limit: number; search?: string },
  ): Promise<UserTypeMembersResponseDto> {
    const userType = await this.userTypeRepo.findOne({ where: { id: typeId, instituteId, isActive: true } });
    if (!userType) throw new NotFoundException('User type not found');

    const skip = (opts.page - 1) * opts.limit;

    let whereExtra = '';
    const params: any[] = [instituteId, typeId];

    if (opts.search) {
      const safe = opts.search.replace(/['"`;\\]/g, '').trim().substring(0, 100);
      whereExtra = `AND (CONCAT(u.first_name, ' ', COALESCE(u.last_name, '')) LIKE ? OR u.email LIKE ?)`;
      params.push(`%${safe}%`, `%${safe}%`);
    }

    const countRows = await this.dataSource.query(
      `SELECT COUNT(*) as cnt
       FROM institute_user iu
       INNER JOIN user u ON u.id = iu.user_id
       WHERE iu.institute_id = ?
         AND iu.primary_user_type_id = ?
         AND iu.status = 'ACTIVE'
         ${whereExtra}`,
      params,
    );

    const total = parseInt(countRows[0]?.cnt ?? '0');

    const rows = await this.dataSource.query(
      `SELECT
         iu.user_id     AS userId,
         u.first_name   AS firstName,
         u.last_name    AS lastName,
         u.email,
         u.phone_number AS phoneNumber,
         u.image_url    AS imageUrl,
         iu.status,
         iu.created_at  AS joinedAt
       FROM institute_user iu
       INNER JOIN user u ON u.id = iu.user_id
       WHERE iu.institute_id = ?
         AND iu.primary_user_type_id = ?
         AND iu.status = 'ACTIVE'
         ${whereExtra}
       ORDER BY iu.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, opts.limit, skip],
    );

    const data: UserTypeMemberDto[] = rows.map((r: any) => ({
      userId: String(r.userId),
      firstName: r.firstName ?? '',
      lastName: r.lastName ?? '',
      email: r.email ?? '',
      phoneNumber: r.phoneNumber ?? '',
      imageUrl: r.imageUrl ?? undefined,
      status: r.status ?? '',
      joinedAt: r.joinedAt ? new Date(r.joinedAt).toISOString() : '',
    }));

    return {
      data,
      userTypeName: userType.name,
      userTypeSlug: userType.slug,
      userTypeColor: userType.color ?? undefined,
      total,
      page: opts.page,
      limit: opts.limit,
      totalPages: Math.ceil(total / opts.limit),
    };
  }
}
