import { InstituteClassStudentEntity } from '../entities/institute_class_student.entity';

/**
 * Interface for Institute Class Student operations
 */
export interface IInstituteClassStudentRepository {
  findAll(options?: IFindAllOptions): Promise<InstituteClassStudentEntity[]>;
  findOne(criteria: IInstituteClassStudentCriteria): Promise<InstituteClassStudentEntity | null>;
  create(data: ICreateInstituteClassStudent): Promise<InstituteClassStudentEntity>;
  update(criteria: IInstituteClassStudentCriteria, data: IUpdateInstituteClassStudent): Promise<InstituteClassStudentEntity>;
  delete(criteria: IInstituteClassStudentCriteria): Promise<boolean>;
  bulkCreate(data: IBulkCreateInstituteClassStudent): Promise<InstituteClassStudentEntity[]>;
  bulkDelete(criteria: IBulkDeleteCriteria): Promise<boolean>;
  findByInstitute(instituteId: string, options?: IFindAllOptions): Promise<InstituteClassStudentEntity[]>;
  findByClass(classId: string, options?: IFindAllOptions): Promise<InstituteClassStudentEntity[]>;
  findByStudent(studentUserId: string, options?: IFindAllOptions): Promise<InstituteClassStudentEntity[]>;
  exists(criteria: IInstituteClassStudentCriteria): Promise<boolean>;
  count(criteria?: Partial<IInstituteClassStudentCriteria>): Promise<number>;
  getStudentsInClass(classId: string, options?: { skip?: number; take?: number; activeOnly?: boolean }): Promise<any[]>;
  getStudentClasses(studentUserId: string, options?: { skip?: number; take?: number; activeOnly?: boolean }): Promise<any[]>;
}

export interface IInstituteClassStudentService {
  assignStudentToClass(data: ICreateInstituteClassStudent): Promise<InstituteClassStudentEntity>;
  removeStudentFromClass(criteria: IInstituteClassStudentCriteria): Promise<boolean>;
  updateStudentAssignment(criteria: IInstituteClassStudentCriteria, data: IUpdateInstituteClassStudent): Promise<InstituteClassStudentEntity>;
  getClassStudents(classId: string, options?: IFindAllOptions): Promise<InstituteClassStudentEntity[]>;
  getStudentClasses(studentUserId: string, options?: IFindAllOptions): Promise<InstituteClassStudentEntity[]>;
  getInstituteStudents(instituteId: string, options?: IFindAllOptions): Promise<InstituteClassStudentEntity[]>;
  bulkAssignStudents(data: IBulkCreateInstituteClassStudent): Promise<InstituteClassStudentEntity[]>;
  bulkRemoveStudents(criteria: IBulkDeleteCriteria): Promise<boolean>;
  isStudentInClass(criteria: IInstituteClassStudentCriteria): Promise<boolean>;
  getStudentCount(criteria?: Partial<IInstituteClassStudentCriteria>): Promise<number>;
}

/**
 * Core data interfaces
 */
export interface IInstituteClassStudentCriteria {
  instituteId: string;
  classId: string;
  studentUserId: string;
}

export interface ICreateInstituteClassStudent {
  instituteId: string;
  classId: string;
  studentUserId: string;
  isActive?: boolean;
  isVerified?: boolean;
  enrollmentMethod?: string;
  verifiedBy?: string;
  verifiedAt?: Date;
  extraData?: Record<string, any>;
}

export interface IUpdateInstituteClassStudent {
  isActive?: boolean;
  isVerified?: boolean;
  enrollmentMethod?: string;
  verifiedBy?: string;
  verifiedAt?: Date;
  extraData?: Record<string, any>;
}

export interface IBulkCreateInstituteClassStudent {
  instituteId: string;
  classId: string;
  studentUserIds: string[];
  isActive?: boolean;
}

export interface IBulkDeleteCriteria {
  instituteId: string;
  classId?: string;
  studentUserIds?: string[];
}

/**
 * Query options
 */
export interface IFindAllOptions {
  skip?: number;
  take?: number;
  withRelations?: boolean;
  relations?: string[];
  where?: any;
  order?: any;
  instituteId?: string;
  classId?: string;
  studentUserId?: string;
  isActive?: boolean;
  isVerified?: boolean;
  enrollmentMethod?: string;
}

/**
 * Response interfaces
 */
export interface IInstituteClassStudentResponse {
  instituteId: string;
  classId: string;
  studentUserId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  institute?: any;
  class?: any;
  student?: any;
}

export interface IPaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
