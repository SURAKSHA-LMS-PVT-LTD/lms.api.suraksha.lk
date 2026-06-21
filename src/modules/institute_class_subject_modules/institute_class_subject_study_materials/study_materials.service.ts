import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { StudyMaterialEntity } from './entities/study_material.entity';
import { StudyMaterialFolderEntity } from './entities/study_material_folder.entity';
import { CreateStudyMaterialDto } from './dto/create-study-material.dto';
import { UpdateStudyMaterialDto } from './dto/update-study-material.dto';
import { QueryStudyMaterialDto } from './dto/query-study-material.dto';
import { CreateFolderDto, UpdateFolderDto } from './dto/create-folder.dto';
import { InstituteAccessValidator } from '../../../common/helpers/institute-access-validator.helper';

@Injectable()
export class StudyMaterialsService {
  constructor(
    @InjectRepository(StudyMaterialEntity)
    private readonly repo: Repository<StudyMaterialEntity>,
    @InjectRepository(StudyMaterialFolderEntity)
    private readonly folderRepo: Repository<StudyMaterialFolderEntity>,
  ) {}

  // ── Folders ───────────────────────────────────────────────────────────────

  async listFolders(instituteId: string, classId: string): Promise<StudyMaterialFolderEntity[]> {
    return this.folderRepo.find({
      where: { instituteId, classId, isActive: true },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async createFolder(dto: CreateFolderDto, user?: any): Promise<StudyMaterialFolderEntity> {
    if (user) InstituteAccessValidator.validateInstituteAccess(user, dto.instituteId);
    const userId = user?.s || user?.id || user?.userId || null;
    const entity = this.folderRepo.create({
      ...dto,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      createdById: userId,
    });
    return this.folderRepo.save(entity);
  }

  async updateFolder(id: string, dto: UpdateFolderDto, user?: any): Promise<StudyMaterialFolderEntity> {
    const folder = await this.folderRepo.findOne({ where: { id } });
    if (!folder) throw new NotFoundException('Folder not found');
    if (user) InstituteAccessValidator.validateInstituteAccess(user, folder.instituteId);
    if (dto.name !== undefined) folder.name = dto.name.trim();
    if (dto.description !== undefined) folder.description = dto.description?.trim() || null;
    if (dto.sortOrder !== undefined) folder.sortOrder = dto.sortOrder;
    return this.folderRepo.save(folder);
  }

  async deleteFolder(id: string, user?: any): Promise<void> {
    const folder = await this.folderRepo.findOne({ where: { id } });
    if (!folder) throw new NotFoundException('Folder not found');
    if (user) InstituteAccessValidator.validateInstituteAccess(user, folder.instituteId);
    // Move materials in folder to root (null folderId)
    await this.repo.update({ folderId: id }, { folderId: null });
    // Move sub-folders to root
    await this.folderRepo.update({ parentId: id }, { parentId: null });
    await this.folderRepo.remove(folder);
  }

  // ── Materials ─────────────────────────────────────────────────────────────

  async create(dto: CreateStudyMaterialDto, user?: any): Promise<StudyMaterialEntity> {
    if (!dto.instituteId) throw new BadRequestException('instituteId is required');
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    if (dto.accessLevel === 'PAID_ONLY' && !dto.requiredPaymentId) {
      throw new BadRequestException('requiredPaymentId is required when accessLevel is PAID_ONLY');
    }
    if (dto.materialType === 'FILE' && !dto.fileUrl) {
      throw new BadRequestException('fileUrl is required for FILE type materials');
    }
    if (dto.materialType === 'LINK' && !dto.fileUrl) {
      throw new BadRequestException('fileUrl is required for LINK type materials');
    }
    if (user) InstituteAccessValidator.validateInstituteAccess(user, dto.instituteId);

    const userId = user?.s || user?.id || user?.userId || null;
    const entity = this.repo.create({
      ...dto,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      accessLevel: dto.accessLevel ?? 'ENROLLED_ONLY',
      createdById: userId,
    });
    return this.repo.save(entity);
  }

  async findAll(
    query: QueryStudyMaterialDto,
    isAdminOrTeacher = false,
    userId?: string,
  ): Promise<{ data: StudyMaterialEntity[]; total: number }> {
    const qb = this.repo.createQueryBuilder('sm')
      .leftJoinAndSelect('sm.createdBy', 'creator')
      .leftJoinAndSelect('sm.folder', 'folder')
      .orderBy('sm.sortOrder', 'ASC')
      .addOrderBy('sm.createdAt', 'DESC');

    if (query.instituteId) qb.andWhere('sm.instituteId = :instituteId', { instituteId: query.instituteId });
    if (query.classId) qb.andWhere('sm.classId = :classId', { classId: query.classId });
    if (query.subjectId) qb.andWhere('sm.subjectId = :subjectId', { subjectId: query.subjectId });

    // Folder filter: 'root' = no folder, specific ID = that folder, omitted = all
    if (query.folderId === 'root') {
      qb.andWhere('sm.folderId IS NULL');
    } else if (query.folderId) {
      qb.andWhere('sm.folderId = :folderId', { folderId: query.folderId });
    }

    if (!isAdminOrTeacher) {
      qb.andWhere('sm.isActive = true');
    }
    if (query.isActive !== undefined) {
      qb.andWhere('sm.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.search) {
      qb.andWhere('(sm.title LIKE :s OR sm.description LIKE :s)', { s: `%${query.search}%` });
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 100, 200);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    // For students: attach payment verification status to PAID_ONLY materials
    if (!isAdminOrTeacher && userId && data.some(m => m.accessLevel === 'PAID_ONLY')) {
      const paymentIds = [...new Set(data.filter(m => m.requiredPaymentId).map(m => m.requiredPaymentId!))];
      const verifiedPayments = await this.getVerifiedPayments(userId, paymentIds);
      return {
        data: data.map(m => ({
          ...m,
          _paymentVerified: m.accessLevel !== 'PAID_ONLY' || verifiedPayments.has(m.requiredPaymentId!),
        } as any)),
        total,
      };
    }

    return { data, total };
  }

  private async getVerifiedPayments(userId: string, paymentIds: string[]): Promise<Set<string>> {
    if (!paymentIds.length) return new Set();
    const result = await this.repo.manager.query(
      `SELECT DISTINCT payment_id FROM institute_class_payment_submissions
       WHERE user_id = ? AND payment_id IN (?) AND status = 'VERIFIED'`,
      [userId, paymentIds],
    );
    return new Set(result.map((r: any) => String(r.payment_id)));
  }

  async findOne(id: string): Promise<StudyMaterialEntity> {
    const item = await this.repo.findOne({ where: { id }, relations: ['createdBy', 'folder'] });
    if (!item) throw new NotFoundException('Study material not found');
    return item;
  }

  async update(id: string, dto: UpdateStudyMaterialDto, user?: any): Promise<StudyMaterialEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Study material not found');
    if (user) InstituteAccessValidator.validateInstituteAccess(user, item.instituteId);
    if ((dto as any).accessLevel === 'PAID_ONLY' && !(dto as any).requiredPaymentId && !item.requiredPaymentId) {
      throw new BadRequestException('requiredPaymentId is required when accessLevel is PAID_ONLY');
    }
    Object.assign(item, {
      ...dto,
      title: dto.title !== undefined ? dto.title.trim() : item.title,
      description: dto.description !== undefined ? dto.description?.trim() : item.description,
    });
    return this.repo.save(item);
  }

  async remove(id: string, user?: any): Promise<void> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Study material not found');
    if (user) InstituteAccessValidator.validateInstituteAccess(user, item.instituteId);
    await this.repo.remove(item);
  }

  async toggleActive(id: string, user?: any): Promise<StudyMaterialEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Study material not found');
    if (user) InstituteAccessValidator.validateInstituteAccess(user, item.instituteId);
    item.isActive = !item.isActive;
    return this.repo.save(item);
  }

  async reorder(ids: string[]): Promise<void> {
    await Promise.all(ids.map((matId, idx) => this.repo.update(matId, { sortOrder: idx })));
  }

  async checkPaymentAccess(materialId: string, userId: string): Promise<{ hasAccess: boolean; paymentId?: string }> {
    const material = await this.repo.findOne({ where: { id: materialId } });
    if (!material) throw new NotFoundException('Study material not found');
    if (material.accessLevel !== 'PAID_ONLY' || !material.requiredPaymentId) {
      return { hasAccess: true };
    }
    const verified = await this.getVerifiedPayments(userId, [material.requiredPaymentId]);
    return {
      hasAccess: verified.has(material.requiredPaymentId),
      paymentId: material.requiredPaymentId,
    };
  }
}
