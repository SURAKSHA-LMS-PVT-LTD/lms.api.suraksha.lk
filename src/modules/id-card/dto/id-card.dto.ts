import { IsBigIntId, IsOptionalBigIntId } from '../../../common/validators/bigint-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
export class GenerateIdCardDto {
  @ApiProperty({ description: 'User ID for which to generate the ID card' })
  @IsBigIntId()
  userId: string;
}

export class BulkGenerateIdCardDto {
  @ApiProperty({ description: 'Array of User IDs for bulk generation', type: [String] })
  @IsString({ each: true })
  userIds: string[];
}

export class IdCardResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Google Drive URL of the generated ID card', required: false })
  @IsOptional()
  url?: string;
}

export class BulkIdCardResponseDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Response message' })
  message: string;

  @ApiProperty({ description: 'Bulk generation results' })
  results: {
    success: string[];
    failed: string[];
  };

  @ApiProperty({ description: 'Summary of the bulk operation' })
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

export class IdCardStatusDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Whether user has an ID card' })
  hasIdCard: boolean;

  @ApiProperty({ description: 'ID card URL if available', required: false })
  @IsOptional()
  url?: string;
}

export class TemplateInfoDto {
  @ApiProperty({ description: 'Success status' })
  success: boolean;

  @ApiProperty({ description: 'Template information' })
  templateInfo: {
    pageCount: number;
    firstPageDimensions: { width: number; height: number };
    secondPageDimensions?: { width: number; height: number };
  };
}
