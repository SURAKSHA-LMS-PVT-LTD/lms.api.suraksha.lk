import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { now } from '../../../common/utils/timezone.util';
import { InstituteHouseEntity } from './entities/institute_house.entity';
import {
  InstituteHouseMemberEntity,
  HouseEnrollmentMethod,
} from './entities/institute_house_member.entity';
import { InstituteEntity } from '../../institute/entities/institute.entity';
import { InstituteUserEntity } from '../institue_user/entities/institue_user.entity';
import { UserEntity } from '../../user/entities/user.entity';
import { InstituteUserType } from '../institue_user/enums/institute-user-type.enum';
import { InstituteUserStatus } from '../institue_user/enums/institute-user-status.enum';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';
import {
  CreateInstituteHouseDto,
  UpdateInstituteHouseDto,
  UpdateInstituteHouseImageDto,
  AssignUserToHouseDto,
  BulkAssignUsersToHouseDto,
  HouseMemberQueryDto,
  InstituteHouseResponseDto,
  HouseMemberResponseDto,
  HouseActionResponseDto,
  PaginatedHouseMembersDto,
} from './dto/institute_house.dto';

@Injectable()
export class InstituteHouseService {
  private readonly logger = new Logger(InstituteHouseService.name);

  constructor(
    @InjectRepository(InstituteHouseEntity)
    private readonly houseRepository: Repository<InstituteHouseEntity>,
    @InjectRepository(InstituteHouseMemberEntity)
    private readonly memberRepository: Repository<InstituteHouseMemberEntity>,
    @InjectRepository(InstituteEntity)
    private readonly instituteRepository: Repository<InstituteEntity>,
    @InjectRepository(InstituteUserEntity)
    private readonly instituteUserRepository: Repository<InstituteUserEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  // ─── HOUSE CRUD ──────────────────────────────────────────────────────────

  async createHouse(
    instituteId: string,
    adminUserId: string,
    dto: CreateInstituteHouseDto,
  ): Promise<InstituteHouseResponseDto> {
    await this.assertInstituteExists(instituteId);
    await this.assertInstituteAdmin(adminUserId, instituteId);

    const duplicate = await this.houseRepository.findOne({
      where: { instituteId, name: dto.name, isActive: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `A house named "${dto.name}" already exists in this institute.`,
      );
    }

    const house = await this.houseRepository.save(
      this.houseRepository.create({
        instituteId,
        name: dto.name,
        color: dto.color ?? null,
        description: dto.description ?? null,
        imageUrl: dto.imageUrl ?? null,
        isActive: true,
        createdBy: adminUserId,
        createdAt: now(),
        updatedAt: now(),
      }),
    );

    return this.toHouseResponse(house);
  }

  async getHouses(
    instituteId: string,
    requestingUserId: string,
  ): Promise<InstituteHouseResponseDto[]> {
    await this.assertInstituteExists(instituteId);
    await this.assertInstitutemember(requestingUserId, instituteId);

    const houses = await this.houseRepository.find({
      where: { instituteId, isActive: true },
      order: { name: 'ASC' },
    });

    // Attach member counts
    const memberCounts = await this.memberRepository
      .createQueryBuilder('m')
      .select('m.house_id', 'houseId')
      .addSelect('COUNT(*)', 'cnt')
      .where('m.institute_id = :instituteId AND m.is_active = true', { instituteId })
      .groupBy('m.house_id')
      .getRawMany();

    const countMap = new Map<string, number>(
      memberCounts.map((r) => [String(r.houseId), Number(r.cnt)]),
    );

    // Find which house (if any) the requesting user is currently enrolled in
    const userMembership = await this.memberRepository.findOne({
      where: { instituteId, userId: requestingUserId, isActive: true },
    });
    const enrolledHouseId = userMembership ? String(userMembership.houseId) : null;

    return houses.map((h) => ({
      ...this.toHouseResponse(h),
      memberCount: countMap.get(h.id) ?? 0,
      isEnrolled: enrolledHouseId !== null && enrolledHouseId === String(h.id),
      enrolledHouseId: enrolledHouseId ?? null,
    }));
  }

  async getHouse(
    instituteId: string,
    houseId: string,
    requestingUserId: string,
  ): Promise<InstituteHouseResponseDto> {
    await this.assertInstituteExists(instituteId);
    await this.assertInstituteAdmin(requestingUserId, instituteId);

    const house = await this.findHouse(instituteId, houseId);
    const memberCount = await this.memberRepository.count({
      where: { houseId, instituteId, isActive: true },
    });

    return { ...this.toHouseResponse(house), memberCount };
  }

  async updateHouse(
    instituteId: string,
    houseId: string,
    adminUserId: string,
    dto: UpdateInstituteHouseDto,
  ): Promise<InstituteHouseResponseDto> {
    await this.assertInstituteAdmin(adminUserId, instituteId);
    const house = await this.findHouse(instituteId, houseId);

    if (dto.name && dto.name !== house.name) {
      const duplicate = await this.houseRepository.findOne({
        where: { instituteId, name: dto.name, isActive: true },
      });
      if (duplicate && duplicate.id !== houseId) {
        throw new ConflictException(
          `A house named "${dto.name}" already exists in this institute.`,
        );
      }
      house.name = dto.name;
    }

    if (dto.color !== undefined) house.color = dto.color;
    if (dto.description !== undefined) house.description = dto.description;
    if (dto.isActive !== undefined) house.isActive = dto.isActive;
    house.updatedAt = now();

    await this.houseRepository.save(house);
    return this.toHouseResponse(house);
  }

  async updateHouseImage(
    instituteId: string,
    houseId: string,
    adminUserId: string,
    dto: UpdateInstituteHouseImageDto,
  ): Promise<InstituteHouseResponseDto> {
    await this.assertInstituteAdmin(adminUserId, instituteId);
    const house = await this.findHouse(instituteId, houseId);

    house.imageUrl = dto.imageUrl;
    house.updatedAt = now();
    await this.houseRepository.save(house);

    return this.toHouseResponse(house);
  }

  async deleteHouse(
    instituteId: string,
    houseId: string,
    adminUserId: string,
  ): Promise<HouseActionResponseDto> {
    await this.assertInstituteAdmin(adminUserId, instituteId);
    const house = await this.findHouse(instituteId, houseId);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Detach house from all institute_user rows
      await queryRunner.manager.update(
        InstituteUserEntity,
        { instituteId, houseId },
        { houseId: null, updatedAt: now() },
      );

      // Soft-delete members
      await queryRunner.manager.update(
        InstituteHouseMemberEntity,
        { houseId, instituteId },
        { isActive: false, updatedAt: now() },
      );

      // Soft-delete house
      house.isActive = false;
      house.updatedAt = now();
      await queryRunner.manager.save(house);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }

    return { success: true, message: `House "${house.name}" deleted successfully.` };
  }

  // ─── MEMBER MANAGEMENT ───────────────────────────────────────────────────

  /**
   * Assign a single user to a house (admin-initiated).
   * Also updates the `house_id` column on institute_user.
   */
  async assignUserToHouse(
    instituteId: string,
    houseId: string,
    adminUserId: string,
    dto: AssignUserToHouseDto,
  ): Promise<HouseActionResponseDto> {
    await this.assertInstituteAdmin(adminUserId, instituteId);
    const house = await this.findHouse(instituteId, houseId);

    await this.enrollUserToHouseInternal(
      instituteId,
      houseId,
      dto.userId,
      adminUserId,
      HouseEnrollmentMethod.MANUAL,
    );

    return {
      success: true,
      message: `User ${dto.userId} assigned to house "${house.name}".`,
    };
  }

  /**
   * Bulk-assign multiple users to a house (admin-initiated).
   */
  async bulkAssignUsersToHouse(
    instituteId: string,
    houseId: string,
    adminUserId: string,
    dto: BulkAssignUsersToHouseDto,
  ): Promise<{ success: boolean; results: { userId: string; status: string }[] }> {
    await this.assertInstituteAdmin(adminUserId, instituteId);
    await this.findHouse(instituteId, houseId);

    const results: { userId: string; status: string }[] = [];

    for (const userId of dto.userIds) {
      try {
        await this.enrollUserToHouseInternal(
          instituteId,
          houseId,
          userId,
          adminUserId,
          HouseEnrollmentMethod.MANUAL,
        );
        results.push({ userId, status: 'assigned' });
      } catch (err) {
        results.push({ userId, status: err.message ?? 'failed' });
      }
    }

    return { success: true, results };
  }

  /**
   * Self-enroll: an institute member enrolls themselves in a house.
   */
  async selfEnroll(
    instituteId: string,
    houseId: string,
    userId: string,
  ): Promise<HouseActionResponseDto> {
    await this.assertInstituteExists(instituteId);
    const house = await this.findHouse(instituteId, houseId);
    await this.assertInstituteIsActiveMember(userId, instituteId);

    await this.enrollUserToHouseInternal(
      instituteId,
      houseId,
      userId,
      null,
      HouseEnrollmentMethod.SELF,
    );

    return { success: true, message: `Enrolled in house "${house.name}".` };
  }

  /**
   * Remove a user from a house (admin-initiated).
   */
  async removeUserFromHouse(
    instituteId: string,
    houseId: string,
    adminUserId: string,
    userId: string,
  ): Promise<HouseActionResponseDto> {
    await this.assertInstituteAdmin(adminUserId, instituteId);
    await this.findHouse(instituteId, houseId);

    await this.memberRepository.update(
      { houseId, instituteId, userId },
      { isActive: false, updatedAt: now() },
    );

    // Clear house_id on institute_user if still pointing to this house
    await this.instituteUserRepository.update(
      { instituteId, userId, houseId },
      { houseId: null, updatedAt: now() },
    );

    return { success: true, message: `User ${userId} removed from house.` };
  }

  /**
   * Get all members of a house with user details.
   */
  async getHouseMembers(
    instituteId: string,
    houseId: string,
    adminUserId: string,
    query: HouseMemberQueryDto,
  ): Promise<PaginatedHouseMembersDto> {
    await this.assertInstituteAdmin(adminUserId, instituteId);
    await this.findHouse(instituteId, houseId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('m.user', 'u')
      .leftJoin(
        'institute_user',
        'iu',
        'iu.institute_id = m.institute_id AND iu.user_id = m.user_id',
      )
      .select('m.id', 'm_id')
      .addSelect('m.house_id', 'm_house_id')
      .addSelect('m.user_id', 'm_user_id')
      .addSelect('m.enrollment_method', 'm_enrollment_method')
      .addSelect('m.is_active', 'm_is_active')
      .addSelect('m.created_at', 'm_created_at')
      .addSelect('u.first_name', 'u_first_name')
      .addSelect('u.last_name', 'u_last_name')
      .addSelect('u.name_with_initials', 'u_name_with_initials')
      .addSelect('u.email', 'u_email')
      .addSelect('u.phone_number', 'u_phone_number')
      .addSelect('u.nic', 'u_nic')
      .addSelect('u.image_url', 'u_image_url')
      .addSelect('iu.institute_user_type', 'iu_institute_user_type')
      .addSelect('iu.user_id_institue', 'iu_user_id_by_institute')
      .addSelect('iu.institute_user_image_url', 'iu_institute_user_image_url')
      .where('m.house_id = :houseId AND m.institute_id = :instituteId', {
        houseId,
        instituteId,
      });

    if (query.isActive !== undefined) {
      qb.andWhere('m.is_active = :isActive', { isActive: query.isActive });
    } else {
      qb.andWhere('m.is_active = true');
    }

    if (query.enrollmentMethod) {
      qb.andWhere('m.enrollment_method = :method', {
        method: query.enrollmentMethod,
      });
    }

    qb.orderBy('u.first_name', 'ASC');

    const total = await qb.getCount();
    const rows = await qb.offset(skip).limit(limit).getRawMany();

    const mapped = rows.map((r) => {
      // Institute-scoped image takes priority; fall back to global image
      const instituteImg = r.iu_institute_user_image_url
        ? this.safeFullUrl(r.iu_institute_user_image_url)
        : null;
      const globalImg = r.u_image_url
        ? this.safeFullUrl(r.u_image_url)
        : null;

      return {
        id: String(r.m_id),
        houseId: String(r.m_house_id),
        userId: String(r.m_user_id),
        firstName: r.u_first_name ?? undefined,
        lastName: r.u_last_name ?? undefined,
        nameWithInitials: r.u_name_with_initials ?? undefined,
        email: r.u_email ?? undefined,
        phoneNumber: r.u_phone_number ?? undefined,
        nic: r.u_nic ?? undefined,
        instituteUserType: r.iu_institute_user_type ?? undefined,
        userIdByInstitute: r.iu_user_id_by_institute ?? undefined,
        profileImageUrl: instituteImg ?? globalImg ?? undefined,
        enrollmentMethod: r.m_enrollment_method,
        isActive: Boolean(r.m_is_active),
        enrolledAt: r.m_created_at,
      };
    });

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: mapped,
    };
  }

  // ─── INTERNAL HELPER (used by InstituteAdminUserService as well) ──────────

  /**
   * Core enroll logic — idempotent. Re-activates if previously deactivated.
   * Also updates `house_id` on the `institute_user` row.
   */
  async enrollUserToHouseInternal(
    instituteId: string,
    houseId: string,
    userId: string,
    enrolledBy: string | null,
    method: HouseEnrollmentMethod,
  ): Promise<void> {
    // Verify the user is an active institute member
    const link = await this.instituteUserRepository.findOne({
      where: { instituteId, userId, status: InstituteUserStatus.ACTIVE },
    });
    if (!link) {
      throw new BadRequestException(
        `User ${userId} is not an active member of this institute.`,
      );
    }

    // Block if the user is already actively enrolled in a DIFFERENT house
    const activeElsewhere = await this.memberRepository.findOne({
      where: { instituteId, userId, isActive: true },
    });
    if (activeElsewhere && String(activeElsewhere.houseId) !== String(houseId)) {
      throw new ConflictException(
        `User ${userId} is already assigned to another house. Remove them from their current house first.`,
      );
    }

    const existing = await this.memberRepository.findOne({
      where: { houseId, userId, instituteId },
    });

    if (existing) {
      if (existing.isActive) return; // Already enrolled in this house — idempotent
      // Re-activate
      existing.isActive = true;
      existing.updatedAt = now();
      await this.memberRepository.save(existing);
    } else {
      await this.memberRepository.save(
        this.memberRepository.create({
          houseId,
          instituteId,
          userId,
          enrolledBy: enrolledBy ?? undefined,
          enrollmentMethod: method,
          isActive: true,
          createdAt: now(),
          updatedAt: now(),
        }),
      );
    }

    // Update house_id on institute_user
    await this.instituteUserRepository.update(
      { instituteId, userId },
      { houseId, updatedAt: now() },
    );
  }

  // ─── PRIVATE HELPERS ─────────────────────────────────────────────────────

  private async assertInstituteExists(instituteId: string): Promise<void> {
    const exists = await this.instituteRepository.findOne({
      where: { id: instituteId },
    });
    if (!exists) throw new NotFoundException(`Institute ${instituteId} not found.`);
  }

  private async assertInstituteAdmin(
    userId: string,
    instituteId: string,
  ): Promise<void> {
    const link = await this.instituteUserRepository.findOne({
      where: {
        userId,
        instituteId,
        instituteUserType: InstituteUserType.INSTITUTE_ADMIN,
        status: InstituteUserStatus.ACTIVE,
      },
    });
    if (!link) {
      throw new ForbiddenException(
        'You must be an active INSTITUTE_ADMIN of this institute.',
      );
    }
  }

  private async assertInstituteIsActiveMember(
    userId: string,
    instituteId: string,
  ): Promise<void> {
    const link = await this.instituteUserRepository.findOne({
      where: { userId, instituteId, status: InstituteUserStatus.ACTIVE },
    });
    if (!link) {
      throw new ForbiddenException(
        'You must be an active member of this institute.',
      );
    }
  }

  private async assertInstituteIsActiveAdminOrMember(
    userId: string,
    instituteId: string,
  ): Promise<void> {
    const link = await this.instituteUserRepository.findOne({
      where: { userId, instituteId, status: InstituteUserStatus.ACTIVE },
    });
    if (!link) {
      throw new ForbiddenException(
        'You must be an active member of this institute.',
      );
    }
  }

  private async assertInstitutemember(userId: string, instituteId: string): Promise<void> {
    const link = await this.instituteUserRepository.findOne({
      where: { userId, instituteId, status: InstituteUserStatus.ACTIVE },
    });
    if (!link) {
      throw new ForbiddenException(
        'You must be an active member of this institute.',
      );
    }
  }

  private async findHouse(
    instituteId: string,
    houseId: string,
  ): Promise<InstituteHouseEntity> {
    const house = await this.houseRepository.findOne({
      where: { id: houseId, instituteId },
    });
    if (!house) {
      throw new NotFoundException(
        `House ${houseId} not found in institute ${instituteId}.`,
      );
    }
    return house;
  }

  private toHouseResponse(h: InstituteHouseEntity): InstituteHouseResponseDto {
    return {
      id: h.id,
      instituteId: h.instituteId,
      name: h.name,
      color: h.color,
      description: h.description,
      imageUrl: h.imageUrl
        ? this.safeFullUrl(h.imageUrl)
        : undefined,
      isActive: h.isActive,
      createdBy: h.createdBy,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
    };
  }

  private safeFullUrl(path: string): string {
    try {
      return this.cloudStorageService.getPublicUrl(path);
    } catch {
      return path;
    }
  }
}
