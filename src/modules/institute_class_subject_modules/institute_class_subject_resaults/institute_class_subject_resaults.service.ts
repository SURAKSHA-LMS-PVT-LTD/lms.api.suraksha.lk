import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { now } from '../../../common/utils/timezone.util';
import { CreateInstituteClassSubjectResaultDto } from './dto/create-institute_class_subject_resault.dto';
import { CreateBulkResultsDto } from './dto/create-bulk-results.dto';
import { UpdateInstituteClassSubjectResaultDto } from './dto/update-institute_class_subject_resault.dto';
import { QueryInstituteClassSubjectResaultDto } from './dto/query-institute_class_subject_resault.dto';
import { InstituteClassSubjectResaultResponseDto } from './dto/institute_class_subject_resault-response.dto';
import { InstituteClassSubjectResault } from './entities/institute_class_subject_resault.entity';
import { PaginatedResponseDto } from '../../../common/dto/paginated-response.dto';

@Injectable()
export class InstituteClassSubjectResaultsService {
  constructor(
    @InjectRepository(InstituteClassSubjectResault)
    private readonly resultRepository: Repository<InstituteClassSubjectResault>,
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

  async findAll(queryDto: QueryInstituteClassSubjectResaultDto): Promise<PaginatedResponseDto<InstituteClassSubjectResaultResponseDto>> {
    const { page = 1, limit = 10, ...filters } = queryDto;
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

      // Create individual result objects from bulk structure
      const timestamp = now();
      const resultPromises = bulkDto.results.map(async (studentResult) => {
        const resultData = {
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
        };

        const result = this.resultRepository.create(resultData);
        return await this.resultRepository.save(result);
      });

      const savedResults = await Promise.all(resultPromises);

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

      const responseData = resultsWithDetails.map(result => 
        InstituteClassSubjectResaultResponseDto.fromEntity(result)
      );

      return responseData;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create bulk results: ${error.message}`);
    }
  }

  async findAllRaw(): Promise<any[]> {
    return await this.resultRepository
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
      .getMany();
  }

  async getStats(): Promise<any> {
    const total = await this.resultRepository.count();
    const active = await this.resultRepository.count({ where: { isActive: true } });
    
    // Grade field has been removed - calculating pass/fail based on score instead
    const passed = await this.resultRepository
      .createQueryBuilder('result')
      .where('CAST(result.score AS DECIMAL) >= 40')
      .andWhere('result.isActive = true')
      .getCount();
    
    const failed = await this.resultRepository
      .createQueryBuilder('result')  
      .where('CAST(result.score AS DECIMAL) < 40')
      .andWhere('result.score IS NOT NULL')
      .andWhere('result.isActive = true')
      .getCount();

    const avgScore = await this.resultRepository
      .createQueryBuilder('result')
      .select('AVG(CAST(result.score AS DECIMAL))', 'avgScore')
      .where('result.score IS NOT NULL')
      .getRawOne();

    return {
      total,
      active,
      inactive: total - active,
      passed,
      failed,
      averageScore: avgScore?.avgScore || 0,
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
