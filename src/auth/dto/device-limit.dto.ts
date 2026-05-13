import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsArray, IsString, ArrayMaxSize, ArrayMinSize } from 'class-validator';

export class SetDeviceLimitDto {
  /** null = unlimited. 1–20 = explicit cap. */
  @ApiPropertyOptional({ description: 'Max concurrent sessions per user. null = unlimited.', example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxDevices?: number | null;
}

export class BulkSetDeviceLimitDto {
  @ApiPropertyOptional({ description: 'User IDs to update (max 200)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  userIds: string[];

  @ApiPropertyOptional({ description: 'Max concurrent sessions. null = unlimited.', example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxDevices?: number | null;
}
