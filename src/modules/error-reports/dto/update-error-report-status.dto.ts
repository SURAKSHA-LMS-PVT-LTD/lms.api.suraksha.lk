import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ErrorReportStatus } from '../entities/error-report.entity';

export class UpdateErrorReportStatusDto {
  @IsEnum(ErrorReportStatus)
  status: ErrorReportStatus;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
