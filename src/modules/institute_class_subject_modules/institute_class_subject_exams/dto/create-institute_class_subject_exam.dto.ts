import { IsBigIntId, IsOptionalBigIntId } from '../../../../common/validators/bigint-id.validator';
import { IsNotEmpty, IsOptional, IsString, IsEnum, IsDateString, IsNumber, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInstituteClassSubjectExamDto {
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
    description: 'Exam title',
    example: 'Physics Unit Test 1',
  })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiPropertyOptional({
    description: 'Exam description',
    example: 'Unit test covering chapters 1-3',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Exam type',
    enum: ['online', 'physical'],
    example: 'online',
  })
  @IsNotEmpty()
  @IsEnum(['online', 'physical'])
  examType: 'online' | 'physical';

  @ApiProperty({
    description: 'Exam duration in minutes',
    example: 120,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(600)
  duration: number;

  @ApiProperty({
    description: 'Maximum marks for the exam',
    example: 100,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  maxMarks: number;

  @ApiProperty({
    description: 'Passing marks for the exam',
    example: 40,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  passingMarks: number;

  @ApiProperty({
    description: 'Exam date',
    example: '2024-01-15',
  })
  @IsNotEmpty()
  @IsDateString()
  examDate: string;

  @ApiProperty({
    description: 'Exam start time',
    example: '00:00:00',
  })
  @IsNotEmpty()
  @IsString()
  startTime: string;

  @ApiProperty({
    description: 'Exam end time',
    example: '00:00:00',
  })
  @IsNotEmpty()
  @IsString()
  endTime: string;

  @ApiPropertyOptional({
    description: 'Exam venue (for physical exams)',
    example: 'Room 101',
  })
  @IsOptional()
  @IsString()
  venue?: string;

  @ApiPropertyOptional({
    description: 'Exam link (for online exams)',
    example: 'https://exam.example.com/physics-test',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  examLink?: string;

  @ApiPropertyOptional({
    description: 'Exam instructions',
    example: 'Please bring calculator and pen',
  })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiProperty({
    description: 'Exam status',
    enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'],
    example: 'scheduled',
  })
  @IsOptional()
  @IsEnum(['draft', 'scheduled', 'active', 'completed', 'cancelled'])
  status?: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';

  @ApiPropertyOptional({
    description: 'Created by user ID (will be set automatically if not provided)',
    example: '1',
  })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiProperty({
    description: 'Target audience',
    enum: ['everyone', 'selected_students'],
    example: 'everyone',
  })
  @IsOptional()
  @IsEnum(['everyone', 'selected_students'])
  toWhom?: 'everyone' | 'selected_students';

  @ApiPropertyOptional({
    description: 'Is exam active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;
}
