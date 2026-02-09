import { IsString, IsOptional, IsArray, IsEnum, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum ManualSendTargetType {
  ALL_USERS = 'all_users',
  SPECIFIC_USERS = 'specific_users',
  INSTITUTE_USERS = 'institute_users',
  SUBSCRIPTION_PLAN_USERS = 'subscription_plan_users',
  PARENT_USERS = 'parent_users',
  STUDENT_USERS = 'student_users'
}

export class ManualAdvertisementSendDto {
  @IsUUID()
  advertisementId: string;

  @IsEnum(ManualSendTargetType)
  targetType: ManualSendTargetType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specificUserIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  instituteIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subscriptionPlans?: string[];

  @IsOptional()
  @IsString()
  message?: string;
}

export class BulkManualAdvertisementSendDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualAdvertisementSendDto)
  campaigns: ManualAdvertisementSendDto[];

  @IsOptional()
  @IsString()
  scheduledTime?: string; // ISO string for scheduled sending
}

export class ManualSendResponseDto {
  success: boolean;
  message: string;
  data: {
    campaignId: string;
    totalTargeted: number;
    totalSent: number;
    totalFailed: number;
    failedUsers: string[];
    sentUsers: string[];
    packageBreakdown: {
      [packageName: string]: {
        targeted: number;
        sent: number;
        failed: number;
      };
    };
  };
}