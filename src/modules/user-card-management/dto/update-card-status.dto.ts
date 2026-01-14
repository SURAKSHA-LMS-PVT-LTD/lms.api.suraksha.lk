import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CardStatus } from '../enums/card-status.enum';

export class UpdateCardStatusDto {
  @ApiProperty({ description: 'New card status', enum: CardStatus })
  @IsEnum(CardStatus)
  status: CardStatus;

  @ApiPropertyOptional({ description: 'Reason for status change' })
  @IsOptional()
  @IsString()
  notes?: string;
}
