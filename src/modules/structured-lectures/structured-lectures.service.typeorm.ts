import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindManyOptions, SelectQueryBuilder, Not, In } from 'typeorm';
import { LectureEntity } from './entities/lecture.entity';
import { LectureDocumentEntity } from './entities/lecture.entity'; // Both entities are in same file
import { CreateLectureDto, UpdateLectureDto } from './dto/lecture.dto';
import { CloudStorageService } from '../../common/services/cloud-storage.service';
import { LectureResponseDto, LectureListResponseDto, LectureQueryDto } from './dto/lecture.dto';
import { sanitizeSortField, sanitizeSortOrder } from '@common/utils/query-sanitizer.util';

@Injectable()
export class StructuredLecturesServiceTypeorm {
  /**
   * Transform LectureEntity to LectureResponseDto
   * Maps entity fields to DTO format with proper null/undefined handling
   */
  private transformEntityToDto(entity: LectureEntity | Partial<LectureEntity>): LectureResponseDto {
    // Transform documents to proper format with full URLs
    const transformedDocuments = entity.documents && entity.documents.length > 0
      ? entity.documents.map(doc => ({
          documentName: doc.documentName,
          documentUrl: doc.documentUrl,
          documentDescription: doc.documentDescription || undefined,
          // Support alternative field names for backward compatibility
          name: doc.documentName,
          url: doc.documentUrl,
        }))
      : [];

    return {
      _id: entity.id,
      instituteId: entity.instituteId ?? undefined,
      subjectId: entity.subjectId,
      grade: entity.grade,
      title: entity.title,
      description: entity.description || '',
      lessonNumber: entity.lessonNumber ?? 1,
      lectureNumber: entity.lectureNumber ?? 1,
      provider: entity.provider ?? undefined,
      lectureLink: entity.lectureLink || entity.videoUrl || undefined,
      coverImageUrl: entity.coverImageUrl || entity.thumbnailUrl || undefined,
      documents: transformedDocuments,
      isActive: entity.isActive ?? true,
      createdBy: entity.createdBy ?? undefined,
      updatedBy: entity.updatedBy ?? undefined,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * Create a new lecture and return as DTO (for controller compatibility)
   */
  async createLectureAsDto(lectureData: CreateLectureDto, userId: string): Promise<LectureResponseDto> {
    // Check for duplicate titles within the same subject and grade
    const existingLecture = await this.lectureRepository.findOne({
      where: {
        title: lectureData.title,
        subjectId: lectureData.subjectId,
        grade: lectureData.grade
      }
    });

    if (existingLecture) {
      throw new ConflictException('A lecture with this title already exists for this subject and grade');
    }

    // Process cover image URL
    const processedCoverImageUrl = this.processCoverImageUrl(lectureData.coverImageUrl);

    const lecture = this.lectureRepository.create({
      ...lectureData,
      coverImageUrl: processedCoverImageUrl,
      createdBy: userId,
      updatedBy: userId,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const savedLecture = await this.lectureRepository.save(lecture);

    // Save document records if documentUrls provided
    const documents: LectureDocumentEntity[] = [];
    if (lectureData.documentUrls && lectureData.documentUrls.length > 0) {
      for (const [index, docUrl] of lectureData.documentUrls.entries()) {
        const document = this.lectureDocumentRepository.create({
          lectureId: savedLecture.id,
          documentName: `Document ${index + 1}`,
          documentUrl: docUrl,
          documentDescription: `Lecture document ${index + 1}`,
          uploadedAt: new Date(),
        });
        const savedDoc = await this.lectureDocumentRepository.save(document);
        documents.push(savedDoc);
      }
    }

    savedLecture.documents = documents;

    return this.transformEntityToDto(savedLecture);
  }

  /**
   * Get all lectures as paginated DTOs (for controller compatibility)
   */
  async getAllLecturesAsDto(queryDto: LectureQueryDto): Promise<LectureListResponseDto> {
    const page = queryDto.page || 1;
    const limit = queryDto.limit || 50;
    const skip = (page - 1) * limit;

    const queryBuilder = this.lectureRepository.createQueryBuilder('lecture')
      .orderBy('lecture.createdAt', queryDto.sortOrder || 'DESC');

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
    if (queryDto.sortBy) {
      const validLectureSortFields = ['createdAt', 'updatedAt', 'title', 'grade', 'isActive', 'startDate', 'endDate'] as const;
      const safeSortBy = sanitizeSortField(queryDto.sortBy, validLectureSortFields, 'createdAt');
      queryBuilder.orderBy(`lecture.${safeSortBy}`, sanitizeSortOrder(queryDto.sortOrder));
    }

    queryBuilder.skip(skip).take(limit);

    const [entities, total] = await queryBuilder.getManyAndCount();

    // Load documents for each lecture separately
    const lecturesWithDocuments = await Promise.all(
      entities.map(async (lecture) => {
        const documents = await this.lectureDocumentRepository.find({
          where: { lectureId: lecture.id },
          order: { uploadedAt: 'DESC' }
        });
        return { ...lecture, documents };
      })
    );

    return {
      lectures: lecturesWithDocuments.map(entity => this.transformEntityToDto(entity)),
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit,
    };
  }
  constructor(
    @InjectRepository(LectureEntity)
    private readonly lectureRepository: Repository<LectureEntity>,
    @InjectRepository(LectureDocumentEntity)
    private readonly lectureDocumentRepository: Repository<LectureDocumentEntity>,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  /**
   * Process and validate cover image URL to ensure it's properly accessible
   * @param coverImageUrl - The cover image URL to process
   */
  private processCoverImageUrl(coverImageUrl: string | null): string | null {
    if (!coverImageUrl) {
      return null;
    }

    // If it's already a valid GCS public URL, return as is
    if (coverImageUrl.startsWith('https://storage.googleapis.com/')) {
      return coverImageUrl;
    }

    // If it's a relative path or GCS key, convert to public URL
    if (coverImageUrl.startsWith('lectures/covers/') || !coverImageUrl.startsWith('http')) {
      // Remove leading slash if present
      const cleanKey = coverImageUrl.startsWith('/') ? coverImageUrl.substring(1) : coverImageUrl;
      return this.cloudStorageService.getPublicUrl(cleanKey);
    }

    // For other URLs (external links), return as is
    return coverImageUrl;
  }

  /**
   * Process lecture data to ensure cover images are properly formatted
   * @param lecture - Raw lecture data from database
   */
  private processLectureData(lecture: LectureEntity | Partial<LectureEntity>): any {
    return {
      ...lecture,
      coverImageUrl: this.processCoverImageUrl(lecture.coverImageUrl),
      documents: lecture.documents || []
    };
  }

  /**
   * Transform documents to include proper URLs
   * @param documents - Array of lecture documents
   */
  private transformDocuments(documents: LectureDocumentEntity[]): any[] {
    return documents.map(doc => ({
      id: doc.id,
      documentName: doc.documentName,
      documentUrl: doc.documentUrl,
      documentDescription: doc.documentDescription,
      uploadedAt: doc.uploadedAt,
      downloadUrl: this.cloudStorageService.getPublicUrl(doc.documentUrl)
    }));
  }

  /**
   * Create a new lecture
   */
  async createLecture(createLectureDto: CreateLectureDto): Promise<LectureEntity> {
    // Check for duplicate titles within the same subject and grade
    const existingLecture = await this.lectureRepository.findOne({
      where: {
        title: createLectureDto.title,
        subjectId: createLectureDto.subjectId,
        grade: createLectureDto.grade
      }
    });

    if (existingLecture) {
      throw new ConflictException('A lecture with this title already exists for this subject and grade');
    }

    // Process cover image URL
    const processedCoverImageUrl = this.processCoverImageUrl(createLectureDto.coverImageUrl);

    const lecture = this.lectureRepository.create({
      ...createLectureDto,
      coverImageUrl: processedCoverImageUrl,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const savedLecture = await this.lectureRepository.save(lecture);
    
    // Load with relations
    const lectureWithRelations = await this.lectureRepository.findOne({
      where: { id: savedLecture.id },
      relations: ['documents']
    });

    return this.processLectureData(lectureWithRelations);
  }

  /**
   * Get all lectures with advanced filtering, search, and pagination
   */
  async getAllLectures(query: LectureQueryDto): Promise<{
    lectures: LectureEntity[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const {
      page = 1,
      limit = 10,
      search,
      subjectId,
      grade,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = query;

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build query with TypeORM QueryBuilder for complex filtering
    let queryBuilder: SelectQueryBuilder<LectureEntity> = this.lectureRepository
      .createQueryBuilder('lecture')
      .leftJoinAndSelect('lecture.documents', 'documents')
      .orderBy(`lecture.${sanitizeSortField(sortBy, ['createdAt', 'updatedAt', 'title', 'grade', 'isActive', 'startDate', 'endDate'])}`, sanitizeSortOrder(sortOrder));

    // Apply filters
    if (search) {
      queryBuilder = queryBuilder.andWhere(
        '(lecture.title LIKE :search OR lecture.description LIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (subjectId) {
      queryBuilder = queryBuilder.andWhere('lecture.subjectId = :subjectId', { subjectId });
    }

    if (grade) {
      queryBuilder = queryBuilder.andWhere('lecture.grade = :grade', { grade });
    }

    if (isActive !== undefined) {
      queryBuilder = queryBuilder.andWhere('lecture.isActive = :isActive', { isActive });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination
    const lectures = await queryBuilder
      .skip(skip)
      .take(limitNum)
      .getMany();

    // Process lecture data
    const processedLectures = lectures.map(lecture => this.processLectureData(lecture));

    return {
      lectures: processedLectures,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * Get lectures by subject with pagination
   */
  async getLecturesBySubject(
    subjectId: string, 
    grade?: number, 
    page: number = 1, 
    limit: number = 10
  ): Promise<{
    lectures: LectureEntity[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));

    const whereConditions: any = { 
      subjectId,
      isActive: true 
    };

    if (grade) {
      whereConditions.grade = grade;
    }

    const [lectures, total] = await this.lectureRepository.findAndCount({
      where: whereConditions,
      relations: ['documents'],
      order: { createdAt: 'DESC' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum
    });

    const processedLectures = lectures.map(lecture => this.processLectureData(lecture));

    return {
      lectures: processedLectures,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * Get lectures by grade with pagination
   */
  async getLecturesByGrade(
    grade: number, 
    subjectId?: string,
    page: number = 1, 
    limit: number = 10
  ): Promise<{
    lectures: LectureEntity[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));

    const whereConditions: any = { 
      grade,
      isActive: true 
    };

    if (subjectId) {
      whereConditions.subjectId = subjectId;
    }

    const [lectures, total] = await this.lectureRepository.findAndCount({
      where: whereConditions,
      relations: ['documents'],
      order: { createdAt: 'DESC' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum
    });

    const processedLectures = lectures.map(lecture => this.processLectureData(lecture));

    return {
      lectures: processedLectures,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * Get lecture by ID
   */
  async getLectureById(id: string): Promise<LectureEntity> {
    const lecture = await this.lectureRepository.findOne({
      where: { id },
      relations: ['documents']
    });

    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    return this.processLectureData(lecture);
  }

  /**
   * Update lecture by ID
   */
  async updateLecture(id: string, updateLectureDto: UpdateLectureDto): Promise<LectureEntity> {
    const lecture = await this.lectureRepository.findOne({
      where: { id },
      relations: ['documents']
    });

    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    // If title is being updated, check for conflicts
    if (updateLectureDto.title && updateLectureDto.title !== lecture.title) {
      const existingLecture = await this.lectureRepository.findOne({
        where: {
          title: updateLectureDto.title,
          subjectId: updateLectureDto.subjectId || lecture.subjectId,
          grade: updateLectureDto.grade || lecture.grade,
          id: Not(id) // Exclude current lecture
        }
      });

      if (existingLecture) {
        throw new ConflictException('A lecture with this title already exists for this subject and grade');
      }
    }

    // Process cover image URL if provided
    if (updateLectureDto.coverImageUrl !== undefined) {
      updateLectureDto.coverImageUrl = this.processCoverImageUrl(updateLectureDto.coverImageUrl);
    }

    // Update lecture
    await this.lectureRepository.update(id, {
      ...updateLectureDto,
      updatedAt: new Date()
    });

    // Fetch updated lecture with relations
    const updatedLecture = await this.lectureRepository.findOne({
      where: { id },
      relations: ['documents']
    });

    return this.processLectureData(updatedLecture);
  }



  /**
   * Add document to lecture
   */
  async addDocumentToLecture(
    lectureId: string,
    documentData: {
      documentName: string;
      documentUrl: string;
      documentDescription?: string;
    }
  ): Promise<LectureDocumentEntity> {
    const lecture = await this.lectureRepository.findOne({
      where: { id: lectureId }
    });

    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${lectureId} not found`);
    }

    const document = this.lectureDocumentRepository.create({
      ...documentData,
      lectureId,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const savedDocument = await this.lectureDocumentRepository.save(document);

    // Return with downloadUrl as a computed property
    return {
      id: savedDocument.id,
      lectureId: savedDocument.lectureId,
      documentName: savedDocument.documentName,
      documentUrl: savedDocument.documentUrl,
      documentDescription: savedDocument.documentDescription,
      uploadedAt: savedDocument.uploadedAt,
      createdAt: savedDocument.createdAt,
      updatedAt: savedDocument.updatedAt,
      downloadUrl: this.cloudStorageService.getPublicUrl(savedDocument.documentUrl)
    } as LectureDocumentEntity & { downloadUrl: string };
  }

  /**
   * Remove document from lecture
   */
  async removeDocumentFromLecture(lectureId: string, documentId: string): Promise<{ message: string }> {
    const document = await this.lectureDocumentRepository.findOne({
      where: { 
        id: documentId,
        lectureId: lectureId
      }
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${documentId} not found in lecture ${lectureId}`);
    }

    await this.lectureDocumentRepository.remove(document);

    return { message: 'Document removed from lecture successfully' };
  }

  /**
   * Get lecture documents
   */
  async getLectureDocuments(lectureId: string): Promise<LectureDocumentEntity[]> {
    const lecture = await this.lectureRepository.findOne({
      where: { id: lectureId }
    });

    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${lectureId} not found`);
    }

    const documents = await this.lectureDocumentRepository.find({
      where: { lectureId: lectureId },
      order: { createdAt: 'DESC' }
    });

    return this.transformDocuments(documents);
  }

  /**
   * Search lectures with advanced text search
   */
  async searchLectures(
    searchTerm: string,
    options: {
      subjectId?: string;
      grade?: number;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{
    lectures: LectureEntity[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const { subjectId, grade, page = 1, limit = 10 } = options;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));

    let queryBuilder = this.lectureRepository
      .createQueryBuilder('lecture')
      .leftJoinAndSelect('lecture.documents', 'documents')
      .where(
        '(lecture.title LIKE :search OR lecture.description LIKE :search)',
        { search: `%${searchTerm}%` }
      )
      .andWhere('lecture.isActive = :isActive', { isActive: true });

    if (subjectId) {
      queryBuilder = queryBuilder.andWhere('lecture.subjectId = :subjectId', { subjectId });
    }

    if (grade) {
      queryBuilder = queryBuilder.andWhere('lecture.grade = :grade', { grade });
    }

    const total = await queryBuilder.getCount();

    const lectures = await queryBuilder
      .orderBy('lecture.createdAt', 'DESC')
      .skip((pageNum - 1) * limitNum)
      .take(limitNum)
      .getMany();

    const processedLectures = lectures.map(lecture => this.processLectureData(lecture));

    return {
      lectures: processedLectures,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    };
  }

  /**
   * Get lecture statistics
   */
  async getLectureStats(): Promise<{
    totalLectures: number;
    totalActiveLectures: number;
    totalInactiveLectures: number;
    lecturesBySubject: Array<{ subjectId: string; count: number }>;
    recentLectures: LectureEntity[];
  }> {
    const [totalLectures, totalActiveLectures, totalInactiveLectures] = await Promise.all([
      this.lectureRepository.count(),
      this.lectureRepository.count({ where: { isActive: true } }),
      this.lectureRepository.count({ where: { isActive: false } })
    ]);

    // Get lectures by subject
    const lecturesBySubjectRaw = await this.lectureRepository
      .createQueryBuilder('lecture')
      .select('lecture.subjectId', 'subjectId')
      .addSelect('COUNT(*)', 'count')
      .where('lecture.isActive = :isActive', { isActive: true })
      .groupBy('lecture.subjectId')
      .orderBy('count', 'DESC')
      .getRawMany();

    const lecturesBySubject = lecturesBySubjectRaw.map(item => ({
      subjectId: item.subjectId,
      count: parseInt(item.count)
    }));

    // Get recent lectures
    const recentLectures = await this.lectureRepository.find({
      where: { isActive: true },
      relations: ['documents'],
      order: { createdAt: 'DESC' },
      take: 5
    });

    const processedRecentLectures = recentLectures.map(lecture => this.processLectureData(lecture));

    return {
      totalLectures,
      totalActiveLectures,
      totalInactiveLectures,
      lecturesBySubject,
      recentLectures: processedRecentLectures
    };
  }

  /**
   * Toggle lecture active status
   */
  async toggleLectureStatus(id: string): Promise<LectureEntity> {
    const lecture = await this.lectureRepository.findOne({
      where: { id },
      relations: ['documents']
    });

    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    await this.lectureRepository.update(id, {
      isActive: !lecture.isActive,
      updatedAt: new Date()
    });

    const updatedLecture = await this.lectureRepository.findOne({
      where: { id },
      relations: ['documents']
    });

    return this.processLectureData(updatedLecture);
  }

  /**
   * Bulk operations for lectures
   */
  async bulkUpdateLectures(
    lectureIds: string[],
    updateData: Partial<Pick<LectureEntity, 'isActive' | 'subjectId' | 'grade'>>
  ): Promise<{ message: string; updatedCount: number }> {
    if (!lectureIds || lectureIds.length === 0) {
      throw new BadRequestException('No lecture IDs provided');
    }

    const result = await this.lectureRepository.update(
      { id: In(lectureIds) },
      {
        ...updateData,
        updatedAt: new Date()
      }
    );

    return {
      message: 'Lectures updated successfully',
      updatedCount: result.affected || 0
    };
  }

  /**
   * Bulk delete lectures
   */
  async bulkDeleteLectures(lectureIds: string[]): Promise<{ message: string; deletedCount: number }> {
    if (!lectureIds || lectureIds.length === 0) {
      throw new BadRequestException('No lecture IDs provided');
    }

    // First, delete associated documents
    await this.lectureDocumentRepository.delete({
      lectureId: In(lectureIds)
    });

    // Then delete lectures
    const result = await this.lectureRepository.delete({
      id: In(lectureIds)
    });

    return {
      message: 'Lectures deleted successfully',
      deletedCount: result.affected || 0
    };
  }

  /**
   * Get lecture by ID as DTO (for controller compatibility)
   */
  async getLectureByIdAsDto(id: string): Promise<LectureResponseDto> {
    const lecture = await this.lectureRepository.findOne({
      where: { id }
    });

    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    // Load documents separately
    const documents = await this.lectureDocumentRepository.find({
      where: { lectureId: lecture.id },
      order: { uploadedAt: 'DESC' }
    });

    lecture.documents = documents;

    return this.transformEntityToDto(lecture);
  }

  /**
   * Update lecture as DTO (for controller compatibility)
   */
  async updateLectureAsDto(id: string, updateLectureDto: UpdateLectureDto, userId: string): Promise<LectureResponseDto> {
    const lecture = await this.lectureRepository.findOne({
      where: { id }
    });

    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    // If title is being updated, check for conflicts
    if (updateLectureDto.title && updateLectureDto.title !== lecture.title) {
      const existingLecture = await this.lectureRepository.findOne({
        where: {
          title: updateLectureDto.title,
          subjectId: updateLectureDto.subjectId || lecture.subjectId,
          grade: updateLectureDto.grade || lecture.grade,
          id: Not(id)
        }
      });

      if (existingLecture) {
        throw new ConflictException('A lecture with this title already exists for this subject and grade');
      }
    }

    // Process cover image URL if provided
    let processedCoverImageUrl = updateLectureDto.coverImageUrl;
    if (processedCoverImageUrl !== undefined) {
      processedCoverImageUrl = this.processCoverImageUrl(processedCoverImageUrl);
    }

    // Update lecture
    await this.lectureRepository.update(id, {
      ...updateLectureDto,
      ...(processedCoverImageUrl !== undefined && { coverImageUrl: processedCoverImageUrl }),
      updatedBy: userId,
      updatedAt: new Date()
    });

    // Handle document URLs if provided
    if (updateLectureDto.documentUrls && updateLectureDto.documentUrls.length > 0) {
      // Delete existing documents
      await this.lectureDocumentRepository.delete({ lectureId: id });

      // Create new document records
      for (const [index, docUrl] of updateLectureDto.documentUrls.entries()) {
        const document = this.lectureDocumentRepository.create({
          lectureId: id,
          documentName: `Document ${index + 1}`,
          documentUrl: docUrl,
          documentDescription: `Lecture document ${index + 1}`,
          uploadedAt: new Date(),
        });
        await this.lectureDocumentRepository.save(document);
      }
    }

    // Fetch updated lecture with documents
    const updatedLecture = await this.lectureRepository.findOne({
      where: { id }
    });

    const documents = await this.lectureDocumentRepository.find({
      where: { lectureId: id },
      order: { uploadedAt: 'DESC' }
    });

    updatedLecture.documents = documents;

    return this.transformEntityToDto(updatedLecture);
  }

  /**
   * Delete lecture (soft delete by setting isActive to false)
   */
  async deleteLecture(id: string, userId: string): Promise<{ success: boolean; message: string }> {
    const lecture = await this.lectureRepository.findOne({
      where: { id }
    });

    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    // Soft delete by setting isActive to false
    await this.lectureRepository.update(id, {
      isActive: false,
      updatedBy: userId,
      updatedAt: new Date()
    });

    return {
      success: true,
      message: 'Lecture deleted successfully'
    };
  }

  /**
   * Permanently delete lecture
   */
  async permanentlyDeleteLecture(id: string): Promise<{ success: boolean; message: string }> {
    const lecture = await this.lectureRepository.findOne({
      where: { id }
    });

    if (!lecture) {
      throw new NotFoundException(`Lecture with ID ${id} not found`);
    }

    // Delete associated documents first
    await this.lectureDocumentRepository.delete({ lectureId: id });

    // Delete lecture
    await this.lectureRepository.delete({ id });

    return {
      success: true,
      message: 'Lecture permanently deleted successfully'
    };
  }

  /**
   * Get lecture statistics for a subject
   */
  async getLectureStatistics(subjectId: string, grade?: number): Promise<any> {
    const whereConditions: any = { subjectId };
    
    if (grade !== undefined) {
      whereConditions.grade = grade;
    }

    const [
      totalLectures,
      activeLectures,
      inactiveLectures
    ] = await Promise.all([
      this.lectureRepository.count({ where: whereConditions }),
      this.lectureRepository.count({ where: { ...whereConditions, isActive: true } }),
      this.lectureRepository.count({ where: { ...whereConditions, isActive: false } })
    ]);

    // Get unique grades and lessons
    const lectures = await this.lectureRepository.find({
      where: whereConditions,
      select: ['grade', 'lessonNumber', 'lectureLink']
    });

    const uniqueGrades = new Set(lectures.map(l => l.grade));
    const uniqueLessons = new Set(lectures.map(l => l.lessonNumber));
    const lecturesWithLinks = lectures.filter(l => l.lectureLink).length;

    // Count total documents
    const lectureIds = lectures.map(l => l.id);
    const totalDocuments = lectureIds.length > 0 
      ? await this.lectureDocumentRepository.count({ where: { lectureId: In(lectureIds) } })
      : 0;

    return {
      subjectId,
      grade: grade !== undefined ? grade.toString() : 'all',
      totalLectures,
      activeLectures,
      inactiveLectures,
      totalLessons: uniqueLessons.size,
      totalGrades: uniqueGrades.size,
      totalDocuments,
      lecturesWithLinks
    };
  }

  /**
   * Get lectures by subject ID and grade with proper grouping and sorting
   * @param subjectId - Subject ID to filter lectures
   * @param grade - Grade level to filter lectures
   * @param isActive - Filter by active status (optional)
   */
  async getLecturesBySubjectAndGrade(subjectId: string, grade: number, isActive?: boolean) {
    try {
      const whereConditions: any = { subjectId, grade };
      
      if (isActive !== undefined) {
        whereConditions.isActive = isActive;
      }

      // Get all lectures for the subject and grade
      const lectures = await this.lectureRepository.find({
        where: whereConditions,
        order: { createdAt: 'ASC' } // Order by creation date instead of lessonNumber
      });

      if (lectures.length === 0) {
        throw new NotFoundException(`No lectures found for subject ID: ${subjectId}, grade: ${grade}`);
      }

      // Load documents for each lecture
      const lecturesWithDocuments = await Promise.all(
        lectures.map(async (lecture) => {
          const documents = await this.lectureDocumentRepository.find({
            where: { lectureId: lecture.id },
            order: { uploadedAt: 'DESC' }
          });
          return { ...lecture, documents };
        })
      );

      // Since lessonNumber doesn't exist in the table, group all lectures into a single lesson
      // or return as flat list - grouping by creation order
      const processedLectures = lecturesWithDocuments.map(lecture => this.processLectureData(lecture));
      
      // Group into a single lesson for API compatibility
      const groupedLectures = [{
        lessonNumber: 1,
        lessonName: 'All Lectures',
        lectures: processedLectures
      }];

      // Calculate statistics
      const totalLectures = lecturesWithDocuments.length;
      const activeLectures = lecturesWithDocuments.filter(lecture => lecture.isActive).length;
      const totalLessons = 1; // Single group

      return {
        success: true,
        message: `Found ${totalLectures} lectures for subject ${subjectId}, grade ${grade}`,
        subjectInfo: {
          subjectId,
          grade,
          totalLectures,
          totalLessons,
          activeLectures
        },
        data: groupedLectures
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to retrieve lectures for subject and grade: ${error.message}`);
    }
  }
}