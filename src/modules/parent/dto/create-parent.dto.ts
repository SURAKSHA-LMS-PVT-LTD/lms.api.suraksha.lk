import { Type, Transform } from 'class-transformer';
import { ValidateNested, IsOptional, IsString, IsBoolean, Length, IsNotEmpty, IsEmail, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '../../user/enums/gender.enum';
import { UserType } from '../../user/enums/user-type.enum';
import { Occupation } from '../../user/enums/occupation.enum';
import { IsDateOfBirth } from '../../../common/validators/date-format.validator';
import { IsOptionalNic } from '../../../common/validators/optional-nic.validator';

class CreateParentUserDto {
  @ApiPropertyOptional({
    description: 'First name of the parent',
    example: 'John',
    minLength: 1,
    maxLength: 100
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  firstName: string;

  @ApiPropertyOptional({
    description: 'Last name of the parent',
    example: 'Doe',
    minLength: 1,
    maxLength: 100
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  lastName: string;

  @ApiPropertyOptional({
    description: 'Email address (optional — parent can activate via phone OTP or system ID)',
    example: 'john.doe@parent.com'
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Phone number',
    example: '+94771234567',
    minLength: 10,
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @Length(10, 20)
  phone?: string;

  @ApiPropertyOptional({ 
    description: 'User type (automatically set to PARENT for parents)', 
    enum: UserType,
    default: UserType.USER_WITHOUT_STUDENT
  })
  @IsOptional()
  @IsEnum(UserType)
  userType?: UserType;

  @ApiPropertyOptional({ 
    description: 'Date of birth in yyyy-MM-dd format',
    example: '1980-01-15' 
  })
  @IsOptional()
  @IsDateOfBirth({ message: 'Date of birth must be in yyyy-MM-dd format (e.g., 1990-05-15)' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ 
    description: 'Gender', 
    enum: Gender,
    example: Gender.MALE
  })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ 
    description: 'National Identity Card number',
    example: '123456789V'
  })
  @IsOptional()
  @IsOptionalNic()
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
    description: 'Address line 1',
    example: '123 Main Street'
  })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({ 
    description: 'Address line 2',
    example: 'Apt 4B'
  })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({ 
    description: 'City',
    example: 'Colombo',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  city?: string;

  @ApiPropertyOptional({ 
    description: 'District',
    example: 'Colombo',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  district?: string;

  @ApiPropertyOptional({ 
    description: 'Province',
    example: 'Western Province',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  province?: string;

  @ApiPropertyOptional({ 
    description: 'Postal code',
    example: '10100',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  postalCode?: string;

  @ApiPropertyOptional({ 
    description: 'Country',
    example: 'Sri Lanka',
    default: 'Sri Lanka',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  country?: string;

  @ApiPropertyOptional({ 
    description: 'Active status', 
    default: true 
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateParentDto {
  @ApiPropertyOptional({
    description: 'User information for the parent',
    type: CreateParentUserDto
  })
  @ValidateNested()
  @Type(() => CreateParentUserDto)
  user: CreateParentUserDto;

  @ApiPropertyOptional({ 
    description: 'Parent\'s occupation/profession', 
    example: Occupation.TEACHER,
    enum: Occupation
  })
  @IsOptional()
  @IsEnum(Occupation)
  occupation?: Occupation;

  @ApiPropertyOptional({ 
    description: 'Name of workplace/company', 
    example: 'Tech Solutions Pvt Ltd',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  workplace?: string;

  @ApiPropertyOptional({ 
    description: 'Work phone number', 
    example: '+94112345678',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @Length(10, 20)
  @Transform(({ value }) => value ? value.replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '').trim() : value)
  workPhone?: string;

  @ApiPropertyOptional({ 
    description: 'Highest education level achieved', 
    example: 'Bachelor\'s Degree',
    maxLength: 50
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  educationLevel?: string;

  @ApiPropertyOptional({ 
    description: 'Whether the parent record is active', 
    default: true 
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
