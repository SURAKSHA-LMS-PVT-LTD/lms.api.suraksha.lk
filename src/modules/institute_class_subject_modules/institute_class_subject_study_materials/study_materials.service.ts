import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudyMaterialEntity } from './entities/study_material.entity';
import { CreateStudyMaterialDto } from './dto/create-study-material.dto';
import { UpdateStudyMaterialDto } from './dto/update-study-material.dto';
import { QueryStudyMaterialDto } from './dto/query-study-material.dto';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

@Injectable()
export class StudyMaterialsService {
  constructor(
    @InjectRepository(StudyMaterialEntity)
    private readonly repo: Repository<StudyMaterialEntity>,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  /** Resolve S3 relative paths into full public URLs. */
  private transformUrls(item: StudyMaterialEntity): StudyMaterialEntity {
    if (item.fileUrl && item.source === 'S3') {
      item.fileUrl = this.cloudStorageService.getFullUrl(item.fileUrl);
    }
    if (item.thumbnailUrl) {
      item.thumbnailUrl = this.cloudStorageService.getFullUrl(item.thumbnailUrl);
    }
    return item;
  }

  async create(dto: CreateStudyMaterialDto, userId?: string): Promise<StudyMaterialEntity> {
    if (!dto.instituteId) throw new BadRequestException('instituteId is required');
    if (!dto.subjectId) throw new BadRequestException('subjectId is required');
    if (!dto.title?.trim()) throw new BadRequestException('title is required');

    const entity = this.repo.create({
      ...dto,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      createdById: userId || null,
    });

    const saved = await this.repo.save(entity);
    return this.transformUrls(saved);
  }

  async findAll(query: QueryStudyMaterialDto): Promise<{ data: StudyMaterialEntity[]; total: number }> {
    const qb = this.repo.createQueryBuilder('sm')
      .leftJoin('sm.createdBy', 'creator')
      .addSelect(['creator.id', 'creator.firstName', 'creator.lastName'])
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
    data.forEach(d => this.transformUrls(d));
    return { data, total };
  }

  async findOne(id: string): Promise<StudyMaterialEntity> {
    const item = await this.repo.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!item) throw new NotFoundException('Study material not found');
    return this.transformUrls(item);
  }

  async update(id: string, dto: UpdateStudyMaterialDto): Promise<StudyMaterialEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Study material not found');

    // Merge only provided fields
    Object.assign(item, {
      ...dto,
      title: dto.title !== undefined ? dto.title.trim() : item.title,
      description: dto.description !== undefined ? dto.description?.trim() : item.description,
    });

    const saved = await this.repo.save(item);
    return this.transformUrls(saved);
  }

  async remove(id: string): Promise<void> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Study material not found');
    await this.repo.remove(item);
  }

  async toggleActive(id: string): Promise<StudyMaterialEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Study material not found');
    item.isActive = !item.isActive;
    const saved = await this.repo.save(item);
    return this.transformUrls(saved);
  }

  async reorder(ids: string[]): Promise<void> {
    const updates = ids.map((matId, idx) =>
      this.repo.update(matId, { sortOrder: idx }),
    );
    await Promise.all(updates);
  }
}
