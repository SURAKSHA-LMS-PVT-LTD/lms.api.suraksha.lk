import { IsNumber, IsBoolean, IsString, IsOptional, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOperatingConfigDto {
  @ApiPropertyOptional({ description: 'Day of week (1=Monday, 7=Sunday)', minimum: 1, maximum: 7 })
  @IsNumber()
  @Min(1)
  @Max(7)
  dayOfWeek: number;

  @ApiPropertyOptional({ description: 'Is the institute operating on this day?' })
  @IsBoolean()
  isOperating: boolean;

  @ApiPropertyOptional({ description: 'Start time in HH:MM format, e.g. 08:00' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ description: 'End time in HH:MM format, e.g. 15:00' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Academic year, e.g. 2025 or 2025/2026' })
  @IsString()
  academicYear: string;
}
