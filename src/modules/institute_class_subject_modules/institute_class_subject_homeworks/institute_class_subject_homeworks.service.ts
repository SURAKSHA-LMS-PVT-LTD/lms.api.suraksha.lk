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
          // Extract userId from query for parent access validation
          const targetUserId = query.userId;
          
          // Validate institute access first
          // Pass targetUserId and isReadOnly=true to allow parent access
          InstituteAccessValidator.validateInstituteAccess(user, query.instituteId, undefined, targetUserId, true);
          
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
                
                // Proper bitmask check: subject ID 1 = bit 0, subject ID 2 = bit 1, etc.
                const hasSubjectAccess = (subjectBitmask & (1 << (subjectIdNum - 1))) !== 0;
                
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

      // Determine if user is a student BEFORE building query (for optimization)
      const userTypeStr = user?.ut || user?.userType || '';
      const userTypeCompact = user?.u;
      const isStudentUser = user && (
        userTypeStr === 'USER' || 
        userTypeStr === 'USER_WITHOUT_PARENT' ||
        userTypeCompact === 2 || 
        userTypeCompact === 3
      );

      // Include submissions if requested
      // For students: filter to only their submissions (no need to join student data - it's themselves)
      // For teachers/admins: include all submissions with student data
      if (query.includeSubmissions) {
        queryBuilder.leftJoinAndSelect('homework.submissions', 'submission', 'submission.isActive = :subActive', { subActive: true });
        
        // Only join student data for teachers/admins who need to see all students
        if (!isStudentUser) {
          queryBuilder.leftJoin('submission.student', 'submissionStudent');
          queryBuilder.addSelect([
            'submissionStudent.id',
            'submissionStudent.firstName',
            'submissionStudent.lastName',
            'submissionStudent.nameWithInitials',
            'submissionStudent.imageUrl'
          ]);
        }
      }

      // Get total count and paginated data in single operation
      const [homeworks, total] = await queryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      // Use pre-calculated isStudentUser from above
      const isStudent = isStudentUser;
      const currentUserId = user?.userId || user?.id || user?.s;

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

        // Include submissions if loaded
        if (query.includeSubmissions && homework.submissions) {
          // For students: filter to only their own submissions
          // For teachers/admins: show all submissions
          let submissions = homework.submissions;
          
          if (isStudent && currentUserId) {
            submissions = submissions.filter(sub => sub.studentId === currentUserId);
          }

          // For students: simplified response (no need for their own name/image)
          // For teachers/admins: full response with student details
          baseResponse.mySubmissions = submissions.map(sub => {
            const baseSubmission: any = {
              id: sub.id,
              submissionDate: sub.submissionDate,
              fileUrl: sub.fileUrl 
                ? this.cloudStorageService.getFullUrl(sub.fileUrl) 
                : null,
              teacherCorrectionFileUrl: sub.teacherCorrectionFileUrl 
                ? this.cloudStorageService.getFullUrl(sub.teacherCorrectionFileUrl) 
                : null,
              driveFileId: sub.driveFileId || null,
              driveViewUrl: sub.driveFileId 
                ? `https://drive.google.com/file/d/${sub.driveFileId}/view` 
                : null,
              submissionType: sub.submissionType || 'UPLOAD',
              remarks: sub.remarks || null,
              isActive: sub.isActive,
              createdAt: sub.createdAt,
            };

            // Only include student details if NOT viewing own submission
            // Check both: user role AND if submission belongs to current user
            const isOwnSubmission = currentUserId && sub.studentId === currentUserId;
            if (!isStudent && !isOwnSubmission) {
              baseSubmission.studentId = sub.studentId;
              baseSubmission.studentName = sub.student 
                ? `${sub.student.firstName || ''} ${sub.student.lastName || ''}`.trim() || sub.student.nameWithInitials || null
                : null;
              baseSubmission.studentImageUrl = sub.student?.imageUrl 
                ? this.cloudStorageService.getFullUrl(sub.student.imageUrl)
                : null;
            }

            return baseSubmission;
          });

          // For students: hasSubmitted flag
          if (isStudent && currentUserId) {
            baseResponse.hasSubmitted = submissions.length > 0;
          }
          
          // For teachers/admins: total submission count
          if (!isStudent) {
            baseResponse.submissionCount = homework.submissions.length;
          }
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

  async findOne(id: string, user?: any, includeReferences: boolean = true, includeSubmissions: boolean = true): Promise<InstituteClassSubjectHomeworkResponseDto> {
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

      // Include submissions if requested
      if (includeSubmissions) {
        queryBuilder.leftJoinAndSelect('homework.submissions', 'submission', 'submission.isActive = :subActive', { subActive: true });
        queryBuilder.leftJoin('submission.student', 'submissionStudent');
        queryBuilder.addSelect([
          'submissionStudent.id',
          'submissionStudent.firstName',
          'submissionStudent.lastName',
          'submissionStudent.nameWithInitials',
          'submissionStudent.imageUrl'
        ]);
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
          // Proper bitmask check: subject ID 1 = bit 0, subject ID 2 = bit 1, etc.
          const hasSubjectAccess = (subjectBitmask & (1 << (subjectIdNum - 1))) !== 0;
          
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

      // Include submissions if loaded
      if (includeSubmissions && homework.submissions) {
        // Determine if user is a student (for filtering submissions)
        // Check multiple sources: ut (legacy), userType (from DB), u (compact numeric: 2=USER, 3=USER_WITHOUT_PARENT)
        const userTypeStr = user?.ut || user?.userType || '';
        const userTypeCompact = user?.u;
        const isStudent = user && (
          userTypeStr === 'USER' || 
          userTypeStr === 'USER_WITHOUT_PARENT' ||
          userTypeCompact === 2 || 
          userTypeCompact === 3
        );
        const currentUserId = user?.userId || user?.id || user?.s;

        // For students: filter to only their own submissions
        // For teachers/admins: show all submissions
        let submissions = homework.submissions;
        
        if (isStudent && currentUserId) {
          submissions = submissions.filter(sub => sub.studentId === currentUserId);
        }

        // For students: simplified response (no need for their own name/image)
        // For teachers/admins: full response with student details
        response.mySubmissions = submissions.map(sub => {
          const baseSubmission: any = {
            id: sub.id,
            submissionDate: sub.submissionDate,
            fileUrl: sub.fileUrl 
              ? this.cloudStorageService.getFullUrl(sub.fileUrl) 
              : null,
            teacherCorrectionFileUrl: sub.teacherCorrectionFileUrl 
              ? this.cloudStorageService.getFullUrl(sub.teacherCorrectionFileUrl) 
              : null,
            driveFileId: sub.driveFileId || null,
            driveViewUrl: sub.driveFileId 
              ? `https://drive.google.com/file/d/${sub.driveFileId}/view` 
              : null,
            submissionType: sub.submissionType || 'UPLOAD',
            remarks: sub.remarks || null,
            isActive: sub.isActive,
            createdAt: sub.createdAt,
          };

          // Only include student details if NOT viewing own submission
          // Check both: user role AND if submission belongs to current user
          const isOwnSubmission = currentUserId && sub.studentId === currentUserId;
          if (!isStudent && !isOwnSubmission) {
            baseSubmission.studentId = sub.studentId;
            baseSubmission.studentName = sub.student 
              ? `${sub.student.firstName || ''} ${sub.student.lastName || ''}`.trim() || sub.student.nameWithInitials || null
              : null;
            baseSubmission.studentImageUrl = sub.student?.imageUrl 
              ? this.cloudStorageService.getFullUrl(sub.student.imageUrl)
              : null;
          }

          return baseSubmission;
        });

        // For students: hasSubmitted flag
        if (isStudent && currentUserId) {
          response.hasSubmitted = submissions.length > 0;
        }
        
        // For teachers/admins: total submission count
        if (!isStudent) {
          response.submissionCount = homework.submissions.length;
        }
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

  async findUserHomeworksWithSubmissionsAndReferences(
    instituteId: string,
    classId: string,
    subjectId: string,
    userId: string,
    page: number = 1,
    limit: number = 20,
    user?: any
  ): Promise<any> {
    try {
      // SECURITY: Validate JWT token user matches requested userId OR is parent of the user
      if (!user || !user.sub) {
        throw new ForbiddenException('Invalid JWT token');
      }

      // Check if requesting user is the target user OR a parent of the target user
      const isOwnData = user.sub === userId;
      const children = Array.isArray(user.c) ? user.c : [];
      const isParentOfUser = children.includes(userId);

      if (!isOwnData && !isParentOfUser) {
        throw new ForbiddenException('You can only access your own homework data or your children\'s homework data.');
      }

      // Validate access to institute/class/subject
      // Pass userId as targetUserId and isReadOnly=true to allow parent access
      if (user) {
        InstituteAccessValidator.validateInstituteAccess(user, instituteId, undefined, userId, true);
        
        const userInstituteAccess = Array.isArray(user.i) ? user.i : [];
        const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === instituteId);
        
        if (instituteEntry && Array.isArray(instituteEntry.c)) {
          const classSubjectEntry = instituteEntry.c.find(
            ([cId]: [string, number]) => cId === classId
          );
          
          if (!classSubjectEntry) {
            throw new ForbiddenException(`You do not have access to class ${classId} in institute ${instituteId}`);
          }
          
          const [, subjectBitmask] = classSubjectEntry;
          const subjectIdNum = parseInt(subjectId, 10);
          // Proper bitmask check: subject ID 1 = bit 0, subject ID 2 = bit 1, etc.
          const hasSubjectAccess = (subjectBitmask & (1 << (subjectIdNum - 1))) !== 0;
          
          if (!hasSubjectAccess) {
            throw new ForbiddenException(`You do not have access to subject ${subjectId} in class ${classId}`);
          }
        }
      }

      const skip = (page - 1) * limit;

      // Query homeworks with submissions and references
      const queryBuilder = this.homeworkRepository.createQueryBuilder('homework')
        .leftJoinAndSelect('homework.teacher', 'teacher')
        .leftJoinAndSelect('homework.references', 'references')
        .leftJoin('homework.submissions', 'submissions', 'submissions.studentId = :userId AND submissions.isActive = true', { userId })
        .addSelect([
          'submissions.id',
          'submissions.submissionDate',
          'submissions.fileUrl',
          'submissions.teacherCorrectionFileUrl',
          'submissions.driveFileId',
          'submissions.driveFileName',
          'submissions.driveMimeType',
          'submissions.submissionType',
          'submissions.remarks',
          'submissions.isActive'
        ])
        .where('homework.instituteId = :instituteId', { instituteId })
        .andWhere('homework.classId = :classId', { classId })
        .andWhere('homework.subjectId = :subjectId', { subjectId })
        .andWhere('homework.isActive = :isActive', { isActive: true })
        .orderBy('homework.startDate', 'DESC')
        .addOrderBy('references.displayOrder', 'ASC')
        .skip(skip)
        .take(limit);

      const [homeworks, total] = await queryBuilder.getManyAndCount();

      // Transform data
      const data = homeworks.map(homework => ({
        id: homework.id,
        instituteId: homework.instituteId,
        classId: homework.classId,
        subjectId: homework.subjectId,
        teacherId: homework.teacherId,
        title: homework.title,
        description: homework.description,
        startDate: homework.startDate,
        endDate: homework.endDate,
        referenceLink: homework.referenceLink,
        isActive: homework.isActive,
        createdAt: homework.createdAt,
        updatedAt: homework.updatedAt,
        teacher: homework.teacher ? {
          id: homework.teacher.id,
          nameWithInitials: homework.teacher.nameWithInitials,
          email: homework.teacher.email,
          imageUrl: homework.teacher.imageUrl ? this.cloudStorageService.getFullUrl(homework.teacher.imageUrl) : null
        } : null,
        mySubmissions: homework.submissions?.map(sub => ({
          id: sub.id,
          submissionDate: sub.submissionDate,
          fileUrl: sub.fileUrl ? this.cloudStorageService.getFullUrl(sub.fileUrl) : null,
          teacherCorrectionFileUrl: sub.teacherCorrectionFileUrl ? this.cloudStorageService.getFullUrl(sub.teacherCorrectionFileUrl) : null,
          driveFileId: sub.driveFileId,
          driveFileName: sub.driveFileName,
          driveMimeType: sub.driveMimeType,
          submissionType: sub.submissionType,
          remarks: sub.remarks,
          isActive: sub.isActive
        })) || [],
        references: homework.references?.map(ref => ({
          id: ref.id,
          title: ref.title,
          description: ref.description,
          fileUrl: ref.fileUrl ? this.cloudStorageService.getFullUrl(ref.fileUrl) : null,
          driveFileId: ref.driveFileId,
          driveFileName: ref.driveFileName,
          driveMimeType: ref.driveMimeType,
          referenceType: ref.referenceType,
          referenceSource: ref.referenceSource,
          displayOrder: ref.displayOrder,
          isActive: ref.isActive
        })) || []
      }));

      return {
        data,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      this.logger.error('Error fetching my homeworks with submissions and references:', error);
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
