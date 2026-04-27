import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getCurrentSriLankaTime, getCurrentSriLankaISO } from '../../../common/utils/timezone.util';
import { plainToClass } from 'class-transformer';
import { CreateInstituteClassSubjectExamDto } from './dto/create-institute_class_subject_exam.dto';
import { UpdateInstituteClassSubjectExamDto } from './dto/update-institute_class_subject_exam.dto';
import { QueryInstituteClassSubjectExamDto } from './dto/query-institute-class-subject-exam.dto';
import { InstituteClassSubjectExamResponseDto } from './dto/institute-class-subject-exam-response.dto';
import { PaginatedInstituteClassSubjectExamResponseDto } from './dto/paginated-institute-class-subject-exam-response.dto';
import { InstituteClassSubjectExam } from './entities/institute_class_subject_exam.entity';
import { ExamRepository } from './repositories/exam.repository';
import { UserEntity } from '../../user/entities/user.entity';
import { InstituteAccessValidator, ROLE_BITMASKS } from '../../../common/helpers/institute-access-validator.helper';

/**
 * Institute Class Subject Exams Service
 * 
 * PERFORMANCE OPTIMIZATIONS IMPLEMENTED:
 * =====================================
 * 
 * 1. **Single Query Architecture**: 
 *    - Replaced multiple separate queries with unified findAll() method
 *    - All filtering operations use single optimized QueryBuilder
 *    - Eliminated N+1 query problems through consolidated JOINs
 * 
 * 2. **Efficient Database Operations**:
 *    - All related data loaded in single query with leftJoinAndSelect
 *    - Proper column name mapping (camelCase entity ↔ snake_case DB)
 *    - Optimized WHERE condition building with parameter binding
 * 
 * 3. **Controller Route Optimization**:
 *    - /institute/:id, /class/:id, /subject/:id routes use findAll() internally
 *    - Supports full filtering, pagination, and search across all endpoints
 *    - Consistent performance and functionality across all routes
 * 
 * 4. **Query Features**:
 *    - Advanced filtering (by institute, class, subject, status, dates, etc.)
 *    - Full-text search in title and description
 *    - Flexible pagination and sorting
 *    - Proper date range filtering
 * 
 * USAGE EXAMPLES:
 * ==============
 * - GET /exams?instituteId=44&status=scheduled&fromDate=2025-08-01
 * - GET /exams/institute/44?classId=40&examType=physical
 * - GET /exams/class/40?search=mathematics&page=1&limit=10
 */
@Injectable()
export class InstituteClassSubjectExamsService {
  private readonly logger = new Logger(InstituteClassSubjectExamsService.name);

  constructor(
    @InjectRepository(InstituteClassSubjectExam)
    private readonly examRepository: Repository<InstituteClassSubjectExam>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly customExamRepository: ExamRepository,
  ) {}

