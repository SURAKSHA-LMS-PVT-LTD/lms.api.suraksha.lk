import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

export class InstituteClassSubjectExamResponseDto {
  @ApiProperty({
    description: 'Exam ID',
    example: '1',
  })
  @Expose()
  id: string;

  @ApiProperty({
    description: 'Institute ID',
    example: '1',
  })
  @Expose()
  instituteId: string;

  @ApiProperty({
    description: 'Class ID',
    example: '1',
  })
  @Expose()
  classId: string;

  @ApiProperty({
    description: 'Subject ID',
    example: '1',
  })
  @Expose()
  subjectId: string;

  @ApiProperty({
    description: 'Exam title',
    example: 'Physics Unit Test 1',
  })
  @Expose()
  title: string;

  @ApiPropertyOptional({
    description: 'Exam description',
    example: 'Unit test covering chapters 1-3',
  })
  @Expose()
  description?: string;

  @ApiProperty({
    description: 'Exam type',
    enum: ['online', 'physical'],
    example: 'online',
  })
  @Expose()
  examType: 'online' | 'physical';

  @ApiProperty({
    description: 'Exam duration in minutes',
    example: 90,
  })
  @Expose()
  durationMinutes: number;

  @ApiProperty({
    description: 'Total marks',
    example: 100,
  })
  @Expose()
  totalMarks: number;

  @ApiProperty({
    description: 'Passing marks',
    example: 40,
  })
  @Expose()
  passingMarks: number;

  @ApiProperty({
    description: 'Schedule date',
    example: '2024-01-15',
  })
  @Type(() => Date)
  @Expose()
  scheduleDate: Date;

  @ApiProperty({
    description: 'Start time',
    example: '00:00:00',
  })
  @Type(() => Date)
  @Expose()
  startTime: Date;

  @ApiProperty({
    description: 'End time',
    example: '00:00:00',
  })
  @Type(() => Date)
  @Expose()
  endTime: Date;

  @ApiPropertyOptional({
    description: 'Exam venue',
    example: 'Room 101',
  })
  @Expose()
  venue?: string;

  @ApiPropertyOptional({
    description: 'Exam link',
    example: 'https://exam.example.com/physics-test',
  })
  @Expose()
  examLink?: string;

  @ApiPropertyOptional({
    description: 'Exam instructions',
    example: 'Please bring calculator and pen',
  })
  @Expose()
  instructions?: string;

  @ApiProperty({
    description: 'Exam status',
    enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'],
    example: 'scheduled',
  })
  @Expose()
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';

  @ApiProperty({
    description: 'Created by user ID',
    example: '1',
  })
  @Expose()
  createdBy: string;

  @ApiProperty({
    description: 'Target audience',
    enum: ['everyone', 'selected_students'],
    example: 'everyone',
  })
  @Expose()
  toWhom: 'everyone' | 'selected_students';

  @ApiProperty({
    description: 'Is active',
    example: true,
  })
  @Expose()
  isActive: boolean;

  @ApiProperty({
    description: 'Created at',
    example: '2024-01-15T08:00:00Z',
  })
  @Type(() => Date)
  @Expose()
  createdAt: Date;

  @ApiProperty({
    description: 'Updated at',
    example: '2024-01-15T08:00:00Z',
  })
  @Type(() => Date)
  @Expose()
  updatedAt: Date;

  // Related entities (optional, can be included based on query)
  @ApiPropertyOptional({
    description: 'Institute details',
  })
  @Expose()
  institute?: any;

  @ApiPropertyOptional({
    description: 'Class details',
  })
  @Expose()
  class?: any;

  @ApiPropertyOptional({
    description: 'Subject details',
  })
  @Expose()
  subject?: any;

  @ApiPropertyOptional({
    description: 'Creator details',
  })
  @Expose()
  creator?: any;

  constructor(partial: Partial<InstituteClassSubjectExamResponseDto>) {
    Object.assign(this, partial);
  }
}
