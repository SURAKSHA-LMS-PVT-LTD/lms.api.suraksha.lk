import { FindManyOptions, FindOneOptions } from 'typeorm';
import { InstituteClassSubjectExam } from '../entities/institute_class_subject_exam.entity';

// Base interfaces for exam operations
export interface IExamCriteria {
  id?: string;
  instituteId?: string;
  classId?: string;
  subjectId?: string;
  creatorId?: string;
  status?: string;
  examType?: string;
  category?: string;
  startTime?: Date;
  endTime?: Date;
  isActive?: boolean;
}

export interface ICreateExam {
  instituteId: string;
  classId?: string;
  subjectId: string;
  creatorId: string;
  title: string;
  description?: string;
  examType: 'online' | 'physical' | 'hybrid';
  category: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  maxAttempts?: number;
  instructions?: string;
  venue?: string;
  isProctored?: boolean;
  allowCalculator?: boolean;
  allowNotes?: boolean;
  randomizeQuestions?: boolean;
  showResultsImmediately?: boolean;
  isActive?: boolean;
}

export interface IUpdateExam {
  title?: string;
  description?: string;
  examType?: 'online' | 'physical' | 'hybrid';
  category?: string;
  startTime?: Date;
  endTime?: Date;
  durationMinutes?: number;
  totalMarks?: number;
  passingMarks?: number;
  maxAttempts?: number;
  instructions?: string;
  venue?: string;
  isProctored?: boolean;
  allowCalculator?: boolean;
  allowNotes?: boolean;
  randomizeQuestions?: boolean;
  showResultsImmediately?: boolean;
  isActive?: boolean;
  status?: string;
}

export interface IFindAllOptions extends FindManyOptions<InstituteClassSubjectExam> {
  withRelations?: boolean;
  relations?: string[];
}

export interface IFindOneOptions extends FindOneOptions<InstituteClassSubjectExam> {
  withRelations?: boolean;
  relations?: string[];
}

// Exam schedule and analytics interfaces
export interface IExamScheduleCriteria {
  instituteId: string;
  date?: string;
  startDate?: Date;
  endDate?: Date;
  classId?: string;
  subjectId?: string;
  status?: string;
}

export interface IExamSchedule {
  date: string;
  exams: InstituteClassSubjectExam[];
  totalExams: number;
}

export interface IExamAnalytics {
  totalExams: number;
  completedExams: number;
  ongoingExams: number;
  scheduledExams: number;
  averageScore?: number;
  passRate?: number;
  examsByCategory: Record<string, number>;
  examsBySubject: Record<string, number>;
}

export interface IExamGrading {
  examId: string;
  studentId: string;
  marks: number;
  feedback?: string;
  gradedBy: string;
  gradedAt: Date;
}

export interface IExamResult {
  examId: string;
  studentId: string;
  score: number;
  percentage: number;
  grade: string;
  passed: boolean;
  submittedAt: Date;
  timeTaken: number; // in minutes
  answers: any[]; // Student answers
}

// Repository interface
export interface IExamRepository {
  findAll(options?: IFindAllOptions): Promise<InstituteClassSubjectExam[]>;
  findOne(criteria: IExamCriteria, options?: IFindOneOptions): Promise<InstituteClassSubjectExam | null>;
  create(data: ICreateExam): Promise<InstituteClassSubjectExam>;
  update(criteria: IExamCriteria, data: IUpdateExam): Promise<InstituteClassSubjectExam>;
  delete(criteria: IExamCriteria): Promise<boolean>;
  bulkCreate(data: ICreateExam[]): Promise<InstituteClassSubjectExam[]>;
  
  // Specific finder methods
  findByInstitute(instituteId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectExam[]>;
  findByClass(classId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectExam[]>;
  findBySubject(subjectId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectExam[]>;
  findByCreator(creatorId: string, options?: IFindAllOptions): Promise<InstituteClassSubjectExam[]>;
  findByDateRange(startDate: Date, endDate: Date, criteria?: Partial<IExamCriteria>): Promise<InstituteClassSubjectExam[]>;
  findConflictingExams(startTime: Date, endTime: Date, classId?: string, subjectId?: string): Promise<InstituteClassSubjectExam[]>;
  
  // Schedule and analytics
  getExamSchedule(criteria: IExamScheduleCriteria): Promise<IExamSchedule[]>;
  getExamAnalytics(criteria: Partial<IExamCriteria>): Promise<IExamAnalytics>;
  
  // Utility methods
  exists(criteria: IExamCriteria): Promise<boolean>;
  count(criteria?: Partial<IExamCriteria>): Promise<number>;
}

// Service interface
export interface IExamService {
  create(createDto: any): Promise<InstituteClassSubjectExam>;
  findAll(query?: any): Promise<InstituteClassSubjectExam[]>;
  findOne(id: string): Promise<InstituteClassSubjectExam>;
  update(id: string, updateDto: any): Promise<InstituteClassSubjectExam>;
  remove(id: string): Promise<boolean>;
  getSchedule(date: string, query?: any): Promise<IExamSchedule[]>;
  createBulk(createDtos: any[]): Promise<InstituteClassSubjectExam[]>;
  getAnalytics(criteria?: any): Promise<IExamAnalytics>;
}

// Filter and pagination interfaces
export interface IExamFilters {
  institute?: string;
  class?: string;
  subject?: string;
  creator?: string;
  status?: string;
  examType?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface IPaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface IPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
