import { IsArray, IsString, ValidateNested, IsNumber, IsBoolean, IsOptional, Min, Max, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Individual operating config item for bulk operations.
 * academicYear is provided at the wrapper level.
 */
export class BulkOperatingConfigItemDto {
  @ApiProperty({ description: 'Day of week (1=Monday, 7=Sunday)', minimum: 1, maximum: 7 })
  @IsNumber()
  @Min(1)
  @Max(7)
  dayOfWeek: number;

  @ApiProperty({ description: 'Is the institute operating on this day?' })
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
}

/**
 * Wrapper DTO for bulk operating config requests.
 * 
 * Expected body format:
 * {
 *   "academicYear": "2026",
 *   "configs": [
 *     { "dayOfWeek": 1, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
 *     { "dayOfWeek": 2, "isOperating": true, "startTime": "08:00", "endTime": "15:00" },
 *     ...
 *   ]
 * }
 */
export class BulkOperatingConfigDto {
  @ApiProperty({ description: 'Academic year, e.g. 2026 or 2025/2026' })
  @IsString()
  academicYear: string;

  @ApiProperty({
    description: 'Array of operating config entries (1 per day, max 7)',
    type: [BulkOperatingConfigItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => BulkOperatingConfigItemDto)
  configs: BulkOperatingConfigItemDto[];
}
