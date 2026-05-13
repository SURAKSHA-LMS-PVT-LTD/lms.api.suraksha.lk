import { IsString, IsOptional, IsBoolean, IsHexColor, MaxLength, MinLength, Matches, IsArray, ValidateNested, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ── User Type DTOs ──────────────────────────────────────────────────────────

export class CreateUserTypeDto {
  @ApiProperty({ example: 'Lab Assistant' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Lab Assistants' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  namePlural?: string;

  @ApiPropertyOptional({ example: 'lab_assistant' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9_]+$/, { message: 'slug must be lowercase letters, numbers and underscores only' })
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: '#6366f1' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  sortOrder?: number;
}

export class UpdateUserTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  namePlural?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  sortOrder?: number;
}

export class UserTypeResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() instituteId: string;
  @ApiProperty() name: string;
  @ApiProperty() namePlural: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() color?: string;
  @ApiProperty() isSystemType: boolean;
  @ApiProperty() isPublic: boolean;
  @ApiProperty() isActive: boolean;
  @ApiProperty() sortOrder: number;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}

// ── Permission Matrix DTOs ──────────────────────────────────────────────────

export class FeaturePermissionDto {
  @ApiProperty() featureKey: string;
  @ApiProperty() canView: boolean;
  @ApiProperty() canCreate: boolean;
  @ApiProperty() canUpdate: boolean;
  @ApiProperty() canDelete: boolean;
  @ApiProperty() canReport: boolean;
}

export class BulkUpdatePermissionsDto {
  @ApiProperty({ type: [FeaturePermissionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeaturePermissionDto)
  permissions: FeaturePermissionDto[];
}

// ── My Context Response ─────────────────────────────────────────────────────

export class MyRbacContextDto {
  @ApiProperty() userTypeId: string;
  @ApiProperty() userTypeName: string;
  @ApiProperty() userTypeSlug: string;
  @ApiPropertyOptional() userTypeColor?: string;
  @ApiProperty({ description: 'Map of featureKey → allowed actions array' })
  permissions: Record<string, string[]>;
  @ApiProperty() isSystemAdmin: boolean;
}

// ── Members List ────────────────────────────────────────────────────────────

export class UserTypeMemberDto {
  @ApiProperty() userId: string;
  @ApiProperty() firstName: string;
  @ApiProperty() lastName: string;
  @ApiProperty() email: string;
  @ApiProperty() phoneNumber: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiProperty() status: string;
  @ApiProperty() joinedAt: string;
}

export class UserTypeMembersResponseDto {
  @ApiProperty({ type: [UserTypeMemberDto] }) data: UserTypeMemberDto[];
  @ApiProperty() userTypeName: string;
  @ApiProperty() userTypeSlug: string;
  @ApiPropertyOptional() userTypeColor?: string;
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
}
