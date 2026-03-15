import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { now } from '../../../common/utils/timezone.util';
import { CreateInstituteClassSubjectResaultDto } from './dto/create-institute_class_subject_resault.dto';
import { CreateBulkResultsDto } from './dto/create-bulk-results.dto';
import { UpdateInstituteClassSubjectResaultDto } from './dto/update-institute_class_subject_resault.dto';
import { QueryInstituteClassSubjectResaultDto } from './dto/query-institute_class_subject_resault.dto';
import { InstituteClassSubjectResaultResponseDto } from './dto/institute_class_subject_resault-response.dto';
import { StudentExamMarkDto } from './dto/student-exam-mark.dto';
import { InstituteClassSubjectResault } from './entities/institute_class_subject_resault.entity';
import { InstituteClassSubjectStudent } from '../institute_class_subject_students/entities/institute_class_subject_student.entity';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';
import { InstituteAccessValidator } from '../../../common/helpers/institute-access-validator.helper';
import { CloudStorageService } from '../../../common/services/cloud-storage.service';

@Injectable()
export class InstituteClassSubjectResaultsService {
  constructor(
    @InjectRepository(InstituteClassSubjectResault)
    private readonly resultRepository: Repository<InstituteClassSubjectResault>,
    @InjectRepository(InstituteClassSubjectStudent)
    private readonly subjectStudentRepository: Repository<InstituteClassSubjectStudent>,
    private readonly cloudStorageService: CloudStorageService,
  ) {}

  async create(createDto: CreateInstituteClassSubjectResaultDto): Promise<InstituteClassSubjectResaultResponseDto> {
    try {
      const timestamp = now();
      const resultData = {
        instituteId: createDto.instituteId,
        classId: createDto.classId,
        subjectId: createDto.subjectId,
        studentId: createDto.studentId,
        examId: createDto.examId,
        score: createDto.score,
        grade: createDto.grade,
        remarks: createDto.remarks,
        isActive: createDto.isActive ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const result = this.resultRepository.create(resultData);
      const savedResult = await this.resultRepository.save(result);

      return InstituteClassSubjectResaultResponseDto.fromEntity(savedResult);
    } catch (error) {
      throw new BadRequestException(`Failed to create result: ${error.message}`);
    }
  }

  async findAll(queryDto: QueryInstituteClassSubjectResaultDto, user?: any): Promise<PaginatedResponseDto<InstituteClassSubjectResaultResponseDto>> {
    const { page = 1, limit = 10, ...filters } = queryDto;
    const skip = (page - 1) * limit;

    // SECURITY: Validate parent access if userId provided
    if (user && filters.instituteId) {
      const targetUserId = filters.studentId || filters.userId;
      InstituteAccessValidator.validateInstituteAccess(user, filters.instituteId, undefined, targetUserId, true);
    }

    const queryBuilder = this.resultRepository
      .createQueryBuilder('result')
      .leftJoin('result.student', 'student')
      .leftJoin('result.exam', 'exam')
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email',
        'student.isActive'
      ])
      .addSelect([
        'exam.id',
        'exam.title',
        'exam.examType'
      ]);

    this.applyFilters(queryBuilder, filters);

    const [results, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('result.createdAt', 'DESC')
      .getManyAndCount();

    const resultDtos = results.map(result => 
      InstituteClassSubjectResaultResponseDto.fromEntity(result)
    );

    return new PaginatedResponseDto(resultDtos, page, limit, total);
  }

