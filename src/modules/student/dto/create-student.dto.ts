// src/students/dto/create-student.dto.ts
import { IsBigIntId, IsOptionalBigIntId } from '../../../common/validators/bigint-id.validator';
import { IsString, IsOptional, IsDateString, IsBoolean, ValidateNested, IsIn, IsEmail, IsNotEmpty, IsEnum, Length } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '../../user/enums/gender.enum';
import { UserType } from '../../user/enums/user-type.enum';
import { IsDateOfBirth } from '../../../common/validators/date-format.validator';
import { IsOptionalNic } from '../../../common/validators/optional-nic.validator';

class CreateUserDto {
  @ApiProperty({ 
    description: 'First name of the student',
    example: 'John',
    minLength: 1,
    maxLength: 100
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  firstName: string;

  @ApiProperty({ 
    description: 'Last name of the student',
    example: 'Doe',
    minLength: 1,
    maxLength: 100
  })
  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  lastName: string;

  @ApiPropertyOptional({ 
    description: 'Email address (optional for institute-created students)',
    example: 'john.doe@student.com'
  })
  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
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
    description: 'User type (automatically set to STUDENT for students)', 
    enum: UserType,
    default: UserType.USER_WITHOUT_PARENT
  })
  @IsOptional()
  @IsEnum(UserType)
  userType?: UserType;

  @ApiPropertyOptional({ 
    description: 'Date of birth in yyyy-MM-dd format',
    example: '2005-01-15' 
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
    description: 'National Identity Card number (optional for students under 16)',
    example: '123456789V'
  })
  @IsOptional()
  @IsOptionalNic()
  nic?: string;

  @ApiPropertyOptional({ 
    description: 'Birth certificate number (required for students without NIC)',
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

export class CreateStudentDto {
  // Nested user object
  @ApiProperty({ 
    description: 'User information for the student', 
    type: CreateUserDto 
  })
  @ValidateNested()
  @Type(() => CreateUserDto)
  user: CreateUserDto;

  // Student-specific properties
  @ApiPropertyOptional({ 
    description: 'Father user ID (reference to parent record)',
    example: '1'
  })
  @IsOptionalBigIntId()
  fatherId?: string;

  @ApiPropertyOptional({ 
    description: 'Mother user ID (reference to parent record)',
    example: '2'
  })
  @IsOptionalBigIntId()
  motherId?: string;

  @ApiPropertyOptional({ 
    description: 'Guardian user ID (reference to parent record)',
    example: '3'
  })
  @IsOptionalBigIntId()
  guardianId?: string;

  @ApiPropertyOptional({ 
    description: 'Student ID number (school/institute specific)',
    example: 'STU001',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @Length(1, 20)
  studentId?: string;

  @ApiPropertyOptional({ 
    description: 'Emergency contact number',
    example: '+94771234567',
    maxLength: 20
  })
  @IsOptional()
  @IsString()
  @Length(10, 20)
  emergencyContact?: string;

  @ApiPropertyOptional({ 
    description: 'Any medical conditions or health issues',
    example: 'Asthma, requires inhaler'
  })
  @IsOptional()
  @IsString()
  medicalConditions?: string;

  @ApiPropertyOptional({ 
    description: 'Known allergies',
    example: 'Peanuts, shellfish'
  })
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiPropertyOptional({ 
    description: 'Blood group', 
    example: 'O+',
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  })
  @IsOptional()
  @IsString()
  @IsIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
  bloodGroup?: string;

  @ApiPropertyOptional({ 
    description: 'Whether the student record is active', 
    default: true 
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
