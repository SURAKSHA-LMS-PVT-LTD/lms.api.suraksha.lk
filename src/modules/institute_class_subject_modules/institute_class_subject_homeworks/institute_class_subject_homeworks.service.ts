import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { now } from '../../../common/utils/timezone.util';
import { plainToClass } from 'class-transformer';
import { CreateInstituteClassSubjectHomeworkDto } from './dto/create-institute_class_subject_homework.dto';
import { UpdateInstituteClassSubjectHomeworkDto } from './dto/update-institute_class_subject_homework.dto';
import { QueryInstituteClassSubjectHomeworkDto } from './dto/query-institute-class-subject-homework.dto';
import { InstituteClassSubjectHomeworkResponseDto, PaginatedInstituteClassSubjectHomeworkResponseDto } from './dto/institute-class-subject-homework-response.dto';
import { InstituteClassSubjectHomework } from './entities/institute_class_subject_homework.entity';
import { InstituteAccessValidator, ROLE_BITMASKS } from '../../../common/helpers/institute-access-validator.helper';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

/**
 * Institute Class Subject Homeworks Service
 * 
 * PERFORMANCE OPTIMIZATIONS IMPLEMENTED:
 * =====================================
 * 
 * 1. **Single Query Architecture**: 
 *    - Unified findAll() method with single optimized QueryBuilder
 *    - All filtering operations consolidated into one query
 *    - Eliminated multiple separate queries and N+1 problems
 * 
 * 2. **Optimized Database Operations**:
 *    - All related data loaded in single query with leftJoinAndSelect
 *    - Proper column name mapping (camelCase entity ↔ snake_case DB)
 *    - Efficient WHERE condition building with parameter binding
 * 
 * 3. **Separated Concerns**:
 *    - Homework data separate from submissions (use dedicated submission API)
 *    - Fast, lightweight homework queries without submission overhead
 *    - Submissions can be fetched separately when needed
 * 
 * 4. **Advanced Filtering**:
 *    - Date range filtering (fromDate/toDate)
 *    - Full-text search in title and description
 *    - Multi-field filtering (institute, class, subject, teacher)
 *    - Flexible pagination and sorting
 */
@Injectable()
export class InstituteClassSubjectHomeworksService {
  private readonly logger = new Logger(InstituteClassSubjectHomeworksService.name);

