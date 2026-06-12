import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ErrorReportKind, ErrorReportStatus } from '../entities/error-report.entity';

export class QueryErrorReportsDto {
  @IsOptional()
  @IsEnum(ErrorReportStatus)
  status?: ErrorReportStatus;

  @IsOptional()
  @IsEnum(ErrorReportKind)
  kind?: ErrorReportKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
