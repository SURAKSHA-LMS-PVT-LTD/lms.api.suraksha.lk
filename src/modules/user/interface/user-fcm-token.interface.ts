import { DeviceType } from '../entities/user-fcm-token.entity';

export interface IUserFcmToken {
  id: string;
  userId: string;
  fcmToken: string;
  deviceId: string;
  deviceType: DeviceType;
  deviceName?: string;
  appVersion?: string;
  osVersion?: string;
  isActive: boolean;
  isSynced: boolean;
  lastSeen?: Date;
  lastNotificationSent?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICreateUserFcmToken {
  userId: string;
  fcmToken: string;
  deviceId: string;
  deviceType: DeviceType;
  deviceName?: string;
  appVersion?: string;
  osVersion?: string;
  isActive?: boolean;
  isSynced?: boolean;
}

export interface IUpdateUserFcmToken {
  fcmToken?: string;
  deviceType?: DeviceType;
  deviceName?: string;
  appVersion?: string;
  osVersion?: string;
  isActive?: boolean;
  isSynced?: boolean;
  lastSeen?: Date;
  lastNotificationSent?: Date;
}

export interface IFcmTokenQueryOptions {
  userId?: string;
  deviceType?: DeviceType;
  isActive?: boolean;
  isSynced?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface IPaginatedFcmTokenResponse {
  data: IUserFcmToken[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ITokenCountStatistics {
  total: number;
  active: number;
  inactive: number;
}
