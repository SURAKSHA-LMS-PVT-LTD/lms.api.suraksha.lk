import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, Like } from 'typeorm';
import { InstituteClassSubjectExam } from '../entities/institute_class_subject_exam.entity';
import { 
  IExamRepository,
  IExamCriteria,
  ICreateExam,
  IUpdateExam,
  IFindAllOptions,
  IFindOneOptions,
  IExamScheduleCriteria,
  IExamSchedule,
  IExamAnalytics
} from '../interfaces/exam.interface';
import { EXAM_CONSTANTS } from '../constants/exam.constants';

// Whitelist prevents arbitrary column names from being injected into query builder
const EXAM_CRITERIA_KEYS: ReadonlySet<string> = new Set([
  'id', 'instituteId', 'classId', 'subjectId', 'creatorId',
  'status', 'examType', 'category', 'startTime', 'endTime', 'isActive',
]);

@Injectable()
export class ExamRepository implements IExamRepository {
  constructor(
    @InjectRepository(InstituteClassSubjectExam)
    private readonly repository: Repository<InstituteClassSubjectExam>,
  ) {}

  async findAll(options: IFindAllOptions = {}): Promise<InstituteClassSubjectExam[]> {
    const queryBuilder = this.repository.createQueryBuilder('exam');
    
    if (options.withRelations || options.relations) {
      const relations = options.relations || EXAM_CONSTANTS.RELATIONS.ALL;
      relations.forEach(relation => {
        queryBuilder.leftJoinAndSelect(`exam.${relation}`, relation);
      });
    }

    if (options.where) {
      queryBuilder.where(options.where);
    }

    if (options.order) {
      if (typeof options.order === 'object') {
        Object.entries(options.order).forEach(([key, value]) => {
          queryBuilder.addOrderBy(`exam.${key}`, value as 'ASC' | 'DESC');
        });
      }
    } else {
      queryBuilder.orderBy('exam.scheduleDate', 'ASC');
    }

    if (options.skip) {
      queryBuilder.skip(options.skip);
    }

    if (options.take) {
      queryBuilder.take(options.take);
    }

    return queryBuilder.getMany();
  }

  async findOne(criteria: IExamCriteria, options: IFindOneOptions = {}): Promise<InstituteClassSubjectExam | null> {
    const queryBuilder = this.repository.createQueryBuilder('exam');
    
    if (options.withRelations || options.relations) {
      const relations = options.relations || EXAM_CONSTANTS.RELATIONS.BASIC;
      relations.forEach(relation => {
        queryBuilder.leftJoinAndSelect(`exam.${relation}`, relation);
      });
    }

    // Build where conditions
    Object.keys(criteria).forEach(key => {
      if (EXAM_CRITERIA_KEYS.has(key) && criteria[key] !== undefined) {
        queryBuilder.andWhere(`exam.${key} = :${key}`, { [key]: criteria[key] });
      }
    });

    return queryBuilder.getOne();
  }

  async create(data: ICreateExam): Promise<InstituteClassSubjectExam> {
    // Ensure all required fields are included in examData
    const examData: Partial<InstituteClassSubjectExam> = {
      instituteId: data.instituteId,
      classId: data.classId,
      subjectId: data.subjectId, // Corrected field name
      scheduleDate: data.startTime,
      startTime: data.startTime,
      endTime: data.endTime,
      venue: data.venue,
      examLink: data.examType === 'online' ? data.venue : undefined, // Use venue as exam link for online
      instructions: data.instructions,
      isActive: data.isActive !== false,
    };

    // Validate that all required fields are present
    if (!examData.instituteId || !examData.classId || !examData.subjectId) {
      throw new Error('Missing required fields: instituteId, classId, or subjectId');
    }

    const exam = this.repository.create(examData);
    return await this.repository.save(exam);
  }

