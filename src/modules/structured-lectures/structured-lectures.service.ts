import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StructuredLectureEntity } from './entities/structured-lecture.entity';
import { LectureResponseDto, LectureListResponseDto, CreateLectureDto, UpdateLectureDto, LectureQueryDto } from './dto/lecture.dto';
import { now } from '../../common/utils/timezone.util';
import { sanitizeSortField, sanitizeSortOrder } from '@common/utils/query-sanitizer.util';

@Injectable()
export class StructuredLecturesService {
  constructor(
    @InjectRepository(StructuredLectureEntity)
    private readonly lectureRepository: Repository<StructuredLectureEntity>,
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

  async getLecturesBySubjectAndGrade(subjectId: string, grade: number, activeFilter: boolean) {
    // Optimize: Select only necessary fields
    return this.lectureRepository.find({
      where: { subjectId, grade, isActive: activeFilter },
      select: [
        'id',
        'instituteId',
        'classId',
        'title',
        'description',
        'subjectId',
        'grade',
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

  async getLectureStatistics(subjectId: string, grade: number) {
    const total = await this.lectureRepository.count({ where: { subjectId, grade } });
    return { total };
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
    await this.lectureRepository.delete(id);
    return { success: true };
  }

  // DTO transformation methods
  private transformEntityToDto(entity: StructuredLectureEntity): LectureResponseDto {
    // Transform attachments array to DocumentInfoDto with full URLs
    const documents = (entity.attachments || []).map((attachment: any) => {
      if (typeof attachment === 'string') {
        // If attachment is a URL string (already full URL from signed upload)
        return {
          documentUrl: attachment,
        };
      } else if (attachment && typeof attachment === 'object') {
        // If attachment is already an object with documentUrl (already full URL from signed upload)
        return {
          ...attachment,
          documentUrl: attachment.documentUrl,
        };
      }
      return attachment;
    });

    return {
      _id: entity.id,
      instituteId: entity.instituteId,
      classId: entity.classId,
      title: entity.title,
      description: entity.description || '',
      subjectId: entity.subjectId,
      grade: entity.grade,
      lessonNumber: 1, // Default value, entity doesn't have this field
      lectureNumber: 1, // Default value, entity doesn't have this field
      provider: undefined, // Entity doesn't have this field
      lectureLink: entity.videoUrl,
      coverImageUrl: entity.thumbnailUrl, // Already full URL from signed upload
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
        'lecture.classId',
        'lecture.title',
        'lecture.description',
        'lecture.subjectId',
        'lecture.grade',
        'lecture.videoUrl',
        'lecture.thumbnailUrl',
        'lecture.attachments',
        'lecture.isActive',
        'lecture.createdBy',
        'lecture.createdAt',
        'lecture.updatedAt'
      ]);

    // Filter by instituteId (important for multi-tenant)
    if (queryDto.instituteId) {
      queryBuilder.andWhere('lecture.instituteId = :instituteId', { instituteId: queryDto.instituteId });
    }

    // Filter by classId for class-level lectures
    if (queryDto.classId) {
      queryBuilder.andWhere('lecture.classId = :classId', { classId: queryDto.classId });
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
        '(lecture.title ILIKE :search OR lecture.description ILIKE :search)',
        { search: `%${queryDto.search}%` }
      );
    }

    const validLectureSortFields = ['createdAt', 'updatedAt', 'title', 'grade', 'isActive', 'startDate', 'endDate'] as const;
    const sortBy = sanitizeSortField(queryDto.sortBy, validLectureSortFields, 'createdAt');
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
      attachments = documents.map((doc: any) => ({
        documentName: doc.name || doc.documentName,
        documentUrl: doc.url || doc.documentUrl,
        documentDescription: doc.documentDescription,
      }));
    } else if (documentUrls && documentUrls.length > 0) {
      attachments = documentUrls.map((url: string) => ({
        documentUrl: url,
      }));
    }
    
    const timestamp = now();
    const lecture = this.lectureRepository.create({ 
      ...rest,
      thumbnailUrl: coverImageUrl, // Map coverImageUrl ? thumbnailUrl
      videoUrl: lectureLink, // Map lectureLink ? videoUrl
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
    const { documents, documentUrls, coverImageUrl, lectureLink, ...rest } = lectureData as any;
    
    // Prepare update data
    const updateData: any = { ...rest, updatedBy: userId };
    
    // Map DTO field names to entity field names
    if (coverImageUrl !== undefined) {
      updateData.thumbnailUrl = coverImageUrl;
    }
    if (lectureLink !== undefined) {
      updateData.videoUrl = lectureLink;
    }
    
    // Handle documents if provided
    if (documents && documents.length > 0) {
      updateData.attachments = documents.map((doc: any) => ({
        documentName: doc.name || doc.documentName,
        documentUrl: doc.url || doc.documentUrl,
        documentDescription: doc.documentDescription,
      }));
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

  async getLecturesBySubjectAndGradeAsDto(subjectId: string, grade: number, activeFilter: boolean): Promise<LectureListResponseDto> {
    // Fetch all fields to avoid timestamp deserialization issues
    const entities = await this.lectureRepository.find({
      where: { subjectId, grade, isActive: activeFilter }
    });

    return {
      lectures: entities.map(entity => this.transformEntityToDto(entity)),
      total: entities.length,
      totalPages: 1,
      currentPage: 1,
      limit: entities.length
    };
  }

  /**
   * Get lectures by class and subject - Primary method for institute-class-subject level access
   * Optimized query with proper indexing on (classId, subjectId)
   */
  async getLecturesByClassAndSubjectAsDto(
    classId: string, 
    subjectId: string, 
    grade?: number, 
    activeFilter?: boolean
  ): Promise<LectureListResponseDto> {
    const queryBuilder = this.lectureRepository.createQueryBuilder('lecture')
      .select([
        'lecture.id',
        'lecture.instituteId',
        'lecture.classId',
        'lecture.title',
        'lecture.description',
        'lecture.subjectId',
        'lecture.grade',
        'lecture.videoUrl',
        'lecture.thumbnailUrl',
        'lecture.attachments',
        'lecture.isActive',
        'lecture.createdBy',
        'lecture.createdAt',
        'lecture.updatedAt'
      ])
      .where('lecture.classId = :classId', { classId })
      .andWhere('lecture.subjectId = :subjectId', { subjectId });

    if (grade !== undefined) {
      queryBuilder.andWhere('lecture.grade = :grade', { grade });
    }

    if (activeFilter !== undefined) {
      queryBuilder.andWhere('lecture.isActive = :isActive', { isActive: activeFilter });
    }

    queryBuilder.orderBy('lecture.grade', 'ASC')
      .addOrderBy('lecture.createdAt', 'DESC');

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
