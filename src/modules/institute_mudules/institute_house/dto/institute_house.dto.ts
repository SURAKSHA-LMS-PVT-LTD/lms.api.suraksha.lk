import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  MaxLength,
  IsArray,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { HouseEnrollmentMethod } from '../entities/institute_house_member.entity';

// ─── Create House ────────────────────────────────────────────────────────────

export class CreateInstituteHouseDto {
  @ApiProperty({ description: 'House name', example: 'Red House', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiPropertyOptional({ description: 'House colour code or name', example: '#E53935', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(({ value }) => value?.trim() || null)
  color?: string;

  @ApiPropertyOptional({ description: 'House description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description:
      'House profile image path (obtain a signed-upload URL first, then pass the path here)',
    example: 'house-images/42/1743000000000_red_house.jpg',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim() || null)
  imageUrl?: string;
}

// ─── Update House ────────────────────────────────────────────────────────────

export class UpdateInstituteHouseDto {
  @ApiPropertyOptional({ description: 'House name', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name?: string;

  @ApiPropertyOptional({ description: 'House colour code or name', maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(({ value }) => value?.trim() || null)
  color?: string;

  @ApiPropertyOptional({ description: 'House description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Update House Image ──────────────────────────────────────────────────────

export class UpdateInstituteHouseImageDto {
  @ApiProperty({
    description: 'House profile image path (from signed-upload endpoint)',
    example: 'house-images/42/1743000000001_blue_house.jpg',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  imageUrl: string;
}

// ─── Assign User to House ────────────────────────────────────────────────────

export class AssignUserToHouseDto {
  @ApiProperty({ description: 'User ID to assign to this house', example: '123' })
  @IsString()
  @IsNotEmpty()
  userId: string;
}

// ─── Bulk Assign Users to House ──────────────────────────────────────────────

export class BulkAssignUsersToHouseDto {
  @ApiProperty({ description: 'User IDs to assign to this house', type: [String], example: ['123', '456'] })
  @IsArray()
  @IsString({ each: true })
  userIds: string[];
}

// ─── House Member Query ──────────────────────────────────────────────────────

export class HouseMemberQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active status', example: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by enrollment method',
    enum: HouseEnrollmentMethod,
  })
  @IsOptional()
  @IsEnum(HouseEnrollmentMethod)
  enrollmentMethod?: HouseEnrollmentMethod;

  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of results per page', example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

export class InstituteHouseResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() instituteId: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() color?: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() imageUrl?: string;
  @ApiProperty() isActive: boolean;
  @ApiPropertyOptional() createdBy?: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiPropertyOptional() memberCount?: number;
  @ApiPropertyOptional({
    description:
      'True if the requesting user is currently actively enrolled in this house.',
  })
  isEnrolled?: boolean;
  @ApiPropertyOptional({
    description:
      'ID of the house the requesting user is currently enrolled in. Null if not enrolled in any house.',
  })
  enrolledHouseId?: string | null;
}

export class HouseMemberResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() houseId: string;
  @ApiProperty() userId: string;
  @ApiPropertyOptional() firstName?: string;
  @ApiPropertyOptional() lastName?: string;
  @ApiPropertyOptional() nameWithInitials?: string;
  @ApiPropertyOptional() email?: string;
  @ApiPropertyOptional() phoneNumber?: string;
  @ApiPropertyOptional() nic?: string;
  @ApiPropertyOptional() instituteUserType?: string;
  @ApiPropertyOptional({ description: 'Institute-assigned user ID / index number' })
  userIdByInstitute?: string;
  @ApiPropertyOptional({
    description:
      'Profile image URL — institute-scoped image if available, otherwise global image. Null if neither exists.',
  })
  profileImageUrl?: string;
  @ApiProperty() enrollmentMethod: string;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ description: 'Date the user was enrolled / assigned to this house' })
  enrolledAt: Date;
}

export class PaginatedHouseMembersDto {
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() totalPages: number;
  @ApiProperty({ type: [HouseMemberResponseDto] }) data: HouseMemberResponseDto[];
}

export class HouseActionResponseDto {
  @ApiProperty() success: boolean;
  @ApiProperty() message: string;
}