  async update(
    criteria: IExamCriteria,
    data: IUpdateExam,
  ): Promise<InstituteClassSubjectExam> {
    const exam = await this.findOne(criteria);
    if (!exam) {
      throw new Error('Exam not found');
    }

    const updateData: any = { ...data };
    if (data.startTime) {
      updateData.scheduleDate = data.startTime;
    }

    await this.repository.update(exam.id, updateData);
    const updatedExam = await this.findOne({ id: exam.id });
    return updatedExam!; // We know it exists since we just updated it
  }

  async delete(criteria: IExamCriteria): Promise<boolean> {
    const exam = await this.findOne(criteria);
    if (!exam) {
      return false;
    }

    await this.repository.update(exam.id, { isActive: false });
    return true;
  }

  async bulkCreate(data: ICreateExam[]): Promise<InstituteClassSubjectExam[]> {
    const examData = data.map(item => ({
      instituteId: item.instituteId,
      classId: item.classId,
      subjectId: item.subjectId,
      createdBy: item.creatorId,
      title: item.title,
      description: item.description,
      examType: item.examType === 'hybrid' ? 'physical' as const : item.examType as 'online' | 'physical',
      durationMinutes: item.durationMinutes,
      totalMarks: item.totalMarks,
      passingMarks: item.passingMarks,
      scheduleDate: item.startTime,
      startTime: item.startTime,
      endTime: item.endTime,
      venue: item.venue,
      examLink: item.examType === 'online' ? item.venue : undefined,
      instructions: item.instructions,
      isActive: item.isActive !== false,
    }));
    
    return await this.repository.save(examData);
  }

  async findByInstitute(
    instituteId: string,
    options: IFindAllOptions = {},
  ): Promise<InstituteClassSubjectExam[]> {
    return this.findAll({
      ...options,
      where: { ...options.where, instituteId },
    });
  }

  async findByClass(
    classId: string,
    options: IFindAllOptions = {},
  ): Promise<InstituteClassSubjectExam[]> {
    return this.findAll({
      ...options,
      where: { ...options.where, classId },
    });
  }

  async findBySubject(
    subjectId: string,
    options: IFindAllOptions = {},
  ): Promise<InstituteClassSubjectExam[]> {
    return this.findAll({
      ...options,
      where: { ...options.where, subjectId },
    });
  }

  async findByCreator(
    creatorId: string,
    options: IFindAllOptions = {},
  ): Promise<InstituteClassSubjectExam[]> {
    return this.findAll({
      ...options,
      where: { ...options.where, createdBy: creatorId },
    });
  }

  async findByDateRange(
    startDate: Date,
    endDate: Date,
    criteria: Partial<IExamCriteria> = {},
  ): Promise<InstituteClassSubjectExam[]> {
    const queryBuilder = this.repository.createQueryBuilder('exam');
    
    queryBuilder.where('exam.scheduleDate BETWEEN :startDate AND :endDate', {
      startDate,
      endDate,
    });

    Object.keys(criteria).forEach(key => {
      if (EXAM_CRITERIA_KEYS.has(key) && criteria[key] !== undefined) {
        queryBuilder.andWhere(`exam.${key} = :${key}`, { [key]: criteria[key] });
      }
    });

    return queryBuilder.getMany();
  }

  async findConflictingExams(
    startTime: Date,
    endTime: Date,
    classId?: string,
    subjectId?: string,
  ): Promise<InstituteClassSubjectExam[]> {
    const queryBuilder = this.repository.createQueryBuilder('exam');
    
    queryBuilder.where(
      '(exam.startTime BETWEEN :startTime AND :endTime OR exam.endTime BETWEEN :startTime AND :endTime OR (:startTime BETWEEN exam.startTime AND exam.endTime))',
      { startTime, endTime },
    );

    if (classId) {
      queryBuilder.andWhere('exam.classId = :classId', { classId });
    }

    if (subjectId) {
      queryBuilder.andWhere('exam.subjectId = :subjectId', { subjectId });
    }

    queryBuilder.andWhere('exam.status != :cancelledStatus', { 
      cancelledStatus: 'cancelled' 
    });

    return queryBuilder.getMany();
  }

