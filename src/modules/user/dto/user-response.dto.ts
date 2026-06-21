import { Exclude, Expose, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserType } from '../enums/user-type.enum';
import { Gender } from '../enums/gender.enum';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { Language } from '../enums/language.enum';
import { UserEntity } from '../entities/user.entity';
import { formatDate } from '../../../common/validators/date-format.validator';
import { maskPhoneNumber, maskEmail } from '../../../common/utils/phone-mask.util';

export class UserResponseDto {
  @ApiProperty({ 
    description: 'User unique identifier', 
    example: '12345' 
  })
  @Expose()
  id: string;

  @ApiProperty({ 
    description: 'First name', 
    example: 'John' 
  })
  @Expose()
  firstName: string;

  @ApiPropertyOptional({ 
    description: 'Last name', 
    example: 'Doe' 
  })
  @Expose()
  lastName?: string;

  @ApiPropertyOptional({ 
    description: 'Name with initials', 
    example: 'J. Doe' 
  })
  @Expose()
  nameWithInitials?: string;

  @ApiPropertyOptional({ 
    description: 'Email address', 
    example: 'john.doe@example.com' 
  })
  @Expose()
  email?: string;

  @ApiPropertyOptional({ 
    description: 'Masked phone number (only last 3 digits visible for security)', 
    example: '+94****567' 
  })
  @Expose()
  phoneNumber?: string;

  @ApiPropertyOptional({ 
    description: 'User type in the system', 
    enum: UserType,
    example: UserType.USER_WITHOUT_PARENT 
  })
  @Expose()
  userType?: UserType;

  @ApiPropertyOptional({ 
    description: 'Date of birth in YYYY-MM-DD format', 
    example: '1995-05-15' 
  })
  @Expose()
  dateOfBirth?: string;

  @ApiPropertyOptional({ 
    description: 'Gender', 
    enum: Gender,
    example: Gender.MALE 
  })
  @Expose()
  gender?: Gender;

  @ApiPropertyOptional({ 
    description: 'Profile image URL', 
    example: 'https://example.com/profile.jpg' 
  })
  @Expose()
  imageUrl?: string;

  @ApiProperty({ 
    description: 'Account status', 
    example: true 
  })
  @Expose()
  isActive: boolean;

  @ApiPropertyOptional({ 
    description: 'User subscription plan', 
    enum: SubscriptionPlan,
    example: SubscriptionPlan.FREE 
  })
  @Expose()
  subscriptionPlan: SubscriptionPlan;

  @ApiPropertyOptional({ 
    description: 'Payment expiration date', 
    example: '2024-12-31T23:59:59Z' 
  })
  @Expose()
  @Transform(({ value }) => value ? new Date(value).toISOString() : undefined)
  paymentExpiresAt?: Date;

  @ApiProperty({ 
    description: 'Account creation timestamp', 
    example: '2024-01-15T10:30:00Z' 
  })
  @Expose()
  @Transform(({ value }) => value ? new Date(value).toISOString() : undefined)
  createdAt: Date;

  @ApiPropertyOptional({ 
    description: 'User preferred language: S=Sinhala (සිංහල), E=English, T=Tamil (தமிழ்)', 
    enum: Language,
    example: Language.ENGLISH
  })
  @Expose()
  language: Language;

  
  // Sensitive information - excluded from responses
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
  updatedAt: Date;

  @Exclude()
  password?: string;

  @Exclude()
  idUrl?: string;

  @ApiPropertyOptional({
    description: 'Institutes this user is enrolled in (populated by SUPERADMIN list endpoint)',
    type: 'array',
    items: { type: 'object' },
  })
  @Expose()
  institutes?: { id: string; name: string; role: string; status: string }[];

  constructor(partial: Partial<UserResponseDto> | UserEntity) {
    Object.assign(this, partial);
    
    // Convert Date to yyyy-MM-dd format if it's a UserEntity
    if (partial && 'dateOfBirth' in partial && partial.dateOfBirth instanceof Date) {
      this.dateOfBirth = formatDate(partial.dateOfBirth) || undefined;
    }

    if (partial) {
      if ('phoneNumber' in partial) {
        this.phoneNumber = partial.phoneNumber;
      }

      if ('email' in partial) {
        this.email = partial.email;
      }
    }
  }
}
