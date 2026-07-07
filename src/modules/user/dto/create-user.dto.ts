import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { 
  IsString, 
  IsEmail, 
  IsOptional, 
  IsEnum, 
  IsBoolean, 
  Length, 
  IsUrl,
  IsDateString
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserType } from '../enums/user-type.enum';
import { Gender } from '../enums/gender.enum';
import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { Province } from '../enums/province.enum';
import { District } from '../enums/district.enum';
import { Country } from '../enums/country.enum';
import { Language } from '../enums/language.enum';
import { IsDateOfBirth, TransformToYMDDate } from '../../../common/validators/date-format.validator';
import { IsOptionalNic } from '../../../common/validators/optional-nic.validator';
import { IsAllowedUserType } from '../../../common/validators/allowed-user-type.validator';

export class CreateUserDto {
  @ApiProperty({ 
    description: 'First name', 
    example: 'John',
    minLength: 1,
    maxLength: 50
  })
  @IsString()
  @Length(1, 50)
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @ApiProperty({ 
    description: 'Last name (required)', 
    example: 'Doe',
    minLength: 1,
    maxLength: 50
  })
  @IsString()
  @Length(1, 50)
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @ApiProperty({ 
    description: 'Name with initials (required)', 
    example: 'J. Doe',
    minLength: 1,
    maxLength: 100
  })
  @IsString()
  @Length(1, 100)
  @Transform(({ value }) => value?.trim())
  nameWithInitials: string;