  async create(createDto: CreateInstituteClassSubjectExamDto, currentUserId?: string): Promise<InstituteClassSubjectExamResponseDto> {
    try {

      // Validate schedule dates and times
      const examDate = new Date(createDto.examDate);
      const startTime = new Date(`${createDto.examDate}T${createDto.startTime}`);
      const endTime = new Date(`${createDto.examDate}T${createDto.endTime}`);

      if (startTime >= endTime) {
        throw new BadRequestException('Start time must be before end time');
      }

      if (examDate < new Date()) {
        throw new BadRequestException('Exam date cannot be in the past');
      }

      // Duration is already in minutes from DTO
      const durationMinutes = createDto.duration;

      // Validate passing marks
      if (createDto.passingMarks >= createDto.maxMarks) {
        throw new BadRequestException('Passing marks must be less than maximum marks');
      }

      // Use current user ID from JWT token, or fallback to DTO value (for backwards compatibility)
      let validatedCreatedBy: string | undefined = undefined;
      const createdByValue = currentUserId || createDto.createdBy;
      
      if (createdByValue) {
        const user = await this.userRepository.findOne({ where: { id: createdByValue } });
        if (!user) {
          this.logger.warn(`User with ID ${createdByValue} not found. Creating exam without createdBy.`);
          validatedCreatedBy = undefined;
        } else {
          validatedCreatedBy = createdByValue;
        }
      }

      // Create exam entity
      const timestamp = getCurrentSriLankaISO();
      const exam = this.examRepository.create({
        instituteId: createDto.instituteId,
        classId: createDto.classId,
        subjectId: createDto.subjectId,
        title: createDto.title,
        description: createDto.description,
        examType: createDto.examType,
        durationMinutes: durationMinutes,
        totalMarks: createDto.maxMarks,
        passingMarks: createDto.passingMarks,
        scheduleDate: examDate,
        startTime: startTime,
        endTime: endTime,
        venue: createDto.venue,
        examLink: createDto.examLink,
        instructions: createDto.instructions,
        status: createDto.status || 'draft',
        createdBy: validatedCreatedBy,
        toWhom: createDto.toWhom || 'everyone',
        isActive: createDto.isActive ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      const savedExam = await this.examRepository.save(exam);
      
      
      return plainToClass(InstituteClassSubjectExamResponseDto, savedExam, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.logger.error('Error creating exam:', error);
      throw error;
    }
  }

  async findAll(query: QueryInstituteClassSubjectExamDto, user?: any): Promise<PaginatedInstituteClassSubjectExamResponseDto> {
    try {
      
      // SECURITY: Validate user has access to requested institute, class, and subject
      if (user) {
        if (query.instituteId) {
          // Extract targetUserId for parent access validation
          const targetUserId = query.userId;
          
          // Validate institute access first - pass targetUserId and isReadOnly=true to allow parent access
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
      
      const page = parseInt(query.page || '1') || 1;
      const limit = parseInt(query.limit || '10') || 10;
      const skip = (page - 1) * limit;

      // Build optimized query with only necessary joins and columns
      let queryBuilder = this.examRepository.createQueryBuilder('exam')
        .select([
          'exam.id',
          'exam.instituteId', 
          'exam.classId',
          'exam.subjectId',
          'exam.title',
          'exam.description',
          'exam.examType',
          'exam.durationMinutes',
          'exam.totalMarks',
          'exam.passingMarks', 
          'exam.scheduleDate',
          'exam.startTime',
          'exam.endTime',
          'exam.venue',
          'exam.examLink',
          'exam.instructions',
          'exam.status',
          'exam.createdBy',
          'exam.toWhom',
          'exam.isActive',
          'exam.createdAt',
          'exam.updatedAt'
        ]);

      // Add joins only when necessary for response data (not for filtering)
      const needsInstitute = true; // Always needed for response
      const needsClass = true;     // Always needed for response  
      const needsSubject = true;   // Always needed for response
      const needsCreator = query.createdBy || query.teacherId; // Only when filtering by creator

      if (needsInstitute) {
        queryBuilder.leftJoin('exam.institute', 'institute')
          .addSelect(['institute.id', 'institute.name', 'institute.code']);
      }
      
      if (needsClass) {
        queryBuilder.leftJoin('exam.class', 'class') 
          .addSelect(['class.id', 'class.name', 'class.code', 'class.grade']);
      }
      
      if (needsSubject) {
        queryBuilder.leftJoin('exam.subject', 'subject')
          .addSelect(['subject.id', 'subject.name', 'subject.code']);
      }
      
      if (needsCreator || true) { // Always include for now, can optimize later
        queryBuilder.leftJoin('exam.creator', 'creator')
          .addSelect(['creator.id', 'creator.firstName', 'creator.lastName', 'creator.nameWithInitials', 'creator.email', 'creator.imageUrl']);
      }

      // Apply all filters efficiently using proper column names
      const whereConditions: string[] = [];
      const parameters: any = {};

      if (query.instituteId) {
        whereConditions.push('exam.instituteId = :instituteId');
        parameters.instituteId = query.instituteId;
      }

      if (query.classId) {
        whereConditions.push('exam.classId = :classId');
        parameters.classId = query.classId;
      }

      if (query.subjectId) {
        whereConditions.push('exam.subjectId = :subjectId');
        parameters.subjectId = query.subjectId;
      }

      if (query.examType) {
        whereConditions.push('exam.examType = :examType');
        parameters.examType = query.examType;
      }

      if (query.status) {
        whereConditions.push('exam.status = :status');
        parameters.status = query.status;
      }

      if (query.createdBy) {
        whereConditions.push('exam.createdBy = :createdBy');
        parameters.createdBy = query.createdBy;
      }

      // Handle teacherId as alias for createdBy
      if (query.teacherId) {
        whereConditions.push('exam.createdBy = :teacherId');
        parameters.teacherId = query.teacherId;
      }

      // Handle isActive filter with proper default (show active records by default)
      if (query.isActive !== undefined) {
        whereConditions.push('exam.isActive = :isActive');
        parameters.isActive = query.isActive;
      } else {
        // Default to showing only active records unless explicitly requesting all
        whereConditions.push('exam.isActive = :isActive');
        parameters.isActive = true;
      }

      if (query.fromDate) {
        whereConditions.push('exam.scheduleDate >= :fromDate');
        parameters.fromDate = new Date(query.fromDate);
      }

      if (query.toDate) {
        whereConditions.push('exam.scheduleDate <= :toDate');
        parameters.toDate = new Date(query.toDate);
      }

      if (query.search) {
        whereConditions.push('(exam.title LIKE :search OR exam.description LIKE :search)');
        parameters.search = `%${query.search}%`;
      }

      // Apply all where conditions at once
      if (whereConditions.length > 0) {
        queryBuilder.where(whereConditions.join(' AND '), parameters);
      }

      // Apply optimized sorting with proper column mapping
      const sortColumnMap: { [key: string]: string } = {
        'scheduleDate': 'exam.scheduleDate',
        'schedule_date': 'exam.scheduleDate',
        'title': 'exam.title',
        'examType': 'exam.examType',
        'exam_type': 'exam.examType',
        'status': 'exam.status',
        'createdAt': 'exam.createdAt',
        'created_at': 'exam.createdAt',
        'totalMarks': 'exam.totalMarks',
        'total_marks': 'exam.totalMarks'
      };

      const sortBy = query.sortBy || 'scheduleDate';
      const sortColumn = sortColumnMap[sortBy] || 'exam.scheduleDate';
      const sortOrder = query.sortOrder || 'ASC';
      
      queryBuilder.orderBy(sortColumn, sortOrder);

      // Add secondary sort for consistent pagination
      if (sortBy !== 'createdAt' && sortBy !== 'created_at') {
        queryBuilder.addOrderBy('exam.createdAt', 'DESC');
      }

      // Apply pagination
      queryBuilder.skip(skip).take(limit);

      // Execute single optimized query
      
      const [exams, total] = await queryBuilder.getManyAndCount();
      


      // Transform to DTOs efficiently
      const examDtos = exams.map(exam => 
        plainToClass(InstituteClassSubjectExamResponseDto, exam, {
          excludeExtraneousValues: true,
        })
      );

      return new PaginatedInstituteClassSubjectExamResponseDto(examDtos, total, page, limit);
    } catch (error) {
      this.logger.error('Error fetching exams with optimized query:', error);
      throw error;
    }
  }

  async findOne(id: string, user?: any): Promise<InstituteClassSubjectExamResponseDto> {
    try {
      
      const exam = await this.examRepository.createQueryBuilder('exam')
        .select([
          'exam.id',
          'exam.instituteId', 
          'exam.classId',
          'exam.subjectId',
          'exam.title',
          'exam.description',
          'exam.examType',
          'exam.durationMinutes',
          'exam.totalMarks',
          'exam.passingMarks', 
          'exam.scheduleDate',
          'exam.startTime',
          'exam.endTime',
          'exam.venue',
          'exam.examLink',
          'exam.instructions',
          'exam.status',
          'exam.createdBy',
          'exam.toWhom',
          'exam.isActive',
          'exam.createdAt',
          'exam.updatedAt'
        ])
        .leftJoin('exam.institute', 'institute')
        .addSelect(['institute.id', 'institute.name', 'institute.code'])
        .leftJoin('exam.class', 'class')
        .addSelect(['class.id', 'class.name', 'class.code', 'class.grade'])
        .leftJoin('exam.subject', 'subject')
        .addSelect(['subject.id', 'subject.name', 'subject.code'])
        .leftJoin('exam.creator', 'creator')
        .addSelect(['creator.id', 'creator.firstName', 'creator.lastName', 'creator.nameWithInitials', 'creator.email', 'creator.imageUrl'])
        .where('exam.id = :id', { id })
        .getOne();

      if (!exam) {
        throw new NotFoundException(`Exam with ID ${id} not found`);
      }

      // SECURITY: Validate user has access to this exam's institute, class, and subject
      if (user) {
        InstituteAccessValidator.validateResourceAccess(user, exam);
        
        // Validate class and subject access
        const userInstituteAccess = Array.isArray(user.i) ? user.i : [];
        const instituteEntry = userInstituteAccess.find((entry: any) => entry.i === exam.instituteId);
        
        if (instituteEntry && Array.isArray(instituteEntry.c)) {
          // Validate class access
          const classSubjectEntry = instituteEntry.c.find(
            ([classId]: [string, number]) => classId === exam.classId
          );
          
          if (!classSubjectEntry) {
            throw new ForbiddenException(`You do not have access to class ${exam.classId} in institute ${exam.instituteId}`);
          }
          
          // Validate subject access using bitmask
          const [classId, subjectBitmask] = classSubjectEntry;
          const subjectIdNum = parseInt(exam.subjectId, 10);
          // Proper bitmask check: subject ID 1 = bit 0, subject ID 2 = bit 1, etc.
          const hasSubjectAccess = (subjectBitmask & (1 << (subjectIdNum - 1))) !== 0;
          
          if (!hasSubjectAccess) {
            throw new ForbiddenException(`You do not have access to subject ${exam.subjectId} in class ${exam.classId}`);
          }
        }
      }

      return plainToClass(InstituteClassSubjectExamResponseDto, exam, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.logger.error(`Error fetching exam with ID ${id}:`, error);
      throw error;
    }
  }

  async update(id: string, updateDto: UpdateInstituteClassSubjectExamDto, user: any): Promise<InstituteClassSubjectExamResponseDto> {
    try {
      
      const exam = await this.examRepository.findOne({ where: { id } });
      
      if (!exam) {
        throw new NotFoundException(`Exam with ID ${id} not found`);
      }

      // Validate user has access to this exam's institute with required roles
      InstituteAccessValidator.validateResourceAccess(user, exam, [ROLE_BITMASKS.TEACHER, ROLE_BITMASKS.INSTITUTE_ADMIN]);

      // Validate schedule dates if being updated
      if (updateDto.startTime || updateDto.endTime) {
        const startTime = updateDto.startTime ? new Date(updateDto.startTime) : exam.startTime;
        const endTime = updateDto.endTime ? new Date(updateDto.endTime) : exam.endTime;
        
        if (startTime >= endTime) {
          throw new BadRequestException('Start time must be before end time');
        }
      }

      // Validate passing marks if being updated
      if (updateDto.passingMarks !== undefined || updateDto.maxMarks !== undefined) {
        const passingMarks = updateDto.passingMarks ?? exam.passingMarks;
        const maxMarks = updateDto.maxMarks ?? exam.totalMarks;
        
        if (passingMarks >= maxMarks) {
          throw new BadRequestException('Passing marks must be less than maximum marks');
        }
      }

      // Update exam
      const updateData: any = {};
      
      // Map fields from DTO to entity
      if (updateDto.instituteId !== undefined) updateData.instituteId = updateDto.instituteId;
      if (updateDto.classId !== undefined) updateData.classId = updateDto.classId;
      if (updateDto.subjectId !== undefined) updateData.subjectId = updateDto.subjectId;
      if (updateDto.title !== undefined) updateData.title = updateDto.title;
      if (updateDto.description !== undefined) updateData.description = updateDto.description;
      if (updateDto.examType !== undefined) updateData.examType = updateDto.examType;
      if (updateDto.passingMarks !== undefined) updateData.passingMarks = updateDto.passingMarks;
      if (updateDto.venue !== undefined) updateData.venue = updateDto.venue;
      if (updateDto.examLink !== undefined) updateData.examLink = updateDto.examLink;
      if (updateDto.instructions !== undefined) updateData.instructions = updateDto.instructions;
      if (updateDto.status !== undefined) updateData.status = updateDto.status;
      // createdBy is excluded from UpdateDto - it should not be changed after creation
      if (updateDto.toWhom !== undefined) updateData.toWhom = updateDto.toWhom;
      if (updateDto.isActive !== undefined) updateData.isActive = updateDto.isActive;
      
      // Handle field mapping
      if (updateDto.maxMarks !== undefined) {
        updateData.totalMarks = updateDto.maxMarks;
      }
      if (updateDto.duration !== undefined) {
        // Duration is already in minutes from DTO
        updateData.durationMinutes = updateDto.duration;
      }
      if (updateDto.examDate !== undefined) {
        updateData.scheduleDate = new Date(updateDto.examDate);
      }
      if (updateDto.startTime !== undefined) {
        const dateStr = updateDto.examDate || exam.scheduleDate.toISOString().split('T')[0];
        updateData.startTime = new Date(`${dateStr}T${updateDto.startTime}`);
      }
      if (updateDto.endTime !== undefined) {
        const dateStr = updateDto.examDate || exam.scheduleDate.toISOString().split('T')[0];
        updateData.endTime = new Date(`${dateStr}T${updateDto.endTime}`);
      }

      await this.examRepository.update(id, updateData);
      
      const updatedExam = await this.examRepository.createQueryBuilder('exam')
        .select([
          'exam.id',
          'exam.instituteId', 
          'exam.classId',
          'exam.subjectId',
          'exam.title',
          'exam.description',
          'exam.examType',
          'exam.durationMinutes',
          'exam.totalMarks',
          'exam.passingMarks', 
          'exam.scheduleDate',
          'exam.startTime',
          'exam.endTime',
          'exam.venue',
          'exam.examLink',
          'exam.instructions',
          'exam.status',
          'exam.createdBy',
          'exam.toWhom',
          'exam.isActive',
          'exam.createdAt',
          'exam.updatedAt'
        ])
        .leftJoin('exam.institute', 'institute')
        .addSelect(['institute.id', 'institute.name', 'institute.code'])
        .leftJoin('exam.class', 'class')
        .addSelect(['class.id', 'class.name', 'class.code', 'class.grade'])
        .leftJoin('exam.subject', 'subject')
        .addSelect(['subject.id', 'subject.name', 'subject.code'])
        .leftJoin('exam.creator', 'creator')
        .addSelect(['creator.id', 'creator.firstName', 'creator.lastName', 'creator.nameWithInitials', 'creator.email', 'creator.imageUrl'])
        .where('exam.id = :id', { id })
        .getOne();

      
      return plainToClass(InstituteClassSubjectExamResponseDto, updatedExam, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.logger.error(`Error updating exam with ID ${id}:`, error);
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      
      const exam = await this.examRepository.findOne({ where: { id } });
      
      if (!exam) {
        throw new NotFoundException(`Exam with ID ${id} not found`);
      }

      await this.examRepository.delete(id);
      
    } catch (error) {
      this.logger.error(`Error removing exam with ID ${id}:`, error);
      throw error;
    }
  }

  async softDelete(id: string, user: any): Promise<InstituteClassSubjectExamResponseDto> {
    try {
      
      const exam = await this.examRepository.findOne({ where: { id } });
      
      if (!exam) {
        throw new NotFoundException(`Exam with ID ${id} not found`);
      }

      // Validate user has access to this exam's institute with required roles
      InstituteAccessValidator.validateResourceAccess(user, exam, [ROLE_BITMASKS.TEACHER, ROLE_BITMASKS.INSTITUTE_ADMIN]);

      await this.examRepository.update(id, { isActive: false });
      
      const updatedExam = await this.examRepository.createQueryBuilder('exam')
        .leftJoin('exam.institute', 'institute')
        .leftJoin('exam.class', 'class')
        .leftJoin('exam.subject', 'subject')
        .leftJoin('exam.creator', 'creator')
        .addSelect([
          'institute.id',
          'institute.name',
          'institute.isActive'
        ])
        .addSelect([
          'class.id',
          'class.name',
          'class.isActive'
        ])
        .addSelect([
          'subject.id',
          'subject.name',
          'subject.isActive'
        ])
        .addSelect([
          'creator.id',
          'creator.firstName',
          'creator.lastName',
          'creator.nameWithInitials',
          'creator.email',
          'creator.imageUrl'
        ])
        .where('exam.id = :id', { id })
        .getOne();

      
      return plainToClass(InstituteClassSubjectExamResponseDto, updatedExam, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.logger.error(`Error soft deleting exam with ID ${id}:`, error);
      throw error;
    }
  }

  async findUpcomingExams(instituteId?: string, user?: any): Promise<InstituteClassSubjectExamResponseDto[]> {
    try {
      
      // SECURITY: Validate user has access to requested institute
      if (user && instituteId) {
        InstituteAccessValidator.validateInstituteAccess(user, instituteId);
      }
      
      const queryBuilder = this.examRepository.createQueryBuilder('exam')
        .select([
          'exam.id',
          'exam.instituteId', 
          'exam.classId',
          'exam.subjectId',
          'exam.title',
          'exam.description',
          'exam.examType',
          'exam.durationMinutes',
          'exam.totalMarks',
          'exam.passingMarks', 
          'exam.scheduleDate',
          'exam.startTime',
          'exam.endTime',
          'exam.venue',
          'exam.examLink',
          'exam.instructions',
          'exam.status',
          'exam.createdBy',
          'exam.toWhom',
          'exam.isActive',
          'exam.createdAt',
          'exam.updatedAt'
        ])
        .leftJoin('exam.institute', 'institute')
        .addSelect(['institute.id', 'institute.name', 'institute.code'])
        .leftJoin('exam.class', 'class')
        .addSelect(['class.id', 'class.name', 'class.code', 'class.grade'])
        .leftJoin('exam.subject', 'subject')
        .addSelect(['subject.id', 'subject.name', 'subject.code'])
        .leftJoin('exam.creator', 'creator')
        .addSelect(['creator.id', 'creator.firstName', 'creator.lastName', 'creator.nameWithInitials', 'creator.email', 'creator.imageUrl'])
        .where('exam.scheduleDate >= :now', { now: new Date() })
        .andWhere('exam.isActive = :isActive', { isActive: true })
        .andWhere('exam.status IN (:...statuses)', { statuses: ['scheduled', 'active'] });

      if (instituteId) {
        queryBuilder.andWhere('exam.instituteId = :instituteId', { instituteId });
      }

      const exams = await queryBuilder
        .orderBy('exam.scheduleDate', 'ASC')
        .addOrderBy('exam.startTime', 'ASC')
        .getMany();

      return exams.map(exam => 
        plainToClass(InstituteClassSubjectExamResponseDto, exam, {
          excludeExtraneousValues: true,
        })
      );
    } catch (error) {
      this.logger.error('Error fetching upcoming exams:', error);
      throw error;
    }
  }

  async updateStatus(id: string, status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled', user: any): Promise<InstituteClassSubjectExamResponseDto> {
    try {
      
      const exam = await this.examRepository.findOne({ where: { id } });
      
      if (!exam) {
        throw new NotFoundException(`Exam with ID ${id} not found`);
      }

      // Validate user has access to this exam's institute with required roles
      InstituteAccessValidator.validateResourceAccess(user, exam, [ROLE_BITMASKS.TEACHER, ROLE_BITMASKS.INSTITUTE_ADMIN]);

      await this.examRepository.update(id, { status });
      
      const updatedExam = await this.examRepository.createQueryBuilder('exam')
        .leftJoin('exam.institute', 'institute')
        .leftJoin('exam.class', 'class')
        .leftJoin('exam.subject', 'subject')
        .leftJoin('exam.creator', 'creator')
        .addSelect([
          'institute.id',
          'institute.name',
          'institute.isActive'
        ])
        .addSelect([
          'class.id',
          'class.name',
          'class.isActive'
        ])
        .addSelect([
          'subject.id',
          'subject.name',
          'subject.isActive'
        ])
        .addSelect([
          'creator.id',
          'creator.firstName',
          'creator.lastName',
          'creator.nameWithInitials',
          'creator.email',
          'creator.imageUrl'
        ])
        .where('exam.id = :id', { id })
        .getOne();

      
      return plainToClass(InstituteClassSubjectExamResponseDto, updatedExam, {
        excludeExtraneousValues: true,
      });
    } catch (error) {
      this.logger.error(`Error updating exam status for ID ${id}:`, error);
      throw error;
    }
  }

  async debugGetRawExams(): Promise<any> {
    try {
      
      // Try the most basic query possible with specific columns
      const rawData = await this.examRepository.query(`
        SELECT id, title, description, examType, totalMarks, passingMarks, duration, 
               startDate, endDate, isActive, instituteId, classId, subjectId, createdAt, updatedAt 
        FROM institute_class_subject_exams 
        LIMIT 10
      `);
      
      // Try with repository find
      const findAllData = await this.examRepository.find({ take: 10 });
      
      // Try with query builder
      const qbData = await this.examRepository.createQueryBuilder('exam')
        .limit(10)
        .getMany();
      
      return {
        rawSql: rawData,
        repositoryFind: findAllData,
        queryBuilder: qbData,
        counts: {
          rawSql: rawData.length,
          repositoryFind: findAllData.length,
          queryBuilder: qbData.length
        }
      };
    } catch (error) {
      this.logger.error('Debug error:', error);
      throw error;
    }
  }
}
