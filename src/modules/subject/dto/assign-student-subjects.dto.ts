import { IsString, IsEnum, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubjectType } from '../entities/subject.entity';

export class AssignStudentSubjectsDto {
  @ApiProperty({ 
    description: 'Student ID',
    example: '1'
  })
  @IsString()
  studentId: string;

  @ApiProperty({ 
    description: 'Institute ID',
    example: '1'
  })
  @IsString()
  instituteId: string;

  @ApiProperty({ 
    description: 'Class ID',
    example: '1'
  })
  @IsString()
  classId: string;

  @ApiProperty({ 
    description: 'Array of subject IDs to assign',
    example: ['1', '2', '3']
  })
  @IsArray()
  @IsString({ each: true })
  subjectIds: string[];

  @ApiPropertyOptional({ 
    description: 'Subject type filter',
    enum: SubjectType
  })
  @IsOptional()
  @IsEnum(SubjectType)
  subjectType?: SubjectType;
}

export class AssignBasketSubjectDto {
  @ApiProperty({ 
    description: 'Student ID',
    example: '1'
  })
  @IsString()
  studentId: string;

  @ApiProperty({ 
    description: 'Institute ID',
    example: '1'
  })
  @IsString()
  instituteId: string;

  @ApiProperty({ 
    description: 'Class ID',
    example: '1'
  })
  @IsString()
  classId: string;

  @ApiProperty({ 
    description: 'Selected basket subject ID',
    example: '2'
  })
  @IsString()
  selectedSubjectId: string;
}
