import { ClassFilterDto } from '../dto/class-filter.dto';
import { PaginatedResponseDto } from '../../../../common/dto/paginated-response.dto';

export interface IInstituteClass {
  id: string;
  instituteId: string;
  name: string;
  code: string;
  academicYear?: string;
  level?: number;
  grade?: number;
  specialty?: string;
  classType: string;
  capacity?: number;
  classTeacherId?: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
  startDate?: Date;
  endDate?: Date;
  // Self-enrollment fields
  enrollmentCode?: string;
  enrollmentEnabled: boolean;
  requireTeacherVerification: boolean;
}

export interface IInstituteClassRepository {
  create(instituteClass: Partial<IInstituteClass>): Promise<IInstituteClass>;
  findAll(filters?: Partial<IInstituteClass>): Promise<IInstituteClass[]>;
  findAllPaginated(filterDto: ClassFilterDto): Promise<PaginatedResponseDto<IInstituteClass>>;
  findOne(id: string): Promise<IInstituteClass | null>;
  findByInstitute(instituteId: string): Promise<IInstituteClass[]>;
  findByAcademicYear(instituteId: string, academicYear: string): Promise<IInstituteClass[]>;
  findByGrade(instituteId: string, grade: number): Promise<IInstituteClass[]>;
  findBySpecialty(instituteId: string, specialty: string): Promise<IInstituteClass[]>;
  findByTeacher(classTeacherId: string): Promise<IInstituteClass[]>;
  findActive(instituteId: string): Promise<IInstituteClass[]>;
  findByEnrollmentCode(enrollmentCode: string): Promise<IInstituteClass | null>;
  update(id: string, instituteClass: Partial<IInstituteClass>): Promise<IInstituteClass | null>;
  remove(id: string): Promise<void>;
  activate(id: string): Promise<IInstituteClass | null>;
  deactivate(id: string): Promise<IInstituteClass | null>;
  isCodeUnique(code: string, excludeId?: string): Promise<boolean>;
}
