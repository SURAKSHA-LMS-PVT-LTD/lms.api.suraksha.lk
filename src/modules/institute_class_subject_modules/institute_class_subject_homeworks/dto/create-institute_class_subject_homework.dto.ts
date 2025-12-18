import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsNotEmpty, IsOptional, IsString, IsDateString, IsBoolean, IsUrl, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInstituteClassSubjectHomeworkDto {
  @ApiProperty({
    description: 'Institute ID',
    example: '1',
  })
  @IsNotEmpty()
  @IsBigIntId()
  instituteId: string;

  @ApiProperty({
    description: 'Class ID',
    example: '1',
  })
  @IsNotEmpty()
  @IsBigIntId()
  classId: string;

  @ApiProperty({
    description: 'Subject ID',
    example: '1',
  })
  @IsNotEmpty()
  @IsBigIntId()
  subjectId: string;

  @ApiProperty({
    description: 'Teacher ID',
    example: '1',
  })
  @IsNotEmpty()
  @IsBigIntId()
  teacherId: string;

  @ApiProperty({
    description: 'Homework title',
    example: 'Chapter 1 Exercise',
  })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiPropertyOptional({
    description: 'Homework description',
    example: 'Complete all problems in chapter 1',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Start date',
    example: '2024-01-15',
  })
  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({
    description: 'End date',
    example: '2024-01-20',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Reference link',
    example: 'https://example.com/homework-material',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  referenceLink?: string;

  @ApiPropertyOptional({
    description: 'Is active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
}
