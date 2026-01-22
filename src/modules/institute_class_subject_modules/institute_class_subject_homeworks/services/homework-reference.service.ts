import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { now } from '../../../../common/utils/timezone.util';
import { CloudStorageService } from '../../../../common/services/cloud-storage.service';
import { GoogleAuthService } from '../../../google-auth/google-auth.service';
import { InstituteAccessValidator, ROLE_BITMASKS } from '../../../../common/helpers/institute-access-validator.helper';

import { 
  InstituteClassSubjectHomeworkReference, 
  HomeworkReferenceType, 
  HomeworkReferenceSource 
} from '../entities/institute_class_subject_homework_reference.entity';
import { InstituteClassSubjectHomework } from '../entities/institute_class_subject_homework.entity';

import { 
  CreateHomeworkReferenceDto, 
  CreateHomeworkReferenceGoogleDriveDto,
  CreateHomeworkReferenceLinkDto,
  GenerateReferenceUploadUrlDto,
  ConfirmReferenceUploadDto
} from '../dto/create-homework-reference.dto';
import { UpdateHomeworkReferenceDto, ReorderReferencesDto } from '../dto/update-homework-reference.dto';
import { QueryHomeworkReferenceDto } from '../dto/query-homework-reference.dto';
import { 
  HomeworkReferenceResponseDto, 
  PaginatedHomeworkReferenceResponseDto,
  GenerateUploadUrlResponseDto,
  HomeworkReferenceSummaryDto
} from '../dto/homework-reference-response.dto';

// File size limits by type (in bytes)
const FILE_SIZE_LIMITS = {
  [HomeworkReferenceType.VIDEO]: 500 * 1024 * 1024,    // 500 MB
  [HomeworkReferenceType.IMAGE]: 10 * 1024 * 1024,     // 10 MB
  [HomeworkReferenceType.PDF]: 50 * 1024 * 1024,       // 50 MB
  [HomeworkReferenceType.DOCUMENT]: 50 * 1024 * 1024,  // 50 MB
  [HomeworkReferenceType.AUDIO]: 100 * 1024 * 1024,    // 100 MB
  [HomeworkReferenceType.OTHER]: 100 * 1024 * 1024,    // 100 MB
};

// Allowed MIME types by reference type
const ALLOWED_MIME_TYPES: Record<HomeworkReferenceType, string[]> = {
  [HomeworkReferenceType.VIDEO]: [
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv'
  ],
  [HomeworkReferenceType.IMAGE]: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'
  ],
  [HomeworkReferenceType.PDF]: [
    'application/pdf'
  ],
  [HomeworkReferenceType.DOCUMENT]: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/rtf'
  ],
  [HomeworkReferenceType.AUDIO]: [
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/mp4'
  ],
  [HomeworkReferenceType.LINK]: [], // No MIME type validation for links
  [HomeworkReferenceType.OTHER]: [] // Accept any file type
};

@Injectable()
export class HomeworkReferenceService {
  private readonly logger = new Logger(HomeworkReferenceService.name);

  constructor(
    @InjectRepository(InstituteClassSubjectHomeworkReference)
    private readonly referenceRepository: Repository<InstituteClassSubjectHomeworkReference>,
    @InjectRepository(InstituteClassSubjectHomework)
    private readonly homeworkRepository: Repository<InstituteClassSubjectHomework>,
    private readonly cloudStorageService: CloudStorageService,
    private readonly googleAuthService: GoogleAuthService,
  ) {}

  // ========== CREATE OPERATIONS ==========

