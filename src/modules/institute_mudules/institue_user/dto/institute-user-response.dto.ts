import { UserResponseDto } from '../../../user/dto/user-response.dto';
import { InstituteResponseDto } from '../../../institute/dto/institute-response.dto';
import { InstituteUserStatus } from '../enums/institute-user-status.enum';
import { InstituteUserType } from '../enums/institute-user-type.enum';
import { InstituteUserEntity } from '../entities/institue_user.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InstituteUserResponseDto {
  @ApiProperty({ description: 'Institute ID' })
  instituteId: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiPropertyOptional({ description: 'Institute-specific user ID' })
  userIdByInstitute?: string;

  @ApiProperty({ description: 'User status in institute', enum: InstituteUserStatus })
  status: InstituteUserStatus;

  @ApiProperty({ description: 'User type in institute', enum: InstituteUserType })
  instituteUserType: InstituteUserType;

  @ApiPropertyOptional({ description: 'Institute user image URL' })
  instituteUserImageUrl?: string;

  @ApiPropertyOptional({ description: 'Institute card ID' })
  instituteCardId?: string;

  @ApiProperty({ description: 'Image verification status', default: false })
  isImageVerified: boolean;

  @ApiPropertyOptional({ description: 'ID of user who verified the image' })
  imageVerifiedBy?: string;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Institute details' })
  institute?: InstituteResponseDto;

  @ApiPropertyOptional({ description: 'User details' })
  user?: UserResponseDto;

  @ApiPropertyOptional({ description: 'Custom key-value data for this institute enrollment. Plain JSON, not encrypted.' })
  extraData?: Record<string, any>;

  constructor(partial?: Partial<InstituteUserResponseDto> | InstituteUserEntity) {
    if (partial) {
      Object.assign(this, partial);
      
      // Convert user entity to UserResponseDto if present
      if ('user' in partial && partial.user) {
        this.user = new UserResponseDto(partial.user);
      }
      
      // Convert institute entity to InstituteResponseDto if present
      if ('institute' in partial && partial.institute) {
        this.institute = new InstituteResponseDto(partial.institute);
      }
    }
  }
}

export class PaginatedInstituteUserResponseDto {
  data: InstituteUserResponseDto[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
