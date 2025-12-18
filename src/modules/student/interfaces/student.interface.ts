import { StudentEntity } from '../entities/student.entity';
import { CreateStudentDto } from '../dto/create-student.dto';
import { UpdateStudentDto } from '../dto/update-student.dto';
import { QueryStudentDto } from '../dto/query-student.dto';
import { StudentResponseDto } from '../dto/student-response.dto';
import { PaginatedStudentResponseDto } from '../dto/paginated-student-response.dto';

export interface IStudentService {
  create(createStudentDto: CreateStudentDto): Promise<StudentResponseDto>;
  findAll(query: QueryStudentDto): Promise<PaginatedStudentResponseDto>;
  findOne(id: string): Promise<StudentResponseDto>;
  findByEmail(email: string): Promise<StudentResponseDto>;
  findByAdmissionNumber(admissionNumber: string): Promise<StudentResponseDto>;
  update(id: string, updateStudentDto: UpdateStudentDto): Promise<StudentResponseDto>;
  remove(id: string): Promise<void>;
  activate(id: string): Promise<StudentResponseDto>;
  deactivate(id: string): Promise<StudentResponseDto>;
}

export interface IStudentRepository {
  create(student: Partial<StudentEntity>): StudentEntity;
  save(student: StudentEntity): Promise<StudentEntity>;
  findOne(options: any): Promise<StudentEntity | null>;
  findOneBy(criteria: any): Promise<StudentEntity | null>;
  find(options?: any): Promise<StudentEntity[]>;
  findAndCount(options?: any): Promise<[StudentEntity[], number]>;
  update(criteria: any, partialEntity: any): Promise<any>;
  delete(criteria: any): Promise<any>;
  softDelete(criteria: any): Promise<any>;
  restore(criteria: any): Promise<any>;
}

export interface StudentFilters {
  search?: string;
  parentId?: string;
  instituteId?: string;
  classId?: string;
  isActive?: boolean;
  academicStatus?: string;
  gender?: string;
  bloodGroup?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface StudentQueryOptions {
  relations?: string[];
  select?: string[];
  where?: any;
  order?: any;
  skip?: number;
  take?: number;
}

export interface StudentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface StudentStats {
  totalStudents: number;
  activeStudents: number;
  inactiveStudents: number;
  maleStudents: number;
  femaleStudents: number;
  studentsPerBloodGroup: Record<string, number>;
  studentsPerAcademicStatus: Record<string, number>;
}

export interface StudentBulkOperation {
  successCount: number;
  failureCount: number;
  errors: Array<{
    index: number;
    error: string;
    data: any;
  }>;
}

export interface StudentSearchCriteria {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  admissionNumber?: string;
  parentEmail?: string;
  parentPhone?: string;
}

export interface StudentWithRelations extends Omit<StudentEntity, 'user'> {
  user?: any;
  parent?: any;
  institute?: any;
  classes?: any[];
  attendances?: any[];
}

export interface StudentCreateRequest {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    dateOfBirth?: Date;
    gender?: string;
    address?: string;
  };
  parentId?: string;
  admissionNumber?: string;
  admissionDate?: Date;
  academicStatus?: string;
  bloodGroup?: string;
  emergencyContact?: string;
  medicalInfo?: string;
  notes?: string;
}

export interface StudentUpdateRequest {
  user?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: Date;
    gender?: string;
    address?: string;
  };
  parentId?: string;
  admissionNumber?: string;
  admissionDate?: Date;
  academicStatus?: string;
  bloodGroup?: string;
  emergencyContact?: string;
  medicalInfo?: string;
  notes?: string;
  isActive?: boolean;
}
