import { ApiProperty } from '@nestjs/swagger';
import { UserType } from '../enums/user-type.enum';
import { Gender } from '../enums/gender.enum';
import { UserEntity } from '../entities/user.entity';
import { formatDate } from '../../../common/validators/date-format.validator';

/**
 * Minimal User Response DTO - Only basic public information
 * Used for lists, search results, and minimal user references
 */
export class UserMinimalResponseDto {
  @ApiProperty({ description: 'User unique identifier' })
  id: string;

  @ApiProperty({ description: 'User first name' })
  firstName: string;

  @ApiProperty({ description: 'User last name', required: false })
  lastName?: string;

  @ApiProperty({ description: 'Name with initials', required: false })
  nameWithInitials?: string;

  @ApiProperty({ description: 'User type/role', enum: UserType, required: false })
  userType?: UserType;

  @ApiProperty({ description: 'User profile image URL', required: false })
  imageUrl?: string;

  constructor(partial: Partial<UserMinimalResponseDto> | UserEntity) {
    if (partial) {
      this.id = partial.id || '';
      this.firstName = partial.firstName || '';
      this.lastName = partial.lastName;
      this.nameWithInitials = partial.nameWithInitials;
      this.userType = partial.userType;
      this.imageUrl = partial.imageUrl;
    }
  }

  static fromEntity(entity: UserEntity): UserMinimalResponseDto {
    return new UserMinimalResponseDto(entity);
  }

  static fromEntities(entities: UserEntity[]): UserMinimalResponseDto[] {
    return entities.map(entity => UserMinimalResponseDto.fromEntity(entity));
  }
}

/**
 * User Profile Response DTO - For profile pages and detailed views
 * Includes more information but still excludes sensitive data
 */
export class UserProfileResponseDto {
  @ApiProperty({ description: 'User unique identifier' })
  id: string;

  @ApiProperty({ description: 'User first name' })
  firstName: string;

  @ApiProperty({ description: 'User last name', required: false })
  lastName?: string;

  @ApiProperty({ description: 'Name with initials', required: false })
  nameWithInitials?: string;

  @ApiProperty({ description: 'User email address', required: false })
  email?: string;

  @ApiProperty({ description: 'User phone number', required: false })
  phone?: string;

  @ApiProperty({ description: 'User type/role', enum: UserType, required: false })
  userType?: UserType;

  @ApiProperty({ description: 'Date of birth in YYYY-MM-DD format', required: false })
  dateOfBirth?: string;

  @ApiProperty({ description: 'User gender', enum: Gender, required: false })
  gender?: Gender;

  @ApiProperty({ description: 'User profile image URL', required: false })
  imageUrl?: string;

  constructor(partial: Partial<UserProfileResponseDto> | UserEntity) {
    if (partial) {
      this.id = partial.id || '';
      this.firstName = partial.firstName || '';
      this.lastName = partial.lastName;
      this.nameWithInitials = partial.nameWithInitials;
      this.email = partial.email;
      this.userType = partial.userType;
      this.gender = partial.gender;
      this.imageUrl = partial.imageUrl;

      // Handle date formatting for dateOfBirth
      if ('dateOfBirth' in partial && partial.dateOfBirth) {
        if (partial.dateOfBirth instanceof Date) {
          this.dateOfBirth = formatDate(partial.dateOfBirth) || undefined;
        } else if (typeof partial.dateOfBirth === 'string') {
          this.dateOfBirth = partial.dateOfBirth;
        }
      }
    }
  }

  static fromEntity(entity: UserEntity): UserProfileResponseDto {
    return new UserProfileResponseDto(entity);
  }

  static fromEntities(entities: UserEntity[]): UserProfileResponseDto[] {
    return entities.map(entity => UserProfileResponseDto.fromEntity(entity));
  }
}