  /**
   * Create a new homework reference (generic)
   */
  async create(
    createDto: CreateHomeworkReferenceDto, 
    user: any
  ): Promise<HomeworkReferenceResponseDto> {
    this.logger.log(`Creating reference for homework ${createDto.homeworkId}`);

    // Validate homework exists and user has access
    const homework = await this.validateHomeworkAccess(createDto.homeworkId, user);

    const timestamp = now();
    const reference = this.referenceRepository.create({
      ...createDto,
      uploadedById: user.sub,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const savedReference = await this.referenceRepository.save(reference);
    this.logger.log(`Created reference ${savedReference.id} for homework ${createDto.homeworkId}`);

    return this.findOne(savedReference.id);
  }

  /**
   * Create reference via Google Drive
   * Validates file exists in user's Drive before creating
   */
  async createViaGoogleDrive(
    dto: CreateHomeworkReferenceGoogleDriveDto,
    user: any
  ): Promise<HomeworkReferenceResponseDto> {
    this.logger.log(`Creating Google Drive reference for homework ${dto.homeworkId}`);

    // Validate homework access
    await this.validateHomeworkAccess(dto.homeworkId, user);

    // Verify file exists in Google Drive
    const fileMetadata = await this.googleAuthService.getFileMetadata(dto.driveFileId, dto.accessToken);
    if (!fileMetadata) {
      throw new BadRequestException('Could not access the Google Drive file. Please ensure the file exists and you have permission to access it.');
    }

    const timestamp = now();
    const reference = this.referenceRepository.create({
      homeworkId: dto.homeworkId,
      uploadedById: user.sub,
      title: dto.title,
      description: dto.description,
      referenceType: dto.referenceType,
      referenceSource: HomeworkReferenceSource.GOOGLE_DRIVE,
      displayOrder: dto.displayOrder || 0,
      driveFileId: fileMetadata.id,
      driveFileName: fileMetadata.name,
      driveMimeType: fileMetadata.mimeType,
      driveFileSize: fileMetadata.size ? parseInt(fileMetadata.size, 10) : undefined,
      videoDuration: dto.videoDuration,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const savedReference = await this.referenceRepository.save(reference);
    this.logger.log(`Created Google Drive reference ${savedReference.id}`);

    return this.findOne(savedReference.id);
  }

  /**
   * Create reference via manual link
   */
  async createViaLink(
    dto: CreateHomeworkReferenceLinkDto,
    user: any
  ): Promise<HomeworkReferenceResponseDto> {
    this.logger.log(`Creating link reference for homework ${dto.homeworkId}`);

    // Validate homework access
    await this.validateHomeworkAccess(dto.homeworkId, user);

    const timestamp = now();
    const reference = this.referenceRepository.create({
      homeworkId: dto.homeworkId,
      uploadedById: user.sub,
      title: dto.title,
      description: dto.description,
      referenceType: dto.referenceType,
      referenceSource: HomeworkReferenceSource.MANUAL_LINK,
      displayOrder: dto.displayOrder || 0,
      externalUrl: dto.externalUrl,
      linkTitle: dto.linkTitle,
      videoDuration: dto.videoDuration,
      thumbnailUrl: dto.thumbnailUrl,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const savedReference = await this.referenceRepository.save(reference);
    this.logger.log(`Created link reference ${savedReference.id}`);

    return this.findOne(savedReference.id);
  }

  /**
   * Generate S3 signed upload URL
   */
  async generateUploadUrl(
    dto: GenerateReferenceUploadUrlDto,
    user: any
  ): Promise<GenerateUploadUrlResponseDto> {
    this.logger.log(`Generating upload URL for homework ${dto.homeworkId}`);

    // Validate homework access
    await this.validateHomeworkAccess(dto.homeworkId, user);

    // Validate file type
    const allowedTypes = ALLOWED_MIME_TYPES[dto.referenceType];
    if (allowedTypes.length > 0 && !allowedTypes.includes(dto.contentType)) {
      throw new BadRequestException(
        `Invalid file type for ${dto.referenceType}. Allowed types: ${allowedTypes.join(', ')}`
      );
    }

    // Validate file size
    const maxSize = FILE_SIZE_LIMITS[dto.referenceType] || FILE_SIZE_LIMITS[HomeworkReferenceType.OTHER];
    if (dto.fileSize > maxSize) {
      throw new BadRequestException(
        `File size exceeds limit for ${dto.referenceType}. Maximum: ${maxSize / (1024 * 1024)}MB`
      );
    }

    // Generate unique file path using folder and fileName format
    const folder = `homework-references/${dto.homeworkId}`;

    // Generate signed URL using CloudStorageService
    const signedUrlResult = await this.cloudStorageService.generateSignedUploadUrl(
      folder,
      dto.fileName,
      dto.contentType,
      3600, // 1 hour expiry
      dto.fileSize
    );

    return {
      uploadUrl: signedUrlResult.uploadUrl,
      relativePath: signedUrlResult.relativePath,
      fields: signedUrlResult.fields || {},
      expiresIn: 3600, // 1 hour
      maxFileSize: maxSize,
    };
  }

  /**
   * Confirm S3 upload and create reference
   */
  async confirmUpload(
    dto: ConfirmReferenceUploadDto,
    user: any
  ): Promise<HomeworkReferenceResponseDto> {
    this.logger.log(`Confirming upload for homework ${dto.homeworkId}`);

    // Validate homework access
    await this.validateHomeworkAccess(dto.homeworkId, user);

    // Verify file exists in S3
    const fileExists = await this.cloudStorageService.fileExists(dto.relativePath);
    if (!fileExists) {
      throw new BadRequestException('File not found. Please ensure the upload completed successfully.');
    }

    const timestamp = now();
    const reference = this.referenceRepository.create({
      homeworkId: dto.homeworkId,
      uploadedById: user.sub,
      title: dto.title,
      description: dto.description,
      referenceType: dto.referenceType,
      referenceSource: HomeworkReferenceSource.S3_UPLOAD,
      displayOrder: dto.displayOrder || 0,
      fileUrl: dto.relativePath,
      fileName: dto.fileName,
      fileSize: dto.fileSize,
      mimeType: dto.mimeType,
      videoDuration: dto.videoDuration,
      thumbnailUrl: dto.thumbnailUrl,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const savedReference = await this.referenceRepository.save(reference);
    this.logger.log(`Created S3 upload reference ${savedReference.id}`);

    return this.findOne(savedReference.id);
  }

  // ========== READ OPERATIONS ==========

  /**
   * Find all references with filtering and pagination
   */
  async findAll(
    query: QueryHomeworkReferenceDto,
    user?: any
  ): Promise<PaginatedHomeworkReferenceResponseDto> {
    this.logger.log(`Finding references with filters: ${JSON.stringify(query)}`);

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const queryBuilder = this.referenceRepository.createQueryBuilder('ref')
      .leftJoinAndSelect('ref.uploadedBy', 'uploadedBy');

    // Apply filters
    if (query.homeworkId) {
      queryBuilder.andWhere('ref.homeworkId = :homeworkId', { homeworkId: query.homeworkId });
    }

    if (query.referenceType) {
      queryBuilder.andWhere('ref.referenceType = :referenceType', { referenceType: query.referenceType });
    }

    if (query.referenceSource) {
      queryBuilder.andWhere('ref.referenceSource = :referenceSource', { referenceSource: query.referenceSource });
    }

    if (query.uploadedById) {
      queryBuilder.andWhere('ref.uploadedById = :uploadedById', { uploadedById: query.uploadedById });
    }

    // Default to active only
    if (query.isActive !== undefined) {
      queryBuilder.andWhere('ref.isActive = :isActive', { isActive: query.isActive });
    } else {
      queryBuilder.andWhere('ref.isActive = :isActive', { isActive: true });
    }

    // Search
    if (query.search) {
      queryBuilder.andWhere(
        '(ref.title LIKE :search OR ref.description LIKE :search)',
        { search: `%${query.search}%` }
      );
    }

    // Sorting
    const sortBy = query.sortBy || 'displayOrder';
    const sortOrder = query.sortOrder || 'ASC';
    queryBuilder.orderBy(`ref.${sortBy}`, sortOrder);
    queryBuilder.addOrderBy('ref.createdAt', 'DESC');

    // Execute with pagination
    const [references, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const data = references.map(ref => 
      HomeworkReferenceResponseDto.fromEntity(ref, this.cloudStorageService)
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  /**
   * Find references by homework ID
   */
  async findByHomeworkId(
    homeworkId: string,
    user?: any
  ): Promise<HomeworkReferenceResponseDto[]> {
    this.logger.log(`Finding references for homework ${homeworkId}`);

    const references = await this.referenceRepository.find({
      where: { homeworkId, isActive: true },
      relations: ['uploadedBy'],
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });

    return references.map(ref => 
      HomeworkReferenceResponseDto.fromEntity(ref, this.cloudStorageService)
    );
  }

  /**
   * Find single reference by ID
   */
  async findOne(id: string): Promise<HomeworkReferenceResponseDto> {
    const reference = await this.referenceRepository.findOne({
      where: { id },
      relations: ['uploadedBy'],
    });

    if (!reference) {
      throw new NotFoundException(`Reference with ID ${id} not found`);
    }

    return HomeworkReferenceResponseDto.fromEntity(reference, this.cloudStorageService);
  }

  /**
   * Get summary of references for a homework
   */
  async getSummary(homeworkId: string): Promise<HomeworkReferenceSummaryDto> {
    const references = await this.referenceRepository.find({
      where: { homeworkId, isActive: true },
      select: ['referenceType', 'referenceSource'],
    });

    const byType: Partial<Record<HomeworkReferenceType, number>> = {};
    const bySource: Partial<Record<HomeworkReferenceSource, number>> = {};

    references.forEach(ref => {
      byType[ref.referenceType] = (byType[ref.referenceType] || 0) + 1;
      bySource[ref.referenceSource] = (bySource[ref.referenceSource] || 0) + 1;
    });

    return {
      total: references.length,
      byType,
      bySource,
    };
  }

  // ========== UPDATE OPERATIONS ==========

  /**
   * Update a reference
   */
  async update(
    id: string,
    updateDto: UpdateHomeworkReferenceDto,
    user: any
  ): Promise<HomeworkReferenceResponseDto> {
    this.logger.log(`Updating reference ${id}`);

    const reference = await this.referenceRepository.findOne({ where: { id } });
    if (!reference) {
      throw new NotFoundException(`Reference with ID ${id} not found`);
    }

    // Validate homework access
    await this.validateHomeworkAccess(reference.homeworkId, user);

    const updateData: any = { ...updateDto, updatedAt: now() };

    await this.referenceRepository.update(id, updateData);
    
    this.logger.log(`Updated reference ${id}`);
    return this.findOne(id);
  }

  /**
   * Reorder references for a homework
   */
  async reorder(
    homeworkId: string,
    dto: ReorderReferencesDto,
    user: any
  ): Promise<HomeworkReferenceResponseDto[]> {
    this.logger.log(`Reordering references for homework ${homeworkId}`);

    // Validate homework access
    await this.validateHomeworkAccess(homeworkId, user);

    const timestamp = now();

    // Update display order for each reference
    await Promise.all(
      dto.referenceIds.map((refId, index) =>
        this.referenceRepository.update(
          { id: refId, homeworkId },
          { displayOrder: index, updatedAt: timestamp }
        )
      )
    );

    this.logger.log(`Reordered ${dto.referenceIds.length} references`);
    return this.findByHomeworkId(homeworkId);
  }

  // ========== DELETE OPERATIONS ==========

  /**
   * Soft delete a reference (set isActive = false)
   */
  async softDelete(id: string, user: any): Promise<void> {
    this.logger.log(`Soft deleting reference ${id}`);

    const reference = await this.referenceRepository.findOne({ where: { id } });
    if (!reference) {
      throw new NotFoundException(`Reference with ID ${id} not found`);
    }

    // Validate homework access
    await this.validateHomeworkAccess(reference.homeworkId, user);

    await this.referenceRepository.update(id, { 
      isActive: false, 
      updatedAt: now() 
    });

    this.logger.log(`Soft deleted reference ${id}`);
  }

  /**
   * Hard delete a reference and its associated file
   */
  async hardDelete(id: string, user: any): Promise<void> {
    this.logger.log(`Hard deleting reference ${id}`);

    const reference = await this.referenceRepository.findOne({ where: { id } });
    if (!reference) {
      throw new NotFoundException(`Reference with ID ${id} not found`);
    }

    // Validate homework access
    await this.validateHomeworkAccess(reference.homeworkId, user);

    // Delete file from S3 if it's an S3 upload
    if (reference.referenceSource === HomeworkReferenceSource.S3_UPLOAD && reference.fileUrl) {
      try {
        await this.cloudStorageService.deleteFile(reference.fileUrl);
        this.logger.log(`Deleted S3 file: ${reference.fileUrl}`);
      } catch (error) {
        this.logger.warn(`Failed to delete S3 file: ${reference.fileUrl}`, error);
      }

      // Also delete thumbnail if exists
      if (reference.thumbnailUrl) {
        try {
          await this.cloudStorageService.deleteFile(reference.thumbnailUrl);
        } catch (error) {
          this.logger.warn(`Failed to delete thumbnail: ${reference.thumbnailUrl}`, error);
        }
      }
    }

    // Delete from database
    await this.referenceRepository.delete(id);
    this.logger.log(`Hard deleted reference ${id}`);
  }

  /**
   * Bulk soft delete references
   */
  async bulkSoftDelete(ids: string[], user: any): Promise<void> {
    this.logger.log(`Bulk soft deleting ${ids.length} references`);

    // Validate all references belong to accessible homeworks
    const references = await this.referenceRepository.find({
      where: { id: In(ids) },
      select: ['id', 'homeworkId'],
    });

    if (references.length !== ids.length) {
      throw new NotFoundException('Some references not found');
    }

    // Validate access to each homework
    const homeworkIds = [...new Set(references.map(r => r.homeworkId))];
    for (const homeworkId of homeworkIds) {
      await this.validateHomeworkAccess(homeworkId, user);
    }

    await this.referenceRepository.update(
      { id: In(ids) },
      { isActive: false, updatedAt: now() }
    );

    this.logger.log(`Bulk soft deleted ${ids.length} references`);
  }

  /**
   * Restore a soft-deleted reference
   */
  async restore(id: string, user: any): Promise<HomeworkReferenceResponseDto> {
    this.logger.log(`Restoring reference ${id}`);

    const reference = await this.referenceRepository.findOne({ where: { id } });
    if (!reference) {
      throw new NotFoundException(`Reference with ID ${id} not found`);
    }

    // Validate homework access
    await this.validateHomeworkAccess(reference.homeworkId, user);

    await this.referenceRepository.update(id, { 
      isActive: true, 
      updatedAt: now() 
    });

    this.logger.log(`Restored reference ${id}`);
    return this.findOne(id);
  }

  // ========== HELPER METHODS ==========

  /**
   * Validate user has access to the homework
   */
  private async validateHomeworkAccess(homeworkId: string, user: any): Promise<InstituteClassSubjectHomework> {
    const homework = await this.homeworkRepository.findOne({
      where: { id: homeworkId },
      select: ['id', 'instituteId', 'classId', 'subjectId', 'teacherId'],
    });

    if (!homework) {
      throw new NotFoundException(`Homework with ID ${homeworkId} not found`);
    }

    // Validate institute access
    InstituteAccessValidator.validateResourceAccess(user, homework, [ROLE_BITMASKS.TEACHER, ROLE_BITMASKS.INSTITUTE_ADMIN]);

    return homework;
  }
}