  async getExamSchedule(criteria: IExamScheduleCriteria): Promise<IExamSchedule[]> {
    const queryBuilder = this.repository.createQueryBuilder('exam');
    
    queryBuilder.leftJoinAndSelect('exam.subject', 'subject');
    queryBuilder.leftJoinAndSelect('exam.class', 'class');
    
    if (criteria.date) {
      const targetDate = new Date(criteria.date);
      // Clone before mutating to avoid setHours side-effects on the original
      const startOfDay = new Date(new Date(targetDate).setHours(0, 0, 0, 0));
      const endOfDay = new Date(new Date(targetDate).setHours(23, 59, 59, 999));
      
      queryBuilder.where('exam.scheduleDate BETWEEN :startOfDay AND :endOfDay', {
        startOfDay,
        endOfDay,
      });
    } else if (criteria.startDate && criteria.endDate) {
      queryBuilder.where('exam.scheduleDate BETWEEN :startDate AND :endDate', {
        startDate: criteria.startDate,
        endDate: criteria.endDate,
      });
    }

    if (criteria.instituteId) {
      queryBuilder.andWhere('exam.instituteId = :instituteId', {
        instituteId: criteria.instituteId,
      });
    }

    if (criteria.classId) {
      queryBuilder.andWhere('exam.classId = :classId', { classId: criteria.classId });
    }

    if (criteria.subjectId) {
      queryBuilder.andWhere('exam.subjectId = :subjectId', { subjectId: criteria.subjectId });
    }

    if (criteria.status) {
      queryBuilder.andWhere('exam.status = :status', { status: criteria.status });
    }

    queryBuilder.orderBy('exam.scheduleDate', 'ASC');
    
    const exams = await queryBuilder.getMany();
    
    // Group exams by date
    const examsByDate = exams.reduce((acc, exam) => {
      const dateKey = exam.scheduleDate.toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(exam);
      return acc;
    }, {} as Record<string, InstituteClassSubjectExam[]>);

    return Object.entries(examsByDate).map(([date, exams]) => ({
      date,
      exams,
      totalExams: exams.length,
    }));
  }

  async getExamAnalytics(criteria: Partial<IExamCriteria> = {}): Promise<IExamAnalytics> {
    const queryBuilder = this.repository.createQueryBuilder('exam');
    
    Object.keys(criteria).forEach(key => {
      if (EXAM_CRITERIA_KEYS.has(key) && criteria[key] !== undefined) {
        queryBuilder.andWhere(`exam.${key} = :${key}`, { [key]: criteria[key] });
      }
    });

    const [totalExams, examsByStatus] = await Promise.all([
      queryBuilder.getCount(),
      this.repository.createQueryBuilder('exam')
        .select('exam.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('exam.status')
        .getRawMany(),
    ]);

    const statusCounts = examsByStatus.reduce((acc, item) => {
      acc[item.status] = parseInt(item.count, 10) || 0;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalExams,
      completedExams: statusCounts.completed || 0,
      ongoingExams: statusCounts.active || 0,
      scheduledExams: statusCounts.scheduled || 0,
      examsByCategory: {}, // Would need to implement category grouping
      examsBySubject: {}, // Would need to implement subject grouping
    };
  }

  async exists(criteria: IExamCriteria): Promise<boolean> {
    const exam = await this.findOne(criteria);
    return !!exam;
  }

  async count(criteria: Partial<IExamCriteria> = {}): Promise<number> {
    const queryBuilder = this.repository.createQueryBuilder('exam');
    
    Object.keys(criteria).forEach(key => {
      if (EXAM_CRITERIA_KEYS.has(key) && criteria[key] !== undefined) {
        queryBuilder.andWhere(`exam.${key} = :${key}`, { [key]: criteria[key] });
      }
    });

    return queryBuilder.getCount();
  }
}
