export interface ISubject {
  id: string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  creditHours?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubjectCreate {
  code: string;
  name: string;
  description?: string;
  category?: string;
  creditHours?: number;
  isActive?: boolean;
}

export interface ISubjectUpdate extends Partial<ISubjectCreate> {}

export interface ISubjectQuery {
  search?: string;
  category?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ISubjectStats {
  total: number;
  active: number;
  inactive: number;
}

export interface ISubjectCategoryStats {
  category: string;
  count: number;
}

export interface IPaginatedSubjects {
  data: ISubject[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
