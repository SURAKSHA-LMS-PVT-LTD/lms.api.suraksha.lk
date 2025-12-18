import { UserType } from '../enums/user-type.enum';

export interface IUser {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  password?: string;
  phoneNumber?: string;
  userType?: UserType;
  nic?: string;
  birthCertificateNo?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  imageUrl?: string;
}

export interface IUserCreatePayload {
  firstName: string;
  lastName?: string;
  email?: string;
  password?: string;
  phoneNumber?: string;
  userType?: UserType;
  nic?: string;
  birthCertificateNo?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  country?: string;
  isActive?: boolean;
  imageUrl?: string;
}

export interface IUserUpdatePayload extends Partial<IUserCreatePayload> {}

export interface IUserQueryParams {
  search?: string;
  userType?: UserType;
  city?: string;
  district?: string;
  province?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface IUserListResponse {
  data: IUser[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
    previousPage: number | null;
    nextPage: number | null;
  };
}
