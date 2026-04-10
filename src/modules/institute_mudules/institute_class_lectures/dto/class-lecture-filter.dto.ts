import { IsOptional, IsString, IsEnum, IsNumber, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateClassLectureStatusDto {
  @ApiPropertyOptional({ description: 'Lecture status', enum: ['scheduled', 'ongoing', 'completed', 'cancelled'] })
  @IsEnum(['scheduled', 'ongoing', 'completed', 'cancelled'], { message: 'Status must be one of: scheduled, ongoing, completed, cancelled' })
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
}

export class RescheduleClassLectureDto {
  @ApiPropertyOptional({ description: 'New start time (ISO 8601)' })
  @IsString()
  startTime: string;

  @ApiPropertyOptional({ description: 'New end time (ISO 8601)' })
  @IsString()
  endTime: string;
}

export class ClassLectureFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instituteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lectureType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
