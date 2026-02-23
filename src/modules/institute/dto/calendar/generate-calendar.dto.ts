import { IsString, IsArray, IsDateString, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty,ApiPropertyOptional } from '@nestjs/swagger';

class PublicHolidayDto {
  @ApiProperty({ description: 'Date in YYYY-MM-DD format' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Holiday title, e.g.  "Vesak Poya Day"' })
  @IsString()
  title: string;
}

class TermBreakDto {
  @ApiProperty({ description: 'Start date in YYYY-MM-DD format' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date in YYYY-MM-DD format' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ description: 'Break title, e.g. "Term 1 Break"' })
  @IsString()
  title: string;
}

export class GenerateCalendarDto {
  @ApiProperty({ description: 'Academic year, e.g. 2025' })
  @IsString()
  academicYear: string;

  @ApiProperty({ description: 'First day of academic year in YYYY-MM-DD format' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Last day of academic year in YYYY-MM-DD format' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'List of public holidays', type: [PublicHolidayDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PublicHolidayDto)
  publicHolidays?: PublicHolidayDto[];

  @ApiPropertyOptional({ description: 'List of term breaks', type: [TermBreakDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TermBreakDto)
  termBreaks?: TermBreakDto[];
}
