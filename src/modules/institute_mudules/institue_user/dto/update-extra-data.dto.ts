import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class UpdateExtraDataDto {
  @ApiPropertyOptional({ description: 'Arbitrary key-value extra data for the user. Pass null to clear.', nullable: true })
  @IsOptional()
  @IsObject()
  extraData?: Record<string, any> | null;
}
