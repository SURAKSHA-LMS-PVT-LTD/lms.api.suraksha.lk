import { InstituteEntity } from '../entities/institute.entity';
import { CreateInstituteDto } from '../dto/create-institute.dto';
import { UpdateInstituteDto } from '../dto/update-institute.dto';
import { InstituteQueryDto } from '../dto/institute-query.dto';
import { InstituteResponseDto } from '../dto/institute-response.dto';
import { PaginatedInstituteResponseDto } from '../dto/paginated-institute-response.dto';

export interface IInstituteService {
  create(createInstituteDto: CreateInstituteDto): Promise<InstituteResponseDto>;
  findAll(query: InstituteQueryDto): Promise<PaginatedInstituteResponseDto>;
  findOne(id: string): Promise<InstituteResponseDto>;
  findByCode(code: string): Promise<InstituteResponseDto>;
  findByEmail(email: string): Promise<InstituteResponseDto>;
  update(id: string, updateInstituteDto: UpdateInstituteDto): Promise<InstituteResponseDto>;
  remove(id: string): Promise<void>;
  activate(id: string): Promise<InstituteResponseDto>;
  deactivate(id: string): Promise<InstituteResponseDto>;
  approve(id: string): Promise<InstituteResponseDto>;
  reject(id: string, reason?: string): Promise<InstituteResponseDto>;
  suspend(id: string, reason?: string): Promise<InstituteResponseDto>;
}

export interface IInstituteRepository {
  create(institute: Partial<InstituteEntity>): InstituteEntity;
  save(institute: InstituteEntity): Promise<InstituteEntity>;
  findOne(options: any): Promise<InstituteEntity | null>;
  findOneBy(criteria: any): Promise<InstituteEntity | null>;
  find(options?: any): Promise<InstituteEntity[]>;
  findAndCount(options?: any): Promise<[InstituteEntity[], number]>;
  update(criteria: any, partialEntity: any): Promise<any>;
  delete(criteria: any): Promise<any>;
  softDelete(criteria: any): Promise<any>;
  restore(criteria: any): Promise<any>;
}

export interface InstituteFilters {
  search?: string;
  type?: string;
  status?: string;
  accreditationType?: string;
  boardType?: string;
  city?: string;
  state?: string;
  country?: string;
  isActive?: boolean;
  hasHostel?: boolean;
  hasTransport?: boolean;
  subscriptionPlan?: string;
  establishedYear?: number;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface InstituteQueryOptions {
  relations?: string[];
  select?: string[];
  where?: any;
  order?: any;
  skip?: number;
  take?: number;
}

export interface InstituteValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface InstituteStats {
  totalInstitutes: number;
  activeInstitutes: number;
  inactiveInstitutes: number;
  pendingApproval: number;
  approvedInstitutes: number;
  rejectedInstitutes: number;
  suspendedInstitutes: number;
  institutesPerType: Record<string, number>;
  institutesPerStatus: Record<string, number>;
  institutesPerState: Record<string, number>;
  institutesPerCountry: Record<string, number>;
  institutesPerSubscriptionPlan: Record<string, number>;
}

export interface InstituteBulkOperation {
  successCount: number;
  failureCount: number;
  errors: Array<{
    index: number;
    error: string;
    data: any;
  }>;
}

export interface InstituteSearchCriteria {
  name?: string;
  code?: string;
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  contactPersonName?: string;
  contactPersonEmail?: string;
}

export interface InstituteWithRelations extends InstituteEntity {
  students?: any[];
  teachers?: any[];
  classes?: any[];
  admins?: any[];
  subscriptions?: any[];
}

export interface InstituteCreateRequest {
  name: string;
  code: string;
  email: string;
  phone?: string;
  website?: string;
  type?: string;
  status?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  establishedYear?: number;
  accreditationType?: string;
  boardType?: string;
  facilities?: string[];
  hasHostel?: boolean;
  hasTransport?: boolean;
  contactPersonName?: string;
  contactPersonEmail?: string;
  contactPersonPhone?: string;
  subscriptionPlan?: string;
  logoUrl?: string;
}

export interface InstituteUpdateRequest {
  name?: string;
  email?: string;
  phone?: string;
  website?: string;
  type?: string;
  status?: string;
  description?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  establishedYear?: number;
  accreditationType?: string;
  boardType?: string;
  facilities?: string[];
  hasHostel?: boolean;
  hasTransport?: boolean;
  contactPersonName?: string;
  contactPersonEmail?: string;
  contactPersonPhone?: string;
  subscriptionPlan?: string;
  logoUrl?: string;
  isActive?: boolean;
}

export interface InstituteApprovalRequest {
  id: string;
  status: string;
  approvedBy: string;
  approvedAt: Date;
  reason?: string;
  conditions?: string[];
  validUntil?: Date;
}

export interface InstituteSuspensionRequest {
  id: string;
  suspendedBy: string;
  suspendedAt: Date;
  reason: string;
  suspensionType: 'temporary' | 'permanent';
  suspensionDuration?: number; // in days
  reinstateAt?: Date;
}

export interface InstituteSubscription {
  id: string;
  instituteId: string;
  plan: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  features: string[];
  maxStudents: number;
  maxTeachers: number;
  maxClasses: number;
  price: number;
  currency: string;
  paymentStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstituteContact {
  id: string;
  instituteId: string;
  type: string;
  value: string;
  isPrimary: boolean;
  isVerified: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstituteFacility {
  id: string;
  instituteId: string;
  name: string;
  description?: string;
  capacity?: number;
  isAvailable: boolean;
  maintenanceSchedule?: string;
  cost?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstituteAuditLog {
  id: string;
  instituteId: string;
  action: string;
  performedBy: string;
  previousData?: any;
  newData?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}
