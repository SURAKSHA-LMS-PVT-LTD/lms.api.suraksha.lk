import { IsBigIntId } from '../../../common/validators/bigint-id.validator';
import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryAllSubjectsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @IsBigIntId()
  instituteId: string;

  @IsOptional()
  @IsString()
  @IsIn(['name', 'code', 'category', 'createdAt', 'updatedAt'], { message: 'sortBy must be one of: name, code, category, createdAt, updatedAt' })
  sortBy?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
}
