import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const FIELD_TYPES = ['text', 'number', 'date', 'email', 'phone', 'boolean', 'select'] as const;

export class ExtraDataFieldDto {
  @ApiProperty({ maxLength: 50, description: 'Unique field key (snake_case)' })
  @IsString()
  @MaxLength(50)
  key: string;

  @ApiProperty({ maxLength: 100, description: 'Human-readable label' })
  @IsString()
  @MaxLength(100)
  label: string;

  @ApiProperty({ enum: FIELD_TYPES, description: 'Field data type' })
  @IsIn(FIELD_TYPES)
  type: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Dropdown options — required when type is "select". Max 100 options, each max 200 chars.',
    example: ['Option A', 'Option B', 'Option C'],
  })
  @ValidateIf(o => o.type === 'select')
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  @ArrayMaxSize(100)
  options?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Which user groups this field applies to (e.g. ["student", "teacher"])',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  @ArrayMaxSize(20)
  applicableTo?: string[];
}

export class UpdateUserExtraDataSchemaDto {
  @ApiProperty({ type: [ExtraDataFieldDto], description: 'Full replacement schema. Pass [] to clear.' })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(50)
  @Type(() => ExtraDataFieldDto)
  schema: ExtraDataFieldDto[];
}
