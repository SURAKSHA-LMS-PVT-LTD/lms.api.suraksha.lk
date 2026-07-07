import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, Length, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BloodGroup } from '../../student/enums/blood-group.enum';
import { Occupation } from '../enums/occupation.enum';

/**
 * Student data to provide when upgrading USER_WITHOUT_STUDENT → USER
 */
export class UpgradeStudentDataDto {
  @ApiPropertyOptional({ description: 'Emergency contact number' })
  @IsOptional()
  @IsString()
  @Length(1, 15)
  emergencyContact?: string;

  @ApiPropertyOptional({ description: 'Medical conditions' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  medicalConditions?: string;

  @ApiPropertyOptional({ description: 'Allergies' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  allergies?: string;

  @ApiPropertyOptional({ description: 'Blood group', enum: BloodGroup })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value || typeof value !== 'string' || value.trim() === '') return null;
    const str = value.trim().toUpperCase();
    // Normalize legacy underscore format (A_POSITIVE) to the real enum value (A+)
    // so a stale client build can't crash/400 on this endpoint either.
    const normalized = str
      .replace('A_POSITIVE', 'A+')
      .replace('A_NEGATIVE', 'A-')
      .replace('B_POSITIVE', 'B+')
      .replace('B_NEGATIVE', 'B-')
      .replace('O_POSITIVE', 'O+')
      .replace('O_NEGATIVE', 'O-')
      .replace('AB_POSITIVE', 'AB+')
      .replace('AB_NEGATIVE', 'AB-');
    return (Object.values(BloodGroup) as string[]).includes(normalized) ? normalized : null;
  })
  @IsEnum(BloodGroup)
  bloodGroup?: BloodGroup;
}

/**
 * Parent data to provide when upgrading USER_WITHOUT_PARENT → USER
 */
export class UpgradeParentDataDto {
  @ApiPropertyOptional({ description: 'Occupation', enum: Occupation })
  @IsOptional()
  @IsEnum(Occupation)
  occupation?: Occupation;

  @ApiPropertyOptional({ description: 'Workplace name' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  workplace?: string;

  @ApiPropertyOptional({ description: 'Work phone number' })
  @IsOptional()
  @IsString()
  @Length(10, 15)
  workPhone?: string;

  @ApiPropertyOptional({ description: 'Education level' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  educationLevel?: string;
}

/**
 * DTO for upgrading user type.
 * 
 * Allowed transitions:
 * - USER_WITHOUT_PARENT → USER (provide parentData)
 * - USER_WITHOUT_STUDENT → USER (provide studentData)
 */
export class UpgradeUserTypeDto {
  @ApiPropertyOptional({ description: 'Student data (required when upgrading from USER_WITHOUT_STUDENT to USER)', type: UpgradeStudentDataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpgradeStudentDataDto)
  studentData?: UpgradeStudentDataDto;

  @ApiPropertyOptional({ description: 'Parent data (required when upgrading from USER_WITHOUT_PARENT to USER)', type: UpgradeParentDataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpgradeParentDataDto)
  parentData?: UpgradeParentDataDto;
}