  @ApiPropertyOptional({ 
    description: 'Email address (optional, automatically converted to lowercase)', 
    example: 'john.doe@example.com',
    maxLength: 60
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Length(1, 60, { message: 'Email must be between 1 and 60 characters' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @ApiPropertyOptional({ 
    description: 'Phone number (10-15 characters)', 
    example: '+94771234567' 
  })
  @IsOptional()
  @IsString()
  @Length(10, 15)
  @Transform(({ value }) => value ? value.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '').trim() : value)
  phoneNumber?: string;

  @ApiPropertyOptional({ 
    description: 'Profile image relative path from /upload/verify-and-publish endpoint (stored as-is in database)', 
    example: 'profile-images/user-profile-uuid.jpg',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @Length(1, 500, { message: 'Image path must be between 1 and 500 characters' })
  imageUrl?: string;

  @ApiProperty({ 
    description: 'Type of user - Only USER, USER_WITHOUT_PARENT, or USER_WITHOUT_STUDENT allowed. SUPERADMIN and ORGANIZATION_MANAGER cannot be created through this endpoint.', 
    enum: [UserType.USER, UserType.USER_WITHOUT_PARENT, UserType.USER_WITHOUT_STUDENT]
  })
  @IsAllowedUserType({ 
    message: 'Invalid user type. Only USER, USER_WITHOUT_PARENT, USER_WITHOUT_STUDENT allowed for user creation. SUPERADMIN and ORGANIZATION_MANAGER cannot be created through this endpoint.'
  })
  userType: UserType;

  @ApiPropertyOptional({ 
    description: 'National Identity Card number (format: 123456789V or 200012345678, max 12 chars)', 
    example: '123456789V',
    maxLength: 12
  })
  @IsOptional()
  @IsOptionalNic()
  @Length(1, 12, { message: 'NIC must be between 1 and 12 characters' })
  nic?: string;

  @ApiPropertyOptional({ 
    description: 'Birth certificate number', 
    example: 'BC-123456789',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  birthCertificateNo?: string;

  @ApiPropertyOptional({ 
    description: 'Date of birth in yyyy-MM-dd format', 
    example: '1990-05-15' 
  })
  @IsOptional()
  @TransformToYMDDate()
  @IsDateOfBirth({ message: 'Date of birth must be in yyyy-MM-dd format (e.g., 1990-05-15)' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ 
    description: 'Gender', 
    enum: Gender,
    example: Gender.MALE 
  })
  @IsOptional()
  @IsEnum(Gender, { 
    message: 'Invalid gender. Must be one of: MALE, FEMALE, OTHER (exact uppercase match required)'
  })
  gender?: Gender;

  @ApiPropertyOptional({ 
    description: 'Address line 1 (street address) - Optional', 
    example: '123 Main Street',
    maxLength: 200
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  addressLine1?: string;

  @ApiPropertyOptional({ 
    description: 'Address line 2 (apartment, suite, etc.) - Optional', 
    example: 'Apt 4B',
    maxLength: 200
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  addressLine2?: string;

  @ApiPropertyOptional({ 
    description: 'City', 
    example: 'Colombo',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  city?: string;

  @ApiProperty({ 
    description: 'District (required)', 
    enum: District,
    example: District.COLOMBO
  })
  @IsEnum(District, { 
    message: 'Invalid district. Must be one of: COLOMBO, GAMPAHA, KALUTARA, KANDY, MATALE, NUWARA_ELIYA, GALLE, MATARA, HAMBANTOTA, JAFFNA, KILINOCHCHI, MANNAR, MULLAITIVU, VAVUNIYA, TRINCOMALEE, BATTICALOA, AMPARA, KURUNEGALA, PUTTALAM, ANURADHAPURA, POLONNARUWA, BADULLA, MONARAGALA, RATNAPURA, KEGALLE (uppercase with underscores for spaces)'
  })
  district: District;

  @ApiProperty({ 
    description: 'Province (required)', 
    enum: Province,
    example: Province.WESTERN
  })
  @IsEnum(Province, { 
    message: 'Invalid province. Must be one of: WESTERN, CENTRAL, SOUTHERN, NORTHERN, EASTERN, NORTH_WESTERN, NORTH_CENTRAL, UVA, SABARAGAMUWA (uppercase with underscores)'
  })
  province: Province;

  @ApiPropertyOptional({ 
    description: 'Postal code (Sri Lankan format)', 
    example: '10100',
    maxLength: 6
  })
  @IsOptional()
  @IsString()
  @Length(1, 6)
  postalCode?: string;

  @ApiPropertyOptional({ 
    description: 'Country', 
    enum: Country,
    default: Country.SRI_LANKA,
    example: Country.SRI_LANKA
  })
  @IsOptional()
  @IsEnum(Country, { 
    message: 'Invalid country. Must be: "Sri Lanka" (exact match with space and capital letters required)'
  })
  country?: Country;

  @ApiPropertyOptional({ 
    description: 'ID document relative path from /upload/verify-and-publish endpoint', 
    example: 'id-documents/user-id-uuid.pdf',
    maxLength: 200
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  idUrl?: string;

  @ApiPropertyOptional({ 
    description: 'Whether the user is active', 
    default: true 
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ 
    description: 'User subscription plan', 
    enum: SubscriptionPlan,
    default: SubscriptionPlan.FREE,
    example: SubscriptionPlan.FREE
  })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  subscriptionPlan?: SubscriptionPlan;

  @ApiPropertyOptional({ 
    description: 'Payment expiration date and time (ISO 8601 format)', 
    example: '2024-12-31T23:59:59.000Z' 
  })
  @IsOptional()
  @IsDateString()
  paymentExpiresAt?: string;

  @ApiPropertyOptional({ 
    description: 'RFID card identifier for access control', 
    example: 'RFID123456789',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  rfid?: string;

  @ApiPropertyOptional({ 
    description: 'User preferred language: S=Sinhala (සිංහල), E=English, T=Tamil (தமிழ்)', 
    enum: Language,
    default: Language.ENGLISH,
    example: Language.ENGLISH
  })
  @IsOptional()
  @IsEnum(Language, { 
    message: 'Invalid language. Must be one of: S (Sinhala), E (English), T (Tamil)'
  })
  language?: Language;
}
