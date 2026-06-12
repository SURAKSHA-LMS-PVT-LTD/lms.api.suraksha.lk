import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, IsInt, IsObject } from 'class-validator';
import { ErrorReportKind } from '../entities/error-report.entity';

export class CreateErrorReportDto {
  @IsEnum(ErrorReportKind)
  kind: ErrorReportKind;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  errorMessage: string;

  @IsOptional()
  @IsString()
  errorStack?: string;

  @IsOptional()
  @IsString()
  componentStack?: string;

  @IsOptional()
  @IsInt()
  httpStatus?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  apiPath?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  pageUrl: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  userAgent: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  platform?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;

  /** base64 JPEG data-url — optional, omit for silent API-error reports */
  @IsOptional()
  @IsString()
  screenshotDataUrl?: string;
}