  constructor(
    @InjectRepository(InstituteClassSubjectHomework)
    private readonly homeworkRepository: Repository<InstituteClassSubjectHomework>,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  async create(createDto: CreateInstituteClassSubjectHomeworkDto): Promise<InstituteClassSubjectHomeworkResponseDto> {
    try {
      
      const timestamp = now();
      const homework = this.homeworkRepository.create({
        ...createDto,
        startDate: new Date(createDto.startDate),
        endDate: createDto.endDate ? new Date(createDto.endDate) : undefined,
        isActive: createDto.isActive ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      
      const savedHomework = await this.homeworkRepository.save(homework);
      
      // Return created homework with relations using optimized findOne
      return this.findOne(savedHomework.id);
    } catch (error) {
      this.logger.error('Error creating homework:', error);
      throw error;
    }
  }

  async findAll(query: QueryInstituteClassSubjectHomeworkDto = {}, user?: any): Promise<PaginatedInstituteClassSubjectHomeworkResponseDto> {
    try {
      
      // SECURITY: Validate user has access to requested institute, class, and subject
      if (user) {
        if (query.instituteId) {
          // Validate institute access first
          InstituteAccessValidator.validateInstituteAccess(user, query.instituteId);
          
          // Validate class access if classId is provided
          if (query.classId) {
            const userInstituteAccess = Array.isArray(user.i) ? user.i : [];
            const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === query.instituteId);
            
            if (instituteEntry && Array.isArray(instituteEntry.c)) {
              const classSubjectEntry = instituteEntry.c.find(
                ([classId]: [string, number]) => classId === query.classId
              );
              
              if (!classSubjectEntry) {
                throw new ForbiddenException(`You do not have access to class ${query.classId} in institute ${query.instituteId}`);
              }
              
              // If subjectId is also provided, validate subject access using bitmask
              if (query.subjectId) {
                const [classId, subjectBitmask] = classSubjectEntry;
                const subjectIdNum = parseInt(query.subjectId, 10);
                
                // Check if subjectBitmask contains the subjectId
                // If subjectBitmask is a direct value (not a true bitmask), compare directly
                // If it's a true bitmask, check if the bit at position subjectIdNum is set
                const hasSubjectAccess = (subjectBitmask & subjectIdNum) !== 0 || subjectBitmask === subjectIdNum;
                
                if (!hasSubjectAccess) {
                  throw new ForbiddenException(`You do not have access to subject ${query.subjectId} in class ${query.classId}`);
                }
              }
            }
          }
        }
      }
      
      const page = Math.max(1, query.page || 1);
      const limit = Math.min(100, Math.max(1, query.limit || 10));
      const skip = (page - 1) * limit;

      // Build optimized query with minimal joins and specific column selection
      // Only select necessary columns to avoid SELECT *
      const queryBuilder = this.homeworkRepository.createQueryBuilder('homework')
        .select([
          'homework.id',
          'homework.instituteId', 
          'homework.classId',
          'homework.subjectId',
          'homework.teacherId',
          'homework.title',
          'homework.description',
          'homework.startDate',
          'homework.endDate',
          'homework.referenceLink',
          'homework.createdAt',
          'homework.updatedAt'
        ])
        .leftJoin('homework.teacher', 'teacher')
        .addSelect([
          'teacher.id',
          'teacher.nameWithInitials',
          'teacher.imageUrl',
          'teacher.email'
        ]);

      // Build WHERE conditions efficiently
      const whereConditions: string[] = [];
      const parameters: Record<string, any> = {};

      if (query.instituteId) {
        whereConditions.push('homework.instituteId = :instituteId');
        parameters.instituteId = query.instituteId;
      }

      if (query.classId) {
        whereConditions.push('homework.classId = :classId');
        parameters.classId = query.classId;
      }

      if (query.subjectId) {
        whereConditions.push('homework.subjectId = :subjectId');
        parameters.subjectId = query.subjectId;
      }

      if (query.teacherId) {
        whereConditions.push('homework.teacherId = :teacherId');
        parameters.teacherId = query.teacherId;
      }

      // Handle isActive filter with proper default (show active records by default)
      if (query.isActive !== undefined) {
        whereConditions.push('homework.isActive = :isActive');
        parameters.isActive = query.isActive;
      } else {
        // Default to showing only active records unless explicitly requesting all
        whereConditions.push('homework.isActive = :isActive');
        parameters.isActive = true;
      }

      // Date range filtering
      if (query.fromDate) {
        whereConditions.push('homework.startDate >= :fromDate');
        parameters.fromDate = new Date(query.fromDate);
      }

      if (query.toDate) {
        whereConditions.push('homework.endDate <= :toDate OR (homework.endDate IS NULL AND homework.startDate <= :toDate)');
        parameters.toDate = new Date(query.toDate);
      }

      // Full-text search in title and description
      if (query.search) {
        whereConditions.push('(homework.title ILIKE :search OR homework.description ILIKE :search)');
        parameters.search = `%${query.search}%`;
      }

      // Apply all WHERE conditions at once
      if (whereConditions.length > 0) {
        queryBuilder.where(whereConditions.join(' AND '), parameters);
      }

      // Sorting with proper column mapping
      const sortBy = query.sortBy || 'startDate';
      const sortOrder = query.sortOrder || 'DESC';
      
      switch (sortBy) {
        case 'title':
          queryBuilder.orderBy('homework.title', sortOrder);
          break;
        case 'startDate':
          queryBuilder.orderBy('homework.startDate', sortOrder);
          break;
        case 'endDate':
          queryBuilder.orderBy('homework.endDate', sortOrder);
          break;
        case 'createdAt':
          queryBuilder.orderBy('homework.createdAt', sortOrder);
          break;
        default:
          queryBuilder.orderBy('homework.startDate', sortOrder);
      }

      // Add secondary sort for consistency
      queryBuilder.addOrderBy('homework.createdAt', 'DESC');

      // Include references if requested
      if (query.includeReferences) {
        queryBuilder.leftJoinAndSelect('homework.references', 'reference', 'reference.isActive = :refActive', { refActive: true });
      }

      // Get total count and paginated data in single operation
      const [homeworks, total] = await queryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      // Transform to response DTOs - lightweight response with only essential fields
      const data = homeworks.map(homework => {
        const baseResponse: any = {
          id: homework.id,
          title: homework.title,
          description: homework.description,
          instituteId: homework.instituteId,
          classId: homework.classId,
          subjectId: homework.subjectId,
          teacherId: homework.teacherId,
          startDate: homework.startDate,
          endDate: homework.endDate,
          referenceLink: homework.referenceLink,
          teacher: homework.teacher ? {
            id: homework.teacher.id,
            nameWithInitials: homework.teacher.nameWithInitials || null,
            imageUrl: homework.teacher.imageUrl 
              ? this.cloudStorageService.getFullUrl(homework.teacher.imageUrl)
              : null,
            email: homework.teacher.email || null
          } : null
        };

        // Include references if loaded
        if (query.includeReferences && homework.references) {
          baseResponse.references = homework.references
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map(ref => ({
              id: ref.id,
              title: ref.title,
              description: ref.description,
              referenceType: ref.referenceType,
              referenceSource: ref.referenceSource,
              displayOrder: ref.displayOrder,
              viewUrl: ref.getViewUrl() ? 
                (ref.referenceSource === 'S3_UPLOAD' && ref.fileUrl ? 
                  this.cloudStorageService.getFullUrl(ref.fileUrl) : 
                  ref.getViewUrl()) : 
                null,
              fileName: ref.fileName || ref.driveFileName || ref.linkTitle || null,
              fileSize: ref.fileSize || ref.driveFileSize || null,
              mimeType: ref.mimeType || ref.driveMimeType || null,
              videoDuration: ref.videoDuration || null,
              thumbnailUrl: ref.thumbnailUrl ? this.cloudStorageService.getFullUrl(ref.thumbnailUrl) : null,
            }));
          baseResponse.referenceCount = homework.references.length;
        }

        return baseResponse;
      });

      const totalPages = Math.ceil(total / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;


      return {
        data,
        total,
        page,
        limit,
        totalPages,
        hasNext,
        hasPrev
      };
    } catch (error) {
      this.logger.error('Error fetching homeworks with optimized query:', error);
      throw error;
    }
  }

  async findOne(id: string, user?: any, includeReferences: boolean = true): Promise<InstituteClassSubjectHomeworkResponseDto> {
    try {
      
      const queryBuilder = this.homeworkRepository.createQueryBuilder('homework')
        .select([
          'homework.id',
          'homework.instituteId',
          'homework.classId', 
          'homework.subjectId',
          'homework.teacherId',
          'homework.title',
          'homework.description',
          'homework.startDate',
          'homework.endDate',
          'homework.referenceLink',
          'homework.createdAt',
          'homework.updatedAt'
        ])
        .leftJoin('homework.teacher', 'teacher')
        .addSelect([
          'teacher.id',
          'teacher.nameWithInitials',
          'teacher.imageUrl',
          'teacher.email'
        ])
        .where('homework.id = :id', { id });

      // Include references if requested
      if (includeReferences) {
        queryBuilder.leftJoinAndSelect('homework.references', 'reference', 'reference.isActive = :refActive', { refActive: true });
      }

      const homework = await queryBuilder.getOne();

      if (!homework) {
        throw new NotFoundException(`Homework with ID ${id} not found`);
      }

      // SECURITY: Validate user has access to this homework's institute, class, and subject
      if (user) {
        InstituteAccessValidator.validateResourceAccess(user, homework);
        
        // Validate class and subject access
        const userInstituteAccess = Array.isArray(user.i) ? user.i : [];
        const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === homework.instituteId);
        
        if (instituteEntry && Array.isArray(instituteEntry.c)) {
          // Validate class access
          const classSubjectEntry = instituteEntry.c.find(
            ([classId]: [string, number]) => classId === homework.classId
          );
          
          if (!classSubjectEntry) {
            throw new ForbiddenException(`You do not have access to class ${homework.classId} in institute ${homework.instituteId}`);
          }
          
          // Validate subject access using bitmask
          const [classId, subjectBitmask] = classSubjectEntry;
          const subjectIdNum = parseInt(homework.subjectId, 10);
          const hasSubjectAccess = (subjectBitmask & subjectIdNum) !== 0 || subjectBitmask === subjectIdNum;
          
          if (!hasSubjectAccess) {
            throw new ForbiddenException(`You do not have access to subject ${homework.subjectId} in class ${homework.classId}`);
          }
        }
      }

      // Build response with references
      const response: any = {
        id: homework.id,
        title: homework.title,
        description: homework.description,
        instituteId: homework.instituteId,
        classId: homework.classId,
        subjectId: homework.subjectId,
        teacherId: homework.teacherId,
        startDate: homework.startDate,
        endDate: homework.endDate,
        referenceLink: homework.referenceLink,
        teacher: homework.teacher ? {
          id: homework.teacher.id,
          nameWithInitials: homework.teacher.nameWithInitials || null,
          imageUrl: homework.teacher.imageUrl 
            ? this.cloudStorageService.getFullUrl(homework.teacher.imageUrl)
            : null,
          email: homework.teacher.email || null
        } : null
      };

      // Include references if loaded
      if (includeReferences && homework.references) {
        response.references = homework.references
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map(ref => ({
            id: ref.id,
            title: ref.title,
            description: ref.description,
            referenceType: ref.referenceType,
            referenceSource: ref.referenceSource,
            displayOrder: ref.displayOrder,
            viewUrl: ref.getViewUrl() ? 
              (ref.referenceSource === 'S3_UPLOAD' && ref.fileUrl ? 
                this.cloudStorageService.getFullUrl(ref.fileUrl) : 
                ref.getViewUrl()) : 
              null,
            fileName: ref.fileName || ref.driveFileName || ref.linkTitle || null,
            fileSize: ref.fileSize || ref.driveFileSize || null,
            mimeType: ref.mimeType || ref.driveMimeType || null,
            videoDuration: ref.videoDuration || null,
            thumbnailUrl: ref.thumbnailUrl ? this.cloudStorageService.getFullUrl(ref.thumbnailUrl) : null,
          }));
        response.referenceCount = homework.references.length;
      }

      return response as InstituteClassSubjectHomeworkResponseDto;
    } catch (error) {
      this.logger.error(`Error fetching homework with ID ${id}:`, error);
      throw error;
    }
  }

  async update(id: string, updateDto: UpdateInstituteClassSubjectHomeworkDto, user: any): Promise<InstituteClassSubjectHomeworkResponseDto> {
    try {
      
      // Check if homework exists using optimized query - only select id for existence check
      const existingHomework = await this.homeworkRepository.findOne({ 
        where: { id },
        select: ['id', 'instituteId'] // Select id and instituteId for validation
      });
      
      if (!existingHomework) {
        throw new NotFoundException(`Homework with ID ${id} not found`);
      }

      // Validate user has access to this homework's institute with required roles
      InstituteAccessValidator.validateResourceAccess(user, existingHomework, [ROLE_BITMASKS.TEACHER, ROLE_BITMASKS.INSTITUTE_ADMIN]);

      const updateData: any = { ...updateDto };
      
      if (updateDto.startDate) {
        updateData.startDate = new Date(updateDto.startDate);
      }
      
      if (updateDto.endDate) {
        updateData.endDate = new Date(updateDto.endDate);
      }

      // Update in single operation
      await this.homeworkRepository.update(id, updateData);
      
      // Return updated homework with relations using optimized query
      return this.findOne(id);
    } catch (error) {
      this.logger.error(`Error updating homework with ID ${id}:`, error);
      throw error;
    }
  }

  async remove(id: string, user: any): Promise<void> {
    try {
      
      const homework = await this.homeworkRepository.findOne({ 
        where: { id },
        select: ['id', 'instituteId'] // Select id and instituteId for validation
      });
      
      if (!homework) {
        throw new NotFoundException(`Homework with ID ${id} not found`);
      }

      // Validate user has access to this homework's institute with required roles
      InstituteAccessValidator.validateResourceAccess(user, homework, [ROLE_BITMASKS.TEACHER, ROLE_BITMASKS.INSTITUTE_ADMIN]);

      // Soft delete by setting isActive to false
      await this.homeworkRepository.update(id, { isActive: false });
      
    } catch (error) {
      this.logger.error(`Error soft deleting homework with ID ${id}:`, error);
      throw error;
    }
  }
}
