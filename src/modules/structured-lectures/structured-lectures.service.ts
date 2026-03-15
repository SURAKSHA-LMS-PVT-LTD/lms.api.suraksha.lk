import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StructuredLectureEntity } from './entities/structured-lecture.entity';
import { LectureResponseDto, LectureListResponseDto, CreateLectureDto, UpdateLectureDto, LectureQueryDto } from './dto/lecture.dto';
import { now } from '../../common/utils/timezone.util';
import { sanitizeSortField, sanitizeSortOrder } from '@common/utils/query-sanitizer.util';
import { CloudStorageService } from '../../common/services/cloud-storage.service';

@Injectable()
export class StructuredLecturesService {
  constructor(
    @InjectRepository(StructuredLectureEntity)
    private readonly lectureRepository: Repository<StructuredLectureEntity>,
    private readonly cloudStorageService: CloudStorageService,
    ) {}

  async findAll() {
    // Fetch all fields to avoid timestamp deserialization issues
    return this.lectureRepository.find();
  }

  async findOne(id: string) {
    // Fetch all fields to avoid timestamp deserialization issues
    return this.lectureRepository.findOne({ 
      where: { id }
    });
  }

  async create(data: any) {
    const timestamp = now();
    const lecture = this.lectureRepository.create({
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return this.lectureRepository.save(lecture);
  }

  async update(id: string, data: any) {
    await this.lectureRepository.update(id, data);
    // Optimize: Use the already optimized findOne method
    return this.findOne(id);
  }

  async remove(id: string) {
    return this.lectureRepository.delete(id);
  }

  // Additional methods expected by controller
  async createLecture(lectureData: any, userId: string) {
    const timestamp = now();
    const lecture = this.lectureRepository.create({ 
      ...lectureData, 
      createdBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return this.lectureRepository.save(lecture);
  }

  async getAllLectures(queryDto: any) {
    // Optimize: Use the optimized findAll method instead of basic find
    return this.findAll();
  }

  async getLecturesBySubjectAndGrade(subjectId: string, grade?: number, activeFilter?: boolean, instituteId?: string) {
    const where: any = { subjectId };
    if (instituteId !== undefined) where.instituteId = instituteId;
    if (grade !== undefined) where.grade = grade;
    if (activeFilter !== undefined) where.isActive = activeFilter;
    return this.lectureRepository.find({
      where,
      select: [
        'id',
        'instituteId',
        'title',
        'description',
        'subjectId',
        'grade',
        'lessonNumber',
        'lectureNumber',
        'provider',
        'videoUrl',
        'thumbnailUrl',
        'attachments',
        'isActive',
        'createdBy',
        'createdAt',
        'updatedAt'
      ]
    });
  }

  async getLectureStatistics(subjectId: string, grade?: number) {
    const where: any = { subjectId };
    if (grade !== undefined) where.grade = grade;

    const [total, active] = await Promise.all([
      this.lectureRepository.count({ where }),
      this.lectureRepository.count({ where: { ...where, isActive: true } }),
    ]);

    // Grade breakdown (only when not already scoped to a single grade)
    let gradeBreakdown: { grade: number; total: number; active: number }[] = [];
    if (grade === undefined) {
      const rows = await this.lectureRepository
        .createQueryBuilder('l')
        .select('l.grade', 'grade')
        .addSelect('COUNT(*)', 'total')
        .addSelect('SUM(CASE WHEN l.isActive = 1 THEN 1 ELSE 0 END)', 'active')
        .where('l.subjectId = :subjectId', { subjectId })
        .groupBy('l.grade')
        .orderBy('l.grade', 'ASC')
        .getRawMany();
      gradeBreakdown = rows.map(r => ({
        grade: Number(r.grade),
        total: Number(r.total),
        active: Number(r.active),
      }));
    }

    return {
      subjectId,
      grade: grade ?? 'all',
      total,
      active,
      inactive: total - active,
      grades: gradeBreakdown,
    };
  }

  async getLectureById(id: string) {
    // Optimize: Use the optimized findOne method instead of basic findOne
    return this.findOne(id);
  }

  async updateLecture(id: string, lectureData: any, userId: string) {
    await this.lectureRepository.update(id, lectureData);
    // Optimize: Use the optimized getLectureById method
    return this.getLectureById(id);
  }

  async deleteLecture(id: string, userId: string) {
    await this.lectureRepository.update(id, { isActive: false });
    return { success: true };
  }

  async permanentlyDeleteLecture(id: string) {
    // Fetch lecture first to get cover image path for cleanup
    const lecture = await this.lectureRepository.findOne({ where: { id } });
    if (lecture?.thumbnailUrl) {
      const url = lecture.thumbnailUrl;
      // Only delete if it's a relative path in our own storage (not an external URL)
      const isOwnStorage = !url.startsWith('http://') && !url.startsWith('https://');
      if (isOwnStorage) {
        await this.cloudStorageService.deleteFile(url).catch(() => {});
      } else {
        // Also try to extract relative path from full URL (e.g. our own GCS/S3 base URL)
        try {
          const relativePath = this.cloudStorageService.extractRelativePath(url);
          if (relativePath && relativePath.startsWith('lecture-covers/')) {
            await this.cloudStorageService.deleteFile(relativePath).catch(() => {});
          }
        } catch (_) {}
      }
    }
    await this.lectureRepository.delete(id);
    return { success: true };
  }

  // DTO transformation methods
  private transformEntityToDto(entity: StructuredLectureEntity): LectureResponseDto {
    // Transform attachments array to DocumentInfoDto with full URLs.
    // Drive URLs (https://drive.google.com/...) are returned as-is by getFullUrl.
    const documents = (entity.attachments || []).map((attachment: any) => {
      if (typeof attachment === 'string') {
        return { documentUrl: this.cloudStorageService.getFullUrl(attachment) };
      } else if (attachment && typeof attachment === 'object') {
        return {
          ...attachment, // preserves driveFileId, driveWebViewLink, source
          documentUrl: this.cloudStorageService.getFullUrl(attachment.documentUrl),
        };
      }
      return attachment;
    });

    return {
      _id: entity.id,
      instituteId: entity.instituteId,
      title: entity.title,
      description: entity.description || '',
      subjectId: entity.subjectId,
      grade: entity.grade,
      lessonNumber: entity.lessonNumber ?? 1,
      lectureNumber: entity.lectureNumber ?? 1,
      provider: entity.provider,
      lectureLink: entity.videoUrl,
      coverImageUrl: this.cloudStorageService.getFullUrl(entity.thumbnailUrl),
      documents,
      isActive: entity.isActive,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async getAllLecturesAsDto(queryDto: LectureQueryDto): Promise<LectureListResponseDto> {
    const page = queryDto.page || 1;
    const limit = queryDto.limit || 50;
    const skip = (page - 1) * limit;

    const queryBuilder = this.lectureRepository.createQueryBuilder('lecture')
      .select([
        'lecture.id',
        'lecture.instituteId',
        'lecture.title',
        'lecture.description',
        'lecture.subjectId',
        'lecture.grade',
        'lecture.lessonNumber',
        'lecture.lectureNumber',
        'lecture.provider',
        'lecture.videoUrl',
        'lecture.thumbnailUrl',
        'lecture.attachments',
        'lecture.isActive',
        'lecture.createdBy',
        'lecture.createdAt',
        'lecture.updatedAt',
      ]);

    // Filter by instituteId (important for multi-tenant)
    if (queryDto.instituteId) {
      queryBuilder.andWhere('lecture.instituteId = :instituteId', { instituteId: queryDto.instituteId });
    }

    if (queryDto.subjectId) {
      queryBuilder.andWhere('lecture.subjectId = :subjectId', { subjectId: queryDto.subjectId });
    }

    if (queryDto.grade) {
      queryBuilder.andWhere('lecture.grade = :grade', { grade: queryDto.grade });
    }

    if (queryDto.isActive !== undefined) {
      queryBuilder.andWhere('lecture.isActive = :isActive', { isActive: queryDto.isActive });
    }

    if (queryDto.search) {
      queryBuilder.andWhere(
        '(lecture.title LIKE :search OR lecture.description LIKE :search)',
        { search: `%${queryDto.search}%` }
      );
    }

    const validLectureSortFields = ['title', 'grade', 'isActive'] as const;
    const sortBy = sanitizeSortField(queryDto.sortBy, validLectureSortFields, 'grade');
    const sortOrder = sanitizeSortOrder(queryDto.sortOrder);
    queryBuilder.orderBy(`lecture.${sortBy}`, sortOrder);

    queryBuilder.skip(skip).take(limit);

    const [entities, total] = await queryBuilder.getManyAndCount();

    return {
      lectures: entities.map(entity => this.transformEntityToDto(entity)),
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit
    };
  }

  async getLectureByIdAsDto(id: string): Promise<LectureResponseDto | null> {
    const entity = await this.lectureRepository.findOne({ where: { id } });
    return entity ? this.transformEntityToDto(entity) : null;
  }

  async createLectureAsDto(lectureData: CreateLectureDto, userId: string): Promise<LectureResponseDto> {
    // Map DTO fields to entity fields
    const { documents, documentUrls, coverImageUrl, lectureLink, ...rest } = lectureData as any;
    
    // Combine documents array and documentUrls into attachments
    let attachments = [];
    
    if (documents && documents.length > 0) {
      attachments = documents.map((doc: any) => {
        const name = doc.name || doc.documentName;
        if (doc.driveFileId) {
          return {
            documentName: name,
            documentDescription: doc.documentDescription,
            driveFileId: doc.driveFileId,
            driveWebViewLink: doc.driveWebViewLink || `https://drive.google.com/file/d/${doc.driveFileId}/view`,
            documentUrl: doc.driveWebViewLink || `https://drive.google.com/file/d/${doc.driveFileId}/view`,
            source: 'GOOGLE_DRIVE',
          };
        }
        if (doc.externalUrl) {
          return {
            documentName: name || doc.linkTitle || doc.externalUrl,
            documentDescription: doc.documentDescription,
            externalUrl: doc.externalUrl,
            linkTitle: doc.linkTitle,
            documentUrl: doc.externalUrl,
            source: 'EXTERNAL_URL',
          };
        }
        return {
          documentName: name,
          documentUrl: doc.url || doc.documentUrl,
          documentDescription: doc.documentDescription,
        };
      });
    } else if (documentUrls && documentUrls.length > 0) {
      attachments = documentUrls.map((url: string) => ({ documentUrl: url }));
    }
    
    const timestamp = now();
    const lecture = this.lectureRepository.create({ 
      ...rest,
      thumbnailUrl: coverImageUrl,
      videoUrl: lectureLink,
      attachments,
      createdBy: userId,
      updatedBy: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const result = await this.lectureRepository.save(lecture);
    const savedEntity = Array.isArray(result) ? result[0] : result;
    return this.transformEntityToDto(savedEntity);
  }

  async updateLectureAsDto(id: string, lectureData: UpdateLectureDto, userId: string): Promise<LectureResponseDto> {
    // Map DTO fields to entity fields
    const { documents, documentUrls, coverImageUrl, lectureLink, lectureVideoUrl, ...rest } = lectureData as any;
    
    // Prepare update data
    const updateData: any = { ...rest, updatedBy: userId };
    
    // Map DTO field names to entity field names
    if (coverImageUrl !== undefined) {
      updateData.thumbnailUrl = coverImageUrl;
    }
    // lectureLink and lectureVideoUrl are both aliases for videoUrl
    const resolvedVideoUrl = lectureLink ?? lectureVideoUrl;
    if (resolvedVideoUrl !== undefined) {
      updateData.videoUrl = resolvedVideoUrl;
    }
    
    // Handle documents if provided
    if (documents && documents.length > 0) {
      updateData.attachments = documents.map((doc: any) => {
        const name = doc.name || doc.documentName;
        if (doc.driveFileId) {
          return {
            documentName: name,
            documentDescription: doc.documentDescription,
            driveFileId: doc.driveFileId,
            driveWebViewLink: doc.driveWebViewLink || `https://drive.google.com/file/d/${doc.driveFileId}/view`,
            documentUrl: doc.driveWebViewLink || `https://drive.google.com/file/d/${doc.driveFileId}/view`,
            source: 'GOOGLE_DRIVE',
          };
        }
        if (doc.externalUrl) {
          return {
            documentName: name || doc.linkTitle || doc.externalUrl,
            documentDescription: doc.documentDescription,
            externalUrl: doc.externalUrl,
            linkTitle: doc.linkTitle,
            documentUrl: doc.externalUrl,
            source: 'EXTERNAL_URL',
          };
        }
        return {
          documentName: name,
          documentUrl: doc.url || doc.documentUrl,
          documentDescription: doc.documentDescription,
        };
      });
    } else if (documentUrls && documentUrls.length > 0) {
      updateData.attachments = documentUrls.map((url: string) => ({
        documentUrl: url,
      }));
    }
    
    await this.lectureRepository.update(id, updateData);
    const entity = await this.getLectureById(id);
    if (!entity) {
      throw new Error(`Lecture with id ${id} not found`);
    }
    return this.transformEntityToDto(entity);
  }

  async getLecturesBySubjectAndGradeAsDto(subjectId: string, grade?: number, activeFilter?: boolean, instituteId?: string): Promise<LectureListResponseDto> {
    const where: any = { subjectId };
    if (instituteId !== undefined) where.instituteId = instituteId;
    if (grade !== undefined) where.grade = grade;
    if (activeFilter !== undefined) where.isActive = activeFilter;
    const entities = await this.lectureRepository.find({ where });

    return {
      lectures: entities.map(entity => this.transformEntityToDto(entity)),
      total: entities.length,
      totalPages: 1,
      currentPage: 1,
      limit: entities.length
    };
  }

  /**
   * Get lectures by institute and subject - primary method for student access
   * All classes in the institute studying this subject see the same lectures
   */
  async getLecturesByInstituteAndSubjectAsDto(
    instituteId: string,
    subjectId: string,
    grade?: number,
    activeFilter?: boolean
  ): Promise<LectureListResponseDto> {
    const queryBuilder = this.lectureRepository.createQueryBuilder('lecture')
      .select([
        'lecture.id',
        'lecture.instituteId',
        'lecture.title',
        'lecture.description',
        'lecture.subjectId',
        'lecture.grade',
        'lecture.lessonNumber',
        'lecture.lectureNumber',
        'lecture.provider',
        'lecture.videoUrl',
        'lecture.thumbnailUrl',
        'lecture.attachments',
        'lecture.isActive',
        'lecture.createdBy',
        'lecture.createdAt',
        'lecture.updatedAt',
      ])
      .where('lecture.instituteId = :instituteId', { instituteId })
      .andWhere('lecture.subjectId = :subjectId', { subjectId });

    if (grade !== undefined) {
      queryBuilder.andWhere('lecture.grade = :grade', { grade });
    }

    if (activeFilter !== undefined) {
      queryBuilder.andWhere('lecture.isActive = :isActive', { isActive: activeFilter });
    }

    queryBuilder.orderBy('lecture.grade', 'ASC').addOrderBy('lecture.isActive', 'DESC');

    const entities = await queryBuilder.getMany();

    return {
      lectures: entities.map(entity => this.transformEntityToDto(entity)),
      total: entities.length,
      totalPages: 1,
      currentPage: 1,
      limit: entities.length
    };
  }
}
