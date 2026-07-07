import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Body for creating (generating) a class attendance session via API key.
 * The institute is taken from the API key; the class is in the URL path.
 */
export class CreateExternalSessionDto {
  @ApiProperty({ description: 'Session name', example: 'Morning Session 2026-06-15' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Session date (YYYY-MM-DD). Defaults to today (Sri Lanka) if omitted.',
    example: '2026-06-15',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @ApiProperty({ description: 'Session start time (HH:MM, 24h)', example: '08:00' })
  @Matches(/^([01]?\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:MM' })
  startTime: string;

  @ApiPropertyOptional({ description: 'Session end time (HH:MM, 24h)', example: '10:00' })
  @IsOptional()
  @Matches(/^([01]?\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:MM' })
  endTime?: string;
}

// ── Response types ─────────────────────────────────────────────────────────

export interface ExternalClassSummary {
  id: string;
  name: string;
  code: string;
  classType: string;
  grade?: number;
  academicYear?: string;
  isActive: boolean;
}

export interface ExternalSessionSummary {
  id: string;
  name: string;
  classId: string;
  date: string;
  startTime: string;
  endTime?: string;
  isClosed: boolean;
  totalStudents: number;
}
