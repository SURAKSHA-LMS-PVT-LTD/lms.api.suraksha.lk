
import { IsBigIntId, IsOptionalBigIntId } from '../../../common/validators/bigint-id.validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEmail, IsEnum, IsBoolean, MaxLength, IsIn, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UserType } from '../../user/enums/user-type.enum';
import { Gender } from '../../user/enums/gender.enum';
import { IsDateOfBirth } from '../../../common/validators/date-format.validator';

class UpdateUserDto {
  @ApiPropertyOptional({ description: 'First name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  firstName?: string;

  @ApiPropertyOptional({ description: 'Last name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ description: 'Password' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'User type', enum: UserType })
  @IsOptional()
  @IsEnum(UserType)
  userType?: UserType;

  @ApiPropertyOptional({ description: 'Date of birth in yyyy-MM-dd format' })
  @IsOptional()
  @IsDateOfBirth({ message: 'Date of birth must be in yyyy-MM-dd format (e.g., 1990-05-15)' })
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender', enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ description: 'National Identity Card number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nic?: string;

  @ApiPropertyOptional({ description: 'Birth certificate number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  birthCertificateNo?: string;

  @ApiPropertyOptional({ description: 'Address line 1' })
  @IsOptional()
  @IsString()
  addressLine1?: string;

  @ApiPropertyOptional({ description: 'Address line 2' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'District' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @ApiPropertyOptional({ description: 'Province' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional({ description: 'Postal code' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Country' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: 'Profile image file (JPG, JPEG, PNG, max 5MB). Use multipart/form-data.'
  })
  // Note: imageUrl is no longer accepted as string input for security.
  // Images must be uploaded as files using dedicated upload endpoint.

  @ApiPropertyOptional({ description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateStudentDto {
  @ApiPropertyOptional({ description: 'User information to update' })
  @IsOptional()
  @Type(() => UpdateUserDto)
  user?: UpdateUserDto;

  @ApiPropertyOptional({ description: 'Father user ID' })
  @IsOptionalBigIntId()
  fatherId?: string;

  @ApiPropertyOptional({ description: 'Mother user ID' })
  @IsOptionalBigIntId()
  motherId?: string;

  @ApiPropertyOptional({ description: 'Guardian user ID' })
  @IsOptionalBigIntId()
  guardianId?: string;

  @ApiPropertyOptional({ description: 'Student ID number' })
  @IsOptionalBigIntId()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Emergency contact number' })
  @IsOptional()
  @IsString()
  emergencyContact?: string;

  @ApiPropertyOptional({ description: 'Medical conditions' })
  @IsOptional()
  @IsString()
  medicalConditions?: string;

  @ApiPropertyOptional({ description: 'Allergies' })
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiPropertyOptional({ description: 'Blood group', example: 'O+' })
  @IsOptional()
  @IsString()
  @IsIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
  bloodGroup?: string;

  @ApiPropertyOptional({ description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
