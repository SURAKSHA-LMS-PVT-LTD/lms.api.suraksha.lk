import { ParentEntity } from '../entities/parent.entity';
import { CreateParentDto } from '../dto/create-parent.dto';
import { UpdateParentDto } from '../dto/update-parent.dto';
import { QueryParentDto } from '../dto/query-parent.dto';
import { ParentResponseDto } from '../dto/parent-response.dto';
import { PaginatedParentResponseDto } from '../dto/paginated-parent-response.dto';

export interface IParentService {
  create(createParentDto: CreateParentDto): Promise<ParentResponseDto>;
  findAll(query: QueryParentDto): Promise<PaginatedParentResponseDto>;
  findOne(id: string): Promise<ParentResponseDto>;
  findByEmail(email: string): Promise<ParentResponseDto>;
  update(id: string, updateParentDto: UpdateParentDto): Promise<ParentResponseDto>;
  remove(id: string): Promise<void>;
  activate(id: string): Promise<ParentResponseDto>;
  deactivate(id: string): Promise<ParentResponseDto>;
  findChildren(parentId: string): Promise<any[]>;
}

export interface IParentRepository {
  create(parent: Partial<ParentEntity>): ParentEntity;
  save(parent: ParentEntity): Promise<ParentEntity>;
  findOne(options: any): Promise<ParentEntity | null>;
  findOneBy(criteria: any): Promise<ParentEntity | null>;
  find(options?: any): Promise<ParentEntity[]>;
  findAndCount(options?: any): Promise<[ParentEntity[], number]>;
  update(criteria: any, partialEntity: any): Promise<any>;
  delete(criteria: any): Promise<any>;
  softDelete(criteria: any): Promise<any>;
  restore(criteria: any): Promise<any>;
}

export interface ParentFilters {
  search?: string;
  relationshipType?: string;
  maritalStatus?: string;
  educationLevel?: string;
  incomeRange?: string;
  isActive?: boolean;
  gender?: string;
  hasChildren?: boolean;
  occupation?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ParentQueryOptions {
  relations?: string[];
  select?: string[];
  where?: any;
  order?: any;
  skip?: number;
  take?: number;
}

export interface ParentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface ParentStats {
  totalParents: number;
  activeParents: number;
  inactiveParents: number;
  maleParents: number;
  femaleParents: number;
  parentsPerRelationship: Record<string, number>;
  parentsPerEducationLevel: Record<string, number>;
  parentsPerIncomeRange: Record<string, number>;
  parentsPerMaritalStatus: Record<string, number>;
}

export interface ParentBulkOperation {
  successCount: number;
  failureCount: number;
  errors: Array<{
    index: number;
    error: string;
    data: any;
  }>;
}

export interface ParentSearchCriteria {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  cnic?: string;
  occupation?: string;
  workplace?: string;
}

export interface ParentWithRelations extends Omit<ParentEntity, 'user'> {
  user?: any;
  children?: any[];
  students?: any[];
}

export interface ParentCreateRequest {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    dateOfBirth?: Date;
    gender?: string;
    address?: string;
  };
  relationshipType?: string;
  occupation?: string;
  workplace?: string;
  workPhone?: string;
  emergencyContact?: string;
  cnic?: string;
  maritalStatus?: string;
  educationLevel?: string;
  incomeRange?: string;
  communicationPreferences?: string[];
  notes?: string;
}

export interface ParentUpdateRequest {
  user?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: Date;
    gender?: string;
    address?: string;
  };
  relationshipType?: string;
  occupation?: string;
  workplace?: string;
  workPhone?: string;
  emergencyContact?: string;
  cnic?: string;
  maritalStatus?: string;
  educationLevel?: string;
  incomeRange?: string;
  communicationPreferences?: string[];
  notes?: string;
  isActive?: boolean;
}

export interface ParentChildRelation {
  parentId: string;
  childId: string;
  relationshipType: string;
  isPrimary: boolean;
  isEmergencyContact: boolean;
  hasPickupPermission: boolean;
  hasAcademicAccess: boolean;
  hasMedicalAccess: boolean;
  notes?: string;
}

export interface ParentCommunicationLog {
  id: string;
  parentId: string;
  communicationType: string;
  subject: string;
  message: string;
  sentBy: string;
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  responseAt?: Date;
  status: string;
}

export interface ParentMeetingSchedule {
  id: string;
  parentId: string;
  teacherId: string;
  studentId?: string;
  scheduledAt: Date;
  duration: number;
  purpose: string;
  location: string;
  status: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