  async findOne(id: string): Promise<InstituteClassSubjectResaultResponseDto> {
    const result = await this.resultRepository
      .createQueryBuilder('result')
      .leftJoin('result.student', 'student')
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email',
        'student.isActive'
      ])
      .leftJoin('result.exam', 'exam') // Join exam but only select specific fields
      .addSelect(['exam.id', 'exam.title', 'exam.examType']) // Only essential exam fields
      .where('result.id = :id', { id })
      .getOne();

    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    return InstituteClassSubjectResaultResponseDto.fromEntity(result);
  }

  async findByExamId(examId: string, queryDto?: { page?: number; limit?: number }): Promise<PaginatedResponseDto<InstituteClassSubjectResaultResponseDto>> {
    const { page = 1, limit = 10 } = queryDto || {};
    const skip = (page - 1) * limit;

    const queryBuilder = this.resultRepository
      .createQueryBuilder('result')
      .leftJoin('result.student', 'student')
      .leftJoin('result.exam', 'exam')
      .addSelect([
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email',
        'student.isActive'
      ])
      .addSelect([
        'exam.id',
        'exam.title',
        'exam.examType'
      ])
      .where('result.examId = :examId', { examId })
      .andWhere('result.isActive = :isActive', { isActive: true });

    const [results, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy('result.score', 'DESC') // Order by score (highest first)
      .addOrderBy('result.createdAt', 'DESC')
      .getManyAndCount();

    const resultDtos = results.map(result => 
      InstituteClassSubjectResaultResponseDto.fromEntity(result)
    );

    return new PaginatedResponseDto(resultDtos, page, limit, total);
  }

  async findOneWithDetails(id: string): Promise<any> {
    const result = await this.resultRepository
      .createQueryBuilder('result')
      .leftJoin('result.institute', 'institute')
      .leftJoin('result.class', 'class')
      .leftJoin('result.subject', 'subject')
      .leftJoin('result.student', 'student')
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
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email',
        'student.isActive'
      ])
      .where('result.id = :id', { id })
      .getOne();

    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    return result; // Return full entity with all relations
  }

  async update(id: string, updateDto: UpdateInstituteClassSubjectResaultDto): Promise<InstituteClassSubjectResaultResponseDto> {
    const result = await this.resultRepository.findOne({ where: { id } });
    
    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    try {
      const updateData: any = {};
      
      if (updateDto.instituteId !== undefined) updateData.instituteId = updateDto.instituteId;
      if (updateDto.classId !== undefined) updateData.classId = updateDto.classId;
      if (updateDto.subjectId !== undefined) updateData.subjectId = updateDto.subjectId;
      if (updateDto.studentId !== undefined) updateData.studentId = updateDto.studentId;
      if (updateDto.examId !== undefined) updateData.examId = updateDto.examId;
      if (updateDto.score !== undefined) updateData.score = updateDto.score;
      if (updateDto.grade !== undefined) updateData.grade = updateDto.grade;
      if (updateDto.remarks !== undefined) updateData.remarks = updateDto.remarks;
      if (updateDto.isActive !== undefined) updateData.isActive = updateDto.isActive;

      await this.resultRepository.update(id, updateData);
      
      const updatedResult = await this.resultRepository
        .createQueryBuilder('result')
        .leftJoin('result.exam', 'exam')
        .addSelect([
          'exam.id',
          'exam.title',
          'exam.examType'
        ])
        .where('result.id = :id', { id })
        .getOne();

      return InstituteClassSubjectResaultResponseDto.fromEntity(updatedResult!);
    } catch (error) {
      throw new BadRequestException(`Failed to update result: ${error.message}`);
    }
  }

  async remove(id: string): Promise<void> {
    const result = await this.resultRepository.findOne({ where: { id } });
    
    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    await this.resultRepository.delete(id);
  }

  async createBulk(bulkDto: CreateBulkResultsDto): Promise<InstituteClassSubjectResaultResponseDto[]> {
    try {
      // Validate input structure
      if (!bulkDto || typeof bulkDto !== 'object') {
        throw new BadRequestException('Request body must be an object with bulk result structure');
      }

      if (!Array.isArray(bulkDto.results)) {
        throw new BadRequestException('Results field must be an array of student results');
      }

      if (bulkDto.results.length === 0) {
        throw new BadRequestException('Results array cannot be empty');
      }

      // Load existing results for this (institute, class, subject, exam) in one query
      const whereClause: Record<string, string> = {
        instituteId: bulkDto.instituteId,
        classId: bulkDto.classId,
        subjectId: bulkDto.subjectId,
      };
      if (bulkDto.examId) {
        whereClause.examId = bulkDto.examId;
      }
      const existingResults = await this.resultRepository.find({ where: whereClause as any });
      const existingByStudentId = new Map(existingResults.map(r => [r.studentId, r]));

      // Separate into updates (existing rows) and inserts (new rows)
      const timestamp = now();
      const toSave: InstituteClassSubjectResault[] = [];

      for (const studentResult of bulkDto.results) {
        const existing = existingByStudentId.get(studentResult.studentId);
        if (existing) {
          // Update existing record instead of inserting a duplicate
          existing.score = studentResult.score;
          existing.grade = studentResult.grade;
          existing.remarks = studentResult.remarks;
          existing.updatedAt = timestamp;
          toSave.push(existing);
        } else {
          toSave.push(this.resultRepository.create({
            instituteId: bulkDto.instituteId,
            classId: bulkDto.classId,
            subjectId: bulkDto.subjectId,
            examId: bulkDto.examId,
            studentId: studentResult.studentId,
            score: studentResult.score,
            grade: studentResult.grade,
            remarks: studentResult.remarks,
            isActive: true,
            createdAt: timestamp,
            updatedAt: timestamp,
          }));
        }
      }

      const savedResults = await this.resultRepository.save(toSave);

      // ✅ OPTIMIZED: Load student and exam details in bulk to eliminate N+1 queries
      const resultIds = savedResults.map(result => result.id);
      const resultsWithDetails = await this.resultRepository
        .createQueryBuilder('result')
        .leftJoin('result.student', 'student')
        .leftJoin('result.exam', 'exam')
        .addSelect([
          'student.id',
          'student.firstName',
          'student.lastName',
          'student.email',
          'student.isActive'
        ])
        .addSelect([
          'exam.id',
          'exam.title',
          'exam.examType'
        ])
        .where('result.id IN (:...ids)', { ids: resultIds })
        .getMany();

      return resultsWithDetails.map(result =>
        InstituteClassSubjectResaultResponseDto.fromEntity(result)
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create bulk results: ${error.message}`);
    }
  }

  async getStudentsWithExamMarks(
    instituteId: string,
    classId: string,
    subjectId: string,
    examId: string,
  ): Promise<StudentExamMarkDto[]> {
    // 1. Get all active students enrolled in this subject in one query
    const enrollments = await this.subjectStudentRepository
      .createQueryBuilder('ss')
      .leftJoin('ss.student', 'user')
      .addSelect(['user.id', 'user.firstName', 'user.lastName', 'user.imageUrl'])
      .where('ss.instituteId = :instituteId', { instituteId })
      .andWhere('ss.classId = :classId', { classId })
      .andWhere('ss.subjectId = :subjectId', { subjectId })
      .andWhere('ss.isActive = true')
      .getMany();

    // 2. Get all results for this exam in one query, keyed by studentId
    const results = await this.resultRepository.find({
      where: { instituteId, classId, subjectId, examId } as any,
    });
    const resultsByStudentId = new Map(results.map(r => [r.studentId, r]));

    // 3. Combine: every enrolled student gets their marks (or null if not yet graded)
    return enrollments.map((ss) => {
      const result = resultsByStudentId.get(ss.studentId);
      return {
        userId: ss.studentId,
        firstName: ss.student?.firstName ?? null,
        lastName: ss.student?.lastName ?? null,
        imageUrl: ss.student?.imageUrl
          ? this.cloudStorageService.getFullUrl(ss.student.imageUrl)
          : null,
        instituteId: ss.instituteId,
        examId,
        score: result?.score ?? '0',
        grade: result?.grade ?? null,
      };
    });
  }

  async findAllRaw(page: number = 1, limit: number = 100): Promise<{ data: any[]; total: number }> {
    const take = Math.min(limit, 500); // Hard cap at 500
    const skip = (page - 1) * take;
    
    const [data, total] = await this.resultRepository
      .createQueryBuilder('result')
      .leftJoin('result.institute', 'institute')
      .leftJoin('result.class', 'class')
      .leftJoin('result.subject', 'subject')
      .leftJoin('result.student', 'student')
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
        'student.id',
        'student.firstName',
        'student.lastName',
        'student.email',
        'student.isActive'
      ])
      .skip(skip)
      .take(take)
      .orderBy('result.createdAt', 'DESC')
      .getManyAndCount();
    
    return { data, total };
  }

  async getStats(): Promise<any> {
    // Single aggregation query instead of 5 separate round-trips
    const stats = await this.resultRepository
      .createQueryBuilder('result')
      .select([
        'COUNT(*) as total',
        'SUM(CASE WHEN result.isActive = true THEN 1 ELSE 0 END) as active',
        'SUM(CASE WHEN result.isActive = false THEN 1 ELSE 0 END) as inactive',
        'SUM(CASE WHEN CAST(result.score AS DECIMAL) >= 40 AND result.isActive = true THEN 1 ELSE 0 END) as passed',
        'SUM(CASE WHEN CAST(result.score AS DECIMAL) < 40 AND result.score IS NOT NULL AND result.isActive = true THEN 1 ELSE 0 END) as failed',
        'AVG(CASE WHEN result.score IS NOT NULL THEN CAST(result.score AS DECIMAL) END) as avgScore',
      ])
      .getRawOne();

    return {
      total: parseInt(stats.total) || 0,
      active: parseInt(stats.active) || 0,
      inactive: parseInt(stats.inactive) || 0,
      passed: parseInt(stats.passed) || 0,
      failed: parseInt(stats.failed) || 0,
      averageScore: parseFloat(stats.avgScore) || 0,
    };
  }

  private applyFilters(queryBuilder: SelectQueryBuilder<InstituteClassSubjectResault>, filters: any): void {
    if (filters.instituteId) {
      queryBuilder.andWhere('result.instituteId = :instituteId', { instituteId: filters.instituteId });
    }

    if (filters.classId) {
      queryBuilder.andWhere('result.classId = :classId', { classId: filters.classId });
    }

    if (filters.subjectId) {
      queryBuilder.andWhere('result.subjectId = :subjectId', { subjectId: filters.subjectId });
    }

    if (filters.studentId) {
      queryBuilder.andWhere('result.studentId = :studentId', { studentId: filters.studentId });
    }

    if (filters.examId) {
      queryBuilder.andWhere('result.examId = :examId', { examId: filters.examId });
    }

    if (filters.minScore) {
      queryBuilder.andWhere('CAST(result.score AS DECIMAL) >= :minScore', { minScore: filters.minScore });
    }

    if (filters.maxScore) {
      queryBuilder.andWhere('CAST(result.score AS DECIMAL) <= :maxScore', { maxScore: filters.maxScore });
    }

    if (filters.grade) {
      queryBuilder.andWhere('result.grade = :grade', { grade: filters.grade });
    }

    if (filters.isActive !== undefined) {
      queryBuilder.andWhere('result.isActive = :isActive', { isActive: filters.isActive });
    }

    if (filters.remarksSearch) {
      queryBuilder.andWhere('result.remarks LIKE :remarksSearch', { remarksSearch: `%${filters.remarksSearch}%` });
    }
  }
}
