import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AttendanceStatus } from './attendance.dto';

export class UpdateAttendanceStatusDto {
  @ApiProperty({ enum: AttendanceStatus, description: 'New attendance status' })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional({ description: 'Subject ID (for subject-scoped attendance)', maxLength: 36 })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  subjectId?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  instituteName?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  className?: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  subjectName?: string;
}
