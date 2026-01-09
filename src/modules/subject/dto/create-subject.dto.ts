import { IsString, IsOptional, IsBoolean, IsInt, Length, Min, Max, IsEnum, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { SubjectType } from '../entities/subject.entity';

export class CreateSubjectDto {
  @ApiProperty({ description: 'Subject code (unique)', example: 'MATH101' })
  @IsString()
  @Length(1, 50)
  code: string;

  @ApiProperty({ description: 'Subject name', example: 'Mathematics' })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiPropertyOptional({ description: 'Subject description', example: 'Basic mathematics course' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Subject category', example: 'Science' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  category?: string;

  @ApiPropertyOptional({ description: 'Credit hours for the subject', example: 3 })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return undefined;
    const num = parseInt(value, 10);
    return isNaN(num) ? value : num;
  })
  @IsInt()
  @Min(1)
  @Max(1000)
  creditHours?: number;

  @ApiPropertyOptional({ description: 'Whether the subject is active', example: true, default: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Subject type', enum: SubjectType, example: SubjectType.MAIN })
  @IsOptional()
  @IsEnum(SubjectType)
  subjectType?: SubjectType;

  @ApiPropertyOptional({ description: 'Basket category for grading', example: 'G003' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  basketCategory?: string;

  @ApiProperty({ 
    description: 'Institute ID this subject belongs to',
    example: '1'
  })
  @IsString()
  instituteId: string;

  @ApiPropertyOptional({ 
    description: 'Subject image relative path from /upload/verify-and-publish endpoint', 
    example: 'subject-images/subject-uuid.jpg' 
  })
  @IsOptional()
  @IsString()
  imgUrl?: string;

}
