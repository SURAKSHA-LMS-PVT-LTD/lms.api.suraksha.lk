import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateSubjectWithImageDto {
  @ApiProperty({ description: 'Subject code (unique)', example: 'MATH101' })
  @IsString()
  @Length(1, 50)
  code: string;

  @ApiProperty({ description: 'Subject name', example: 'Advanced Mathematics' })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiPropertyOptional({ description: 'Subject description', example: 'Advanced mathematics course covering calculus and algebra' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Subject category', example: 'Science' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  category?: string;

  @ApiPropertyOptional({ description: 'Credit hours for the subject (1-1000)', example: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @Transform(({ value }) => parseInt(value))
  creditHours?: number;

  @ApiPropertyOptional({ description: 'Whether the subject is active', example: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  isActive?: boolean;

  @ApiPropertyOptional({ 
    type: 'string',
    format: 'binary',
    description: 'Subject image file (max 2MB, JPEG/PNG/WebP/GIF)'
  })
  image?: any;
}
