import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudyMaterialEntity } from './entities/study_material.entity';
import { CreateStudyMaterialDto } from './dto/create-study-material.dto';
import { UpdateStudyMaterialDto } from './dto/update-study-material.dto';
import { QueryStudyMaterialDto } from './dto/query-study-material.dto';
import { InstituteAccessValidator } from '../../../common/helpers/institute-access-validator.helper';

@Injectable()
export class StudyMaterialsService {
  constructor(
    @InjectRepository(StudyMaterialEntity)
    private readonly repo: Repository<StudyMaterialEntity>,
  ) {}

  async create(dto: CreateStudyMaterialDto, user?: any): Promise<StudyMaterialEntity> {
    if (!dto.instituteId) throw new BadRequestException('instituteId is required');
    if (!dto.subjectId) throw new BadRequestException('subjectId is required');
    if (!dto.title?.trim()) throw new BadRequestException('title is required');

    // Validate user has access to this institute
    if (user) {
      InstituteAccessValidator.validateInstituteAccess(user, dto.instituteId);
    }

    // Validate FILE type has a fileUrl
    if (dto.materialType === 'FILE' && !dto.fileUrl) {
      throw new BadRequestException('fileUrl is required for FILE type materials');
    }
    // Validate LINK type has a URL
    if (dto.materialType === 'LINK' && !dto.fileUrl) {
      throw new BadRequestException('fileUrl is required for LINK type materials');
    }

    const userId = user?.s || user?.id || user?.userId || null;

    const entity = this.repo.create({
      ...dto,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      createdById: userId,
    });

    const saved = await this.repo.save(entity);
    return saved;
  }

  async findAll(query: QueryStudyMaterialDto): Promise<{ data: StudyMaterialEntity[]; total: number }> {
    const qb = this.repo.createQueryBuilder('sm')
      .leftJoinAndSelect('sm.createdBy', 'creator')
      .orderBy('sm.sortOrder', 'ASC')
      .addOrderBy('sm.createdAt', 'DESC');

    if (query.instituteId) {
      qb.andWhere('sm.instituteId = :instituteId', { instituteId: query.instituteId });
    }
    if (query.classId) {
      qb.andWhere('sm.classId = :classId', { classId: query.classId });
    }
    if (query.subjectId) {
      qb.andWhere('sm.subjectId = :subjectId', { subjectId: query.subjectId });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('sm.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.search) {
      qb.andWhere('(sm.title LIKE :s OR sm.description LIKE :s)', { s: `%${query.search}%` });
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<StudyMaterialEntity> {
    const item = await this.repo.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!item) throw new NotFoundException('Study material not found');
    return item;
  }

  async update(id: string, dto: UpdateStudyMaterialDto, user?: any): Promise<StudyMaterialEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Study material not found');

    // Validate user has access to this material's institute
    if (user) {
      InstituteAccessValidator.validateInstituteAccess(user, item.instituteId);
    }

    // Merge only provided fields
    Object.assign(item, {
      ...dto,
      title: dto.title !== undefined ? dto.title.trim() : item.title,
      description: dto.description !== undefined ? dto.description?.trim() : item.description,
    });

    const saved = await this.repo.save(item);
    return saved;
  }

  async remove(id: string, user?: any): Promise<void> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Study material not found');

    // Validate user has access to this material's institute
    if (user) {
      InstituteAccessValidator.validateInstituteAccess(user, item.instituteId);
    }

    await this.repo.remove(item);
  }

  async toggleActive(id: string, user?: any): Promise<StudyMaterialEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Study material not found');

    // Validate user has access to this material's institute
    if (user) {
      InstituteAccessValidator.validateInstituteAccess(user, item.instituteId);
    }

    item.isActive = !item.isActive;
    const saved = await this.repo.save(item);
    return saved;
  }

  async reorder(ids: string[]): Promise<void> {
    const updates = ids.map((matId, idx) =>
      this.repo.update(matId, { sortOrder: idx }),
    );
    await Promise.all(updates);
  }
}
