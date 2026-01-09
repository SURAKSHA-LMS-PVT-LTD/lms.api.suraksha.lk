import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { UserType } from '../enums/user-type.enum';
import { Gender } from '../enums/gender.enum';
import { UserEntity } from '../entities/user.entity';
import { formatDate } from '../../../common/validators/date-format.validator';

/**
 * Secure User Response DTO - Only contains non-sensitive information
 * Safe for frontend consumption and public APIs
 */
export class UserSecureResponseDto {
  @ApiProperty({ description: 'User unique identifier' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'User first name' })
  @Expose()
  firstName: string;

  @ApiProperty({ description: 'User last name', required: false })
  @Expose()
  lastName?: string;

  @ApiProperty({ description: 'Name with initials', required: false })
  @Expose()
  nameWithInitials?: string;

  @ApiProperty({ description: 'User email address', required: false })
  @Expose()
  email?: string;

  @ApiProperty({ description: 'User phone number', required: false })
  @Expose()
  phone?: string;

  @ApiProperty({ description: 'User type/role', enum: UserType, required: false })
  @Expose()
  userType?: UserType;

  @ApiProperty({ description: 'Date of birth in YYYY-MM-DD format', required: false })
  @Expose()
  dateOfBirth?: string;

  @ApiProperty({ description: 'User gender', enum: Gender, required: false })
  @Expose()
  gender?: Gender;

  @ApiProperty({ description: 'User profile image URL', required: false })
  @Expose()
  imageUrl?: string;

  // Exclude all sensitive information
  @Exclude()
  password?: string;

  @Exclude()
  nic?: string;

  @Exclude()
  birthCertificateNo?: string;

  @Exclude()
  addressLine1?: string;

  @Exclude()
  addressLine2?: string;

  @Exclude()
  city?: string;

  @Exclude()
  district?: string;

  @Exclude()
  province?: string;

  @Exclude()
  postalCode?: string;

  @Exclude()
  country?: string;

  @Exclude()
  isActive?: boolean;

  @Exclude()
  createdAt?: Date;

  @Exclude()
  updatedAt?: Date;

  @Exclude()
  phoneNumber?: string;

  @Exclude()
  idUrl?: string;

  constructor(partial: Partial<UserSecureResponseDto> | UserEntity) {
    if (partial) {
      // Only assign safe fields with proper type checking
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

  /**
   * Static method to create secure response from UserEntity
   */
  static fromEntity(entity: UserEntity): UserSecureResponseDto {
    return new UserSecureResponseDto(entity);
  }

  /**
   * Static method to create secure responses from multiple UserEntities
   */
  static fromEntities(entities: UserEntity[]): UserSecureResponseDto[] {
    return entities.map(entity => UserSecureResponseDto.fromEntity(entity));
  }
}
